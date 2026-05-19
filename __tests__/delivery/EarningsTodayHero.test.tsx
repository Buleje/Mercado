/**
 * Tests — EarningsTodayHero
 *
 * Estrategia: vi.useFakeTimers() + vi.advanceTimersByTimeAsync(100) para dejar
 * que el primer fetch resuelva sin disparar los setInterval de polling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import EarningsTodayHero from "@/components/delivery/EarningsTodayHero";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@buleje/design-system/icons", () => ({
  ArrowRight: () => <svg data-testid="icon-arrow-right" />,
  TrendingUp: () => <svg data-testid="icon-trending-up" />,
  Flame: () => <svg data-testid="icon-flame" />,
}));

vi.mock("@/components/delivery/icons", () => ({
  CashIcon: () => <svg data-testid="icon-cash" />,
  MotoIcon: () => <svg data-testid="icon-moto" />,
  TimerIcon: () => <svg data-testid="icon-timer" />,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Avanza timers lo suficiente para que las microtareas (fetch) resuelvan. */
async function flushFetch() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

const BASE_EARNINGS = {
  totals: { deliveries: 5, fees: 35.0, tips: 8.5, total: 43.5 },
};

function mockFetchOk(data = BASE_EARNINGS) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => data }),
  );
}

function mockFetchFail() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Network error")),
  );
}

function mockFetchNotOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("EarningsTodayHero — loading state", () => {
  it("muestra '—' en ganancias mientras no hay datos (loading)", () => {
    // Fetch que nunca resuelve
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    expect(screen.getByText(/S\/ —/)).toBeDefined();
  });
});

describe("EarningsTodayHero — estado offline", () => {
  it("muestra '—' en online-hoy cuando isOnline=false", async () => {
    mockFetchOk();
    render(<EarningsTodayHero isOnline={false} goal={80} />);
    await flushFetch();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("muestra label 'online hoy' sin horas activas cuando offline", async () => {
    mockFetchOk();
    render(<EarningsTodayHero isOnline={false} goal={80} />);
    await flushFetch();
    expect(screen.getByText("online hoy")).toBeDefined();
  });
});

describe("EarningsTodayHero — fetch exitoso", () => {
  it("muestra las ganancias totales del día", async () => {
    mockFetchOk();
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/43\.50/)).toBeDefined();
  });

  it("muestra la cantidad correcta de viajes completados", async () => {
    mockFetchOk();
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/5 viajes completados/)).toBeDefined();
  });

  it("muestra '1 viaje completado' (singular) con deliveries=1", async () => {
    mockFetchOk({ totals: { deliveries: 1, fees: 10, tips: 0, total: 10 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/1 viaje completado/)).toBeDefined();
  });

  it("muestra propinas cuando tips > 0", async () => {
    mockFetchOk();
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/8\.50 en propinas/)).toBeDefined();
  });

  it("NO muestra propinas cuando tips = 0", async () => {
    mockFetchOk({ totals: { deliveries: 3, fees: 30, tips: 0, total: 30 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.queryByText(/propinas/)).toBeNull();
  });

  it("muestra horas online cuando isOnline=true y onlineSinceMs configurado", async () => {
    mockFetchOk();
    const now = Date.now();
    // 2h 30m atrás
    const onlineSinceMs = now - 2 * 60 * 60 * 1000 - 30 * 60 * 1000;
    render(
      <EarningsTodayHero isOnline={true} goal={80} onlineSinceMs={onlineSinceMs} />,
    );
    await flushFetch();
    expect(screen.getByText(/2h 30m/)).toBeDefined();
  });
});

describe("EarningsTodayHero — goal progress", () => {
  it("muestra porcentaje correcto cuando no se alcanza la meta", async () => {
    mockFetchOk({ totals: { deliveries: 3, fees: 30, tips: 0, total: 40 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    // 40/80 = 50%
    expect(screen.getByText(/50% completado/)).toBeDefined();
  });

  it("muestra cuánto falta para la meta cuando no se alcanzó", async () => {
    mockFetchOk({ totals: { deliveries: 3, fees: 30, tips: 0, total: 40 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/40\.00 para S\/ 80/)).toBeDefined();
  });

  it("muestra 'Meta' cuando ganancias >= goal", async () => {
    mockFetchOk({ totals: { deliveries: 10, fees: 75, tips: 10, total: 85 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText("Meta")).toBeDefined();
  });

  it("muestra cuánto extra se ganó cuando se supera la meta", async () => {
    mockFetchOk({ totals: { deliveries: 10, fees: 75, tips: 10, total: 85 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/\+S\/ 5\.00 sobre la meta/)).toBeDefined();
  });

  it("capea el progreso al 100% cuando se supera la meta", async () => {
    mockFetchOk({ totals: { deliveries: 15, fees: 120, tips: 20, total: 140 } });
    const { container } = render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    const progressBar = container.querySelector<HTMLElement>(
      ".absolute.inset-y-0.left-0.rounded-full.bg-white",
    );
    expect(progressBar).toBeDefined();
    const pct = parseFloat(progressBar?.style.width ?? "0");
    expect(pct).toBeLessThanOrEqual(100);
  });

  it("muestra '0% completado' cuando no hay ganancias", async () => {
    mockFetchOk({ totals: { deliveries: 0, fees: 0, tips: 0, total: 0 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/0% completado/)).toBeDefined();
  });
});

describe("EarningsTodayHero — promedio por viaje", () => {
  it("muestra '—' en por-viaje cuando deliveries = 0", async () => {
    mockFetchOk({ totals: { deliveries: 0, fees: 0, tips: 0, total: 0 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("calcula correctamente el promedio por viaje", async () => {
    // 50 / 5 = S/10
    mockFetchOk({ totals: { deliveries: 5, fees: 45, tips: 5, total: 50 } });
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText("S/10")).toBeDefined();
  });
});

describe("EarningsTodayHero — fallback cuando fetch falla", () => {
  it("no crashea cuando fetch lanza excepción", async () => {
    mockFetchFail();
    expect(() => {
      render(<EarningsTodayHero isOnline={true} goal={80} />);
    }).not.toThrow();
    await flushFetch();
  });

  it("muestra 0 viajes como fallback cuando fetch falla", async () => {
    mockFetchFail();
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(screen.getByText(/0 viajes completados/)).toBeDefined();
  });

  it("no crashea cuando fetch devuelve ok=false", async () => {
    mockFetchNotOk();
    expect(() => {
      render(<EarningsTodayHero isOnline={true} goal={80} />);
    }).not.toThrow();
    await flushFetch();
  });
});

describe("EarningsTodayHero — fetch URL", () => {
  it("llama a /api/delivery/me/earnings?period=today", async () => {
    mockFetchOk();
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/delivery/me/earnings?period=today",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

describe("EarningsTodayHero — link a detalle", () => {
  it("renderiza el link 'Ver detalle' con href correcto", async () => {
    mockFetchOk();
    render(<EarningsTodayHero isOnline={true} goal={80} />);
    await flushFetch();
    const link = screen.getByRole("link", { name: /ver detalle/i });
    expect(link.getAttribute("href")).toBe("/delivery-app/ganancias");
  });
});
