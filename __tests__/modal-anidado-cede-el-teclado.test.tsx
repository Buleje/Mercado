/**
 * Un modal que abre otro modal deja de mandar (`useModalAccesible`).
 *
 * El bug real (Brandon, 2026-09-11: *«el tema de las especies para editar,
 * crear, etc. no funciona y se lagea el modal»*): el catálogo de especies se
 * abre DESDE «Producir sin lote», y el de abajo seguía escuchando el teclado en
 * fase de **captura** —antes que nadie—. Resultado medido en el navegador:
 *
 *  · Escape cerraba el de ABAJO, con el cubicado a medio hacer adentro.
 *  · Tab devolvía el foco al de abajo: no se podía tipear arriba.
 *
 * Estos tests fijan la regla: si hay otro diálogo montado después, el de abajo
 * se calla. Y cuando vuelve a ser el único, vuelve a responder — si no, cerrar
 * el de arriba dejaría al de abajo sordo para siempre.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";

function ModalDeAbajo({ onCerrar, conModalEncima }: { onCerrar: () => void; conModalEncima: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  useModalAccesible(caja, { onCerrar });
  return (
    <>
      <div ref={caja} role="dialog" aria-modal="true" aria-label="El de abajo" tabIndex={-1}>
        <button type="button">Un botón del de abajo</button>
      </div>
      {/* El de arriba se monta DESPUÉS en el DOM, como un portal de Radix. */}
      {conModalEncima && (
        <div role="dialog" aria-modal="true" aria-label="El de arriba">
          <input aria-label="Campo del de arriba" />
        </div>
      )}
    </>
  );
}

describe("con otro modal encima, el de abajo cede el teclado", () => {
  it("Escape NO cierra el de abajo", () => {
    const cerrar = vi.fn();
    render(<ModalDeAbajo onCerrar={cerrar} conModalEncima />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cerrar).not.toHaveBeenCalled();
    cleanup();
  });

  it("Tab NO se lo lleva de vuelta: el evento sigue su curso", () => {
    const cerrar = vi.fn();
    render(<ModalDeAbajo onCerrar={cerrar} conModalEncima />);
    /* `defaultPrevented` es la prueba: la trampa de Tab del de abajo funciona
       llamando `preventDefault()`. Si no lo llama, el navegador (o el foco de
       Radix, arriba) hace lo suyo. */
    const evento = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    cleanup();
  });
});

describe("sin nada encima, el de abajo sigue mandando", () => {
  it("Escape cierra", () => {
    const cerrar = vi.fn();
    render(<ModalDeAbajo onCerrar={cerrar} conModalEncima={false} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cerrar).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("Tab se queda adentro", () => {
    const cerrar = vi.fn();
    render(<ModalDeAbajo onCerrar={cerrar} conModalEncima={false} />);
    const evento = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
    cleanup();
  });
});
