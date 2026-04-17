/**
 * Tests de IconBadge (ADR-068/069 — design system governance).
 *
 * Objetivo: congelar la API publica del componente para que los
 * ~20 consumidores (step numbers, tier badges, icon containers)
 * no se rompan en refactors futuros.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IconBadge } from "@buleje/design-system";

vi.mock("server-only", () => ({}));

describe("IconBadge", () => {
  it("renderiza como span por default", () => {
    render(<IconBadge data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").tagName).toBe("SPAN");
  });

  it("asDiv renderiza como div", () => {
    render(<IconBadge asDiv data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").tagName).toBe("DIV");
  });

  it("size xs tiene h-4 w-4", () => {
    render(<IconBadge size="xs" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("h-4 w-4");
  });

  it("size sm tiene h-5 w-5", () => {
    render(<IconBadge size="sm" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("h-5 w-5");
  });

  it("size md (default) tiene h-9 w-9", () => {
    render(<IconBadge data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("h-9 w-9");
  });

  it("size step tiene h-10 w-10", () => {
    render(<IconBadge size="step" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("h-10 w-10");
  });

  it("size lg tiene h-12 w-12", () => {
    render(<IconBadge size="lg" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("h-12 w-12");
  });

  it("size xl tiene h-14 w-14", () => {
    render(<IconBadge size="xl" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("h-14 w-14");
  });

  it("shape circle (default) usa rounded-full", () => {
    render(<IconBadge data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("rounded-full");
  });

  it("shape square usa rounded-lg", () => {
    render(<IconBadge shape="square" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("rounded-lg");
  });

  it("intent primary (default) usa text-primary + surface-canvas tokens", () => {
    render(<IconBadge data-testid="b">1</IconBadge>);
    const cls = screen.getByTestId("b").className;
    expect(cls).toContain("bg-[var(--text-primary)]");
    expect(cls).toContain("text-[var(--surface-canvas)]");
  });

  it("intent muted usa surface-sunken + text-secondary", () => {
    render(<IconBadge intent="muted" data-testid="b">1</IconBadge>);
    const cls = screen.getByTestId("b").className;
    expect(cls).toContain("bg-[var(--surface-sunken)]");
    expect(cls).toContain("text-[var(--text-secondary)]");
  });

  it("intent success usa data-success", () => {
    render(<IconBadge intent="success" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("bg-[var(--data-success)]");
  });

  it("intent warning usa data-warning", () => {
    render(<IconBadge intent="warning" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("bg-[var(--data-warning)]");
  });

  it("intent danger usa data-error", () => {
    render(<IconBadge intent="danger" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("bg-[var(--data-error)]");
  });

  it("className custom se concatena", () => {
    render(<IconBadge className="mt-2" data-testid="b">1</IconBadge>);
    expect(screen.getByTestId("b").className).toContain("mt-2");
  });

  it("renderiza children (icono o numero)", () => {
    render(<IconBadge data-testid="b">42</IconBadge>);
    expect(screen.getByTestId("b").textContent).toBe("42");
  });
});
