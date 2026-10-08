/**
 * Migración al código único de troza (ADR-477): las trozas que ya entraron al
 * Libro TH desde una guía importada con su código CRUDO («1») pasan a
 * «1-0001», en el Trozado, en el Despacho y en los items de la guía.
 *
 * Sin ruta HTTP: lo corre `scripts/migrar-codigo-unico-adr-477.mjs` (ensayo
 * por defecto, `--aplicar` con la huella del ensayo, `--revertir` con el
 * respaldo). El plan lo arma `planCodigoUnico` (puro): la MISMA función decide
 * el ensayo y la escritura, ésta con las líneas bloqueadas.
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { tomarTurnoDeImportacion } from "@/lib/db/forest-loth-importar.db";
import { leerReferencial } from "@/lib/forestal/loth-importar-guia";
import { partirCodigoUnico } from "@/lib/forestal/codigo-unico-troza";
import type { LothAuditAction, LothAuditEntity } from "@/lib/forestal/loth-audit";
import {
  RespaldoCodigoUnicoSchema,
  codigosDeLaMigracion,
  esDeLaImportacion,
  itemsMigrados,
  planCodigoUnico,
  talaRenombrada,
  type DatosDeMigracion,
  type LineaLeida,
  type PlanCodigoUnico,
  type RespaldoCodigoUnico,
} from "@/lib/forestal/codigo-unico-migracion";

type Db = Prisma.TransactionClient | typeof prisma;

/** Una guía grande: 22 trozas en Blas; holgura para guías de cientos. */
const TX_OPTS = { timeout: 120_000, maxWait: 15_000 } as const;

const MigrarGuiaInput = z.object({
  gtfId: z.string().min(1).max(40),
  /** sha256 del plan del ensayo. */
  huella: z.string().regex(/^[0-9a-f]{64}$/),
  user: z.string().min(1).max(120).optional(),
});
const RevertirInput = z.object({ respaldo: RespaldoCodigoUnicoSchema, user: z.string().min(1).max(120).optional() });

/** Lo que el ensayo guarda para poder volver atrás. */
export interface PlanConRespaldo extends PlanCodigoUnico {
  respaldo: Omit<RespaldoCodigoUnico, "fecha" | "tenantId">;
}

export class CodigoUnicoError extends Error {
  constructor(
    readonly codigo: "entrada_invalida" | "no_existe" | "huella_distinta" | "bloqueada" | "cambio_concurrente" | "no_coincide",
    message: string,
  ) {
    super(message);
    this.name = "CodigoUnicoError";
  }
}

const LINEA_SELECT = {
  id: true,
  section: true,
  lineNo: true,
  trozaCode: true,
  planId: true,
  gtfNumber: true,
  observations: true,
  entryDate: true,
  updatedAt: true,
} as const;

type LineaDb = { id: string; section: string; lineNo: number; trozaCode: string | null; planId: string | null; gtfNumber: string | null; observations: string | null; entryDate: Date; updatedAt: Date };
const comoLinea = (l: LineaDb): LineaLeida => ({ ...l, entryDate: l.entryDate.toISOString(), updatedAt: l.updatedAt.toISOString() });

/** Lee todo lo que el plan necesita (dentro de la tx que reciba). */
async function leer(db: Db, tenantId: string, gtfId: string) {
  const gtf = await db.forestGtf.findFirst({
    where: { id: gtfId, tenantId, deletedAt: null },
    select: { id: true, gtfNumber: true, planId: true, status: true, items: true, updatedAt: true },
  });
  if (!gtf) throw new CodigoUnicoError("no_existe", `No existe la guía ${gtfId} en este negocio.`);
  const { codigos, candidatos, trozadoIds, arboles } = codigosDeLaMigracion(gtf);
  const vivas = { tenantId, deletedAt: null, status: "registrado" } as const;
  const [trozados, salidas, lineasOcupadas, itemsOcupados, cierres, ctpAtadas, talas] = await Promise.all([
    codigos.length || trozadoIds.length
      ? db.forestLothEntry.findMany({
          where: { ...vivas, section: "trozado", OR: [{ trozaCode: { in: codigos } }, { id: { in: trozadoIds } }] },
          select: LINEA_SELECT,
          orderBy: { id: "asc" },
        })
      : [],
    codigos.length
      ? db.forestLothEntry.findMany({
          where: { ...vivas, section: { in: ["despacho_troza", "consumo_troza"] }, trozaCode: { in: codigos } },
          select: LINEA_SELECT,
          orderBy: { id: "asc" },
        })
      : [],
    candidatos.length
      ? db.forestLothEntry.findMany({ where: { tenantId, deletedAt: null, trozaCode: { in: candidatos } }, select: { trozaCode: true } })
      : [],
    candidatos.length
      ? db.$queryRaw<{ code: string }[]>`
          SELECT DISTINCT e->>'code' AS code
          FROM "ForestGtf" g, jsonb_array_elements(CASE WHEN jsonb_typeof(g."items"::jsonb) = 'array' THEN g."items"::jsonb ELSE '[]'::jsonb END) e
          WHERE g."tenantId" = ${tenantId} AND g."deletedAt" IS NULL AND g."id" <> ${gtf.id}
            AND e->>'code' IN (${Prisma.join(candidatos)})`
      : [],
    ForestLothCierreDB.list(tenantId),
    trozadoIds.length || codigos.length
      ? db.woodEntryTroza.findMany({
          where: { tenantId, entry: { deletedAt: null }, lothTrozadoId: { not: null }, OR: [{ lothTrozadoId: { in: trozadoIds } }, { codificacion: { in: codigos } }] },
          select: { lothTrozadoId: true, codificacion: true },
        })
      : [],
    gtf.planId && arboles.length
      ? db.forestLothEntry.findMany({
          where: { ...vivas, section: "tala", planId: gtf.planId, treeCode: { in: arboles } },
          select: { id: true, lineNo: true, observations: true, medicionCruda: true },
          orderBy: { id: "asc" },
        })
      : [],
  ]);
  const datos: DatosDeMigracion = {
    gtf: { id: gtf.id, gtfNumber: gtf.gtfNumber, planId: gtf.planId, status: gtf.status, items: gtf.items },
    trozados: trozados.map(comoLinea),
    salidas: salidas.map(comoLinea),
    ocupados: [...lineasOcupadas.map((l) => l.trozaCode ?? ""), ...itemsOcupados.map((i) => i.code)].filter(Boolean),
    cierres,
    ctpAtadas: ctpAtadas.flatMap((x) => (x.lothTrozadoId ? [{ lothTrozadoId: x.lothTrozadoId, codificacion: x.codificacion }] : [])),
    talas: talas.map((t) => ({ id: t.id, lineNo: t.lineNo, observations: t.observations, referencial: leerReferencial(t.medicionCruda) })),
  };
  return { gtf, datos, talasCrudas: talas, lineas: [...trozados, ...salidas] };
}

function conRespaldo(l: Awaited<ReturnType<typeof leer>>): PlanConRespaldo {
  const plan = planCodigoUnico(l.datos);
  const ids = new Set(plan.cambios.map((c) => c.lineaId));
  const talaIds = new Set(plan.talas.map((t) => t.id));
  return {
    ...plan,
    respaldo: {
      gtf: { id: l.gtf.id, gtfNumber: l.gtf.gtfNumber, items: Array.isArray(l.gtf.items) ? (l.gtf.items as unknown[]) : [] },
      lineas: l.lineas.filter((x) => ids.has(x.id)).map((x) => ({ id: x.id, section: x.section, lineNo: x.lineNo, trozaCode: x.trozaCode, updatedAt: x.updatedAt.toISOString() })),
      talas: l.talasCrudas.filter((t) => talaIds.has(t.id)).map((t) => ({ id: t.id, medicionCruda: t.medicionCruda, observations: t.observations })),
      plan: { cambios: plan.cambios, items: plan.items },
      huella: plan.huella,
    },
  };
}

/** La marca de la tala con las trozas nuevas, sin tocar el resto del JSON. */
function medicionConTrozas(cruda: unknown, trozas: string[]): Prisma.InputJsonValue {
  const o = cruda && typeof cruda === "object" ? (cruda as Record<string, unknown>) : {};
  const ref = o.referencial && typeof o.referencial === "object" ? (o.referencial as Record<string, unknown>) : {};
  return { ...o, referencial: { ...ref, trozas } } as Prisma.InputJsonValue;
}

/** ActivityLog tiene RLS por `app.tenant_id` (ADR-114): se fija sólo para la tx. */
async function auditarEnTx(tx: Prisma.TransactionClient, tenantId: string, action: LothAuditAction, gtfId: string, detail: string, user: string) {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
  await tx.activityLog.create({
    data: { tenantId, action, entity: "ForestGtf" satisfies LothAuditEntity, entityId: gtfId, user: user || "unknown", detail: detail.slice(0, 2000) },
  });
}

function invalidar(tenantId: string) {
  for (const prefijo of [`forest-loth:${tenantId}`, `forest-gtf:${tenantId}`]) {
    try {
      invalidateByPrefix(prefijo);
    } catch (err) {
      logger.error("[forest-loth-codigo-unico] no se pudo invalidar la caché", { error: String(err), tenantId, prefijo });
    }
  }
}

/** Bloquea las líneas y la guía, en orden de id (dos corridas a la vez no se abrazan). */
async function bloquear(tx: Prisma.TransactionClient, tenantId: string, gtfId: string, lineaIds: string[]) {
  await tx.$queryRaw`SELECT "id" FROM "ForestGtf" WHERE "tenantId" = ${tenantId} AND "id" = ${gtfId} FOR UPDATE`;
  if (lineaIds.length) {
    await tx.$queryRaw`SELECT "id" FROM "ForestLothEntry" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join([...lineaIds].sort())}) ORDER BY "id" FOR UPDATE`;
  }
}

export const ForestLothCodigoUnicoDB = {
  /** Sólo lee. Guías `emitida` con trozas que entraron por importación con código crudo. */
  async guiasAMigrar(tenantId: string): Promise<{ gtfId: string; gtfNumber: string; trozas: number }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const lineas = await prisma.forestLothEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", section: "trozado", observations: { startsWith: "Importada de la GTF " } },
      select: { trozaCode: true, observations: true },
    });
    if (!lineas.length) return [];
    const guias = await prisma.forestGtf.findMany({
      where: { tenantId, deletedAt: null, status: "emitida", tipo: "trozas" },
      select: { id: true, gtfNumber: true },
      orderBy: { id: "asc" },
    });
    return guias.flatMap((g) => {
      const n = lineas.filter(
        (l) => esDeLaImportacion(l.observations, g.gtfNumber) && l.trozaCode && !/^SC-/.test(l.trozaCode) && !partirCodigoUnico(l.trozaCode, g.gtfNumber),
      ).length;
      return n ? [{ gtfId: g.id, gtfNumber: g.gtfNumber, trozas: n }] : [];
    });
  },

  /** Sólo lee, en una tx READ ONLY (vale sólo para esa tx: nunca `SET SESSION`). */
  async plan(tenantId: string, gtfId: string): Promise<PlanConRespaldo> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return conRespaldo(await leer(tx, tenantId, gtfId));
    }, TX_OPTS);
  },

  /** Una tx por guía: bloquea, recalcula el plan; huella distinta o bloqueos → aborta. */
  async migrarGuia(tenantId: string, input: unknown): Promise<{ cambiadas: number; items: number; talas: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const p = MigrarGuiaInput.safeParse(input);
    if (!p.success) throw new CodigoUnicoError("entrada_invalida", p.error.issues.map((i) => i.message).join("; "));
    const { gtfId, huella } = p.data;
    const user = p.data.user ?? "script-adr-477";
    const r = await prisma.$transaction(async (tx) => {
      /* El turno del importador: una guía importada a la vez que se migra podría
         quedarse con el mismo código único (ninguna ve lo que la otra no confirmó). */
      await tomarTurnoDeImportacion(tx, tenantId, true);
      const primera = conRespaldo(await leer(tx, tenantId, gtfId));
      await bloquear(tx, tenantId, gtfId, [...primera.cambios.map((c) => c.lineaId), ...primera.talas.map((t) => t.id)]);
      const l = await leer(tx, tenantId, gtfId);
      const plan = conRespaldo(l);
      if (plan.huella !== huella) throw new CodigoUnicoError("huella_distinta", `La guía ${plan.gtfNumber} cambió desde el ensayo (huella ${plan.huella.slice(0, 12)}…): vuelve a ensayar.`);
      if (plan.bloqueos.length) throw new CodigoUnicoError("bloqueada", plan.bloqueos.join(" "));
      if (!plan.cambios.length) return { plan, cambiadas: 0 };
      let cambiadas = 0;
      for (const c of plan.cambios) {
        const u = await tx.forestLothEntry.updateMany({ where: { tenantId, id: c.lineaId, trozaCode: c.de, deletedAt: null }, data: { trozaCode: c.a } });
        if (u.count !== 1) throw new CodigoUnicoError("cambio_concurrente", `La línea #${c.lineNo} (${c.section}) ya no tiene el código «${c.de}».`);
        cambiadas += 1;
      }
      const g = await tx.forestGtf.updateMany({
        where: { tenantId, id: gtfId, updatedAt: l.gtf.updatedAt },
        data: { items: itemsMigrados(l.gtf.items, plan) as Prisma.InputJsonValue },
      });
      if (g.count !== 1) throw new CodigoUnicoError("cambio_concurrente", `La guía ${plan.gtfNumber} cambió mientras se migraba.`);
      for (const t of plan.talas) {
        const cruda = l.talasCrudas.find((x) => x.id === t.id)?.medicionCruda;
        await tx.forestLothEntry.updateMany({
          where: { tenantId, id: t.id, deletedAt: null },
          data: { medicionCruda: medicionConTrozas(cruda, t.trozasA), ...(t.observacionA ? { observations: t.observacionA } : {}) },
        });
      }
      const detalle = plan.items.map((i) => `${i.de}→${i.a}`).join(", ");
      await auditarEnTx(tx, tenantId, "loth_codigo_unico_migrado", gtfId, `Código único (ADR-477) de la GTF ${plan.gtfNumber}: ${detalle}. Huella ${plan.huella.slice(0, 12)}.`, user);
      return { plan, cambiadas };
    }, TX_OPTS);
    if (r.cambiadas) invalidar(tenantId);
    return { cambiadas: r.cambiadas, items: r.plan.items.length, talas: r.plan.talas.length };
  },

  /** Restaura desde el respaldo sólo si cada línea tiene hoy el código `a` del respaldo. */
  async revertirGuia(tenantId: string, input: unknown): Promise<{ restauradas: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const p = RevertirInput.safeParse(input);
    if (!p.success) throw new CodigoUnicoError("entrada_invalida", p.error.issues.map((i) => i.message).join("; "));
    const { respaldo } = p.data;
    if (respaldo.tenantId !== tenantId) throw new CodigoUnicoError("no_coincide", "El respaldo es de otro negocio.");
    const user = p.data.user ?? "script-adr-477";
    const gtfId = respaldo.gtf.id;
    const restauradas = await prisma.$transaction(async (tx) => {
      await tomarTurnoDeImportacion(tx, tenantId, true);
      await bloquear(tx, tenantId, gtfId, [...respaldo.plan.cambios.map((c) => c.lineaId), ...respaldo.talas.map((t) => t.id)]);
      const hoy = await tx.forestLothEntry.findMany({
        where: { tenantId, id: { in: respaldo.plan.cambios.map((c) => c.lineaId) }, deletedAt: null },
        select: { id: true, trozaCode: true },
      });
      const codigoHoy = new Map(hoy.map((h) => [h.id, h.trozaCode]));
      const distintas = respaldo.plan.cambios.filter((c) => codigoHoy.get(c.lineaId) !== c.a);
      if (distintas.length) {
        throw new CodigoUnicoError("no_coincide", `${distintas.length} línea(s) ya no tienen el código del respaldo (p. ej. #${distintas[0].lineNo} «${distintas[0].a}»): no se revierte nada.`);
      }
      /* El código viejo tiene que seguir libre y nada nuevo puede colgar del único
         (un consumo de «1-0001» hecho después quedaría huérfano). */
      const deLaMigracion = new Set(respaldo.plan.cambios.map((c) => c.lineaId));
      const codigos = [...new Set(respaldo.plan.cambios.flatMap((c) => [c.de, c.a]))];
      const ajenas = (
        await tx.forestLothEntry.findMany({
          where: { tenantId, deletedAt: null, status: "registrado", trozaCode: { in: codigos } },
          select: { id: true, lineNo: true, section: true, trozaCode: true },
        })
      ).filter((x) => !deLaMigracion.has(x.id));
      if (ajenas.length) {
        const [a] = ajenas;
        throw new CodigoUnicoError("no_coincide", `La línea #${a.lineNo} (${a.section}) usa hoy «${a.trozaCode}»: no se revierte nada.`);
      }
      const gtf = await tx.forestGtf.findFirst({ where: { tenantId, id: gtfId, deletedAt: null }, select: { items: true } });
      if (!gtf) throw new CodigoUnicoError("no_existe", `No existe la guía ${respaldo.gtf.gtfNumber}.`);
      const esperados = JSON.stringify(itemsMigrados(respaldo.gtf.items, respaldo.plan));
      if (JSON.stringify(gtf.items) !== esperados && !mismosCodigos(gtf.items, respaldo)) {
        throw new CodigoUnicoError("no_coincide", `Los items de la guía ${respaldo.gtf.gtfNumber} ya no son los que dejó la migración: no se revierte nada.`);
      }
      for (const c of respaldo.plan.cambios) {
        await tx.forestLothEntry.updateMany({ where: { tenantId, id: c.lineaId, trozaCode: c.a }, data: { trozaCode: c.de } });
      }
      /* Los items de HOY con el mapa al revés (único → viejo), no el respaldo
         copiado: así no se pisa nada que haya cambiado en los otros campos. */
      await tx.forestGtf.updateMany({ where: { tenantId, id: gtfId }, data: { items: itemsRevertidos(gtf.items, respaldo) as Prisma.InputJsonValue } });
      /* Las talas, por nombre (único → viejo) y no copiando el respaldo: otra guía
         de la misma tala pudo migrarse o revertirse después del ensayo. */
      const viejoDe = new Map(respaldo.plan.items.map((i) => [i.a, i.de]));
      const talas = respaldo.talas.length
        ? await tx.forestLothEntry.findMany({
            where: { tenantId, id: { in: respaldo.talas.map((t) => t.id) }, deletedAt: null },
            select: { id: true, lineNo: true, observations: true, medicionCruda: true },
          })
        : [];
      for (const t of talas) {
        const m = talaRenombrada({ id: t.id, lineNo: t.lineNo, observations: t.observations, referencial: leerReferencial(t.medicionCruda) }, viejoDe);
        if (!m) continue;
        await tx.forestLothEntry.updateMany({
          where: { tenantId, id: t.id, deletedAt: null },
          data: { medicionCruda: medicionConTrozas(t.medicionCruda, m.trozasA), ...(m.observacionA ? { observations: m.observacionA } : {}) },
        });
      }
      const detalle = respaldo.plan.items.map((i) => `${i.a}→${i.de}`).join(", ");
      await auditarEnTx(tx, tenantId, "loth_codigo_unico_revertido", gtfId, `Código único revertido (ADR-477) en la GTF ${respaldo.gtf.gtfNumber}: ${detalle}.`, user);
      return respaldo.plan.cambios.length;
    }, TX_OPTS);
    invalidar(tenantId);
    return { restauradas };
  },
};

/**
 * `itemsMigrados` al revés sobre los items de hoy: el que tiene el código único
 * vuelve al viejo, con el `codigoGuia` que tenía antes (o sin él).
 */
function itemsRevertidos(itemsHoy: unknown, respaldo: RespaldoCodigoUnico): unknown[] {
  if (!Array.isArray(itemsHoy)) return [];
  const viejo = new Map(respaldo.plan.items.map((i) => [i.a, i.de]));
  const antes = new Map(
    respaldo.gtf.items.flatMap((it) => (it && typeof it === "object" && typeof (it as { code?: unknown }).code === "string" ? [[(it as { code: string }).code.trim(), it as Record<string, unknown>]] : [])),
  );
  return itemsHoy.map((it) => {
    if (!it || typeof it !== "object") return it;
    const o = it as Record<string, unknown>;
    const de = typeof o.code === "string" ? viejo.get(o.code.trim()) : undefined;
    if (de == null) return o;
    const { codigoGuia: _sinCodigoGuia, ...resto } = o;
    const previo = antes.get(de);
    return previo && "codigoGuia" in previo ? { ...resto, code: de, codigoGuia: previo.codigoGuia } : { ...resto, code: de };
  });
}

/** Los items de hoy tienen, en el mismo orden, los códigos que dejó la migración (el JSON pudo reordenar claves). */
function mismosCodigos(items: unknown, respaldo: RespaldoCodigoUnico): boolean {
  if (!Array.isArray(items)) return false;
  const esperados = itemsMigrados(respaldo.gtf.items, respaldo.plan) as Record<string, unknown>[];
  return (
    items.length === esperados.length &&
    items.every((it, i) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return o.code === esperados[i]?.code && (o.codigoGuia ?? null) === (esperados[i]?.codigoGuia ?? null);
    })
  );
}
