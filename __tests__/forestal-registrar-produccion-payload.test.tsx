/**
 * Lo que «Registrar producción» le manda al servidor, congelado (28-10).
 *
 * La ventana pasó de una sola pantalla de 28 campos a tres pasos. Es un cambio
 * de PANTALLA, no de lógica: para los mismos datos, el cuerpo del PATCH tiene
 * que salir idéntico byte a byte — es stock y Libro (`forestal-serfor.md`).
 * Estos snapshots se escribieron con la ventana VIEJA y la nueva los cumple.
 *
 * Los campos se buscan por su rótulo y los botones con `hidden: true`: así el
 * mismo recorrido maneja la ventana de un paso y la de tres (los pasos ocultos
 * siguen montados). Los paneles hijos se simulan y exponen sus callbacks.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Modal, { type ProduccionRegistrada } from "@/components/admin/forestal/CtpRegistrarProduccionModal";
import { guardarProduccionDeCorrida } from "@/components/admin/forestal/hooks/guardar-produccion-corrida";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { CobroAserrioValor } from "@/lib/forestal/tarifa-aserrio";
import type { PaqueteBorrador } from "@/lib/forestal/produccion-paquetes";
import type { DetalleProduccionSniffs } from "@/lib/forestal/sniffs-produccion-parse";

type Tocado = { dueno?: boolean; precio?: boolean };
const H = vi.hoisted(() => ({
  tira: null as null | { onElegir: (iso: string) => void },
  cobro: null as null | {
    onChange: (v: CobroAserrioValor, t: Tocado) => void;
    onValidez?: (ok: boolean) => void;
  },
  sniffs: null as null | {
    onAgregar: (p: PaqueteBorrador[], d: DetalleProduccionSniffs) => void;
    siguienteCodigo: (o: readonly string[]) => string;
  },
}));
vi.mock("@/components/admin/forestal/CtpSemanaDeProduccion", () => ({
  default: (p: { onElegir: (iso: string) => void }) => {
    H.tira = p;
    return <div data-testid="tira" />;
  },
}));
vi.mock("@/components/admin/forestal/CtpCobroAserrio", () => ({
  default: (p: NonNullable<typeof H.cobro>) => {
    H.cobro = p;
    return null;
  },
}));
vi.mock("@/components/admin/forestal/CtpPegarSniffs", () => ({
  default: (p: NonNullable<typeof H.sniffs>) => {
    H.sniffs = p;
    return null;
  },
}));
vi.mock("@/components/admin/forestal/CtpMaterialPanel", () => ({ default: () => null }));

const CODIGOS_PLANTA = ["PQ-2610-004", "PQ-2610-005"];
let cuerpos: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00Z"));
  localStorage.clear();
  cuerpos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        cuerpos.push(String(init.body));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ jornadas: [], codigos: CODIGOS_PLANTA, medidas: [] }), {
        status: 200,
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Los bloques plegados de la ventana vieja no montan sus campos: se abren. */
function abrirPlegados() {
  for (const b of screen.queryAllByRole("button", { expanded: false, hidden: true })) {
    if (/^(Material|La corrida)/.test(b.textContent ?? "")) fireEvent.click(b);
  }
}
const campo = (rotulo: string | RegExp) => {
  abrirPlegados();
  return screen.getByLabelText(rotulo) as HTMLInputElement | HTMLSelectElement;
};
const escribir = (rotulo: string | RegExp, valor: string) =>
  fireEvent.change(campo(rotulo), { target: { value: valor } });
const boton = (nombre: string | RegExp) => {
  const [b] = screen.getAllByRole("button", { name: nombre, hidden: true });
  fireEvent.click(b);
};
/** Que llegue la serie de la planta (y se proponga el código libre). */
const esperarSerie = () => screen.findByDisplayValue("PQ-2610-006");

async function guardarYCapturar(onConfirmar: ReturnType<typeof vi.fn>, modo: "declarar" | "ampliar") {
  boton(/^(Guardar producción|Agregar a la corrida)$/);
  expect(onConfirmar).toHaveBeenCalledTimes(1);
  const datos = onConfirmar.mock.calls[0][0] as ProduccionRegistrada;
  await guardarProduccionDeCorrida("corrida-1", modo, datos);
  return { datos: JSON.stringify(datos), cuerpo: cuerpos[0] };
}

const LOTE = {
  id: "lote-qa-1",
  code: "QA-SEM-L3",
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  status: "abierto",
  notes: null,
  fechaApertura: "2026-10-03",
  fechaConsumo: null,
  produccionEntryId: null,
  piezas: 12,
  volumenM3: 10,
  trozas: [],
} as unknown as LoteAserrio;

it("lote nuevo: dimensionado ×3, línea LRE, fecha y cobro tocado", async () => {
  const onConfirmar = vi.fn();
  render(
    <Modal
      lote={LOTE}
      material={{ especie: "Tornillo", piezas: 12, volumenM3: 10, permisos: ["CON-25-001"] }}
      fecha="2026-10-28"
      guardando={false}
      error={null}
      onConfirmar={onConfirmar}
      onClose={() => {}}
    />,
  );
  await esperarSerie();
  escribir("Línea de producción", "LRE");
  escribir("Fecha de producción", "2026-10-27");
  escribir("Observación de la corrida", "Turno mañana");
  fireEvent.click(campo(/^Dimensionar/));
  escribir("Producto", "MADERA ASERRADA (CUARTON)");
  escribir("Cantidad (piezas)", "20");
  escribir("Espesor (cm)", "2.54");
  escribir("Ancho (cm)", "17.78");
  escribir("Largo (m)", "1.52");
  escribir("Cuántos paquetes iguales crear", "3");
  boton("Añadir 3");
  /* El cobro vive en el paso «Revisar» y se monta al mirarlo por primera vez
     (como antes al abrir «La corrida»). */
  boton(/Revisar/);
  act(() => H.cobro?.onChange({ duenoParteId: "parte-9", precioManualPt: 1.2 }, { dueno: true, precio: true }));
  const r = await guardarYCapturar(onConfirmar, "declarar");
  expect(r.datos).toMatchSnapshot("datos");
  expect(r.cuerpo).toMatchSnapshot("cuerpo");
});

it("ampliar: volumen por pie tablar, código a mano, observación y corrección", async () => {
  const onConfirmar = vi.fn();
  render(
    <Modal
      material={{ especie: "Cumala", piezas: 0, volumenM3: 4, permisos: [] }}
      fecha="2026-10-20"
      titulo="Terminar de declarar la corrida N° 19"
      yaDeclaradoM3={0.5}
      paquetesPrevios={[{ codigo: "PQ-2610-001", productType: "MADERA ASERRADA", volumenM3: 0.5, cantidad: 30 }]}
      ctaLabel="Agregar a la corrida"
      guardando={false}
      error={null}
      onConfirmar={onConfirmar}
      onClose={() => {}}
    />,
  );
  await esperarSerie();
  escribir(/^Código de paquete/, "SL-7");
  escribir("Cantidad (piezas)", "15");
  escribir("Pie tablar (equivale)", "120");
  escribir("Observación del paquete", "atado chico");
  boton(/^Añadir$/);
  escribir("Cantidad (piezas)", "10");
  escribir(/^Volumen \(m³\)/, "0.2");
  boton(/^Añadir$/);
  boton("Editar el paquete SL-7");
  escribir("Cantidad (piezas)", "16");
  boton("Guardar cambios");
  escribir("Observación de la corrida", "Reemplaza");
  const r = await guardarYCapturar(onConfirmar, "ampliar");
  expect(r.datos).toMatchSnapshot("datos");
  expect(r.cuerpo).toMatchSnapshot("cuerpo");
});

it("sin lote: del SNIFFS, día de la tira, duplicar y quitar", async () => {
  const onConfirmar = vi.fn();
  const onSniffsLeido = vi.fn();
  render(
    <Modal
      material={{ especie: "Capirona", piezas: 5, volumenM3: 6, permisos: ["CON-25-002"] }}
      fecha="2026-10-28"
      guardando={false}
      error={null}
      onSniffsLeido={onSniffsLeido}
      onConfirmar={onConfirmar}
      onClose={() => {}}
    />,
  );
  await esperarSerie();
  act(() => H.tira?.onElegir("2026-10-25"));
  const c1 = H.sniffs?.siguienteCodigo([]) ?? "";
  const c2 = H.sniffs?.siguienteCodigo([c1]) ?? "";
  const del = (id: string, codigo: string, volumenM3: number): PaqueteBorrador => ({
    id,
    codigo,
    productType: "MADERA ASERRADA",
    presentacion: "PIEZAS",
    cantidad: 40,
    volumenM3,
    espesorCm: 5,
    anchoCm: 20,
    largoM: 3,
    observations: "",
  });
  act(() =>
    H.sniffs?.onAgregar([del("s1", c1, 0.6), del("s2", c2, 0.45)], { lote: "L-7" } as unknown as DetalleProduccionSniffs),
  );
  expect(onSniffsLeido).toHaveBeenCalledTimes(1);
  boton(`Duplicar el paquete ${c1}`);
  boton(/^Añadir$/);
  boton(`Quitar el paquete ${c2}`);
  const r = await guardarYCapturar(onConfirmar, "declarar");
  expect(r.datos).toMatchSnapshot("datos");
  expect(r.cuerpo).toMatchSnapshot("cuerpo");
  /* El recorrido llegó a donde tenía que llegar: tres paquetes ≠ cero. */
  expect(within(document.body).queryByText(/Todavía no agregaste/)).toBeNull();
});
