/**
 * __tests__/cubicador-entrada-voz-disposicion.test.tsx
 *
 * La disposición de «Cargar piezas» (Brandon, 2026-09-14): la caja «Toca el
 * micrófono y dicta» va PRIMERO y adentro lleva las funciones de entrada
 * —Importar Excel y la voz: repite, probar, ajustes—. En la barra del título
 * quedan sólo Especies, Presentar y Ocultar.
 *
 * El panel es el mismo en el Cubicador principal y en «Producir sin lote»: el
 * campo «Código» sólo aparece cuando quien lo monta lo pide.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PanelEntradaVoz from "@/components/admin/forestal/cubicador-entrada-voz";
import { CONFIG_DEFAULT } from "@/lib/forestal/cubicador-config";

type Props = Parameters<typeof PanelEntradaVoz>[0];

const props = (extra: Partial<Props> = {}): Props => ({
  grillaId: "cub-carga",
  onPlegar: vi.fn(),
  onImportar: vi.fn(),
  showAjustes: false,
  onToggleAjustes: vi.fn(),
  config: CONFIG_DEFAULT,
  onUpdateConfig: vi.fn(),
  voices: [],
  onProbarVoz: vi.fn(),
  supported: true,
  listening: false,
  onToggleListen: vi.fn(),
  paused: false,
  fijas: {},
  onAplicarFijas: vi.fn(),
  especie: "",
  onEspecieChange: vi.fn(),
  especies: ["Tornillo", "Cumala"],
  onAbrirEspecies: vi.fn(),
  dueno: "",
  onDuenoChange: vi.fn(),
  duenosConocidos: [],
  onAbrirDuenos: vi.fn(),
  liveGroups: null,
  errMsg: null,
  lastAdded: null,
  addedFlash: 0,
  onDeshacer: vi.fn(),
  fmtPt: (v) => String(v),
  manual: { cantidad: "1", espesor: "", ancho: "", largo: "" },
  onManualChange: vi.fn(),
  onConfirmarCarga: vi.fn(),
  ...extra,
});

const caja = () => screen.getByRole("region", { name: "Dictar o importar piezas" });
const barraDelTitulo = () => {
  const barra = screen.getByRole("heading", { name: /Cargar piezas/ }).parentElement;
  if (!barra) throw new Error("sin barra del título");
  return barra;
};
const antes = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("PanelEntradaVoz — disposición de «Cargar piezas»", () => {
  it("Importar Excel y la voz viven DENTRO de la caja de dictado, agrupados", () => {
    render(<PanelEntradaVoz {...props()} />);
    const entrada = within(caja()).getByRole("group", { name: "Entrada" });
    const voz = within(caja()).getByRole("group", { name: "Voz" });
    expect(within(entrada).getByRole("button", { name: /Importar Excel/ })).toBeInTheDocument();
    expect(within(voz).getByRole("button", { name: "Repite: sí" })).toHaveAttribute("aria-pressed", "true");
    expect(within(voz).getByRole("button", { name: /Probar voz/ })).toBeInTheDocument();
    expect(within(voz).getByRole("button", { name: /Ajustes/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(caja()).getByRole("button", { name: /Cómo se dicta/ })).toBeInTheDocument();
    /* Importar Excel está una sola vez. */
    expect(screen.getAllByRole("button", { name: /Importar Excel/ })).toHaveLength(1);
  });

  it("la barra del título queda con Especies y Ocultar, sin Importar ni Ajustes", () => {
    render(<PanelEntradaVoz {...props()} />);
    const barra = barraDelTitulo();
    expect(within(barra).getByRole("button", { name: /Especies/ })).toBeInTheDocument();
    expect(within(barra).getByRole("button", { name: "Ocultar el panel de carga" })).toBeInTheDocument();
    expect(within(barra).queryByRole("button", { name: /Importar Excel/ })).toBeNull();
    expect(within(barra).queryByRole("button", { name: /Ajustes/ })).toBeNull();
  });

  it("la caja de dictado va antes que «Lo que se le pega a cada pieza»", () => {
    render(<PanelEntradaVoz {...props()} />);
    expect(antes(caja(), screen.getByText("Lo que se le pega a cada pieza"))).toBe(true);
  });

  it("sin dictado en el navegador, Importar Excel y Ajustes siguen a la vista", () => {
    render(<PanelEntradaVoz {...props({ supported: false })} />);
    expect(screen.queryByRole("button", { name: "Empezar a dictar" })).toBeNull();
    expect(within(caja()).getByText(/no soporta dictado por voz \(usa Chrome\)/)).toBeInTheDocument();
    expect(within(caja()).getByRole("button", { name: /Importar Excel/ })).toBeInTheDocument();
    expect(within(caja()).getByRole("button", { name: /Ajustes/ })).toBeInTheDocument();
  });

  it("los Ajustes se abren adentro de la caja", () => {
    render(<PanelEntradaVoz {...props({ showAjustes: true })} />);
    expect(within(caja()).getByText("Comandos de voz (separados por coma)")).toBeInTheDocument();
  });

  it("el toggle de voz de la fila manual sigue estando", () => {
    render(<PanelEntradaVoz {...props()} />);
    expect(screen.getByRole("button", { name: "Voz: sí" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sin `codigoTroza` no hay campo Código (el Cubicador principal)", () => {
    render(<PanelEntradaVoz {...props()} />);
    expect(screen.queryByRole("combobox", { name: "Código" })).toBeNull();
  });

  it("con `codigoTroza` el campo Código va antes que la especie", () => {
    render(
      <PanelEntradaVoz
        {...props({
          codigoTroza: { valor: "", onValor: vi.fn(), onElegir: vi.fn(), trozas: [], cargando: false, error: null },
        })}
      />,
    );
    const codigo = screen.getByRole("combobox", { name: "Código" });
    expect(antes(codigo, screen.getByText("Especie"))).toBe(true);
  });

  it("si la lectura del patio falla, el campo sigue y lo dice en una línea", () => {
    render(
      <PanelEntradaVoz
        {...props({
          codigoTroza: { valor: "", onValor: vi.fn(), onElegir: vi.fn(), trozas: [], cargando: false, error: "No se pudieron leer las trozas del patio." },
        })}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Código" })).toBeInTheDocument();
    expect(screen.getByText("No se pudieron leer las trozas del patio.")).toBeInTheDocument();
  });

  it("una especie que no está en el catálogo se ve en el selector", () => {
    render(<PanelEntradaVoz {...props({ especie: "Moena" })} />);
    const select = screen.getByDisplayValue("Moena");
    expect(select.tagName).toBe("SELECT");
  });
});
