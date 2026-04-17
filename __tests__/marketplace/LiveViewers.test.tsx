/**
 * Tests para LiveViewers
 *
 * Verifica:
 *   1. No renderiza nada cuando recentViewers < 3
 *   2. Muestra el texto cuando recentViewers >= 3
 *   3. aria-live es "polite"
 *   4. Estado skeleton mientras carga
 *   5. Error state renderiza null (degradacion elegante)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LiveViewers from "@/components/marketplace/LiveViewers";

// ── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeFetchResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  } as Response);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LiveViewers", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("no renderiza nada cuando recentViewers es menor que 3", async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ recentViewers: 2 }));

    const { container } = render(<LiveViewers storeSlug="tienda-test" />);

    await waitFor(() => {
      // El skeleton desaparece despues de la carga
      expect(container.querySelector("[aria-hidden='true']")).toBeNull();
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("muestra el texto de visitas cuando recentViewers >= 3", async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ recentViewers: 7 }));

    render(<LiveViewers storeSlug="tienda-test" />);

    await waitFor(() => {
      expect(
        screen.getByText(/7 personas lo vieron en la última hora/i),
      ).toBeInTheDocument();
    });
  });

  it("el contenedor tiene aria-live='polite'", async () => {
    mockFetch.mockReturnValue(makeFetchResponse({ recentViewers: 5 }));

    render(<LiveViewers storeSlug="tienda-test" />);

    await waitFor(() => {
      const el = screen.getByRole("status");
      expect(el).toHaveAttribute("aria-live", "polite");
    });
  });

  it("muestra skeleton mientras carga", () => {
    // Fetch que nunca resuelve — mantiene estado loading
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { container } = render(<LiveViewers storeSlug="tienda-test" />);

    // Debe haber un elemento aria-hidden con clase animate-pulse (skeleton)
    const skeleton = container.querySelector("[aria-hidden='true']");
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain("animate-pulse");
  });

  it("renderiza null cuando el fetch falla (degradacion elegante)", async () => {
    mockFetch.mockReturnValue(makeFetchResponse(null, false));

    const { container } = render(<LiveViewers storeSlug="tienda-test" />);

    await waitFor(() => {
      // Ni skeleton ni status — nada visible
      expect(container.querySelector("[aria-hidden='true']")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    });
  });
});
