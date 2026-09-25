import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import {
  RULES,
  computeMatches,
  getAutomationState,
  setAutomationState,
  getNotifyLog,
  setNotifyLog,
} from "@/lib/superadmin/automations";
import {
  partitionByCooldown,
  recordNotified,
  getCooldownDays,
  type NotifyLog,
} from "@/lib/superadmin/automation-cooldown";
import { notifyTenantOwnerSecurity } from "@/lib/auth/security-alerts";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/automations
 *
 * Worker de /superadmin/automations: ejecuta las reglas HABILITADAS y avisa al
 * dueno de cada tienda que matchea (WhatsApp + push). Aplica un COOLDOWN por
 * (regla, tenant) para no re-notificar a diario (default 7d, AUTOMATION_COOLDOWN_DAYS).
 *
 * `?dryRun=1` calcula a quien se notificaria (matched/notified/skipped) SIN
 * enviar nada ni escribir el log — util para previsualizar el cron.
 *
 * Autorizacion: Bearer <CRON_SECRET>. Schedule en vercel.json (diario 8am).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const state = await getAutomationState();
    const cooldownMs = getCooldownDays() * 86_400_000;
    const now = Date.now();
    let log: NotifyLog = await getNotifyLog();

    const results: Record<string, { matched: number; notified: number; skipped: number }> = {};
    let logTouched = false;

    for (const rule of RULES) {
      if (!state[rule.key]?.enabled) continue;
      const matches = (await computeMatches(rule.key)).slice(0, 500);
      const { toNotify, skipped } = partitionByCooldown(matches, log, rule.key, now, cooldownMs);

      if (!dryRun) {
        for (const t of toNotify) {
          // Fire-and-forget: un fallo de envio no debe frenar el cron.
          notifyTenantOwnerSecurity(t.id, { title: rule.message.title, body: rule.message.body, url: "/admin" })
            .catch((err) => logger.warn("[cron/automations] notify failed", { tenantId: t.id, rule: rule.key, error: String(err) }));
        }
        if (toNotify.length > 0) {
          log = recordNotified(log, rule.key, toNotify.map((t) => t.id), now, cooldownMs);
          logTouched = true;
        }
        state[rule.key] = { ...state[rule.key], lastRunAt: new Date(now).toISOString() };
      }

      results[rule.key] = { matched: matches.length, notified: toNotify.length, skipped: skipped.length };
    }

    if (!dryRun && Object.keys(results).length > 0) {
      if (logTouched) await setNotifyLog(log, "cron");
      await setAutomationState(state, "cron");
      logActivity(
        "automations_cron_run",
        "PlatformSetting",
        `Cron automatizaciones: ${Object.entries(results).map(([k, r]) => `${k}=${r.notified}/${r.matched}`).join(", ")}`,
      ).catch((err) => logger.warn("[cron/automations] activity log failed", { error: String(err) }));
    }

    return NextResponse.json({ ok: true, dryRun, cooldownDays: getCooldownDays(), ran: results });
  } catch (e) {
    logger.error("[cron/automations] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
