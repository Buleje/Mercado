import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestCtpDB, CTP_SECTIONS } from "@/lib/db/forest-ctp.db";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { ctpErrorResponse, ctpValidationResponse } from "@/lib/forestal/ctp-api-errors";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/ctp — Libro CTP: producción + despacho + saldos (ADR-127)
 * GET (lista ?section · ?saldos=1) · POST (crea) · PATCH { id, action:"annul", reason } · DELETE ?id
 * Guard: spec:forestal:ctp-libro · rate-limit GENEROUS bucket 'ctp'
 */

const sectionEnum = z.enum(CTP_SECTIONS);
const createSchema = z.object({
  section: sectionEnum,
  entryDate: z.coerce.date().optional(),
  // ADR-134: dejó de ser "la guía" para ser el RESUMEN de las N guías que
  // alimentaron la corrida ("001-0000120, 001-0000131, …"). Con el max(60)
  // original —dimensionado para un solo código— 5 guías ya daban 400, y mezclar
  // guías es justamente la razón de ser del modelo N:M. La columna es TEXT, así
  // que el único límite era éste. 1000 cubre el tope de 50 consumos por línea.
  // La VERDAD de la trazabilidad vive en ForestCtpConsumo; esto es el acta legible.
  gtfIngreso: z.string().trim().max(1000).nullable().optional(),
  materiaPrimaRef: z.string().trim().max(120).nullable().optional(),
  speciesCommon: z.string().trim().max(120).nullable().optional(),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  productType: z.string().trim().max(80).nullable().optional(),
  volumeInputM3: z.coerce.number().nonnegative().max(99999).nullable().optional(),
  rendimientoPct: z.coerce.number().nonnegative().max(100).nullable().optional(),
  quantity: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  unit: z.enum(["m3", "kg", "unidad", "pt"]).nullable().optional(),
  pieces: z.coerce.number().int().nonnegative().max(999999).nullable().optional(),
  gtfNumber: z.string().trim().max(60).nullable().optional(),
  destino: z.string().trim().max(200).nullable().optional(),
  observations: z.string().trim().max(1000).nullable().optional(),
  // ADR-134: una corrida real mezcla varias guías. La atribución viaja con el
  // alta; `ForestCtpConsumoDB` valida I1/I2 y tenant antes de escribir.
  consumos: z
    .array(
      z.object({
        woodEntryId: z.string().trim().min(1),
        volumeM3: z.coerce.number().positive().max(99999),
      }),
    )
    .max(50)
    .optional(),
  costoProceso: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  moneda: z.string().trim().max(8).nullable().optional(),
  // ADR-135: de qué corridas salió el producto de este despacho. Cierra la
  // cadena de custodia; `ForestCtpDespachoDB` valida I4/I5 antes de escribir.
  origenes: z
    .array(
      z.object({
        produccionEntryId: z.string().trim().min(1),
        quantity: z.coerce.number().positive().max(9999999),
      }),
    )
    .max(50)
    .optional(),
});
const patchSchema = z.discriminatedUnion("action", [
  z.object({ id: z.string().trim().min(1), action: z.literal("annul"), reason: z.string().trim().min(3).max(500) }),
  // Emitir la GTF de salida formal (serie autorizada ARFFS + correlativo auto).
  z.object({ id: z.string().trim().min(1), action: z.literal("emitir_gtf") }),
  // Registrar el valor de venta del despacho para el P&L (ADR-141).
  z.object({ id: z.string().trim().min(1), action: z.literal("set_venta"), valorVenta: z.number().min(0).max(9_999_999_999.99).nullable() }),
]);

/** `?from`/`?to` = instantes ISO del período (lib/forestal/ctp-period.ts). Inválido → sin límite. */
function periodFromUrl(url: URL): { fromDate?: Date; toDate?: Date } {
  const dateParam = z.coerce.date();
  const read = (key: string) => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const parsed = dateParam.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };
  return { fromDate: read("from"), toDate: read("to") };
}

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." }, { status: 403 });
}


export const GET = withApiHandler("forestal-ctp-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const url = new URL(req.url);
  const period = periodFromUrl(url);
  try {
    if (url.searchParams.get("saldos") === "1") {
      return NextResponse.json({ saldos: await ForestCtpDB.saldos(auth.tenantId, period) });
    }
    // P&L del período: venta − COGS agregado (ADR-141).
    if (url.searchParams.get("pnl") === "1") {
      return NextResponse.json({ pnl: await ForestCtpDespachoDB.pnlDelPeriodo(auth.tenantId, period) });
    }
    // Conciliación: apertura + movimientos = existencia final (ADR-139 rollforward).
    if (url.searchParams.get("conciliacion") === "1") {
      return NextResponse.json({ conciliacion: await ForestCtpDB.conciliacionPeriodo(auth.tenantId, period) });
    }
    // ADR-135 D3: despachos del período que no podrían emitir certificado.
    if (url.searchParams.get("traza") === "1") {
      return NextResponse.json({ traza: await ForestCtpDespachoDB.trazabilidadDelPeriodo(auth.tenantId, period) });
    }
    // Grafo de cadena de custodia del período (Radar de trazabilidad).
    if (url.searchParams.get("grafo") === "1") {
      return NextResponse.json({ grafo: await ForestCtpDB.grafoTrazabilidad(auth.tenantId, period) });
    }
    // Kardex (cuenta corriente) de la materia prima de una especie.
    const kardexEspecie = url.searchParams.get("kardex");
    if (kardexEspecie) {
      return NextResponse.json({ kardex: await ForestCtpDB.kardexEspecie(auth.tenantId, kardexEspecie, period) });
    }
    // Trazabilidad hacia adelante de UN ingreso: ¿a dónde fue esta madera?
    const trazaForward = url.searchParams.get("trazaForward");
    if (trazaForward) {
      return NextResponse.json({ trazaForward: await ForestCtpDB.trazaForwardIngreso(auth.tenantId, trazaForward) });
    }
    // Historial de cambios de UNA línea del libro (rec #10 QA): todo lo que el
    // audit trail registró sobre ese registro — defensa ante fiscalización.
    const historialId = url.searchParams.get("historial");
    if (historialId) {
      const { ActivityLogDB } = await import("@/lib/db/activity-log.db");
      const rows = await ActivityLogDB.list(auth.tenantId, { entityId: historialId, limit: 50 });
      return NextResponse.json({
        historial: rows
          .filter((r) => r.action.startsWith("ctp_"))
          .map((r) => ({ id: r.id, action: r.action, detail: r.detail, user: r.user, createdAt: r.createdAt })),
      });
    }
    // UNA línea por id. La usa el ANEXO N° 04 emitido desde el cubicador: la
    // cubicación sabe de qué corrida salió, y el anexo no puede detallar más de
    // lo que esa corrida produjo.
    const entryId = url.searchParams.get("entryId");
    if (entryId) {
      const entry = await ForestCtpDB.getById(auth.tenantId, entryId);
      return entry
        ? NextResponse.json({ entry })
        : NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Reorden predictivo (all-time, ritmo últimos 90 días).
    if (url.searchParams.get("reorden") === "1") {
      return NextResponse.json({ reorden: await ForestCtpDB.proyeccionReorden(auth.tenantId) });
    }
    // Tendencias mensuales (últimos N meses; ignora el período).
    if (url.searchParams.get("tendencias") === "1") {
      const meses = Number(url.searchParams.get("meses") ?? "6");
      return NextResponse.json({ tendencias: await ForestCtpDB.tendenciasMensuales(auth.tenantId, Number.isFinite(meses) ? meses : 6) });
    }
    const availableFor = url.searchParams.get("available");
    if (availableFor && (CTP_SECTIONS as readonly string[]).includes(availableFor)) {
      // `?excludeCtpEntryId=` al EDITAR una línea: lo que ella misma consume no
      // cuenta contra el disponible (si no, sus guías se verían agotadas).
      return NextResponse.json({
        items: await ForestCtpDB.availableSource(auth.tenantId, availableFor as (typeof CTP_SECTIONS)[number], {
          excludeCtpEntryId: url.searchParams.get("excludeCtpEntryId") ?? undefined,
        }),
      });
    }
    const s = url.searchParams.get("section");
    const section = s && (CTP_SECTIONS as readonly string[]).includes(s) ? (s as (typeof CTP_SECTIONS)[number]) : undefined;
    const { entries, total } = await ForestCtpDB.list(auth.tenantId, {
      section,
      search: url.searchParams.get("search") ?? undefined,
      includeAnnulled: url.searchParams.get("includeAnnulled") === "1",
      ...period,
    });
    return NextResponse.json({ entries, total });
  } catch (err) {
    logger.error("[ctp.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-ctp-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    const entry = await ForestCtpDB.create(auth.tenantId, { ...parsed.data, createdBy: auth.username ?? "unknown" });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    // Puede traer `consumos` ⇒ puede violar I1/I2 ⇒ 422 con el motivo, no 500.
    return ctpErrorResponse(err, "ctp.POST", auth.tenantId);
  }
});

export const PATCH = withApiHandler("forestal-ctp-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return ctpValidationResponse(parsed.error);
  try {
    if (parsed.data.action === "emitir_gtf") {
      const result = await ForestCtpDespachoDB.emitirGtf(auth.tenantId, parsed.data.id, auth.username ?? "unknown");
      if (!result.ok) {
        const message =
          result.reason === "serie_no_configurada"
            ? "No hay serie de GTF configurada. Cargá la «Serie GTF autorizada» en la pestaña Ficha CTP."
            : result.reason === "anulado"
              ? "El despacho está anulado: no se puede emitir su GTF."
              : "No se encontró la línea de despacho.";
        return NextResponse.json({ error: result.reason, message }, { status: 422 });
      }
      return NextResponse.json({ gtf: result.gtf, correlativo: result.correlativo, yaEmitida: result.yaEmitida });
    }
    if (parsed.data.action === "set_venta") {
      await ForestCtpDespachoDB.setValorVenta(auth.tenantId, parsed.data.id, parsed.data.valorVenta, auth.username ?? "unknown");
      return NextResponse.json({ ok: true, margen: await ForestCtpDespachoDB.margenDeDespacho(auth.tenantId, parsed.data.id) });
    }
    return NextResponse.json({ entry: await ForestCtpDB.annul(auth.tenantId, parsed.data.id, parsed.data.reason, auth.username ?? "unknown") });
  } catch (err) {
    logger.error("[ctp.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-ctp-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    await ForestCtpDB.softDelete(auth.tenantId, id, auth.username ?? "unknown");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[ctp.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
