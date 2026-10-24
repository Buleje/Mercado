import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp, auditCtpEsperando } from "@/lib/forestal/ctp-audit";
import { normalizarCodigoContrato } from "@/lib/forestal/contratos";
import {
  gruposDelMixto,
  mixtoVivo,
  planDeReparto,
  prefijoLoteMixto,
  resumenDelMixto,
  siguienteCodigoLoteMixto,
  type EstadoLoteMixto,
  type LoteAbiertoParaReparto,
  type LoteDelReparto,
  type LoteMixto,
  type RechazoDeTroza,
  type RespuestaAnular,
  type RespuestaQuitar,
  type RespuestaReparto,
  type RespuestaReserva,
  type TrozaDelMixto,
} from "@/lib/forestal/lote-mixto";
import { CTP_TX_OPTS, CtpInvariantError } from "./forest-ctp-consumo.db";
import { ForestLoteAserrioDB, motivoNoElegible } from "./forest-lote-aserrio.db";

/**
 * LOTE MIXTO (ADR-441): la pila escaneada en Consumos, de varias especies y
 * permisos, guardada en el servidor para que varios equipos y días sumen a la
 * misma. Se termina REPARTIÉNDOLA en lotes de aserrío (uno por especie+permiso)
 * en una sola transacción; de ahí en adelante son lotes normales.
 *
 * ── Reglas ──────────────────────────────────────────────────────────────────
 * LM1 · Una troza está en UN mixto (`WoodEntryTroza.loteMixtoId`).
 * LM2 · En el mixto O en un lote de aserrío, nunca en los dos. Al repartir se
 *       mueve en la misma transacción: `loteAserrioId` = hijo, `loteMixtoId` = NULL.
 * LM3 · Apartar sigue las reglas de un lote (`motivoNoElegible`, la MISMA
 *       función que `agregarTrozas`) y bloquea las trozas `FOR UPDATE ORDER BY id`.
 * LM4 · Una troza apartada no entra a `agregarTrozas` ni a `consumirEnPatio`
 *       (vive en `forest-lote-aserrio.db.ts`).
 *
 * Apartar y repartir son movimientos del PATIO, como `agregarTrozas`: el cierre
 * de mes no los frena (no escriben el libro; la corrida sí, y ahí se mira).
 *
 * ── Locks (el orden importa para no abrazarse) ─────────────────────────────
 * mixto → trozas (ORDER BY id) → lotes destino (ORDER BY id). Apartar/quitar
 * toman el mixto `FOR SHARE` (dos tablets escaneando a la vez no se esperan
 * entre sí); repartir y anular `FOR UPDATE`, así ninguna troza entra a una pila
 * que se está repartiendo y queda apuntando a un mixto ya cerrado.
 */

const CACHE_PREFIX = "forestal:lote-mixto";
/** Lo que un movimiento del mixto deja viejo además de lo suyo. */
const PREFIJO_TROZAS = "wood-entries";
const PREFIJO_LOTES = "forestal:lote-aserrio";

const texto = (v: string | null | undefined) => v?.trim() || null;
const num = (v: unknown) => (v == null ? null : Number(v));
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que se lee de una troza para decidir si entra/sale y para pintarla. */
const SELECT_TROZA = {
  id: true,
  woodEntryId: true,
  codificacion: true,
  codigoPlanta: true,
  especieComun: true,
  especieCientifica: true,
  volumenM3: true,
  oxD1Pulg: true,
  oxD2Pulg: true,
  oxLargoPies: true,
  oxPt: true,
  loteMixtoId: true,
  reservadaMixtoEn: true,
  loteAserrioId: true,
  loteAserrio: { select: { code: true } },
  loteMixto: { select: { code: true, status: true, deletedAt: true } },
  // Lo que mira `motivoNoElegible` (L-A2 / T1), igual que `agregarTrozas`.
  consumidaEnId: true,
  noRecepcionada: true,
  descarte: true,
  fechaRecepcion: true,
  _count: { select: { retrozos: true } },
  despachadaEn: { select: { status: true, deletedAt: true } },
  entry: {
    select: {
      status: true,
      deletedAt: true,
      fechaRecepcion: true,
      gtfNumber: true,
      /* El permiso vive en el INGRESO, no en la troza: misma fuente que
         `TrozaConsumible.permiso` y que el filtro de ADR-393. */
      originCode: true,
    },
  },
} satisfies Prisma.WoodEntryTrozaSelect;

type FilaTroza = Prisma.WoodEntryTrozaGetPayload<{ select: typeof SELECT_TROZA }>;

/** El código que se ve en la chapa: el de planta; si no, el de la guía. */
const codigoDe = (t: { codigoPlanta: string | null; codificacion: string | null }) =>
  texto(t.codigoPlanta) ?? texto(t.codificacion);

/** La troza en la forma que entienden `gruposDeLaPila` y las tarjetas. */
function aTroza(t: FilaTroza): TrozaDelMixto {
  const vivo = mixtoVivo(t.loteMixto);
  return {
    id: t.id,
    woodEntryId: t.woodEntryId,
    codificacion: t.codificacion,
    codigoPlanta: t.codigoPlanta,
    especieComun: t.especieComun,
    especieCientifica: t.especieCientifica,
    volumenM3: num(t.volumenM3),
    permiso: texto(t.entry.originCode),
    gtfNumber: t.entry.gtfNumber,
    oxD1Pulg: num(t.oxD1Pulg),
    oxD2Pulg: num(t.oxD2Pulg),
    oxLargoPies: num(t.oxLargoPies),
    oxPt: num(t.oxPt),
    loteMixtoId: vivo ? t.loteMixtoId : null,
    loteMixtoCode: vivo ? (t.loteMixto?.code ?? null) : null,
    reservadaMixtoEn: t.reservadaMixtoEn ? t.reservadaMixtoEn.toISOString() : null,
  };
}

/**
 * Por qué esta pieza no puede estar en la pila (LM3). `null` = puede.
 * `loteMixto: null` a propósito: su propio mixto no es un impedimento — el de
 * OTRO mixto lo mira quien llama, con su propio texto (LM1).
 */
function motivoFueraDelMixto(t: FilaTroza): string | null {
  if (t.loteAserrioId) return `ya está en el lote ${t.loteAserrio?.code ?? "de aserrío"}`;
  const m = motivoNoElegible({ ...t, loteMixto: null });
  if (m) return m;
  if (!texto(t.especieComun)) return "no tiene especie: corrígela en su guía antes de apartarla";
  return null;
}

interface FilaMixto {
  id: string;
  code: string;
  status: string;
  notes: string | null;
}

/**
 * El correlativo LA de `crearEnTx` va bajo advisory lock, pero `create()` (el
 * alta de siempre, fuera de transacción) no lo toma: si los dos piden código a
 * la vez, el índice único parcial frena al segundo. Se reconoce por el NOMBRE
 * del índice (P2002 o P2010 según la vía) y vuelve como 422 legible — la
 * transacción ya se revirtió entera, así que reintentar es seguro.
 */
function traducirChoqueDeCodigo(e: unknown): unknown {
  if (e instanceof CtpInvariantError) return e;
  const huella = e instanceof Error ? `${e.message} ${JSON.stringify((e as { meta?: unknown }).meta ?? {})}` : "";
  if (!huella.includes("ForestLoteAserrio_tenantId_code_vivo_key") && !huella.includes("ForestLoteMixto_tenantId_code_vivo_key")) {
    return e;
  }
  return new CtpInvariantError(
    "Otro equipo abrió un lote al mismo tiempo y tomó el mismo código. No se repartió nada: vuelve a intentarlo.",
    "LOTE_CODIGO_DUPLICADO",
  );
}

function invalidar(tenantId: string, conLotes: boolean): void {
  for (const p of [CACHE_PREFIX, PREFIJO_TROZAS, ...(conLotes ? [PREFIJO_LOTES] : [])]) {
    try {
      invalidateByPrefix(`${p}:${tenantId}`);
    } catch (err) {
      /* El caché es un atajo: si no se pudo vaciar, la próxima lectura vence
         sola. Se loguea para que no sea un misterio. */
      logger.warn("[forestal.lote-mixto] no se pudo invalidar el caché", { prefijo: p, error: String(err) });
    }
  }
}

export class ForestLoteMixtoDB {
  /** Bloquea la fila del mixto (compartido para apartar, exclusivo para cerrarlo). */
  private static async bloquear(
    tx: Prisma.TransactionClient,
    tenantId: string,
    loteMixtoId: string,
    modo: "compartido" | "exclusivo",
  ): Promise<FilaMixto> {
    const filas =
      modo === "exclusivo"
        ? await tx.$queryRaw<FilaMixto[]>`
            SELECT "id", "code", "status", "notes" FROM "ForestLoteMixto"
            WHERE "id" = ${loteMixtoId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
            FOR UPDATE`
        : await tx.$queryRaw<FilaMixto[]>`
            SELECT "id", "code", "status", "notes" FROM "ForestLoteMixto"
            WHERE "id" = ${loteMixtoId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
            FOR SHARE`;
    const m = filas[0];
    if (!m) throw new CtpInvariantError("Ese lote mixto no existe.", "LOTE_NO_ENCONTRADO");
    return m;
  }

  private static exigirAbierto(m: FilaMixto, para: string): void {
    if (m.status === "abierto") return;
    throw new CtpInvariantError(
      m.status === "repartido"
        ? `El ${m.code} ya se repartió en lotes: no se puede ${para}. Abre un lote mixto nuevo.`
        : `El ${m.code} está ${m.status}: no se puede ${para}.`,
      "LOTE_NO_EDITABLE",
      { status: m.status },
    );
  }

  /**
   * Los mixtos del negocio con su pila, sus tarjetas por especie+permiso y los
   * lotes que salieron de cada uno. El abierto primero.
   */
  static async list(
    tenantId: string,
    opts: { status?: EstadoLoteMixto; id?: string; limite?: number } = {},
  ): Promise<LoteMixto[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestLoteMixto.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.id ? { id: opts.id } : {}),
      },
      orderBy: [{ status: "asc" }, { abiertoEn: "desc" }],
      take: Math.min(Math.max(opts.limite ?? 50, 1), 200),
      include: {
        /* En el orden en que se escanearon: la tarjeta de una especie no salta
           de lugar cada vez que entra otra pieza. */
        trozas: {
          where: { tenantId },
          select: SELECT_TROZA,
          orderBy: [{ reservadaMixtoEn: "asc" }, { id: "asc" }],
        },
        lotes: {
          where: { tenantId, deletedAt: null },
          orderBy: { code: "asc" },
          select: {
            id: true,
            code: true,
            speciesCommon: true,
            permiso: true,
            status: true,
            trozas: { select: { volumenM3: true } },
          },
        },
      },
    });

    return filas.map((m) => {
      const trozas = m.trozas.map(aTroza);
      /* La MISMA separación que hace `repartirEnTx`: lo que se muestra como
         tarjeta es lo que después sale como lote. */
      const fuera: RechazoDeTroza[] = [];
      const repartibles: TrozaDelMixto[] = [];
      m.trozas.forEach((t, i) => {
        const motivo = motivoFueraDelMixto(t);
        if (motivo) fuera.push({ id: t.id, codigo: codigoDe(t), motivo });
        else repartibles.push(trozas[i]);
      });
      const grupos = gruposDelMixto(repartibles);
      return {
        id: m.id,
        code: m.code,
        status: m.status as EstadoLoteMixto,
        notes: m.notes,
        contratoId: m.contratoId,
        abiertoEn: m.abiertoEn.toISOString(),
        repartidoEn: m.repartidoEn ? m.repartidoEn.toISOString() : null,
        createdBy: m.createdBy,
        trozaIds: trozas.map((t) => t.id),
        trozas,
        grupos,
        fuera,
        lotes: m.lotes.map((l) => ({
          id: l.id,
          code: l.code,
          speciesCommon: l.speciesCommon,
          permiso: l.permiso,
          status: l.status,
          piezas: l.trozas.length,
          volumenM3: Math.round(l.trozas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0) * 10000) / 10000,
        })),
        resumen: resumenDelMixto(repartibles, grupos),
      };
    });
  }

  /**
   * Abre el mixto — o devuelve el que ya está ABIERTO (`reusarAbierto`, el
   * default): dos tablets que tocan «Lote mixto» a la vez caen en la misma
   * pila y no en LM-001 y LM-002. Correlativo LM-AAAA-NNN bajo
   * `pg_advisory_xact_lock` por negocio (el índice único parcial del código
   * vivo es la red de abajo).
   */
  static async crear(
    tenantId: string,
    input: { notas?: string | null; contratoId?: string | null; createdBy: string; reusarAbierto?: boolean },
  ): Promise<{ mixto: LoteMixto; nuevo: boolean }> {
    if (!tenantId) throw new Error("tenantId is required");
    const reusar = input.reusarAbierto !== false;
    const r = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ctp-lote-mixto:${tenantId}`}))`;
      if (reusar) {
        const abierto = await tx.forestLoteMixto.findFirst({
          where: { tenantId, status: "abierto", deletedAt: null },
          orderBy: { abiertoEn: "desc" },
          select: { id: true, code: true },
        });
        if (abierto) return { id: abierto.id, code: abierto.code, nuevo: false };
      }
      /* El permiso de la banda es de ESTE negocio o no es nada: un id ajeno
         colgado del mixto sería una referencia cruzada entre tenants. */
      const contratoId = texto(input.contratoId);
      if (contratoId) {
        const existe = await tx.forestContrato.findFirst({
          where: { id: contratoId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!existe) throw new CtpInvariantError("Ese permiso no existe en este negocio.", "VALIDACION");
      }
      const anio = new Date().getFullYear();
      const previos = await tx.forestLoteMixto.findMany({
        where: { tenantId, code: { startsWith: prefijoLoteMixto(anio) } },
        select: { code: true },
      });
      const code = siguienteCodigoLoteMixto(
        previos.map((p) => p.code),
        anio,
      );
      const m = await tx.forestLoteMixto.create({
        data: {
          tenantId,
          code,
          notes: texto(input.notas)?.slice(0, 500) ?? null,
          contratoId,
          createdBy: input.createdBy,
        },
        select: { id: true, code: true },
      });
      return { id: m.id, code: m.code, nuevo: true };
    }, CTP_TX_OPTS);

    if (r.nuevo) {
      auditCtp({
        tenantId,
        action: "ctp_lote_mixto_create",
        entity: "ForestLoteMixto",
        entityId: r.id,
        detail: `Abrió el lote mixto ${r.code}`,
        user: input.createdBy,
      });
      invalidar(tenantId, false);
    }
    const [mixto] = await ForestLoteMixtoDB.list(tenantId, { id: r.id });
    if (!mixto) throw new CtpInvariantError("Ese lote mixto no existe.", "LOTE_NO_ENCONTRADO");
    return { mixto, nuevo: r.nuevo };
  }

  /**
   * Aparta trozas en el mixto (LM1/LM3). AGREGA, nunca reemplaza, y las que no
   * pueden entrar vuelven con su motivo en vez de tirar el pedido entero: de 30
   * lecturas, que 2 sean de una guía sin recibir no obliga a re-escanear.
   * Re-escanear una que ya está en ESTE mixto no es un error (`yaEstaban`).
   */
  static async reservar(
    tenantId: string,
    loteMixtoId: string,
    trozaIds: readonly string[],
    user: string,
  ): Promise<RespuestaReserva> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(trozaIds.map((s) => s.trim()).filter(Boolean))];
    if (ids.length === 0) return { agregadas: 0, yaEstaban: 0, rechazadas: [] };

    const r = await prisma.$transaction(async (tx) => {
      const mixto = await ForestLoteMixtoDB.bloquear(tx, tenantId, loteMixtoId, "compartido");
      ForestLoteMixtoDB.exigirAbierto(mixto, "apartarle trozas");

      /* LM3: el lock va sobre la TROZA, en orden. Dos tablets que escanean la
         misma pieza para dos mixtos se ordenan acá: la segunda la ve tomada. */
      await tx.$queryRaw`
        SELECT "id" FROM "WoodEntryTroza"
        WHERE "id" = ANY(${ids}::text[]) AND "tenantId" = ${tenantId}
        ORDER BY "id"
        FOR UPDATE
      `;
      const trozas = await tx.woodEntryTroza.findMany({
        where: { tenantId, id: { in: ids } },
        select: SELECT_TROZA,
      });

      const rechazadas: RechazoDeTroza[] = [];
      const aceptadas: string[] = [];
      let yaEstaban = 0;
      for (const t of trozas) {
        const codigo = codigoDe(t);
        if (t.loteMixtoId === loteMixtoId) {
          yaEstaban += 1;
          continue;
        }
        if (t.loteMixtoId && mixtoVivo(t.loteMixto)) {
          rechazadas.push({ id: t.id, codigo, motivo: `ya está en el lote mixto ${t.loteMixto!.code}` });
          continue;
        }
        const motivo = motivoFueraDelMixto(t);
        if (motivo) {
          rechazadas.push({ id: t.id, codigo, motivo });
          continue;
        }
        aceptadas.push(t.id);
      }
      /* La que el query no devolvió también se dice: un id de otro negocio o
         mal leído no puede desaparecer en silencio (mismo criterio que
         `agregarTrozas`). */
      const halladas = new Set(trozas.map((t) => t.id));
      for (const id of ids) {
        if (!halladas.has(id)) rechazadas.push({ id, codigo: null, motivo: "no existe en este centro" });
      }

      if (aceptadas.length > 0) {
        /* Bajo el lock, lo leído sigue siendo cierto; `loteAserrioId: null` en
           el WHERE es LM2 escrito en la base por si alguna vez deja de serlo. */
        const w = await tx.woodEntryTroza.updateMany({
          where: { tenantId, id: { in: aceptadas }, loteAserrioId: null },
          data: { loteMixtoId, reservadaMixtoEn: new Date() },
        });
        if (w.count !== aceptadas.length) {
          throw new CtpInvariantError(
            "Alguna troza cambió mientras se apartaba: vuelve a escanearla.",
            "LOTE_NO_EDITABLE",
          );
        }
      }
      return { code: mixto.code, agregadas: aceptadas.length, yaEstaban, rechazadas };
    }, CTP_TX_OPTS);

    if (r.agregadas > 0) {
      auditCtp({
        tenantId,
        action: "ctp_lote_mixto_trozas_add",
        entity: "ForestLoteMixto",
        entityId: loteMixtoId,
        detail:
          `Apartó ${plural(r.agregadas, "troza", "trozas")} en el lote mixto ${r.code}` +
          (r.rechazadas.length > 0 ? ` · ${r.rechazadas.length} no entraron` : ""),
        user,
      });
      invalidar(tenantId, false);
    }
    return { agregadas: r.agregadas, yaEstaban: r.yaEstaban, rechazadas: r.rechazadas };
  }

  /**
   * Saca trozas del mixto: vuelven libres al patio. Idempotente: sacar una que
   * ya no está en ESTE mixto no es un error (la cola sin señal puede repetir el
   * pedido); sólo se rechaza el id que no existe.
   */
  static async quitar(
    tenantId: string,
    loteMixtoId: string,
    trozaIds: readonly string[],
    user: string,
  ): Promise<RespuestaQuitar> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(trozaIds.map((s) => s.trim()).filter(Boolean))];
    if (ids.length === 0) return { quitadas: 0, rechazadas: [] };

    const r = await prisma.$transaction(async (tx) => {
      const mixto = await ForestLoteMixtoDB.bloquear(tx, tenantId, loteMixtoId, "compartido");
      ForestLoteMixtoDB.exigirAbierto(mixto, "sacarle trozas");
      const halladas = await tx.woodEntryTroza.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true },
      });
      const existen = new Set(halladas.map((t) => t.id));
      const w = await tx.woodEntryTroza.updateMany({
        where: { tenantId, id: { in: ids }, loteMixtoId },
        data: { loteMixtoId: null, reservadaMixtoEn: null },
      });
      return {
        code: mixto.code,
        quitadas: w.count,
        rechazadas: ids
          .filter((id) => !existen.has(id))
          .map((id) => ({ id, codigo: null, motivo: "no existe en este centro" })),
      };
    }, CTP_TX_OPTS);

    if (r.quitadas > 0) {
      auditCtp({
        tenantId,
        action: "ctp_lote_mixto_trozas_remove",
        entity: "ForestLoteMixto",
        entityId: loteMixtoId,
        detail: `Sacó ${plural(r.quitadas, "troza", "trozas")} del lote mixto ${r.code}: volvieron al patio`,
        user,
      });
      invalidar(tenantId, false);
    }
    return { quitadas: r.quitadas, rechazadas: r.rechazadas };
  }

  /**
   * REPARTE la pila dentro de una transacción ajena: un lote de aserrío por
   * especie+permiso (o suma a uno abierto que lo acepte, según `destinos`), las
   * trozas se mueven al hijo (LM2) y el mixto queda `repartido`.
   *
   * Todo o nada: cualquier error revierte la transacción y no queda ni un lote
   * creado ni una troza movida. No audita ni invalida — un renglón de algo que
   * después se revirtió mentiría —: eso lo hace quien confirma, con
   * `auditarReparto` tras el commit. Hoy el único es `repartir`; la tx ajena
   * existe para poder componer el reparto con otra escritura (la decisión 3:
   * repartir y vincular en un acto), pero ninguna función la compone todavía.
   *
   * Las piezas que ya no pueden ir a ningún lote (se consumieron o despacharon
   * por otro camino, su guía se anuló…) se sueltan del mixto y vuelven en
   * `excluidas`: no frenan el reparto de las demás.
   */
  static async repartirEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    loteMixtoId: string,
    opts: { destinos?: Readonly<Record<string, string>>; notas?: string | null },
    user: string,
  ): Promise<RespuestaReparto> {
    if (!tenantId) throw new Error("tenantId is required");
    const mixto = await ForestLoteMixtoDB.bloquear(tx, tenantId, loteMixtoId, "exclusivo");
    ForestLoteMixtoDB.exigirAbierto(mixto, "repartir de nuevo");

    /* Los lotes a los que se SUMA, bloqueados en orden y ANTES que las trozas
       (27-09): nadie los consume ni los cierra mientras reciben la madera, y el
       orden es el de `vincularCorrida` y el del acomodo desde el acta (lote →
       trozas). Al revés, repartir y «Acomodar trozas» sobre el mismo lote se
       abrazaban (40P01). */
    const destinos = opts.destinos ?? {};
    const idsDestino = [...new Set(Object.values(destinos))];
    if (idsDestino.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLoteAserrio"
        WHERE "id" = ANY(${idsDestino}::text[]) AND "tenantId" = ${tenantId}
        ORDER BY "id"
        FOR UPDATE
      `;
    }

    await tx.$queryRaw`
      SELECT "id" FROM "WoodEntryTroza"
      WHERE "tenantId" = ${tenantId} AND "loteMixtoId" = ${loteMixtoId}
      ORDER BY "id"
      FOR UPDATE
    `;
    const filas = await tx.woodEntryTroza.findMany({
      where: { tenantId, loteMixtoId },
      select: SELECT_TROZA,
      orderBy: [{ reservadaMixtoEn: "asc" }, { id: "asc" }],
    });

    const excluidas: RechazoDeTroza[] = [];
    const pila: TrozaDelMixto[] = [];
    for (const t of filas) {
      const motivo = motivoFueraDelMixto(t);
      if (motivo) excluidas.push({ id: t.id, codigo: codigoDe(t), motivo });
      else pila.push(aTroza(t));
    }
    if (pila.length === 0) {
      throw new CtpInvariantError(
        excluidas.length > 0
          ? `Ninguna troza del ${mixto.code} puede ir a un lote: ${excluidas
              .slice(0, 3)
              .map((e) => `${e.codigo ?? e.id} ${e.motivo}`)
              .join(" · ")}.`
          : `El ${mixto.code} no tiene trozas que repartir: escanea la pila primero.`,
        "LOTE_NO_EDITABLE",
        excluidas.length > 0 ? { excluidas } : undefined,
      );
    }

    /* Los lotes a los que se suma (ya bloqueados arriba). */
    let abiertos: LoteAbiertoParaReparto[] = [];
    if (idsDestino.length > 0) {
      const lotes = await tx.forestLoteAserrio.findMany({
        where: { tenantId, id: { in: idsDestino }, deletedAt: null },
        select: {
          id: true,
          code: true,
          speciesCommon: true,
          permiso: true,
          status: true,
          trozas: { select: { entry: { select: { originCode: true } } } },
        },
      });
      abiertos = lotes.map((l) => ({
        id: l.id,
        code: l.code,
        speciesCommon: l.speciesCommon,
        permiso: l.permiso,
        status: l.status,
        trozas: l.trozas.map((t) => ({ permiso: t.entry.originCode })),
      }));
    }

    /* La MISMA función que arma la vista previa en la pantalla. */
    const plan = planDeReparto(pila, abiertos, destinos);
    if (!plan.ok) throw new CtpInvariantError(plan.error, "VALIDACION");

    /* El contrato de cada permiso (ADR-421), resuelto con `tx` y de una vez:
       mismo criterio que `ForestContratoDB.idPorCodigo` (código normalizado,
       vivo, el primero). */
    const permisos = [
      ...new Set(
        plan.pasos
          .filter((p) => p.destino.tipo === "nuevo" && p.grupo.permiso)
          .map((p) => normalizarCodigoContrato(p.grupo.permiso!)),
      ),
    ].filter(Boolean);
    const contratos = permisos.length
      ? await tx.forestContrato.findMany({
          where: { tenantId, deletedAt: null, codigoNorm: { in: permisos } },
          select: { id: true, codigoNorm: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const contratoDe = new Map<string, string>();
    for (const c of contratos) if (!contratoDe.has(c.codigoNorm)) contratoDe.set(c.codigoNorm, c.id);

    const notasLote = [`Del lote mixto ${mixto.code}`, texto(opts.notas)].filter(Boolean).join(" · ").slice(0, 500);
    const lotes: LoteDelReparto[] = [];
    for (const { grupo, destino } of plan.pasos) {
      let loteId: string;
      let code: string;
      if (destino.tipo === "nuevo") {
        const lote = await ForestLoteAserrioDB.crearEnTx(tx, tenantId, {
          speciesCommon: grupo.especie,
          speciesScientific: grupo.especieCientifica,
          permiso: grupo.permiso,
          notes: notasLote,
          contratoId: grupo.permiso ? (contratoDe.get(normalizarCodigoContrato(grupo.permiso)) ?? null) : null,
          createdBy: user,
          loteMixtoId,
        });
        loteId = lote.id;
        code = lote.code;
      } else {
        loteId = destino.loteId;
        code = destino.code;
      }
      const ids = grupo.trozas.map((t) => t.id);
      /* LM2 en un solo UPDATE: sale del mixto y entra al hijo a la vez. */
      const w = await tx.woodEntryTroza.updateMany({
        where: { tenantId, id: { in: ids }, loteMixtoId, loteAserrioId: null },
        data: { loteAserrioId: loteId, loteMixtoId: null, reservadaMixtoEn: null },
      });
      if (w.count !== ids.length) {
        throw new CtpInvariantError(
          `Las trozas de ${grupo.especie} cambiaron mientras se repartía el ${mixto.code}: vuelve a intentarlo.`,
          "LOTE_NO_EDITABLE",
        );
      }
      lotes.push({
        clave: grupo.clave,
        loteId,
        code,
        nuevo: destino.tipo === "nuevo",
        especie: grupo.especie,
        permiso: grupo.permiso,
        piezas: grupo.piezas,
        m3: grupo.m3,
      });
    }

    if (excluidas.length > 0) {
      await tx.woodEntryTroza.updateMany({
        where: { tenantId, loteMixtoId, id: { in: excluidas.map((e) => e.id) } },
        data: { loteMixtoId: null, reservadaMixtoEn: null },
      });
    }
    await tx.forestLoteMixto.update({
      where: { id: loteMixtoId, tenantId },
      data: {
        status: "repartido",
        repartidoEn: new Date(),
        ...(texto(opts.notas)
          ? { notes: [texto(mixto.notes), texto(opts.notas)].filter(Boolean).join(" · ").slice(0, 500) }
          : {}),
      },
    });
    return { loteMixtoId, code: mixto.code, lotes, excluidas };
  }

  /**
   * Los renglones de un reparto ya confirmado: uno del mixto y uno por lote
   * nuevo, y la caché. Los renglones se ESPERAN (`auditCtpEsperando`), en serie
   * para que el libro los lea en orden: en Vercel lo que sigue corriendo
   * después de responder puede no terminar, y un lote que nace sin su renglón
   * es madera que cambió de pila sin nombre. Nunca tiran: el reparto ya está
   * escrito.
   */
  static async auditarReparto(tenantId: string, r: RespuestaReparto, user: string): Promise<void> {
    /* La caché primero: mientras se escriben los renglones, las otras
       pantallas ya tienen que ver los lotes nuevos. */
    invalidar(tenantId, true);
    const nuevos = r.lotes.filter((l) => l.nuevo);
    await auditCtpEsperando({
      tenantId,
      action: "ctp_lote_mixto_repartir",
      entity: "ForestLoteMixto",
      entityId: r.loteMixtoId,
      detail:
        `Repartió el lote mixto ${r.code} en ${plural(r.lotes.length, "lote", "lotes")}: ` +
        r.lotes
          .map((l) => `${l.code} ${l.especie}${l.permiso ? ` (${l.permiso})` : ""} · ${plural(l.piezas, "troza", "trozas")} · ${l.m3} m³${l.nuevo ? "" : " (sumadas)"}`)
          .join("; ") +
        (r.excluidas.length > 0 ? ` · ${r.excluidas.length} troza(s) ya no podían ir a un lote y volvieron al patio` : ""),
      user,
    });
    for (const l of nuevos) {
      await auditCtpEsperando({
        tenantId,
        action: "ctp_lote_aserrio_create",
        entity: "ForestLoteAserrio",
        entityId: l.loteId,
        detail: `Abrió el lote de aserrío ${l.code} · ${l.especie} al repartir el lote mixto ${r.code}`,
        user,
      });
    }
  }

  /** Reparte en su propia transacción, audita y avisa al caché. */
  static async repartir(
    tenantId: string,
    loteMixtoId: string,
    opts: { destinos?: Readonly<Record<string, string>>; notas?: string | null },
    user: string,
  ): Promise<RespuestaReparto> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma
      .$transaction((tx) => ForestLoteMixtoDB.repartirEnTx(tx, tenantId, loteMixtoId, opts, user), CTP_TX_OPTS)
      .catch((e: unknown) => {
        throw traducirChoqueDeCodigo(e);
      });
    await ForestLoteMixtoDB.auditarReparto(tenantId, r, user);
    return r;
  }

  /**
   * Deshace un mixto ABIERTO: sus trozas vuelven libres al patio y el mixto
   * queda `anulado` con su motivo (no se borra: el código no se recicla). Uno
   * repartido no se anula: sus lotes hijos se deshacen uno por uno en Lotes.
   */
  static async anular(
    tenantId: string,
    loteMixtoId: string,
    motivo: string,
    user: string,
  ): Promise<RespuestaAnular> {
    if (!tenantId) throw new Error("tenantId is required");
    const porque = motivo.trim();
    if (porque.length < 3) {
      throw new CtpInvariantError("Pon el motivo por el que se anula el lote mixto.", "VALIDACION");
    }
    const r = await prisma.$transaction(async (tx) => {
      const mixto = await ForestLoteMixtoDB.bloquear(tx, tenantId, loteMixtoId, "exclusivo");
      if (mixto.status === "repartido") {
        throw new CtpInvariantError(
          `El ${mixto.code} ya se repartió en lotes: deshaz esos lotes en la pestaña Lotes.`,
          "LOTE_NO_EDITABLE",
          { status: mixto.status },
        );
      }
      ForestLoteMixtoDB.exigirAbierto(mixto, "anularlo de nuevo");
      const w = await tx.woodEntryTroza.updateMany({
        where: { tenantId, loteMixtoId },
        data: { loteMixtoId: null, reservadaMixtoEn: null },
      });
      await tx.forestLoteMixto.update({
        where: { id: loteMixtoId, tenantId },
        data: {
          status: "anulado",
          notes: [texto(mixto.notes), `Anulado: ${porque}`].filter(Boolean).join(" · ").slice(0, 500),
        },
      });
      return { code: mixto.code, liberadas: w.count };
    }, CTP_TX_OPTS);

    auditCtp({
      tenantId,
      action: "ctp_lote_mixto_anular",
      entity: "ForestLoteMixto",
      entityId: loteMixtoId,
      detail: `Anuló el lote mixto ${r.code}: ${plural(r.liberadas, "troza volvió", "trozas volvieron")} al patio · motivo: ${porque}`,
      user,
    });
    invalidar(tenantId, false);
    return r;
  }
}
