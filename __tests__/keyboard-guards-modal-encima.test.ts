/**
 * `hayModalEncima(dueno)` (10-10): un atajo global de teclado no actúa si hay
 * un modal a la vista que no contiene a su dueño. Caso medido: Cámaras abierto
 * desde los accesos rápidos sobre el POS, una «a» saltaba al buscador del POS
 * de atrás. El mismo módulo DENTRO del modal conserva sus atajos, y un diálogo
 * montado pero cerrado (el cajón del menú móvil) no cuenta.
 */
import { afterEach, describe, expect, it } from "vitest";
import { hayModalEncima } from "@/lib/keyboard-guards";

function modal(): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  document.body.appendChild(el);
  return el;
}

function dueno(padre: HTMLElement = document.body): HTMLInputElement {
  const el = document.createElement("input");
  padre.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("hayModalEncima", () => {
  it("sin modal abierto, el atajo es del dueño", () => {
    expect(hayModalEncima(dueno())).toBe(false);
    expect(hayModalEncima(null)).toBe(false);
  });

  it("un modal que no contiene al dueño está encima (el POS de atrás no recibe la tecla)", () => {
    const pos = dueno();
    modal();
    expect(hayModalEncima(pos)).toBe(true);
  });

  it("el dueño adentro del modal de arriba conserva su atajo", () => {
    const acceso = modal();
    expect(hayModalEncima(dueno(acceso))).toBe(false);
  });

  it("con dos modales manda el último: el dueño en el de abajo queda tapado", () => {
    const abajo = modal();
    const enAbajo = dueno(abajo);
    const arriba = modal();
    expect(hayModalEncima(enAbajo)).toBe(true);
    expect(hayModalEncima(dueno(arriba))).toBe(false);
  });

  it("sin dueño montado y con un modal abierto, se toma como encima", () => {
    modal();
    expect(hayModalEncima(null)).toBe(true);
  });

  it("un diálogo montado pero oculto (display:none) no cuenta", () => {
    const pos = dueno();
    const cajon = modal();
    Object.defineProperty(cajon, "checkVisibility", { value: () => false });
    expect(hayModalEncima(pos)).toBe(false);
  });

  it("un diálogo corrido fuera de la pantalla (cajón móvil cerrado) no cuenta", () => {
    const pos = dueno();
    const cajon = modal();
    cajon.getBoundingClientRect = () =>
      ({ left: -400, right: -10, top: 0, bottom: 800, width: 390, height: 800, x: -400, y: 0 }) as DOMRect;
    expect(hayModalEncima(pos)).toBe(false);
  });
});
