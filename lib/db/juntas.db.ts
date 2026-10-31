import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { makeJuntaCode } from "@/lib/junta/code";
import { effectiveStatus, type JuntaEffectiveStatus } from "@/lib/junta/status";
import { issueJuntaCoupon } from "@/lib/junta/reward";

export type DbJunta = {
  id: string;
  code: string;
  tenantId: string;
  initiatorId: string;
  productLabel?: string;
  zoneLabel: string;
  windowEnd: string;
  targetMembers: number;
  status: JuntaEffectiveStatus;
  memberCount: number;
  couponCode?: string;
  /** ISO del último vecino que se sumó (prueba social en vivo). */
  lastJoinedAt?: string;
  createdAt: string;
};

/** Detecta violación de unique constraint de Prisma (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJunta(j: any, now: Date): DbJunta {
  const memberCount: number = j._count?.members ?? j.members?.length ?? 0;
  // `members` viene ordenado desc por joinedAt (take 1) en getByCode.
  const lastJoinedAt: Date | undefined = j.members?.[0]?.joinedAt;
  return {
    id: j.id,
    code: j.code,
    tenantId: j.tenantId,
    initiatorId: j.initiatorId,
    ...(j.productLabel != null && { productLabel: j.productLabel }),
    zoneLabel: j.zoneLabel,
    windowEnd: j.windowEnd.toISOString(),
    targetMembers: j.targetMembers,
    status: effectiveStatus(memberCount, j.targetMembers, j.windowEnd, now),
    memberCount,
    ...(j.couponCode != null && { couponCode: j.couponCode }),
    ...(lastJoinedAt != null && { lastJoinedAt: lastJoinedAt.toISOString() }),
    createdAt: j.createdAt.toISOString(),
  };
}

const COUNT_INCLUDE = { _count: { select: { members: true } } } as const;
// Incluye además el último miembro (joinedAt desc) para la prueba social.
const DETAIL_INCLUDE = {
  _count: { select: { members: true } },
  members: { orderBy: { joinedAt: "desc" }, take: 1, select: { joinedAt: true } },
} as const;

export const JuntasDB = {
  /** Crea una junta y suma al iniciador como primer miembro. tenantId 1er param. */
  async create(
    tenantId: string,
    data: {
      initiatorId: string;
      zoneLabel: string;
      productLabel?: string;
      windowEnd: Date;
      targetMembers?: number;
    },
  ): Promise<DbJunta> {
    const target = data.targetMembers ?? 4;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeJuntaCode();
      try {
        const junta = await prisma.junta.create({
          data: {
            tenantId,
            code,
            initiatorId: data.initiatorId,
            zoneLabel: data.zoneLabel,
            productLabel: data.productLabel,
            windowEnd: data.windowEnd,
            targetMembers: target,
            members: { create: { customerId: data.initiatorId } },
          },
          include: COUNT_INCLUDE,
        });
        return mapJunta(junta, new Date());
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 4) continue; // colisión de code → reintenta
        throw err;
      }
    }
    throw new Error("No se pudo generar un código de junta único");
  },

  /** Lee una junta por su code (scoped a tenant) con estado computado. */
  async getByCode(tenantId: string, code: string): Promise<DbJunta | null> {
    const junta = await prisma.junta.findUnique({
      where: { tenantId_code: { tenantId, code } },
      include: DETAIL_INCLUDE,
    });
    return junta ? mapJunta(junta, new Date()) : null;
  },

  /** Suma un miembro (idempotente). Marca COMPLETE al llegar a la meta. */
  async join(
    tenantId: string,
    code: string,
    customerId: string,
  ): Promise<DbJunta> {
    const junta = await prisma.junta.findUnique({
      where: { tenantId_code: { tenantId, code } },
      include: COUNT_INCLUDE,
    });
    if (!junta) throw new Error("Junta no encontrada");

    const now = new Date();
    if (
      effectiveStatus(junta._count.members, junta.targetMembers, junta.windowEnd, now) ===
      "EXPIRED"
    ) {
      throw new Error("La junta ya venció");
    }

    try {
      await prisma.juntaMember.create({
        data: { juntaId: junta.id, customerId },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // ya es miembro → idempotente
    }

    const fresh = await prisma.junta.findUnique({
      where: { id: junta.id },
      include: COUNT_INCLUDE,
    });
    if (!fresh) throw new Error("Junta no encontrada");

    if (fresh.status === "OPEN" && fresh._count.members >= fresh.targetMembers) {
      // Claim atómico de la transición OPEN→COMPLETE: gana un solo join
      // concurrente, así el cupón se emite una única vez.
      const claimed = await prisma.junta.updateMany({
        // tenantId explícito (regla multi-tenant CRIT-1) además del id PK.
        where: { id: fresh.id, tenantId, status: "OPEN" },
        data: { status: "COMPLETE" },
      });
      if (claimed.count === 1) {
        try {
          const couponCode = await issueJuntaCoupon(tenantId, {
            code: fresh.code,
            targetMembers: fresh.targetMembers,
          });
          await prisma.junta.update({
            where: { id: fresh.id },
            data: { couponCode },
          });
        } catch (err) {
          // El cupón es best-effort; la junta ya quedó COMPLETE. Se loguea
          // para reconciliación (mismo criterio que el resto del proyecto).
          logger.error("[junta] coupon issue failed", {
            juntaId: fresh.id,
            tenantId,
            error: String(err),
          });
        }
      }
      const final = await prisma.junta.findUnique({
        where: { id: fresh.id },
        include: COUNT_INCLUDE,
      });
      if (final) return mapJunta(final, now);
    }
    return mapJunta(fresh, now);
  },

  /** Juntas OPEN vigentes en una zona. */
  async listOpenByZone(tenantId: string, zoneLabel: string): Promise<DbJunta[]> {
    const now = new Date();
    const juntas = await prisma.junta.findMany({
      where: { tenantId, zoneLabel, status: "OPEN", windowEnd: { gt: now } },
      include: COUNT_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return juntas.map((j) => mapJunta(j, now));
  },

  /** Juntas OPEN vigentes del tenant (cualquier zona) — para el strip del home. */
  async listOpenRecent(tenantId: string, limit = 6): Promise<DbJunta[]> {
    const now = new Date();
    const juntas = await prisma.junta.findMany({
      where: { tenantId, status: "OPEN", windowEnd: { gt: now } },
      include: COUNT_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return juntas.map((j) => mapJunta(j, now));
  },

  /**
   * Cron de plataforma: marca EXPIRED las juntas OPEN cuya ventana venció.
   * Devuelve cuántas cerró. Barre TODOS los tenants intencionalmente.
   */
  async expireStale(now: Date = new Date()): Promise<number> {
    /* eslint-disable no-restricted-syntax -- cron platform-wide: expira juntas vencidas de TODOS los tenants a propósito (ADR-101) */
    const res = await prisma.junta.updateMany({
      where: { status: "OPEN", windowEnd: { lte: now } },
      data: { status: "EXPIRED" },
    });
    /* eslint-enable no-restricted-syntax */
    return res.count;
  },

  /**
   * Liga un pedido a una junta (Fase A4): registra el orderId en la membresía
   * del cliente (auto-join si aún no era miembro). El campo `Order.juntaId` lo
   * setea el POST de órdenes al crear la orden. tenantId 1er parámetro: valida
   * que la junta sea del tenant (anti link cross-tenant).
   */
  async linkMemberOrder(
    tenantId: string,
    args: { juntaId: string; customerId: string; orderId: string },
  ): Promise<void> {
    const junta = await prisma.junta.findFirst({
      where: { id: args.juntaId, tenantId },
      select: { id: true },
    });
    if (!junta) throw new Error("Junta no encontrada para el tenant");
    await prisma.juntaMember.upsert({
      where: {
        juntaId_customerId: {
          juntaId: args.juntaId,
          customerId: args.customerId,
        },
      },
      update: { orderId: args.orderId },
      create: {
        juntaId: args.juntaId,
        customerId: args.customerId,
        orderId: args.orderId,
      },
    });
    // Tag del pedido (id = PK único; ya es del tenant porque se acaba de crear).
    await prisma.order.update({
      where: { id: args.orderId },
      data: { juntaId: args.juntaId },
    });
  },

  /** Cuántos pedidos (no borrados) se hicieron dentro de una junta. */
  async countOrders(tenantId: string, juntaId: string): Promise<number> {
    return prisma.order.count({
      where: { tenantId, juntaId, deletedAt: null },
    });
  },

  /**
   * Pedidos de una junta para planificar la entrega agrupada (Fase A6).
   * Una junta = una sola vuelta del repartidor.
   */
  async listOrdersForJunta(
    tenantId: string,
    juntaId: string,
  ): Promise<
    Array<{
      id: string;
      customerName: string;
      customerPhone: string | null;
      location: string;
      status: string;
      total: number;
    }>
  > {
    const orders = await prisma.order.findMany({
      where: { tenantId, juntaId, deletedAt: null },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        customerLocation: true,
        status: true,
        total: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return orders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      location: o.customerLocation,
      status: o.status,
      total: Number(o.total),
    }));
  },
};
