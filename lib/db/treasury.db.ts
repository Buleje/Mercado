import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CuentaTipo = "BANCO_AHORRO" | "BANCO_CORRIENTE" | "CAJA_FISICA" | "MONEDERO_DIGITAL";
export type MovimientoTipo = "INGRESO" | "EGRESO" | "TRANSFERENCIA_IN" | "TRANSFERENCIA_OUT";
export type MovimientoOrigen = "MANUAL" | "VENTA" | "GASTO" | "PRESTAMO_DADO" | "PRESTAMO_CUOTA" | "COMPRA_PROVEEDOR" | "CIERRE_CAJA" | "TRANSFERENCIA" | "OTRO";

export type DbCuenta = {
  id: string;
  tenantId: string;
  nombre: string;
  tipo: CuentaTipo;
  banco: string | null;
  numeroCuenta: string | null;
  cci: string | null;
  moneda: string;
  saldo: number;
  saldoInicial: number;
  activa: boolean;
  color: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DbMovimiento = {
  id: string;
  tenantId: string;
  cuentaId: string;
  tipo: MovimientoTipo;
  origen: MovimientoOrigen;
  monto: number;
  saldoAnterior: number;
  saldoPosterior: number;
  descripcion: string;
  referencia: string | null;
  categoria: string | null;
  createdAt: string;
  cuentaNombre?: string;
};

export type DbTransferencia = {
  id: string;
  tenantId: string;
  origenId: string;
  destinoId: string;
  monto: number;
  descripcion: string;
  createdAt: string;
  origenNombre?: string;
  destinoNombre?: string;
};

export type CuentaCreateInput = {
  tenantId: string;
  nombre: string;
  tipo: CuentaTipo;
  banco?: string;
  numeroCuenta?: string;
  cci?: string;
  moneda?: string;
  saldoInicial?: number;
  color?: string;
  notas?: string;
};

export type CuentaUpdateInput = {
  nombre?: string;
  banco?: string;
  numeroCuenta?: string;
  cci?: string;
  color?: string;
  notas?: string;
  activa?: boolean;
};

export type MovimientoCreateInput = {
  tenantId: string;
  cuentaId: string;
  tipo: MovimientoTipo;
  origen?: MovimientoOrigen;
  monto: number;
  descripcion?: string;
  referencia?: string;
  categoria?: string;
};

export type TransferenciaCreateInput = {
  tenantId: string;
  origenId: string;
  destinoId: string;
  monto: number;
  descripcion?: string;
};

export type MovimientoListFilters = {
  cuentaId?: string;
  tipo?: MovimientoTipo;
  origen?: MovimientoOrigen;
  dateFrom?: string;
  dateTo?: string;
  categoria?: string;
  search?: string;
  limit?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const toNum = (v: unknown): number => Number(v ?? 0);
const toISO = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ""));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCuenta(c: any): DbCuenta {
  return {
    id: c.id,
    tenantId: c.tenantId,
    nombre: c.nombre,
    tipo: c.tipo,
    banco: c.banco,
    numeroCuenta: c.numeroCuenta,
    cci: c.cci,
    moneda: c.moneda,
    saldo: toNum(c.saldo),
    saldoInicial: toNum(c.saldoInicial),
    activa: c.activa,
    color: c.color,
    notas: c.notas,
    createdAt: toISO(c.createdAt),
    updatedAt: toISO(c.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMovimiento(m: any): DbMovimiento {
  return {
    id: m.id,
    tenantId: m.tenantId,
    cuentaId: m.cuentaId,
    tipo: m.tipo,
    origen: m.origen,
    monto: toNum(m.monto),
    saldoAnterior: toNum(m.saldoAnterior),
    saldoPosterior: toNum(m.saldoPosterior),
    descripcion: m.descripcion,
    referencia: m.referencia,
    categoria: m.categoria,
    createdAt: toISO(m.createdAt),
    ...(m.cuenta && { cuentaNombre: m.cuenta.nombre }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransferencia(t: any): DbTransferencia {
  return {
    id: t.id,
    tenantId: t.tenantId,
    origenId: t.origenId,
    destinoId: t.destinoId,
    monto: toNum(t.monto),
    descripcion: t.descripcion,
    createdAt: toISO(t.createdAt),
    ...(t.origen && { origenNombre: t.origen.nombre }),
    ...(t.destino && { destinoNombre: t.destino.nombre }),
  };
}

// ── Treasury DB ───────────────────────────────────────────────────────────────

export const TreasuryDB = {
  // ── Cuentas ──────────────────────────────────────────

  async listCuentas(tenantId: string, includeInactive = false): Promise<DbCuenta[]> {
    const where: Record<string, unknown> = { tenantId };
    if (!includeInactive) where.activa = true;
    const rows = await prisma.treasuryCuenta.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapCuenta);
  },

  async getCuenta(id: string): Promise<DbCuenta | null> {
    const row = await prisma.treasuryCuenta.findUnique({ where: { id } });
    return row ? mapCuenta(row) : null;
  },

  async createCuenta(data: CuentaCreateInput): Promise<DbCuenta> {
    const row = await prisma.treasuryCuenta.create({
      data: {
        tenantId: data.tenantId,
        nombre: data.nombre,
        tipo: data.tipo,
        banco: data.banco,
        numeroCuenta: data.numeroCuenta,
        cci: data.cci,
        moneda: data.moneda ?? "PEN",
        saldo: data.saldoInicial ?? 0,
        saldoInicial: data.saldoInicial ?? 0,
        color: data.color,
        notas: data.notas,
      },
    });
    return mapCuenta(row);
  },

  async updateCuenta(id: string, data: CuentaUpdateInput): Promise<DbCuenta | null> {
    const existing = await prisma.treasuryCuenta.findUnique({ where: { id } });
    if (!existing) return null;
    const row = await prisma.treasuryCuenta.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined && { nombre: data.nombre }),
        ...(data.banco !== undefined && { banco: data.banco }),
        ...(data.numeroCuenta !== undefined && { numeroCuenta: data.numeroCuenta }),
        ...(data.cci !== undefined && { cci: data.cci }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.notas !== undefined && { notas: data.notas }),
        ...(data.activa !== undefined && { activa: data.activa }),
      },
    });
    return mapCuenta(row);
  },

  // ── Movimientos ──────────────────────────────────────

  async listMovimientos(tenantId: string, filters?: MovimientoListFilters): Promise<DbMovimiento[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.cuentaId) where.cuentaId = filters.cuentaId;
    if (filters?.tipo) where.tipo = filters.tipo;
    if (filters?.origen) where.origen = filters.origen;
    if (filters?.categoria) where.categoria = filters.categoria;

    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
        ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
      };
    }
    if (filters?.search) {
      where.OR = [
        { descripcion: { contains: filters.search, mode: "insensitive" } },
        { referencia: { contains: filters.search, mode: "insensitive" } },
        { categoria: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.treasuryMovimiento.findMany({
      where,
      include: { cuenta: { select: { nombre: true } } },
      orderBy: { createdAt: "desc" },
      take: filters?.limit ?? 200,
    });
    return rows.map(mapMovimiento);
  },

  async registrarMovimiento(data: MovimientoCreateInput): Promise<DbMovimiento> {
    return await prisma.$transaction(async (tx) => {
      // Get current balance
      const cuenta = await tx.treasuryCuenta.findUnique({ where: { id: data.cuentaId } });
      if (!cuenta) throw new Error("Cuenta no encontrada");

      const saldoAnterior = Number(cuenta.saldo);
      const monto = data.monto;
      const isIngreso = data.tipo === "INGRESO" || data.tipo === "TRANSFERENCIA_IN";
      const saldoPosterior = isIngreso ? saldoAnterior + monto : saldoAnterior - monto;

      // Create movement
      const mov = await tx.treasuryMovimiento.create({
        data: {
          tenantId: data.tenantId,
          cuentaId: data.cuentaId,
          tipo: data.tipo,
          origen: data.origen ?? "MANUAL",
          monto,
          saldoAnterior,
          saldoPosterior,
          descripcion: data.descripcion ?? "",
          referencia: data.referencia,
          categoria: data.categoria,
        },
        include: { cuenta: { select: { nombre: true } } },
      });

      // Update account balance
      await tx.treasuryCuenta.update({
        where: { id: data.cuentaId },
        data: { saldo: saldoPosterior },
      });

      return mapMovimiento(mov);
    });
  },

  // ── Transferencias ───────────────────────────────────

  async listTransferencias(tenantId: string, limit = 50): Promise<DbTransferencia[]> {
    const rows = await prisma.treasuryTransferencia.findMany({
      where: { tenantId },
      include: {
        origen: { select: { nombre: true } },
        destino: { select: { nombre: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapTransferencia);
  },

  async transferir(data: TransferenciaCreateInput): Promise<DbTransferencia> {
    if (data.origenId === data.destinoId) throw new Error("Origen y destino deben ser diferentes");
    if (data.monto <= 0) throw new Error("El monto debe ser positivo");

    return await prisma.$transaction(async (tx) => {
      const origen = await tx.treasuryCuenta.findUnique({ where: { id: data.origenId } });
      const destino = await tx.treasuryCuenta.findUnique({ where: { id: data.destinoId } });
      if (!origen || !destino) throw new Error("Cuenta no encontrada");

      const saldoOrigenAnterior = Number(origen.saldo);
      const saldoDestinoAnterior = Number(destino.saldo);

      // Create transfer record
      const transfer = await tx.treasuryTransferencia.create({
        data: {
          tenantId: data.tenantId,
          origenId: data.origenId,
          destinoId: data.destinoId,
          monto: data.monto,
          descripcion: data.descripcion ?? "",
        },
        include: {
          origen: { select: { nombre: true } },
          destino: { select: { nombre: true } },
        },
      });

      // Create outgoing movement
      await tx.treasuryMovimiento.create({
        data: {
          tenantId: data.tenantId,
          cuentaId: data.origenId,
          tipo: "TRANSFERENCIA_OUT",
          origen: "TRANSFERENCIA",
          monto: data.monto,
          saldoAnterior: saldoOrigenAnterior,
          saldoPosterior: saldoOrigenAnterior - data.monto,
          descripcion: `Transferencia a ${destino.nombre}`,
          referencia: transfer.id,
        },
      });

      // Create incoming movement
      await tx.treasuryMovimiento.create({
        data: {
          tenantId: data.tenantId,
          cuentaId: data.destinoId,
          tipo: "TRANSFERENCIA_IN",
          origen: "TRANSFERENCIA",
          monto: data.monto,
          saldoAnterior: saldoDestinoAnterior,
          saldoPosterior: saldoDestinoAnterior + data.monto,
          descripcion: `Transferencia desde ${origen.nombre}`,
          referencia: transfer.id,
        },
      });

      // Update balances
      await tx.treasuryCuenta.update({
        where: { id: data.origenId },
        data: { saldo: { decrement: data.monto } },
      });
      await tx.treasuryCuenta.update({
        where: { id: data.destinoId },
        data: { saldo: { increment: data.monto } },
      });

      return mapTransferencia(transfer);
    });
  },

  // ── Resumen consolidado ──────────────────────────────

  async getResumen(tenantId: string): Promise<{
    saldoTotal: number;
    saldoPorTipo: Record<string, number>;
    saldoPorMoneda: Record<string, number>;
    cuentasActivas: number;
    ingresosMes: number;
    egresosMes: number;
    flujoNeto: number;
  }> {
    const cuentas = await prisma.treasuryCuenta.findMany({
      where: { tenantId, activa: true },
    });

    let saldoTotal = 0;
    const saldoPorTipo: Record<string, number> = {};
    const saldoPorMoneda: Record<string, number> = {};

    for (const c of cuentas) {
      const s = Number(c.saldo);
      saldoTotal += s;
      saldoPorTipo[c.tipo] = (saldoPorTipo[c.tipo] ?? 0) + s;
      saldoPorMoneda[c.moneda] = (saldoPorMoneda[c.moneda] ?? 0) + s;
    }

    // This month's movements
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const movsMes = await prisma.treasuryMovimiento.findMany({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
        tipo: { in: ["INGRESO", "EGRESO"] },
      },
    });

    let ingresosMes = 0;
    let egresosMes = 0;
    for (const m of movsMes) {
      if (m.tipo === "INGRESO") ingresosMes += Number(m.monto);
      else egresosMes += Number(m.monto);
    }

    return {
      saldoTotal,
      saldoPorTipo,
      saldoPorMoneda,
      cuentasActivas: cuentas.length,
      ingresosMes,
      egresosMes,
      flujoNeto: ingresosMes - egresosMes,
    };
  },
};
