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
