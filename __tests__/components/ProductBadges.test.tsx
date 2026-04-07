/**
 * Tests de componente — ProductBadges
 *
 * Implementación real:
 *   - export default ProductBadges
 *   - BADGE_MAP: "best-seller" → label "Mas vendido" (sin tilde)
 *                "new" → label "Nuevo"
 *                "low-stock" → label "Solo {count}" (reemplaza {count} con details.lowStock)
 *   - badges vacío → return null
 *   - tooltip: cada <span> tiene atributo title={label}
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductBadges from "@/components/marketplace/ProductBadges";

vi.mock("server-only", () => ({}));

describe("ProductBadges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("badges vacío → componente no renderiza nada (null)", () => {
    const { container } = render(<ProductBadges badges={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("badges=['best-seller'] → texto 'Mas vendido' presente (sin tilde)", () => {
    render(<ProductBadges badges={["best-seller"]} />);
    expect(screen.getByText("Mas vendido")).toBeInTheDocument();
  });

  it("badges=['new'] → texto 'Nuevo' presente", () => {
    render(<ProductBadges badges={["new"]} />);
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
  });

  it("badges=['low-stock'] con details.lowStock=2 → muestra 'Solo 2'", () => {
    render(<ProductBadges badges={["low-stock"]} details={{ lowStock: 2 }} />);
    expect(screen.getByText("Solo 2")).toBeInTheDocument();
  });

  it("badges=['low-stock'] sin details → muestra 'Solo pocos' (fallback)", () => {
    render(<ProductBadges badges={["low-stock"]} />);
    expect(screen.getByText("Solo pocos")).toBeInTheDocument();
  });

  it("badges múltiples → todos presentes simultáneamente", () => {
    render(
      <ProductBadges
        badges={["best-seller", "new", "low-stock"]}
        details={{ lowStock: 3 }}
      />
    );
    expect(screen.getByText("Mas vendido")).toBeInTheDocument();
    expect(screen.getByText("Nuevo")).toBeInTheDocument();
    expect(screen.getByText("Solo 3")).toBeInTheDocument();
  });

  it("tooltip presente: el span tiene atributo title con el label", () => {
    render(<ProductBadges badges={["best-seller"]} />);
    const span = screen.getByTitle("Mas vendido");
    expect(span).toBeInTheDocument();
  });

  it("badge desconocido → no renderiza nada para ese badge", () => {
    render(<ProductBadges badges={["unknown-badge"]} />);
    // El BADGE_MAP no tiene "unknown-badge" → retorna null para ese item
    // pero el contenedor principal sí se renderiza (badges.length > 0)
    // No debe haber texto visible del badge desconocido
    expect(screen.queryByText("unknown-badge")).not.toBeInTheDocument();
  });
});
