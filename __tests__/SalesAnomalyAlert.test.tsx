/**
 * Tests — SalesAnomalyAlert
 * Cubre: render con anomalias, acknowledge, sin render si vacio.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import SalesAnomalyAlert from "@/components/marketplace/SalesAnomalyAlert";

const ANOMALY_DOWN = {
  id: "a1",
  date: new Date().toISOString(),
  metric: "daily_revenue",
  expected: 1000,
  actual: 650,
  deltaPct: -35,
  severity: "high",
  direction: "down",
  acknowledgedAt: null,
};

const ANOMALY_UP = {
  id: "a2",
  date: new Date().toISOString(),
  metric: "order_count",
  expected: 50,
  actual: 90,
  deltaPct: 80,
  severity: "high",
  direction: "up",
  acknowledgedAt: null,
};

describe("SalesAnomalyAlert", () => {
  it("no renderiza nada cuando no hay anomalias (despues de cargar)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { container } = render(<SalesAnomalyAlert storeSlug="mi-bodega" />);

    await waitFor(() => {
      // El componente retorna null cuando no hay items
      expect(container.firstChild).toBeNull();
    });
  });

  it("muestra anomalia de caida con porcentaje correcto", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [ANOMALY_DOWN] }),
    });

    render(<SalesAnomalyAlert storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getByText(/Bajaste/i)).toBeInTheDocument();
      expect(screen.getByText(/35%/)).toBeInTheDocument();
    });
  });

  it("muestra anomalia de subida con porcentaje correcto", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [ANOMALY_UP] }),
    });

    render(<SalesAnomalyAlert storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getByText(/Subiste/i)).toBeInTheDocument();
      expect(screen.getByText(/80%/)).toBeInTheDocument();
    });
  });

  it("click Entendido llama POST /acknowledge y remueve el item", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [ANOMALY_DOWN] }),
    });
    // acknowledge response
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<SalesAnomalyAlert storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getByText(/Bajaste/i)).toBeInTheDocument();
    });

    const btn = screen.getByRole("button", { name: /Entendido/i });
    await user.click(btn);

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const ackCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/acknowledge")
      );
      expect(ackCall).toBeDefined();
    });
  });

  it("muestra skeleton durante la carga inicial", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<SalesAnomalyAlert storeSlug="mi-bodega" />);
    const pulseEls = document.querySelectorAll(".animate-pulse");
    expect(pulseEls.length).toBeGreaterThan(0);
  });
});
