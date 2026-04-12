import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #33 — Disputas cliente-vendedor con SLA
 *
 * Modelo de disputas almacenado en ActivityLog con entity="dispute".
 * Flujo: open → seller_response → resolved | escalated → closed.
 * SLA por default: 48h para seller response, 72h para resolucion.
 */

export type DisputeStatus =
  | "open"
  | "seller_response"
  | "escalated"
  | "resolved"
  | "closed";

export interface Dispute {
  id: string;
  tenantId: string;
  orderId: string;
  customerId: string;
  reason: string;
  amount: number;
  status: DisputeStatus;
  slaDueAt: string;
  createdAt: string;
  updatedAt: string;
  resolution?: string;
  history: { at: string; actor: string; action: string; note?: string }[];
}

const SLA_SELLER_RESPONSE_HOURS = 48;

function newId(): string {
  return `disp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function openDispute(input: {
  tenantId: string;
  orderId: string;
  customerId: string;
  reason: string;
  amount: number;
}): Promise<Dispute> {
  const now = new Date();
  const slaDue = new Date(now.getTime() + SLA_SELLER_RESPONSE_HOURS * 60 * 60 * 1000);
  const dispute: Dispute = {
    id: newId(),
    tenantId: input.tenantId,
    orderId: input.orderId,
    customerId: input.customerId,
    reason: input.reason,
    amount: input.amount,
    status: "open",
    slaDueAt: slaDue.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    history: [
      {
        at: now.toISOString(),
        actor: `customer:${input.customerId}`,
        action: "opened",
        note: input.reason,
      },
    ],
  };

  try {
    await prisma.activityLog.create({
      data: {
        tenantId: input.tenantId,
        entity: "dispute",
        entityId: dispute.id,
        action: "open",
        detail: JSON.stringify(dispute),
        user: `customer:${input.customerId}`,
      },
    });
  } catch (err) {
    logger.error("[dispute] persist failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return dispute;
}

export async function listDisputes(
  tenantId: string,
  filters: { status?: DisputeStatus } = {},
): Promise<Dispute[]> {
  try {
    const rows = await prisma.activityLog.findMany({
      where: { tenantId, entity: "dispute" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const disputes: Dispute[] = [];
    for (const row of rows) {
      try {
        const d = JSON.parse(row.detail) as Dispute;
        if (filters.status && d.status !== filters.status) continue;
        disputes.push(d);
      } catch {
        // skip corrupt row
      }
    }
    return disputes;
  } catch (err) {
    logger.warn("[dispute] list failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function getOverdueDisputes(tenantId: string): Promise<Dispute[]> {
  const all = await listDisputes(tenantId);
  const now = Date.now();
  return all.filter(
    (d) =>
      d.status !== "resolved" &&
      d.status !== "closed" &&
      new Date(d.slaDueAt).getTime() < now,
  );
}
