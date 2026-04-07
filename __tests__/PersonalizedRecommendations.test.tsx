/**
 * Tests — PersonalizedRecommendations
 * Cubre: cold start sin customer, render con productos, skeleton.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock CustomerContext
const mockUseCustomer = vi.fn();
vi.mock("@/contexts/customer-context", () => ({
  useCustomer: () => mockUseCustomer(),
}));

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  mockUseCustomer.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

import PersonalizedRecommendations from "@/components/marketplace/PersonalizedRecommendations";

const PRODUCTS = [
  {
    productId: "1",
    productName: "Arroz Costeño 1kg",
    productImage: null,
    price: 4.5,
    score: 0.95,
    reason: "Porque compras arroz los lunes",
    storeSlug: "bodega-san-martin",
  },
  {
    productId: "2",
    productName: "Aceite Vegetal 1L",
    productImage: null,
    price: 7.0,
    score: 0.8,
    reason: "Compra frecuente",
    storeSlug: "bodega-san-martin",
  },
];

describe("PersonalizedRecommendations", () => {
  it("muestra cold start cuando no hay customer logueado", async () => {
    mockUseCustomer.mockReturnValue({ customer: null });

    render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(screen.getByText(/Estamos aprendiendo tus gustos/i)).toBeInTheDocument();
    });
  });

  it("muestra cold start cuando customer no tiene phone", async () => {
    mockUseCustomer.mockReturnValue({ customer: { name: "Juan", phone: null } });

    render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(screen.getByText(/Estamos aprendiendo tus gustos/i)).toBeInTheDocument();
    });
  });

  it("carga y muestra productos recomendados para customer con phone", async () => {
    mockUseCustomer.mockReturnValue({
      customer: { name: "Maria", phone: "987654321" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: PRODUCTS }),
    });

    render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(screen.getByText("Arroz Costeño 1kg")).toBeInTheDocument();
      expect(screen.getByText("Aceite Vegetal 1L")).toBeInTheDocument();
    });

    // Verifica que se llamó al endpoint correcto
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/recommendations/personalized?customerPhone=987654321")
    );
  });

  it("muestra empty state cuando no hay historial suficiente (array vacio)", async () => {
    mockUseCustomer.mockReturnValue({
      customer: { name: "Pedro", phone: "912345678" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(screen.getByText(/Aun no tenemos recomendaciones/i)).toBeInTheDocument();
    });
  });

  it("muestra la razon de cada recomendacion", async () => {
    mockUseCustomer.mockReturnValue({
      customer: { name: "Ana", phone: "955555555" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [PRODUCTS[0]] }),
    });

    render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(screen.getByText(/Porque compras arroz los lunes/i)).toBeInTheDocument();
    });
  });
});
