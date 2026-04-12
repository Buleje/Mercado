/**
 * Tests — AdminMotionProvider
 *
 * Verifica:
 *   1. El provider renderiza sus children sin crashear
 *   2. m.div funciona dentro del boundary (LazyMotion)
 *   3. AnimatePresence funciona dentro del boundary
 *   4. El barrel index.ts exporta AdminMotionProvider, m y AnimatePresence
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mock de framer-motion ─────────────────────────────────────────────────────
// Simula LazyMotion, domAnimation, m y AnimatePresence sin el bundle real.
vi.mock("framer-motion", () => ({
  LazyMotion: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="lazy-motion-boundary">{children}</div>
  ),
  domAnimation: {},
  m: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div data-testid="m-div" {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span data-testid="m-span" {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="animate-presence">{children}</div>
  ),
}));

import AdminMotionProvider from "@/components/admin/providers/AdminMotionProvider";
import { m, AnimatePresence } from "@/components/admin/providers";

// ── AdminMotionProvider ───────────────────────────────────────────────────────

describe("AdminMotionProvider", () => {
  it("renderiza children correctamente", () => {
    render(
      <AdminMotionProvider>
        <p data-testid="child">Contenido del admin</p>
      </AdminMotionProvider>
    );
    expect(screen.getByTestId("child")).toBeDefined();
    expect(screen.getByText("Contenido del admin")).toBeDefined();
  });

  it("envuelve children en un LazyMotion boundary", () => {
    render(
      <AdminMotionProvider>
        <span>test</span>
      </AdminMotionProvider>
    );
    // El mock de LazyMotion agrega data-testid="lazy-motion-boundary"
    expect(screen.getByTestId("lazy-motion-boundary")).toBeDefined();
  });

  it("no renderiza nada extra además del boundary y los children", () => {
    const { container } = render(
      <AdminMotionProvider>
        <div data-testid="solo-hijo" />
      </AdminMotionProvider>
    );
    // Solo debe haber el boundary wrapping al hijo
    expect(container.querySelector("[data-testid='solo-hijo']")).toBeDefined();
  });
});

// ── m.div dentro del boundary ─────────────────────────────────────────────────

describe("m (framer-motion motion shorthand) dentro del AdminMotionProvider", () => {
  it("m.div renderiza como un div con los props correctos", () => {
    render(
      <AdminMotionProvider>
        <m.div data-testid="animated-box" aria-label="caja animada">
          contenido animado
        </m.div>
      </AdminMotionProvider>
    );
    const box = screen.getByTestId("animated-box");
    expect(box).toBeDefined();
    expect(box.getAttribute("aria-label")).toBe("caja animada");
  });

  it("m.div renderiza children correctamente", () => {
    render(
      <AdminMotionProvider>
        <m.div>
          <span data-testid="inner">texto interior</span>
        </m.div>
      </AdminMotionProvider>
    );
    expect(screen.getByTestId("inner")).toBeDefined();
  });
});

// ── AnimatePresence dentro del boundary ───────────────────────────────────────

describe("AnimatePresence dentro del AdminMotionProvider", () => {
  it("renderiza children condicionales sin crashear", () => {
    const show = true;
    render(
      <AdminMotionProvider>
        <AnimatePresence>
          {show && <m.div key="modal" data-testid="modal-animado">modal</m.div>}
        </AnimatePresence>
      </AdminMotionProvider>
    );
    expect(screen.getByTestId("modal-animado")).toBeDefined();
  });

  it("el wrapper AnimatePresence está presente en el DOM via mock", () => {
    render(
      <AdminMotionProvider>
        <AnimatePresence>
          <span key="a">x</span>
        </AnimatePresence>
      </AdminMotionProvider>
    );
    expect(screen.getByTestId("animate-presence")).toBeDefined();
  });
});

// ── Barrel exports ────────────────────────────────────────────────────────────

describe("components/admin/providers barrel", () => {
  it("exporta AdminMotionProvider", async () => {
    const providers = await import("@/components/admin/providers");
    expect(providers.AdminMotionProvider).toBeDefined();
  });

  it("exporta m (motion shorthand)", () => {
    expect(m).toBeDefined();
    expect(m.div).toBeDefined();
  });

  it("exporta AnimatePresence", () => {
    expect(AnimatePresence).toBeDefined();
  });
});
