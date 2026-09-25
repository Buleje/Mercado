import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import type { Concepto, MovimientoCuenta, MovimientoInput, TipoMov } from "@/lib/forestal/cuenta-corriente";
import {
  cargoSeCorrigeDesdeLaCorrida,
  lineNoDeReferencia,
  mensajeCargoDeCorrida,
} from "@/lib/forestal/aserrio-cobro";
import { RELACIONES_PARTE, type RelacionParte, type SaldoConsolidado } from "@/lib/forestal/vinculos-parte";
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

type Row = Prisma.ForestCuentaMovGetPayload<Record<string, never>>;

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
    input: MovimientoInput & { liquidacionId: string },
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

  invalidar(tenantId: string): void {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-cuenta] no se pudo invalidar la caché", { error: String(err), tenantId });
    }
  },
};
