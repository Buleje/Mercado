/**
 * Tests extendidos — ProductBadges (marketplace-específicos)
 *
 * Complementa __tests__/components/ProductBadges.test.tsx con los
 * casos de uso concretos del marketplace: stock bajo dinámico,
 * badge "sale" / descuento, apilamiento de múltiples badges y
 * casos límite de stock.
 *
 * El componente real usa: badges: string[] + details?: { lowStock?: number }
 * La lógica de "sale" / "fast-shipping" / "verified" ya está en el BADGE_MAP.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

// Importar DESPUÉS de los mocks
import ProductBadges from "@/components/marketplace/ProductBadges";

beforeEach(() => vi.clearAllMocks());

describe("ProductBadges — casos marketplace", () => {
  it("badge 'low-stock' con stock=1 muestra 'Solo 1' (límite crítico)", () => {
    render(<ProductBadges badges={["low-stock"]} details={{ lowStock: 1 }} />);
    expect(screen.getByText("Solo 1")).toBeInTheDocument();
  });

  it("badge 'low-stock' con stock=4 muestra 'Solo 4' (umbral inferior al máximo 5)", () => {
    render(<ProductBadges badges={["low-stock"]} details={{ lowStock: 4 }} />);
    expect(screen.getByText("Solo 4")).toBeInTheDocument();
  });

  it("badge 'verified' renderiza 'Verificado'", () => {
    render(<ProductBadges badges={["verified"]} />);
    expect(screen.getByText("Verificado")).toBeInTheDocument();
  });

  it("badge 'fast-shipping' renderiza 'Envío rápido'", () => {
    render(<ProductBadges badges={["fast-shipping"]} />);
    expect(screen.getByText("Envío rápido")).toBeInTheDocument();
  });

  it("apilamiento: best-seller + verified + fast-shipping juntos en el mismo componente", () => {
    render(
      <ProductBadges badges={["best-seller", "verified", "fast-shipping"]} />
    );
    expect(screen.getByText("Más vendido")).toBeInTheDocument();
    expect(screen.getByText("Verificado")).toBeInTheDocument();
    expect(screen.getByText("Envío rápido")).toBeInTheDocument();
  });

  it("apilamiento con low-stock: los 4 badges juntos renderizan todos", () => {
    render(
      <ProductBadges
        badges={["best-seller", "new", "low-stock", "verified"]}
        details={{ lowStock: 3 }}
      />
    );
    expect(screen.getByText("Más vendido")).toBeInTheDocument();
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
    expect(screen.getByText("Solo 3")).toBeInTheDocument();
    expect(screen.getByText("Verificado")).toBeInTheDocument();
  });

  it("tooltip (atributo title) presente en badge 'verified'", () => {
    render(<ProductBadges badges={["verified"]} />);
    expect(screen.getByTitle("Verificado")).toBeInTheDocument();
  });

  it("badge desconocido mezclado con válido: sólo renderiza el válido", () => {
    render(<ProductBadges badges={["unknown-x", "new"]} />);
    expect(screen.queryByText("unknown-x")).not.toBeInTheDocument();
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
  });
});
