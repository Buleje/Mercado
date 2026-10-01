import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestAnexosDB } from "@/lib/db/forest-anexos.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { filaNoCuadra } from "@/lib/forestal/anexo04-registro";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/anexos — bandeja de ANEXOS N° 04 emitidos.
 *
 * GET     — lista los emitidos (más reciente primero).
 * POST    — registra una emisión (upsert por N° + GTF).
 * DELETE  — borra por `?id=`.
 *
 * Guard: requireAdmin → rate limit → especialización. El anexo se emite desde
 * dos lados (Herramientas y Libro CTP), así que basta con tener CUALQUIERA de
 * las dos habilitada. Los totales NUNCA se toman del cliente: la capa de datos
 * los recalcula desde las piezas.
 */

const piezaSchema = z.object({
  id: z.string().trim().max(60).optional(),
  cantidad: z.coerce.number().int().positive().max(99999),
  espesor: z.coerce.number().positive().max(999),
  ancho: z.coerce.number().positive().max(999),
  largo: z.coerce.number().positive().max(999),
  uEspesor: z.enum(["pulg", "cm", "pies", "m"]).optional(),
  uAncho: z.enum(["pulg", "cm", "pies", "m"]).optional(),
  uLargo: z.enum(["pulg", "cm", "pies", "m"]).optional(),
  especie: z.string().trim().max(60).nullish(),
  /* El volumen y el PT los calcula el cubicador desde las medidas; se aceptan
     para re-imprimir el mismo papel, pero con tope y sólo si cuadran (abajo). */
  pieTablar: z.coerce.number().nonnegative().max(5_000_000).optional(),
  m3: z.coerce.number().nonnegative().max(10_000).optional(),
});

/** La pieza como la guarda el registro: unidades por omisión y, si no trae volumen, el que dan sus medidas. */
function piezaDelRegistro(p: z.infer<typeof piezaSchema>, i: number): PiezaCubicada {
  const base = {
    cantidad: p.cantidad,
    espesor: p.espesor, ancho: p.ancho, largo: p.largo,
    uEspesor: p.uEspesor ?? "pulg", uAncho: p.uAncho ?? "pulg", uLargo: p.uLargo ?? "pies",
  } as const;
  const calculado = cubicarPieza(base);
  return {
    id: p.id ?? `p-${i}`,
    ...base,
    especie: p.especie ?? undefined,
    pieTablar: p.pieTablar ?? calculado.pieTablar,
    m3: p.m3 ?? calculado.m3,
  };
}

const saveSchema = z.object({
  id: z.string().trim().max(60).optional(),
  numero: z.string().trim().max(60).default(""),
  gtf: z.string().trim().max(60).default(""),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  empresa: z.string().trim().max(160).default(""),
  firmante: z.string().trim().max(120).default(""),
  documento: z.string().trim().max(30).default(""),
  cargo: z.string().trim().max(120).default(""),
  observaciones: z.string().trim().max(600).default(""),
  unidadV: z.enum(["pt", "m3"]).default("pt"),
  modo: z.enum(["oficial", "compacto"]).default("oficial"),
  especieGlobal: z.string().trim().max(60).nullish(),
  ctpEntryId: z.string().trim().max(60).nullish(),
  /* El total declarado A MANO en el papel. No reemplaza al recalculado —ese
     sigue saliendo de las piezas— pero sin guardarlo no se puede re-imprimir
     el documento que se entregó. */
  totalManualM3: z.coerce.number().nonnegative().max(999999).nullish(),
  // Un anexo de varias hojas son 35 filas por bloque × 4 × N hojas; el tope
  // protege el KV sin estorbar un despacho grande de verdad.
  piezas: z.array(piezaSchema).min(1).max(1000),
}).superRefine((v, ctx) => {
  /* ADR-446 (seguridad S1): el libro registra la salida con el m³ de cada fila;
     uno que no sale de sus medidas no se guarda. */
  v.piezas.forEach((p, i) => {
    const mala = filaNoCuadra(piezaDelRegistro(p, i));
    if (mala) {
      ctx.addIssue({
        code: "custom",
        path: ["piezas", i, "m3"],
        message: `La fila ${i + 1} dice ${mala.declaradoM3} m³ y sus medidas dan ${mala.calculadoM3}: vuelve a cubicarla.`,
      });
    }
  });
});

async function ensureSpec(tenantId: string) {
  const [herramientas, libro] = await Promise.all([
    isSpecializationEnabled(tenantId, "spec:forestal:herramientas"),
    isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"),
  ]);
  return herramientas || libro
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo forestal no está habilitado para esta tienda." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-anexos-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    const anexos = await ForestAnexosDB.list(auth.tenantId);
    return NextResponse.json({ anexos });
  } catch (err) {
    logger.error("[anexos.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-anexos-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const { id, fecha, especieGlobal, ctpEntryId, piezas, totalManualM3, ...datos } = parsed.data;
  try {
    const anexo = await ForestAnexosDB.save(
      auth.tenantId,
      {
        id,
        fecha,
        datos,
        especieGlobal: especieGlobal ?? undefined,
        ctpEntryId: ctpEntryId ?? undefined,
        totalManualM3: totalManualM3 ?? null,
        // Las piezas llegan ya cubicadas del cliente; los TOTALES del anexo se
        // recalculan igual en `construirEmision`, que es lo que se guarda.
        piezas: piezas.map(piezaDelRegistro),
      },
      auth.username ?? "unknown",
    );
    return NextResponse.json({ anexo }, { status: id ? 200 : 201 });
  } catch (err) {
    /* ADR-446: registrado en el libro (no se edita), bandeja ocupada o una fila que no cuadra. */
    if (err instanceof CtpInvariantError) {
      return NextResponse.json(
        { error: err.code, message: err.message, detail: err.detail },
        { status: err.code === "VALIDACION" ? 400 : 409 },
      );
    }
    logger.error("[anexos.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-anexos-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestAnexosDB.remove(auth.tenantId, id, auth.username ?? "unknown");
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    /* ADR-446: un anexo cuya salida ya está en el libro no se borra (respalda esas líneas). */
    if (err instanceof CtpInvariantError) {
      return NextResponse.json({ error: err.code, message: err.message, detail: err.detail }, { status: 409 });
    }
    logger.error("[anexos.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
