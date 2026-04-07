/**
 * Tests — SponsoredBadge
 * Cubre: render del badge, tooltip al hover/focus.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

afterEach(() => {
  vi.restoreAllMocks();
});

import SponsoredBadge from "@/components/marketplace/SponsoredBadge";

describe("SponsoredBadge", () => {
  it("renderiza el texto Patrocinado", () => {
    render(<SponsoredBadge />);
    expect(screen.getByText(/Patrocinado/i)).toBeInTheDocument();
  });

  it("tiene role=note y aria-label correcto", () => {
    render(<SponsoredBadge />);
    const badge = screen.getByRole("note");
    expect(badge).toHaveAttribute("aria-label", "Producto patrocinado");
  });

  it("muestra tooltip al hacer mouseEnter", () => {
    render(<SponsoredBadge />);
    const container = screen.getByText(/Patrocinado/i).closest("div");

    fireEvent.mouseEnter(container!);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain("vendedor lo esta promocionando");
  });

  it("oculta tooltip al hacer mouseLeave", () => {
    render(<SponsoredBadge />);
    const container = screen.getByText(/Patrocinado/i).closest("div");

    fireEvent.mouseEnter(container!);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(container!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("muestra tooltip al hacer focus y lo oculta al blur", () => {
    render(<SponsoredBadge />);
    const container = screen.getByText(/Patrocinado/i).closest("div");

    fireEvent.focus(container!);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.blur(container!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("acepta className personalizado", () => {
    const { container } = render(<SponsoredBadge className="test-class" />);
    expect(container.querySelector(".test-class")).not.toBeNull();
  });
});
