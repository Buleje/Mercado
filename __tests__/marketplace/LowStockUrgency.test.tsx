import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LowStockUrgency from "@/components/marketplace/LowStockUrgency";

describe("LowStockUrgency", () => {
  it("no renderiza nada si el stock supera el threshold", () => {
    const { container } = render(<LowStockUrgency stock={50} threshold={10} />);
    expect(container.firstChild).toBeNull();
  });

  it("no renderiza nada si stock es 0 (producto agotado)", () => {
    const { container } = render(<LowStockUrgency stock={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("nivel 1 (6-10): muestra 'Solo quedan N unidades' sin pulse", () => {
    render(<LowStockUrgency stock={8} />);
    expect(screen.getByText(/Solo quedan 8 unidades/i)).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status.className).not.toContain("animate-pulse");
  });

  it("nivel 2 (2-5): 'se está agotando' con pulse en ícono", () => {
    render(<LowStockUrgency stock={3} />);
    expect(screen.getByText(/Solo 3 unidades — se está agotando/i)).toBeInTheDocument();
  });

  it("nivel 3 (1): 'Última unidad disponible' con pulse marcado", () => {
    render(<LowStockUrgency stock={1} />);
    expect(screen.getByText(/Última unidad disponible/i)).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status.className).toContain("animate-pulse");
  });

  it("muestra social proof solo cuando recentViews >= 3", async () => {
    const { rerender } = render(<LowStockUrgency stock={4} recentViews={1} />);
    // Con 1 vista no muestra el mensaje — evita "1 persona" que suena vacío
    expect(screen.queryByText(/personas lo vieron/i)).not.toBeInTheDocument();

    rerender(<LowStockUrgency stock={4} recentViews={8} />);
    // Esperar a que se monte (guard contra hydration mismatch)
    await screen.findByText(/8 personas lo vieron en la última hora/i);
  });

  it("variante compact renderiza como span inline", () => {
    render(<LowStockUrgency stock={5} compact />);
    const el = screen.getByRole("status");
    expect(el.tagName).toBe("SPAN");
  });

  it("marca aria-live='polite' para anunciar cambios sin interrumpir", () => {
    render(<LowStockUrgency stock={2} />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });
});
