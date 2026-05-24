import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { chatModel } from "@/lib/ai/provider";
import { applyRateLimit } from "@/lib/rate-limit";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

/**
 * POST /api/superadmin/banners/copy-suggest
 *
 * Genera 3 variantes de título + 3 de subtítulo + 3 de badge para un banner
 * promocional, dado el producto, precio y tono.
 *
 * Reusa `chatModel` (Haiku 4.5) — rápido y barato.
 */

const Input = z.object({
  productName: z.string().min(1).max(200),
  price: z.number().nullable().optional(),
  oldPrice: z.number().nullable().optional(),
  category: z.string().max(80).optional().nullable(),
  tone: z.enum(["urgent", "friendly", "premium", "playful"]).default("friendly"),
});

type CopySuggestion = {
  productNames: string[];
  badges: string[];
  ctas: string[];
};

const TONE_HINTS: Record<z.infer<typeof Input>["tone"], string> = {
  urgent: "tono urgente, escasez, limitado, '¡Solo hoy!', '¡Últimas unidades!'",
  friendly: "tono cercano y cálido, estilo bodega de barrio peruana",
  premium: "tono elegante, calidad superior, exclusivo",
  playful: "tono divertido, juvenil, con humor sano",
};

export async function POST(req: NextRequest) {
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  // Audit P1 (2026-05-19): defense-in-depth — verifica sesión EN el handler.
  // Sin esto, si el guard del proxy se rompe en una regresión, cualquier
  // visitante drena nuestra cuota de Anthropic/Groq.
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getPlatformSession(token) : null;
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const _rl = await applyRateLimit(req, "STRICT", "superadmin-banners-copy-suggest"); if (_rl) return _rl;
  try {
    const body = await req.json();
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { productName, price, oldPrice, category, tone } = parsed.data;
    const discount =
      oldPrice && price && oldPrice > price
        ? Math.round(((oldPrice - price) / oldPrice) * 100)
        : null;

    const prompt = `Generá copy para un banner promocional de bodega/minimarket en Perú.
Producto: ${productName}${category ? ` (categoría: ${category})` : ""}
${price !== null && price !== undefined ? `Precio: S/ ${price.toFixed(2)}` : ""}
${discount ? `Descuento: ${discount}% off` : ""}
Tono: ${TONE_HINTS[tone]}

Devolvé EXCLUSIVAMENTE un JSON válido con esta forma:
{"productNames":["p1","p2","p3"],"badges":["b1","b2","b3"],"ctas":["c1","c2","c3"]}

Reglas:
- "productNames": variantes persuasivas del nombre que se muestra en el banner. Máx 40 caracteres, español PE, atractivos pero veraces.
- "badges": tag corto de impacto, máx 12 caracteres. Ejemplos: "-30%", "2x1", "OFERTA", "NUEVO", "AGOTANDO".
- "ctas": texto del botón de compra, máx 18 caracteres. Ejemplos: "Comprar ya", "Aprovechar", "Llevarlo", "Lo quiero".
- Usar emojis solo si el tono lo amerita (max 1 por línea).
- No inventes precios. Mantené español PE natural.

Solo el JSON, sin texto adicional, sin markdown fences.`;

    const result = await generateText({
      model: chatModel,
      prompt,
      maxOutputTokens: 600,
      temperature: 0.85,
    });

    // Sanear: a veces el modelo igual devuelve fences
    const raw = result.text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
    let parsedJson: CopySuggestion | null = null;
    try {
      parsedJson = JSON.parse(raw) as CopySuggestion;
    } catch {
      return NextResponse.json(
        { error: "El modelo no devolvió JSON válido", raw },
        { status: 502 },
      );
    }

    const data: CopySuggestion = {
      productNames: (parsedJson.productNames ?? []).slice(0, 3).map((s) => String(s).slice(0, 40)),
      badges: (parsedJson.badges ?? []).slice(0, 3).map((s) => String(s).slice(0, 12)),
      ctas: (parsedJson.ctas ?? []).slice(0, 3).map((s) => String(s).slice(0, 18)),
    };

    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "Falló la generación", detail: msg }, { status: 500 });
  }
}
