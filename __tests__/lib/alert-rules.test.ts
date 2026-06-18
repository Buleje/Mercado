import { describe, it, expect } from "vitest";
import {
  buildAlerts,
  alertCounts,
  getAlertConfig,
  DEFAULT_ALERT_CONFIG,
  type AlertInput,
  type AlertConfig,
} from "@/lib/superadmin/alert-rules";

const NOW = new Date("2026-06-17T12:00:00Z").getTime();
const cfg: AlertConfig = DEFAULT_ALERT_CONFIG;
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

function input(over: Partial<AlertInput> = {}): AlertInput {
  return {
    urgentTickets: [],
    expiringTrials: [],
    slaCount: 0,
    oldestStaleOrderAt: null,
    newTenantCount: 0,
    staleTenants: [],
    ...over,
  };
}

describe("getAlertConfig", () => {
  it("default sin env", () => {
    expect(getAlertConfig({})).toEqual(DEFAULT_ALERT_CONFIG);
  });
  it("override por entorno (sin redeploy)", () => {
    const c = getAlertConfig({ ALERT_SLA_HOURS: "4", ALERT_TRIAL_CRITICAL_DAYS: "2" });
    expect(c.slaHours).toBe(4);
    expect(c.trialCriticalDays).toBe(2);
    expect(c.staleTenantDays).toBe(DEFAULT_ALERT_CONFIG.staleTenantDays);
  });
});

describe("buildAlerts — escalación de tickets", () => {
  it("ticket reciente → warning", () => {
    const [a] = buildAlerts(input({ urgentTickets: [{ id: "t1", subject: "Caída", tenantName: "Bodega", createdAt: ago(10) }] }), cfg, NOW);
    expect(a.severity).toBe("warning");
  });
  it("ticket viejo (>60min) → critical (escalado)", () => {
    const [a] = buildAlerts(input({ urgentTickets: [{ id: "t1", subject: "Caída", tenantName: "Bodega", createdAt: ago(90) }] }), cfg, NOW);
    expect(a.severity).toBe("critical");
    expect(a.title).toMatch(/escalado/);
  });
});

describe("buildAlerts — escalación de trials", () => {
  it("trial a 3d → warning", () => {
    const [a] = buildAlerts(input({ expiringTrials: [{ slug: "x", name: "X", trialEndsAt: inDays(3) }] }), cfg, NOW);
    expect(a.severity).toBe("warning");
  });
  it("trial a ≤1d → critical", () => {
    const [a] = buildAlerts(input({ expiringTrials: [{ slug: "x", name: "X", trialEndsAt: inDays(1) }] }), cfg, NOW);
    expect(a.severity).toBe("critical");
  });
});

describe("buildAlerts — escalación de SLA", () => {
  it("pendiente más viejo dentro del umbral → warning", () => {
    const a = buildAlerts(input({ slaCount: 3, oldestStaleOrderAt: ago(3 * 60) }), cfg, NOW).find((x) => x.kind === "sla")!;
    expect(a.severity).toBe("warning");
  });
  it("pendiente más viejo >6h → critical", () => {
    const a = buildAlerts(input({ slaCount: 3, oldestStaleOrderAt: ago(7 * 60) }), cfg, NOW).find((x) => x.kind === "sla")!;
    expect(a.severity).toBe("critical");
    expect(a.detail).toMatch(/SLA crítico/);
  });
});

describe("buildAlerts — stale/new + orden", () => {
  it("tiendas estancadas = warning, nuevas = info", () => {
    const alerts = buildAlerts(input({ staleTenants: [{ name: "A" }, { name: "B" }], newTenantCount: 2 }), cfg, NOW);
    expect(alerts.find((a) => a.kind === "stale")?.severity).toBe("warning");
    expect(alerts.find((a) => a.kind === "new")?.severity).toBe("info");
  });

  it("ordena critical → warning → info", () => {
    const alerts = buildAlerts(
      input({
        newTenantCount: 1,
        expiringTrials: [{ slug: "x", name: "X", trialEndsAt: inDays(0) }], // critical
        staleTenants: [{ name: "A" }], // warning
      }),
      cfg,
      NOW,
    );
    const sevs = alerts.map((a) => a.severity);
    expect(sevs).toEqual(["critical", "warning", "info"]);
  });
});

describe("alertCounts", () => {
  it("cuenta por severidad", () => {
    const alerts = buildAlerts(
      input({
        urgentTickets: [{ id: "t1", subject: "s", tenantName: "T", createdAt: ago(90) }], // critical
        staleTenants: [{ name: "A" }], // warning
        newTenantCount: 3, // info
      }),
      cfg,
      NOW,
    );
    expect(alertCounts(alerts)).toEqual({ critical: 1, warning: 1, info: 1, total: 3 });
  });
});
