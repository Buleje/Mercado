import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { auditCtpEsperando, m3 as fmtM3 } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import { motivoLegible } from "@/lib/forestal/motivo";
import {
  enProductosDisponibles,
  m3YPtDe,
  maderaDelLote,
  type CorridaParaMadera,
  type MaderaDelLote,
} from "@/lib/forestal/madera-del-lote";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { whereCorridaEnElPatio } from "./forest-ctp.db";
import { ForestCtpDespachoDB } from "./forest-ctp-despacho.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { saldosDeCorridas } from "./forest-ctp-saldo-corrida";

/**
 * «Ya se usó» POR LOTE (Brandon, 2026-10-02): elegir varios lotes y decir de una
 * vez que su madera aserrada salió sin guía —uso interno, merma— para que deje
 * de ofrecerse en Productos disponibles. Y la etiqueta de madera de cada lote.
 *
 * Es `ForestCtpDB.marcarUsado` en tanda, con su misma semántica (ver su
 * cabecera): una etiqueta de visibilidad sobre `usadoAt`, reversible, que NO
 * toca ningún saldo declarado — por eso tampoco lleva el guard de período
 * cerrado, sólo lo deja dicho en la auditoría.
 *
 * ── De qué corridas es un lote ────────────────────────────────────────────
 * POR ID, como `ForestLoteAserrioDB.list()`: la que lo cerró
 * (`produccionEntryId`) más las que se comieron alguna de sus trozas
 * (`consumidaEnId`). Nunca por el texto `materiaPrimaRef`: una corrida que
 * mezcló dos lotes lleva el código de uno solo.
 *
 * ── Qué se marca ──────────────────────────────────────────────────────────
 * Sólo lo que hoy aparece en Productos disponibles: el filtro es el mismo
 * (`whereCorridaEnElPatio` + saldo de `saldosDeCorridas` + paquetes en pila).
 * Una corrida APARTADA para alguien no se toca: primero se libera la reserva.
 */

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Una corrida del lote con lo que deciden la etiqueta y la marca. */
interface CorridaCargada extends CorridaParaMadera {
  lineNo: number;
  producto: string | null;
  entryDate: Date;
  /** Tiene una reserva viva (de la corrida o de alguno de sus paquetes, ADR-418). */
  apartada: boolean;
}

/**
 * Las corridas con producción declarada de esa lista, con su saldo y sus
 * salidas. Las que no pasan `whereCorridaEnElPatio` (anuladas, sin cantidad,
 * sin origen) no vuelven: para la madera del lote no existen.
 *
 * Dos tandas de consultas para cualquier cantidad de lotes: las corridas, su
 * saldo y sus despachos en paralelo; después, qué paquetes ya viajan en una
 * guía viva (se cruza por código, no hay FK).
 */
async function cargarCorridas(
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, CorridaCargada>> {
  const unicos = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, CorridaCargada>();
  if (unicos.length === 0) return out;
  const [filas, saldos, salidas] = await Promise.all([
    prisma.forestCtpEntry.findMany({
      where: { ...whereCorridaEnElPatio(tenantId, { incluirUsados: true }), id: { in: unicos } },
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        productType: true,
        unit: true,
        usadoAt: true,
        paquetes: { where: { deletedAt: null }, select: { codigo: true } },
        apartados: { where: { liberadoAt: null }, select: { id: true } },
      },
    }),
    saldosDeCorridas(prisma, tenantId, unicos),
    prisma.forestCtpDespachoOrigen.findMany({
      where: {
        tenantId,
        produccionEntryId: { in: unicos },
        despacho: { deletedAt: null, status: "registrado" },
      },
      select: { produccionEntryId: true, despacho: { select: { entryDate: true, gtfNumber: true } } },
    }),
  ]);
  const enGuia = await ForestCtpDespachoDB.codigosDespachados(
    tenantId,
    filas.flatMap((f) => f.paquetes.map((p) => p.codigo)),
  );
  const salidasDe = new Map<string, { fecha: string; gtf: string | null }[]>();
  for (const s of salidas) {
    const lista = salidasDe.get(s.produccionEntryId) ?? [];
    lista.push({ fecha: s.despacho.entryDate.toISOString(), gtf: s.despacho.gtfNumber });
    salidasDe.set(s.produccionEntryId, lista);
  }
  for (const f of filas) {
    const s = saldos.get(f.id);
    out.set(f.id, {
      id: f.id,
      lineNo: f.lineNo,
      producto: f.productType,
      entryDate: f.entryDate,
      fecha: f.entryDate.toISOString(),
      unidad: f.unit,
      /* El DÍA de Lima de la marca, a mediodía UTC como las fechas del libro (`entryDate` = T12:00Z):
         la etiqueta compara y formatea `salioEl` contra fechas date-only. */
      usadoAt: f.usadoAt ? `${limaDateKey(f.usadoAt)}T12:00:00.000Z` : null,
      producido: s?.producido ?? 0,
      despachado: s?.despachado ?? 0,
      reprocesado: s?.reprocesado ?? 0,
      disponible: s?.disponible ?? 0,
      paquetes: f.paquetes.length,
      paquetesEnPila: f.paquetes.filter((p) => !enGuia.has(p.codigo)).length,
      salidas: salidasDe.get(f.id) ?? [],
      apartada: f.apartados.length > 0,
    });
  }
  return out;
}

/**
 * La etiqueta de madera de varios lotes en una pasada (no N+1). La llama
 * `ForestLoteAserrioDB.list()` con los ids de corrida que ya juntó por lote.
 */
export async function maderaDeLotes(
  tenantId: string,
  corridasPorLote: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, MaderaDelLote>> {
  if (!tenantId) throw new Error("tenantId is required");
  const cargadas = await cargarCorridas(tenantId, [...corridasPorLote.values()].flat());
  const out = new Map<string, MaderaDelLote>();
  for (const [loteId, ids] of corridasPorLote) {
    const suyas = [...new Set(ids)]
      .map((id) => cargadas.get(id))
      .filter((c): c is CorridaCargada => Boolean(c));
    out.set(loteId, maderaDelLote(suyas));
  }
  return out;
}

export type MotivoLoteSaltado = "sin_produccion" | "sin_saldo" | "ya_marcado" | "apartado" | "no_existe";

export interface ResultadoUsadoLotes {
  dryRun: boolean;
  totalPt: number;
  totalM3: number;
  /** Las corridas que se marcaron (o desmarcaron); en `dryRun`, las que se marcarían. */
  marcadas: { corridaId: string; lineNo: number; loteCode: string; producto: string | null; m3: number; pt: number }[];
  /**
   * Lotes que no aportaron nada, con el porqué. `ya_marcado` = ya está como se
   * pide (marcado al marcar, disponible al desmarcar). `apartado` sale aunque el
   * lote haya marcado OTRAS corridas: la reservada quedó afuera y hay que decirlo.
   */
  saltados: { loteId: string; code: string; motivo: MotivoLoteSaltado }[];
  /** Corridas marcadas que también cargan madera de lotes NO elegidos: marcarlas los toca. */
  compartidas: { corridaId: string; lineNo: number; otrosLotes: string[] }[];
}

/** Marcar (o desmarcar) como «ya se usó» la madera disponible de varios lotes. */
export async function marcarUsadoDeLotes(
  tenantId: string,
  loteIds: readonly string[],
  input: { usado: boolean; motivo?: string; user: string; dryRun?: boolean },
): Promise<ResultadoUsadoLotes> {
  if (!tenantId) throw new Error("tenantId is required");
  const { usado, user } = input;
  const dryRun = input.dryRun === true;
  const motivo = (input.motivo ?? "").trim();
  /* Marcar y desmarcar lo piden (desmarcar devuelve madera a la venta: el
     fiscalizador pregunta por qué). El dryRun no: el modal pregunta primero
     «¿salió con guía?». */
  if (!dryRun && !motivoLegible(motivo)) {
    throw new CtpInvariantError(
      usado
        ? "Pon el motivo por el que se marca como usado."
        : "Pon el motivo por el que vuelve a Productos disponibles.",
      "MOTIVO_REQUERIDO",
    );
  }
  const pedidos = [...new Set(loteIds.map((s) => s.trim()).filter(Boolean))];

  const [lotes, trozas] = await Promise.all([
    prisma.forestLoteAserrio.findMany({
      where: { tenantId, id: { in: pedidos }, deletedAt: null },
      select: { id: true, code: true, produccionEntryId: true },
    }),
    prisma.woodEntryTroza.findMany({
      where: { tenantId, loteAserrioId: { in: pedidos }, consumidaEnId: { not: null } },
      select: { loteAserrioId: true, consumidaEnId: true },
      distinct: ["loteAserrioId", "consumidaEnId"],
    }),
  ]);
  const idsPorLote = new Map<string, string[]>(
    lotes.map((l) => [l.id, l.produccionEntryId ? [l.produccionEntryId] : []]),
  );
  for (const t of trozas) {
    if (t.loteAserrioId && t.consumidaEnId) idsPorLote.get(t.loteAserrioId)?.push(t.consumidaEnId);
  }
  const cargadas = await cargarCorridas(tenantId, [...idsPorLote.values()].flat());

  const saltados: ResultadoUsadoLotes["saltados"] = pedidos
    .filter((id) => !idsPorLote.has(id))
    .map((loteId) => ({ loteId, code: "", motivo: "no_existe" as const }));
  /** corridaId → la corrida y los códigos de los lotes elegidos que la llevan. */
  const elegidas = new Map<string, { c: CorridaCargada; lotes: string[] }>();
  const elegidasDe = new Map<string, string[]>();
  for (const l of lotes) {
    const suyas = [...new Set(idsPorLote.get(l.id) ?? [])]
      .map((id) => cargadas.get(id))
      .filter((c): c is CorridaCargada => Boolean(c));
    if (suyas.length === 0) {
      saltados.push({ loteId: l.id, code: l.code, motivo: "sin_produccion" });
      continue;
    }
    const tomadas: string[] = [];
    let apartadas = 0;
    let yaEstaban = 0;
    for (const c of suyas) {
      if (usado) {
        if (c.usadoAt) {
          yaEstaban += 1;
          continue;
        }
        if (!enProductosDisponibles(c)) continue;
        if (c.apartada) {
          apartadas += 1;
          continue;
        }
      } else if (!c.usadoAt) {
        yaEstaban += 1;
        continue;
      }
      tomadas.push(c.id);
      const e = elegidas.get(c.id);
      if (e) e.lotes.push(l.code);
      else elegidas.set(c.id, { c, lotes: [l.code] });
    }
    elegidasDe.set(l.id, tomadas);
    if (apartadas > 0) saltados.push({ loteId: l.id, code: l.code, motivo: "apartado" });
    else if (tomadas.length === 0) {
      saltados.push({ loteId: l.id, code: l.code, motivo: yaEstaban > 0 ? "ya_marcado" : "sin_saldo" });
    }
  }

  const ids = [...elegidas.keys()];
  const compartidas = await compartidasCon(tenantId, ids, new Set(lotes.map((l) => l.id)), elegidas);

  let hechas = new Set(ids);
  if (!dryRun && ids.length > 0) {
    const ahora = new Date();
    /* Dos o tres sentencias con `IN (…)` sea cual sea la tanda (no una por
       corrida): 200 lotes no se acercan al timeout de 5 s de la transacción. */
    hechas = await prisma.$transaction(async (tx) => {
      if (usado) {
        /* La condición va en el WHERE (carrera): otro pudo marcarla o
           apartarla entre la lectura y esto. Las que quedan con ESTA marca
           (misma hora, mismo usuario) son las que escribió esta llamada. */
        await tx.forestCtpEntry.updateMany({
          where: {
            tenantId,
            id: { in: ids },
            section: "produccion",
            deletedAt: null,
            status: "registrado",
            usadoAt: null,
            apartados: { none: { liberadoAt: null } },
          },
          data: { usadoAt: ahora, usadoPor: user, usadoMotivo: motivo },
        });
        const mias = await tx.forestCtpEntry.findMany({
          where: { tenantId, id: { in: ids }, usadoAt: ahora, usadoPor: user },
          select: { id: true },
        });
        return new Set(mias.map((m) => m.id));
      }
      const marcadas = await tx.forestCtpEntry.findMany({
        where: { tenantId, id: { in: ids }, section: "produccion", usadoAt: { not: null } },
        select: { id: true },
      });
      const aSoltar = marcadas.map((m) => m.id);
      if (aSoltar.length > 0) {
        await tx.forestCtpEntry.updateMany({
          where: { tenantId, id: { in: aSoltar }, usadoAt: { not: null } },
          data: { usadoAt: null, usadoPor: null, usadoMotivo: null },
        });
      }
      return new Set(aSoltar);
    });
    /* Un lote que eligió corridas y no escribió ninguna perdió la carrera: ya
       estaban como se pedía cuando llegó la escritura. */
    for (const l of lotes) {
      const suyas = elegidasDe.get(l.id) ?? [];
      if (suyas.length > 0 && !suyas.some((id) => hechas.has(id))) {
        saltados.push({ loteId: l.id, code: l.code, motivo: "ya_marcado" });
      }
    }
    await auditarMarcas(tenantId, [...hechas].map((id) => elegidas.get(id)!), { usado, motivo, user });
    for (const prefijo of ["forest-ctp", "forestal:lote-aserrio"]) {
      try {
        invalidateByPrefix(`${prefijo}:${tenantId}`);
      } catch (err) {
        logger.warn("[ctp-usado-lotes] no se pudo invalidar el caché", { prefijo, error: String(err) });
      }
    }
  }

  const marcadas = ids
    .filter((id) => hechas.has(id))
    .map((id) => {
      const { c, lotes: codigos } = elegidas.get(id)!;
      const { m3, pt } = m3YPtDe(c.disponible, c.unidad);
      return { corridaId: id, lineNo: c.lineNo, loteCode: codigos.join(" · "), producto: c.producto, m3: r4(m3), pt: r2(pt) };
    });
  return {
    dryRun,
    totalM3: r4(marcadas.reduce((a, m) => a + m.m3, 0)),
    totalPt: r2(marcadas.reduce((a, m) => a + m.pt, 0)),
    marcadas,
    saltados,
    compartidas: compartidas.filter((x) => hechas.has(x.corridaId)),
  };
}

/** Las corridas elegidas que también cargan madera de lotes que NO se eligieron. */
async function compartidasCon(
  tenantId: string,
  ids: readonly string[],
  elegidos: ReadonlySet<string>,
  elegidas: ReadonlyMap<string, { c: CorridaCargada }>,
): Promise<ResultadoUsadoLotes["compartidas"]> {
  if (ids.length === 0) return [];
  const fuera = [...elegidos];
  const [trozas, cerrados] = await Promise.all([
    prisma.woodEntryTroza.findMany({
      where: { tenantId, consumidaEnId: { in: [...ids] }, loteAserrioId: { not: null, notIn: fuera } },
      select: { consumidaEnId: true, loteAserrio: { select: { code: true, deletedAt: true } } },
      distinct: ["consumidaEnId", "loteAserrioId"],
    }),
    prisma.forestLoteAserrio.findMany({
      where: { tenantId, deletedAt: null, produccionEntryId: { in: [...ids] }, id: { notIn: fuera } },
      select: { code: true, produccionEntryId: true },
    }),
  ]);
  const otros = new Map<string, Set<string>>();
  const sumar = (corridaId: string | null, code: string | undefined) => {
    if (!corridaId || !code) return;
    const s = otros.get(corridaId) ?? new Set<string>();
    s.add(code);
    otros.set(corridaId, s);
  };
  for (const t of trozas) if (t.loteAserrio && t.loteAserrio.deletedAt == null) sumar(t.consumidaEnId, t.loteAserrio.code);
  for (const l of cerrados) sumar(l.produccionEntryId, l.code);
  return [...otros].map(([corridaId, codes]) => ({
    corridaId,
    lineNo: elegidas.get(corridaId)?.c.lineNo ?? 0,
    otrosLotes: [...codes].sort(),
  }));
}

/**
 * Un renglón por corrida, esperado: la tanda puede tocar decenas y lo que
 * sigue corriendo después de responder en Vercel puede no terminar. El rótulo
 * es «Salió sin guía · uso interno / merma», nunca «despachado»: despachar
 * sin GTF no existe en el CTP.
 */
async function auditarMarcas(
  tenantId: string,
  filas: readonly { c: CorridaCargada; lotes: string[] }[],
  op: { usado: boolean; motivo: string; user: string },
): Promise<void> {
  if (filas.length === 0) return;
  const cierres = await ForestCtpCierreDB.list(tenantId);
  /* En tandas: 200 lotes pueden ser cientos de corridas, y cientos de escrituras
     a la vez agotan el pool del pooler (cada una espera su conexión). */
  for (let i = 0; i < filas.length; i += TANDA_AUDITORIA) {
    await auditarTanda(tenantId, filas.slice(i, i + TANDA_AUDITORIA), op, cierres);
  }
}

const TANDA_AUDITORIA = 20;

async function auditarTanda(
  tenantId: string,
  filas: readonly { c: CorridaCargada; lotes: string[] }[],
  op: { usado: boolean; motivo: string; user: string },
  cierres: Awaited<ReturnType<typeof ForestCtpCierreDB.list>>,
): Promise<void> {
  await Promise.all(
    filas.map(({ c, lotes }) => {
      const cerrado = closedPeriodOf(cierres, c.entryDate);
      const deLote = `lote ${lotes.join(", ")}`;
      const cantidad = fmtM3(m3YPtDe(c.disponible, c.unidad).m3);
      return auditCtpEsperando({
        tenantId,
        action: op.usado ? "ctp_linea_marcar_usado" : "ctp_linea_desmarcar_usado",
        entity: "ForestCtpEntry",
        entityId: c.id,
        detail:
          (op.usado
            ? `Salió sin guía · uso interno / merma: la corrida N° ${c.lineNo} (${deLote}) sale de Productos disponibles con ${cantidad} · motivo: ${op.motivo}`
            : `Volvió a disponibles · motivo: ${op.motivo} — desmarcó «Salió sin guía · uso interno / merma» de la corrida N° ${c.lineNo} (${deLote}): ${cantidad} vuelve a Productos disponibles`) +
          (cerrado
            ? ` · la línea está fechada en ${cerrado.label}, período CERRADO (la marca no altera el acta: ningún saldo declarado lee este campo)`
            : ""),
        user: op.user,
      });
    }),
  );
}
