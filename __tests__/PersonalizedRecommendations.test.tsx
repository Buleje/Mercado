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

vi.mock("framer-motion", () => {
  const motion = {
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

// Mock CustomerContext
const mockUseCustomer = vi.fn();
vi.mock("@/contexts/customer-context", () => ({
  useCustomer: () => mockUseCustomer(),
}));

// Mock UnifiedProductCard so tests don't need Compare/Cart providers — we just
// need to assert the product name/reason is rendered. The component passes the
// recommendation `reason` in `description`, so we surface both.
vi.mock("@/components/marketplace/UnifiedProductCard", () => ({
  default: ({ product }: { product: { name?: string; description?: string } }) => (
    <div data-testid="unified-product-card">
      <span>{product.name}</span>
      {product.description ? <span>{product.description}</span> : null}
    </div>
  ),
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
  it("no renderiza nada en cold start (sin customer logueado)", async () => {
    mockUseCustomer.mockReturnValue({ customer: null });

    const { container } = render(<PersonalizedRecommendations />);

    // Decision 2026-04-20: cold start ya no muestra placeholder — el componente
    // retorna null cuando no hay phone/historial.
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("no renderiza nada cuando customer no tiene phone", async () => {
    mockUseCustomer.mockReturnValue({ customer: { name: "Juan", phone: null } });

    const { container } = render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
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

  it("no renderiza nada cuando la API responde con array vacio", async () => {
    // Decision 2026-04-20: sin productos el componente retorna null (no placeholder).
    mockUseCustomer.mockReturnValue({
      customer: { name: "Pedro", phone: "912345678" },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const { container } = render(<PersonalizedRecommendations />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
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
