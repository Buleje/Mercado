/**
 * Revisión ADR-445 (27-09): tres defectos que el reviewer reprodujo y que
 * quedan fijados acá con el comportamiento CORRECTO.
 *
 *  A · Una cubicación ya atada al lunes no se ata además al martes si no
 *      alcanza para los dos: el cuadre es contra TODO lo que ampararía.
 *  B · Reusar una guardada desde el cubicador conserva cada campo de la
 *      guardada (cliente, precio por PT, GTF, notas, fecha, dueño y
 *      observación de cada pieza) y SUMA las corridas.
 *  E · Abierto desde «Agregar cubicación», el cubicador no ofrece «Guardar
 *      igual»: si lo medido no cuadra, no se ata.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import { construirRegistro, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { cuadrarVinculo } from "@/components/admin/forestal/vincular-cubicacion-cuadre";

const LUNES = "2026-09-20";
const MARTES = "2026-09-21";
const pieza = (id: string, cantidad: number, especie: string, extra: Partial<PiezaCubicada> = {}): PiezaCubicada => {
  const medida = { cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id, ...medida, especie, ...cubicarPieza(medida), ...extra };
};
const corrida = (id: string, lineNo: number, dia: string, especie: string, m3: number, piezas: number): CorridaDelDia => ({
  id, lineNo, dia, fecha: `${dia}T00:00:00.000Z`, especie, especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)", presentacion: "PIEZAS", unidad: "m3", cantidad: m3, m3,
  piezasAsiento: piezas, volumenConsumidoM3: null, observaciones: null, materiaPrimaRef: null,
  dueno: "Del centro", duenoMadera: "propia", titularNombre: null, duenoParteId: null, gtfOrigen: [], permisos: [],
  atadaPorque: null, paquetes: [],
  origenYSalida: { origen: "por_tipo", m3Declarado: m3, m3Cubicado: 0, cubicaciones: [],
    salida: { estado: "sin_salida", m3Despachado: 0, m3Reprocesado: 0, m3SinGuia: 0, m3EnPatio: m3, apartados: 0, guias: [] } },
});
const CUMALA_LUNES = corrida("c-lunes", 95104, LUNES, "Cumala", 3.2, 102);
const CUMALA_MARTES = corrida("c-martes", 95105, MARTES, "Cumala", 3.2, 102);
/* 102 piezas de 2×8×10 = 3.2075 m³: alcanza para UNA corrida de 3.2, no para dos. */
const piezas = [pieza("p1", 100, "Cumala", { dueno: "WASACO", observacion: "rajada" }), pieza("p2", 2, "Cumala")];
const reg = (over: Partial<CubicacionRegistro>): CubicacionRegistro => ({
  id: "cub-lunes", nombre: "Lote lunes", fecha: LUNES, precioPt: 3.5, valor: 0, cliente: "Mario tornillo",
  gtfNumber: "19-00000-000001", notas: "Pagado a Mario el 20/09", especie: "Cumala",
  totales: { piezas: 102, pieTablar: piezas.reduce((a, p) => a + p.pieTablar, 0), m3: piezas.reduce((a, p) => a + p.m3, 0) },
  piezas, createdAt: "2026-09-20T20:00:00.000Z", updatedAt: "2026-09-20T20:00:00.000Z", ...over,
});
/* Ya atada a la corrida del LUNES. */
const LUNES_ATADA = reg({ ctpEntryId: "c-lunes", ctpEntryIds: ["c-lunes"] });
/* El doble de piezas: alcanza para las dos corridas. */
const DOBLE = reg({
  id: "cub-doble", nombre: "Lote doble", ctpEntryId: "c-lunes", ctpEntryIds: ["c-lunes"],
  piezas: [pieza("d1", 204, "Cumala")],
  totales: { piezas: 204, pieTablar: pieza("d1", 204, "Cumala").pieTablar, m3: pieza("d1", 204, "Cumala").m3 },
});

const ctpGet = vi.fn(async (url: string): Promise<unknown> => {
  if (url.includes("entryId=c-lunes")) return { entry: { id: "c-lunes", entryDate: `${LUNES}T00:00:00.000Z` } };
  if (url.includes(`dias=${LUNES}`)) return { dias: [LUNES], corridas: 1, porEspecie: [], porDia: [], totales: {}, detalle: [CUMALA_LUNES] };
  return { dias: [MARTES], corridas: 1, porEspecie: [], porDia: [], totales: {}, detalle: [CUMALA_MARTES] };
});
vi.mock("@/lib/forestal/ctp-fetch", () => ({
  ctpGet: (url: string) => ctpGet(url),
  invalidarCtp: () => {},
}));
import CtpVincularCubicacionModal from "@/components/admin/forestal/CtpVincularCubicacionModal";
import CtpCubicarProductoModal from "@/components/admin/forestal/CtpCubicarProductoModal";

const fetchMock = vi.fn();
let guardadas: CubicacionRegistro[] = [LUNES_ATADA];
beforeEach(() => {
  guardadas = [LUNES_ATADA];
  ctpGet.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ cubicacion: LUNES_ATADA }), { status: 200 });
    if (String(url).startsWith("/api/admin/forestal/cubicaciones"))
      return new Response(JSON.stringify({ cubicaciones: guardadas }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const huboPost = () => fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "POST");
const cuerpoDelPost = () => {
  const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST")!;
  return JSON.parse(String((post[1] as RequestInit).body));
};

async function abrirVincular() {
  render(<CtpVincularCubicacionModal dia={MARTES} onClose={() => {}} />);
  await screen.findByRole("checkbox", { name: /N\.º 95105/ });
  await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
}

describe("A · el cuadre es contra todo lo que la cubicación ampararía", () => {
  it("ya atada al lunes: atarla al martes pide 6.4 m³ con 3.2 de piezas → «Vincular» apagado y lo dice", async () => {
    await abrirVincular();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cub-lunes" } });
    /* Muestra a qué ya está atada, con su día. */
    const atada = await screen.findByText(/Ya atada a 1 corrida/);
    const bloque = atada.closest("[data-ya-atada]") as HTMLElement;
    expect(within(bloque).getByText(/95104/)).toBeInTheDocument();
    expect(bloque.textContent).toMatch(/domingo 20\/09/);
    /* El cuadre suma las dos corridas. */
    expect(screen.getByRole("status")).toHaveTextContent(
      /Cumala: la cubicación da 3\.208 m³ y se declaró 6\.400 m³/,
    );
    expect(screen.getByRole("button", { name: "Vincular" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(huboPost()).toBe(false);
  });

  it("si la medición alcanza para las dos, sí se ata, y suma las corridas", async () => {
    guardadas = [DOBLE];
    await abrirVincular();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cub-doble" } });
    await screen.findByText(/Ya atada a 1 corrida/);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Cuadra por especie/));
    const b = screen.getByRole("button", { name: "Vincular" });
    expect(b).toBeEnabled();
    fireEvent.click(b);
    await waitFor(() => expect(huboPost()).toBe(true));
    expect(cuerpoDelPost().ctpEntryIds).toEqual(["c-lunes", "c-martes"]);
  });
});

describe("B · reusar una guardada conserva cada campo", () => {
  it("cliente, precio, GTF, notas, fecha, especie, dueño/observación de la pieza, y suma corridas", async () => {
    render(
      <CtpCubicarProductoModal
        filas={[{ id: "c-martes", etiqueta: "N.º 95105", especie: "Cumala", producto: "MADERA ASERRADA (COMERCIAL)", piezas: 102, volumenM3: 3.2 }]}
        ctpEntryIds={["c-martes"]}
        titulo="martes"
        onClose={() => {}}
        onGuardada={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getAllByRole("combobox").some((s) => s.querySelector('option[value="cub-lunes"]'))).toBe(true),
    );
    const sel = screen.getAllByRole("combobox").find((s) => s.querySelector('option[value="cub-lunes"]'))!;
    fireEvent.change(sel, { target: { value: "cub-lunes" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    if (!huboPost()) fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await waitFor(() => expect(huboPost()).toBe(true));
    const body = cuerpoDelPost();
    /* Lo que el servidor guarda (route → ForestCubicacionesDB.save → construirRegistro). */
    const guardado = construirRegistro({
      ...body,
      cliente: body.cliente ?? undefined,
      especie: body.especie ?? undefined,
      notas: body.notas ?? undefined,
      gtfNumber: body.gtfNumber ?? undefined,
      createdAt: LUNES_ATADA.createdAt,
    });
    expect(body.id).toBe("cub-lunes");
    expect(guardado.fecha).toBe(LUNES);
    expect(guardado.ctpEntryIds).toEqual(["c-lunes", "c-martes"]);
    expect(guardado.cliente).toBe("Mario tornillo");
    expect(guardado.precioPt).toBe(3.5);
    expect(guardado.valor).toBeGreaterThan(0);
    expect(guardado.gtfNumber).toBe("19-00000-000001");
    expect(guardado.notas).toBe("Pagado a Mario el 20/09");
    expect(guardado.especie).toBe("Cumala");
    expect(guardado.nombre).toBe("Lote lunes");
    expect(guardado.piezas.find((p) => p.id === "p1")).toMatchObject({ dueno: "WASACO", observacion: "rajada" });
  });
});

describe("E · abierto para atar, el cubicador no ofrece «Guardar igual»", () => {
  const medir = (cantidad: string) => {
    fireEvent.change(screen.getByLabelText("Cantidad fila 1"), { target: { value: cantidad } });
    fireEvent.change(screen.getByLabelText("espesor fila 1"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("ancho fila 1"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("largo fila 1"), { target: { value: "10" } });
  };
  const abrir = () =>
    render(
      <CtpCubicarProductoModal
        filas={[{ id: "c-martes", etiqueta: "N.º 95105", especie: "Cumala", producto: "MADERA ASERRADA (COMERCIAL)", piezas: 102, volumenM3: 3.2 }]}
        ctpEntryIds={["c-martes"]}
        titulo="martes"
        onClose={() => {}}
        onGuardada={() => {}}
        validarAtadura={(p) => cuadrarVinculo([CUMALA_MARTES], p).motivo}
      />,
    );

  it("lo que no cuadra no se guarda (ni «Guardar igual»), y no se ofrece reusar una guardada", async () => {
    abrir();
    medir("50");
    const guardar = screen.getByRole("button", { name: /Guardar cubicación/ });
    expect(guardar).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Para atarla tiene que cuadrar: Cumala/);
    fireEvent.click(guardar);
    expect(screen.queryByRole("button", { name: /Guardar igual/ })).toBeNull();
    expect(huboPost()).toBe(false);
    expect(screen.queryByText(/Usar una cubicación ya guardada/i)).toBeNull();
  });

  it("lo que cuadra se guarda atado", async () => {
    abrir();
    medir("102");
    const guardar = screen.getByRole("button", { name: /Guardar cubicación/ });
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(huboPost()).toBe(true));
    expect(cuerpoDelPost().ctpEntryIds).toEqual(["c-martes"]);
  });
});

describe("concurrencia al reusar una guardada desde el cubicador", () => {
  it("manda la versión leída; con 409 lo dice, relee y no deja guardar las piezas viejas", async () => {
    let lecturas = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Response(JSON.stringify({ error: "cubicacion_desactualizada" }), { status: 409 });
      if (String(url).startsWith("/api/admin/forestal/cubicaciones")) {
        lecturas += 1;
        return new Response(JSON.stringify({ cubicaciones: [LUNES_ATADA] }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    render(
      <CtpCubicarProductoModal
        filas={[{ id: "c-martes", etiqueta: "N.º 95105", especie: "Cumala", producto: "MADERA ASERRADA (COMERCIAL)", piezas: 102, volumenM3: 3.2 }]}
        ctpEntryIds={["c-martes"]}
        titulo="martes"
        onClose={() => {}}
        onGuardada={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getAllByRole("combobox").some((s) => s.querySelector('option[value="cub-lunes"]'))).toBe(true),
    );
    const sel = screen.getAllByRole("combobox").find((s) => s.querySelector('option[value="cub-lunes"]'))!;
    fireEvent.change(sel, { target: { value: "cub-lunes" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await waitFor(() => expect(huboPost()).toBe(true));
    expect(cuerpoDelPost().updatedAt).toBe(LUNES_ATADA.updatedAt);
    expect(await screen.findByText("Otra persona cambió esta cubicación: vuelve a abrirla.")).toBeInTheDocument();
    await waitFor(() => expect(lecturas).toBe(2));
    expect(screen.getByRole("button", { name: /Guardar/ })).toBeDisabled();
  });
});
