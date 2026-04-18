/**
 * Tests de Text (ADR-070 — typography tokens governance).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Text } from "@buleje/design-system";

vi.mock("server-only", () => ({}));

describe("Text", () => {
  it("variant body (default) renderiza como <p>", () => {
    render(<Text data-testid="t">hola</Text>);
    expect(screen.getByTestId("t").tagName).toBe("P");
  });

  it("variant title renderiza como <h2>", () => {
    render(<Text variant="title" data-testid="t">Titulo</Text>);
    expect(screen.getByTestId("t").tagName).toBe("H2");
  });

  it("variant heading renderiza como <h3>", () => {
    render(<Text variant="heading" data-testid="t">Heading</Text>);
    expect(screen.getByTestId("t").tagName).toBe("H3");
  });

  it("variant kicker renderiza como <span>", () => {
    render(<Text variant="kicker" data-testid="t">SECCION</Text>);
    expect(screen.getByTestId("t").tagName).toBe("SPAN");
  });

  it("prop `as` override el elemento default", () => {
    render(<Text variant="body" as="article" data-testid="t">x</Text>);
    expect(screen.getByTestId("t").tagName).toBe("ARTICLE");
  });

  it("variant body usa ts-sm + text-primary", () => {
    render(<Text data-testid="t">a</Text>);
    const cls = screen.getByTestId("t").className;
    expect(cls).toContain("text-[length:var(--ts-sm)]");
    expect(cls).toContain("text-[var(--text-primary)]");
  });

  it("variant kpi-value usa tabular-nums + extrabold", () => {
    render(<Text variant="kpi-value" data-testid="t">1,234</Text>);
    const cls = screen.getByTestId("t").className;
    expect(cls).toContain("tabular-nums");
    expect(cls).toContain("font-extrabold");
  });

  it("variant kicker usa tracking-wider + uppercase", () => {
    render(<Text variant="kicker" data-testid="t">x</Text>);
    const cls = screen.getByTestId("t").className;
    expect(cls).toContain("uppercase");
    expect(cls).toContain("tracking-[var(--ls-wider)]");
  });

  it("variant caption usa ts-2xs + text-tertiary", () => {
    render(<Text variant="caption" data-testid="t">x</Text>);
    const cls = screen.getByTestId("t").className;
    expect(cls).toContain("text-[length:var(--ts-2xs)]");
    expect(cls).toContain("text-[var(--text-tertiary)]");
  });

  it("className custom se concatena sin pisar tokens", () => {
    render(<Text className="mt-2 italic" data-testid="t">a</Text>);
    const cls = screen.getByTestId("t").className;
    expect(cls).toContain("mt-2");
    expect(cls).toContain("italic");
    expect(cls).toContain("text-[var(--text-primary)]");
  });

  it("renderiza children", () => {
    render(<Text data-testid="t">hola mundo</Text>);
    expect(screen.getByTestId("t").textContent).toBe("hola mundo");
  });

  it("variant heading usa tracking-tight", () => {
    render(<Text variant="heading" data-testid="t">x</Text>);
    expect(screen.getByTestId("t").className).toContain("tracking-[var(--ls-tight)]");
  });
});
