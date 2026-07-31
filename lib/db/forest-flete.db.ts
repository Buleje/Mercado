import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { normalizarPlaca } from "@/lib/forestal/directorio";
import type { EstadoPago, Flete, FleteInput, Pagador, TipoFlete } from "@/lib/forestal/fletes";

/**
 * ForestFleteDB — los viajes que traen la madera y se llevan el producto (ADR-318).
 *
 * `tenantId` 1er parámetro, escritura auditada, caché invalidada tras el write.
 *
 * ## Snapshots a propósito
 *
 * La placa y el nombre del transportista se copian en la fila del flete además
 * de guardar el id. No es denormalización perezosa: **un viaje ocurrió**. Si
 * mañana el camión se da de baja o la empresa cambia de razón social, el viaje
 * de marzo siguió siendo el de la placa que decía la guía. El id sirve para
 * agrupar; el snapshot, para que lo agrupado no mienta.
 */

const CACHE_PREFIX = "forest-flete";

type FleteRow = Prisma.ForestFleteGetPayload<Record<string, never>>;

const vacioANull = (v: string | undefined | null): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/** `YYYY-MM-DD` → Date en UTC: las fechas date-only del módulo no llevan hora
 *  (evita el off-by-one de Lima documentado en el resto del libro). */
function fechaUtc(v: string | null | undefined): Date | null {
  const t = (v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return new Date(`${t}T00:00:00.000Z`);
}

function aFlete(r: FleteRow): Flete {
  return {
    id: r.id,
    fecha: r.fecha.toISOString(),
    tipo: r.tipo as TipoFlete,
    gtfNumber: r.gtfNumber,
    vehiculoId: r.vehiculoId,
    placa: r.placa,
    transportistaId: r.transportistaId,
    transportistaNombre: r.transportistaNombre,
    conductorId: r.conductorId,
    proveedorId: r.proveedorId,
    proveedorNombre: r.proveedorNombre,
    volumenM3: r.volumenM3 == null ? null : Number(r.volumenM3),
    monto: r.monto == null ? null : Number(r.monto),
    moneda: r.moneda ?? "PEN",
    pagaQuien: r.pagaQuien as Pagador,
    estadoPago: r.estadoPago as EstadoPago,
    fechaPago: r.fechaPago ? r.fechaPago.toISOString() : null,
    notas: r.notas,
  };
}

export const ForestFleteDB = {
  /**
   * Los viajes del período. `desde`/`hasta` en ISO; sin ellos devuelve los
   * últimos 500 — el libro se lleva por período, pero la deuda a un
   * transportista no entiende de meses.
   */
  async listar(
    tenantId: string,
    opts: { desde?: Date; hasta?: Date; estadoPago?: EstadoPago; gtfNumber?: string } = {},
  ): Promise<Flete[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestFlete.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(opts.desde || opts.hasta
          ? { fecha: { ...(opts.desde ? { gte: opts.desde } : {}), ...(opts.hasta ? { lte: opts.hasta } : {}) } }
          : {}),
        ...(opts.estadoPago ? { estadoPago: opts.estadoPago } : {}),
        ...(opts.gtfNumber ? { gtfNumber: opts.gtfNumber } : {}),
      },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    return rows.map(aFlete);
  },

  /** Alta o edición de un viaje. */
  async guardar(tenantId: string, input: FleteInput & { id?: string }, usuario: string): Promise<Flete> {
    if (!tenantId) throw new Error("tenantId is required");
    const fecha = fechaUtc(input.fecha);
    if (!fecha) throw new Error("La fecha del viaje es obligatoria (YYYY-MM-DD).");

    const pagado = input.estadoPago === "pagado";
    const datos = {
      fecha,
      tipo: input.tipo,
      gtfNumber: vacioANull(input.gtfNumber),
      vehiculoId: vacioANull(input.vehiculoId),
      // Normalizada como en el directorio: "b9x-777" y "B9X777" son el mismo
      // camión, y si acá entra cruda la agrupación por placa se parte en dos.
      placa: vacioANull(normalizarPlaca(input.placa ?? "")),
      transportistaId: vacioANull(input.transportistaId),
      transportistaNombre: vacioANull(input.transportistaNombre),
      conductorId: vacioANull(input.conductorId),
      proveedorId: vacioANull(input.proveedorId),
      proveedorNombre: vacioANull(input.proveedorNombre),
      volumenM3: input.volumenM3 == null ? null : new Prisma.Decimal(input.volumenM3),
      // Sin monto → null, NUNCA 0: un flete sin precio todavía no es gratis.
      monto: input.monto == null ? null : new Prisma.Decimal(input.monto),
      moneda: vacioANull(input.moneda) ?? "PEN",
      pagaQuien: input.pagaQuien,
      estadoPago: input.estadoPago,
      // Marcar pagado sin fecha deja la deuda saldada "algún día": se asume hoy.
      fechaPago: pagado ? (fechaUtc(input.fechaPago) ?? new Date()) : null,
      notas: vacioANull(input.notas),
    };

    const existente = input.id
      ? await prisma.forestFlete.findFirst({ where: { id: input.id, tenantId, deletedAt: null } })
      : null;

    const row = existente
      ? await prisma.forestFlete.update({ where: { id: existente.id }, data: datos })
      : await prisma.forestFlete.create({ data: { tenantId, ...datos, createdBy: usuario || "unknown" } });

    auditCtp({
      tenantId,
      action: existente ? "ctp_flete_update" : "ctp_flete_create",
      entity: "ForestFlete",
      entityId: row.id,
      detail:
        `${existente ? "Editó" : "Registró"} el flete del ${input.fecha}` +
        `${row.placa ? ` · placa ${row.placa}` : ""}` +
        `${row.monto == null ? " · sin monto" : ` · S/ ${Number(row.monto).toFixed(2)}`}` +
        `${row.gtfNumber ? ` · GTF ${row.gtfNumber}` : ""}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return aFlete(row);
  },

  /** Marca pagado/pendiente sin abrir el formulario entero. */
  async marcarPago(tenantId: string, id: string, estadoPago: EstadoPago, usuario: string): Promise<Flete | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestFlete.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return null;
    const actualizado = await prisma.forestFlete.update({
      where: { id },
      data: { estadoPago, fechaPago: estadoPago === "pagado" ? (row.fechaPago ?? new Date()) : null },
    });
    auditCtp({
      tenantId,
      action: "ctp_flete_pago",
      entity: "ForestFlete",
      entityId: id,
      detail: `Marcó el flete como ${estadoPago}${row.monto == null ? "" : ` (S/ ${Number(row.monto).toFixed(2)})`}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return aFlete(actualizado);
  },

  /** Baja lógica: un viaje anotado y después borrado sigue habiendo ocurrido. */
  async eliminar(tenantId: string, id: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestFlete.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return false;
    await prisma.forestFlete.update({ where: { id }, data: { deletedAt: new Date() } });
    auditCtp({
      tenantId,
      action: "ctp_flete_delete",
      entity: "ForestFlete",
      entityId: id,
      detail: `Borró el flete del ${row.fecha.toISOString().slice(0, 10)}${row.placa ? ` · placa ${row.placa}` : ""}`,
      user: usuario,
    });
    this.invalidar(tenantId);
    return true;
  },

  invalidar(tenantId: string): void {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-flete] no se pudo invalidar la caché", { error: String(err), tenantId });
    }
  },
};
