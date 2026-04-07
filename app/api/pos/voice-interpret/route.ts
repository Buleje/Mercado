export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { callLLM } from "@/lib/llm-router";

// ── Fuzzy match local fallback ───────────────────────────────────────────
function fuzzyMatchProducts(
  transcript: string,
  availableProducts: string[]
): { items: { productName: string; quantity: number; matchedProductId?: number; confidence: number }[]; needsClarification: null } {
  const words = transcript.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const items: { productName: string; quantity: number; confidence: number }[] = [];

  // Number words mapping
  const numberWords: Record<string, number> = {
    un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
    medio: 1, media: 1,
  };

  let i = 0;
  while (i < words.length) {
    const word = words[i];
    // Skip noise words
    if (["y", "con", "de", "el", "la", "los", "las", "dame", "quiero", "ponme", "agregar", "agrega", "listo", "confirmar"].includes(word)) {
      i++;
      continue;
    }

    // Check if it's a number
    let qty = 1;
    const parsedNum = parseInt(word);
    if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 100) {
      qty = parsedNum;
      i++;
    } else if (numberWords[word] !== undefined) {
      qty = numberWords[word];
      i++;
    }

    // Try to match product from remaining words
    if (i < words.length) {
      const searchTerm = words[i];
      const matches = availableProducts.filter(
        p => p.toLowerCase().includes(searchTerm) || searchTerm.includes(p.toLowerCase().split(" ")[0])
      );

      if (matches.length === 1) {
        items.push({ productName: matches[0], quantity: qty, confidence: 0.7 });
      } else if (matches.length > 1) {
        // Try with more words for better match
        const searchTerm2 = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : words[i];
        const betterMatches = availableProducts.filter(
          p => p.toLowerCase().includes(searchTerm2)
        );
        if (betterMatches.length === 1) {
          items.push({ productName: betterMatches[0], quantity: qty, confidence: 0.6 });
          i++; // consumed extra word
        } else {
          items.push({ productName: matches[0], quantity: qty, confidence: 0.4 });
        }
      }
    }
    i++;
  }

  return { items, needsClarification: null };
}

// ── POST handler ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let body: { transcript?: string; availableProducts?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }

  const { transcript, availableProducts = [] } = body;

  if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
    return NextResponse.json({ error: "transcript es requerido" }, { status: 400 });
  }

  // ── Try LLM interpretation via router ────────────────────────────────
  // El router hace el chequeo de provider disponible y fallback automático.
  try {
    const productList = availableProducts.slice(0, 200).join(", ");

    const systemPrompt = `Eres un asistente de punto de venta de una bodega en Pucallpa, Perú.
El cajero dicta productos por voz. Interpreta lo que dice y encuentra los productos correctos.

Productos disponibles: [${productList}]

REGLAS:
- Interpreta cantidades (ej: "2 leches" = leche x2, "medio kilo de arroz" = arroz x1)
- Si el cajero dice un nombre parcial, busca el producto más similar de la lista
- Si hay ambiguedad entre 2+ productos, pide aclaración
- Los números pueden venir como palabras: "tres", "dos", etc.

Responde SOLO en JSON válido, sin markdown, sin explicación:
{
  "items": [
    { "productName": "nombre_exacto_del_producto_de_la_lista", "quantity": 1, "confidence": 0.9 }
  ],
  "needsClarification": null
}

Si necesitas aclaración:
{
  "items": [],
  "needsClarification": { "question": "¿Cuál producto desea?", "options": ["Opcion A", "Opcion B"] }
}`;

    // ADR-010: router LLM cheap tier (llama-3.1-8b-instant) — voice intent
    // parsing es una tarea simple de alto volumen. Si el cheap falla, fallback
    // automático a balanced.
    const res = await callLLM("cheap", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `El cajero dijo: "${transcript}"` },
      ],
      temperature: AI_TEMPERATURES.extraction,
      maxTokens: 500,
      label: "voice-interpret",
    });

    if (!res.ok) {
      console.error("[voice-interpret] router error:", res.error);
      const result = fuzzyMatchProducts(transcript, availableProducts);
      return NextResponse.json({ ...result, mode: "fallback" });
    }

    const content = res.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      const result = fuzzyMatchProducts(transcript, availableProducts);
      return NextResponse.json({ ...result, mode: "fallback" });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      items: parsed.items || [],
      needsClarification: parsed.needsClarification || null,
      mode: "ai",
    });
  } catch (err) {
    console.error("[voice-interpret] Error:", err);
    const result = fuzzyMatchProducts(transcript, availableProducts);
    return NextResponse.json({ ...result, mode: "fallback" });
  }
}
