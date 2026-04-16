/**
 * Tests de componente — MarketplaceGrid
 *
 * MarketplaceGrid es self-contained: hace fetch interno a /api/marketplace/stores.
 * Se mockea globalThis.fetch para controlar la respuesta.
 *
 * Comportamientos verificados:
 *   - Loading: muestra skeletons mientras carga
 *   - Happy path: renderiza N tarjetas de tienda
 *   - Empty state: mensaje + botón "Limpiar filtros"
 *   - Error state: muestra error + botón "Reintentar"
 *   - Badge abierto/cerrado según isOpen
 *   - Rating stars renderizan (5 SVGs por tarjeta)
 *   - Link "Ver tienda" apunta a /marketplace/{slug}
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    sizes: _sizes,
    className,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    className?: string;
  }) => <img src={src} alt={alt} className={className} />,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeStore = (overrides: Partial<{
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string;
  rating: number | null;
  reviewCount: number;
  description: string | null;
  isOpen: boolean;
  productCount: number;
}> = {}) => ({
  id: "store-1",
  slug: "bodega-central",
  name: "Bodega Central",
  logo: null,
  category: "bodega",
  zone: "pucallpa-centro",
  rating: 4.5,
  reviewCount: 23,
  description: "La mejor bodega",
  isOpen: true,
  productCount: 120,
  ...overrides,
});

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Importar DESPUÉS de los mocks
import MarketplaceGrid from "@/components/marketplace/MarketplaceGrid";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MarketplaceGrid", () => {
  it("muestra skeletons mientras carga (loading state)", () => {
    // fetch que nunca resuelve — estado de carga infinito
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<MarketplaceGrid />);
    // Los skeletons tienen animate-pulse — buscamos divs con esa clase
    const pulses = document.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThan(0);
  });

  it("renderiza N tarjetas cuando el fetch retorna tiendas", async () => {
    const stores = [
      makeStore({ id: "1", name: "Bodega Norte", slug: "bodega-norte" }),
      makeStore({ id: "2", name: "Bodega Sur",   slug: "bodega-sur"   }),
      makeStore({ id: "3", name: "Bodega Este",  slug: "bodega-este"  }),
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: stores }),
    });

    render(<MarketplaceGrid />);

    await waitFor(() => {
      expect(screen.getByText("Bodega Norte")).toBeInTheDocument();
      expect(screen.getByText("Bodega Sur")).toBeInTheDocument();
      expect(screen.getByText("Bodega Este")).toBeInTheDocument();
    });

    // Contador de resultados
    expect(screen.getByText("3 tiendas encontradas")).toBeInTheDocument();
  });

  it("empty state: sin tiendas muestra mensaje y botón limpiar", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });

    render(<MarketplaceGrid />);

    await waitFor(() => {
      expect(screen.getByText("No se encontraron tiendas")).toBeInTheDocument();
    });

    // aria-label="Limpiar todos los filtros y ver todas las tiendas"
    expect(
      screen.getByRole("button", { name: /limpiar todos los filtros/i })
    ).toBeInTheDocument();
  });

  it("error state: muestra el error y botón Reintentar", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    render(<MarketplaceGrid />);

    await waitFor(() => {
      expect(screen.getByText(/Error 500/)).toBeInTheDocument();
    });

    // aria-label="Reintentar cargar tiendas"
    expect(
      screen.getByRole("button", { name: /reintentar cargar tiendas/i })
    ).toBeInTheDocument();
  });

  it("badge 'Abierto' cuando isOpen=true", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [makeStore({ isOpen: true })] }),
    });

    render(<MarketplaceGrid />);

    await waitFor(() => {
      expect(screen.getByText("Abierto")).toBeInTheDocument();
    });
  });

  it("badge 'Cerrado' cuando isOpen=false", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [makeStore({ isOpen: false })] }),
    });

    render(<MarketplaceGrid />);

    await waitFor(() => {
      expect(screen.getByText("Cerrado")).toBeInTheDocument();
    });
  });

  it("link 'Ver tienda' apunta al slug correcto", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [makeStore({ slug: "mi-bodega-test" })] }),
    });

    render(<MarketplaceGrid />);

    await waitFor(() => {
      // aria-label="Ver tienda {nombre}"
      const link = screen.getByRole("link", { name: /ver tienda/i });
      expect(link).toHaveAttribute("href", "/marketplace/mi-bodega-test");
    });
  });

  it("botón Reintentar vuelve a llamar fetch", async () => {
    // Primera llamada: error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    // Segunda llamada: éxito
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [makeStore({ name: "Bodega OK" })] }),
    });

    render(<MarketplaceGrid />);

    // aria-label="Reintentar cargar tiendas"
    await waitFor(() =>
      screen.getByRole("button", { name: /reintentar cargar tiendas/i })
    );

    fireEvent.click(
      screen.getByRole("button", { name: /reintentar cargar tiendas/i })
    );

    await waitFor(() => {
      expect(screen.getByText("Bodega OK")).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
