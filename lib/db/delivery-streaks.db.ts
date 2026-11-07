import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { limaDateKey, startOfLimaDay } from "@/lib/utils";

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
// Todo el bucketeo de día/semana es en zona Lima (UTC-5). El server corre en
// UTC: una entrega a las 20:00 Lima es 01:00 UTC del día siguiente. Sin esto,
// las entregas de la tarde-noche caían en el día/semana equivocada de la racha.

/**
 * Devuelve el lunes de la semana ISO de `anchor`, preservando el anclaje a las
 * 00:00 de Lima (= 05:00 UTC). Como `anchor` ya es 00:00 Lima, sus métodos UTC
 * reflejan el día de la semana de Lima.
 */
function isoWeekMonday(anchor: Date): Date {
  const d = new Date(anchor); // ya es 00:00 Lima (05:00 UTC)
  // getUTCDay(): 0=dom, 1=lun … 6=sab. ISO: lunes = día 1.
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow; // días a restar para llegar al lunes
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
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
    // "Hoy" del rider en zona Lima (UTC-5), anclado a 00:00 Lima = 05:00 UTC.
    const todayMs = startOfLimaDay(now);
    const today = new Date(todayMs);
    const todayKey = limaDateKey(now);

    // Ventana: 60 días atrás es suficiente para racha + semana actual
    const since60 = new Date(todayMs);
    since60.setUTCDate(since60.getUTCDate() - 59);

    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        partnerId,
        status: "delivered",
        deliveredAt: { gte: since60 },
      },
      select: { fee: true, tipAmount: true, deliveredAt: true },
      orderBy: { deliveredAt: "asc" },
    });

    // ── Días con entrega (Set de "YYYY-MM-DD" en zona Lima) ───────────────────
    const deliveredDays = new Set<string>();
    for (const a of assignments) {
      if (a.deliveredAt) deliveredDays.add(limaDateKey(a.deliveredAt));
    }

    // ── Streak: días Lima consecutivos hacia atrás desde hoy ─────────────────
    let streakDays = 0;
    const cursor = new Date(today);
    while (deliveredDays.has(limaDateKey(cursor))) {
      streakDays++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    // ── recentDays: lunes[0]…domingo[6] de la semana ISO actual (Lima) ───────
    const monday = isoWeekMonday(today);
    const recentDays: boolean[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      return deliveredDays.has(limaDateKey(d));
    });

    // ── WeeklyGoal ────────────────────────────────────────────────────────────
    // Fin de semana = 00:00 Lima del lunes siguiente (exclusivo). Así una entrega
    // del domingo por la noche (Lima) cuenta en su semana, no en la siguiente.
    const weekEnd = new Date(monday);
    weekEnd.setUTCDate(monday.getUTCDate() + 7);
    const WEEKLY_TARGET = 600; // S/ 600 hardcoded (fase 1)

    let weeklyEarnings = 0;
    for (const a of assignments) {
      if (!a.deliveredAt) continue;
      const at = a.deliveredAt;
      if (at >= monday && at < weekEnd) {
        weeklyEarnings += Number(a.fee) + Number(a.tipAmount ?? 0);
      }
    }

    // Días que faltan hasta el fin de la semana Lima (incluyendo hoy).
    const daysRemaining = Math.max(
      0,
      Math.round((weekEnd.getTime() - todayMs) / (1000 * 60 * 60 * 24)),
    );

    // ── Bonuses ───────────────────────────────────────────────────────────────
    // trip5: entregas delivered HOY (zona Lima)
    let todayDeliveries = 0;
    for (const a of assignments) {
      if (a.deliveredAt && limaDateKey(a.deliveredAt) === todayKey) {
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
