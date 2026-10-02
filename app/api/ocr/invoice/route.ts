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
import { logger } from "@/lib/logger";

/**
 * /api/ocr/invoice — lee la foto de una boleta o factura peruana para cargar
 * la compra (Punto de compra → «Escanear factura»). Sólo LEE: la persona revisa
 * los ítems antes de confirmar.
 *
 * 2026-10-02 («Un solo lector para guías y facturas»): lee con el lector común
 * (`visionExtractJSON`: Claude `claude-sonnet-5-5` primero, OpenAI de
 * respaldo), con el MISMO schema (`InvoiceSchema`) y JSON Schema de antes. Antes
 * tenía su propio fetch: OpenAI primero, `claude-sonnet-5` + `thinking:
 * disabled`, la foto anunciada SIEMPRE como JPEG (una PNG daba 400), cada fallo
 * un 502 mudo («API error: 401») y US$0,01 fijos al tope sólo si salía bien.
 */

// SECURITY 2026-05-12 (H2 audit AI): cap defensivo de imagen base64.
// 10MB = ~7.5MB raw image, suficiente para fotos de factura.
const MAX_IMAGE_B64_BYTES = 10_000_000;
/* Una boleta con muchos ítems: 1500 tokens de respuesta, como antes. */
const MAX_TOKENS = 1500;
/* Se reserva el TOPE de una lectura; se anota lo que costó (una boleta ≈ US$0,02). */
const RESERVA_USD = costoMaximoLecturaUsd({ maxTokens: MAX_TOKENS });

const RequestSchema = z.object({
  image: z.string().min(100, "Imagen requerida").max(MAX_IMAGE_B64_BYTES, "Imagen muy grande (>10MB)"),
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

/**
 * Lo que Claude tiene que devolver (`output_config.format`): el mismo de antes.
 * `ruc` y `fecha` NO son requeridos: si el comprobante no los trae, se omiten
 * en vez de inventarlos (y `InvoiceSchema` los acepta ausentes).
 */
const JSON_SCHEMA_FACTURA = {
  type: "object",
  properties: {
    proveedor: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        ruc: { type: "string" },
      },
      required: ["nombre"],
      additionalProperties: false,
    },
    fecha: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          cantidad: { type: "number" },
          precioUnitario: { type: "number" },
        },
        required: ["nombre", "cantidad", "precioUnitario"],
        additionalProperties: false,
      },
    },
    total: { type: "number" },
  },
  required: ["proveedor", "items", "total"],
  additionalProperties: false,
};

/**
 * Los dos prompts de antes en uno: el de Claude (qué representa cada campo, no
 * inventar) y la forma del JSON del de OpenAI, que el respaldo necesita porque
 * no recibe el JSON Schema.
 */
const PROMPT =
  "Extrae los datos de esta boleta o factura peruana: el proveedor con su RUC, la fecha de emisión, cada ítem con su " +
  "cantidad y precio unitario, y el total. " +
  'Responde SOLO JSON: {"proveedor":{"nombre":"...","ruc":"..."},"fecha":"...","items":[{"nombre":"...","cantidad":1,"precioUnitario":0}],"total":0}. ' +
  "Si un dato no figura en el comprobante, omítelo en vez de inventarlo.";

export async function POST(req: NextRequest) {
  // SECURITY 2026-05-12 (H2 audit AI): auth + cost guard + rate limit STRICT.
  // Antes era abierto al mundo → atacante quemaba $30-100/dia de Vision API.
  const _rl = await applyRateLimit(req, "STRICT", "ocr-invoice"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No llegó la foto de la factura." }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const verDetalleDeClave = await veDetalleDeClaveIA(req);
  if (!proveedorVision()) {
    /* Lo lee el encargado con la factura en la mano, no un programador: el detalle técnico va al log. */
    logger.warn("[ocr-invoice] sin ANTHROPIC_API_KEY ni OPENAI_API_KEY configuradas", { tenantId: auth.tenantId.slice(-6) });
    const f = falloSinLector(verDetalleDeClave);
    return NextResponse.json({ error: f.error, codigo: f.codigo }, { status: f.status });
  }

  // Cost guard por tenant — si excede el budget mensual, rechaza con 429
  const canSpend = await aiCostGuard.canSpend(auth.tenantId, RESERVA_USD);
  if (!canSpend) {
    logger.warn("[ocr-invoice] presupuesto AI excedido", { tenantId: auth.tenantId.slice(-6) });
    return NextResponse.json({ error: "Se acabó el presupuesto de lectura con IA de este mes.", codigo: "limite_ia" }, { status: 429 });
  }

  const r = await visionExtractJSON({
    imageBase64: parsed.data.image,
    /* El tipo real (por los bytes) tiene que ser una foto y coincidir con el declarado. */
    formatos: FORMATOS_IMAGEN,
    prompt: PROMPT,
    // ADR 009: parse defensivo con schema Zod unificado.
    schema: InvoiceSchema,
    jsonSchema: JSON_SCHEMA_FACTURA,
    maxTokens: MAX_TOKENS,
    logTag: "[ocr-invoice]",
    verDetalleDeClave,
  });
  /* Lo cobrado se anota en los DOS caminos: antes un parseo fallido «no se
     pagaba» en el tope, pero la IA sí lo cobraba. */
  const gasto = gastoDeLectura(r, RESERVA_USD);
  if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
  if (!r.ok) {
    const dePapel = r.codigo == null || r.codigo === "ilegible" || r.codigo === "pedido_rechazado";
    const error = dePapel ? "No se pudo leer la factura. Prueba con una foto más nítida, de frente y con buena luz." : r.error;
    return NextResponse.json({ error, codigo: r.codigo ?? "ilegible" }, { status: r.status });
  }
  return NextResponse.json(r.data);
}
