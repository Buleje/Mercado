/**
 * Tests — SponsoredAdminPanel
 * Cubre: lista boosts, empty state, botón crear abre modal, pause/cancel.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("framer-motion", () => {
  const motion = {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <div {...props}>{children}</div>,
    li: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <li {...props}>{children}</li>,
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

import SponsoredAdminPanel from "@/components/marketplace/SponsoredAdminPanel";

const BOOST_ACTIVE = {
  id: "boost-1",
  productId: "prod-1",
  productName: "Arroz Costeño 1kg",
  bidAmount: 5,
  maxBudgetPen: 100,
  spentPen: 23.5,
  startDate: "2026-04-01T00:00:00.000Z",
  endDate: "2026-04-30T00:00:00.000Z",
  status: "active",
  impressions: 4500,
  clicks: 90,
  conversions: 12,
  storeId: "store-123",
};

const BOOST_PAUSED = {
  ...BOOST_ACTIVE,
  id: "boost-2",
  productName: "Aceite Vegetal 1L",
  status: "paused",
  impressions: 2000,
  clicks: 40,
  conversions: 5,
};

describe("SponsoredAdminPanel", () => {
  it("muestra skeleton durante la carga", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<SponsoredAdminPanel storeSlug="mi-bodega" />);
    const pulseEls = document.querySelectorAll(".animate-pulse");
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it("muestra boosts activos con nombre de producto", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [BOOST_ACTIVE, BOOST_PAUSED] }),
    });

    render(<SponsoredAdminPanel storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getAllByText("Arroz Costeño 1kg").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Aceite Vegetal 1L").length).toBeGreaterThan(0);
    });
  });

  it("muestra empty state cuando no hay boosts", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<SponsoredAdminPanel storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getByText(/Aun no tienes productos patrocinados/i)).toBeInTheDocument();
    });
  });

  it("botón Nuevo boost abre el modal de creacion", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [BOOST_ACTIVE] }),
    });
    // Products for modal
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "prod-1", name: "Arroz 1kg" }] }),
    });

    render(<SponsoredAdminPanel storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getAllByText("Arroz Costeño 1kg").length).toBeGreaterThan(0);
    });

    const newBtn = screen.getByRole("button", { name: /Nuevo boost/i });
    await user.click(newBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/Nuevo boost patrocinado/i)).toBeInTheDocument();
    });
  });

  it("botón Pausar llama PATCH con action=pause", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [BOOST_ACTIVE] }),
    });
    // PATCH response
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Refetch after action
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ ...BOOST_ACTIVE, status: "paused" }] }),
    });

    render(<SponsoredAdminPanel storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getAllByText("Arroz Costeño 1kg").length).toBeGreaterThan(0);
    });

    const pauseBtns = screen.getAllByRole("button", { name: /Pausar boost/i });
    await user.click(pauseBtns[0]);

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const patchCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/sponsored/boost-1") && c[1]?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1].body as string);
      expect(body.action).toBe("pause");
    });
  });

  it("botón Cancelar llama PATCH con action=cancel", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [BOOST_ACTIVE] }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<SponsoredAdminPanel storeSlug="mi-bodega" />);

    await waitFor(() => {
      expect(screen.getAllByText("Arroz Costeño 1kg").length).toBeGreaterThan(0);
    });

    const cancelBtns = screen.getAllByRole("button", { name: /Cancelar boost/i });
    await user.click(cancelBtns[0]);

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const patchCall = calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/sponsored/boost-1") && c[1]?.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1].body as string);
      expect(body.action).toBe("cancel");
    });
  });
});
