/**
 * POST /api/admin/comandos-ia/mensajes/redactar — borradores para «A quién escribir».
 *
 * Body: { ids: string[] (≤10), tono: "amable" | "claro" }.
 * - El servidor RELEE la bandeja: nunca acepta montos del navegador.
 * - La IA (tier cheap) escribe UNA plantilla por tipo con huecos; al modelo van
 *   solo el tipo, el tono y el nombre del negocio (nada de teléfonos ni DNI,
 *   Ley 29733). Los huecos los rellena `plantillas-sin-ia.ts`.
 * - Sin IA, sin tope o con una plantilla que no sirve → la de siempre, y se dice.
 * No escribe en la base.
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
import { leerBandeja } from "@/lib/admin/comandos-ia/bandeja-servidor";
import {
  PLANTILLAS_SIN_IA,
  clavePlantilla,
  claveSiguiente,
  plantillaValida,
  rellenarPlantilla,
  type ClavePlantilla,
  type Tono,
} from "@/lib/admin/comandos-ia/plantillas-sin-ia";

const MAX_TOKENS = 900;

const BodySchema = z.object({
  ids: z.array(z.string().min(3).max(120)).min(1).max(10),
  tono: z.enum(["amable", "claro"]).default("amable"),
});

const RespuestaIaSchema = z.object({ plantillas: z.record(z.string(), z.string()) });

const QUE_ES: Record<ClavePlantilla, string> = {
  "fiado-vencido": "cliente con una cuenta fiada de {monto} desde el {desde}, que venció hace {dias} días",
  "fiado-por-vencer": "cliente con una cuenta fiada de {monto} que vence en {dias} días",
  "cliente-ritmo": "cliente frecuente que no compra hace {dias} días; invítalo a volver, sin hablar de deudas",
  adelanto: "persona que recibió un adelanto de dinero el {desde} y tiene un saldo pendiente de {monto}",
  seguimiento: "segundo mensaje: ya se le escribió antes y sigue debiendo {monto}; pide una fecha",
  "seguimiento-cliente": "segundo mensaje a un cliente que no ha vuelto; ofrécele preparar su pedido",
};

type MotivoSinIa = "sin-clave" | "no-respondio" | "tope" | "formato" | null;

async function plantillasConIa(
  tenantId: string,
  claves: ClavePlantilla[],
  tono: Tono,
  negocio: string,
): Promise<{ plantillas: Partial<Record<ClavePlantilla, string>>; costoIaUsd: number; motivo: MotivoSinIa }> {
  const estimado = estimadoIaUsd("cheap", claves.length * 120 + 350, MAX_TOKENS);
  if (!(await aiCostGuard.canSpend(tenantId, estimado))) return { plantillas: {}, costoIaUsd: 0, motivo: "tope" };

  const sistema = [
    `Redactas mensajes de WhatsApp de una bodega del Perú${negocio ? ` llamada «${negocio}»` : ""} para sus clientes.`,
    "Español con tuteo peruano (nunca voseo). Sin emojis. Máximo 400 caracteres por mensaje.",
    "Usa estos huecos LITERALES y nunca escribas cifras, montos, fechas ni enlaces: {nombre} {monto} {dias} {desde} {negocio}.",
    'Responde SOLO JSON: {"plantillas": {"<clave>": "<texto>"}} con exactamente las claves pedidas.',
  ].join(" ");
  const tonoTexto = tono === "amable" ? "cálido y cercano, sin presionar" : "directo y respetuoso; pide una fecha concreta";
  const pedido = [`Tono: ${tonoTexto}.`, "Claves:", ...claves.map((c) => `- "${c}": ${QUE_ES[c]}`)].join("\n");

  const ia = await llamarIa(tenantId, "cheap", {
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: pedido },
    ],
    temperature: AI_TEMPERATURES.notifications,
    maxTokens: MAX_TOKENS,
    label: "comandos-ia-redactar",
  }, "comandos-ia/redactar");
  // Sin clave, lenta o caída: la plantilla de siempre (el aviso distingue la falta de clave).
  if (!ia.ok) return { plantillas: {}, costoIaUsd: 0, motivo: ia.motivo === "sin-clave" ? "sin-clave" : "no-respondio" };
  const { res, costoIaUsd } = ia;

  const parsed = safeParseJSON(res.content ?? "", RespuestaIaSchema);
  if (!parsed.ok) return { plantillas: {}, costoIaUsd, motivo: "formato" };
  const plantillas: Partial<Record<ClavePlantilla, string>> = {};
  for (const c of claves) {
    const t = parsed.data.plantillas[c];
    if (plantillaValida(c, t)) plantillas[c] = t.trim();
  }
  return { plantillas, costoIaUsd, motivo: Object.keys(plantillas).length === 0 ? "formato" : null };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "MODERATE", "ci-msg-redactar");
  if (rl) return rl;

  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Elige de 1 a 10 personas.", detalle: body.error.flatten() }, { status: 400 });
  }

  try {
    const { ids, tono } = body.data;
    const bandeja = await leerBandeja(auth.tenantId);
    const porId = new Map(bandeja.candidatos.map((c) => [c.id, c]));
    const elegidos = ids.map((id) => porId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
    const faltan = ids.filter((id) => !porId.has(id));

    const claves = [...new Set(elegidos.flatMap((c) => [clavePlantilla(c), claveSiguiente(c)]))];
    const ia = elegidos.length > 0
      ? await plantillasConIa(auth.tenantId, claves, tono, bandeja.negocio)
      : { plantillas: {}, costoIaUsd: 0, motivo: null as MotivoSinIa };

    const plantilla = (c: ClavePlantilla) => ia.plantillas[c] ?? PLANTILLAS_SIN_IA[tono][c];
    const borradores = elegidos.map((c) => {
      const clave = clavePlantilla(c);
      return {
        id: c.id,
        candidato: c,
        texto: rellenarPlantilla(plantilla(clave), c, bandeja.negocio),
        siguiente: rellenarPlantilla(plantilla(claveSiguiente(c)), c, bandeja.negocio),
        conIa: Boolean(ia.plantillas[clave]),
      };
    });

    return NextResponse.json({ borradores, faltan, costoIaUsd: ia.costoIaUsd, motivoSinIa: ia.motivo, tono });
  } catch (err) {
    logger.error("[comandos-ia/redactar] falló", { err: String(err), tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json({ error: "No pude redactar ahora. Reintenta en un momento." }, { status: 500 });
  }
}
