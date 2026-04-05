import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "@/components/admin/shared/EmptyState";

describe("EmptyState", () => {
  it("should render default title and description", () => {
    render(<EmptyState />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.getByText("No hay información para mostrar aún.")).toBeInTheDocument();
  });

  it("should render custom title and description", () => {
    render(<EmptyState title="No hay pedidos" description="Crea tu primer pedido" />);
    expect(screen.getByText("No hay pedidos")).toBeInTheDocument();
    expect(screen.getByText("Crea tu primer pedido")).toBeInTheDocument();
  });

  it("should render action button when provided", () => {
    const { getByText } = render(
      <EmptyState action={{ label: "Crear nuevo", onClick: () => {} }} />
    );
    expect(getByText("Crear nuevo")).toBeInTheDocument();
  });

  it("should not render action button by default", () => {
    const { container } = render(<EmptyState />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("should not have dark: classes", () => {
    const { container } = render(<EmptyState />);
    const html = container.innerHTML;
    expect(html).not.toContain("dark:");
  });

  it("should apply custom className", () => {
    const { container } = render(<EmptyState className="my-custom-class" />);
    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});
