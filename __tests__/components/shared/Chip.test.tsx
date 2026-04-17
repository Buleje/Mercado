/**
 * Tests de Chip (ADR-068/069).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip } from "@buleje/design-system";

vi.mock("server-only", () => ({}));

describe("Chip", () => {
  it("renderiza como <button>", () => {
    render(<Chip>Hoy</Chip>);
    expect(screen.getByRole("button", { name: "Hoy" }).tagName).toBe("BUTTON");
  });

  it("estado inactive (default) usa surface-sunken bg + rule-base border", () => {
    render(<Chip>x</Chip>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-[var(--surface-sunken)]");
    expect(cls).toContain("border-[var(--rule-base)]");
  });

  it("estado active usa text-primary bg + elev-1", () => {
    render(<Chip active>x</Chip>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-[var(--text-primary)]");
    expect(cls).toContain("elev-1");
  });

  it("aria-pressed refleja el estado active", () => {
    render(<Chip active>x</Chip>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("disabled bloquea clicks", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Chip disabled onClick={onClick}>x</Chip>);
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled agrega opacity-40 + cursor-not-allowed", () => {
    render(<Chip disabled>x</Chip>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("opacity-40");
    expect(cls).toContain("cursor-not-allowed");
  });

  it("onClick se invoca cuando no disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Chip onClick={onClick}>x</Chip>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("count > 0 renderiza badge con numero", () => {
    render(<Chip count={5}>a</Chip>);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("count = 0 no renderiza badge", () => {
    render(<Chip count={0}>a</Chip>);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("size sm usa ts-xs", () => {
    render(<Chip size="sm">a</Chip>);
    expect(screen.getByRole("button").className).toContain("text-[length:var(--ts-xs)]");
  });
});
