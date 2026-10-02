import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
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
import { esNumeroRegistroValido, normalizarNumeroRegistro } from "@/lib/forestal/serfor-gtf";

/**
 * /api/admin/forestal/gtf-ocr — extrae los datos de una GTF (Guía de Transporte
 * Forestal) fotografiada para pre-llenar el ingreso de madera. NO reemplaza la
 * validación humana: el operador revisa y corrige antes de guardar.
 *
 * 2026-10-02 («Un solo lector para guías y facturas»): lee con el lector común
 * (`visionExtractJSON`: Claude `claude-sonnet-5-5` primero, OpenAI de
 * respaldo), con el MISMO prompt, schema y JSON Schema de antes. Antes tenía su
 * propio fetch: OpenAI primero, `claude-sonnet-5` + `thinking: disabled`, cada
 * fallo un 502 mudo («API error: 401») y US$0,01 fijos al tope sólo si salía
 * bien. Ahora el tipo real de la foto se mira por los bytes, el fallo dice qué
 * pasó con un `codigo`, y se anota lo que costó de verdad en los dos caminos.
 *
 * ADR-442 (27-09): también lee el N° de REGISTRO del SNIFFS (`110-19-0469779`),
 * que no es el N° de GTF impreso. Con él la guía guardada se busca en SERFOR y
 * la ficha oficial manda; por eso un número que no tiene la forma, o que es
 * la misma GTF leída dos veces, sale VACÍO: nunca un número adivinado.
 */

const MAX_IMAGE_B64_BYTES = 10_000_000;
/* La respuesta son 10 campos cortos: 800 tokens, como antes. */
const MAX_TOKENS = 800;
/* Se reserva el TOPE de una lectura; se anota lo que costó (una GTF ≈ US$0,02). */
const RESERVA_USD = costoMaximoLecturaUsd({ maxTokens: MAX_TOKENS });

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
});

const GtfSchema = z.object({
  gtfNumber: z.string().default(""),
  gtfSeries: z.string().default(""),
  especie: z.string().default(""),
  especieCientifica: z.string().default(""),
  volumenM3: z.coerce.number().min(0).default(0),
  proveedor: z.string().default(""),
  ruc: z.string().default(""),
  fecha: z.string().default(""),
  origen: z.string().default(""),
  /** ADR-442. Opcional para quien no lo usa (el alta de ingreso lo ignora). */
  /* OpenAI responde JSON libre: un `null` acá no puede tumbar toda la lectura
     (también la del alta de ingreso, que ni usa este campo). */
  numeroRegistro: z.preprocess((v) => (v == null ? "" : v), z.string()).default(""),
});

const soloDigitos = (v: string) => v.replace(/\D/g, "");

/**
 * El N° de registro sólo pasa si tiene la forma del SNIFFS y no es la GTF
 * leída en otra casilla: los dos son dígitos con guiones y el modelo puede
 * repetir uno en el lugar del otro. Ante la duda, vacío.
 */
/** Forma de un N° de GTF (`019-001-0000004`, `019-0000001`): NO es un registro. */
const FORMA_GTF = /^\d{3}(-\d{3})?-\d{7}$/;

function registroLeido(registro: string, gtf: string, serie: string): string {
  /* Si el modelo copió el rótulo («N° REGISTRO : 1-19-0313629»), vale el
     número que trae, tal cual: sacar la etiqueta no es adivinar. */
  const n = normalizarNumeroRegistro(registro).match(/\d[\d-]*\d/)?.[0] ?? "";
  if (!n || !esNumeroRegistroValido(n)) return "";
  /* Con la serie aparte (número `0000004`, serie `019-001`) la GTF entera es
     serie + número: compararla sólo con el número la dejaba pasar. */
  const d = soloDigitos(n);
  if (gtf && (d === soloDigitos(gtf) || d === soloDigitos(`${serie}${gtf}`))) return "";
  if (FORMA_GTF.test(n)) return "";
  return n;
}

const PROMPT =
  "Extrae los datos de esta Guía de Transporte Forestal (GTF) peruana de SERFOR. " +
  "Devuelve SOLO JSON válido sin markdown con: gtfNumber (número de la guía), gtfSeries (serie si aparece), " +
  "especie (nombre común de la especie forestal), especieCientifica (nombre científico si aparece), " +
  "volumenM3 (volumen total en m³ como número), proveedor (titular/remitente), ruc (RUC del titular), " +
  'fecha (YYYY-MM-DD), origen (concesión/predio/comunidad de procedencia), ' +
  "numeroRegistro (N° de registro o constancia de registro del MC SNIFFS de SERFOR: dígitos con guiones como " +
  "110-19-0469779 o 1-19-0313629; suele estar junto al código QR o en el recuadro del estado, rotulado " +
  "«N° REGISTRO»; NO es el N° de GTF impreso como 019-001-0000004 — si sólo ves ese, deja numeroRegistro vacío). " +
  'Formato: {"gtfNumber":"","gtfSeries":"","especie":"","especieCientifica":"","volumenM3":0,"proveedor":"","ruc":"","fecha":"","origen":"","numeroRegistro":""}. ' +
  "Si un dato no se lee, dejalo vacío o 0.";

/**
 * Lo que Claude tiene que devolver (`output_config.format`). Los campos son
 * EXACTAMENTE los de `GtfSchema` y del PROMPT: qué se extrae de una GTF es
 * materia de SERFOR, no de un refactor. Todos requeridos a propósito: el
 * contrato del PROMPT es «si un dato no se lee, dejalo vacío o 0», no omitirlo.
 */
const JSON_SCHEMA_GTF = {
  type: "object",
  properties: {
    gtfNumber: { type: "string" },
    gtfSeries: { type: "string" },
    especie: { type: "string" },
    especieCientifica: { type: "string" },
    volumenM3: { type: "number" },
    proveedor: { type: "string" },
    ruc: { type: "string" },
    fecha: { type: "string" },
    origen: { type: "string" },
    numeroRegistro: { type: "string" },
  },
  required: [
    "gtfNumber", "gtfSeries", "especie", "especieCientifica",
    "volumenM3", "proveedor", "ruc", "fecha", "origen", "numeroRegistro",
  ],
  additionalProperties: false,
};

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "gtf-ocr");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "No llegó la foto de la guía." }, { status: 400 }); }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });

  const verDetalleDeClave = await veDetalleDeClaveIA(req);
  if (!proveedorVision()) {
    /* Mensaje para el operador del patio, no para un programador; el detalle técnico va al log. */
    logger.warn("[gtf-ocr] sin ANTHROPIC_API_KEY ni OPENAI_API_KEY configuradas", { tenantId: auth.tenantId.slice(-6) });
    const f = falloSinLector(verDetalleDeClave);
    return NextResponse.json({ error: f.error, codigo: f.codigo }, { status: f.status });
  }

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, RESERVA_USD);
  if (!canSpend) {
    return NextResponse.json({ error: "Se acabó el presupuesto de lectura con IA de este mes.", codigo: "limite_ia" }, { status: 429 });
  }

  const r = await visionExtractJSON({
    imageBase64: parsed.data.image,
    /* Una foto: el tipo real (por los bytes) tiene que ser JPG/PNG/WebP/GIF y
       coincidir con el declarado; si no, 400 sin llamar a la IA. */
    formatos: FORMATOS_IMAGEN,
    prompt: PROMPT,
    schema: GtfSchema,
    jsonSchema: JSON_SCHEMA_GTF,
    maxTokens: MAX_TOKENS,
    logTag: "[gtf-ocr]",
    verDetalleDeClave,
  });
  /* Lo cobrado se anota en los DOS caminos: una respuesta cortada o ilegible también se pagó. */
  const gasto = gastoDeLectura(r, RESERVA_USD);
  if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
  if (!r.ok) {
    /* Lo que es de la clave o de la IA se dice tal cual; lo que es de la foto, con qué hacer. */
    const dePapel = r.codigo == null || r.codigo === "ilegible" || r.codigo === "pedido_rechazado";
    const error = dePapel ? "No se pudo leer la guía en la foto. Prueba con una foto más nítida, de frente y con buena luz." : r.error;
    return NextResponse.json({ error, codigo: r.codigo ?? "ilegible" }, { status: r.status });
  }
  const d = r.data;
  return NextResponse.json({ ...d, numeroRegistro: registroLeido(d.numeroRegistro, d.gtfNumber, d.gtfSeries) });
}
