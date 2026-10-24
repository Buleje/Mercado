/**
 * «Agregar cubicación» a un día declarado por tipo (ADR-445, 27-09).
 *
 * Se fija lo que decide si una cubicación se ata a las corridas:
 *  · el cuadre es por ESPECIE con la tolerancia de negocio (10 litros o 2 %);
 *    el tipo se muestra y avisa, no traba;
 *  · «Vincular» no se prende si no cuadra;
 *  · al vincular se manda la guardada ENTERA (dueño y observación de cada
 *    pieza, su fecha) y sus corridas se SUMAN a las que ya tenía.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { OrigenYSalidaDeCorrida } from "@/lib/forestal/origen-y-salida-del-dia";
import { cuadrarVinculo } from "@/components/admin/forestal/vincular-cubicacion-cuadre";

const DIA = "2026-09-21";

const pieza = (id: string, cantidad: number, especie: string, extra: Partial<PiezaCubicada> = {}): PiezaCubicada => {
  const medida = { cantidad, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id, ...medida, especie, ...cubicarPieza(medida), ...extra };
};

const porTipo: OrigenYSalidaDeCorrida = {
  origen: "por_tipo",
  m3Declarado: 0,
  m3Cubicado: 0,
  cubicaciones: [],
  salida: { estado: "sin_salida", m3Despachado: 0, m3Reprocesado: 0, m3SinGuia: 0, m3EnPatio: 0, apartados: 0, guias: [] },
};

const corrida = (id: string, lineNo: number, especie: string, m3: number, piezas: number): CorridaDelDia => ({
  id,
  lineNo,
  dia: DIA,
  fecha: `${DIA}T00:00:00.000Z`,
  especie,
  especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: "PIEZAS",
  unidad: "m3",
  cantidad: m3,
  m3,
  piezasAsiento: piezas,
  volumenConsumidoM3: null,
  observaciones: null,
  materiaPrimaRef: null,
  dueno: "Del centro",
  duenoMadera: "propia",
  titularNombre: null,
  duenoParteId: null,
  gtfOrigen: [],
  permisos: [],
  atadaPorque: null,
  paquetes: [],
  origenYSalida: { ...porTipo, m3Declarado: m3 },
});

/* 102 piezas de 2×8×10 = 3.2075 m³ contra 3.2 declarados: +7,5 litros, cuadra. */
const CUMALA = corrida("c1", 95105, "Cumala", 3.2, 102);
const TORNILLO = corrida("c2", 95106, "Tornillo", 1, 32);

const registro = (id: string, nombre: string, piezas: PiezaCubicada[], over: Partial<CubicacionRegistro> = {}): CubicacionRegistro => ({
  id,
  nombre,
  fecha: DIA,
  precioPt: 0,
  valor: 0,
  totales: {
    piezas: piezas.reduce((a, p) => a + p.cantidad, 0),
    pieTablar: piezas.reduce((a, p) => a + p.pieTablar, 0),
    m3: piezas.reduce((a, p) => a + p.m3, 0),
  } as CubicacionRegistro["totales"],
  piezas,
  createdAt: "2026-09-21T20:00:00.000Z",
  updatedAt: "2026-09-21T20:00:00.000Z",
  ...over,
});

const LUNES = registro("cub-lunes", "Lote lunes", [
  pieza("p1", 100, "Cumala", { dueno: "WASACO", observacion: "rajada" }),
  pieza("p2", 2, "Cumala"),
]);
const CORTA = registro("cub-corta", "Media pila", [pieza("q1", 50, "Cumala")], { fecha: "2026-09-10", ctpEntryIds: ["viejo-1"] });

describe("cuadrarVinculo (puro)", () => {
  it("cuadra por especie dentro de la tolerancia de negocio", () => {
    const c = cuadrarVinculo([CUMALA], LUNES.piezas);
    expect(c.cuadra).toBe(true);
    expect(c.motivo).toBeNull();
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0]).toMatchObject({ especie: "Cumala", tipo: "Comercial", tono: "ok", piezasDeclaradas: 102, piezasCubicadas: 102 });
  });

  it("no cuadra si una especie queda corta, y dice cuál y cuánto", () => {
    const c = cuadrarVinculo([CUMALA], CORTA.piezas);
    expect(c.cuadra).toBe(false);
    expect(c.motivo).toMatch(/^Cumala: la cubicación da 1\.572 m³ y se declaró 3\.200 m³/);
  });

  it("una especie declarada sin piezas en la cubicación traba", () => {
    const c = cuadrarVinculo([CUMALA, TORNILLO], LUNES.piezas);
    expect(c.cuadra).toBe(false);
    expect(c.motivo).toMatch(/^Tornillo: declarada 1\.000 m³ y la cubicación no trae ninguna pieza/);
  });

  it("el tipo distinto avisa en su fila pero no traba si la especie cuadra", () => {
    /* 1×4×4 es «Tabla»/otra clase por medida: mismo m³ total, otro tipo. */
    const otras = LUNES.piezas.map((p) => ({ ...p, tipo: "Tabla" as const }));
    const c = cuadrarVinculo([CUMALA], otras);
    expect(c.cuadra).toBe(true);
    expect(c.filas.map((f) => `${f.tipo}:${f.tono}`).sort()).toEqual(["Comercial:aviso", "Tabla:aviso"]);
  });
});

// ── El modal ───────────────────────────────────────────────────────────────

const ctpGet = vi.fn(async (url: string) => {
  /* «Media pila» dice estar atada a «viejo-1», una corrida que ya no existe:
     el modal la busca (revisión A) y una borrada no declara nada. */
  if (url.includes("entryId=")) throw new Error("El servidor respondió 404");
  return { dias: [DIA], corridas: 2, porEspecie: [], porDia: [], totales: {}, detalle: [CUMALA, TORNILLO] };
});
vi.mock("@/lib/forestal/ctp-fetch", () => ({
  ctpGet: (url: string) => ctpGet(url),
  invalidarCtp: () => {},
}));

import CtpVincularCubicacionModal from "@/components/admin/forestal/CtpVincularCubicacionModal";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ cubicacion: LUNES }), { status: 200 });
    if (String(url).startsWith("/api/admin/forestal/cubicaciones"))
      return new Response(JSON.stringify({ cubicaciones: [CORTA, LUNES] }), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function abrir() {
  const onVinculada = vi.fn();
  render(<CtpVincularCubicacionModal dia={DIA} onClose={() => {}} onVinculada={onVinculada} />);
  await screen.findByRole("checkbox", { name: /N\.º 95105/ });
  await waitFor(() => expect(screen.getByRole("combobox")).not.toBeDisabled());
  return { onVinculada };
}

describe("el modal «Agregar cubicación»", () => {
  it("sugiere la guardada suelta del mismo día, tilda sus especies y deja vincular si cuadra", async () => {
    const { onVinculada } = await abrir();
    expect(screen.getByRole("combobox")).toHaveValue("cub-lunes");
    expect(screen.getByRole("checkbox", { name: /N\.º 95105 · Cumala/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /N\.º 95106 · Tornillo/ })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(/Cuadra por especie/);

    const vincular = screen.getByRole("button", { name: "Vincular" });
    expect(vincular).toBeEnabled();
    fireEvent.click(vincular);
    await waitFor(() => expect(onVinculada).toHaveBeenCalledTimes(1));

    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST")!;
    const cuerpo = JSON.parse(String((post[1] as RequestInit).body));
    expect(cuerpo).toMatchObject({ id: "cub-lunes", nombre: "Lote lunes", fecha: DIA, ctpEntryIds: ["c1"] });
    /* Lo que la grilla no muestra viaja igual: si no, el servidor lo borra. */
    expect(cuerpo.piezas[0]).toMatchObject({ id: "p1", dueno: "WASACO", observacion: "rajada", especie: "Cumala" });
    expect(screen.getByRole("status")).toHaveTextContent(/«Lote lunes» quedó vinculada a la corrida N\.º 95105/);
  });

  it("con una que no cuadra, «Vincular» queda apagado y dice por qué", async () => {
    await abrir();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "cub-corta" } });
    expect(screen.getByRole("button", { name: "Vincular" })).toBeDisabled();
    /* Antes de juzgar, lee a qué corridas ya está atada (revisión A): mientras
       tanto lo dice, y después da el motivo real. */
    expect(screen.getByRole("status")).toHaveTextContent(/Leyendo las corridas a las que ya está atada/);
    await waitFor(() => expect(screen.getByRole("status")).not.toHaveTextContent(/Leyendo/));
    expect(screen.getByRole("button", { name: "Vincular" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/Cumala: la cubicación da 1\.572 m³ y se declaró 3\.200 m³/);
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("Cumala")).toBeInTheDocument();
  });

  it("tildar una especie que la cubicación no trae apaga «Vincular»", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("checkbox", { name: /N\.º 95106 · Tornillo/ }));
    expect(screen.getByRole("button", { name: "Vincular" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/Tornillo: declarada 1\.000 m³/);
  });

  it("sumar corridas no pisa las que la guardada ya tenía", async () => {
    const { cuerpoDelVinculo } = await import("@/components/admin/forestal/hooks/use-vincular-cubicacion");
    expect(cuerpoDelVinculo(CORTA, ["c1"]).ctpEntryIds).toEqual(["viejo-1", "c1"]);
    expect(cuerpoDelVinculo(CORTA, ["c1"]).fecha).toBe("2026-09-10");
  });
});

describe("un asiento que no nombra tipo", () => {
  it("recibe lo medido de cualquier tipo en UNA fila, sin ámbar", () => {
    const generica = { ...CUMALA, producto: "MADERA ASERRADA" };
    const c = cuadrarVinculo([generica], LUNES.piezas);
    expect(c.cuadra).toBe(true);
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0]).toMatchObject({ tipo: "MADERA ASERRADA", tono: "ok", tiposMedidos: ["Comercial"] });
  });
});

describe("concurrencia: otra persona cambió la cubicación", () => {
  it("un 409 dice qué pasó, relee la lista y no reenvía lo viejo; el segundo intento va con la versión nueva", async () => {
    const NUEVA = { ...LUNES, updatedAt: "2026-09-27T23:30:00.000Z" };
    let lecturas = 0;
    let posts = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1;
        return posts === 1
          ? new Response(JSON.stringify({ error: "cubicacion_desactualizada", updatedAt: NUEVA.updatedAt }), { status: 409 })
          : new Response(JSON.stringify({ cubicacion: NUEVA }), { status: 200 });
      }
      if (String(url).startsWith("/api/admin/forestal/cubicaciones")) {
        lecturas += 1;
        return new Response(JSON.stringify({ cubicaciones: [CORTA, lecturas === 1 ? LUNES : NUEVA] }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    const { onVinculada } = await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(await screen.findByText("Otra persona cambió esta cubicación: vuelve a abrirla.")).toBeInTheDocument();
    const primero = fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((primero[0]![1] as RequestInit).body)).updatedAt).toBe(LUNES.updatedAt);
    await waitFor(() => expect(lecturas).toBe(2));
    expect(posts).toBe(1);
    expect(onVinculada).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole("button", { name: "Vincular" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    await waitFor(() => expect(onVinculada).toHaveBeenCalledTimes(1));
    const segundo = fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "POST")[1]!;
    expect(JSON.parse(String((segundo[1] as RequestInit).body)).updatedAt).toBe(NUEVA.updatedAt);
  });
});
