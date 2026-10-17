/**
 * POST /api/admin/comandos-ia/mensajes/escribir — «Escríbelo por mí».
 *
 * Body: { pedido: string (≤300), salida: "whatsapp" | "cartel" | "tienda" }.
 * La IA (tier balanced) redacta con los datos del negocio leídos aquí (nombre,
 * horario, Yape, dirección); el pie del cartel lo arma el servidor con esos
 * mismos datos, no la IA. No guarda nada. No hace formatos oficiales.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { estimadoIaUsd, llamarIa } from "@/lib/admin/comandos-ia/ia-llamada";
import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
import { safeParseJSON } from "@/lib/ai-json-parser";
import { SettingsDB } from "@/lib/db/settings.db";

const MAX_TOKENS = 700;

const BodySchema = z.object({
  pedido: z.string().trim().min(3).max(300),
  salida: z.enum(["whatsapp", "cartel", "tienda"]),
});

const RespuestaSchema = z.object({
  titulo: z.string().max(120).optional().default(""),
  texto: z.string().min(1).max(1200),
});

/**
 * Formatos oficiales: tienen su módulo y su papel; aquí no se inventan.
 * «Liquidación» no va: «gran liquidación de fin de mes» es un aviso de tienda.
 */
const RE_OFICIAL = /\b(gtf|gu[ií]a de transporte|lo-?th|libro de operaciones|carta rel|relaci[oó]n de gu[ií]as)\b/i;

const SIN_IA: Record<"sin-clave" | "tardo" | "fallo", { error: string; status: number }> = {
  "sin-clave": { error: "La IA no está conectada en tu negocio: pídele a soporte que la active.", status: 503 },
  tardo: { error: "La IA tardó demasiado. Reintenta en un momento.", status: 504 },
  fallo: { error: "La IA no respondió. Reintenta en un momento.", status: 503 },
};

const LARGO: Record<z.infer<typeof BodySchema>["salida"], { max: number; como: string }> = {
  whatsapp: { max: 600, como: "un mensaje de WhatsApp para clientes (máximo 600 caracteres, a lo más un emoji)" },
  cartel: { max: 350, como: "un cartel A4 para pegar en la tienda: título corto y llamativo (máximo 6 palabras) y un texto de 1 a 3 líneas" },
  tienda: { max: 400, como: "un aviso corto para la tienda en línea (máximo 400 caracteres)" },
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "ci-msg-escribir");
  if (rl) return rl;

  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Escribe qué quieres avisar (hasta 300 letras)." }, { status: 400 });
  }
  const { pedido, salida } = body.data;
  if (RE_OFICIAL.test(pedido)) {
    return NextResponse.json(
      { error: "Eso es un formato oficial: hazlo desde su módulo (Libro, Guías o Trámites)." },
      { status: 422 },
    );
  }

  try {
    const s = await SettingsDB.get(auth.tenantId);
    const negocio = s.businessName?.trim() || "";
    const datos = [
      negocio && `Nombre: ${negocio}`,
      s.hours?.trim() && `Horario: ${s.hours.trim()}`,
      s.yapeEnabled && s.yapePhone?.trim() && `Yape: ${s.yapePhone.trim()}${s.yapeName ? ` (${s.yapeName})` : ""}`,
      s.businessAddress?.trim() && `Dirección: ${s.businessAddress.trim()}`,
    ].filter(Boolean) as string[];

    if (!(await aiCostGuard.canSpend(auth.tenantId, estimadoIaUsd("balanced", 450, MAX_TOKENS)))) {
      return NextResponse.json({ error: "Llegaste al tope de IA de tu plan este mes." }, { status: 402 });
    }

    const ia = await llamarIa(auth.tenantId, "balanced", {
      messages: [
        {
          role: "system",
          content: [
            "Escribes avisos para una bodega del Perú. Español con tuteo peruano (nunca voseo).",
            `Vas a escribir ${LARGO[salida].como}.`,
            "Usa SOLO los datos del negocio que te paso si vienen al caso; no inventes precios, teléfonos, fechas ni direcciones.",
            'Responde SOLO JSON: {"titulo": "<título o vacío>", "texto": "<texto>"}.',
          ].join(" "),
        },
        { role: "user", content: `Datos del negocio:\n${datos.join("\n") || "(sin datos)"}\n\nLo que quiere avisar el dueño: «${pedido}»` },
      ],
      temperature: AI_TEMPERATURES.creative,
      maxTokens: MAX_TOKENS,
      label: "comandos-ia-escribir",
    }, "comandos-ia/escribir");
    if (!ia.ok) return NextResponse.json({ error: SIN_IA[ia.motivo].error, motivo: ia.motivo }, { status: SIN_IA[ia.motivo].status });
    const { res, costoIaUsd } = ia;

    const parsed = safeParseJSON(res.content ?? "", RespuestaSchema);
    // Un modelo que no devolvió JSON igual escribió el texto: se usa tal cual.
    const titulo = parsed.ok ? parsed.data.titulo.trim() : "";
    const texto = (parsed.ok ? parsed.data.texto : (res.content ?? "")).trim().slice(0, LARGO[salida].max);
    if (!texto) return NextResponse.json({ error: "La IA devolvió un texto vacío. Reintenta." }, { status: 502 });

    const pie = [
      negocio,
      s.businessAddress?.trim(),
      s.hours?.trim(),
      s.yapeEnabled && s.yapePhone?.trim() ? `Yape ${s.yapePhone.trim()}` : "",
    ].filter((x): x is string => Boolean(x));

    return NextResponse.json({ salida, titulo, texto, pie, costoIaUsd });
  } catch (err) {
    logger.error("[comandos-ia/escribir] falló", { err: String(err), tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json({ error: "No pude escribirlo ahora. Reintenta en un momento." }, { status: 500 });
  }
}
