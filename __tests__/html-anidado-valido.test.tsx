/**
 * Tests — anidado HTML válido en las superficies que lo rompían.
 *
 * El navegador no "arregla" el HTML mal anidado: lo re-arma. Un `<a>` colgando
 * de un `<button>`, o un `<ul>` dentro de un `<p>`, se sacan de su lugar al
 * parsear, y entonces el árbol que React hidrata no es el que renderizó — de
 * ahí los "cannot be a descendant of" en consola. Los tres casos de acá abajo
 * llegaron a la consola del panel; quedan clavados para que no vuelvan.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ModalFooter } from "@/components/admin/forestal/ctp-shared";
import { ConversationView } from "@/components/admin/ChatTab/ConversationView";
import type { ChatMessageView } from "@/components/admin/ChatTab/types";

/** Bloque dentro de `<p>`, o interactivo dentro de interactivo. */
function anidadosInvalidos(raiz: HTMLElement): string[] {
  const fallas: string[] = [];
  raiz.querySelectorAll("p").forEach((p) => {
    const bloque = p.querySelectorAll("div,ul,ol,li,details,table,section,form,pre,h1,h2,h3,h4,h5,h6,p");
    bloque.forEach((b) => fallas.push(`<${b.tagName.toLowerCase()}> dentro de <p>`));
  });
  raiz
    .querySelectorAll("button button, button a, a a, a button, button input, button select, button textarea")
    .forEach((el) => {
      const padre = el.parentElement?.closest("button,a");
      fallas.push(`<${el.tagName.toLowerCase()}> dentro de <${padre?.tagName.toLowerCase() ?? "?"}>`);
    });
  return fallas;
}

describe("ModalFooter del CTP", () => {
  it("admite un aviso con lista desplegable sin romper el anidado", () => {
    // Es exactamente lo que manda el modal de guía de despacho cuando explica
    // por qué quedaron casilleros vacíos.
    const { container } = render(
      <ModalFooter
        aviso={
          <span>
            Se completó el destinatario.
            <details>
              <summary>¿por qué quedaron casilleros vacíos?</summary>
              <ul>
                <li>N° de comprobante es único de cada venta</li>
              </ul>
            </details>
          </span>
        }
      >
        <button type="button">Cerrar</button>
      </ModalFooter>,
    );
    expect(anidadosInvalidos(container)).toEqual([]);
    expect(container.querySelector("details")).not.toBeNull();
  });

  it("mantiene el error anunciado como alerta", () => {
    const { container } = render(
      <ModalFooter error="Falta el número de GTF">
        <button type="button">Cerrar</button>
      </ModalFooter>,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Falta el número de GTF");
    expect(anidadosInvalidos(container)).toEqual([]);
  });
});

function mensaje(over: Partial<ChatMessageView>): ChatMessageView {
  return {
    id: "m1",
    tenantId: "t1",
    threadId: "th1",
    senderType: "buyer",
    senderId: null,
    senderName: "Vecina",
    body: "Hola, ¿llegó mi pedido?",
    messageType: "text",
    attachmentUrl: null,
    metadataJson: null,
    readByBuyerAt: null,
    readBySellerAt: null,
    deletedAt: null,
    createdAt: "2026-08-08T12:00:00.000Z",
    ...over,
  };
}

describe("Burbuja del chat de admin", () => {
  it("el comprobante adjunto es un enlace y no cuelga de un botón", () => {
    const { container } = render(
      <ConversationView
        loading={false}
        messages={[mensaje({ messageType: "image", attachmentUrl: "https://ejemplo.test/comprobante.jpg" })]}
      />,
    );
    expect(container.querySelector('a[href="https://ejemplo.test/comprobante.jpg"]')).not.toBeNull();
    expect(anidadosInvalidos(container)).toEqual([]);
  });

  it("la burbuja de texto sigue siendo operable por teclado", () => {
    const { container } = render(<ConversationView loading={false} messages={[mensaje({})]} />);
    const burbuja = container.querySelector('[role="button"][aria-label="Reaccionar o responder"]');
    expect(burbuja).not.toBeNull();
    expect(burbuja?.getAttribute("tabindex")).toBe("0");
    expect(anidadosInvalidos(container)).toEqual([]);
  });
});
