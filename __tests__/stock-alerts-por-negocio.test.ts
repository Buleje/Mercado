/**
 * Cron /api/stock-alerts (09-10): cada negocio recibe sólo lo suyo.
 * Antes el push iba sin tenantId (a todos los suscriptores, con nombres de
 * productos de todos los negocios) y el registro de cada negocio llevaba las
 * «se agotan pronto» de los demás.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  broadcastPush: vi.fn().mockResolvedValue(undefined),
  logAdd: vi.fn().mockResolvedValue(undefined),
  email: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/push-sender", () => ({ broadcastPush: h.broadcastPush }));
vi.mock("@/lib/mailer-stock", () => ({ sendStockAlertEmail: h.email }));
vi.mock("@/lib/db/notifications.db", () => ({ NotificationLogsDB: { add: h.logAdd } }));
vi.mock("@/lib/inventario/stock-minimo.server", () => ({
  minimosGlobalesPorNegocio: vi.fn(async (ids: Iterable<string>) => new Map([...ids].map((t) => [t, 5]))),
}));
vi.mock("@/lib/db/stock-alerts.db", () => ({
  StockAlertsDB: {
    listActiveWithMinStock: vi.fn().mockResolvedValue([
      // A: sin mínimo propio, bajo el global (5) → alerta
      { id: 1, name: "Arroz de A", stock: 2, stockMin: null, category: "x", unit: "u", tenantId: "tenant-a" },
      // B: sobre su mínimo → no alerta
      { id: 2, name: "Azúcar de B", stock: 9, stockMin: 3, category: "x", unit: "u", tenantId: "tenant-b" },
      // Servicio sin stock controlado → nunca alerta
      { id: 3, name: "Delivery de A", stock: null, stockMin: null, category: "x", unit: "u", tenantId: "tenant-a" },
    ]),
    getRecentSalesVelocity: vi.fn().mockResolvedValue(new Map([[4, 3]])),
    listActiveWithStock: vi.fn().mockResolvedValue([
      // B: 6 u a 3/día = 2 días → «se agota pronto»
      { id: 4, name: "Aceite de B", stock: 6, stockMin: 2, category: "x", unit: "u", tenantId: "tenant-b" },
    ]),
  },
}));

import { GET } from "@/app/api/stock-alerts/route";

describe("cron de stock bajo: cada negocio sólo ve lo suyo", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cr3t";
    h.broadcastPush.mockClear();
    h.logAdd.mockClear();
  });

  it("sin el secreto del cron responde 401 y no avisa", async () => {
    const res = await GET(new NextRequest("http://x/api/stock-alerts"));
    expect(res.status).toBe(401);
    expect(h.broadcastPush).not.toHaveBeenCalled();
  });

  it("un push y un registro por negocio, con tenantId y sin productos ajenos", async () => {
    const res = await GET(
      new NextRequest("http://x/api/stock-alerts", { headers: { authorization: "Bearer s3cr3t" } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alerts: { name: string }[] };
    expect(body.alerts.map((a) => a.name)).toEqual(["Arroz de A"]);

    expect(h.broadcastPush).toHaveBeenCalledTimes(2);
    for (const [payload, tenantId] of h.broadcastPush.mock.calls as [{ body: string }, string][]) {
      expect(["tenant-a", "tenant-b"]).toContain(tenantId);
      if (tenantId === "tenant-a") {
        expect(payload.body).toContain("Arroz de A");
        expect(payload.body).not.toMatch(/de B/);
      } else {
        expect(payload.body).toContain("Aceite de B");
        expect(payload.body).not.toMatch(/de A/);
      }
    }

    const logs = h.logAdd.mock.calls as [{ message: string }, string][];
    expect(logs).toHaveLength(2);
    const logA = logs.find(([, t]) => t === "tenant-a")?.[0].message ?? "";
    expect(logA).toContain("Arroz de A");
    expect(logA).not.toContain("Aceite de B");
  });
});
