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

function ModalDeAbajo({
  onCerrar,
  conModalEncima,
  rolDeArriba = "dialog",
}: {
  onCerrar: () => void;
  conModalEncima: boolean;
  rolDeArriba?: "dialog" | "alertdialog";
}) {
  const caja = useRef<HTMLDivElement>(null);
  useModalAccesible(caja, { onCerrar });
  return (
    <>
      <div ref={caja} role="dialog" aria-modal="true" aria-label="El de abajo" tabIndex={-1}>
        <button type="button">Un botón del de abajo</button>
      </div>
      {/* El de arriba se monta DESPUÉS en el DOM, como un portal de Radix. */}
      {conModalEncima && (
        <div role={rolDeArriba} aria-modal="true" aria-label="El de arriba">
          <input aria-label="Campo del de arriba" />
        </div>
      )}
    </>
  );
}

/**
 * La confirmación del panel (`useConfirm`) es un AlertDialog de Radix:
 * `role="alertdialog"`, no `dialog`. Al reemplazar los `confirm()` nativos
 * dentro de modales a mano, un «¿Eliminar?» abierto encima perdía el Tab y su
 * Escape cerraba el modal de abajo (2026-09-12).
 */
describe("una confirmación (alertdialog) encima también manda", () => {
  it("Escape NO cierra el de abajo", () => {
    const cerrar = vi.fn();
    render(<ModalDeAbajo onCerrar={cerrar} conModalEncima rolDeArriba="alertdialog" />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cerrar).not.toHaveBeenCalled();
    cleanup();
  });

  it("Tab NO se lo lleva de vuelta", () => {
    render(<ModalDeAbajo onCerrar={vi.fn()} conModalEncima rolDeArriba="alertdialog" />);
    const evento = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    cleanup();
  });
});

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

/**
 * Un `role="dialog"` DENTRO del modal que no es modal —el detalle flotante de un
 * día de la tira, un popover de celda— es parte de este modal, no uno encima.
 * Contarlo como «otro diálogo» apagaba la trampa de Tab mientras estaba abierto
 * y el foco se escapaba a la página de atrás (revisor, 2026-09-14).
 */
function ModalConDialogoAdentro({ adentroEsModal }: { adentroEsModal: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  useModalAccesible(caja, { onCerrar: vi.fn() });
  return (
    <div ref={caja} role="dialog" aria-modal="true" aria-label="Producir sin lote" tabIndex={-1}>
      <button type="button">Un botón del modal</button>
      <div role="dialog" aria-label="Detalle del miércoles 09/09" {...(adentroEsModal ? { "aria-modal": "true" } : {})}>
        <button type="button">Cerrar el detalle</button>
      </div>
    </div>
  );
}

describe("un diálogo adentro de la caja", () => {
  it("si NO es modal (popover), el modal sigue atrapando Tab", () => {
    render(<ModalConDialogoAdentro adentroEsModal={false} />);
    const evento = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
    cleanup();
  });

  it("si ES modal (aria-modal), el de adentro manda y el de afuera cede", () => {
    render(<ModalConDialogoAdentro adentroEsModal />);
    const evento = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    cleanup();
  });
});
