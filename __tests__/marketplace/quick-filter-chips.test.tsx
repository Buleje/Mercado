/**
 * Tests de componente — QuickFilterChips
 *
 * Verifica:
 *  1. Renderiza los 5 chips predefinidos
 *  2. Click en un chip inactivo lo marca como activo (aria-pressed="true")
 *  3. Doble click togglea: activo -> inactivo
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  Clock:     () => <span data-testid="icon-clock" />,
  Truck:     () => <span data-testid="icon-truck" />,
  Tag:       () => <span data-testid="icon-tag" />,
  Star:      () => <span data-testid="icon-star" />,
  Sparkles:  () => <span data-testid="icon-sparkles" />,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import QuickFilterChips, {
  type QuickChipId,
} from "@/components/marketplace/QuickFilterChips";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderChips(
  activeChips: Set<QuickChipId> = new Set(),
  onToggle = vi.fn(),
) {
  return render(
    <QuickFilterChips activeChips={activeChips} onToggle={onToggle} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QuickFilterChips", () => {
  it("renderiza los 5 chips predefinidos", () => {
    renderChips();

    expect(screen.getByRole("button", { name: "Abierto ahora" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delivery gratis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Con ofertas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4.5 o mas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevos" })).toBeInTheDocument();

    const chips = screen.getAllByRole("button");
    expect(chips).toHaveLength(5);
  });

  it("chip inactivo: click llama onToggle con su id y aria-pressed es false antes del click", () => {
    const onToggle = vi.fn();
    renderChips(new Set(), onToggle);

    const chip = screen.getByRole("button", { name: "Con ofertas" });

    // Antes del click, el chip no esta activo
    expect(chip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chip);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("has_offers");
  });

  it("chip activo: aria-pressed=true y segundo click llama onToggle (toggle off)", () => {
    const onToggle = vi.fn();

    // Primera render: chip activo
    const { rerender } = render(
      <QuickFilterChips
        activeChips={new Set<QuickChipId>(["top_rated"])}
        onToggle={onToggle}
      />,
    );

    const chip = screen.getByRole("button", { name: "4.5 o mas" });
    expect(chip).toHaveAttribute("aria-pressed", "true");

    // Simular toggle off — el padre actualizaria activeChips; aqui comprobamos
    // que onToggle se llama correctamente para que el padre lo gestione.
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledWith("top_rated");

    // Ahora el padre quita el chip del Set; re-renderizamos sin el chip activo
    rerender(
      <QuickFilterChips
        activeChips={new Set<QuickChipId>()}
        onToggle={onToggle}
      />,
    );

    expect(chip).toHaveAttribute("aria-pressed", "false");
  });
});
