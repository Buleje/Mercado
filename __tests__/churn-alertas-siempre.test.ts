/**
 * Alertas de abandono vivas (noche 2026-10-09).
 *
 * Antes: con CHURN_AUTORUN apagado el cron hacía `continue` antes de
 * `executePlaybook`, el ÚNICO lugar que guardaba la ChurnSignal → la última era
 * del 09-05 aunque el cron marcaba 18 negocios en riesgo en 2 días.
 * Ahora: la alerta se guarda SIEMPRE (una abierta por tipo); CHURN_AUTORUN sólo
 * decide la acción, y la acción va una vez por alerta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  registrarAbierta: vi.fn(),
  cerrarAusentes: vi.fn(),
  huboIntervencionDesde: vi.fn(),
  reclamar: vi.fn(),
  anotarIntervencion: vi.fn(),
  liberar: vi.fn(),
  listPlaybooks: vi.fn(),
  tenantFindMany: vi.fn(),
  calculateHealthScore: vi.fn(),
  detectSignals: vi.fn(),
  saveHealthScore: vi.fn(),
  getPreviousScore: vi.fn(),
  playbookFindById: vi.fn(),
  playbookUpdate: vi.fn(),
}));

vi.mock("@/lib/db/superadmin-churn-signals.db", () => ({
  SuperadminChurnSignalsDB: {
    registrarAbierta: m.registrarAbierta,
    cerrarAusentes: m.cerrarAusentes,
    huboIntervencionDesde: m.huboIntervencionDesde,
    reclamar: m.reclamar,
    anotarIntervencion: m.anotarIntervencion,
    liberar: m.liberar,
  },
}));
vi.mock("@/lib/db/superadmin-churn-playbooks.db", () => ({
  SuperadminChurnPlaybooksDB: {
    list: m.listPlaybooks,
    findById: m.playbookFindById,
    update: m.playbookUpdate,
    findByName: vi.fn(),
  },
}));
vi.mock("@/lib/superadmin-auth", () => ({
  requirePlatformAPI: vi.fn(async () => ({ username: "superadmin" })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/audit/superadmin-audit", () => ({ logSuperadminAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findMany: m.tenantFindMany } } }));
vi.mock("@/lib/cron-retry", () => ({
  withCronRetry: (_name: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/churn/health-scorer", () => ({
  calculateHealthScore: m.calculateHealthScore,
  detectSignals: m.detectSignals,
  saveHealthScore: m.saveHealthScore,
  getPreviousScore: m.getPreviousScore,
}));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));

import { unirSenalesPorTipo, debeCerrarAusentes } from "@/lib/churn/signal-merge";
import { registrarSenales } from "@/lib/churn/registrar-senales";
import { executePlaybook } from "@/lib/churn/intervention-engine";
import { GET as cronGET } from "@/app/api/cron/churn-score/route";
import { PATCH as playbookPATCH } from "@/app/api/superadmin/churn/playbooks/route";

const TENANT = {
  id: "t-qa",
  slug: "qa",
  name: "QA",
  ownerEmail: null,
  ownerPhone: null,
  plan: "free",
  trialEndsAt: null,
};

const PLAYBOOKS = [
  { id: "p1", name: "login_drop_7d", triggerSignal: "login_drop", triggerSeverity: "high", action: "whatsapp", templateId: "login_drop_wa", discountPercent: null, discountDays: null },
  { id: "p2", name: "critical_score", triggerSignal: "login_drop", triggerSeverity: "critical", action: "call", templateId: null, discountPercent: null, discountDays: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.cerrarAusentes.mockResolvedValue(0);
  m.huboIntervencionDesde.mockResolvedValue(false);
  m.reclamar.mockResolvedValue(true);
  m.anotarIntervencion.mockResolvedValue(undefined);
  m.liberar.mockResolvedValue(undefined);
  m.listPlaybooks.mockResolvedValue(PLAYBOOKS);
});

describe("unirSenalesPorTipo", () => {
  it("tres login_drop de una corrida = una alerta con la severidad más alta y los motivos juntos", () => {
    const r = unirSenalesPorTipo([
      { signalType: "login_drop", severity: "high", detail: "Sin login en 9 días" },
      { signalType: "trial_expiring", severity: "high", detail: "Trial expira en 2" },
      { signalType: "login_drop", severity: "critical", detail: "Score crítico: 12/100" },
      { signalType: "login_drop", severity: "high", detail: "Sin login en 9 días" },
    ]);
    expect(r).toHaveLength(2);
    const login = r.find((s) => s.signalType === "login_drop");
    expect(login?.severity).toBe("critical");
    expect(login?.detail).toBe("Sin login en 9 días · Score crítico: 12/100");
  });

  it("sólo cierra las ausentes si el negocio salió del riesgo alto", () => {
    expect(debeCerrarAusentes("low")).toBe(true);
    expect(debeCerrarAusentes("medium")).toBe(true);
    expect(debeCerrarAusentes("high")).toBe(false);
    expect(debeCerrarAusentes("critical")).toBe(false);
  });
});

describe("registrarSenales", () => {
  it("guarda una por tipo con el tenantId primero y no cierra nada si sigue en riesgo crítico", async () => {
    m.registrarAbierta.mockResolvedValue({ id: "s1", intervention: null, creada: true });
    const r = await registrarSenales(
      "t-qa",
      [
        { signalType: "login_drop", severity: "high", detail: "a" },
        { signalType: "login_drop", severity: "critical", detail: "b" },
      ],
      "critical",
    );
    expect(m.registrarAbierta).toHaveBeenCalledTimes(1);
    expect(m.registrarAbierta).toHaveBeenCalledWith("t-qa", { signalType: "login_drop", severity: "critical", detail: "a · b" });
    expect(m.cerrarAusentes).not.toHaveBeenCalled();
    expect(r.alertas[0]).toMatchObject({ id: "s1", creada: true });
  });

  it("negocio recuperado (medium) cierra las abiertas que hoy no aparecieron", async () => {
    m.cerrarAusentes.mockResolvedValue(2);
    const r = await registrarSenales("t-qa", [], "medium");
    expect(m.cerrarAusentes).toHaveBeenCalledWith("t-qa", []);
    expect(r.cerradas).toBe(2);
  });
});

describe("executePlaybook", () => {
  const critica = { signalType: "login_drop", severity: "critical" as const, detail: "Score crítico" };

  it("una alerta que ya tuvo acción no se vuelve a tocar", async () => {
    await executePlaybook(critica, TENANT, { id: "s1", intervention: "WhatsApp enviado" });
    expect(m.listPlaybooks).not.toHaveBeenCalled();
    expect(m.reclamar).not.toHaveBeenCalled();
  });

  it("gana la regla más específica (crítico → llamada) y anota sobre la MISMA alerta", async () => {
    await executePlaybook(critica, TENANT, { id: "s1", intervention: null });
    expect(m.reclamar).toHaveBeenCalledWith("t-qa", "s1", "En curso: critical_score");
    expect(m.anotarIntervencion).toHaveBeenCalledWith("t-qa", "s1", "Marcado para llamada manual por equipo de retención");
  });

  it("si otra corrida ya la reclamó, no actúa ni anota", async () => {
    m.reclamar.mockResolvedValue(false);
    await executePlaybook(critica, TENANT, { id: "s1", intervention: null });
    expect(m.anotarIntervencion).not.toHaveBeenCalled();
  });

  it("WhatsApp que no sale (negocio sin teléfono) libera la alerta en vez de anotar «skip»", async () => {
    const alta = { signalType: "login_drop", severity: "high" as const, detail: "Sin login en 9 días" };
    await executePlaybook(alta, TENANT, { id: "s1", intervention: null });
    expect(m.reclamar).toHaveBeenCalledWith("t-qa", "s1", "En curso: login_drop_7d");
    expect(m.liberar).toHaveBeenCalledWith("t-qa", "s1", "En curso: login_drop_7d");
    expect(m.anotarIntervencion).not.toHaveBeenCalled();
  });

  it("fila vieja con «WhatsApp skip (sin config)» cuenta como sin acción: la llamada actúa", async () => {
    await executePlaybook(critica, TENANT, { id: "s1", intervention: "WhatsApp skip (sin config)" });
    expect(m.anotarIntervencion).toHaveBeenCalledWith("t-qa", "s1", "Marcado para llamada manual por equipo de retención");
  });

  it("con acción en la última semana para ese tipo, no reclama", async () => {
    m.huboIntervencionDesde.mockResolvedValue(true);
    await executePlaybook(critica, TENANT, { id: "s1", intervention: null });
    expect(m.reclamar).not.toHaveBeenCalled();
  });
});

describe("cron churn-score", () => {
  const SECRET = "test-churn-secret";
  const req = () => new NextRequest("http://localhost/api/cron/churn-score", { headers: { authorization: `Bearer ${SECRET}` } });

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    m.tenantFindMany.mockResolvedValue([TENANT]);
    m.getPreviousScore.mockResolvedValue(null);
    m.calculateHealthScore.mockResolvedValue({ tenantId: "t-qa", score: 12, riskLevel: "critical" });
    m.saveHealthScore.mockResolvedValue(undefined);
    m.detectSignals.mockResolvedValue([critica()]);
    m.registrarAbierta.mockResolvedValue({ id: "s1", intervention: null, creada: true });
  });
  afterEach(() => {
    delete process.env.CHURN_AUTORUN;
  });
  function critica() {
    return { signalType: "login_drop", severity: "critical", detail: "Score crítico: 12/100" };
  }

  it("sin CHURN_AUTORUN guarda la alerta igual y no ejecuta la regla", async () => {
    const res = await cronGET(req());
    const body = await res.json();
    expect(m.registrarAbierta).toHaveBeenCalledWith("t-qa", critica());
    expect(m.reclamar).not.toHaveBeenCalled();
    expect(body).toMatchObject({ senalesNuevas: 1, playbookDryRuns: 1, playbookExecutions: 0, churnAutorun: false });
  });

  it("con CHURN_AUTORUN=true ejecuta la regla una vez y espera la acción antes de responder", async () => {
    process.env.CHURN_AUTORUN = "true";
    const res = await cronGET(req());
    const body = await res.json();
    expect(body).toMatchObject({ playbookExecutions: 1, playbookDryRuns: 0 });
    expect(m.anotarIntervencion).toHaveBeenCalledTimes(1);
  });

  it("alerta abierta que ya tuvo acción: ni dry-run ni ejecución", async () => {
    process.env.CHURN_AUTORUN = "true";
    m.registrarAbierta.mockResolvedValue({ id: "s1", intervention: "Email enviado", creada: false });
    const body = await (await cronGET(req())).json();
    expect(body).toMatchObject({ senalesNuevas: 0, playbookExecutions: 0, playbookDryRuns: 0 });
  });

  it("alerta vieja con «Email skip (sin config)» y CHURN_AUTORUN=true: sí se ejecuta", async () => {
    process.env.CHURN_AUTORUN = "true";
    m.registrarAbierta.mockResolvedValue({ id: "s1", intervention: "Email skip (sin config)", creada: false });
    const body = await (await cronGET(req())).json();
    expect(body).toMatchObject({ playbookExecutions: 1 });
    expect(m.anotarIntervencion).toHaveBeenCalledTimes(1);
  });

  it("sin el secreto del cron → 401 y no toca la base", async () => {
    const res = await cronGET(new NextRequest("http://localhost/api/cron/churn-score"));
    expect(res.status).toBe(401);
    expect(m.tenantFindMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/superadmin/churn/playbooks", () => {
  it("pausar manda SÓLO isActive: el umbral no vuelve a «high» (Zod 4 .partial() conservaba el default)", async () => {
    m.playbookFindById.mockResolvedValue({ id: "p2", name: "critical_score", triggerSeverity: "critical" });
    m.playbookUpdate.mockResolvedValue({ id: "p2", name: "critical_score", triggerSeverity: "critical", isActive: false });
    const res = await playbookPATCH(
      new NextRequest("http://localhost/api/superadmin/churn/playbooks", {
        method: "PATCH",
        body: JSON.stringify({ id: "p2", isActive: false }),
      }),
    );
    expect(res.status).toBe(200);
    expect(m.playbookUpdate).toHaveBeenCalledWith("p2", { isActive: false });
  });
});
