import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * AdelantosDB — Adelantos de dinero a personas/proveedores por servicios,
 * liquidados con entregas valuadas (producto o servicio). ADR-XXX (2026-05-25).
 *
 * Reglas críticas (CLAUDE.md):
 *  - tenantId SIEMPRE 1er param y en todo where (aislamiento multi-tenant).
 *  - Totales (valor de entrega, saldoPendiente) calculados en backend (anti-fraude #6).
 *  - registrarEntrega es atómico ($transaction): entrega + recálculo de saldo + status
 *    + cuota pactada + stock, todo o nada.
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type AdelantoModalidad = "CUENTA_CORRIENTE" | "ENTREGAS_PACTADAS";
export type AdelantoStatus = "ABIERTO" | "LIQUIDADO" | "EXCEDIDO" | "CANCELADO";
export type AdelantoEntregaTipo = "LIBRE" | "PRODUCTO";

export type DbBeneficiario = {
  id: string;
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
  notas?: string | null;
  limiteCredito?: number | null;
  createdAt: string;
};

export type RecurrenteFrecuencia = "semanal" | "quincenal" | "mensual";
export type DbRecurrente = {
  id: string;
  beneficiarioId: string;
  beneficiarioNombre?: string;
  modalidad: AdelantoModalidad;
  monto: number;
  moneda: string;
  frecuencia: RecurrenteFrecuencia;
  diaMes?: number | null;
  activo: boolean;
  proximaEjecucion?: string | null;
  ultimaEjecucion?: string | null;
  notas?: string | null;
  createdAt: string;
};
export type RecurrenteInput = {
  beneficiarioId: string;
  modalidad?: AdelantoModalidad;
  monto: number;
  moneda?: string;
  frecuencia: RecurrenteFrecuencia;
  diaMes?: number | null;
  notas?: string;
};

export type DbAdelantoEntrega = {
  id: string;
  adelantoId: string;
  fecha: string;
  tipo: AdelantoEntregaTipo;
  descripcion?: string | null;
  productId?: number | null;
  cantidad?: number | null;
  valor: number;
  sumadoAStock: boolean;
  notas?: string | null;
  comprobanteUrl?: string | null;
  createdAt: string;
};

export type DbEntregaPactada = {
  id: string;
  numero: number;
  descripcionEsperada: string;
  valorEsperado: number;
  fechaEsperada?: string | null;
  cumplidaEn?: string | null;
  entregaId?: string | null;
};

export type DbAdelanto = {
  id: string;
  tenantId: string;
  beneficiarioId: string;
  beneficiario?: DbBeneficiario;
  modalidad: AdelantoModalidad;
  montoAdelantado: number;
  moneda: string;
  fechaAdelanto: string;
  status: AdelantoStatus;
  saldoPendiente: number;
  totalEntregado: number;
  notas?: string | null;
  comprobanteUrl?: string | null;
  entregas: DbAdelantoEntrega[];
  entregasPactadas: DbEntregaPactada[];
  createdAt: string;
  updatedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const toNum = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : Number(d);
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const INCLUDE_FULL = {
  beneficiario: true,
  entregas: { orderBy: { fecha: "desc" } },
  entregasPactadas: { orderBy: { numero: "asc" } },
} satisfies Prisma.AdelantoInclude;

type AdelantoRow = Prisma.AdelantoGetPayload<{ include: typeof INCLUDE_FULL }>;

function mapBeneficiario(b: {
  id: string; nombre: string; documento: string | null; telefono: string | null;
  notas: string | null; limiteCredito?: Prisma.Decimal | number | null; createdAt: Date;
}): DbBeneficiario {
  return {
    id: b.id, nombre: b.nombre, documento: b.documento, telefono: b.telefono,
    notas: b.notas, limiteCredito: b.limiteCredito != null ? Number(b.limiteCredito) : null,
    createdAt: b.createdAt.toISOString(),
  };
}

function mapAdelanto(row: AdelantoRow): DbAdelanto {
  const montoAdelantado = toNum(row.montoAdelantado);
  const saldoPendiente = toNum(row.saldoPendiente);
  return {
    id: row.id,
    tenantId: row.tenantId,
    beneficiarioId: row.beneficiarioId,
    beneficiario: row.beneficiario ? mapBeneficiario(row.beneficiario) : undefined,
    modalidad: row.modalidad as AdelantoModalidad,
    montoAdelantado,
    moneda: row.moneda,
    fechaAdelanto: row.fechaAdelanto.toISOString(),
    status: row.status as AdelantoStatus,
    saldoPendiente,
    totalEntregado: Math.round((montoAdelantado - saldoPendiente) * 100) / 100,
    notas: row.notas,
    comprobanteUrl: row.comprobanteUrl,
    entregas: row.entregas.map((e) => ({
      id: e.id, adelantoId: e.adelantoId, fecha: e.fecha.toISOString(),
      tipo: e.tipo as AdelantoEntregaTipo, descripcion: e.descripcion,
      productId: e.productId, cantidad: e.cantidad == null ? null : toNum(e.cantidad),
      valor: toNum(e.valor), sumadoAStock: e.sumadoAStock, notas: e.notas,
      comprobanteUrl: e.comprobanteUrl,
      createdAt: e.createdAt.toISOString(),
    })),
    entregasPactadas: row.entregasPactadas.map((p) => ({
      id: p.id, numero: p.numero, descripcionEsperada: p.descripcionEsperada,
      valorEsperado: toNum(p.valorEsperado), fechaEsperada: iso(p.fechaEsperada),
      cumplidaEn: iso(p.cumplidaEn), entregaId: p.entregaId,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Inputs ───────────────────────────────────────────────────────────────────
export type BeneficiarioInput = {
  nombre: string; documento?: string; telefono?: string; notas?: string; limiteCredito?: number | null;
};

export type EntregaPactadaInput = {
  descripcionEsperada: string; valorEsperado: number; fechaEsperada?: string;
};

export type AdelantoCreateInput = {
  beneficiarioId: string;
  modalidad?: AdelantoModalidad;
  montoAdelantado: number;
  moneda?: string;
  fechaAdelanto?: string;
  notas?: string;
  comprobanteUrl?: string;
  entregasPactadas?: EntregaPactadaInput[]; // solo modalidad ENTREGAS_PACTADAS
};

export type EntregaInput = {
  tipo: AdelantoEntregaTipo;
  descripcion?: string;
  productId?: number;
  cantidad?: number;
  valorManual?: number; // tipo LIBRE: valor directo. tipo PRODUCTO: override opcional.
  sumarAStock?: boolean;
  pactadaId?: string; // marca una entrega pactada como cumplida
  notas?: string;
  comprobanteUrl?: string;
  fecha?: string;
};

export type AdelantoListFilters = {
  status?: AdelantoStatus;
  beneficiarioId?: string;
  modalidad?: AdelantoModalidad;
  search?: string;
};

// ── DB ───────────────────────────────────────────────────────────────────────
export const AdelantosDB = {
  // ── Beneficiarios ──
  async listBeneficiarios(tenantId: string): Promise<(DbBeneficiario & { totalAdelantado: number; saldoPendiente: number; adelantosAbiertos: number })[]> {
    const rows = await prisma.adelantoBeneficiario.findMany({
      where: { tenantId },
      orderBy: { nombre: "asc" },
      include: { adelantos: { select: { montoAdelantado: true, saldoPendiente: true, status: true } } },
    });
    return rows.map((b) => {
      const totalAdelantado = b.adelantos.reduce((s, a) => s + toNum(a.montoAdelantado), 0);
      const saldoPendiente = b.adelantos.reduce((s, a) => s + toNum(a.saldoPendiente), 0);
      const adelantosAbiertos = b.adelantos.filter((a) => a.status === "ABIERTO").length;
      return {
        ...mapBeneficiario(b),
        totalAdelantado: Math.round(totalAdelantado * 100) / 100,
        saldoPendiente: Math.round(saldoPendiente * 100) / 100,
        adelantosAbiertos,
      };
    });
  },

  async createBeneficiario(tenantId: string, data: BeneficiarioInput): Promise<DbBeneficiario> {
    const b = await prisma.adelantoBeneficiario.create({
      data: {
        tenantId,
        nombre: data.nombre.trim(),
        documento: data.documento?.trim() || null,
        telefono: data.telefono?.trim() || null,
        notas: data.notas?.trim() || null,
        limiteCredito: data.limiteCredito != null && data.limiteCredito > 0 ? data.limiteCredito : null,
      },
    });
    return mapBeneficiario(b);
  },

  // ── Adelantos ──
  async list(tenantId: string, filters?: AdelantoListFilters): Promise<DbAdelanto[]> {
    const where: Prisma.AdelantoWhereInput = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.beneficiarioId) where.beneficiarioId = filters.beneficiarioId;
    if (filters?.modalidad) where.modalidad = filters.modalidad;
    if (filters?.search) {
      where.OR = [
        { beneficiario: { nombre: { contains: filters.search, mode: "insensitive" } } },
        { notas: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const rows = await prisma.adelanto.findMany({
      where,
      include: INCLUDE_FULL,
      orderBy: { fechaAdelanto: "desc" },
      take: 500,
    });
    return rows.map(mapAdelanto);
  },

  async getById(tenantId: string, id: string): Promise<DbAdelanto | null> {
    const row = await prisma.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
    return row ? mapAdelanto(row) : null;
  },

  async create(tenantId: string, data: AdelantoCreateInput): Promise<DbAdelanto> {
    const monto = Math.round(data.montoAdelantado * 100) / 100;
    const modalidad = data.modalidad ?? "CUENTA_CORRIENTE";
    const pactadas = modalidad === "ENTREGAS_PACTADAS" ? (data.entregasPactadas ?? []) : [];

    // ADR-118: límite de crédito por persona (saldo abierto + nuevo monto ≤ límite)
    const benef = await prisma.adelantoBeneficiario.findFirst({
      where: { id: data.beneficiarioId, tenantId },
      select: { nombre: true, limiteCredito: true },
    });
    if (benef?.limiteCredito != null) {
      const limite = Number(benef.limiteCredito);
      const abiertos = await prisma.adelanto.aggregate({
        where: { tenantId, beneficiarioId: data.beneficiarioId, status: "ABIERTO" },
        _sum: { saldoPendiente: true },
      });
      const actual = Number(abiertos._sum.saldoPendiente ?? 0);
      if (actual + monto > limite) {
        throw new Error(`Supera el límite de crédito de ${benef.nombre} (S/${limite.toFixed(2)}). Ya tiene S/${actual.toFixed(2)} sin liquidar.`);
      }
    }

    const row = await prisma.adelanto.create({
      data: {
        tenantId,
        beneficiarioId: data.beneficiarioId,
        modalidad,
        montoAdelantado: monto,
        moneda: data.moneda ?? "PEN",
        fechaAdelanto: data.fechaAdelanto ? new Date(data.fechaAdelanto) : new Date(),
        status: "ABIERTO",
        saldoPendiente: monto, // arranca con saldo completo a favor del negocio
        notas: data.notas?.trim() || null,
        comprobanteUrl: data.comprobanteUrl?.trim() || null,
        entregasPactadas: pactadas.length
          ? {
              create: pactadas.map((p, i) => ({
                numero: i + 1,
                descripcionEsperada: p.descripcionEsperada,
                valorEsperado: Math.round(p.valorEsperado * 100) / 100,
                fechaEsperada: p.fechaEsperada ? new Date(p.fechaEsperada) : null,
              })),
            }
          : undefined,
      },
      include: INCLUDE_FULL,
    });
    return mapAdelanto(row);
  },

  /**
   * Registrar una entrega que liquida (parcial o totalmente) el adelanto.
   * ATÓMICO: crea entrega, recalcula saldoPendiente (montoAdelantado − Σvalor),
   * ajusta status (LIQUIDADO si 0, EXCEDIDO si <0), marca cuota pactada si aplica,
   * e incrementa stock si tipo=PRODUCTO && sumarAStock.
   */
  async registrarEntrega(tenantId: string, adelantoId: string, input: EntregaInput): Promise<DbAdelanto | null> {
    return prisma.$transaction(async (tx) => {
      const adelanto = await tx.adelanto.findFirst({ where: { id: adelantoId, tenantId } });
      if (!adelanto) return null;
      if (adelanto.status === "CANCELADO") {
        throw new Error("No se pueden registrar entregas en un adelanto cancelado");
      }

      // Valor SIEMPRE calculado en backend (anti-fraude).
      let valor: number;
      if (input.tipo === "PRODUCTO" && input.productId != null) {
        if (input.valorManual != null && input.valorManual > 0) {
          valor = input.valorManual;
        } else {
          const prod = await tx.product.findFirst({
            where: { id: input.productId, tenantId },
            select: { price: true },
          });
          if (!prod) throw new Error("Producto no encontrado en este tenant");
          const cantidad = input.cantidad ?? 1;
          valor = toNum(prod.price) * cantidad;
        }
      } else {
        valor = input.valorManual ?? 0;
      }
      valor = Math.round(valor * 100) / 100;
      if (valor <= 0) throw new Error("El valor de la entrega debe ser mayor a 0");

      const entrega = await tx.adelantoEntrega.create({
        data: {
          adelantoId,
          fecha: input.fecha ? new Date(input.fecha) : new Date(),
          tipo: input.tipo,
          descripcion: input.descripcion?.trim() || null,
          productId: input.tipo === "PRODUCTO" ? input.productId ?? null : null,
          cantidad: input.cantidad ?? null,
          valor,
          sumadoAStock: Boolean(input.tipo === "PRODUCTO" && input.sumarAStock),
          notas: input.notas?.trim() || null,
          comprobanteUrl: input.comprobanteUrl?.trim() || null,
        },
      });

      // Incrementar stock si corresponde (entrega de producto que entra al inventario).
      if (input.tipo === "PRODUCTO" && input.sumarAStock && input.productId != null) {
        const qty = Math.round(input.cantidad ?? 1);
        if (qty > 0) {
          await tx.product.updateMany({
            where: { id: input.productId, tenantId },
            data: { stock: { increment: qty } },
          });
        }
      }

      // Marcar cuota pactada cumplida (si se indicó y pertenece a este adelanto).
      if (input.pactadaId) {
        await tx.adelantoEntregaPactada.updateMany({
          where: { id: input.pactadaId, adelantoId },
          data: { cumplidaEn: new Date(), entregaId: entrega.id },
        });
      }

      // Recalcular saldo desde la suma real de entregas (fuente de verdad).
      const agg = await tx.adelantoEntrega.aggregate({
        where: { adelantoId },
        _sum: { valor: true },
      });
      const totalEntregado = toNum(agg._sum.valor);
      const montoAdelantado = toNum(adelanto.montoAdelantado);
      const saldo = Math.round((montoAdelantado - totalEntregado) * 100) / 100;
      const nuevoStatus: AdelantoStatus =
        saldo > 0.009 ? "ABIERTO" : saldo < -0.009 ? "EXCEDIDO" : "LIQUIDADO";

      await tx.adelanto.update({
        where: { id: adelantoId },
        data: { saldoPendiente: saldo, status: nuevoStatus },
      });

      const full = await tx.adelanto.findFirst({ where: { id: adelantoId, tenantId }, include: INCLUDE_FULL });
      return full ? mapAdelanto(full) : null;
    });
  },

  async cancel(tenantId: string, id: string): Promise<DbAdelanto | null> {
    const existing = await prisma.adelanto.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.adelanto.updateMany({ where: { id, tenantId }, data: { status: "CANCELADO" } });
    const row = await prisma.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
    return row ? mapAdelanto(row) : null;
  },

  async updateNotas(tenantId: string, id: string, notas: string | null): Promise<DbAdelanto | null> {
    const existing = await prisma.adelanto.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.adelanto.updateMany({ where: { id, tenantId }, data: { notas: notas?.trim() || null } });
    const row = await prisma.adelanto.findFirst({ where: { id, tenantId }, include: INCLUDE_FULL });
    return row ? mapAdelanto(row) : null;
  },

  // ── Resumen (KPIs del módulo) ──
  async resumen(tenantId: string): Promise<{
    totalAdelantado: number;
    totalLiquidado: number;
    saldoPendiente: number;
    excedente: number;
    adelantosAbiertos: number;
    adelantosLiquidados: number;
    beneficiarios: number;
  }> {
    const [adelantos, totalBenef] = await Promise.all([
      prisma.adelanto.findMany({
        where: { tenantId, status: { not: "CANCELADO" } },
        select: { montoAdelantado: true, saldoPendiente: true, status: true },
      }),
      prisma.adelantoBeneficiario.count({ where: { tenantId } }),
    ]);
    let totalAdelantado = 0, saldoPos = 0, excedente = 0, abiertos = 0, liquidados = 0;
    for (const a of adelantos) {
      const monto = toNum(a.montoAdelantado);
      const saldo = toNum(a.saldoPendiente);
      totalAdelantado += monto;
      if (saldo > 0) saldoPos += saldo;
      if (saldo < 0) excedente += -saldo;
      if (a.status === "ABIERTO") abiertos++;
      if (a.status === "LIQUIDADO") liquidados++;
    }
    const totalLiquidado = adelantos.reduce(
      (s, a) => s + Math.min(toNum(a.montoAdelantado), toNum(a.montoAdelantado) - toNum(a.saldoPendiente)),
      0,
    );
    const r = (n: number) => Math.round(n * 100) / 100;
    return {
      totalAdelantado: r(totalAdelantado),
      totalLiquidado: r(totalLiquidado),
      saldoPendiente: r(saldoPos),
      excedente: r(excedente),
      adelantosAbiertos: abiertos,
      adelantosLiquidados: liquidados,
      beneficiarios: totalBenef,
    };
  },

  // ── Beneficiarios: editar / eliminar ──
  async updateBeneficiario(tenantId: string, id: string, data: BeneficiarioInput): Promise<DbBeneficiario | null> {
    const existing = await prisma.adelantoBeneficiario.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    await prisma.adelantoBeneficiario.updateMany({
      where: { id, tenantId },
      data: {
        nombre: data.nombre.trim(),
        documento: data.documento?.trim() || null,
        telefono: data.telefono?.trim() || null,
        notas: data.notas?.trim() || null,
        limiteCredito: data.limiteCredito != null && data.limiteCredito > 0 ? data.limiteCredito : null,
      },
    });
    const row = await prisma.adelantoBeneficiario.findFirst({ where: { id, tenantId } });
    return row ? mapBeneficiario(row) : null;
  },

  /** Elimina una persona. Bloquea si tiene adelantos registrados (integridad). */
  async deleteBeneficiario(tenantId: string, id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "has_adelantos" }> {
    const existing = await prisma.adelantoBeneficiario.findFirst({ where: { id, tenantId } });
    if (!existing) return { ok: false, reason: "not_found" };
    const adelantos = await prisma.adelanto.count({ where: { tenantId, beneficiarioId: id } });
    if (adelantos > 0) return { ok: false, reason: "has_adelantos" };
    await prisma.adelantoBeneficiario.deleteMany({ where: { id, tenantId } });
    return { ok: true };
  },

  // ── Adelantos recurrentes (ADR-118) ──
  async listRecurrentes(tenantId: string): Promise<DbRecurrente[]> {
    const rows = await prisma.adelantoRecurrente.findMany({
      where: { tenantId },
      include: { beneficiario: { select: { nombre: true } } },
      orderBy: [{ activo: "desc" }, { proximaEjecucion: "asc" }],
    });
    return rows.map(mapRecurrente);
  },

  async createRecurrente(tenantId: string, data: RecurrenteInput): Promise<DbRecurrente> {
    const proxima = nextProxima(data.frecuencia, data.diaMes ?? null, new Date());
    const row = await prisma.adelantoRecurrente.create({
      data: {
        tenantId,
        beneficiarioId: data.beneficiarioId,
        modalidad: data.modalidad ?? "CUENTA_CORRIENTE",
        monto: Math.round(data.monto * 100) / 100,
        moneda: data.moneda ?? "PEN",
        frecuencia: data.frecuencia,
        diaMes: data.frecuencia === "mensual" ? data.diaMes ?? null : null,
        notas: data.notas?.trim() || null,
        proximaEjecucion: proxima,
      },
      include: { beneficiario: { select: { nombre: true } } },
    });
    return mapRecurrente(row);
  },

  async setRecurrenteActivo(tenantId: string, id: string, activo: boolean): Promise<boolean> {
    const r = await prisma.adelantoRecurrente.updateMany({ where: { id, tenantId }, data: { activo } });
    return r.count > 0;
  },

  async deleteRecurrente(tenantId: string, id: string): Promise<boolean> {
    const r = await prisma.adelantoRecurrente.deleteMany({ where: { id, tenantId } });
    return r.count > 0;
  },

  /** Cron: materializa los recurrentes activos vencidos → crea adelantos reales. */
  async materializeRecurrentes(now = new Date()): Promise<{ creados: number }> {
    const pendientes = await prisma.adelantoRecurrente.findMany({
      where: { activo: true, proximaEjecucion: { lte: now } },
    });
    let creados = 0;
    for (const r of pendientes) {
      await prisma.$transaction(async (tx) => {
        const monto = Number(r.monto);
        await tx.adelanto.create({
          data: {
            tenantId: r.tenantId,
            beneficiarioId: r.beneficiarioId,
            modalidad: r.modalidad,
            montoAdelantado: monto,
            moneda: r.moneda,
            status: "ABIERTO",
            saldoPendiente: monto,
            notas: `Adelanto recurrente (${r.frecuencia})`,
          },
        });
        await tx.adelantoRecurrente.update({
          where: { id: r.id },
          data: { ultimaEjecucion: now, proximaEjecucion: nextProxima(r.frecuencia as RecurrenteFrecuencia, r.diaMes, now) },
        });
      });
      creados += 1;
    }
    return { creados };
  },
};

function mapRecurrente(r: {
  id: string; beneficiarioId: string; modalidad: string; monto: Prisma.Decimal | number;
  moneda: string; frecuencia: string; diaMes: number | null; activo: boolean;
  proximaEjecucion: Date | null; ultimaEjecucion: Date | null; notas: string | null; createdAt: Date;
  beneficiario?: { nombre: string } | null;
}): DbRecurrente {
  return {
    id: r.id, beneficiarioId: r.beneficiarioId, beneficiarioNombre: r.beneficiario?.nombre,
    modalidad: r.modalidad as AdelantoModalidad, monto: toNum(r.monto), moneda: r.moneda,
    frecuencia: r.frecuencia as RecurrenteFrecuencia, diaMes: r.diaMes, activo: r.activo,
    proximaEjecucion: iso(r.proximaEjecucion), ultimaEjecucion: iso(r.ultimaEjecucion),
    notas: r.notas, createdAt: r.createdAt.toISOString(),
  };
}

/** Calcula la próxima ejecución según frecuencia (mensual respeta diaMes 1-28). */
function nextProxima(frecuencia: RecurrenteFrecuencia, diaMes: number | null, from: Date): Date {
  const d = new Date(from);
  if (frecuencia === "semanal") { d.setDate(d.getDate() + 7); return d; }
  if (frecuencia === "quincenal") { d.setDate(d.getDate() + 14); return d; }
  // mensual: próximo mes, día diaMes (default mismo día, cap 28)
  const dia = Math.min(Math.max(diaMes ?? d.getDate(), 1), 28);
  d.setMonth(d.getMonth() + 1, dia);
  return d;
}
