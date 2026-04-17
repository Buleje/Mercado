/**
 * Tests de componente — ProductCompareDrawer
 *
 * Cubre:
 *  1. Empty state con 0 items
 *  2. Renderiza 2 items y el boton "Quitar" llama remove
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CompareItem } from "@/contexts/compare-context";

// ── Mocks ──────────────────────────────────────────────────────────────────────

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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}));

const mockRemove = vi.fn();
const mockClear = vi.fn();
const mockSetOpen = vi.fn();

vi.mock("@/contexts/compare-context", () => ({
  useCompare: vi.fn(),
}));

import { useCompare } from "@/contexts/compare-context";
import ProductCompareDrawer from "@/components/marketplace/ProductCompareDrawer";

const mockUseCompare = vi.mocked(useCompare);

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeItem = (id: number): CompareItem => ({
  productId: id,
  storeSlug: `tienda-${id}`,
  name: `Producto ${id}`,
  price: 10 * id,
  image: null,
  stock: 5,
  rating: 4,
});

function setupMock(items: CompareItem[], open = true) {
  mockUseCompare.mockReturnValue({
    items,
    open,
    setOpen: mockSetOpen,
    add: vi.fn(),
    remove: mockRemove,
    clear: mockClear,
    has: vi.fn(),
    isIn: vi.fn(),
    limitWarning: null,
    clearLimitWarning: vi.fn(),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ProductCompareDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el empty state cuando no hay items", () => {
    setupMock([], true);
    render(<ProductCompareDrawer />);

    expect(
      screen.getByText("Agrega productos desde las tarjetas para compararlos")
    ).toBeInTheDocument();
  });

  it("renderiza 2 items y el boton Quitar llama remove con el productId correcto", () => {
    setupMock([makeItem(1), makeItem(2)], true);
    render(<ProductCompareDrawer />);

    // Ambos productos aparecen (imagen alt + nombre) — usar getAllByText
    expect(screen.getAllByText("Producto 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Producto 2").length).toBeGreaterThan(0);

    // Hay 2 botones "Quitar"
    const quitarBtns = screen.getAllByRole("button", { name: /quitar/i });
    expect(quitarBtns).toHaveLength(2);

    // Click en el primer Quitar -> remove(1)
    fireEvent.click(quitarBtns[0]);
    expect(mockRemove).toHaveBeenCalledWith(1);
  });
});
