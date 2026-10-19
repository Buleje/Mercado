/**
 * El texto de la IA del resumen diario habla de «Cajas cerradas hoy (N): diferencia»
 * (el día va a medias a las 16:07) y, sin cajas cerradas, no menciona diferencia.
 * Ejecutar: npx vitest run __tests__/daily-insights-cajas-cerradas.test.ts
 */
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ llm: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm-router", () => ({ callLLM: m.llm }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { generateDailyInsights, type DailyInsightsInput } from "@/lib/ai/daily-insights";

const base = (hoy: Partial<DailyInsightsInput["hoy"]>): DailyInsightsInput => ({
  hoy: { totalVentas: 100, totalPedidos: 4, ticketPromedio: 25, top5Productos: [], productosStockBajo: [], diferenciaCaja: null, tenantName: "T", fechaTexto: "lunes 19/10", ...hoy },
  ayer: null,
});

describe("daily-insights: cajas cerradas, no «diferencia de caja» del día", () => {
  it("respaldo con 2 cajas: «Cajas cerradas hoy (2): diferencia -S/ …»", async () => {
    m.llm.mockResolvedValue({ ok: false, error: "x", provider: "t" });
    const r = await generateDailyInsights(base({ diferenciaCaja: -5, cajasCerradas: 2 }));
    expect(r.isFallback).toBe(true);
    expect(r.summary).toContain("Cajas cerradas hoy (2): diferencia -S/ 5.00");
    expect(r.summary).not.toContain("Diferencia de caja");
  });

  it("sin cajas cerradas el respaldo no habla de diferencia y el prompt lo prohíbe", async () => {
    m.llm.mockClear();
    m.llm.mockResolvedValue({ ok: false, error: "x", provider: "t" });
    const r = await generateDailyInsights(base({ diferenciaCaja: null }));
    expect(r.summary.toLowerCase()).not.toContain("diferencia");
    const prompt = JSON.stringify(m.llm.mock.calls[0][1].messages);
    expect(prompt).toContain("Ninguna caja cerrada todavía");
  });
});
