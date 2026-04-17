/**
 * Tests de PrimaryButton (ADR-068/069 — design system governance).
 *
 * Objetivo: congelar la API publica del componente para que refactors
 * futuros no rompan los ~30 consumidores del admin + customer journey.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrimaryButton } from "@buleje/design-system";

vi.mock("server-only", () => ({}));

describe("PrimaryButton", () => {
  it("renderiza children y aplica variant primary por default", () => {
    render(<PrimaryButton>Guardar</PrimaryButton>);
    const btn = screen.getByRole("button", { name: "Guardar" });
    expect(btn.className).toContain("bg-[var(--text-primary)]");
    expect(btn.className).toContain("text-[var(--surface-canvas)]");
  });

  it("variant secondary usa surface-raised + rule-base border", () => {
    render(<PrimaryButton variant="secondary">Cancelar</PrimaryButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[var(--surface-raised)]");
    expect(btn.className).toContain("border-[var(--rule-base)]");
  });

  it("variant danger usa data-error token", () => {
    render(<PrimaryButton variant="danger">Eliminar</PrimaryButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-[var(--data-error)]");
  });

  it("variant ghost es transparente con hover a sunken", () => {
    render(<PrimaryButton variant="ghost">Ver mas</PrimaryButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-transparent");
    expect(btn.className).toContain("hover:bg-[var(--surface-sunken)]");
  });

  it("size sm tiene min-h-[32px]", () => {
    render(<PrimaryButton size="sm">a</PrimaryButton>);
    expect(screen.getByRole("button").className).toContain("min-h-[32px]");
  });

  it("size md (default) tiene min-h-[40px]", () => {
    render(<PrimaryButton>a</PrimaryButton>);
    expect(screen.getByRole("button").className).toContain("min-h-[40px]");
  });

  it("size lg tiene min-h-[44px] (a11y target)", () => {
    render(<PrimaryButton size="lg">a</PrimaryButton>);
    expect(screen.getByRole("button").className).toContain("min-h-[44px]");
  });

  it("loading renderiza spinner y deshabilita el boton", () => {
    render(<PrimaryButton loading>Guardar</PrimaryButton>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.querySelector(".animate-spin")).toBeTruthy();
  });

  it("disabled bloquea clicks", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<PrimaryButton disabled onClick={onClick}>a</PrimaryButton>);
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("leftIcon y rightIcon se renderizan en el orden correcto", () => {
    render(
      <PrimaryButton
        leftIcon={<span data-testid="left">L</span>}
        rightIcon={<span data-testid="right">R</span>}
      >
        Text
      </PrimaryButton>
    );
    const left = screen.getByTestId("left");
    const right = screen.getByTestId("right");
    const relation = left.compareDocumentPosition(right);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("loading oculta leftIcon y muestra spinner", () => {
    render(
      <PrimaryButton loading leftIcon={<span data-testid="left">L</span>}>
        Save
      </PrimaryButton>
    );
    expect(screen.queryByTestId("left")).toBeNull();
  });

  it("asChild renderiza el hijo preservando las clases", () => {
    render(
      <PrimaryButton asChild>
        <a href="/foo" data-testid="link">Ir</a>
      </PrimaryButton>
    );
    const link = screen.getByTestId("link");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/foo");
    expect(link.className).toContain("bg-[var(--text-primary)]");
  });

  it("onClick se invoca al hacer click", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<PrimaryButton onClick={onClick}>a</PrimaryButton>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("className custom se concatena sin pisar tokens base", () => {
    render(<PrimaryButton className="my-custom">a</PrimaryButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("my-custom");
    expect(btn.className).toContain("bg-[var(--text-primary)]");
  });

  it("focus-visible ring usa text-primary como color", () => {
    render(<PrimaryButton>a</PrimaryButton>);
    expect(screen.getByRole("button").className).toContain("focus-visible:ring-[var(--text-primary)]");
  });
});
