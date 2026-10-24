/**
 * Libro TH (Brandon 07-10): «en Secciones, en Trozado, quiero en los
 * encabezados poner los filtros estilo Excel, y en general ponerlo en todas
 * las tablas del Libro… y quitar los filtros que están sueltos».
 *
 *   · Trozado: el filtro de la cabecera filtra la sección ENTERA (no la
 *     página), el pie suma lo filtrado, y la barra ya no trae buscador ni
 *     desplegables sueltos.
 *   · Control del permiso (Tablero): Especie y Estado se filtran desde su
 *     cabecera; el desplegable suelto «Todas las especies» ya no existe; las
 *     cifras de estado y la cabecera comparten UN estado.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { construirTablero } from "@/lib/forestal/loth-tablero-trozas";
import { ordenarTablero } from "@/lib/forestal/loth-tablero-columnas";
import LothSeccionTabla, { type ColDef } from "@/components/admin/forestal/LothSeccionTabla";
import LothSeccionBarra from "@/components/admin/forestal/LothSeccionBarra";
import { BarraFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { LINEAS_POR_PAGINA, useLothSeccionTabla } from "@/components/admin/forestal/hooks/use-loth-seccion-tabla";
import { estadosDeLinea } from "@/components/admin/forestal/loth-seccion-filtros";
import LothTableroTabla from "@/components/admin/forestal/LothTableroTabla";
import { useLothTableroTabla } from "@/components/admin/forestal/hooks/use-loth-tablero-tabla";
import { useTableroColumnas } from "@/components/admin/forestal/hooks/use-tablero-columnas";
import LothTraceView from "@/components/admin/forestal/LothTraceView";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function linea(p: Partial<Omit<LothEntryDTO, "volumeM3">> & { section: string; volumeM3?: number | null }): LothEntryDTO {
  const { volumeM3, ...resto } = p;
  return {
    ...resto,
    id: p.id ?? Math.random().toString(36).slice(2),
    lineNo: p.lineNo ?? 1,
    section: p.section,
    entryDate: p.entryDate ?? "2026-09-01T00:00:00.000Z",
    createdAt: p.createdAt ?? p.entryDate ?? "2026-09-01T00:00:00.000Z",
    treeCode: p.treeCode ?? null,
    trozaCode: p.trozaCode ?? null,
    speciesCommon: p.speciesCommon ?? null,
    speciesScientific: p.speciesScientific ?? null,
    diamMayorM: p.diamMayorM ?? null,
    diamMenorM: p.diamMenorM ?? null,
    lengthM: p.lengthM ?? null,
    gtfNumber: p.gtfNumber ?? null,
    status: p.status ?? "registrado",
    discarded: p.discarded ?? false,
    consumoInterno: p.consumoInterno ?? false,
    cites: p.cites ?? false,
    isRama: false,
    planId: p.planId ?? null,
    volumeM3: volumeM3 == null ? null : String(volumeM3),
  } as unknown as LothEntryDTO;
}

// ── Secciones · Trozado ──────────────────────────────────────────────────────

const COLS_TROZADO: ColDef[] = [
  { key: "troza", label: "Cód. troza", orden: "codigo", render: (e) => e.trozaCode },
  { key: "esp", label: "Especie", orden: "especie", render: (e) => e.speciesCommon },
  { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => e.volumeM3 },
];

/* 60 trozas: 55 de Tornillo (árbol 113) y 5 de Cumala (árbol 200), la de Cumala
   al FINAL — en la página 2 de la API. Filtrar la página sola no las vería. */
const TROZADO: LothEntryDTO[] = Array.from({ length: 60 }, (_, i) => {
  const cumala = i >= 55;
  return linea({
    id: `t${i}`,
    section: "trozado",
    lineNo: i + 1,
    treeCode: cumala ? "200" : "113",
    trozaCode: cumala ? `200-${String.fromCharCode(65 + i - 55)}` : `113-${i + 1}`,
    speciesCommon: cumala ? "Cumala" : "Tornillo",
    volumeM3: 1,
  });
});

function Trozado({ lineas }: { lineas: LothEntryDTO[] }) {
  const tabla = useLothSeccionTabla({
    section: "trozado",
    cols: COLS_TROZADO,
    lineas,
    corregidaPor: new Map(),
    orden: "lineNo",
    dir: "asc",
  });
  const nada = () => undefined;
  return (
    <div>
      <LothSeccionBarra opciones={[]} onNuevaLinea={nada} />
      <BarraFiltrosTabla f={tabla.f} sinConteo />
      <p data-testid="pagina">
        {tabla.pagina + 1}/{tabla.paginas}
      </p>
      <LothSeccionTabla
        section="trozado"
        entries={tabla.enPagina}
        filasTotal={tabla.ordenadas}
        filtros={tabla.f}
        cols={COLS_TROZADO}
        loading={false}
        orden="lineNo"
        dir="asc"
        onOrdenar={nada}
        seleccion={new Set()}
        onSeleccionar={nada}
        onSeleccionarTodo={nada}
        corregidaPor={new Map()}
        onDetalle={nada}
        onCadena={nada}
        onDuplicar={nada}
        onCorregir={nada}
        onAnular={nada}
      />
    </div>
  );
}

/* En jsdom el plegable «Filtros por columna» (mobile) también está en el DOM: todo se busca en la cabecera. */
const cab = () => within(document.querySelector("thead")!);
const filasCuerpo = () => within(document.querySelector("tbody")!).getAllByRole("row");

describe("Secciones · Trozado — el autofiltro en la cabecera", () => {
  it("cada columna lleva su filtro en el <th> y la barra ya no trae filtros sueltos", () => {
    render(<Trozado lineas={TROZADO} />);
    const cabecera = document.querySelector("thead")!;
    for (const nombre of ["Filtrar N° por rango", "Filtrar Fecha por rango", "Buscar en Cód. troza", "Filtrar por Especie", "Filtrar Vol. m³ por rango", "Filtrar por Estado"]) {
      expect(within(cabecera).getByRole("button", { name: nombre })).toBeInTheDocument();
    }
    // Los sueltos de antes: buscador «Código, especie o GTF» y Período / Estado / Especie.
    expect(screen.queryByPlaceholderText("Código, especie o GTF")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    // Lo que sí queda en la barra: la acción del día.
    expect(screen.getByRole("button", { name: /Nueva línea/ })).toBeInTheDocument();
  });

  it("la especie de la cabecera filtra la sección entera, no la página (las de Cumala estaban en la página 2)", () => {
    render(<Trozado lineas={TROZADO} />);
    expect(filasCuerpo()).toHaveLength(LINEAS_POR_PAGINA);
    expect(screen.getByTestId("pagina").textContent).toBe("1/2");

    fireEvent.click(cab().getByRole("button", { name: "Filtrar por Especie" }));
    fireEvent.click(cab().getByRole("checkbox", { name: "Especie: Cumala" }));

    const filas = filasCuerpo();
    expect(filas).toHaveLength(5);
    expect(filas.map((r) => within(r).getAllByRole("cell")[3].textContent)).toEqual(["200-A", "200-B", "200-C", "200-D", "200-E"]);
    expect(screen.getByTestId("pagina").textContent).toBe("1/1");
    // El pie suma lo filtrado: 5 líneas, no las 50 de la página ni las 60 de la sección.
    expect(document.querySelector("tfoot")!.textContent).toContain("Total · 5 líneas");
    // El chip con cruz devuelve todo.
    fireEvent.click(screen.getByRole("button", { name: /Quitar.*Especie/i }));
    expect(filasCuerpo()).toHaveLength(LINEAS_POR_PAGINA);
  });

  it("buscar el árbol en «Cód. troza» trae sus trozas (reemplaza al buscador suelto)", async () => {
    render(<Trozado lineas={TROZADO} />);
    const caja = cab().getAllByLabelText("Buscar en Cód. troza").find((el) => el.tagName === "INPUT")!;
    fireEvent.change(caja, { target: { value: "200" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(filasCuerpo()).toHaveLength(5);
  });
});

describe("Secciones — Observaciones como filtro de estado (lo que era el desplegable «Estado»)", () => {
  it("una línea dice si está anulada, fuera de plazo, corregida o corrige a otra", () => {
    const tarde = linea({ section: "tala", lineNo: 3, entryDate: "2026-08-01T00:00:00.000Z", createdAt: "2026-09-20T00:00:00.000Z" });
    expect(estadosDeLinea(tarde, new Map([[3, 7]]))).toEqual(["Registrada", "Fuera de plazo", "Corregida"]);
    const anulada = linea({ section: "tala", status: "anulado", correctsLineNo: 2 });
    expect(estadosDeLinea(anulada, new Map())).toEqual(["Anulada", "Corrige a otra"]);
  });
});

// ── Tablero · Control del permiso ────────────────────────────────────────────

const HOY = new Date("2026-10-02T15:00:00.000Z");
const LIBRO = [
  linea({ id: "a", section: "trozado", trozaCode: "85-TOR-A", treeCode: "85", speciesCommon: "Tornillo", volumeM3: 1.2 }),
  linea({ id: "b", section: "trozado", trozaCode: "85-TOR-B", treeCode: "85", speciesCommon: "Tornillo", volumeM3: 1.1 }),
  linea({ id: "c", section: "trozado", trozaCode: "90-CUM-A", treeCode: "90", speciesCommon: "Cumala", volumeM3: 0.9 }),
  linea({ section: "despacho_troza", trozaCode: "85-TOR-B", gtfNumber: "001-0000120", entryDate: "2026-09-10T00:00:00.000Z" }),
];

function Tablero() {
  const filas = construirTablero(LIBRO, HOY);
  const columnas = useTableroColumnas();
  const t = useLothTableroTabla(filas, false, columnas.visibles);
  return (
    <div>
      <p data-testid="estados">{t.estados.join(",")}</p>
      <button type="button" onClick={() => t.alternarEstado("disponible")}>
        cifra Disponible
      </button>
      <LothTableroTabla t={t} filas={ordenarTablero(t.visibles, columnas.orden)} total={filas.length} columnas={columnas} />
    </div>
  );
}

const codigos = () =>
  Array.from(document.querySelectorAll<HTMLElement>("tbody tr[data-troza]")).map((r) => r.dataset.troza);

describe("Tablero · Trozas — autofiltro en la cabecera", () => {
  it("Especie se filtra desde su cabecera y el desplegable suelto ya no está", () => {
    render(<Tablero />);
    expect(screen.queryByRole("combobox", { name: "Filtrar por especie" })).toBeNull();
    expect(codigos()).toHaveLength(3);

    fireEvent.click(cab().getByRole("button", { name: "Filtrar por Especie" }));
    fireEvent.click(cab().getByRole("checkbox", { name: "Especie: Cumala" }));
    expect(codigos()).toEqual(["90-CUM-A"]);
    // El buscador con pistola se queda: no es una columna, es el lector de etiquetas.
    expect(screen.getByRole("searchbox", { name: "Buscar trozas" })).toBeInTheDocument();
  });

  it("la cifra de estado y la cabecera Estado son el MISMO filtro", () => {
    render(<Tablero />);
    fireEvent.click(screen.getByRole("button", { name: "cifra Disponible" }));
    expect(codigos().sort()).toEqual(["85-TOR-A", "90-CUM-A"]);
    // La cabecera lo muestra elegido…
    fireEvent.click(cab().getByRole("button", { name: /Filtrar por Estado/ }));
    const disponible = cab().getByRole("checkbox", { name: "Estado: Disponible" }) as HTMLInputElement;
    expect(disponible.checked).toBe(true);
    // …y destildarlo ahí apaga la cifra.
    fireEvent.click(disponible);
    expect(screen.getByTestId("estados").textContent).toBe("");
    expect(codigos()).toHaveLength(3);
  });

  it("leer con la pistola una troza que un filtro de columna esconde la muestra igual", () => {
    render(<Tablero />);
    fireEvent.click(cab().getByRole("button", { name: "Filtrar por Especie" }));
    fireEvent.click(cab().getByRole("checkbox", { name: "Especie: Cumala" }));
    const lector = screen.getByRole("searchbox", { name: "Buscar trozas" });
    fireEvent.change(lector, { target: { value: "85-TOR-A" } });
    fireEvent.keyDown(lector, { key: "Enter" });
    expect(codigos()).toContain("85-TOR-A");
  });
});

// ── Trazabilidad · Por árbol ─────────────────────────────────────────────────

describe("Trazabilidad · Por árbol — los filtros sueltos pasaron a la cabecera", () => {
  const ENTRADAS = [
    linea({ id: "x1", section: "tala", lineNo: 1, treeCode: "85", speciesCommon: "Tornillo", volumeM3: 3 }),
    linea({ id: "x2", section: "trozado", lineNo: 2, treeCode: "85", trozaCode: "85-A", speciesCommon: "Tornillo", volumeM3: 2.5 }),
    linea({ id: "x3", section: "tala", lineNo: 3, treeCode: "90", speciesCommon: "Cumala", volumeM3: 2 }),
  ];

  it("en tabla: sin buscador ni desplegables sueltos, y la Especie de la cabecera filtra la lista", () => {
    localStorage.setItem("loth:arbol:modo", JSON.stringify("tabla"));
    render(<LothTraceView entries={ENTRADAS} />);
    expect(screen.queryByPlaceholderText("Árbol, especie, troza o N° de GTF")).toBeNull();
    expect(screen.queryByLabelText("Desde")).toBeNull();
    const arboles = () => Array.from(document.querySelectorAll("tbody tr")).map((r) => r.querySelector("td:nth-child(2)")?.textContent ?? "");
    expect(arboles().join(" ")).toMatch(/85/);
    expect(arboles().join(" ")).toMatch(/90/);

    const primera = within(document.querySelector("thead")!);
    fireEvent.click(primera.getByRole("button", { name: "Filtrar por Especie" }));
    fireEvent.click(primera.getByRole("checkbox", { name: "Especie: Cumala" }));
    const quedan = arboles().join(" ");
    expect(quedan).toMatch(/90/);
    expect(quedan).not.toMatch(/85/);
  });

  it("en tarjetas, los mismos filtros viven en «Filtros por columna» (sin cabecera no se pierden)", () => {
    render(<LothTraceView entries={ENTRADAS} />);
    const plegable = screen.getByText(/Filtros por columna/).closest("details")!;
    expect(plegable.className).not.toMatch(/sm:hidden/);
    expect(within(plegable).getByRole("button", { name: "Filtrar por Especie" })).toBeInTheDocument();
  });
});
