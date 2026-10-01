/**
 * Tests — el modal como ventana: se arrastra, se estira y se fija.
 *
 * Pedido de Brandon (2026-09-15): «que se puedan mover como una ventana
 * arrastrable, achicarlos y agrandarlos como ventana, también opción de
 * fijarlos para trabajar sin el problema que se oculta al presionar fuera».
 *
 * Lo que fijan estos tests es lo que NO se puede romper al cablear los otros
 * modales del panel:
 *
 *  · Debajo de 640 px no aparece ni un control de ventana y el header queda
 *    exactamente como estaba (el bottom-sheet del celular no se toca).
 *  · `fullscreen` y `side` nunca son ventanas.
 *  · Arrastrar del header mueve; arrastrar desde un BOTÓN del header, no.
 *  · Fijado apaga el clic de afuera, pero **Escape sigue cerrando**: fijar no
 *    puede dejar a nadie encerrado.
 *  · Un tamaño recordado más grande que la pantalla se descarta.
 *
 * jsdom no tiene layout: `getBoundingClientRect()` devuelve ceros, así que el
 * acomodo contra el borde de la pantalla se prueba mockeando el rectángulo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";

/** jsdom no implementa PointerEvent: sin esto, `button`/`clientX` llegan vacíos. */
class PointerEventFalso extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

function pantalla(ancho: number, alto = 800) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: ancho });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: alto });
}

const CLAVE = "buleje:ventana-modal:prueba";

function dialogo() {
  return screen.getByRole("dialog");
}
function asa() {
  return screen.getByLabelText(/Barra del modal/i);
}
function arrastrar(desde: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(desde, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
  fireEvent.pointerMove(desde, { pointerId: 1, clientX: 200 + dx, clientY: 200 + dy });
  fireEvent.pointerUp(desde, { pointerId: 1 });
}

beforeEach(() => {
  if (!("PointerEvent" in window)) {
    (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventFalso;
  }
  window.localStorage.clear();
  pantalla(1280);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("cuándo hay ventana y cuándo no", () => {
  it("en el celular (400 px) no hay ni un control de ventana y el header queda igual que siempre", () => {
    pantalla(400);
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    expect(screen.queryByLabelText(/Barra del modal/i)).toBeNull();
    expect(screen.queryByLabelText(/^Fija el modal/)).toBeNull();
    expect(screen.queryByLabelText(/^Agranda el modal/)).toBeNull();
    /* El header sigue siendo un div cualquiera: ni foco ni cursor de arrastre. */
    const header = dialogo().firstElementChild as HTMLElement;
    expect(header.getAttribute("tabindex")).toBeNull();
    expect(header.style.cursor).toBe("");
  });

  it("en escritorio el header es el asa y aparecen fijar y maximizar", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    expect(asa()).toHaveAttribute("tabindex", "0");
    expect(screen.getByLabelText(/^Fija el modal/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Agranda el modal/)).toBeInTheDocument();
    /* «Restaurar» sólo cuando hay algo que restaurar. */
    expect(screen.queryByLabelText(/^Devuelve el modal al centro/)).toBeNull();
  });

  it("al abrir, el foco arranca donde arrancaba antes (la X), no en el asa ni en los botones nuevos", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera">
        <input aria-label="Para quién" />
      </AdminModal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Cerrar"));
    /* Pero el asa sigue siendo alcanzable con el teclado. */
    expect(asa()).toHaveAttribute("tabindex", "0");
  });

  it("sin X, el foco arranca en el primer control del cuerpo (tampoco lo roban los botones de ventana)", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera" hideCloseButton>
        <input aria-label="Para quién" />
      </AdminModal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Para quién"));
  });

  it("un drawer `side` y un `fullscreen` NO son ventanas", () => {
    const { rerender } = render(
      <AdminModal open onClose={() => {}} title="Cajón" variant="side">
        <p>cuerpo</p>
      </AdminModal>,
    );
    expect(screen.queryByLabelText(/Barra del modal/i)).toBeNull();
    rerender(
      <AdminModal open onClose={() => {}} title="Pantalla completa" variant="fullscreen">
        <p>cuerpo</p>
      </AdminModal>,
    );
    expect(screen.queryByLabelText(/Barra del modal/i)).toBeNull();
  });

  it("se puede apagar a mano con `ventana={false}`", () => {
    render(
      <AdminModal open onClose={() => {}} title="Quieto" ventana={false}>
        <p>cuerpo</p>
      </AdminModal>,
    );
    expect(screen.queryByLabelText(/Barra del modal/i)).toBeNull();
  });
});

describe("mover la ventana", () => {
  it("arrastrar del header mueve el modal y lo deja recordado", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera" claveVentana="prueba">
        <p>cuerpo</p>
      </AdminModal>,
    );
    arrastrar(asa(), 120, -40);
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("120px");
    expect(dialogo().style.getPropertyValue("--ventana-y")).toBe("-40px");
    expect(JSON.parse(window.localStorage.getItem(CLAVE) ?? "{}")).toMatchObject({ x: 120, y: -40 });
  });

  it("arrastrar desde un BOTÓN del header no mueve nada (la X sigue siendo la X)", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera" claveVentana="prueba">
        <p>cuerpo</p>
      </AdminModal>,
    );
    const cerrar = screen.getByLabelText("Cerrar");
    fireEvent.pointerDown(cerrar, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(asa(), { pointerId: 1, clientX: 340, clientY: 260 });
    fireEvent.pointerUp(asa(), { pointerId: 1 });
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("0px");
  });

  it("con el botón secundario no arrastra", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    fireEvent.pointerDown(asa(), { pointerId: 1, button: 2, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(asa(), { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(asa(), { pointerId: 1 });
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("0px");
  });

  it("las flechas mueven de a 16 px y de a 1 px con Shift", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    fireEvent.keyDown(asa(), { key: "ArrowRight" });
    fireEvent.keyDown(asa(), { key: "ArrowDown" });
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("16px");
    expect(dialogo().style.getPropertyValue("--ventana-y")).toBe("16px");
    fireEvent.keyDown(asa(), { key: "ArrowLeft", shiftKey: true });
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("15px");
  });

  it("una flecha tecleada DENTRO de un control del header no mueve la ventana", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    /* El evento del botón burbujea hasta el asa: el guard es por `target`. */
    fireEvent.keyDown(screen.getByLabelText("Cerrar"), { key: "ArrowRight" });
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("0px");
  });

  it("Escape a mitad de un arrastre lo cancela y NO cierra el modal", () => {
    const onClose = vi.fn();
    render(
      <AdminModal open onClose={onClose} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    fireEvent.pointerDown(asa(), { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(asa(), { pointerId: 1, clientX: 380, clientY: 320 });
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("180px");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("0px");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("no se pierde fuera de la pantalla: vuelve dejando 48 px a la vista", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    /* jsdom no maqueta: se simula un modal de 500×400 cuyo borde izquierdo
       quedó justo sobre el borde derecho de la pantalla (1280 de 1280) — o sea
       totalmente afuera, sin nada de dónde agarrarlo. */
    vi.spyOn(dialogo(), "getBoundingClientRect").mockReturnValue({
      x: 1280, y: 100, width: 500, height: 400, top: 100, left: 1280, right: 1780, bottom: 500, toJSON: () => ({}),
    } as DOMRect);
    arrastrar(asa(), 600, 0);
    /* Se lo trae 48 px para adentro: 600 pedidos − 48 de corrección. */
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("552px");
  });
});

describe("fijar el modal", () => {
  it("fijado: el clic de afuera no cierra, pero Escape sí", () => {
    const onClose = vi.fn();
    render(
      <AdminModal open onClose={onClose} title="Apartar madera">
        <p>cuerpo</p>
      </AdminModal>,
    );
    fireEvent.click(screen.getByLabelText(/^Fija el modal/));
    const fijado = screen.getByLabelText(/^Suelta el modal/);
    expect(fijado).toHaveAttribute("aria-pressed", "true");
    /* El velo se corre del camino para poder trabajar en la pantalla de atrás. */
    expect(document.querySelector(".modal-backdrop")?.className).toContain("ventana-fijada");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el hook manda `preventDefault()` al clic de afuera SÓLO cuando está fijado", () => {
    const visto: boolean[] = [];
    function Arnes() {
      const v = useVentanaDeModal(true, { claveMemoria: "prueba" });
      const e = { preventDefault: () => visto.push(true) };
      return (
        <div>
          <button type="button" onClick={() => { const antes = visto.length; v.onInteractOutside(e); visto.push(visto.length > antes); }}>
            probar
          </button>
          <button type="button" onClick={v.alternarFijado}>
            fijar
          </button>
        </div>
      );
    }
    render(<Arnes />);
    fireEvent.click(screen.getByText("probar"));
    expect(visto).toEqual([false]); // sin fijar, nadie frena el cierre
    visto.length = 0;
    fireEvent.click(screen.getByText("fijar"));
    fireEvent.click(screen.getByText("probar"));
    expect(visto).toEqual([true, true]); // fijado: preventDefault
  });
});

describe("modales escritos a mano (la puerta para `useModalAccesible`)", () => {
  /** Un modal como los 99 del panel: div con role dialog, header propio, sin AdminModal. */
  function ModalAMano() {
    const caja = useRef<HTMLDivElement>(null);
    useVentanaDeModal(true, { ref: caja, asaAutomatica: true, aplicarTranslate: true, claveMemoria: "prueba" });
    return (
      <div ref={caja} role="dialog" aria-modal="true" aria-label="Hecho a mano" tabIndex={-1}>
        <header>
          <h3>Editar especie</h3>
          <button type="button">Cerrar</button>
        </header>
        <p>cuerpo</p>
      </div>
    );
  }

  it("con `ref` + `asaAutomatica` el header se vuelve asa solo, y el hook mueve la caja", () => {
    render(<ModalAMano />);
    const caja = screen.getByRole("dialog");
    const header = caja.querySelector("header") as HTMLElement;
    expect(header).toHaveAttribute("tabindex", "0");
    expect(header.getAttribute("aria-label")).toMatch(/Barra del modal/i);

    fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 175, clientY: 45 });
    fireEvent.pointerUp(header, { pointerId: 1 });

    expect(caja.style.getPropertyValue("--ventana-x")).toBe("75px");
    expect(caja.style.getPropertyValue("--ventana-y")).toBe("-55px");
    /* Estos modales se centran con flex, no con un `translate: -50%`: el hook
       les escribe la propiedad entera. */
    expect(caja.style.translate).toBe("var(--ventana-x, 0px) var(--ventana-y, 0px)");
  });

  it("si no hay asa razonable, el modal se queda quieto y no se rompe", () => {
    function SinAsa() {
      const caja = useRef<HTMLDivElement>(null);
      useVentanaDeModal(true, { ref: caja, asaAutomatica: true });
      return (
        <div ref={caja} role="dialog" aria-label="Sin título">
          <p>sólo cuerpo</p>
        </div>
      );
    }
    render(<SinAsa />);
    const caja = screen.getByRole("dialog");
    expect(caja.querySelector("[tabindex='0']")).toBeNull();
    expect(caja.style.getPropertyValue("--ventana-x")).toBe("0px");
  });
});

describe("tamaño y memoria", () => {
  it("«Restaurar» aparece al mover y devuelve el modal al centro", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera" claveVentana="prueba">
        <p>cuerpo</p>
      </AdminModal>,
    );
    arrastrar(asa(), 90, 60);
    fireEvent.click(screen.getByLabelText(/^Devuelve el modal al centro/));
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("0px");
    /* Sin nada que recordar, la entrada se borra en vez de quedar en 0. */
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
  });

  it("maximizar ocupa la pantalla y volver devuelve el tamaño anterior", () => {
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera" claveVentana="prueba">
        <p>cuerpo</p>
      </AdminModal>,
    );
    arrastrar(asa(), 70, 30);
    fireEvent.click(screen.getByLabelText(/^Agranda el modal/));
    expect(dialogo().style.width).toContain("100vw");
    expect(dialogo().style.maxWidth).toBe("none");
    fireEvent.click(screen.getByLabelText(/^Devuelve el modal al tamaño/));
    expect(dialogo().style.width).toBe("");
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("70px");
  });

  it("un tamaño recordado más grande que la pantalla se descarta", () => {
    window.localStorage.setItem(CLAVE, JSON.stringify({ x: 20, y: 10, ancho: 5000, alto: 4000, fijado: false }));
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera" claveVentana="prueba">
        <p>cuerpo</p>
      </AdminModal>,
    );
    expect(dialogo().style.width).toBe("");
    /* La posición sí se respeta: es lo que hace que la ventana «vuelva donde estaba». */
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("20px");
  });

  it("una memoria rota no rompe el modal", () => {
    window.localStorage.setItem(CLAVE, "{esto no es json");
    render(
      <AdminModal open onClose={() => {}} title="Apartar madera" claveVentana="prueba">
        <p>cuerpo</p>
      </AdminModal>,
    );
    expect(dialogo().style.getPropertyValue("--ventana-x")).toBe("0px");
  });
});
