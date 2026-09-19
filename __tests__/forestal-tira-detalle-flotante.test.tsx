/**
 * El detalle flotante de un día en la tira de días del registro.
 *
 * Pedido de Brandon (2026-09-14): *«al pasar el mouse o tener un ícono de cada
 * día se pueda ver un menú del detalle, así flotante, de dueño, especies,
 * clasificación y demás detalles»*.
 *
 * Lo que se fija acá es lo que se rompe sin que ningún tipo lo note:
 *  · sin `detalle` (consumo, despacho, respuesta vieja del caché) la tira es
 *    la de siempre — ni ícono ni panel;
 *  · el panel va en un PORTAL dentro del diálogo más cercano (en «Declarar
 *    producción» la tira vive dentro de un cuerpo con overflow que lo recortaba);
 *  · por eso mismo, ir del casillero al panel con el mouse NO lo cierra, un
 *    clic adentro tampoco, y Tab entra y sale del panel;
 *  · Escape cierra el panel y NADA más: el modal también escucha Escape.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";

vi.mock("@/components/admin/forestal/CtpResumenDeJornadasModal", () => ({
  default: ({ dias }: { dias: string[] }) => <div data-testid="resumen">{dias.join(",")}</div>,
}));

import CtpSemanaDeRegistro from "@/components/admin/forestal/CtpSemanaDeRegistro";
import type { JornadaDeProduccion } from "@/components/admin/forestal/hooks/use-jornadas-produccion";
import { RETARDO_ABRIR_MS, RETARDO_CERRAR_MS } from "@/components/admin/forestal/hooks/use-detalle-flotante";
import type { DetalleDeJornada } from "@/lib/forestal/detalle-de-jornada";

const DETALLE: DetalleDeJornada = {
  especies: [{ especie: "Tornillo", corridas: 2, m3: 5.6, pt: 2374 }],
  clasificaciones: [{ producto: "MADERA ASERRADA (PAQUETERIA LARGA)", piezas: 40, m3: 5.6 }],
  duenos: [
    { etiqueta: "De tercero · CC.NN. San Luis", corridas: 1 },
    { etiqueta: "Sin declarar", corridas: 1 },
  ],
  permisos: ["19-SEC/REG-PLT-2026-032"],
  lineas: ["LP"],
  sinMateriaPrima: 1,
  paquetes: 2,
  corridas: [
    { lineNo: 27, especie: "Tornillo", m3: 2.8, materiaPrimaRef: "17-2026" },
    { lineNo: 28, especie: null, m3: 2.8, materiaPrimaRef: null },
  ],
};

const JUEVES: JornadaDeProduccion = { dia: "2026-09-17", corridas: 2, m3: 5.6, pt: 2374, piezas: 40, detalle: DETALLE };

const jornadas = (...filas: JornadaDeProduccion[]) => new Map(filas.map((j) => [j.dia, j]));

const PROPS = {
  valor: "2026-09-16",
  onSemana: () => {},
  semana: "2026-09-16",
  porDia: jornadas(JUEVES),
};

function tira(props: Partial<React.ComponentProps<typeof CtpSemanaDeRegistro>> = {}, onKeyDownPadre?: () => void) {
  const onElegir = vi.fn();
  render(
    /* El padre hace de modal: si Escape le llega, el modal se cerraría. */
    <div onKeyDown={onKeyDownPadre}>
      <CtpSemanaDeRegistro {...PROPS} onElegir={onElegir} {...props} />
    </div>,
  );
  return { onElegir };
}

const icono = () => screen.getByRole("button", { name: /Ver el detalle del jueves 17\/09/ });
const panel = () => screen.getByRole("dialog", { name: "Detalle del jueves 17/09" });
const casillero = () => screen.getByText("17/09").closest("[data-casillero]")!;

/**
 * Un evento de puntero con su `pointerType`, sin depender de que jsdom tenga
 * `PointerEvent`: React arma `onPointerEnter/Leave` desde `pointerover/out`.
 */
function puntero(
  el: Element,
  tipo: "pointerover" | "pointerout",
  pointerType: "mouse" | "touch",
  relatedTarget: Element | null = null,
) {
  const ev = new MouseEvent(tipo, { bubbles: true, cancelable: true, relatedTarget });
  Object.defineProperty(ev, "pointerType", { value: pointerType });
  fireEvent(el, ev);
}

const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("sin detalle, la tira de siempre", () => {
  it("una respuesta sin `detalle` no dibuja ícono ni panel", () => {
    tira({ porDia: jornadas({ ...JUEVES, detalle: undefined }) });
    expect(screen.queryByRole("button", { name: /Ver el detalle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("en consumo tampoco, aunque el detalle viniera", () => {
    tira({ seccion: "consumo" });
    expect(screen.queryByRole("button", { name: /Ver el detalle/ })).not.toBeInTheDocument();
  });
});

describe("el ícono del día", () => {
  it("abre el panel con especie, clasificación corta, dueño y lo que falta", () => {
    tira();
    fireEvent.click(icono());
    const p = panel();
    expect(icono()).toHaveAttribute("aria-expanded", "true");

    /* «Tornillo» sale dos veces (especie y corrida N.º 27): se busca en su bloque. */
    const especies = within(p).getByRole("heading", { name: "Especies" }).closest("section") as HTMLElement;
    expect(within(especies).getByText("Tornillo")).toBeInTheDocument();
    expect(within(especies).getByText("2,374 PT · 5.600 m³")).toBeInTheDocument();
    /* Corto para leer, completo en el globo. */
    const clasif = within(p).getByText("PAQUETERIA LARGA");
    expect(clasif.closest("li")).toHaveAttribute("title", "MADERA ASERRADA (PAQUETERIA LARGA)");
    expect(within(p).getByText("De tercero · CC.NN. San Luis")).toBeInTheDocument();
    expect(within(p).getByText("19-SEC/REG-PLT-2026-032")).toBeInTheDocument();
    expect(within(p).getByText(/sin trozas vinculadas/).textContent).toContain("1 de 2 corridas");
    expect(within(p).getByText("N.º 28")).toBeInTheDocument();
  });

  it("tocarlo otra vez lo cierra, y un clic afuera también", () => {
    tira();
    fireEvent.click(icono());
    fireEvent.click(icono());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(icono());
    expect(panel()).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("un clic DENTRO del panel no lo cierra, aunque viva fuera del casillero", () => {
    tira();
    fireEvent.click(icono());
    fireEvent.pointerDown(within(panel()).getByText("PAQUETERIA LARGA"));
    expect(panel()).toBeInTheDocument();
  });

  it("«Ver qué salió ese día» cierra el panel y abre el resumen de ESE día", () => {
    tira();
    fireEvent.click(icono());
    fireEvent.click(within(panel()).getByRole("button", { name: /Ver qué salió ese día/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("resumen")).toHaveTextContent("2026-09-17");
  });
});

describe("en un portal, dentro del diálogo", () => {
  it("se dibuja en el diálogo más cercano y no dentro del cuerpo que scrollea", () => {
    render(
      <div role="dialog" aria-label="Declarar producción">
        <div data-testid="cuerpo" className="overflow-y-auto">
          <CtpSemanaDeRegistro {...PROPS} onElegir={() => {}} />
        </div>
      </div>,
    );
    fireEvent.click(icono());
    expect(panel().parentElement).toBe(screen.getByRole("dialog", { name: "Declarar producción" }));
    expect(screen.getByTestId("cuerpo").contains(panel())).toBe(false);
  });

  it("Tab desde el ícono entra al panel; Shift+Tab vuelve al ícono sin cerrarlo", () => {
    tira();
    fireEvent.click(icono());
    fireEvent.keyDown(icono(), { key: "Tab" });
    const cerrar = within(panel()).getByRole("button", { name: "Cerrar el detalle" });
    expect(document.activeElement).toBe(cerrar);

    fireEvent.keyDown(cerrar, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(icono());
    expect(panel()).toBeInTheDocument();
  });

  it("Tab en el último control cierra y deja el foco en el ícono", () => {
    tira();
    fireEvent.click(icono());
    const ultimo = within(panel()).getByRole("button", { name: /Ver qué salió ese día/ });
    ultimo.focus();
    fireEvent.keyDown(ultimo, { key: "Tab" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(icono());
  });
});

describe("Escape", () => {
  it("cierra el panel sin llegar al modal, y el foco vuelve al ícono", () => {
    const padre = vi.fn();
    const enDocumento = vi.fn();
    document.addEventListener("keydown", enDocumento, true);
    try {
      tira({}, padre);
      fireEvent.click(icono());
      const cerrar = within(panel()).getByRole("button", { name: "Cerrar el detalle" });
      cerrar.focus();

      fireEvent.keyDown(cerrar, { key: "Escape" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      /* Ni el `onKeyDown` del modal ni un oyente en `document` (así escuchan
         `useModalAccesible` y Radix) se enteran. */
      expect(padre).not.toHaveBeenCalled();
      expect(enDocumento).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(icono());
    } finally {
      document.removeEventListener("keydown", enDocumento, true);
    }
  });

  it("con el panel cerrado, Escape sigue siendo del modal", () => {
    const padre = vi.fn();
    tira({}, padre);
    fireEvent.keyDown(icono(), { key: "Escape" });
    expect(padre).toHaveBeenCalled();
  });

  it("si se cambia de semana con el panel abierto, Escape vuelve a ser del modal", () => {
    const padre = vi.fn();
    const { rerender } = render(
      <div onKeyDown={padre}>
        <CtpSemanaDeRegistro {...PROPS} onElegir={() => {}} />
      </div>,
    );
    fireEvent.click(icono());
    expect(panel()).toBeInTheDocument();

    /* La flecha al borde de la tira salta de semana: el jueves ya no está. */
    rerender(
      <div onKeyDown={padre}>
        <CtpSemanaDeRegistro {...PROPS} semana="2026-09-23" onElegir={() => {}} />
      </div>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Semana anterior"), { key: "Escape" });
    expect(padre).toHaveBeenCalled();
  });

  it("las flechas dentro del panel no cambian el día elegido", () => {
    const { onElegir } = tira();
    fireEvent.click(icono());
    const cerrar = within(panel()).getByRole("button", { name: "Cerrar el detalle" });
    fireEvent.keyDown(cerrar, { key: "ArrowRight" });
    expect(onElegir).not.toHaveBeenCalled();
  });
});

describe("pasar el mouse", () => {
  it("abre con retardo y no parpadea al salir y volver enseguida", () => {
    vi.useFakeTimers();
    tira();

    puntero(casillero(), "pointerover", "mouse");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    esperar(RETARDO_ABRIR_MS);
    expect(panel()).toBeInTheDocument();

    puntero(casillero(), "pointerout", "mouse");
    esperar(RETARDO_CERRAR_MS - 60);
    puntero(casillero(), "pointerover", "mouse");
    esperar(1000);
    expect(panel()).toBeInTheDocument();

    puntero(casillero(), "pointerout", "mouse");
    esperar(RETARDO_CERRAR_MS);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ir del casillero al panel NO lo cierra; salir del panel sí", () => {
    vi.useFakeTimers();
    tira();
    puntero(casillero(), "pointerover", "mouse");
    esperar(RETARDO_ABRIR_MS);
    const p = panel();
    expect(casillero().contains(p)).toBe(false);

    puntero(casillero(), "pointerout", "mouse", p);
    puntero(p, "pointerover", "mouse", casillero());
    esperar(RETARDO_CERRAR_MS * 5);
    expect(panel()).toBeInTheDocument();

    puntero(p, "pointerout", "mouse");
    esperar(RETARDO_CERRAR_MS);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("en táctil no hay «pasar»: sólo el ícono lo abre", () => {
    vi.useFakeTimers();
    tira();
    puntero(casillero(), "pointerover", "touch");
    esperar(RETARDO_ABRIR_MS * 3);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
