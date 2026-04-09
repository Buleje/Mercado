import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbCreditProfile = {
  id: string;
  tenantId: string;
  customerId: string;
  creditScore: number;
  creditLimit: number;
  usedCredit: number;
  availableCredit: number;
  riskLevel: string;
  totalLoans: number;
  paidOnTime: number;
  paidLate: number;
  defaulted: number;
  avgTicket: number;
  purchaseFreqDays: number | null;
  lastScoreUpdate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DbCreditInstallment = {
  id: string;
  tenantId: string;
  creditProfileId: string;
  orderId: string | null;
  totalAmount: number;
  installments: number;
  installmentAmount: number;
  interestRate: number;
  paidAmount: number;
  paidInstallments: number;
  status: string;
  nextDueDate: string;
  createdAt: string;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProfile(p: any): DbCreditProfile {
  return {
    id: p.id,
    tenantId: p.tenantId,
    customerId: p.customerId,
    creditScore: p.creditScore,
    creditLimit: p.creditLimit,
    usedCredit: p.usedCredit,
    availableCredit: p.availableCredit,
    riskLevel: p.riskLevel,
    totalLoans: p.totalLoans,
    paidOnTime: p.paidOnTime,
    paidLate: p.paidLate,
    defaulted: p.defaulted,
    avgTicket: p.avgTicket,
    purchaseFreqDays: p.purchaseFreqDays ?? null,
    lastScoreUpdate: p.lastScoreUpdate.toISOString(),
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapInstallment(i: any): DbCreditInstallment {
  return {
    id: i.id,
    tenantId: i.tenantId,
    creditProfileId: i.creditProfileId,
    orderId: i.orderId ?? null,
    totalAmount: i.totalAmount,
    installments: i.installments,
    installmentAmount: i.installmentAmount,
    interestRate: i.interestRate,
    paidAmount: i.paidAmount,
    paidInstallments: i.paidInstallments,
    status: i.status,
    nextDueDate: i.nextDueDate.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

// ── CreditDB ─────────────────────────────────────────────────────────────────

export const CreditDB = {
  /**
   * Lista los perfiles crediticios del tenant con filtros opcionales.
   */
  async listProfiles(
    tenantId: string,
    opts?: {
      riskLevel?: string;
      isActive?: boolean;
      minScore?: number;
      take?: number;
      skip?: number;
    },
  ): Promise<DbCreditProfile[]> {
    const profiles = await prisma.creditProfile.findMany({
      where: {
        tenantId,
        ...(opts?.riskLevel ? { riskLevel: opts.riskLevel } : {}),
        ...(opts?.isActive !== undefined ? { isActive: opts.isActive } : {}),
        ...(opts?.minScore !== undefined ? { creditScore: { gte: opts.minScore } } : {}),
      },
      orderBy: { creditScore: "desc" },
      take: opts?.take ?? 50,
      skip: opts?.skip ?? 0,
    });

    return profiles.map(mapProfile);
  },

  /**
   * Retorna el perfil crediticio de un cliente específico.
   */
  async getProfile(
    tenantId: string,
    customerId: string,
  ): Promise<DbCreditProfile | null> {
    const p = await prisma.creditProfile.findUnique({
      where: { tenantId_customerId: { tenantId, customerId } },
    });
    return p ? mapProfile(p) : null;
  },

  /**
   * Lista los planes de cuotas de un perfil crediticio.
   */
  async getInstallments(
    tenantId: string,
    creditProfileId: string,
  ): Promise<DbCreditInstallment[]> {
    const items = await prisma.creditInstallment.findMany({
      where: { tenantId, creditProfileId },
      orderBy: { createdAt: "desc" },
    });
    return items.map(mapInstallment);
  },

  /**
   * Lista planes de cuotas con status "overdue" o "defaulted" para un tenant.
   */
  async listOverduePlans(tenantId: string): Promise<DbCreditInstallment[]> {
    const items = await prisma.creditInstallment.findMany({
      where: {
        tenantId,
        status: { in: ["overdue", "defaulted"] },
      },
      orderBy: { nextDueDate: "asc" },
    });
    return items.map(mapInstallment);
  },

  /**
   * Resumen de crédito por tenant para el dashboard admin.
   */
  async summary(tenantId: string): Promise<{
    totalProfiles: number;
    activeProfiles: number;
    totalCreditGranted: number;
    totalCreditUsed: number;
    overduePlans: number;
    defaultedPlans: number;
  }> {
    const [totals, overdue, defaulted] = await Promise.all([
      prisma.creditProfile.aggregate({
        where: { tenantId },
        _count: { id: true },
        _sum: { creditLimit: true, usedCredit: true },
      }),
      prisma.creditInstallment.count({
        where: { tenantId, status: "overdue" },
      }),
      prisma.creditInstallment.count({
        where: { tenantId, status: "defaulted" },
      }),
    ]);

    const activeCount = await prisma.creditProfile.count({
      where: { tenantId, isActive: true },
    });

    return {
      totalProfiles: totals._count.id,
      activeProfiles: activeCount,
      // TD-018: _sum.creditLimit / usedCredit son Decimal | null
      totalCreditGranted: toNumOrZero(totals._sum.creditLimit),
      totalCreditUsed: toNumOrZero(totals._sum.usedCredit),
      overduePlans: overdue,
      defaultedPlans: defaulted,
    };
  },
};
