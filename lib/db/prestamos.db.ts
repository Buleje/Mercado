import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrestamoTipo = "PERSONAL" | "BANCARIO" | "TERCERO" | "PROVEEDOR";
export type PrestamoDireccion = "DADO" | "RECIBIDO";
export type PrestamoEntidadTipo = "BANCO" | "PERSONA_NATURAL" | "EMPRESA" | "PROVEEDOR";
export type PrestamoSistemaAmortizacion = "FRANCES" | "ALEMAN" | "AMERICANO";

export type DbPrestamoCuota = {
  id: string;
  prestamoId: string;
  numeroCuota: number;
  monto: number;
  capital: number;
  interes: number;
  moraCalculada: number;
  fechaVence: string;
  pagadoEn?: string;
  montoPagado?: number;
};

export type DbPrestamoDocumento = {
  id: string;
  prestamoId: string;
  nombre: string;
  tipo: string;
  url: string;
  createdAt: string;
};

export type DbPrestamo = {
  id: string;
  tenantId: string;
  customerId?: string;
  tipo: PrestamoTipo;
  direccion: PrestamoDireccion;
  entidadNombre?: string;
  entidadTipo?: PrestamoEntidadTipo;
  nroOperacion?: string;
  monto: number;
  moneda: string;
  tasaInteres: number;
  tea?: number;
  moraInteres: number;
  numeroCuotas: number;
  sistemaAmortizacion: PrestamoSistemaAmortizacion;
  periodoGracia: number;
  status: "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";
  fechaDesembolso?: string;
  fechaVencimiento?: string;
  garantia?: string;
  notas?: string;
  cuotas: DbPrestamoCuota[];
  documentos?: DbPrestamoDocumento[];
  createdAt: string;
  updatedAt: string;
};

export type PrestamoListFilters = {
  status?: string;
  customerId?: string;
  tipo?: PrestamoTipo;
  direccion?: PrestamoDireccion;
  dateFrom?: string;
  dateTo?: string;
  montoMin?: number;
  montoMax?: number;
  search?: string;
};

export type PrestamoCreateInput = {
  tenantId: string;
  customerId?: string;
  tipo?: PrestamoTipo;
  direccion?: PrestamoDireccion;
  entidadNombre?: string;
  entidadTipo?: PrestamoEntidadTipo;
  nroOperacion?: string;
  monto: number;
  moneda?: string;
  tasaInteres?: number;
  tea?: number;
  moraInteres?: number;
  numeroCuotas?: number;
  sistemaAmortizacion?: PrestamoSistemaAmortizacion;
  periodoGracia?: number;
  fechaDesembolso?: string;
  fechaVencimiento?: string;
  garantia?: string;
  notas?: string;
};

export type PrestamoUpdateInput = Partial<Omit<PrestamoCreateInput, "tenantId">>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCuota(c: any): DbPrestamoCuota {
  return {
    id: c.id,
    prestamoId: c.prestamoId,
    numeroCuota: c.numeroCuota,
    monto: toNum(c.monto),
    capital: toNum(c.capital),
    interes: toNum(c.interes),
    moraCalculada: toNum(c.moraCalculada),
    fechaVence: toISO(c.fechaVence),
    ...(c.pagadoEn != null && { pagadoEn: toISO(c.pagadoEn) }),
    ...(c.montoPagado != null && { montoPagado: toNum(c.montoPagado) }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDocumento(d: any): DbPrestamoDocumento {
  return {
    id: d.id,
    prestamoId: d.prestamoId,
    nombre: d.nombre,
    tipo: d.tipo,
    url: d.url,
    createdAt: toISO(d.createdAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPrestamo(p: any): DbPrestamo {
  return {
    id: p.id,
    tenantId: p.tenantId,
    ...(p.customerId != null && { customerId: p.customerId }),
    tipo: p.tipo,
    direccion: p.direccion,
    ...(p.entidadNombre != null && { entidadNombre: p.entidadNombre }),
    ...(p.entidadTipo != null && { entidadTipo: p.entidadTipo }),
    ...(p.nroOperacion != null && { nroOperacion: p.nroOperacion }),
    monto: toNum(p.monto),
    moneda: p.moneda,
    tasaInteres: toNum(p.tasaInteres),
    ...(p.tea != null && { tea: toNum(p.tea) }),
    moraInteres: toNum(p.moraInteres),
    numeroCuotas: p.numeroCuotas,
    sistemaAmortizacion: p.sistemaAmortizacion,
    periodoGracia: p.periodoGracia,
    status: p.status,
    ...(p.fechaDesembolso != null && { fechaDesembolso: toISO(p.fechaDesembolso) }),
    ...(p.fechaVencimiento != null && { fechaVencimiento: toISO(p.fechaVencimiento) }),
    ...(p.garantia != null && { garantia: p.garantia }),
    ...(p.notas != null && { notas: p.notas }),
    cuotas: (p.cuotas ?? []).map(mapCuota),
    ...(p.documentos && { documentos: p.documentos.map(mapDocumento) }),
    createdAt: toISO(p.createdAt),
    updatedAt: toISO(p.updatedAt),
  };
}

const INCLUDE_FULL = {
  cuotas: { orderBy: { numeroCuota: "asc" as const } },
  documentos: { orderBy: { createdAt: "desc" as const } },
};

// ── Amortization calculators ──────────────────────────────────────────────────

type CuotaCalc = { numeroCuota: number; monto: number; capital: number; interes: number; fechaVence: Date };

function calcFrances(monto: number, tasaMensual: number, n: number, gracia: number, start: Date): CuotaCalc[] {
  const cuotas: CuotaCalc[] = [];
  let saldo = monto;

  // Período de gracia: solo interés
  for (let i = 1; i <= gracia; i++) {
    const fecha = new Date(start);
    fecha.setMonth(fecha.getMonth() + i);
    const interes = round2(saldo * tasaMensual);
    cuotas.push({ numeroCuota: i, monto: interes, capital: 0, interes, fechaVence: fecha });
  }

  // Cuotas normales
  const cuotaFija = tasaMensual > 0
    ? round2((saldo * tasaMensual * Math.pow(1 + tasaMensual, n)) / (Math.pow(1 + tasaMensual, n) - 1))
    : round2(saldo / n);

  for (let i = 1; i <= n; i++) {
    const fecha = new Date(start);
    fecha.setMonth(fecha.getMonth() + gracia + i);
    const interes = round2(saldo * tasaMensual);
    const capital = round2(cuotaFija - interes);
    saldo = Math.max(0, round2(saldo - capital));
    // Last cuota adjustment
    const cuotaReal = i === n ? round2(capital + interes + saldo) : cuotaFija;
    if (i === n) saldo = 0;
    cuotas.push({ numeroCuota: gracia + i, monto: cuotaReal, capital: round2(cuotaReal - interes), interes, fechaVence: fecha });
  }
  return cuotas;
}

function calcAleman(monto: number, tasaMensual: number, n: number, gracia: number, start: Date): CuotaCalc[] {
  const cuotas: CuotaCalc[] = [];
  let saldo = monto;

  for (let i = 1; i <= gracia; i++) {
    const fecha = new Date(start);
    fecha.setMonth(fecha.getMonth() + i);
    const interes = round2(saldo * tasaMensual);
    cuotas.push({ numeroCuota: i, monto: interes, capital: 0, interes, fechaVence: fecha });
  }

  const capitalFijo = round2(monto / n);
  for (let i = 1; i <= n; i++) {
    const fecha = new Date(start);
    fecha.setMonth(fecha.getMonth() + gracia + i);
    const interes = round2(saldo * tasaMensual);
    const cap = i === n ? round2(saldo) : capitalFijo;
    saldo = Math.max(0, round2(saldo - cap));
    cuotas.push({ numeroCuota: gracia + i, monto: round2(cap + interes), capital: cap, interes, fechaVence: fecha });
  }
  return cuotas;
}

function calcAmericano(monto: number, tasaMensual: number, n: number, gracia: number, start: Date): CuotaCalc[] {
  const cuotas: CuotaCalc[] = [];
  const totalPeriods = gracia + n;

  for (let i = 1; i <= totalPeriods; i++) {
    const fecha = new Date(start);
    fecha.setMonth(fecha.getMonth() + i);
    const interes = round2(monto * tasaMensual);
    const isLast = i === totalPeriods;
    cuotas.push({
      numeroCuota: i,
      monto: isLast ? round2(monto + interes) : interes,
      capital: isLast ? monto : 0,
      interes,
      fechaVence: fecha,
    });
  }
  return cuotas;
}

function generarCuotas(
  monto: number,
  tasaAnual: number,
  n: number,
  sistema: PrestamoSistemaAmortizacion,
  gracia: number,
  start: Date,
): CuotaCalc[] {
  const tasaMensual = tasaAnual > 0 ? tasaAnual / 100 / 12 : 0;
  switch (sistema) {
    case "ALEMAN": return calcAleman(monto, tasaMensual, n, gracia, start);
    case "AMERICANO": return calcAmericano(monto, tasaMensual, n, gracia, start);
    default: return calcFrances(monto, tasaMensual, n, gracia, start);
  }
}

// ── Prestamos DB ──────────────────────────────────────────────────────────────

export const PrestamosDB = {
  async list(tenantId: string, filters?: PrestamoListFilters): Promise<DbPrestamo[]> {
    const where: Record<string, unknown> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.tipo) where.tipo = filters.tipo;
    if (filters?.direccion) where.direccion = filters.direccion;

    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
        ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
      };
    }
    if (filters?.montoMin != null || filters?.montoMax != null) {
      where.monto = {
        ...(filters.montoMin != null && { gte: filters.montoMin }),
        ...(filters.montoMax != null && { lte: filters.montoMax }),
      };
    }
    if (filters?.search) {
      where.OR = [
        { customerId: { contains: filters.search, mode: "insensitive" } },
        { entidadNombre: { contains: filters.search, mode: "insensitive" } },
        { nroOperacion: { contains: filters.search, mode: "insensitive" } },
        { notas: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.prestamo.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapPrestamo);
  },

  async getById(id: string): Promise<DbPrestamo | null> {
    const row = await prisma.prestamo.findUnique({
      where: { id },
      include: INCLUDE_FULL,
    });
    return row ? mapPrestamo(row) : null;
  },

  async create(data: PrestamoCreateInput): Promise<DbPrestamo> {
    const numCuotas = data.numeroCuotas ?? 1;
    const tasa = data.tasaInteres ?? 0;
    const sistema = data.sistemaAmortizacion ?? "FRANCES";
    const gracia = data.periodoGracia ?? 0;
    const startDate = data.fechaDesembolso ? new Date(data.fechaDesembolso) : new Date();

    const cuotasCalc = generarCuotas(data.monto, tasa, numCuotas, sistema, gracia, startDate);
    const lastCuota = cuotasCalc[cuotasCalc.length - 1];

    const row = await prisma.prestamo.create({
      data: {
        tenantId: data.tenantId,
        customerId: data.customerId || null,
        tipo: data.tipo ?? "PERSONAL",
        direccion: data.direccion ?? "DADO",
        entidadNombre: data.entidadNombre,
        entidadTipo: data.entidadTipo,
        nroOperacion: data.nroOperacion,
        monto: data.monto,
        moneda: data.moneda ?? "PEN",
        tasaInteres: tasa,
        tea: data.tea,
        moraInteres: data.moraInteres ?? 0,
        numeroCuotas: numCuotas,
        sistemaAmortizacion: sistema,
        periodoGracia: gracia,
        fechaDesembolso: data.fechaDesembolso ? new Date(data.fechaDesembolso) : null,
        fechaVencimiento: data.fechaVencimiento
          ? new Date(data.fechaVencimiento)
          : lastCuota ? lastCuota.fechaVence : null,
        garantia: data.garantia,
        notas: data.notas,
        cuotas: {
          create: cuotasCalc.map((c) => ({
            numeroCuota: c.numeroCuota,
            monto: c.monto,
            capital: c.capital,
            interes: c.interes,
            fechaVence: c.fechaVence,
          })),
        },
      },
      include: INCLUDE_FULL,
    });
    return mapPrestamo(row);
  },

  async update(id: string, data: PrestamoUpdateInput): Promise<DbPrestamo | null> {
    const existing = await prisma.prestamo.findUnique({ where: { id } });
    if (!existing) return null;

    const row = await prisma.prestamo.update({
      where: { id },
      data: {
        ...(data.customerId !== undefined && { customerId: data.customerId || null }),
        ...(data.tipo && { tipo: data.tipo }),
        ...(data.direccion && { direccion: data.direccion }),
        ...(data.entidadNombre !== undefined && { entidadNombre: data.entidadNombre }),
        ...(data.entidadTipo !== undefined && { entidadTipo: data.entidadTipo }),
        ...(data.nroOperacion !== undefined && { nroOperacion: data.nroOperacion }),
        ...(data.moneda && { moneda: data.moneda }),
        ...(data.tea !== undefined && { tea: data.tea }),
        ...(data.moraInteres !== undefined && { moraInteres: data.moraInteres }),
        ...(data.garantia !== undefined && { garantia: data.garantia }),
        ...(data.notas !== undefined && { notas: data.notas }),
        ...(data.fechaDesembolso !== undefined && { fechaDesembolso: data.fechaDesembolso ? new Date(data.fechaDesembolso) : null }),
        ...(data.fechaVencimiento !== undefined && { fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null }),
      },
      include: INCLUDE_FULL,
    });
    return mapPrestamo(row);
  },

  async updateStatus(id: string, status: DbPrestamo["status"]): Promise<DbPrestamo | null> {
    const row = await prisma.prestamo.update({
      where: { id },
      data: { status },
      include: INCLUDE_FULL,
    });
    return mapPrestamo(row);
  },

  async registrarPago(cuotaId: string, monto: number): Promise<DbPrestamo | null> {
    const cuota = await prisma.prestamoCuota.findUnique({ where: { id: cuotaId } });
    if (!cuota) return null;

    // Calculate mora if overdue
    const prestamo = await prisma.prestamo.findUnique({ where: { id: cuota.prestamoId } });
    let moraCalc = 0;
    if (prestamo && cuota.fechaVence < new Date()) {
      const diasAtraso = Math.floor((Date.now() - cuota.fechaVence.getTime()) / (1000 * 60 * 60 * 24));
      const moraAnual = Number(prestamo.moraInteres || 0);
      if (moraAnual > 0 && diasAtraso > 0) {
        moraCalc = round2(Number(cuota.monto) * (moraAnual / 100 / 365) * diasAtraso);
      }
    }

    await prisma.prestamoCuota.update({
      where: { id: cuotaId },
      data: { pagadoEn: new Date(), montoPagado: monto, moraCalculada: moraCalc },
    });

    // Check if all cuotas paid → mark PAGADO
    const allCuotas = await prisma.prestamoCuota.findMany({
      where: { prestamoId: cuota.prestamoId },
    });
    const allPaid = allCuotas.every((c) => c.pagadoEn != null || c.id === cuotaId);

    if (allPaid) {
      await prisma.prestamo.update({
        where: { id: cuota.prestamoId },
        data: { status: "PAGADO" },
      });
    }

    return this.getById(cuota.prestamoId);
  },

  async refinanciar(id: string, data: {
    nuevaTasa?: number;
    nuevasCuotas: number;
    sistema?: PrestamoSistemaAmortizacion;
  }): Promise<DbPrestamo | null> {
    const existing = await this.getById(id);
    if (!existing || existing.status !== "ACTIVO") return null;

    const saldoPendiente = existing.cuotas
      .filter((c) => !c.pagadoEn)
      .reduce((s, c) => s + c.monto, 0);

    if (saldoPendiente <= 0) return null;

    // Delete unpaid cuotas
    await prisma.prestamoCuota.deleteMany({
      where: { prestamoId: id, pagadoEn: null },
    });

    // Calculate new cuotas for remaining balance
    const tasa = data.nuevaTasa ?? existing.tasaInteres;
    const sistema = data.sistema ?? existing.sistemaAmortizacion;
    const maxExisting = existing.cuotas
      .filter((c) => c.pagadoEn)
      .reduce((m, c) => Math.max(m, c.numeroCuota), 0);

    const newCuotas = generarCuotas(saldoPendiente, tasa, data.nuevasCuotas, sistema, 0, new Date());

    await prisma.prestamoCuota.createMany({
      data: newCuotas.map((c) => ({
        prestamoId: id,
        numeroCuota: maxExisting + c.numeroCuota,
        monto: c.monto,
        capital: c.capital,
        interes: c.interes,
        fechaVence: c.fechaVence,
      })),
    });

    // Update prestamo metadata
    const lastNew = newCuotas[newCuotas.length - 1];
    await prisma.prestamo.update({
      where: { id },
      data: {
        tasaInteres: tasa,
        numeroCuotas: maxExisting + data.nuevasCuotas,
        sistemaAmortizacion: sistema,
        fechaVencimiento: lastNew?.fechaVence,
        notas: `${existing.notas ?? ""}\n[Refinanciado el ${new Date().toLocaleDateString("es-PE")} — saldo: S/${saldoPendiente.toFixed(2)}]`.trim(),
      },
    });

    return this.getById(id);
  },

  async getResumen(tenantId: string): Promise<{
    totalDados: number;
    totalRecibidos: number;
    saldoDados: number;
    saldoRecibidos: number;
    cuotasVencidas: number;
    moraAcumulada: number;
    porTipo: Record<string, number>;
    activosDados: number;
    activosRecibidos: number;
  }> {
    const all = await this.list(tenantId);
    const activos = all.filter((p) => p.status === "ACTIVO" || p.status === "VENCIDO");
    const now = new Date();

    const dados = activos.filter((p) => p.direccion === "DADO");
    const recibidos = activos.filter((p) => p.direccion === "RECIBIDO");

    const saldoOf = (list: DbPrestamo[]) =>
      list.reduce((s, p) => s + p.cuotas.filter((c) => !c.pagadoEn).reduce((ss, c) => ss + c.monto, 0), 0);

    const cuotasVencidas = activos.reduce(
      (s, p) => s + p.cuotas.filter((c) => !c.pagadoEn && new Date(c.fechaVence) < now).length, 0
    );

    const moraAcumulada = all.reduce(
      (s, p) => s + p.cuotas.reduce((ss, c) => ss + c.moraCalculada, 0), 0
    );

    const porTipo: Record<string, number> = {};
    for (const p of activos) {
      porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + p.monto;
    }

    return {
      totalDados: dados.reduce((s, p) => s + p.monto, 0),
      totalRecibidos: recibidos.reduce((s, p) => s + p.monto, 0),
      saldoDados: saldoOf(dados),
      saldoRecibidos: saldoOf(recibidos),
      cuotasVencidas,
      moraAcumulada,
      porTipo,
      activosDados: dados.length,
      activosRecibidos: recibidos.length,
    };
  },

  async addDocumento(prestamoId: string, doc: { nombre: string; tipo: string; url: string }): Promise<DbPrestamoDocumento> {
    const row = await prisma.prestamoDocumento.create({
      data: { prestamoId, nombre: doc.nombre, tipo: doc.tipo, url: doc.url },
    });
    return mapDocumento(row);
  },

  async listDocumentos(prestamoId: string): Promise<DbPrestamoDocumento[]> {
    const rows = await prisma.prestamoDocumento.findMany({
      where: { prestamoId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapDocumento);
  },

  async deleteDocumento(docId: string): Promise<boolean> {
    try {
      await prisma.prestamoDocumento.delete({ where: { id: docId } });
      return true;
    } catch { return false; }
  },

  /** Get upcoming and overdue cuotas for a tenant (for cobros/notifications) */
  async getCuotasProximas(
    tenantId: string,
    diasAnticipacion = 30
  ): Promise<{
    vencidas: Array<{
      cuotaId: string;
      prestamoId: string;
      numeroCuota: number;
      monto: number;
      fechaVence: string;
      diasAtraso: number;
      phone?: string;
      nombre: string;
      moneda: string;
    }>;
    proximas: Array<{
      cuotaId: string;
      prestamoId: string;
      numeroCuota: number;
      monto: number;
      fechaVence: string;
      diasRestantes: number;
      phone?: string;
      nombre: string;
      moneda: string;
    }>;
  }> {
    const now = new Date();
    const limite = new Date(now);
    limite.setDate(limite.getDate() + diasAnticipacion);

    const rows = await prisma.prestamoCuota.findMany({
      where: {
        pagadoEn: null,
        fechaVence: { lte: limite },
        prestamo: {
          tenantId,
          status: { in: ["ACTIVO", "VENCIDO"] },
        },
      },
      include: {
        prestamo: {
          include: { customer: true },
        },
      },
      orderBy: { fechaVence: "asc" },
    });

    type VencidaItem = { cuotaId: string; prestamoId: string; numeroCuota: number; monto: number; fechaVence: string; diasAtraso: number; phone?: string; nombre: string; moneda: string };
    type ProximaItem = { cuotaId: string; prestamoId: string; numeroCuota: number; monto: number; fechaVence: string; diasRestantes: number; phone?: string; nombre: string; moneda: string };
    const vencidas: VencidaItem[] = [];
    const proximas: ProximaItem[] = [];

    for (const row of rows) {
      const p = row.prestamo;
      const nombre =
        p.customer?.name ??
        p.entidadNombre ??
        (p.customerId ?? "Sin nombre");
      const phone = p.customerId ?? undefined;
      const monto = toNum(row.monto);
      const moneda = p.moneda;

      if (row.fechaVence < now) {
        const diasAtraso = Math.floor(
          (now.getTime() - row.fechaVence.getTime()) / (1000 * 60 * 60 * 24)
        );
        vencidas.push({
          cuotaId: row.id,
          prestamoId: p.id,
          numeroCuota: row.numeroCuota,
          monto,
          fechaVence: toISO(row.fechaVence),
          diasAtraso,
          phone,
          nombre,
          moneda,
        });
      } else {
        const diasRestantes = Math.ceil(
          (row.fechaVence.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        proximas.push({
          cuotaId: row.id,
          prestamoId: p.id,
          numeroCuota: row.numeroCuota,
          monto,
          fechaVence: toISO(row.fechaVence),
          diasRestantes,
          phone,
          nombre,
          moneda,
        });
      }
    }

    return { vencidas, proximas };
  },

  /** Mark overdue cuotas — call from cron job */
  async marcarVencidos(tenantId: string): Promise<number> {
    const now = new Date();
    const activos = await prisma.prestamo.findMany({
      where: { tenantId, status: "ACTIVO" },
      include: { cuotas: true },
    });

    let count = 0;
    for (const p of activos) {
      const hasOverdue = p.cuotas.some((c) => !c.pagadoEn && c.fechaVence < now);
      if (hasOverdue) {
        await prisma.prestamo.update({ where: { id: p.id }, data: { status: "VENCIDO" } });
        count++;
      }
    }
    return count;
  },
};
