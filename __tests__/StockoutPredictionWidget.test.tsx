/**
 * Tests — StockoutPredictionWidget
 * Cubre: render con datos, empty state, click recalcular llama POST.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock framer-motion (simplificado)
vi.mock("framer-motion", () => {
  const motion = {
    li: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <li {...props}>{children}</li>,
    div: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <div {...props}>{children}</div>,
  };
  return {
    motion,
    m: motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    domAnimation: {},
  };
});

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import StockoutPredictionWidget from "@/components/marketplace/StockoutPredictionWidget";

const CRITICAL_ITEM = {
  id: "p1",
  productId: "prod-1",
  productName: "Arroz Costeño 1kg",
  productImage: null,
  currentStock: 3,
  predictedDaysToStockout: 2,
  severity: "critical",
  confidence: 0.9,
  computedAt: new Date().toISOString(),
};

const HIGH_ITEM = {
  id: "p2",
  productId: "prod-2",
  productName: "Aceite Vegetal 1L",
  productImage: null,
  currentStock: 8,
  predictedDaysToStockout: 5,
  severity: "high",
  confidence: 0.75,
  computedAt: new Date().toISOString(),
};

describe("StockoutPredictionWidget", () => {
  it("muestra skeleton mientras carga", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<StockoutPredictionWidget storeSlug="mi-bodega" />);
    // Skeleton elements are present (animate-pulse divs)
    const pulseEls = document.querySelectorAll(".animate-pulse");
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it("muestra items criticos y altos despues de cargar", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [CRITICAL_ITEM, HIGH_ITEM] }),
    });

    render(<StockoutPredictionWidget storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getByText("Arroz Costeño 1kg")).toBeInTheDocument();
      expect(screen.getByText("Aceite Vegetal 1L")).toBeInTheDocument();
    });

    // Deben tener texto "días"
    const diasTexts = screen.getAllByText(/Se acaba en/i);
    expect(diasTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("muestra empty state cuando no hay predicciones", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<StockoutPredictionWidget storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getByText(/Todo bien, no hay productos en riesgo/i)).toBeInTheDocument();
    });
  });

  it("botón Recalcular llama POST /predictions/compute", async () => {
    const user = userEvent.setup();

    // Primera carga: datos
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [CRITICAL_ITEM] }),
    });
    // Segunda carga (después de recalcular)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ created: 2 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [CRITICAL_ITEM] }),
    });

    render(<StockoutPredictionWidget storeSlug="mi-bodega" />);

    // Esperar que cargue
    await waitFor(() => {
      expect(screen.getByText("Arroz Costeño 1kg")).toBeInTheDocument();
    });

    const recalcBtn = screen.getByRole("button", { name: /Recalcular/i });
    await user.click(recalcBtn);

    await waitFor(() => {
      // Verificar que se llamó el POST
      const calls = mockFetch.mock.calls;
      const postCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/predictions/compute")
      );
      expect(postCall).toBeDefined();
    });
  });

  it("cae a empty state cuando el fetch falla (widget secundario)", async () => {
    // Decision: este widget es secundario, asi que en error muestra el empty
    // state en vez de bloquear la UI con un mensaje de error.
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    render(<StockoutPredictionWidget storeSlug="mi-bodega" />);
    await waitFor(() => {
      expect(screen.getByText(/Todo bien, no hay productos en riesgo/i)).toBeInTheDocument();
    });
  });
});
