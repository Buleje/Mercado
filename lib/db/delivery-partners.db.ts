import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ESTADOS_CERRADOS, minutosDeEntrega, resumenDeFicha } from "@/lib/delivery/ficha-repartidor";

/**
 * DeliveryPartnersDB
 *
 * Acceso canonico a `DeliveryPartner` — repartidores que aplican al
 * marketplace. Audit project-wide 2026-05-19 (CodeReview P0 #1):
 * migracion de marketplace/drivers/apply.
 *
 * Idempotente por (phone, tenantId): re-aplicar refresca KYC.
 * NO reactiva isActive (mantener decision admin previa).
 */

export interface DriverApplyData {
  name: string;
  email: string | null;
  zone: string;
  vehicleType: string;
  kycNotesJson: string;
}

export const DeliveryPartnersDB = {
  /**
   * Retorna todos los partners activos del tenant con sus assignments
   * para el período indicado (since). Usado por el ranking de repartidores.
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async getRanking(tenantId: string, since: Date) {
    return prisma.deliveryPartner.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true, name: true, phone: true, vehicleType: true,
        rating: true, acceptanceRate: true,
        totalOffers: true, totalAccepted: true,
        assignments: {
          where: { createdAt: { gte: since } },
          select: { status: true, fee: true, deliveredAt: true, pickedUpAt: true, createdAt: true },
        },
      },
    });
  },

  /**
   * Upsert idempotente para una aplicacion de repartidor:
   *   - Si existe (phone, tenantId): actualiza datos KYC, conserva isActive.
   *   - Si no existe: crea con isActive=false (pendiente de aprobacion).
   * Retorna el id del partner.
   */
  async upsertApplication(
    tenantId: string,
    phoneDigits: string,
    data: DriverApplyData,
  ): Promise<{ partnerId: string; wasNew: boolean }> {
    const existing = await prisma.deliveryPartner.findFirst({
      where: { phone: phoneDigits, tenantId },
      select: { id: true, isActive: true },
    });

    if (existing) {
      await prisma.deliveryPartner.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          email: data.email,
          zone: data.zone,
          vehicleType: data.vehicleType,
          notes: data.kycNotesJson,
        },
      });
      return { partnerId: existing.id, wasNew: false };
    }

    const created = await prisma.deliveryPartner.create({
      data: {
        name: data.name,
        phone: phoneDigits,
        email: data.email,
        zone: data.zone,
        vehicleType: data.vehicleType,
        isActive: false,
        rating: 5.0,
        fee: 5.0,
        tenantId,
        notes: data.kycNotesJson,
      },
      select: { id: true },
    });
    return { partnerId: created.id, wasNew: true };
  },

  // ── Reparto › Equipo (panel del negocio) ───────────────────────────────
  // 17-10: el panel editaba, borraba y pausaba contra `/api/delivery/partners/[id]`,
  // una ruta que nunca existió (404 en todo). Estas son sus operaciones, siempre
  // con `tenantId` en el where y SIN `passwordHash` (la lista lo mandaba al navegador).

  /** La lista de Equipo, sin el hash de la contraseña de la app. */
  async listForAdmin(
    tenantId: string,
    filtros: { zone?: string | null; active?: boolean; search?: string | null } = {},
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (filtros.zone) where.zone = filtros.zone;
    if (filtros.active !== undefined) where.isActive = filtros.active;
    if (filtros.search) {
      where.OR = [
        { name: { contains: filtros.search, mode: "insensitive" } },
        { phone: { contains: filtros.search } },
      ];
    }
    return prisma.deliveryPartner.findMany({
      where,
      omit: { passwordHash: true },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Otro repartidor del negocio con ese teléfono (para no dar de alta dos veces a la misma persona). */
  async findByPhone(tenantId: string, phone: string, exceptoId?: string) {
    return prisma.deliveryPartner.findFirst({
      where: { tenantId, phone, ...(exceptoId ? { NOT: { id: exceptoId } } : {}) },
      select: { id: true, name: true, isActive: true },
    });
  },

  async findForAdmin(tenantId: string, id: string) {
    return prisma.deliveryPartner.findFirst({
      where: { tenantId, id },
      omit: { passwordHash: true },
    });
  },

  async createForAdmin(
    tenantId: string,
    data: { name: string; phone: string; email?: string; zone: string; vehicleType?: string; fee?: number; isActive?: boolean },
  ) {
    return prisma.deliveryPartner.create({
      data: { ...data, tenantId },
      omit: { passwordHash: true },
    });
  },

  /** Editar: el where lleva `tenantId` (un id de otro negocio no toca nada → `null`). */
  async updateForAdmin(
    tenantId: string,
    id: string,
    data: { name?: string; phone?: string; email?: string | null; zone?: string; vehicleType?: string; fee?: number; isActive?: boolean },
  ) {
    const { count } = await prisma.deliveryPartner.updateMany({ where: { tenantId, id }, data });
    if (count === 0) return null;
    return prisma.deliveryPartner.findFirst({ where: { tenantId, id }, omit: { passwordHash: true } });
  },

  /**
   * Lo que se perdería al borrarlo: sus entregas (se borran en cascada, con la
   * tarifa ganada) y sus retiros (la base no deja borrar si tiene). Con algo de
   * eso, el panel ofrece pausarlo en vez de borrarlo.
   */
  async contarHistorial(tenantId: string, id: string) {
    const [entregas, retiros] = await Promise.all([
      prisma.deliveryAssignment.count({ where: { tenantId, partnerId: id } }),
      prisma.partnerPayout.count({ where: { partnerId: id, partner: { tenantId } } }),
    ]);
    return { entregas, retiros };
  },

  /**
   * Ficha del repartidor (17-10, P24/P41/P42): sus entregas del período (por
   * el día en que se asignaron, como el ranking), las incidencias, lo ganado
   * (tarifas + propinas de lo entregado), lo pagado en retiros en el período y
   * lo que se le debe hoy. Las cifras salen de TODAS las filas del período (no
   * de las `take` que viajan). `null` = no es de este negocio.
   */
  async fichaForAdmin(tenantId: string, id: string, desde: Date | null, take = 100) {
    if (!tenantId) throw new Error("tenantId is required");
    const repartidor = await prisma.deliveryPartner.findFirst({
      where: { tenantId, id },
      select: {
        id: true, name: true, phone: true, zone: true, vehicleType: true, isActive: true,
        fee: true, rating: true, acceptanceRate: true, createdAt: true, lastPingAt: true,
      },
    });
    if (!repartidor) return null;
    const enPeriodo = desde ? { createdAt: { gte: desde } } : {};
    const [entregas, grupos, abiertas, retiros, pagado, porPagar] = await Promise.all([
      prisma.deliveryAssignment.findMany({
        where: { tenantId, partnerId: id, ...enPeriodo },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true, orderId: true, status: true, fee: true, tipAmount: true, notes: true,
          createdAt: true, pickedUpAt: true, deliveredAt: true,
          order: { select: { customerName: true, total: true } },
        },
      }),
      prisma.deliveryAssignment.groupBy({
        by: ["status"],
        where: { tenantId, partnerId: id, ...enPeriodo },
        _sum: { fee: true, tipAmount: true },
        _count: { _all: true },
      }),
      prisma.deliveryAssignment.count({
        where: { tenantId, partnerId: id, status: { notIn: [...ESTADOS_CERRADOS] } },
      }),
      prisma.partnerPayout.findMany({
        where: { tenantId, partnerId: id, ...enPeriodo },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, amount: true, status: true, note: true, createdAt: true, resolvedAt: true },
      }),
      prisma.partnerPayout.aggregate({
        where: { tenantId, partnerId: id, status: "paid", ...(desde ? { resolvedAt: { gte: desde } } : {}) },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.partnerPayout.aggregate({
        where: { tenantId, partnerId: id, status: { in: ["pending", "approved"] } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const resumen = resumenDeFicha(
      grupos.map((g) => ({
        status: g.status,
        cantidad: g._count?._all ?? 0,
        tarifas: Number(g._sum?.fee ?? 0),
        propinas: Number(g._sum?.tipAmount ?? 0),
      })),
    );
    return {
      repartidor: { ...repartidor, fee: Number(repartidor.fee) },
      resumen,
      abiertas,
      pagado: { cantidad: pagado._count._all, monto: Number(pagado._sum.amount ?? 0) },
      porPagar: { cantidad: porPagar._count._all, monto: Number(porPagar._sum.amount ?? 0) },
      entregas: entregas.map((e) => ({
        id: e.id,
        orderId: e.orderId,
        status: e.status,
        fee: Number(e.fee),
        propina: Number(e.tipAmount),
        notes: e.notes,
        cliente: e.order?.customerName ?? null,
        createdAt: e.createdAt,
        pickedUpAt: e.pickedUpAt,
        deliveredAt: e.deliveredAt,
        minutos: minutosDeEntrega(e.pickedUpAt, e.deliveredAt),
      })),
      retiros: retiros.map((r) => ({ ...r, amount: Number(r.amount) })),
    };
  },

  async deleteForAdmin(tenantId: string, id: string): Promise<boolean> {
    const { count } = await prisma.deliveryPartner.deleteMany({ where: { tenantId, id } });
    return count > 0;
  },
};

/**
 * NotificationsDB — solo el subset usado por endpoints de aplicacion.
 * (No movemos toda la coleccion de notifications aqui — el archivo
 *  existente lib/db/notifications.db.ts cubre el resto.)
 */
export const AdminNotificationsDB = {
  /**
   * Crea una notification para el admin (severity MEDIUM por defecto).
   * Fire-and-forget OK: el caller puede ignorar errores no criticos.
   */
  async create(params: {
    tenantId: string;
    title: string;
    body: string;
    type: string;
    severity?: string;
  }): Promise<{ id: string } | null> {
    try {
      const row = await prisma.notification.create({
        data: {
          tenantId: params.tenantId,
          title: params.title,
          body: params.body,
          type: params.type,
          severity: params.severity ?? "MEDIUM",
        },
        select: { id: true },
      });
      return row;
    } catch (err) {
      logger.warn("[AdminNotificationsDB.create] failed", {
        tenantId: params.tenantId,
        type: params.type,
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },
};
