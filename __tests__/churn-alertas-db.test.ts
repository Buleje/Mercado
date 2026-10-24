/**
 * SuperadminChurnSignalsDB (noche 2026-10-09, pedido del revisor del carril SUPR).
 *
 * En producción las 14 alertas abiertas traían «WhatsApp/Email skip (sin config)»
 * y 4 pares negocio/tipo tenían 2-4 abiertas a la vez. Sin migración: la DB class
 * deja una sola abierta y vuelve a null lo que no fue una acción.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const p = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { churnSignal: p } }));

import { SuperadminChurnSignalsDB } from "@/lib/db/superadmin-churn-signals.db";
import { elegirAbierta, fueAccionReal } from "@/lib/churn/intervencion";

const SENAL = { signalType: "login_drop", severity: "critical", detail: "Score crítico: 12/100" };

beforeEach(() => {
  vi.clearAllMocks();
  p.updateMany.mockResolvedValue({ count: 1 });
});

describe("fueAccionReal / elegirAbierta", () => {
  it("los textos viejos de «no se envió nada» no cuentan como acción", () => {
    expect(fueAccionReal("WhatsApp skip (sin config)")).toBe(false);
    expect(fueAccionReal("Email skip (sin config)")).toBe(false);
    expect(fueAccionReal("Error: timeout")).toBe(false);
    expect(fueAccionReal("Regla x: sin plantilla, no se envió nada")).toBe(false);
    expect(fueAccionReal(null)).toBe(false);
    expect(fueAccionReal("WhatsApp enviado: login_drop_wa")).toBe(true);
    expect(fueAccionReal("En curso: critical_score")).toBe(true);
  });

  it("queda la que tuvo acción real; si ninguna, la más antigua", () => {
    expect(elegirAbierta([{ id: "a", intervention: "Email skip (sin config)" }, { id: "b", intervention: "Email enviado: x" }])?.id).toBe("b");
    expect(elegirAbierta([{ id: "a", intervention: null }, { id: "b", intervention: null }])?.id).toBe("a");
    expect(elegirAbierta([])).toBeNull();
  });
});

describe("registrarAbierta", () => {
  it("fila vieja con «skip»: cierra los duplicados y vuelve la intervención a null con la condición en el WHERE", async () => {
    p.findMany.mockResolvedValue([
      { id: "a", intervention: "WhatsApp skip (sin config)" },
      { id: "b", intervention: "WhatsApp skip (sin config)" },
      { id: "c", intervention: "WhatsApp skip (sin config)" },
    ]);
    const r = await SuperadminChurnSignalsDB.registrarAbierta("t-qa", SENAL);
    expect(r).toEqual({ id: "a", intervention: null, creada: false });
    expect(p.create).not.toHaveBeenCalled();
    expect(p.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t-qa", id: { in: ["b", "c"] }, resolved: false },
      data: expect.objectContaining({ resolved: true, resolvedBy: "auto" }),
    });
    expect(p.updateMany).toHaveBeenCalledWith({
      where: { id: "a", tenantId: "t-qa", intervention: "WhatsApp skip (sin config)" },
      data: { intervention: null },
    });
  });

  it("dos corridas a la vez: tras crear relee y se queda con la más antigua (la propia se cierra)", async () => {
    p.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "n1", intervention: null },
      { id: "n2", intervention: null },
    ]);
    p.create.mockResolvedValue({ id: "n2" });
    const r = await SuperadminChurnSignalsDB.registrarAbierta("t-qa", SENAL);
    expect(r).toEqual({ id: "n1", intervention: null, creada: false });
    expect(p.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t-qa", id: { in: ["n2"] }, resolved: false },
      data: expect.objectContaining({ resolved: true }),
    });
    expect(p.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", tenantId: "t-qa", resolved: false },
      data: { severity: "critical", detail: "Score crítico: 12/100" },
    });
  });

  it("primera alerta del tipo: la crea y no toca nada más", async () => {
    p.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "n1", intervention: null }]);
    p.create.mockResolvedValue({ id: "n1" });
    const r = await SuperadminChurnSignalsDB.registrarAbierta("t-qa", SENAL);
    expect(r).toEqual({ id: "n1", intervention: null, creada: true });
    expect(p.updateMany).not.toHaveBeenCalled();
  });

  it("alerta con acción real se respeta tal cual", async () => {
    p.findMany.mockResolvedValue([{ id: "a", intervention: "Marcado para llamada manual por equipo de retención" }]);
    const r = await SuperadminChurnSignalsDB.registrarAbierta("t-qa", SENAL);
    expect(r.intervention).toBe("Marcado para llamada manual por equipo de retención");
    expect(p.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("huboIntervencionDesde", () => {
  it("excluye los «skip»/«Error» y mira también la fecha de cierre, no sólo la de apertura", async () => {
    p.findFirst.mockResolvedValue(null);
    const desde = new Date("2026-10-02T00:00:00Z");
    expect(await SuperadminChurnSignalsDB.huboIntervencionDesde("t-qa", "login_drop", desde)).toBe(false);
    const where = p.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe("t-qa");
    expect(where.OR).toEqual([{ createdAt: { gte: desde } }, { resolvedAt: { gte: desde } }]);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { intervention: { not: null } },
        { NOT: { intervention: { contains: "skip (sin config)" } } },
        { NOT: { intervention: { startsWith: "Error:" } } },
      ]),
    );
  });
});

describe("liberar", () => {
  it("sólo devuelve a null si el texto sigue siendo el del reclamo", async () => {
    await SuperadminChurnSignalsDB.liberar("t-qa", "s1", "En curso: login_drop_7d");
    expect(p.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", tenantId: "t-qa", intervention: "En curso: login_drop_7d" },
      data: { intervention: null },
    });
  });
});
