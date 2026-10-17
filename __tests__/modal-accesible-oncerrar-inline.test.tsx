/**
 * `useModalAccesible` no roba el foco cuando el padre re-renderiza con un
 * `onCerrar` inline.
 *
 * Revisión adversarial 2026-09-12 (migración de accesibilidad del panel): tres
 * modales recibían `onClose={() => setX(null)}` escrito inline —el motivo de
 * anulación de un adelanto, el filtro de columna de la hoja de cálculo, las
 * carpetas inteligentes—. El efecto del hook dependía de `onCerrar`: cada
 * render del padre lo desmontaba y montaba de nuevo, y el foco volvía al
 * primer control mientras el usuario tipeaba en el tercero.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";

function Modal({ onCerrar }: { onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  useModalAccesible(caja, { onCerrar });
  return (
    <div ref={caja} role="dialog" aria-modal="true" aria-label="Anular adelanto" tabIndex={-1}>
      <button type="button">Primero</button>
      <textarea aria-label="Motivo" />
    </div>
  );
}

beforeEach(() => {
  /* El foco inicial va en un requestAnimationFrame: se ejecuta en el acto.
     `stubGlobal` y no `spyOn(window, …)`: el hook llama al rAF GLOBAL, y en el
     entorno jsdom de vitest no es el mismo binding que `window.…` — con spyOn
     el foco inicial nunca corría y el test pasaba también SIN el arreglo. */
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  /* jsdom no calcula layout: todo mide 0 y el hook descarta lo invisible
     (`offsetWidth > 0 || offsetHeight > 0 || es el activo`). Con eso la lista
     de enfocables era SÓLO el elemento con foco, y un re-montaje «robaba» el
     foco hacia el mismo elemento — el test pasaba también sin el arreglo. */
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 10 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
});

describe("onCerrar inline", () => {
  it("un re-render del padre NO devuelve el foco al primer control", () => {
    const { rerender } = render(<Modal onCerrar={() => {}} />);
    const motivo = screen.getByLabelText("Motivo");
    motivo.focus();
    expect(document.activeElement).toBe(motivo);

    /* El padre re-renderiza por algo ajeno: función nueva, misma intención. */
    rerender(<Modal onCerrar={() => {}} />);
    rerender(<Modal onCerrar={() => {}} />);

    expect(document.activeElement).toBe(motivo);
  });

  it("Escape llama a la ÚLTIMA versión de onCerrar, no a la del primer render", () => {
    const vieja = vi.fn();
    const nueva = vi.fn();
    const { rerender } = render(<Modal onCerrar={vieja} />);
    rerender(<Modal onCerrar={nueva} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(nueva).toHaveBeenCalledTimes(1);
    expect(vieja).not.toHaveBeenCalled();
  });
});
