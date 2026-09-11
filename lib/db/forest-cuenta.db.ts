import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import type { Concepto, MovimientoCuenta, MovimientoInput, TipoMov } from "@/lib/forestal/cuenta-corriente";

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

type Row = Prisma.ForestCuentaMovGetPayload<Record<string, never>>;

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

  invalidar(tenantId: string): void {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-cuenta] no se pudo invalidar la caché", { error: String(err), tenantId });
    }
  },
};
