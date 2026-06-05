/**
 * Tests — PersonalizedRecommendations ("Para ti")
 *
 * El componente fue rediseñado (2026-06): ahora consume
 * `/api/marketplace/recommendations/for-me` (sesión del customer vía cookie,
 * sin gating por phone), con shape { products: [{ productId, name, price,
 * image, score }] }. Renderiza sus propias cards (Link → /marketplace/buscar),
 * muestra skeleton mientras carga y se OCULTA (retorna null) cuando no hay
 * historial (204 / products vacío). Estos tests cubren ese contrato real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import PersonalizedRecommendations from "@/components/marketplace/PersonalizedRecommendations";

const PRODUCTS = [
  { productId: 1, name: "Arroz Costeño 1kg", image: null, price: 4.5, score: 0.95 },
  { productId: 2, name: "Aceite Vegetal 1L", image: null, price: 7.0, score: 0.8 },
];

describe("PersonalizedRecommendations", () => {
  it("muestra la sección con skeletons mientras carga", () => {
    // fetch que nunca resuelve → loading se mantiene en true
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { container } = render(<PersonalizedRecommendations />);

    // Durante la carga la sección "Para ti" es visible (no null).
    expect(screen.getByText("Para ti")).toBeInTheDocument();
    expect(container.firstChild).not.toBeNull();
  });

  it("carga y muestra productos recomendados (for-me 200)", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ products: PRODUCTS }),
    });

    render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(screen.getByText("Arroz Costeño 1kg")).toBeInTheDocument();
      expect(screen.getByText("Aceite Vegetal 1L")).toBeInTheDocument();
    });

    // Endpoint correcto (for-me, basado en sesión) + credentials para la cookie.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/marketplace/recommendations/for-me"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("no renderiza nada cuando la API responde 204 (sin historial)", async () => {
    mockFetch.mockResolvedValueOnce({ status: 204, json: async () => null });

    const { container } = render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("no renderiza nada cuando la API responde con products vacío", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ products: [] }),
    });

    const { container } = render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("no rompe si el fetch falla — se oculta", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));

    const { container } = render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
