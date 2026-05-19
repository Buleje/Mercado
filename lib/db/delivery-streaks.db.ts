import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StreakData = {
  days: number;
  /** 7 booleanos: lunes[0]…domingo[6] de la semana ISO actual. true = hubo entrega ese día. */
  recentDays: boolean[];
};

export type WeeklyGoal = {
  current: number;
  target: number;
  daysRemaining: number;
};

export type Bonus = {
  id: string;
  icon: string;
  label: string;
  tone: string;
  current?: number;
  target?: number;
};

export type StreaksPayload = {
  streak: StreakData;
  weeklyGoal: WeeklyGoal;
  bonuses: Bonus[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Devuelve el lunes de la semana ISO que contiene `date` (UTC). */
function isoWeekMonday(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay(): 0=dom, 1=lun … 6=sab. ISO: lunes = día 1.
  const dow = d.getUTCDay(); // 0–6
  const diff = dow === 0 ? -6 : 1 - dow; // cuántos días restar para llegar al lunes
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Devuelve el domingo de la semana ISO (= lunes + 6 días), al final del día UTC. */
function isoWeekSunday(monday: Date): Date {
  const d = new Date(monday);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Representa una fecha UTC solo por "YYYY-MM-DD". */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── DB Class ─────────────────────────────────────────────────────────────────

export class DeliveryStreaksDb {
  /**
   * Calcula streak, progreso semanal y bonuses para el repartidor.
   *
   * @param partnerId  ID del DeliveryPartner (global, no tenant-scoped)
   */
  static async getStreaks(partnerId: string): Promise<StreaksPayload> {
    return getOrSet(`streaks-${partnerId}`, 60, () =>
      DeliveryStreaksDb._compute(partnerId),
    );
  }

  // ─── Cálculo principal ──────────────────────────────────────────────────────

  private static async _compute(partnerId: string): Promise<StreaksPayload> {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    // Ventana: 60 días atrás es suficiente para racha + semana actual
    const since60 = new Date(today);
    since60.setUTCDate(today.getUTCDate() - 59);

    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        partnerId,
        status: "delivered",
        deliveredAt: { gte: since60 },
      },
      select: { fee: true, tipAmount: true, deliveredAt: true },
      orderBy: { deliveredAt: "asc" },
    });

    // ── Días con entrega (Set de "YYYY-MM-DD") ────────────────────────────────
    const deliveredDays = new Set<string>();
    for (const a of assignments) {
      if (a.deliveredAt) deliveredDays.add(toDateKey(a.deliveredAt));
    }

    // ── Streak: días consecutivos hacia atrás desde hoy ──────────────────────
    let streakDays = 0;
    const cursor = new Date(today);
    while (deliveredDays.has(toDateKey(cursor))) {
      streakDays++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    // ── recentDays: lunes[0]…domingo[6] de la semana ISO actual ──────────────
    const monday = isoWeekMonday(today);
    const recentDays: boolean[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return deliveredDays.has(toDateKey(d));
    });

    // ── WeeklyGoal ────────────────────────────────────────────────────────────
    const sunday = isoWeekSunday(monday);
    const WEEKLY_TARGET = 600; // S/ 600 hardcoded (fase 1)

    let weeklyEarnings = 0;
    for (const a of assignments) {
      if (!a.deliveredAt) continue;
      const at = a.deliveredAt;
      if (at >= monday && at <= sunday) {
        weeklyEarnings += Number(a.fee) + Number(a.tipAmount ?? 0);
      }
    }

    // Días que faltan hasta el domingo 23:59 (incluyendo hoy si hoy < domingo)
    const todayKey = toDateKey(today);
    const sundayKey = toDateKey(sunday);
    let daysRemaining = 0;
    if (todayKey <= sundayKey) {
      const diffMs = sunday.getTime() - today.getTime();
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    // ── Bonuses ───────────────────────────────────────────────────────────────
    // trip5: entregas delivered HOY
    let todayDeliveries = 0;
    for (const a of assignments) {
      if (a.deliveredAt && toDateKey(a.deliveredAt) === todayKey) {
        todayDeliveries++;
      }
    }

    // Bonuses reales. Brandon mayo 2026 v7: removidos "Lluvia +30%" y
    // "Hora pico +S/3" — no existe sistema real que detecte clima ni franja
    // pico para premiar al rider, eran decorativos. Sólo dejamos `trip5`
    // (cuenta entregas reales de hoy) y `weekend` (multiplicador real sáb/dom).
    const bonuses: Bonus[] = [];
    bonuses.push({
      id: "trip5",
      icon: "📅",
      label: "Meta diaria",
      tone: "amber",
      current: todayDeliveries,
      target: 5,
    });
    // Bonus de fin de semana: real porque depende del día de la semana
    const todayDow = today.getUTCDay(); // 0=dom, 6=sáb
    if (todayDow === 0 || todayDow === 6) {
      bonuses.push({
        id: "weekend",
        icon: "📅",
        label: "Bonus fin de semana",
        tone: "amber",
      });
    }

    return {
      streak: { days: streakDays, recentDays },
      weeklyGoal: {
        current: Math.round(weeklyEarnings * 100) / 100,
        target: WEEKLY_TARGET,
        daysRemaining,
      },
      bonuses,
    };
  }
}
