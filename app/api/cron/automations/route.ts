import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { RULES, computeMatches, getAutomationState, setAutomationState } from "@/lib/superadmin/automations";
import { notifyTenantOwnerSecurity } from "@/lib/auth/security-alerts";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/automations
 *
 * Ejecuta las reglas de automatización HABILITADAS (PlatformSetting["automations"]).
 * Para cada regla on, busca las tiendas que matchean ahora y avisa al dueño
 * (WhatsApp + push). Marca lastRunAt. Es el "worker" del feature /superadmin/automations
 * (antes solo había "ejecutar ahora" manual).
 *
 * Autorización: Bearer <CRON_SECRET>. Schedule en vercel.json (diario 8am).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await getAutomationState();
    const results: Record<string, number> = {};

    for (const rule of RULES) {
      if (!state[rule.key]?.enabled) continue;
      const matches = (await computeMatches(rule.key)).slice(0, 500);
      for (const t of matches) {
        // Fire-and-forget: un fallo de envío no debe frenar el cron.
        notifyTenantOwnerSecurity(t.id, { title: rule.message.title, body: rule.message.body, url: "/admin" })
          .catch((err) => logger.warn("[cron/automations] notify failed", { tenantId: t.id, rule: rule.key, error: String(err) }));
      }
      state[rule.key] = { ...state[rule.key], lastRunAt: new Date().toISOString() };
      results[rule.key] = matches.length;
    }

    if (Object.keys(results).length > 0) {
      await setAutomationState(state, "cron");
      logActivity(
        "automations_cron_run",
        "PlatformSetting",
        `Cron automatizaciones: ${Object.entries(results).map(([k, n]) => `${k}=${n}`).join(", ")}`,
      ).catch((err) => logger.warn("[cron/automations] activity log failed", { error: String(err) }));
    }

    return NextResponse.json({ ok: true, ran: results });
  } catch (e) {
    logger.error("[cron/automations] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
