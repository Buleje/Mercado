import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #60 — Delivery schedule slots
 *
 * Permite definir ventanas de entrega por día (e.g. 9-11, 11-13, 15-17, 18-20)
 * con capacidad máxima por slot. El checkout muestra solo los slots con
 * cupo disponible. La disponibilidad se calcula contando las órdenes con
 * `deliverySlotId` asignado en esa fecha.
 *
 * Sin campo dedicado en schema: usa configuración por defecto y
 * estima carga por franja usando createdAt del pedido.
 */

export interface DeliverySlot {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  capacityPerDay: number;
  daysOfWeek: number[];
}

export interface AvailableSlot extends DeliverySlot {
  date: string;
  used: number;
  remaining: number;
}

const DEFAULT_SLOTS: DeliverySlot[] = [
  { id: "morning", label: "Mañana (9-11)", startHour: 9, endHour: 11, capacityPerDay: 10, daysOfWeek: [1, 2, 3, 4, 5, 6] },
  { id: "noon", label: "Mediodía (11-13)", startHour: 11, endHour: 13, capacityPerDay: 10, daysOfWeek: [1, 2, 3, 4, 5, 6] },
  { id: "afternoon", label: "Tarde (15-17)", startHour: 15, endHour: 17, capacityPerDay: 10, daysOfWeek: [1, 2, 3, 4, 5, 6] },
  { id: "evening", label: "Noche (18-20)", startHour: 18, endHour: 20, capacityPerDay: 8, daysOfWeek: [1, 2, 3, 4, 5] },
];

async function readConfig(tenantId: string): Promise<DeliverySlot[]> {
  void tenantId;
  return DEFAULT_SLOTS;
}

export async function getAvailableSlotsForDate(
  tenantId: string,
  date: Date,
): Promise<AvailableSlot[]> {
  const config = await readConfig(tenantId);
  const dow = date.getDay();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const applicable = config.filter((s) => s.daysOfWeek.includes(dow));
  if (applicable.length === 0) return [];

  let orders: { createdAt: Date }[] = [];
  try {
    orders = await prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: { createdAt: true },
    });
  } catch (err) {
    logger.warn("[delivery-slots] query orders failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const used: Record<string, number> = {};
  for (const o of orders) {
    const hour = o.createdAt.getHours();
    for (const slot of applicable) {
      if (hour >= slot.startHour && hour < slot.endHour) {
        used[slot.id] = (used[slot.id] ?? 0) + 1;
      }
    }
  }

  const isoDate = dayStart.toISOString().slice(0, 10);
  return applicable.map((s) => ({
    ...s,
    date: isoDate,
    used: used[s.id] ?? 0,
    remaining: Math.max(0, s.capacityPerDay - (used[s.id] ?? 0)),
  }));
}

export async function getAvailableSlotsForNextDays(
  tenantId: string,
  days = 3,
): Promise<AvailableSlot[]> {
  const out: AvailableSlot[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const slots = await getAvailableSlotsForDate(tenantId, d);
    out.push(...slots.filter((s) => s.remaining > 0));
  }
  return out;
}
