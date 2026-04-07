import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { safeParseJSON } from "@/lib/ai-json-parser";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida"),
});

const InvoiceSchema = z.object({
  proveedor: z.object({
    nombre: z.string().default("Desconocido"),
    ruc: z.string().optional(),
  }).default({ nombre: "Desconocido" }),
  fecha: z.string().optional(),
  items: z.array(z.object({
    nombre: z.string(),
    cantidad: z.number().min(0),
    precioUnitario: z.number().min(0),
  })).default([]),
  total: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const { image } = parsed.data;

    // Try OpenAI first (most projects have OPENAI_API_KEY), fallback to Anthropic
    const apiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey) {
      // Use OpenAI GPT-4o-mini Vision
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "Eres un extractor de datos de boletas y facturas peruanas. Extrae los datos y responde SOLO en JSON válido sin markdown. Si no puedes leer algo, usa valores por defecto razonables.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: 'Extrae de esta boleta/factura peruana: proveedor (nombre, ruc), fecha, items (nombre, cantidad, precioUnitario), total. Responde SOLO JSON: {"proveedor":{"nombre":"...","ruc":"..."},"fecha":"...","items":[{"nombre":"...","cantidad":1,"precioUnitario":0}],"total":0}',
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image.startsWith("data:")
                      ? image
                      : `data:image/jpeg;base64,${image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1500,
          // OCR/extracción — determinístico, variación = errores de parsing.
          // Excel Agentes IA práctica #7.
          temperature: AI_TEMPERATURES.extraction,
        }),
      });

      if (!res.ok) {
        await res.text();
        return NextResponse.json(
          { error: `API error: ${res.status}` },
          { status: 502 },
        );
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      // ADR 009: parse defensivo con schema Zod unificado.
      const parsed = safeParseJSON(content, InvoiceSchema);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: "No se pudo interpretar la factura", raw: content, parseError: parsed.error },
          { status: 422 },
        );
      }
      return NextResponse.json(parsed.data);
    } else if (anthropicKey) {
      // Use Anthropic Claude Vision
      const imageData = image.startsWith("data:")
        ? image.split(",")[1]
        : image;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: imageData,
                  },
                },
                {
                  type: "text",
                  text: 'Extrae de esta boleta/factura peruana: proveedor (nombre, ruc), fecha, items (nombre, cantidad, precioUnitario), total. Responde SOLO JSON válido sin markdown: {"proveedor":{"nombre":"...","ruc":"..."},"fecha":"...","items":[{"nombre":"...","cantidad":1,"precioUnitario":0}],"total":0}',
                },
              ],
            },
          ],
        }),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `API error: ${res.status}` },
          { status: 502 },
        );
      }

      const data = await res.json();
      const content = data.content?.[0]?.text ?? "";
      // ADR 009: mismo pattern que la ruta de OpenAI.
      const parsed = safeParseJSON(content, InvoiceSchema);
      if (!parsed.ok) {
        return NextResponse.json(
          { error: "No se pudo interpretar la factura", raw: content, parseError: parsed.error },
          { status: 422 },
        );
      }
      return NextResponse.json(parsed.data);
    } else {
      return NextResponse.json(
        {
          error:
            "No se encontró API key para OCR (OPENAI_API_KEY o ANTHROPIC_API_KEY)",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: `Error procesando factura: ${message}` },
      { status: 500 },
    );
  }
}
