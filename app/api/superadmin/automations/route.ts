import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { notifyTenantOwnerSecurity } from "@/lib/auth/security-alerts";
import { RULES, computeMatches, getAutomationState, setAutomationState, type RuleKey } from "@/lib/superadmin/automations";
import { logger } from "@/lib/logger";

// GET — reglas con su estado + cuántas tiendas matchean AHORA.
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;
  try {
    const state = await getAutomationState();
    // Conservamos la lista (no solo el conteo) para el dry-run preview: el
    // operador ve QUÉ tiendas recibirán el aviso antes de ejecutar.
    const matchLists = await Promise.all(
      RULES.map((r) =>
        computeMatches(r.key).catch(() => [] as Awaited<ReturnType<typeof computeMatches>>),
      ),
    );
    const rules = RULES.map((r, i) => ({
      key: r.key,
      title: r.title,
      trigger: r.trigger,
      action: r.action,
      enabled: state[r.key]?.enabled ?? false,
      lastRunAt: state[r.key]?.lastRunAt ?? null,
      matchCount: matchLists[i].length,
      matches: matchLists[i].slice(0, 100),
    }));
    return NextResponse.json({ rules });
  } catch (e) {
    logger.error("[automations] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

const PostSchema = z.object({
  key: z.enum(["trial-expiring", "no-login-14d", "near-limit", "stale-30d"]),
  op: z.enum(["toggle", "run"]),
  enabled: z.boolean().optional(),
});

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "sa-automations"); if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { key, op } = parsed.data;
  const rule = RULES.find((r) => r.key === key)!;

  try {
    const state = await getAutomationState();
    if (op === "toggle") {
      state[key] = { ...state[key], enabled: parsed.data.enabled ?? !(state[key]?.enabled ?? false) };
      await setAutomationState(state, session.username);
      logSuperadminAction("automation_toggle", `Regla ${key} → ${state[key].enabled ? "ON" : "OFF"}`, { key }, session.username).catch((err) => logger.warn("[automations] audit failed", { error: String(err) }));
      return NextResponse.json({ ok: true, enabled: state[key].enabled });
    }
    // op === "run": notificar a cada tienda que matchea (cap 200).
    const matches = (await computeMatches(key as RuleKey)).slice(0, 200);
    for (const t of matches) {
      notifyTenantOwnerSecurity(t.id, { title: rule.message.title, body: rule.message.body, url: "/admin" })
        .catch((err) => logger.warn("[automations] notify failed", { tenantId: t.id, error: String(err) }));
    }
    state[key] = { ...state[key], lastRunAt: new Date().toISOString() };
    await setAutomationState(state, session.username);
    logSuperadminAction("automation_run", `Ejecutó regla ${key} sobre ${matches.length} tiendas`, { key, count: matches.length }, session.username).catch((err) => logger.warn("[automations] audit failed", { error: String(err) }));
    return NextResponse.json({ ok: true, notified: matches.length });
  } catch (e) {
    logger.error("[automations] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
