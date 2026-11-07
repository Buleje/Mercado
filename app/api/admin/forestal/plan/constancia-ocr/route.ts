import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, applyRateLimitWithTenant } from "@/lib/rate-limit";
import { aiCostGuard } from "@/lib/ai/cost-control";
import {
  FORMATOS_IMAGEN_Y_PDF,
  costoMaximoLecturaUsd,
  estadoLectorIA,
  falloSinLector,
  gastoDeLectura,
  paginasDePdf,
  proveedorVision,
  visionExtractJSON,
} from "@/lib/ai/vision-extract";
import { veDetalleDeClaveIA } from "@/lib/ai/detalle-clave-ia";
import { isSpecializationEnabled } from "@/lib/specializations";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { logger } from "@/lib/logger";
import {
  JSON_SCHEMA_CONSTANCIA,
  LecturaCrudaSchema,
  PROMPT_CONSTANCIA,
  lecturaVacia,
  normalizarLectura,
} from "@/lib/forestal/loth-constancia-ocr";

/**
 * /api/admin/forestal/plan/constancia-ocr — lee la constancia de inscripción
 * del registro de plantación (ronda 3 de ADR-459).
 *
 * GET  — `{ activo, proveedor, leePdf, aviso }`: la pantalla lo pregunta ANTES
 *        de pedir el archivo, para no hacer elegir una foto que no se va a leer.
 * POST — `{ archivo }` (data URL de una foto JPEG/PNG/WebP o de un PDF) →
 *        `{ lectura }` con cada campo `null` si el papel no lo trae.
 *
 * Sólo LEE: no crea el plan ni guarda el archivo. El formulario completa lo
 * vacío y la persona revisa antes de «Crear». Mismo lector que la placa y las
 * planillas (`visionExtractJSON`). El archivo nunca va al log.
 */

/* Vercel corta el cuerpo en 4,5 MB: 4,3 MB de base64 ≈ 3,2 MB de archivo.
   La pantalla achica la foto a ≤2400 px antes de mandarla (~1 MB). */
const MAX_ARCHIVO_B64 = 4_300_000;
const MAX_BODY_BYTES = MAX_ARCHIVO_B64 + 2_000;
/* Una constancia son 1-3 hojas. Más de 5 no es una constancia, y cada
   página se paga (auditoría 2026-10-02: un PDF largo era gasto sin techo). */
const MAX_PAGINAS_PDF = 5;
/* Tope de la respuesta: el cuadro de especies de un registro real trae 1-6
   filas; 40 filas entran holgadas. */
const MAX_TOKENS = 3000;

const RequestSchema = z.object({
  archivo: z
    .string()
    .min(100, "Falta la foto o el PDF de la constancia.")
    .max(MAX_ARCHIVO_B64, "El archivo es muy grande: usa una foto o un PDF de menos de 3 MB.")
    .regex(
      /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/,
      "Sube una foto (JPG o PNG) o un PDF de la constancia.",
    ),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "loth-constancia-estado");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  return NextResponse.json(estadoLectorIA(await veDetalleDeClaveIA(req)));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  /* `requireAdmin` deja pasar al encargado; leer la constancia es parte del
     alta del registro, que es sólo de admin y dueño (como el POST del plan). */
  const prohibido = soloAdminODueno(auth.role, "leer la constancia del registro de plantación");
  if (prohibido) return prohibido;
  /* Por IP y por tienda: un alta es UNA constancia, con alguna foto repetida. */
  const rl = applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "loth-constancia-ocr", { maxReqs: 30, windowSec: 60 * 60 });
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const largo = Number(req.headers.get("content-length") ?? 0);
  if (largo > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "El archivo es muy grande: usa una foto o un PDF de menos de 3 MB." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No llegó el archivo." }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }

  const verDetalleDeClave = await veDetalleDeClaveIA(req);
  if (!proveedorVision()) {
    logger.warn("[constancia-ocr] sin ANTHROPIC_API_KEY ni OPENAI_API_KEY configuradas", { tenantId: auth.tenantId.slice(-6) });
    const f = falloSinLector(verDetalleDeClave);
    return NextResponse.json({ error: f.error, codigo: f.codigo }, { status: f.status });
  }

  /* Un PDF se cuenta ANTES de gastar: más de 5 hojas no es una constancia y
     cada hoja se paga. La reserva sale de cuántas trae. */
  const archivo = parsed.data.archivo;
  let paginasPdf: number | undefined;
  if (archivo.startsWith("data:application/pdf")) {
    const paginas = await paginasDePdf(archivo.slice(archivo.indexOf(",") + 1));
    if (paginas == null) {
      return NextResponse.json({ error: "No se pudo abrir el PDF: puede estar dañado. Sube una foto de la constancia.", codigo: "formato_no_soportado" }, { status: 400 });
    }
    if (paginas > MAX_PAGINAS_PDF) {
      return NextResponse.json(
        {
          error: `El PDF tiene ${paginas} páginas: sube sólo las hojas de la constancia (hasta ${MAX_PAGINAS_PDF}) o una foto.`,
          codigo: "demasiadas_paginas",
        },
        { status: 400 },
      );
    }
    paginasPdf = paginas;
  }
  const reserva = costoMaximoLecturaUsd({ maxTokens: MAX_TOKENS, paginasPdf });

  const canSpend = await aiCostGuard.canSpend(auth.tenantId, reserva);
  if (!canSpend) {
    return NextResponse.json({ error: "Se acabó el presupuesto de lectura con IA de este mes.", codigo: "limite_ia" }, { status: 429 });
  }

  const r = await visionExtractJSON({
    imageBase64: archivo,
    formatos: FORMATOS_IMAGEN_Y_PDF,
    prompt: PROMPT_CONSTANCIA,
    schema: LecturaCrudaSchema,
    jsonSchema: JSON_SCHEMA_CONSTANCIA,
    maxTokens: MAX_TOKENS,
    logTag: "[constancia-ocr]",
    verDetalleDeClave,
  });
  /* Lo cobrado se anota en los DOS caminos: una respuesta cortada o ilegible
     también se pagó. Sin `usage`, lo reservado: nunca una lectura gratis. */
  const gasto = gastoDeLectura(r, reserva);
  if (gasto != null) await aiCostGuard.recordSpend(auth.tenantId, gasto);
  if (!r.ok) {
    const dePapel = r.codigo == null || r.codigo === "ilegible" || r.codigo === "pedido_rechazado";
    const error = dePapel ? "No se pudo leer la constancia. Prueba con una foto más nítida, de frente y con buena luz." : r.error;
    return NextResponse.json({ error, codigo: r.codigo ?? "ilegible" }, { status: r.status });
  }

  const lectura = normalizarLectura(r.data);
  if (lecturaVacia(lectura)) {
    return NextResponse.json(
      { error: "En el archivo no se ve una constancia de registro de plantación. Revisa que sea la hoja correcta.", codigo: "ilegible" },
      { status: 422 },
    );
  }
  return NextResponse.json({ lectura, proveedor: r.proveedor });
}
