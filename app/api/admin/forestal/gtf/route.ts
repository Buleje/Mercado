import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfDB, GtfDuplicateError, GtfSpeciesNotAuthorizedError } from "@/lib/db/forest-gtf.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { motivoSchema } from "@/lib/forestal/motivo";
import { leerPlaca } from "@/lib/forestal/placa-peru";
import { GuiaThAlCtpDB } from "@/lib/db/guia-th-al-ctp.db";
import { permisoDelPedido } from "@/lib/forestal/loth-permiso-pedido";
import { GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import { guiaParaFormato, marcarReemitidas } from "@/lib/forestal/tramites-desde-guias";

/**
 * /api/admin/forestal/gtf — Guía de Transporte Forestal (ADR-126 Fase 4)
 * GET (lista · ?id detalle · ?estado=bajas anuladas+borradas) · POST (emite) · PATCH { id, action:"annul", reason }
 */

const itemSchema = z.object({
  code: z.string().trim().max(60).nullable().optional(),
  species: z.string().trim().max(120).nullable().optional(),
  scientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  diamMayorM: z.coerce.number().nonnegative().nullable().optional(),
  diamMenorM: z.coerce.number().nonnegative().nullable().optional(),
  lengthM: z.coerce.number().nonnegative().nullable().optional(),
  volumeM3: z.coerce.number().nonnegative().nullable().optional(),
  productType: z.string().trim().max(80).nullable().optional(),
  pieces: z.coerce.number().int().nonnegative().nullable().optional(),
  quantity: z.coerce.number().nonnegative().nullable().optional(),
  unit: z.string().trim().max(10).nullable().optional(),
});
const createSchema = z.object({
  planId: z.string().trim().min(1).nullable().optional(),
  gtfNumber: z.string().trim().min(1).max(60),
  gtfDate: z.coerce.date().nullable().optional(),
  tipo: z.enum(["trozas", "producto"]).optional(),
  titularName: z.string().trim().max(200).nullable().optional(),
  tituloHabilitante: z.string().trim().max(120).nullable().optional(),
  parcelaCorta: z.string().trim().max(120).nullable().optional(),
  // Sin estos tres, un puesto de control no puede cruzar quién transporta la
  // madera contra este registro interno — el gap que dejaba la ronda QA.
  transportista: z.string().trim().min(1, "El transportista es obligatorio").max(200),
  transportistaDoc: z.string().trim().max(20).nullable().optional(),
  conductor: z.string().trim().min(1, "El conductor es obligatorio").max(200),
  conductorLicencia: z.string().trim().max(40).nullable().optional(),
  // La guía la emite el bosque: una placa que no puede existir (`leerPlaca`,
  // 29-09-2026) no se registra. «V2H-901 / -» (como la copia SERFOR) sí pasa.
  placaVehiculo: z
    .string()
    .trim()
    .min(1, "La placa del vehículo es obligatoria")
    .max(20)
    .superRefine((v, ctx) => {
      const l = leerPlaca(v);
      if (l.estado === "invalida") ctx.addIssue({ code: "custom", message: l.motivo });
    }),
  origen: z.string().trim().max(200).nullable().optional(),
  destino: z.string().trim().max(200).nullable().optional(),
  items: z.array(itemSchema).min(1).max(500),
  observations: z.string().trim().max(1000).nullable().optional(),
});
const idsSchema = z
  .array(z.string().min(1).max(60))
  .min(1, "Elige al menos una guía.")
  .max(200, "Hasta 200 guías por trámite.");
/* El motivo con la regla de `motivo.ts`: sin invisibles y con al menos 3 letras. */
const patchSchema = z.object({
  id: z.string().trim().min(1),
  action: z.literal("annul"),
  reason: motivoSchema({ max: 500, mensaje: "El motivo va con al menos 3 letras." }),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}
/** Lectura: LOTH (emisor) o CTP (recibe con la guía) pueden consultar guías. */
async function ensureReadSpec(tenantId: string) {
  const loth = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  const ctp = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return loth || ctp ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-gtf-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureReadSpec(auth.tenantId);
  if (guard) return guard;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const gtfNumber = url.searchParams.get("gtfNumber");
  try {
    // `?ids=a,b` (07-10): las guías elegidas en la vista GTF, listas para
    // llenar un trámite (`tramites-desde-guias`). Cada anulada dice si su N°
    // sigue vigente en el libro (se volvió a registrar).
    const idsParam = url.searchParams.get("ids");
    if (idsParam !== null) {
      const ids = idsSchema.safeParse(idsParam.split(",").map((s) => s.trim()).filter(Boolean));
      if (!ids.success) {
        return NextResponse.json({ error: "validation_error", message: ids.error.issues[0]?.message }, { status: 400 });
      }
      const [filas, vigentes] = await Promise.all([
        ForestGtfDB.porIds(auth.tenantId, ids.data),
        ForestGtfDB.numerosVigentes(auth.tenantId),
      ]);
      const guias = marcarReemitidas(filas.map(guiaParaFormato), vigentes);
      return NextResponse.json({ guias, faltan: ids.data.length - guias.length });
    }
    if (gtfNumber) {
      // Importar al ingreso CTP: buscar la guía emitida por su número.
      // El N° solo no identifica la guía: `titular`/`permiso` la eligen si hay
      // dos de dueños distintos; sin ellos, 409 «ambigua» (nunca la primera).
      const e = await ForestGtfDB.findByNumber(auth.tenantId, gtfNumber, {
        titular: url.searchParams.get("titular"),
        permiso: url.searchParams.get("permiso"),
      });
      if (e.estado === "ninguna") return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (e.estado === "ambigua") {
        const quienes = e.candidatas.map((g) => g.titularName?.trim() || "sin titular").join(" y ");
        return NextResponse.json(
          {
            error: "ambigua",
            message: `Hay ${e.candidatas.length} guías con el N° ${gtfNumber} (${quienes}): elígela de la lista de guías emitidas.`,
            candidatas: e.candidatas.map((g) => ({ id: g.id, gtfNumber: g.gtfNumber, titularName: g.titularName })),
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ gtf: e.guia });
    }
    if (id) {
      const gtf = await ForestGtfDB.getById(auth.tenantId, id);
      if (!gtf) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ gtf });
    }
    // Bandeja monte→planta: guías de trozas emitidas sin ingreso vigente en el CTP.
    if (url.searchParams.get("sinIngresar") === "1") {
      return NextResponse.json({ gtfs: await ForestGtfDB.paraLaBandejaDelMonte(auth.tenantId) });
    }
    // Sugerencia de correlativo para una serie (el operador la acepta o la pisa).
    const serie = url.searchParams.get("sugerir");
    if (serie) {
      return NextResponse.json({ sugerido: await ForestGtfDB.sugerirNumero(auth.tenantId, serie) });
    }
    // Filtro por permiso del libro (`?planId=&solo=1`): plan ajeno → 404, mal formado → 400.
    const permiso = await permisoDelPedido(auth.tenantId, url.searchParams);
    if (permiso instanceof NextResponse) return permiso;
    // `?estado=bajas` (Libro TH, 07-10): anuladas + borradas, sólo lectura.
    if (url.searchParams.get("estado") === "bajas") {
      return NextResponse.json({ gtfs: await ForestGtfDB.listBajas(auth.tenantId, permiso.filtro) });
    }
    const gtfs = await ForestGtfDB.list(auth.tenantId, permiso.filtro);
    // `?conCtp=1` (Libro TH, 07-10): cada guía de trozas dice si ya entró al
    // Libro CTP. Campo agregado; sin el parámetro la respuesta es la de siempre.
    if (url.searchParams.get("conCtp") === "1") {
      const ctp = await ForestGtfDB.estadoCtpDeLista(auth.tenantId, gtfs);
      return NextResponse.json({ gtfs: gtfs.map((g) => ({ ...g, ctp: ctp.get(g.id) ?? null })) });
    }
    return NextResponse.json({ gtfs });
  } catch (err) {
    logger.error("[gtf.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-gtf-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues }, { status: 400 });
  try {
    /* Un `planId` ajeno o dado de baja no se guarda: el control de especies no
       frenaría nada y la guía quedaría colgada de un plan que ningún filtro ve. */
    if (parsed.data.planId) {
      const { ForestPlanDB } = await import("@/lib/db/forest-plan.db");
      const plan = await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId);
      if (!plan) {
        return NextResponse.json({ error: "plan_not_found", message: "Ese permiso no existe en este negocio o fue dado de baja." }, { status: 404 });
      }
    }
    const gtf = await ForestGtfDB.create(auth.tenantId, { ...parsed.data, createdBy: auth.username ?? "unknown" });
    return NextResponse.json({ gtf }, { status: 201 });
  } catch (err) {
    // GTF duplicada = dato del operador (una guía no se anota dos veces), no 500.
    if (err instanceof GtfDuplicateError) {
      return NextResponse.json({ error: "duplicate", message: err.message }, { status: 409 });
    }
    if (err instanceof GtfSpeciesNotAuthorizedError) {
      return NextResponse.json({ error: "species_not_authorized", message: err.message }, { status: 422 });
    }
    logger.error("[gtf.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-gtf-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    const gtf = await ForestGtfDB.annul(auth.tenantId, parsed.data.id, parsed.data.reason, auth.username ?? "unknown");
    /* La guardada del Libro CTP con este N° (si la guía pasó allá) se da de
       baja. Si su madera ya entró al CTP, `annul` frenó antes con 409. */
    const ctp = await GuiaThAlCtpDB.alAnular(auth.tenantId, gtf, parsed.data.reason, auth.username ?? "unknown");
    return NextResponse.json({ gtf, ctp });
  } catch (err) {
    if (err instanceof GuiaYaEnElCtpError) {
      return NextResponse.json(
        { error: "guia_ya_en_el_ctp", message: err.message, libroNros: err.libroNros },
        { status: 409 },
      );
    }
    logger.error("[gtf.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
