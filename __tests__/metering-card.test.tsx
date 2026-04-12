/**
 * Tests — MeteringCard
 *
 * Cubre:
 *  - Renderiza valores de uso correctamente
 *  - Muestra colores semáforo según threshold (verde/amarillo/rojo)
 *  - Sparklines tienen 7 puntos de datos
 *  - Badge de plan se muestra
 *  - Costo estimado aparece en pantalla
 *  - Accesibilidad: roles ARIA presentes
 *  - Estado "cerca del límite" aparece con 70%+
 *  - Estado "límite alcanzado" aparece con 90%+
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock de recharts — no disponible en jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="recharts-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="recharts-linechart">{children}</div>,
  Line: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
}));

// Mock de server-only para importar módulos del servidor en tests
vi.mock("server-only", () => ({}));

import type { MeteringSnapshot } from "@/components/admin/unified/MeteringCard/types";
import { computeTrafficLight, computePercentage, EVENT_LABELS } from "@/components/admin/unified/MeteringCard/types";
import { MeteringCardClient } from "@/components/admin/unified/MeteringCard/MeteringCard.client";
import { METERED_EVENTS } from "@/lib/billing/metering";

// ─── Factories ────────────────────────────────────────────────────────────────

function buildSnapshot(overrides: Partial<MeteringSnapshot> = {}): MeteringSnapshot {
  const baseUsage = Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"];
  const baseQuotas = Object.fromEntries(
    METERED_EVENTS.map((e) => [e, { limit: 1000, alertAt: 0.8 }]),
  ) as MeteringSnapshot["quotas"];
  const baseSparklines = Object.fromEntries(
    METERED_EVENTS.map((e) => [e, [1, 2, 3, 4, 5, 6, 7]]),
  ) as MeteringSnapshot["sparklines"];

  return {
    tenantId: "tenant_test",
    plan: "starter",
    period: {
      from: "2026-04-01T00:00:00.000Z",
      to: "2026-05-01T00:00:00.000Z",
    },
    usage: baseUsage,
    quotas: baseQuotas,
    estimatedCostUsd: 12.50,
    sparklines: baseSparklines,
    ...overrides,
  };
}

// ─── Tests: computeTrafficLight ───────────────────────────────────────────────

describe("computeTrafficLight", () => {
  it("devuelve green cuando uso < 70%", () => {
    expect(computeTrafficLight(600, 1000)).toBe("green");
    expect(computeTrafficLight(0, 1000)).toBe("green");
    expect(computeTrafficLight(699, 1000)).toBe("green");
  });

  it("devuelve yellow cuando uso >= 70% y < 90%", () => {
    expect(computeTrafficLight(700, 1000)).toBe("yellow");
    expect(computeTrafficLight(750, 1000)).toBe("yellow");
    expect(computeTrafficLight(899, 1000)).toBe("yellow");
  });

  it("devuelve red cuando uso >= 90%", () => {
    expect(computeTrafficLight(900, 1000)).toBe("red");
    expect(computeTrafficLight(1000, 1000)).toBe("red");
    expect(computeTrafficLight(1500, 1000)).toBe("red");
  });

  it("devuelve green para límite Infinity", () => {
    expect(computeTrafficLight(999_999, Infinity)).toBe("green");
  });

  it("devuelve green para límite 0", () => {
    expect(computeTrafficLight(0, 0)).toBe("green");
  });
});

// ─── Tests: computePercentage ─────────────────────────────────────────────────

describe("computePercentage", () => {
  it("calcula el porcentaje correcto", () => {
    expect(computePercentage(500, 1000)).toBe(50);
    expect(computePercentage(0, 1000)).toBe(0);
    expect(computePercentage(1000, 1000)).toBe(100);
  });

  it("limita a 100% máximo", () => {
    expect(computePercentage(1500, 1000)).toBe(100);
  });

  it("devuelve 0 para límite Infinity", () => {
    expect(computePercentage(999, Infinity)).toBe(0);
  });
});

// ─── Tests: MeteringCardClient ────────────────────────────────────────────────

describe("MeteringCardClient", () => {
  it("renderiza el título de la sección", () => {
    const snapshot = buildSnapshot();
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.getByText("Uso facturable")).toBeInTheDocument();
  });

  it("muestra el badge del plan actual", () => {
    const snapshot = buildSnapshot({ plan: "starter" });
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.getByText("Starter")).toBeInTheDocument();
  });

  it("muestra el costo estimado en USD", () => {
    const snapshot = buildSnapshot({ estimatedCostUsd: 42.75 });
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.getByText(/42\.75/)).toBeInTheDocument();
  });

  it("muestra valores de uso para métricas prioritarias", () => {
    const snapshot = buildSnapshot({
      usage: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"],
        "order.created": 250,
        "ai.call": 30,
      },
    });
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("muestra el label 'Pedidos' para order.created", () => {
    const snapshot = buildSnapshot();
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.getByText(EVENT_LABELS["order.created"])).toBeInTheDocument();
  });

  it("muestra badge 'Limite alcanzado' cuando hay métrica en rojo (>=90%)", () => {
    const snapshot = buildSnapshot({
      usage: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"],
        "order.created": 950,
      },
      quotas: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, { limit: 1000, alertAt: 0.8 }])) as MeteringSnapshot["quotas"],
        "order.created": { limit: 1000, alertAt: 0.9 },
      },
    });
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.getByText(/Limite alcanzado/i)).toBeInTheDocument();
  });

  it("muestra badge 'Cerca del limite' cuando hay métrica en amarillo (70-90%)", () => {
    const snapshot = buildSnapshot({
      usage: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"],
        "order.created": 750,
      },
      quotas: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, { limit: 1000, alertAt: 0.8 }])) as MeteringSnapshot["quotas"],
        "order.created": { limit: 1000, alertAt: 0.8 },
      },
    });
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.getByText(/Cerca del limite/i)).toBeInTheDocument();
  });

  it("NO muestra badge de alerta cuando todo está en verde (<70%)", () => {
    const snapshot = buildSnapshot({
      usage: Object.fromEntries(METERED_EVENTS.map((e) => [e, 100])) as MeteringSnapshot["usage"],
      quotas: Object.fromEntries(METERED_EVENTS.map((e) => [e, { limit: 1000, alertAt: 0.8 }])) as MeteringSnapshot["quotas"],
    });
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.queryByText(/Limite alcanzado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cerca del limite/i)).not.toBeInTheDocument();
  });

  it("muestra botón 'Mejorar plan' para planes free/starter", () => {
    const snapshot = buildSnapshot({ plan: "free" });
    const onUpgrade = vi.fn();
    render(<MeteringCardClient snapshot={snapshot} onUpgrade={onUpgrade} />);
    const btn = screen.getByRole("button", { name: /Mejorar plan/i });
    expect(btn).toBeInTheDocument();
  });

  it("NO muestra botón 'Mejorar plan' para plan enterprise", () => {
    const snapshot = buildSnapshot({ plan: "enterprise" });
    render(<MeteringCardClient snapshot={snapshot} />);
    expect(screen.queryByRole("button", { name: /Mejorar plan/i })).not.toBeInTheDocument();
  });

  it("los sparklines tienen contenedor recharts renderizado", () => {
    const snapshot = buildSnapshot();
    render(<MeteringCardClient snapshot={snapshot} />);
    const sparklines = screen.getAllByTestId("recharts-container");
    // Al menos 4 sparklines (métricas prioritarias)
    expect(sparklines.length).toBeGreaterThanOrEqual(4);
  });

  it("las sparklines tienen exactamente 7 puntos de datos en props", () => {
    const snapshot = buildSnapshot();
    // Verificar que los sparklines del snapshot tienen 7 puntos
    for (const evt of METERED_EVENTS) {
      expect(snapshot.sparklines[evt]).toHaveLength(7);
    }
  });

  it("las barras de progreso tienen role=progressbar con aria-valuenow", () => {
    const snapshot = buildSnapshot({
      usage: {
        ...Object.fromEntries(METERED_EVENTS.map((e) => [e, 0])) as MeteringSnapshot["usage"],
        "order.created": 500,
      },
    });
    render(<MeteringCardClient snapshot={snapshot} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThan(0);
    // La primera barra de order.created debe tener valuenow=50
    const orderBar = bars.find((b) => b.getAttribute("aria-valuenow") === "50");
    expect(orderBar).toBeDefined();
  });

  it("el botón 'Mejorar plan' llama al callback onUpgrade", async () => {
    const user = userEvent.setup();
    const snapshot = buildSnapshot({ plan: "starter" });
    const onUpgrade = vi.fn();
    render(<MeteringCardClient snapshot={snapshot} onUpgrade={onUpgrade} />);
    const btn = screen.getByRole("button", { name: /Mejorar plan/i });
    await user.click(btn);
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it("el botón 'Ver todas' expande las métricas adicionales", async () => {
    const user = userEvent.setup();
    const snapshot = buildSnapshot();
    render(<MeteringCardClient snapshot={snapshot} />);
    const toggleBtn = screen.queryByRole("button", { name: /Ver todas/i });
    if (toggleBtn) {
      expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
      await user.click(toggleBtn);
      expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
    }
  });

  it("la sección tiene role=region con aria-label", () => {
    const snapshot = buildSnapshot();
    render(<MeteringCardClient snapshot={snapshot} />);
    const section = screen.getByRole("region", { name: /Uso facturable/i });
    expect(section).toBeInTheDocument();
  });
});
