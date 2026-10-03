import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { auditCtpEsperando } from "@/lib/forestal/ctp-audit";
import { esChoqueDeLocks } from "@/lib/forestal/choque-de-locks";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { mismoConteo, planificarVaciado, type PlanVaciado, type SnapshotLibro } from "@/lib/forestal/ctp-purga-plan";
import type {
  AlcanceParcial,
  ConteoDelLibro,
  ConteoEsperado,
  ResumenVaciado,
  ScopeVaciado,
} from "@/lib/forestal/ctp-purga-tipos";

export type { ScopeVaciado, ConteoDelLibro, ResumenVaciado } from "@/lib/forestal/ctp-purga-tipos";

/**
 * Vaciar el Libro de Operaciones del CTP — entero o por alcances combinados.
 *
 * Es la operación más destructiva del módulo: borra el registro que acredita el
 * origen legal de la madera. Existe porque un libro cargado mal —una importación
 * de prueba, un archivo equivocado— deja el saldo inservible y rehacerlo fila
 * por fila no es viable. Pero se trata como lo que es.
 *
 * GUARDS, y ninguno es opcional:
 *
 * 1. **Los períodos cerrados no se tocan.** Un mes cerrado ya se presentó ante
 *    SERFOR. Si hay alguno sin reabrir, el vaciado se niega ENTERO y dice cuál
 *    (mirado DENTRO de la transacción y sin caché).
 *    Además, una corrida con el consumo congelado (mes cerrado y reabierto) no
 *    se borra por ningún alcance parcial: congelar es irreversible.
 * 2. **Un alcance parcial nunca rompe lo que deja vivo.** Qué cae y qué se
 *    salva lo decide `planificarVaciado()` (`lib/forestal/ctp-purga-plan.ts`,
 *    con la tabla de dependencias de los lotes) sobre una foto leída DENTRO de
 *    la transacción.
 * 3. **Todo o nada.** Todos los alcances elegidos van en UNA transacción
 *    `Serializable`, y cada escritura verifica que tocó EXACTAMENTE las filas
 *    del plan: si el libro cambió entre la foto y el borrado (alguien consumió,
 *    armó un lote), se deshace todo y se avisa. Antes de escribir, las cifras
 *    de la foto se comparan con las que la vista previa MOSTRÓ (el modal las
 *    manda): lo que la persona vio es lo que se borra.
 * 4. **Siempre se cuenta antes de borrar**, y el conteo se le muestra al
 *    operador. Un «¿seguro?» sin números no es una confirmación informada.
 * 5. **Queda auditado**, un asiento por alcance con sus conteos. Un libro que
 *    desaparece sin rastro es exactamente lo que un fiscalizador buscaría.
 *
 * ## Los alcances
 *
 * | Alcance | Qué borra | Qué NUNCA toca |
 * |---|---|---|
 * | `trozas_disponibles` | Trozas del patio: sin consumir, sin despachar, sin pedazos de retrozado, sin apartar en un lote de aserrío ni en un mixto | El ingreso (GTF) |
 * | `madera_disponible` | Corridas con madera declarada (`quantity > 0`) y nada encima | Corridas con despacho, reproceso, lote, piezas consumidas o consumo congelado |
 * | `consumo` | Todas las corridas sin nada encima (también las que no declararon madera) | Idem — se salta y CUENTA las que están tocadas |
 * | `lotes` | Lotes de aserrío, mixtos y comerciales (ver la tabla en `ctp-purga-plan.ts`) | La madera y la producción: las piezas vuelven al patio, las corridas sólo caen si además se eligió un alcance de producción |
 * | `todo` | El libro entero, lotes incluidos | — |
 *
 * ⛔ Lote de aserrío y comercial son cosas distintas con nombres parecidos:
 * `ForestLoteAserrio` (ADR-334) es la materia prima que entra a la sierra y
 * apunta a su corrida con un id SUELTO (sin FK, sin `Restrict` que frene);
 * `ForestProdLote` (ADR-136) agrupa producción terminada para venderla, y sus
 * miembros SÍ son `Restrict`. Esa confusión dejó un hueco hasta 2026-09-05.
 */

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Más holgada que la de una corrida: la foto y el borrado van en la misma
 * transacción. Y `Serializable`: en READ COMMITTED, sin `FOR UPDATE`, un
 * consumo o un `cerrar()` que confirmara entre la foto y el borrado quedaba
 * colgando de una corrida o un lote que ya no existe. Así Postgres aborta a
 * una de las dos (40001 → P2034) y el vaciado responde «el libro cambió».
 */
const TX_OPTS = { timeout: 30_000, maxWait: 10_000, isolationLevel: "Serializable" } as const;

/** Tope de ids por sentencia: Postgres acepta 32 767 parámetros y un libro grande los pasa. */
const TANDA = 5_000;

/** El libro cambió entre la foto y el borrado: se deshace todo. */
class LibroCambioError extends Error {}

const PARCIALES: readonly AlcanceParcial[] = ["trozas_disponibles", "madera_disponible", "consumo", "lotes"];
const esParcial = (a: ScopeVaciado): a is AlcanceParcial => (PARCIALES as readonly string[]).includes(a);

const NOMBRE_ALCANCE: Record<AlcanceParcial, string> = {
  trozas_disponibles: "Trozas que están en el patio",
  madera_disponible: "Madera aserrada que no salió",
  consumo: "Consumos (troza → producción)",
  lotes: "Lotes de aserrío y comerciales",
};

const s = (n: number, sing: string, plur = `${sing}s`) => `${n} ${n === 1 ? sing : plur}`;

/** La foto del libro que necesita el plan. Sólo trozas si es lo único que se pidió. */
async function leerSnapshot(
  db: Db,
  tenantId: string,
  alcances: readonly AlcanceParcial[],
): Promise<SnapshotLibro> {
  const trozasQ = db.woodEntryTroza.findMany({
    where: { tenantId },
    select: {
      id: true,
      consumidaEnId: true,
      despachadaEnId: true,
      loteAserrioId: true,
      loteMixtoId: true,
      trozaOrigenId: true,
    },
  });
  const vacio: Omit<SnapshotLibro, "trozas"> = {
    corridas: [],
    despachoOrigenes: [],
    reprocesos: [],
    loteMiembros: [],
    consumos: [],
    lotesAserrio: [],
    lotesMixtos: [],
    lotesComerciales: [],
  };
  if (alcances.every((a) => a === "trozas_disponibles")) return { ...vacio, trozas: await trozasQ };

  const conLotes = alcances.includes("lotes");
  const [corridas, trozas, despachoOrigenes, reprocesos, loteMiembros, consumos, lotesAserrio, lotesMixtos, lotesComerciales] =
    await Promise.all([
      db.forestCtpEntry.findMany({
        where: { tenantId },
        select: { id: true, section: true, status: true, deletedAt: true, quantity: true, lineNo: true, gtfNumber: true },
      }),
      trozasQ,
      db.forestCtpDespachoOrigen.findMany({
        where: { tenantId },
        select: { despachoEntryId: true, produccionEntryId: true },
      }),
      db.forestCtpReproceso.findMany({ where: { tenantId }, select: { origenEntryId: true, destinoEntryId: true } }),
      db.forestProdLoteMiembro.findMany({ where: { tenantId }, select: { loteId: true, produccionEntryId: true } }),
      db.forestCtpConsumo.findMany({ where: { tenantId }, select: { ctpEntryId: true, congeladoAt: true } }),
      /* Sólo los vivos protegen y sólo los vivos se borran: uno dado de baja
         ya soltó sus piezas (`softDelete`). */
      db.forestLoteAserrio.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, code: true, status: true, produccionEntryId: true, loteMixtoId: true },
      }),
      conLotes
        ? db.forestLoteMixto.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, code: true, status: true } })
        : Promise.resolve([] as { id: string; code: string; status: string }[]),
      conLotes
        ? db.forestProdLote.findMany({
            where: { tenantId, deletedAt: null },
            select: { id: true, loteCode: true, status: true },
          })
        : Promise.resolve([] as { id: string; loteCode: string; status: string }[]),
    ]);

  return {
    corridas: corridas.map((c) => ({
      id: c.id,
      section: c.section,
      status: c.status,
      borrada: c.deletedAt != null,
      quantity: Number(c.quantity ?? 0),
      lineNo: c.lineNo,
      gtfNumber: c.gtfNumber,
    })),
    trozas,
    despachoOrigenes,
    reprocesos,
    loteMiembros,
    consumos: consumos.map((c) => ({ ctpEntryId: c.ctpEntryId, congelado: c.congeladoAt != null })),
    lotesAserrio,
    lotesMixtos,
    lotesComerciales: lotesComerciales.map((l) => ({ id: l.id, code: l.loteCode, status: l.status })),
  };
}

/** Corre `fn` por tandas de ids y suma lo que tocó. */
async function porTandas(ids: string[], fn: (tanda: string[]) => Promise<{ count: number }>): Promise<number> {
  let n = 0;
  for (let i = 0; i < ids.length; i += TANDA) n += (await fn(ids.slice(i, i + TANDA))).count;
  return n;
}

/**
 * Escribe el plan. Cada sentencia lleva en el WHERE la condición que la hizo
 * candidata (condición en el WHERE, no un `if` antes) y tiene que tocar
 * EXACTAMENTE las filas del plan; si no, `LibroCambioError` y la transacción
 * entera se deshace.
 */
async function aplicarPlan(tx: Prisma.TransactionClient, tenantId: string, plan: PlanVaciado): Promise<number> {
  const exacto = async (que: string, ids: string[], fn: (tanda: string[]) => Promise<{ count: number }>, esperado = ids.length) => {
    if (ids.length === 0) return;
    const n = await porTandas(ids, fn);
    if (n !== esperado) {
      throw new LibroCambioError(
        `El libro cambió mientras se vaciaba (${que}: ${n} de ${esperado}). No se borró nada: vuelve a abrir el vaciado para ver los números de ahora.`,
      );
    }
  };

  /* 1. Las piezas que vuelven al patio, ANTES de borrar sus corridas y lotes:
        las FK son `SetNull` y después ya no se sabría cuáles eran — quedaría
        `fechaConsumo` puesta en una pieza «consumida por nadie». */
  await exacto("piezas que vuelven al patio", plan.soltarConsumo, (ids) =>
    tx.woodEntryTroza.updateMany({
      where: { tenantId, id: { in: ids }, consumidaEnId: { not: null } },
      data: { consumidaEnId: null, fechaConsumo: null },
    }),
  );
  await exacto("piezas de los lotes", plan.soltarDeLote, (ids) =>
    tx.woodEntryTroza.updateMany({
      where: { tenantId, id: { in: ids }, loteAserrioId: { in: plan.lotesAserrioABorrar } },
      data: { loteAserrioId: null },
    }),
  );
  await exacto("piezas de los lotes mixtos", plan.soltarDeMixto, (ids) =>
    tx.woodEntryTroza.updateMany({
      where: { tenantId, id: { in: ids }, loteMixtoId: { in: plan.lotesMixtosABorrar } },
      data: { loteMixtoId: null, reservadaMixtoEn: null },
    }),
  );

  /* 2. Trozas del patio. */
  await exacto("trozas del patio", plan.trozasABorrar, (ids) =>
    tx.woodEntryTroza.deleteMany({
      where: {
        tenantId,
        id: { in: ids },
        consumidaEnId: null,
        despachadaEnId: null,
        loteAserrioId: null,
        loteMixtoId: null,
        retrozos: { none: {} },
      },
    }),
  );

  /* 3. Lotes comerciales: primero los miembros (`Restrict` contra la corrida). */
  await exacto(
    "miembros de lotes comerciales",
    plan.lotesComercialesABorrar,
    (ids) => tx.forestProdLoteMiembro.deleteMany({ where: { tenantId, loteId: { in: ids } } }),
    plan.miembrosABorrar,
  );
  await exacto("lotes comerciales", plan.lotesComercialesABorrar, (ids) =>
    tx.forestProdLote.deleteMany({
      where: { tenantId, id: { in: ids }, deletedAt: null, status: { not: "despachado" } },
    }),
  );

  /* 4. Corridas con sus consumos. Los cargos de aserrío (ADR-412) no cuelgan
        por FK: se dan de baja DESPUÉS del borrado y en la misma transacción —
        si un cobro tenía la corrida bloqueada, el borrado esperó a que
        confirmara y recién ahora se ve su cargo. */
  let cargosDeBaja = 0;
  if (plan.corridasABorrar.length > 0) {
    await exacto(
      "consumos",
      plan.corridasABorrar,
      (ids) => tx.forestCtpConsumo.deleteMany({ where: { tenantId, ctpEntryId: { in: ids }, congeladoAt: null } }),
      plan.consumosABorrar,
    );
    await exacto("corridas", plan.corridasABorrar, (ids) =>
      tx.forestCtpEntry.deleteMany({
        where: { tenantId, id: { in: ids }, section: "produccion", status: "registrado", deletedAt: null },
      }),
    );
    cargosDeBaja = await porTandas(plan.corridasABorrar, (ids) =>
      tx.forestCuentaMov.updateMany({
        where: { tenantId, ctpEntryId: { in: ids }, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
    );
  }

  /* 5. Lotes de aserrío: sus respuestas de campos personalizados (ADR-427)
        cuelgan por id suelto, así que se van con ellos. */
  if (plan.lotesAserrioABorrar.length > 0) {
    await porTandas(plan.lotesAserrioABorrar, (ids) =>
      tx.campoPersonalizadoValor.deleteMany({ where: { tenantId, registroId: { in: ids } } }),
    );
  }
  await exacto("lotes de aserrío", plan.lotesAserrioABorrar, (ids) =>
    tx.forestLoteAserrio.deleteMany({ where: { tenantId, id: { in: ids }, deletedAt: null } }),
  );

  /* 6. Mixtos, después de sus hijos (la FK del hijo es `SetNull`). */
  await exacto("lotes mixtos", plan.lotesMixtosABorrar, (ids) =>
    tx.forestLoteMixto.deleteMany({ where: { tenantId, id: { in: ids }, deletedAt: null } }),
  );

  return cargosDeBaja;
}

function resumenDelPlan(alcances: AlcanceParcial[], plan: PlanVaciado): ResumenVaciado {
  return { alcances, conteo: plan.conteo, porAlcance: plan.porAlcance, lotesBloqueados: plan.lotesBloqueados };
}

/**
 * Asienta y ESPERA. El vaciado no se deshace, y su rastro no puede quedar
 * corriendo después de responder (en Vercel lo que sigue tras la respuesta
 * puede no terminar). Si aun así falla, el libro ya se vació: se loguea como
 * error —nunca en silencio— y se responde igual.
 */
async function asentar(params: Parameters<typeof auditCtpEsperando>[0]): Promise<void> {
  try {
    await auditCtpEsperando(params);
  } catch (e) {
    logger.error("[forest-ctp-purga] el libro se vació pero el asiento de auditoría no quedó escrito", {
      error: String(e),
      tenantId: params.tenantId,
      action: params.action,
      user: params.user,
    });
  }
}

/** Un asiento por alcance, con sus números. */
async function auditarParcial(
  tenantId: string,
  usuario: string,
  alcances: AlcanceParcial[],
  plan: PlanVaciado,
  codigos: { aserrio: string[]; mixtos: string[]; comerciales: string[] },
  cargosDeBaja: number,
): Promise<void> {
  const pa = plan.porAlcance;
  const juntos = alcances.length > 1 ? ` (vaciado combinado: ${alcances.map((a) => `«${NOMBRE_ALCANCE[a]}»`).join(" + ")})` : "";
  const lista = (xs: string[]) => (xs.length > 30 ? `${xs.slice(0, 30).join(", ")} y ${xs.length - 30} más` : xs.join(", "));
  const detalle: Record<AlcanceParcial, () => string> = {
    trozas_disponibles: () =>
      `${s(pa.trozas_disponibles?.trozas ?? 0, "pieza")} del patio sin consumir, despachar ni apartar. Los ingresos (GTF) quedaron intactos.`,
    madera_disponible: () =>
      `${s(pa.madera_disponible?.corridas ?? 0, "corrida")} con madera declarada, ${s(pa.madera_disponible?.consumos ?? 0, "consumo atribuido", "consumos atribuidos")}.` +
      (alcances.includes("consumo") ? " Están incluidas en el asiento de Consumos." : ""),
    consumo: () =>
      `${s(pa.consumo?.corridas ?? 0, "corrida")} de producción, ${s(pa.consumo?.consumos ?? 0, "consumo atribuido", "consumos atribuidos")}` +
      `${pa.consumo?.deLotes ? ` (${pa.consumo.deLotes} sólo porque su lote también se borró)` : ""}. ` +
      `${s(plan.conteo.saltadas ?? 0, "corrida se salvó", "corridas se salvaron")} por tener despacho, reproceso, lote, piezas o consumo congelado encima. ` +
      `${s(cargosDeBaja, "cargo de aserrío dado", "cargos de aserrío dados")} de baja en la cuenta corriente.`,
    lotes: () =>
      `${s(codigos.aserrio.length, "lote de aserrío", "lotes de aserrío")}${codigos.aserrio.length ? ` (${lista(codigos.aserrio)})` : ""}, ` +
      `${s(codigos.mixtos.length, "lote mixto", "lotes mixtos")}${codigos.mixtos.length ? ` (${lista(codigos.mixtos)})` : ""}, ` +
      `${s(codigos.comerciales.length, "lote comercial", "lotes comerciales")}${codigos.comerciales.length ? ` (${lista(codigos.comerciales)})` : ""}. ` +
      `${s(plan.conteo.trozasAlPatio, "troza volvió", "trozas volvieron")} al patio (no se borró madera). ` +
      (plan.lotesBloqueados.length
        ? `No se borraron ${plan.lotesBloqueados.length}: ${lista(plan.lotesBloqueados.map((b) => `${b.codigo} (${b.motivo})`))}`
        : "Ninguno quedó bloqueado."),
  };
  await Promise.all(
    alcances.map((a) =>
      asentar({
        tenantId,
        action: "ctp_libro_purga_parcial",
        entity: "ForestCtpLibro",
        entityId: tenantId,
        detail: `VACIÓ «${NOMBRE_ALCANCE[a]}»${juntos}: ${detalle[a]()}`,
        user: usuario,
      }),
    ),
  );
}

function invalidarTodo(tenantId: string) {
  for (const p of ["forest-ctp", "wood-entries", "forest-lote", "forestal:lote-aserrio", "forestal:lote-mixto"]) {
    try {
      invalidateByPrefix(`${p}:${tenantId}`);
    } catch (e) {
      logger.error("[forest-ctp-purga] no se pudo invalidar el caché", { error: String(e), prefijo: p });
    }
  }
}

/** Lo que hay en el libro entero, contado con `db` (el global para la vista
 *  previa; el de la transacción para el borrado). Los lotes, sólo los vivos:
 *  son los que el operador reconoce como suyos. */
async function contarTodo(db: Db, tenantId: string): Promise<ResumenVaciado> {
  const [ingresos, trozas, entradas, consumos, origenes, lotesAserrio, lotesMixtos, lotesComerciales] = await Promise.all([
    db.woodEntry.count({ where: { tenantId } }),
    db.woodEntryTroza.count({ where: { tenantId } }),
    db.forestCtpEntry.groupBy({ by: ["section"], where: { tenantId }, _count: true }),
    db.forestCtpConsumo.count({ where: { tenantId } }),
    db.forestCtpDespachoOrigen.count({ where: { tenantId } }),
    db.forestLoteAserrio.count({ where: { tenantId, deletedAt: null } }),
    db.forestLoteMixto.count({ where: { tenantId, deletedAt: null } }),
    db.forestProdLote.count({ where: { tenantId, deletedAt: null } }),
  ]);
  const porSeccion = (sec: string) => entradas.find((e) => e.section === sec)?._count ?? 0;
  const produccion = porSeccion("produccion");
  const despachos = porSeccion("despacho");
  const lotes = lotesAserrio + lotesMixtos + lotesComerciales;
  const conteo: ConteoDelLibro = {
    ingresos,
    trozas,
    produccion,
    despachos,
    consumos,
    origenes,
    lotes,
    trozasAlPatio: 0,
    /* Los REGISTROS del libro, no las filas puente: es el número que el
       operador reconoce como «lo que cargué». */
    total: ingresos + produccion + despachos + lotes,
  };
  return {
    alcances: ["todo"],
    conteo,
    porAlcance: { todo: { ingresos, trozas, produccion, despachos, consumos, origenes, lotes } },
    lotesBloqueados: [],
  };
}

export type ResultadoVaciado =
  | { ok: true; resumen: ResumenVaciado }
  | { ok: false; codigo: "periodo_cerrado" | "libro_cambio"; motivo: string; periodos: string[] };

type FalloVaciado = Extract<ResultadoVaciado, { ok: false }>;

/** Lo que ve la persona cuando el libro ya no es el que revisó. */
export const MENSAJE_LIBRO_CAMBIO = "El libro cambió desde que lo revisaste: vuelve a mirar qué se borra.";

/** Un mes cerrado sin reabrir, visto DENTRO de la transacción: se deshace todo. */
class PeriodoCerradoError extends Error {
  constructor(readonly periodos: string[]) {
    super(
      `Hay ${s(periodos.length, "período cerrado", "períodos cerrados")} (${periodos.join(", ")}). ` +
        `Un mes cerrado ya se presentó ante SERFOR: reábrelo primero si de verdad hay que borrarlo.`,
    );
  }
}

/** Los cierres que bloquean, leídos con `db` y sin caché. Un cierre reabierto
 *  sigue en el historial pero ya no bloquea: reabrirlo fue una decisión
 *  explícita, con su motivo y su rastro. */
async function periodosQueBloqueanEn(tenantId: string, db: Db): Promise<string[]> {
  const cierres = await ForestCtpCierreDB.listEn(tenantId, db);
  return cierres.filter((c) => !c.reabierto).map((c) => c.label || c.periodKey);
}

/**
 * Corre la transacción del vaciado (Serializable, ver `TX_OPTS`) y traduce sus
 * finales previstos: mes cerrado, el libro no es el que se miró, u otra
 * transacción que se cruzó (P2034 / 40001 / 40P01). En los tres no se borró nada.
 */
async function enTransaccion<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ ok: true; valor: T } | FalloVaciado> {
  try {
    return { ok: true, valor: await prisma.$transaction(fn, TX_OPTS) };
  } catch (e) {
    if (e instanceof PeriodoCerradoError) {
      return { ok: false, codigo: "periodo_cerrado", motivo: e.message, periodos: e.periodos };
    }
    if (e instanceof LibroCambioError) return { ok: false, codigo: "libro_cambio", motivo: e.message, periodos: [] };
    if (esChoqueDeLocks(e)) {
      logger.warn("[forest-ctp-purga] otra transacción se cruzó con el vaciado: no se borró nada", { error: String(e) });
      return { ok: false, codigo: "libro_cambio", motivo: MENSAJE_LIBRO_CAMBIO, periodos: [] };
    }
    throw e;
  }
}

/** Primer paso de las dos transacciones: un mes cerrado frena todo. */
async function frenarSiHayCierre(tenantId: string, tx: Prisma.TransactionClient): Promise<void> {
  const periodos = await periodosQueBloqueanEn(tenantId, tx);
  if (periodos.length > 0) throw new PeriodoCerradoError(periodos);
}

/** Segundo: el libro de ahora tiene que ser el que la persona miró. */
function frenarSiCambio(ahora: ConteoDelLibro, esperado: ConteoEsperado): void {
  if (!mismoConteo(ahora, esperado)) throw new LibroCambioError(MENSAJE_LIBRO_CAMBIO);
}

export class ForestCtpPurgaDB {
  /** Qué se borraría con los alcances elegidos, para mostrarlo ANTES de borrar. */
  static async contar(tenantId: string, alcances: readonly ScopeVaciado[]): Promise<ResumenVaciado> {
    if (!tenantId) throw new Error("tenantId is required");
    if (alcances.includes("todo")) return contarTodo(prisma, tenantId);
    const parciales = alcances.filter(esParcial);
    const plan = planificarVaciado(await leerSnapshot(prisma, tenantId, parciales), parciales);
    return resumenDelPlan(parciales, plan);
  }

  /** Los períodos cerrados que impiden vaciar (cualquier alcance). Vacío = se
   *  puede. Sin caché: es lo mismo que el borrado vuelve a mirar en su transacción. */
  static async periodosQueBloquean(tenantId: string): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return periodosQueBloqueanEn(tenantId, prisma);
  }

  /**
   * Vacía el libro — entero o por alcances combinados (la unión), todo en UNA
   * transacción Serializable. `esperado` son las cifras que la vista previa
   * mostró: se vuelven a contar adentro y, si no coinciden, no se borra nada.
   * Devuelve lo que se borró, alcance por alcance, y los lotes que no se
   * pudieron borrar con su motivo.
   */
  static async vaciar(
    tenantId: string,
    usuario: string,
    alcances: readonly ScopeVaciado[],
    esperado: ConteoEsperado,
  ): Promise<ResultadoVaciado> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!usuario.trim()) throw new Error("usuario vacío: el asiento tiene que decir quién vació el libro");
    if (alcances.length === 0) throw new Error("alcances vacío: el que llama valida antes");

    if (alcances.includes("todo")) return ForestCtpPurgaDB.vaciarTodo(tenantId, usuario, esperado);

    const parciales = alcances.filter(esParcial);
    const r = await enTransaccion(async (tx) => {
      await frenarSiHayCierre(tenantId, tx);
      const snap = await leerSnapshot(tx, tenantId, parciales);
      const plan = planificarVaciado(snap, parciales);
      frenarSiCambio(plan.conteo, esperado);
      const codigoDe = (lista: { id: string; code: string }[], ids: string[]) => {
        const m = new Map(lista.map((l) => [l.id, l.code]));
        return ids.map((id) => m.get(id) ?? id).sort();
      };
      const codigos = {
        aserrio: codigoDe(snap.lotesAserrio, plan.lotesAserrioABorrar),
        mixtos: codigoDe(snap.lotesMixtos, plan.lotesMixtosABorrar),
        comerciales: codigoDe(snap.lotesComerciales, plan.lotesComercialesABorrar),
      };
      const cargosDeBaja = await aplicarPlan(tx, tenantId, plan);
      return { plan, cargosDeBaja, codigos };
    });
    if (!r.ok) return r;

    const { plan, cargosDeBaja, codigos } = r.valor;
    invalidarTodo(tenantId);
    if (cargosDeBaja > 0) ForestCuentaDB.invalidar(tenantId);
    await auditarParcial(tenantId, usuario, parciales, plan, codigos, cargosDeBaja);
    return { ok: true, resumen: resumenDelPlan(parciales, plan) };
  }

  private static async vaciarTodo(tenantId: string, usuario: string, esperado: ConteoEsperado): Promise<ResultadoVaciado> {
    const r = await enTransaccion(async (tx) => {
      await frenarSiHayCierre(tenantId, tx);
      const contado = await contarTodo(tx, tenantId);
      frenarSiCambio(contado.conteo, esperado);

      /* Los cargos de aserrío (ADR-412) y las respuestas de campos de los lotes
         (ADR-427) no cuelgan por FK: se juntan los ids ANTES de borrar —después
         no queda a qué apuntar. */
      const [idsCorridas, idsLotes] = await Promise.all([
        tx.forestCtpEntry.findMany({ where: { tenantId }, select: { id: true } }),
        tx.forestLoteAserrio.findMany({ where: { tenantId }, select: { id: true } }),
      ]);
      /* Orden: primero lo que cuelga, después los padres. Los miembros de lotes
         comerciales son `Restrict` contra la corrida: sin borrarlos antes, el
         vaciado completo fallaba en cualquier libro con un lote comercial. */
      await tx.forestCtpDespachoOrigen.deleteMany({ where: { tenantId } });
      await tx.forestCtpConsumo.deleteMany({ where: { tenantId } });
      await tx.forestCtpReproceso.deleteMany({ where: { tenantId } });
      await tx.forestProdLoteMiembro.deleteMany({ where: { tenantId } });
      const comerciales = (await tx.forestProdLote.deleteMany({ where: { tenantId } })).count;
      await tx.forestCtpEntry.deleteMany({ where: { tenantId } });
      let cargosDeBaja = 0;
      if (idsCorridas.length > 0) {
        cargosDeBaja = await porTandas(
          idsCorridas.map((c) => c.id),
          (ids) =>
            tx.forestCuentaMov.updateMany({
              where: { tenantId, ctpEntryId: { in: ids }, deletedAt: null },
              data: { deletedAt: new Date() },
            }),
        );
      }
      /* Los retrozos primero: cuelgan de otra troza y borrar la madre antes
         dispararía la cascada sobre filas que ya no están. */
      await tx.woodEntryTroza.deleteMany({ where: { tenantId, trozaOrigenId: { not: null } } });
      await tx.woodEntryTroza.deleteMany({ where: { tenantId } });
      if (idsLotes.length > 0) {
        await porTandas(
          idsLotes.map((l) => l.id),
          (ids) => tx.campoPersonalizadoValor.deleteMany({ where: { tenantId, registroId: { in: ids } } }),
        );
      }
      const aserrio = (await tx.forestLoteAserrio.deleteMany({ where: { tenantId } })).count;
      const mixtos = (await tx.forestLoteMixto.deleteMany({ where: { tenantId } })).count;
      await tx.woodEntry.deleteMany({ where: { tenantId } });
      /* Lo que de verdad se borró, también los lotes ya dados de baja: la
         vista previa cuenta los vivos (los que el operador reconoce), pero el
         asiento tiene que decir todo lo que desapareció. */
      return { resumen: contado, cargosDeBaja, lotesBorrados: comerciales + aserrio + mixtos };
    });
    if (!r.ok) return r;

    const { resumen, cargosDeBaja, lotesBorrados } = r.valor;
    const borrado = resumen.conteo;
    const deBaja = Math.max(0, lotesBorrados - borrado.lotes);
    invalidarTodo(tenantId);
    if (cargosDeBaja > 0) ForestCuentaDB.invalidar(tenantId);
    await asentar({
      tenantId,
      action: "ctp_libro_purga",
      entity: "ForestCtpLibro",
      entityId: tenantId,
      detail:
        `VACIÓ EL LIBRO DE OPERACIONES COMPLETO: ${borrado.ingresos} ingresos, ${borrado.trozas} trozas, ` +
        `${borrado.produccion} corridas, ${borrado.despachos} despachos, ${borrado.consumos} consumos atribuidos, ` +
        `${borrado.origenes} orígenes de despacho, ${s(lotesBorrados, "lote", "lotes")} (aserrío, mixtos y comerciales` +
        `${deBaja > 0 ? `; ${s(deBaja, "ya dado de baja", "ya dados de baja")}` : ""}), ` +
        `${cargosDeBaja} cargo(s) de aserrío dado(s) de baja en la cuenta corriente.`,
      user: usuario,
    });
    return { ok: true, resumen };
  }
}
