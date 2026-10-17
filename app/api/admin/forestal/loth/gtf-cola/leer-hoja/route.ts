import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimitWithTenant } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { aiCostGuard } from "@/lib/ai/cost-control";
import {
  FORMATOS_IMAGEN,
  costoMaximoLecturaUsd,
  falloSinLector,
  gastoDeLectura,
  proveedorVision,
  visionExtractJSON,
} from "@/lib/ai/vision-extract";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { limpiarNumeroHoja } from "@/lib/forestal/gtf-cola-monte";

/**
 * /api/admin/forestal/loth/gtf-cola/leer-hoja — lee el N° preimpreso de la hoja
 * del talonario en la foto de la guía ya impresa (16-10). Sólo PROPONE: el que
 * imprimió lo confirma o lo corrige; la foto se guarda aparte, en los
 * documentos de la guía. Sin clave de IA responde 503 y la pantalla pide
 * escribirlo — la cola funciona igual.
 *
 * Mismo camino que la placa del tocón (`placa-ocr`): JPEG achicado en el
 * teléfono, tope de gasto por tenant, la imagen nunca va al log.
 */

const MAX_IMAGE_B64 = 4_000_000;
const MAX_BODY_BYTES = MAX_IMAGE_B64 + 2_000;
const MAX_TOKENS = 200;
const RESERVA_USD = costoMaximoLecturaUsd({ maxTokens: MAX_TOKENS });

const RequestSchema = z.object({
  image: z
    .string()
    .min(100, "Falta la foto de la hoja.")
    .max(MAX_IMAGE_B64, "La foto es muy grande: tómala de nuevo.")
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "La foto tiene que llegar en JPEG."),
});

const LeidoSchema = z.object({
  numero: z.preprocess((v) => (v == null ? "" : String(v)), z.string()).default(""),
  confianza: z.preprocess((v) => (v == null || v === "" ? 0 : v), z.coerce.number()).default(0),
});

const JSON_SCHEMA = {
  type: "object",
  properties: { numero: { type: "string" }, confianza: { type: "number" } },
  required: ["numero", "confianza"],
  additionalProperties: false,
};

const PROMPT =
  "Esta foto es de una Guía de Transporte Forestal (GTF) de Perú impresa en una hoja de talonario preimpreso. " +
  "Cada hoja trae su NÚMERO DE SERIE preimpreso por la imprenta (suele estar arriba a la derecha, a veces en rojo, " +
  "precedido de «N°» o «Nº», con ceros a la izquierda, p. ej. «N° 0971772»). Lee SOLO ese número preimpreso, " +
  "no el que escribió la impresora, ni el RUC, ni fechas, ni placas. No lo completes ni lo adivines. " +
  'Devuelve SOLO JSON: {"numero":"","confianza":0} — numero con sus ceros (vacío si no se ve), ' +
  "confianza de 0 a 1 de que leíste bien CADA dígito.";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  /* Una guía por despacho: pocas fotos al día por tienda. */
  const rl = applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "loth-hoja-ocr", { maxReqs: 60, windowSec: 60 * 60 });
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "La foto es muy grande: tómala de nuevo." }, { status: 413 });
  }
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const verDetalleDeClave = await veDetalleDeClaveIA(req);
  if (!proveedorVision()) {
    const f = falloSinLector(verDetalleDeClave);
    return NextResponse.json({ error: f.error, codigo: f.codigo }, { status: f.status });
  }
  if (!(await aiCostGuard.canSpend(auth.tenantId, RESERVA_USD))) {
    return NextResponse.json({ error: "Se acabó el presupuesto de lectura con IA de este mes." }, { status: 429 });
  }

  const r = await visionExtractJSON({
    imageBase64: parsed.data.image,
    formatos: FORMATOS_IMAGEN,
    prompt: PROMPT,
    schema: LeidoSchema,
    jsonSchema: JSON_SCHEMA,
    maxTokens: MAX_TOKENS,
    logTag: "[gtf-hoja-ocr]",
    verDetalleDeClave,
  });
  const gasto = gastoDeLectura(r, RESERVA_USD);
  if (gasto != null) {
    await aiCostGuard.recordSpend(auth.tenantId, gasto).catch((err: unknown) =>
      logger.error("[gtf-hoja-ocr] recordSpend failed", { error: String(err), tenantId: auth.tenantId.slice(-6) }),
    );
  }
  if (!r.ok) {
    const dePapel = r.codigo == null || r.codigo === "ilegible" || r.codigo === "pedido_rechazado";
    return NextResponse.json({ error: dePapel ? "No se pudo leer el N° en la foto: escríbelo." : r.error, codigo: r.codigo ?? "ilegible" }, { status: r.status });
  }
  const numero = limpiarNumeroHoja(r.data.numero);
  const bruta = Number.isFinite(r.data.confianza) ? r.data.confianza : 0;
  const confianza = numero ? Math.min(1, Math.max(0, bruta > 1 && bruta <= 100 ? bruta / 100 : bruta)) : 0;
  return NextResponse.json({ numero, confianza });
}
