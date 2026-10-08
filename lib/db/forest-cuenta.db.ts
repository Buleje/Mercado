import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { claveCacheResultado } from "@/lib/finance/resultado-del-negocio";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import type { Concepto, MovimientoCuenta, MovimientoInput, TipoMov } from "@/lib/forestal/cuenta-corriente";
import {
  cargoSeCorrigeDesdeLaCorrida,
  lineNoDeReferencia,
  mensajeCargoDeCorrida,
} from "@/lib/forestal/aserrio-cobro";
import { RELACIONES_PARTE, type RelacionParte, type SaldoConsolidado } from "@/lib/forestal/vinculos-parte";
import { claveCandadoGtf } from "@/lib/forestal/gtf-talonario";
import { exigirParteDelTenant } from "./forest-parte-tarifa.db";

/**
 * ForestCuentaDB — la cuenta corriente con las partes del directorio (ADR-322).
 *
 * Guarda MOVIMIENTOS, nunca un saldo: el saldo se deriva sumando (ver
 * `cuenta-corriente.ts`). Un saldo almacenado se desincroniza con la primera
 * corrección y deja dos verdades sobre la misma plata.
 *
 * `tenantId` 1er parámetro; todo write auditado — es dinero con un tercero.
 */

const CACHE_PREFIX = "forest-cuenta";

/** Se intentó cargar dos veces el mismo flete. */
/** La guía ya está anotada en la cuenta: anotarla de nuevo duplicaría la deuda. */
export class GuiaYaAnotadaError extends Error {
  constructor(gtfNumber: string, parteNombre: string) {
    super(`La guía ${gtfNumber} ya está anotada en la cuenta de ${parteNombre}.`);
    this.name = "GuiaYaAnotadaError";
  }
}

export class FleteYaCargadoError extends Error {
  constructor(readonly fleteId: string) {
    super("Ese flete ya está cargado en una cuenta corriente. No se puede cobrar dos veces.");
    this.name = "FleteYaCargadoError";
  }
}

/**
 * El cargo nació de una corrida (aserrío por encargo, ADR-412): se corrige
 * desde la corrida. Editarlo acá dejaría a la corrida y a la cuenta contando
 * dos importes distintos por el mismo aserrío.
 */
export class CargoDeCorridaError extends Error {
  constructor(readonly ctpEntryId: string, lineNo: number | null) {
    super(mensajeCargoDeCorrida(lineNo));
    this.name = "CargoDeCorridaError";
  }
}

/**
 * El movimiento es una pata de una liquidación de cuenta (ADR-413): se corrige
 * anulando la liquidación. Editarlo suelto dejaría la otra libreta y el papel
 * firmado contando otra historia.
 */
export class MovimientoDeLiquidacionError extends Error {
  constructor(readonly codigo: string | null) {
    super(`Este movimiento es parte de la liquidación ${codigo ?? ""}: se corrige anulando esa liquidación.`.replace(/\s+/g, " "));
    this.name = "MovimientoDeLiquidacionError";
  }
}

/**
 * El abono es la madera de una guía de compra (ADR-437 §4): se corrige desde la
 * guía («¿Cuánto pagaste por esta guía?»). Editarlo acá dejaría a la guía
 * diciendo un costo y a la cuenta otro por la misma madera.
 */
export class MaderaDeGuiaError extends Error {
  constructor(readonly gtfNumber: string) {
    super(`Este abono es la madera de la guía ${gtfNumber}: se corrige desde la guía, en «¿Cuánto pagaste?».`);
    this.name = "MaderaDeGuiaError";
  }
}

/**
 * La guía ya tiene pagos imputados (ADR-437 §4/§6): darla de baja en la cuenta
 * o pasarla a otra persona dejaría esos pagos colgando de una deuda que ya no
 * existe. Se anula primero la liquidación que la pagó. → 409 `TIENE_PAGOS`.
 */
export class GuiaConPagosError extends Error {
  readonly code = "TIENE_PAGOS";
  constructor(
    readonly gtfNumber: string,
    readonly pagado: number,
  ) {
    super(
      `La guía ${gtfNumber} ya tiene S/ ${pagado.toFixed(2)} pagados: anula primero la liquidación que la pagó.`,
    );
    this.name = "GuiaConPagosError";
  }
}

type Row = Prisma.ForestCuentaMovGetPayload<Record<string, never>>;

/** Tira `MaderaDeGuiaError` si el movimiento es el abono de madera de una guía. */
function assertNoEsMaderaDeGuia(row: Pick<Row, "concepto" | "gtfNumber">): void {
  if (row.concepto === "madera" && row.gtfNumber) throw new MaderaDeGuiaError(row.gtfNumber);
}

/** Tira `MovimientoDeLiquidacionError` si el movimiento salió de una liquidación. */
async function assertNoEsDeLiquidacion(tenantId: string, row: Pick<Row, "liquidacionId" | "referencia">): Promise<void> {
  if (!row.liquidacionId) return;
  const liq = await prisma.liquidacionCuenta.findFirst({
    where: { id: row.liquidacionId, tenantId },
    select: { codigo: true },
  });
  throw new MovimientoDeLiquidacionError(liq?.codigo ?? row.referencia);
}

/** Tira `CargoDeCorridaError` si el movimiento es el cargo de una corrida viva. */
async function assertNoEsCargoDeCorrida(tenantId: string, row: Pick<Row, "ctpEntryId" | "referencia">): Promise<void> {
  if (!row.ctpEntryId) return;
  const corrida = await prisma.forestCtpEntry.findFirst({
    where: { id: row.ctpEntryId, tenantId },
    select: { lineNo: true, status: true, deletedAt: true },
  });
  if (!cargoSeCorrigeDesdeLaCorrida(row, corrida)) return;
  throw new CargoDeCorridaError(row.ctpEntryId, corrida?.lineNo ?? lineNoDeReferencia(row.referencia));
}

function aMov(r: Row): MovimientoCuenta {
  return {
    id: r.id,
    parteId: r.parteId,
    parteNombre: r.parteNombre,
    fecha: r.fecha.toISOString(),
    tipo: r.tipo as TipoMov,
    concepto: r.concepto as Concepto,
    monto: Number(r.monto),
    moneda: r.moneda ?? "PEN",
    referencia: r.referencia,
    fleteId: r.fleteId,
    notas: r.notas,
    ctpEntryId: r.ctpEntryId ?? null,
    liquidacionId: r.liquidacionId ?? null,
    gtfNumber: r.gtfNumber ?? null,
    contratoId: r.contratoId ?? null,
  };
}

/** `YYYY-MM-DD` → UTC: fecha date-only como el resto del libro. */
function fechaUtc(v: string): Date | null {
  const t = (v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return new Date(`${t}T00:00:00.000Z`);
}

export const ForestCuentaDB = {
  /**
   * Anota en la cuenta del cliente la venta de UNA guía de salida, y lo que se
   * cobró en el acto.
   *
   * Por qué acá y no como una venta del POS: la madera despachada **no es un
   * producto del catálogo** —su stock lo lleva el Libro CTP, pieza por pieza y
   * contra su GTF—. Crear un `Sale` descontaría un inventario que no existe y
   * dejaría la misma madera contada dos veces (el bug de `record()` que ya
   * pasó una vez). La guía ES la venta; lo que faltaba era la plata.
   *
   * Son hasta DOS movimientos, que es como se lee una cuenta corriente:
   *   · `cargo` concepto `venta` por el total de la guía → el cliente debe.
   *   · `abono` concepto `pago` por lo que entregó → lo que ya no debe.
   * Si pagó todo, los dos se anulan y el saldo queda en cero **mostrando las
   * dos patas**: un solo asiento por el neto escondería cuánto se vendió.
   *
   * **Idempotente por número de guía.** El operador toca «anotar», no ve
   * respuesta y vuelve a tocar: sin este guard la deuda se duplica. Se mira por
   * `referencia` —el campo que existe para eso— en vez de una columna nueva con
   * su migración; el número de guía es único en el talonario.
   */
  async anotarVentaDeGuia(
    tenantId: string,
    v: {
      parteId: string;
      parteNombre: string;
      fecha: string;
      gtfNumber: string;
      /** Lo que vale la guía entera. */
      total: number;
      /** Lo que entregó en el acto (0 = todo a cuenta). */
      cobrado?: number;
      notas?: string | null;
    },
    usuario: string,
  ): Promise<{ movimientos: MovimientoCuenta[]; saldoDeLaGuia: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = v.gtfNumber.trim();
    if (!gtf) throw new Error("La guía tiene que tener número para anotarse en la cuenta.");
    if (!(v.total > 0)) throw new Error("El total de la venta tiene que ser mayor a cero.");
    const cobrado = Math.max(0, Math.min(v.cobrado ?? 0, v.total));

    const ya = await prisma.forestCuentaMov.findFirst({
      where: { tenantId, deletedAt: null, concepto: "venta", referencia: gtf },
      select: { id: true, parteNombre: true },
    });
    if (ya) throw new GuiaYaAnotadaError(gtf, ya.parteNombre);

    const base = {
      parteId: v.parteId,
      parteNombre: v.parteNombre,
      fecha: v.fecha,
      referencia: gtf,
      moneda: "PEN",
    };
    const movimientos: MovimientoCuenta[] = [
      await this.guardar(
        tenantId,
        { ...base, tipo: "cargo", concepto: "venta", monto: v.total, notas: v.notas ?? `Guía ${gtf}` },
        usuario,
      ),
    ];
    if (cobrado > 0) {
      movimientos.push(
        await this.guardar(
          tenantId,
          { ...base, tipo: "abono", concepto: "pago", monto: cobrado, notas: `Cobrado de la guía ${gtf}` },
          usuario,
        ),
      );
    }
    return { movimientos, saldoDeLaGuia: Math.round((v.total - cobrado) * 100) / 100 };
  },

  /** Movimientos del tenant, o de una parte. Sin tope de fecha: una deuda no
   *  entiende de períodos y filtrarla por mes la haría desaparecer. */
  async listar(tenantId: string, opts: { parteId?: string } = {}): Promise<MovimientoCuenta[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCuentaMov.findMany({
      where: { tenantId, deletedAt: null, ...(opts.parteId ? { parteId: opts.parteId } : {}) },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });
    return rows.map(aMov);
  },

  async guardar(tenantId: string, input: MovimientoInput & { id?: string }, usuario: string): Promise<MovimientoCuenta> {
    if (!tenantId) throw new Error("tenantId is required");
    const fecha = fechaUtc(input.fecha);
    if (!fecha) throw new Error("La fecha del movimiento es obligatoria (YYYY-MM-DD).");

    const fleteId = input.fleteId?.trim() || null;
    if (fleteId) {
      // El unique de (tenant, fleteId) lo garantiza en la base; acá se chequea
      // para devolver 409 con un mensaje que el operador entienda.
      const ya = await prisma.forestCuentaMov.findFirst({
        where: { tenantId, fleteId, deletedAt: null, ...(input.id ? { id: { not: input.id } } : {}) },
      });
      if (ya) throw new FleteYaCargadoError(fleteId);
    }

    const datos = {
      parteId: input.parteId.trim(),
      parteNombre: input.parteNombre.trim(),
      fecha,
      tipo: input.tipo,
      concepto: input.concepto,
      monto: new Prisma.Decimal(input.monto),
      moneda: input.moneda?.trim() || "PEN",
      referencia: input.referencia?.trim() || null,
      fleteId,
      notas: input.notas?.trim() || null,
    };

    const existente = input.id
      ? await prisma.forestCuentaMov.findFirst({ where: { id: input.id, tenantId, deletedAt: null } })
      : null;
    if (existente) {
      assertNoEsMaderaDeGuia(existente);
      await assertNoEsCargoDeCorrida(tenantId, existente);
      await assertNoEsDeLiquidacion(tenantId, existente);
    }

    const row = existente
      ? await prisma.forestCuentaMov.update({ where: { id: existente.id }, data: datos })
      : await prisma.forestCuentaMov.create({ data: { tenantId, ...datos, createdBy: usuario || "unknown" } });

    auditCtp({
      tenantId,
      action: existente ? "ctp_cuenta_update" : "ctp_cuenta_create",
      entity: "ForestCuentaMov",
      entityId: row.id,
      detail: `${existente ? "Editó" : "Registró"} ${row.tipo} de S/ ${Number(row.monto).toFixed(2)} (${row.concepto}) en la cuenta de ${row.parteNombre}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return aMov(row);
  },

  /** Baja lógica: un movimiento de plata que se borra deja el saldo sin explicar. */
  async eliminar(tenantId: string, id: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestCuentaMov.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return false;
    assertNoEsMaderaDeGuia(row);
    await assertNoEsCargoDeCorrida(tenantId, row);
    await assertNoEsDeLiquidacion(tenantId, row);
    await prisma.forestCuentaMov.update({ where: { id }, data: { deletedAt: new Date() } });
    auditCtp({
      tenantId,
      action: "ctp_cuenta_delete",
      entity: "ForestCuentaMov",
      entityId: id,
      detail: `Borró el ${row.tipo} de S/ ${Number(row.monto).toFixed(2)} de la cuenta de ${row.parteNombre}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return true;
  },

  /**
   * El saldo de una parte y, al lado, el de cada parte vinculada a ella
   * (ADR-430). Sólo para mirar: nunca se mezclan las libretas — la deuda de
   * cada uno sigue en su cuenta y `total` es una suma a la vista, no un saldo.
   *
   * Sumado en la base (`groupBy`), sin el tope de 2000 filas de `listar`: un
   * saldo no puede salir de una lista cortada. Los vínculos con un PERMISO no
   * entran: un permiso no tiene cuenta, tiene balance (ADR-421).
   *
   * La parte se busca aunque esté dada de baja: puede tener plata viva, como
   * en «Cuenta por persona».
   *
   * Cuenta los vínculos en los DOS sentidos, igual que la lista de vínculos de
   * la ficha: si A anotó a B, la ficha de B muestra a A con su saldo.
   *
   * @throws ParteNoEncontradaError si la parte no es de este tenant.
   */
  async saldoConsolidado(tenantId: string, parteId: string): Promise<SaldoConsolidado> {
    await exigirParteDelTenant(tenantId, parteId);

    const vinculos = await prisma.forestParteVinculo.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ parteId, vinculadaParteId: { not: null } }, { vinculadaParteId: parteId }],
      },
      orderBy: { createdAt: "asc" },
      select: { parteId: true, vinculadaParteId: true, relacion: true },
      take: 200,
    });
    /* Una misma parte con dos vínculos (representa Y es tercero, o anotada
       desde los dos lados) se muestra UNA vez: sumarla dos veces inventaría
       deuda en el total. */
    const relacionDe = new Map<string, { relacion: RelacionParte; sentido: "sale" | "entra" }>();
    for (const v of vinculos) {
      const sale = v.parteId === parteId;
      const otra = sale ? v.vinculadaParteId : v.parteId;
      if (!otra || otra === parteId || relacionDe.has(otra)) continue;
      relacionDe.set(otra, {
        relacion: (RELACIONES_PARTE as readonly string[]).includes(v.relacion) ? (v.relacion as RelacionParte) : "otro",
        sentido: sale ? "sale" : "entra",
      });
    }
    const ids = [...relacionDe.keys()];

    const [nombres, sumas] = await Promise.all([
      ids.length
        ? prisma.forestParty.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nombre: true } })
        : Promise.resolve([]),
      prisma.forestCuentaMov.groupBy({
        by: ["parteId", "tipo"],
        where: { tenantId, deletedAt: null, parteId: { in: [parteId, ...ids] } },
        _sum: { monto: true },
      }),
    ]);

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const cuenta = new Map<string, { cargos: number; abonos: number }>();
    for (const g of sumas) {
      const c = cuenta.get(g.parteId) ?? { cargos: 0, abonos: 0 };
      if (g.tipo === "cargo") c.cargos += Number(g._sum.monto ?? 0);
      else c.abonos += Number(g._sum.monto ?? 0);
      cuenta.set(g.parteId, c);
    }
    const saldoDe = (id: string) => {
      const c = cuenta.get(id);
      return c ? r2(c.cargos - c.abonos) : 0;
    };

    const propia = cuenta.get(parteId) ?? { cargos: 0, abonos: 0 };
    const nombreDe = new Map(nombres.map((p) => [p.id, p.nombre]));
    const vinculados = ids.map((id) => ({
      parteId: id,
      nombre: nombreDe.get(id) ?? "Parte dada de baja",
      relacion: relacionDe.get(id)?.relacion ?? "otro",
      sentido: relacionDe.get(id)?.sentido ?? "sale",
      saldo: saldoDe(id),
    }));
    const propio = { cargos: r2(propia.cargos), abonos: r2(propia.abonos), saldo: saldoDe(parteId) };
    return { propio, vinculados, total: r2(propio.saldo + vinculados.reduce((t, v) => t + v.saldo, 0)) };
  },

  // ── Liquidación de cuentas (ADR-413): primitivas dentro de la tx de otro ──

  /**
   * Los movimientos vivos de una parte, SIN tope: el saldo de una liquidación
   * no puede salir de una lista cortada (el `take: 2000` de `listar`).
   */
  async movimientosDeParteEnTx(tx: Prisma.TransactionClient, tenantId: string, parteId: string): Promise<MovimientoCuenta[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await tx.forestCuentaMov.findMany({
      where: { tenantId, parteId, deletedAt: null },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(aMov);
  },

  /**
   * Los movimientos vivos de una parte, SIN tope, fuera de una transacción.
   * El estado de pago de una guía y el aviso «sin pagar» tienen que leer la
   * MISMA cuenta: con el `take: 2000` de `listar` una parte con mucha historia
   * daba otro estado en el modal que en la tira (revisión 2026-09-26).
   */
  async movimientosDeParte(tenantId: string, parteId: string): Promise<MovimientoCuenta[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCuentaMov.findMany({
      where: { tenantId, parteId, deletedAt: null },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(aMov);
  },

  // ── Locks de plata (ADR-437): guías primero, personas después ──

  /**
   * Advisory lock por GUÍA, en orden de número. Lo toman todos los que escriben
   * la plata de una guía (costo, marca de servicio, abono `madera`, precio en
   * tanda, mover un asiento de guía) y la liquidación que le imputa pagos.
   *
   * ORDEN FIJO en todo el sistema: primero las guías (ordenadas), después la
   * persona (`bloquearPartesEnTx`). Antes, el modal tomaba la guía y la
   * liquidación la persona, y ninguno esperaba al otro: una liquidación podía
   * validar «≤ pendiente» contra un abono que otro estaba cambiando.
   *
   * La clave es la forma canónica de la guía (`claveCandadoGtf`), nunca el
   * texto: `065`, `019-001-0000065` y `19-001-0000065` bloquean el MISMO
   * recurso, porque el freno de doble pago (`cubicacionQuePagoLaGuia`) los
   * trata como la misma guía. Devuelve las claves bloqueadas: para saber si una
   * guía quedó cubierta, comparar con `claveCandadoGtf(gtf)`, no con el texto.
   * Ninguna puerta arma la clave a mano: todas pasan por acá.
   */
  async bloquearGuiasEnTx(tx: Prisma.TransactionClient, tenantId: string, gtfNumbers: ReadonlyArray<string | null | undefined>): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const claves = [...new Set(gtfNumbers.map(claveCandadoGtf).filter((c): c is string => c != null))].sort();
    for (const clave of claves) {
      // `$executeRaw` con plantilla = parámetros ($1), nunca interpolación.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guia-plata:${tenantId}:${clave}`}))`;
    }
    return claves;
  },

  /**
   * Advisory lock por PERSONA de la cuenta forestal (la misma clave que usa la
   * liquidación, ADR-413), en orden de id. Siempre DESPUÉS de las guías.
   */
  async bloquearPartesEnTx(tx: Prisma.TransactionClient, tenantId: string, parteIds: ReadonlyArray<string | null | undefined>): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(parteIds.filter((p): p is string => Boolean(p)))].sort();
    for (const id of ids) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`liq:${tenantId}:parte:${id}`}))`;
    }
  },

  /** Saldo de una parte sumado en la base (cargos − abonos), sin tope de filas. */
  async saldoDeParteEnTx(tx: Prisma.TransactionClient, tenantId: string, parteId: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const grupos = await tx.forestCuentaMov.groupBy({
      by: ["tipo"],
      where: { tenantId, parteId, deletedAt: null },
      _sum: { monto: true },
    });
    let cargos = 0;
    let abonos = 0;
    for (const g of grupos) {
      const v = Number(g._sum.monto ?? 0);
      if (g.tipo === "cargo") cargos += v;
      else abonos += v;
    }
    return Math.round((cargos - abonos) * 100) / 100;
  },

  /**
   * Escribe una pata forestal de una liquidación. Sin auditoría suelta: la
   * liquidación deja UN renglón por acto (ADR-413), y cinco `ctp_cuenta_create`
   * por un solo momento frente a la persona esconderían el acto.
   */
  async crearDeLiquidacionEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    /* `gtfNumber` (ADR-437 §6): la pata imputada a una guía la nombra, así el
       estado de pago la aplica a ESA guía y no por antigüedad. */
    /* `contratoId` (ADR-449): la pata que baja cargos de un permiso lo lleva,
       así el balance del permiso ve lo cobrado. Sale de los movimientos de la
       misma parte leídos con `tenantId`. */
    input: MovimientoInput & { liquidacionId: string; gtfNumber?: string | null; contratoId?: string | null },
    usuario: string,
  ): Promise<MovimientoCuenta> {
    if (!tenantId) throw new Error("tenantId is required");
    const fecha = fechaUtc(input.fecha);
    if (!fecha) throw new Error("La fecha del movimiento es obligatoria (YYYY-MM-DD).");
    const row = await tx.forestCuentaMov.create({
      data: {
        tenantId,
        parteId: input.parteId.trim(),
        parteNombre: input.parteNombre.trim(),
        fecha,
        tipo: input.tipo,
        concepto: input.concepto,
        monto: new Prisma.Decimal(input.monto),
        moneda: input.moneda?.trim() || "PEN",
        referencia: input.referencia?.trim() || null,
        notas: input.notas?.trim() || null,
        liquidacionId: input.liquidacionId,
        gtfNumber: input.gtfNumber?.trim() || null,
        contratoId: input.contratoId?.trim() || null,
        createdBy: usuario || "unknown",
      },
    });
    return aMov(row);
  },

  /** Baja lógica de las patas forestales de una liquidación anulada. */
  async bajaDeLiquidacionEnTx(tx: Prisma.TransactionClient, tenantId: string, liquidacionId: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const { count } = await tx.forestCuentaMov.updateMany({
      where: { tenantId, liquidacionId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count;
  },

  // ── La madera de una guía de compra (ADR-437 §4): primitivas dentro de la tx de otro ──

  /**
   * Lo que ya se pagó imputado a una guía: los cargos vivos que la nombran
   * (`gtfNumber`), de la parte indicada o de cualquiera. Sumado en la base.
   */
  async pagosImputadosEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gtfNumber: string,
    parteId?: string,
  ): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const agg = await tx.forestCuentaMov.aggregate({
      where: { tenantId, gtfNumber, tipo: "cargo", deletedAt: null, ...(parteId ? { parteId } : {}) },
      _sum: { monto: true },
    });
    return Math.round(Number(agg._sum.monto ?? 0) * 100) / 100;
  },

  /**
   * UN abono `madera` por guía (índice único parcial
   * `ForestCuentaMov_tenantId_gtf_madera_vivo_key`). Si ya existe, se actualiza
   * monto, fecha y permiso; si cambia la persona y la guía ya tiene pagos
   * imputados a la anterior, `GuiaConPagosError` (esos pagos quedarían
   * colgando). Sin auditoría suelta: la escribe quien guarda la guía, una vez.
   */
  async upsertMaderaDeGuiaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: {
      gtfNumber: string;
      parteId: string;
      parteNombre: string;
      monto: number;
      /** Día de la guía (date-only, UTC). */
      fecha: Date;
      contratoId: string | null;
    },
    usuario: string,
  ): Promise<{ movimiento: MovimientoCuenta; antes: { parteId: string; monto: number } | null }> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = input.gtfNumber.trim();
    if (!gtf) throw new Error("La guía tiene que tener número para anotarse en la cuenta.");
    if (!(input.monto > 0)) throw new Error("La madera de la guía tiene que valer más de cero para anotarse.");
    const actual = await tx.forestCuentaMov.findFirst({
      where: { tenantId, gtfNumber: gtf, concepto: "madera", deletedAt: null },
    });
    if (actual && actual.parteId !== input.parteId) {
      const pagado = await this.pagosImputadosEnTx(tx, tenantId, gtf, actual.parteId);
      if (pagado > 0) throw new GuiaConPagosError(gtf, pagado);
    }
    const datos = {
      parteId: input.parteId,
      parteNombre: input.parteNombre.trim(),
      fecha: input.fecha,
      tipo: "abono",
      concepto: "madera",
      monto: new Prisma.Decimal(input.monto.toFixed(2)),
      moneda: "PEN",
      referencia: gtf,
      gtfNumber: gtf,
      contratoId: input.contratoId,
      notas: `Madera de la guía ${gtf}`,
    };
    const row = actual
      ? await tx.forestCuentaMov.update({ where: { id: actual.id }, data: datos })
      : await tx.forestCuentaMov.create({ data: { tenantId, ...datos, createdBy: usuario || "unknown" } });
    return {
      movimiento: aMov(row),
      antes: actual ? { parteId: actual.parteId, monto: Number(actual.monto) } : null,
    };
  },

  /**
   * Baja lógica del abono `madera` de una guía (anulada, rechazada, pasada a
   * servicio o sin anotar). Con `exigirSinPagos`, si la guía tiene pagos
   * imputados tira `GuiaConPagosError` y no toca nada. Devuelve cuántos bajó (0 o 1).
   */
  async bajaMaderaDeGuiaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gtfNumber: string,
    opts: { exigirSinPagos: boolean },
  ): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = gtfNumber.trim();
    if (!gtf) return 0;
    if (opts.exigirSinPagos) {
      const pagado = await this.pagosImputadosEnTx(tx, tenantId, gtf);
      if (pagado > 0) throw new GuiaConPagosError(gtf, pagado);
    }
    const { count } = await tx.forestCuentaMov.updateMany({
      where: { tenantId, gtfNumber: gtf, concepto: "madera", deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return count;
  },

  /**
   * Re-sincroniza el abono `madera` con lo que QUEDA vivo de la guía, después
   * de anular/rechazar/borrar uno de sus asientos, cambiarle el costo o
   * moverlo de guía: si quedan asientos con costo, el abono pasa a valer su
   * suma; si no queda ninguno, se da de baja. Sólo toca guías que YA estaban
   * anotadas. Devuelve lo que hizo.
   *
   * SÓLO SOLES (revisión 2026-09-26). La cuenta corriente es en soles y el
   * forestal no tiene tipo de cambio guardado en ningún lado: convertir un
   * costo en USD sería inventar la tasa y presentar un derivado como la deuda.
   * Un asiento con costo en otra moneda NO entra a la suma y se avisa en el log;
   * las puertas que escriben costo (`setCosto`) ya no dejan poner otra moneda
   * en una guía anotada, así que esto es la defensa del dato viejo.
   */
  async resincronizarMaderaDeGuiaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    gtfNumber: string,
  ): Promise<"sin_cuenta" | "actualizada" | "baja"> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = gtfNumber.trim();
    const mov = await tx.forestCuentaMov.findFirst({
      where: { tenantId, gtfNumber: gtf, concepto: "madera", deletedAt: null },
    });
    if (!mov) return "sin_cuenta";
    const vivos = {
      tenantId,
      gtfNumber: gtf,
      deletedAt: null,
      status: { notIn: ["anulado", "rechazado"] },
      maderaDeTercero: false,
      costoTotal: { not: null },
    } satisfies Prisma.WoodEntryWhereInput;
    const agg = await tx.woodEntry.aggregate({
      where: { ...vivos, OR: [{ moneda: "PEN" }, { moneda: null }] },
      _sum: { costoTotal: true },
    });
    const otraMoneda = await tx.woodEntry.count({
      where: { ...vivos, NOT: { OR: [{ moneda: "PEN" }, { moneda: null }] } },
    });
    if (otraMoneda > 0) {
      logger.warn("[forest-cuenta] asientos con costo en otra moneda fuera del abono de la guía", {
        tenantId,
        gtfNumber: gtf,
        asientos: otraMoneda,
      });
    }
    const suma = Math.round(Number(agg._sum.costoTotal ?? 0) * 100) / 100;
    if (suma > 0) {
      await tx.forestCuentaMov.update({ where: { id: mov.id }, data: { monto: new Prisma.Decimal(suma.toFixed(2)) } });
      return "actualizada";
    }
    await tx.forestCuentaMov.update({ where: { id: mov.id }, data: { deletedAt: new Date() } });
    return "baja";
  },

  invalidar(tenantId: string): void {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      /* El resultado y la caja del negocio (ADR-451) leen esta cuenta: el cobro
         de un aserrío, un pago o una liquidación los cambia. */
      invalidateByPrefix(`${claveCacheResultado(tenantId)}:`);
    } catch (err) {
      logger.error("[forest-cuenta] no se pudo invalidar la caché", { error: String(err), tenantId });
    }
  },
};
