import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { generateText } from "ai";
import { chatModel, getActiveProvider } from "@/lib/ai/provider";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { trackAiUsage } from "@/lib/ai/track-usage";

/**
 * POST /api/admin/store-customizer/ai-theme
 *
 * "Diseñá tu tienda con IA" (Modo Creativo > Plantillas). El dueño describe su
 * negocio en lenguaje natural ("vendo pollo a la brasa, ambiente familiar") y la
 * IA devuelve un look cohesivo: 3 colores armónicos + tipografía + estilo de botón
 * + radio + modo claro/oscuro + copy del hero (título/subtítulo/slogan).
 *
 * Devuelve SOLO JSON estructurado (Zod safeParse). Si el modelo desvaría o no hay
 * proveedor de IA configurado, responde error claro y el editor lo muestra — nunca
 * aplica un theme inválido. Auth: requireAdmin (dueño). Rate limit STRICT + cap de
 * costo por plan (aiCostGuard) para frenar abuso. NO requiere suscripción activa
 * a propósito: las tiendas en trial deben poder probar la feature.
 */

const Input = z.object({
  description: z.string().min(4).max(500),
  storeName: z.string().max(120).optional().nullable(),
  rubro: z.string().max(60).optional().nullable(),
});

const HEX = /^#[0-9A-Fa-f]{6}$/;

const FONTS = [
  "sistema", "geist", "inter", "poppins", "montserrat",
  "raleway", "nunito", "lato", "roboto", "opensans",
] as const;

// Salida esperada del modelo. Estricta: colores hex, fuente del set permitido.
const AiTheme = z.object({
  primaryColor: z.string().regex(HEX),
  secondaryColor: z.string().regex(HEX),
  accentColor: z.string().regex(HEX),
  fontFamily: z.enum(FONTS),
  darkModeDefault: z.boolean(),
  borderRadius: z.number().int().min(0).max(24),
  buttonStyle: z.enum(["rounded", "square", "pill"]),
  heroTitle: z.string().min(3).max(80),
  heroSubtitle: z.string().min(3).max(140),
  slogan: z.string().min(3).max(60),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "ai:store-theme");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  if (getActiveProvider() === "none") {
    return NextResponse.json(
      { error: "La IA no está disponible en este entorno (falta configurar la clave del proveedor)." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const parsed = Input.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { description, storeName, rubro } = parsed.data;

    // Cap mensual por plan — ~0.001 USD por generación (Haiku). canSpend resuelve
    // el plan REAL del tenant (antes hardcodeaba "free" → planes pagos capados).
    if (!(await aiCostGuard.canSpend(auth.tenantId, 0.001))) {
      return NextResponse.json(
        { error: "Llegaste al límite mensual de generaciones con IA. Actualizá tu plan o esperá el próximo mes." },
        { status: 429 },
      );
    }

    const prompt = `Sos un diseñador de marca para tiendas online en Perú. A partir de la descripción del negocio, definí un tema visual COHESIVO y profesional.

Negocio: ${storeName ? `"${storeName}" — ` : ""}${description}
${rubro ? `Rubro: ${rubro}` : ""}

Devolvé EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin comentarios, sin texto antes ni después) con EXACTAMENTE estas claves:
{
  "primaryColor": "#RRGGBB",   // color principal de marca (botones, acentos fuertes)
  "secondaryColor": "#RRGGBB", // color complementario para detalles/ofertas
  "accentColor": "#RRGGBB",    // acento, armónico con el primario
  "fontFamily": "una de: sistema|geist|inter|poppins|montserrat|raleway|nunito|lato|roboto|opensans",
  "darkModeDefault": false,    // true solo si el negocio pide un look nocturno/elegante
  "borderRadius": 12,          // entero 0-24; bajo = sobrio, alto = amigable
  "buttonStyle": "rounded|square|pill",
  "heroTitle": "...",          // título principal, máx 80 caracteres, gancho claro
  "heroSubtitle": "...",       // subtítulo, máx 140 caracteres
  "slogan": "..."              // frase corta de marca, máx 60 caracteres
}

Reglas de diseño:
- Los 3 colores deben armonizar entre sí y encajar con el rubro (ej. comida = cálidos/apetitosos; farmacia = limpios/confiables; maderería = tierra/madera).
- Contraste suficiente: el primario debe leerse bien sobre blanco.
- Copy en español de Perú natural, tuteo ("Pedí", "Elegí"), NUNCA voseo argentino, sin emojis, sin "¡increíble!".
- borderRadius, fuente y botón coherentes con el tono (sobrio vs amigable).
- NO inventes datos del negocio que no estén en la descripción.`;

    const result = await trackAiUsage(
      { tenantId: auth.tenantId, feature: "store-theme", model: "claude-haiku-4-5" },
      () =>
        generateText({
          model: chatModel,
          prompt,
          maxOutputTokens: 400,
          temperature: 0.8,
        }),
    );

    // El modelo a veces envuelve el JSON en fences ```json … ``` — limpiar antes de parsear.
    const raw = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      logger.error("[ai-theme] respuesta no-JSON", { raw: raw.slice(0, 200) });
      return NextResponse.json(
        { error: "La IA no devolvió un tema válido. Probá con otra descripción." },
        { status: 502 },
      );
    }

    const themed = AiTheme.safeParse(json);
    if (!themed.success) {
      logger.error("[ai-theme] JSON fuera de schema", { issues: themed.error.issues });
      return NextResponse.json(
        { error: "La IA devolvió un tema incompleto. Probá de nuevo." },
        { status: 502 },
      );
    }

    return NextResponse.json({ theme: themed.data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    logger.error("[ai-theme] error", { err: msg });
    return NextResponse.json(
      { error: "Falló la generación del tema", detail: msg },
      { status: 500 },
    );
  }
}
