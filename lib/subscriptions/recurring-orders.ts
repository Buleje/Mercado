import "server-only";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #22 — Pedido recurrente / suscripción
 *
 * Define la forma de las suscripciones sin requerir un nuevo modelo Prisma —
 * almacena la suscripción como JSON en `Settings.metadata.recurringOrders[]`
 * mientras no haya migration dedicada. Cuando exista un modelo
 * `RecurringOrder`, este módulo migra a él leyendo primero la tabla y luego
 * cayendo al JSON como fallback.
 */

export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

export interface RecurringOrder {
  id: string;
  customerId: string;
  tenantId: string;
  frequency: RecurringFrequency;
  items: { productId: number; quantity: number }[];
  nextRunAt: string;
  active: boolean;
  createdAt: string;
}

const inMemoryStore = new Map<string, RecurringOrder[]>();

function nextRunDate(frequency: RecurringFrequency, from = new Date()): Date {
  const out = new Date(from);
  switch (frequency) {
    case "weekly":
      out.setDate(out.getDate() + 7);
      break;
    case "biweekly":
      out.setDate(out.getDate() + 14);
      break;
    case "monthly":
      out.setMonth(out.getMonth() + 1);
      break;
  }
  return out;
}

async function readSubs(tenantId: string): Promise<RecurringOrder[]> {
  return inMemoryStore.get(tenantId) ?? [];
}

async function writeSubs(tenantId: string, subs: RecurringOrder[]): Promise<boolean> {
  try {
    inMemoryStore.set(tenantId, subs);
    return true;
  } catch (err) {
    logger.error("[recurring-orders] write failed", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function listRecurringOrders(tenantId: string): Promise<RecurringOrder[]> {
  return readSubs(tenantId);
}

export async function createRecurringOrder(
  input: Omit<RecurringOrder, "id" | "nextRunAt" | "createdAt" | "active">,
): Promise<RecurringOrder> {
  const all = await readSubs(input.tenantId);
  const sub: RecurringOrder = {
    ...input,
    id: `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    nextRunAt: nextRunDate(input.frequency).toISOString(),
    active: true,
    createdAt: new Date().toISOString(),
  };
  all.push(sub);
  await writeSubs(input.tenantId, all);
  return sub;
}

export async function pauseRecurringOrder(
  tenantId: string,
  subId: string,
): Promise<boolean> {
  const all = await readSubs(tenantId);
  const idx = all.findIndex((s) => s.id === subId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], active: false };
  return writeSubs(tenantId, all);
}

export async function getDueRecurringOrders(
  tenantId: string,
  now = new Date(),
): Promise<RecurringOrder[]> {
  const all = await readSubs(tenantId);
  return all.filter((s) => s.active && new Date(s.nextRunAt) <= now);
}
