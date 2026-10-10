/**
 * Trazabilidad «Por árbol» y Censo al nivel de las Secciones del Libro TH
 * (08-10, «mismo patrón pendiente en Trazabilidad y Censo»):
 *
 *   · Censo: las tarjetas filtran la tabla al tocarlas («Árboles» → en pie,
 *     «No en el plan» → las especies sin autorizar) y dicen lo mismo que el pie;
 *     las columnas se ocultan, se arrastran y se recuerdan.
 *   · Por árbol (tabla): UNA tabla con los dos tramos como filas de grupo, con
 *     su pie; el total talado del pie es el de «Avance del permiso» (la misma
 *     `resumirFilas`); las columnas se recuerdan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import LothPlanCenso from "@/components/admin/forestal/LothPlanCenso";
import LothTraceView from "@/components/admin/forestal/LothTraceView";
import type { Tree } from "@/components/admin/forestal/loth-plan-shared";
import { repartoDelPie } from "@/components/admin/forestal/loth-seccion-celdas";
import { claveEspecie, type LothEntryDTO } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

const titulos = () => [...document.querySelectorAll("thead th[data-col]")].map((th) => th.getAttribute("data-col"));
const pie = () => document.querySelector("tfoot")?.textContent ?? "";
const filasCuerpo = () => document.querySelectorAll("tbody tr").length;
/** La tarjeta entera (rótulo + cifra) del `StatCard`. */
const tarjeta = (rotulo: RegExp) => screen.getByText(rotulo).closest("button, div.flex.h-full, [class*='rounded']") as HTMLElement;

// ── Censo ────────────────────────────────────────────────────────────────────

const arbol = (id: string, treeCode: string, speciesCommon: string, vol: string, estado = "en_pie"): Tree => ({
  id, treeCode, speciesCommon, speciesScientific: null, cites: false, dapM: "0.6", alturaComercialM: "12",
  factorForma: "0.65", volumenEstimadoM3: vol, utmZona: null, utmX: null, utmY: null, parcelaCorta: null, estado,
});
const TREES = [
  arbol("a", "1", "Tornillo", "2.2"),
  arbol("b", "2", "Cedro", "1.15"),
  arbol("c", "3", "TORNILLO", "3.333", "talado"),
  arbol("d", "4", "Mashonaste", "0.5"),
];
const AUTORIZADAS = new Set([claveEspecie("Tornillo"), claveEspecie("Cedro")]);

function Censo() {
  return (
    <ConfirmDialogProvider>
      <LothPlanCenso planId="P1" trees={TREES} total={TREES.length} truncado={false} authorizedSpecies={AUTORIZADAS} categorias={new Map()} dmcOverrides={{}} onChange={vi.fn()} />
    </ConfirmDialogProvider>
  );
}

describe("Censo · las tarjetas filtran y dicen lo mismo que el pie", () => {
  it("«No en el plan» deja sólo la especie sin autorizar; el volumen de la tarjeta es el del pie; otro toque deshace", () => {
    render(<Censo />);
    expect(pie()).toContain("Total · 4 árboles");
    expect(pie()).toContain(fmtM3(2.2 + 1.15 + 3.333 + 0.5));
    fireEvent.click(screen.getByRole("button", { name: /Indicadores/ }));

    fireEvent.click(screen.getByRole("button", { name: /^No en el plan/ }));
    expect(filasCuerpo()).toBe(1);
    expect(screen.getByLabelText("Seleccionar el árbol 4")).toBeTruthy();
    expect(pie()).toContain("Total · 1 árbol");
    expect(pie()).toContain(fmtM3(0.5));
    expect(tarjeta(/Volumen estimado/).textContent).toContain(`${fmtM3(0.5)} m³`);
    expect(screen.getByText("Filtrando: sólo esas especies")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^No en el plan/ }));
    expect(filasCuerpo()).toBe(4);
  });

  it("«Árboles» deja sólo los en pie (las dos grafías de Tornillo cuentan como una especie)", () => {
    render(<Censo />);
    fireEvent.click(screen.getByRole("button", { name: /Indicadores/ }));
    expect(tarjeta(/Volumen estimado/).textContent).toContain("3 especies");
    fireEvent.click(screen.getByRole("button", { name: /^Árboles/ }));
    expect(filasCuerpo()).toBe(3);
    const enPie = fmtM3(2.2 + 1.15 + 0.5);
    expect(pie()).toContain(enPie);
    expect(tarjeta(/Volumen estimado/).textContent).toContain(`${enPie} m³`);
  });

  it("el orden y las columnas ocultas se recuerdan; el total cae bajo «Vol.» aunque se mueva", () => {
    localStorage.setItem("orden-columnas:loth-censo", JSON.stringify(["vol", "codigo", "especie", "dap", "hc", "utm", "condicion", "categoria", "estado"]));
    localStorage.setItem("columnas-visibles:loth-censo", JSON.stringify({ dap: false }));
    render(<Censo />);
    expect(titulos()).toEqual(["vol", "codigo", "especie", "hc", "utm", "condicion", "categoria", "estado"]);
    const celdasPie = [...document.querySelectorAll("tfoot td")];
    expect(celdasPie[1].textContent).toBe(fmtM3(7.183));
    expect(celdasPie.at(-1)!.textContent).toContain("Total · 4 árboles");

    fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Vol. m³" }));
    expect(titulos()).not.toContain("vol");
    // Ocultar no es borrar: el total se dice en el rótulo.
    expect(pie()).toContain(`${fmtM3(7.183)} m³`);
    expect(JSON.parse(localStorage.getItem("columnas-visibles:loth-censo")!)).toMatchObject({ dap: false, vol: false });
  });
});

// ── Trazabilidad · Por árbol ─────────────────────────────────────────────────

function linea(p: Partial<Omit<LothEntryDTO, "volumeM3">> & { section: string; volumeM3?: number | null }): LothEntryDTO {
  const { volumeM3, ...resto } = p;
  return {
    entryDate: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    treeCode: null,
    trozaCode: null,
    speciesCommon: null,
    speciesScientific: null,
    gtfNumber: null,
    status: "registrado",
    discarded: false,
    consumoInterno: false,
    cites: false,
    isRama: false,
    planId: null,
    lineNo: 1,
    ...resto,
    id: p.id ?? Math.random().toString(36).slice(2),
    volumeM3: volumeM3 == null ? null : String(volumeM3),
  } as unknown as LothEntryDTO;
}

const ENTRADAS = [
  linea({ id: "x1", section: "tala", lineNo: 1, treeCode: "85", speciesCommon: "Tornillo", volumeM3: 3 }),
  linea({ id: "x2", section: "trozado", lineNo: 2, treeCode: "85", trozaCode: "85-A", speciesCommon: "Tornillo", volumeM3: 2.5 }),
  linea({ id: "x3", section: "despacho_troza", lineNo: 3, treeCode: "85", trozaCode: "85-A", speciesCommon: "Tornillo", volumeM3: 2.5, gtfNumber: "001-0001" }),
  linea({ id: "x4", section: "tala", lineNo: 4, treeCode: "90", speciesCommon: "Cumala", volumeM3: 2 }),
];

describe("Por árbol · una tabla, su pie y sus columnas", () => {
  it("en tabla: los dos tramos son filas de grupo de UNA tabla y el pie suma lo mismo que «Talados»", () => {
    localStorage.setItem("loth:arbol:modo", JSON.stringify("tabla"));
    render(<LothTraceView entries={ENTRADAS} />);
    expect(document.querySelectorAll("[data-tabla-arbol]")).toHaveLength(1);
    expect([...document.querySelectorAll("tbody[data-grupo]")].map((t) => t.getAttribute("data-grupo"))).toEqual(["movimiento", "terminado"]);
    expect(pie()).toContain("Total · 2 árboles");
    const talados = document.querySelector('[data-paso="talados"] [data-m3]')!.textContent ?? "";
    expect(talados).toContain(fmtM3(5));
    expect(pie()).toContain(fmtM3(5));
    expect(screen.getByRole("button", { name: /Columnas/ })).toBeInTheDocument();
  });

  it("el orden guardado manda en cabecera, filas y pie; ocultar «Talado» lo dice en el rótulo", () => {
    localStorage.setItem("loth:arbol:modo", JSON.stringify("tabla"));
    localStorage.setItem("orden-columnas:loth-arbol", JSON.stringify(["talado", "tree", "especie", "censo", "precision", "trozado", "rend", "merma", "movilizado", "etapas", "ultima", "obs"]));
    render(<LothTraceView entries={ENTRADAS} />);
    expect(titulos().slice(0, 2)).toEqual(["talado", "tree"]);
    const fila = document.querySelector('tbody[data-grupo="movimiento"] tr:nth-child(2)')!;
    expect(within(fila as HTMLElement).getAllByRole("cell")[1].textContent).toBe(fmtM3(2));
    fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Talado m³" }));
    expect(titulos()).not.toContain("talado");
    expect(pie()).toContain(`${fmtM3(5)} m³ talados`);
  });

  it("en tarjetas no hay botón de columnas (no hay tabla que elegir)", () => {
    render(<LothTraceView entries={ENTRADAS} />);
    expect(screen.queryByRole("button", { name: /Columnas/ })).toBeNull();
  });

  it("reparto del pie sin columnas fijas al final", () => {
    expect(repartoDelPie(["talado", "tree", "obs"], new Set(["talado"]), 0)).toEqual({ rotuloAntes: 0, rotuloDespues: 2, conCeldas: ["talado"] });
    expect(repartoDelPie(["tree", "talado"], new Set(["talado"]), 0)).toEqual({ rotuloAntes: 2, rotuloDespues: 0, conCeldas: ["talado"] });
    expect(repartoDelPie(["tree"], new Set(), 0)).toEqual({ rotuloAntes: 2, rotuloDespues: 0, conCeldas: [] });
  });
});
