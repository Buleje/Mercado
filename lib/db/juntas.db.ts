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
    createdAt: j.createdAt.toISOString(),
  };
}

const COUNT_INCLUDE = { _count: { select: { members: true } } } as const;

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
      include: COUNT_INCLUDE,
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

  /** Juntas OPEN vigentes en una zona (para el strip del home). */
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
};
