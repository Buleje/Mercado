/**
 * Secciones del Libro TH al nivel del Libro CTP (backlog L11, 08-10):
 *
 *   · las tarjetas FILTRAN la tabla al tocarlas y, con un filtro puesto, dicen
 *     lo mismo que el pie de la tabla (la misma cuenta sobre las mismas líneas);
 *   · las columnas se eligen y se arrastran, recordadas POR SECCIÓN (al pasar
 *     de Tala a Trozado se lee la clave de Trozado, no se hereda la de Tala);
 *   · el pie reparte su rótulo y su total en el orden elegido.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LothEntryDTO, LothSection } from "@/lib/forestal/loth-constants";
import LothSeccionTabla, { type ColDef } from "@/components/admin/forestal/LothSeccionTabla";
import LothSeccionKpis from "@/components/admin/forestal/LothSeccionKpis";
import LothSeccionBarra from "@/components/admin/forestal/LothSeccionBarra";
import { useLothSeccionTabla } from "@/components/admin/forestal/hooks/use-loth-seccion-tabla";
import { LothSeccionColumnas, columnasElegibles, ordenDeFabrica } from "@/components/admin/forestal/loth-seccion-columnas";
import { repartoDelPie } from "@/components/admin/forestal/loth-seccion-celdas";
import { alternarSolo, cifrasDeLineas, textoTotal } from "@/components/admin/forestal/loth-seccion-cifras";
import { totalesDe } from "@/lib/forestal/loth-seccion";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function linea(i: number, p: Partial<LothEntryDTO> & { vol: number }): LothEntryDTO {
  const { vol, ...resto } = p;
  return {
    id: `L${i}`,
    lineNo: i,
    section: "tala",
    entryDate: "2026-09-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    treeCode: `A${i}`,
    trozaCode: `A${i}-1`,
    speciesCommon: "Tornillo",
    status: "registrado",
    discarded: false,
    consumoInterno: false,
    cites: false,
    isRama: false,
    planId: null,
    ...resto,
    volumeM3: String(vol),
  } as unknown as LothEntryDTO;
}

/* 70 líneas (más de una página de 50): Cumala cada 7.ª, una anulada cada 10.ª,
   y 4 asentadas un mes después de la tala (fuera de plazo). Volúmenes con
   decimales que no cierran redondos, para que un redondeo distinto se note. */
const LINEAS: LothEntryDTO[] = Array.from({ length: 70 }, (_, k) => {
  const i = k + 1;
  return linea(i, {
    vol: 1 + (i % 9) * 0.137,
    speciesCommon: i % 7 === 0 ? "Cumala" : i % 11 === 0 ? "TORNILLO" : "Tornillo",
    status: i % 10 === 0 ? "anulado" : "registrado",
    createdAt: i % 17 === 0 ? "2026-10-05T00:00:00.000Z" : "2026-09-01T00:00:00.000Z",
  });
});

const COLS: ColDef[] = [
  { key: "tree", label: "Cód. árbol", orden: "codigo", render: (e) => e.treeCode },
  { key: "esp", label: "Especie", orden: "especie", render: (e) => e.speciesCommon },
  { key: "vol", label: "Vol. m³", align: "right", orden: "volumen", render: (e) => e.volumeM3 },
];

const nada = () => undefined;

function Seccion({ section = "tala" as LothSection, lineas = LINEAS }: { section?: LothSection; lineas?: LothEntryDTO[] }) {
  const tabla = useLothSeccionTabla({ section, cols: COLS, lineas, corregidaPor: new Map(), orden: "lineNo", dir: "asc" });
  const vivas = totalesDe([...lineas]);
  return (
    <div>
      <LothSeccionKpis
        section={section}
        cur={{ count: vivas.lineas, totalVolumeM3: vivas.volumenM3, totalQuantity: 0 }}
        totalLibro={vivas.lineas}
        lineas={lineas}
        delLibroEntero
        filtros={tabla.f}
      />
      <LothSeccionColumnas section={section} cols={COLS}>
        <LothSeccionBarra opciones={[]} onNuevaLinea={nada} />
        <LothSeccionTabla
          section={section}
          entries={tabla.enPagina}
          filasTotal={tabla.ordenadas}
          filtros={tabla.f}
          cols={COLS}
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
      </LothSeccionColumnas>
    </div>
  );
}

/** La cifra grande de una tarjeta (el `StatCard` la pinta junto a su rótulo). */
const tarjeta = (rotulo: RegExp) => screen.getByText(rotulo).closest("button, div.flex.h-full, [class*='rounded']") as HTMLElement;
const pie = () => document.querySelector("tfoot")!.textContent ?? "";
const filasCuerpo = () => within(document.querySelector("tbody")!).queryAllByRole("row");

describe("Secciones · las tarjetas filtran y dicen lo mismo que el pie", () => {
  it("«Fuera de plazo» deja sólo las tardías; el volumen de la tarjeta es el total del pie; otro toque deshace", () => {
    render(<Seccion />);
    fireEvent.click(screen.getByRole("button", { name: /Indicadores/ }));
    const tardias = LINEAS.filter((e) => e.status !== "anulado" && e.createdAt?.startsWith("2026-10")).length;
    expect(tardias).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: /^Fuera de plazo/ }));
    expect(filasCuerpo()).toHaveLength(tardias);
    expect(pie()).toContain(`Total · ${tardias} líneas`);
    const esperado = textoTotal("tala", totalesDe(LINEAS.filter((e) => e.status !== "anulado" && e.createdAt?.startsWith("2026-10"))));
    expect(pie()).toContain(esperado);
    expect(tarjeta(/Volumen registrado/).textContent).toContain(esperado);
    expect(screen.getByText("Filtrando: sólo las fuera de plazo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Fuera de plazo/ }));
    expect(filasCuerpo()).toHaveLength(50); // la primera página otra vez
    expect(screen.queryByText("Filtrando: sólo las fuera de plazo")).toBeNull();
  });

  it("«Líneas» deja sólo las vigentes: la tabla cuenta lo que dice la tarjeta (de todas las páginas)", () => {
    render(<Seccion />);
    fireEvent.click(screen.getByRole("button", { name: /Indicadores/ }));
    const vigentes = LINEAS.filter((e) => e.status !== "anulado").length;
    fireEvent.click(screen.getByRole("button", { name: /^Líneas · / }));
    expect(pie()).toContain(`Total · ${vigentes} líneas`);
    expect(pie()).not.toContain("anulada");
    expect(tarjeta(/Líneas · /).textContent).toContain(String(vigentes));
  });

  it("tocar una especie del reparto filtra por ella (las dos grafías juntas) y la tarjeta suma lo del pie", () => {
    render(<Seccion />);
    fireEvent.click(screen.getByRole("button", { name: /Indicadores/ }));
    fireEvent.click(screen.getByRole("button", { name: "Por especie" }));
    fireEvent.click(screen.getByRole("button", { name: /^Tornillo/ }));
    const tornillo = LINEAS.filter((e) => e.speciesCommon?.toLowerCase() === "tornillo");
    const esperado = textoTotal("tala", totalesDe(tornillo));
    expect(pie()).toContain(esperado);
    expect(tarjeta(/Volumen registrado/).textContent).toContain(esperado);
    expect(pie()).toContain(`Total · ${tornillo.filter((e) => e.status !== "anulado").length} líneas`);
  });

  it("las cifras de las tarjetas salen de la misma cuenta que el pie", () => {
    const c = cifrasDeLineas("tala", LINEAS);
    expect(c.total).toBe(textoTotal("tala", totalesDe([...LINEAS])));
    expect(c.porEspecie.map((f) => f.value).sort()).toEqual(["Cumala", "Tornillo"]);
    const sumaReparto = c.porEspecie.reduce((a, f) => a + (f.volumeM3 ?? 0), 0);
    expect(Math.round(sumaReparto * 1000) / 1000).toBe(Math.round(c.totales.volumenM3 * 1000) / 1000);
    expect(alternarSolo(["Registrada"], "Registrada")).toBeUndefined();
    expect(alternarSolo(["Registrada"], "Fuera de plazo")).toEqual(["Fuera de plazo"]);
  });
});

describe("Secciones · columnas elegidas y arrastradas, por sección", () => {
  const titulos = () => [...document.querySelectorAll("thead th[data-col]")].map((th) => th.getAttribute("data-col"));

  it("el orden guardado de la sección manda en cabecera, filas y pie; otra sección lee el suyo", () => {
    localStorage.setItem("orden-columnas:loth-seccion-tala", JSON.stringify(["vol", "esp", "lineNo", "fecha", "tree", "permiso", "obs"]));
    localStorage.setItem("columnas-visibles:loth-seccion-tala", JSON.stringify({ fecha: false }));
    const { rerender } = render(<Seccion />);
    expect(titulos()).toEqual(["vol", "esp", "lineNo", "tree", "obs"]);
    // La primera fila: casilla, y después el volumen (no la fecha, oculta).
    const celdas = within(filasCuerpo()[0]).getAllByRole("cell");
    expect(celdas[1].textContent).toBe(LINEAS[0].volumeM3);
    // El total cae bajo «Vol.» (primera columna): el rótulo pasa al final.
    const pieCeldas = [...document.querySelectorAll("tfoot td")];
    expect(pieCeldas[1].textContent).toContain(" m³");
    expect(pieCeldas.at(-1)!.textContent).toContain("Total · ");
    expect(screen.getByRole("button", { name: /Columnas/ }).textContent).toContain("5/6");

    rerender(<Seccion section="trozado" />);
    expect(titulos()).toEqual(["lineNo", "fecha", "tree", "esp", "vol", "obs"]);
  });

  it("ocultar una columna desde «Columnas» la saca de la tabla y se recuerda", () => {
    render(<Seccion />);
    fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "N°" }));
    expect(titulos()).not.toContain("lineNo");
    expect(JSON.parse(localStorage.getItem("columnas-visibles:loth-seccion-tala")!)).toEqual({ lineNo: false });
  });

  it("orden de fábrica y menú: «permiso» detrás de la primera, «ci» con nombre", () => {
    expect(ordenDeFabrica(COLS)).toEqual(["lineNo", "fecha", "tree", "permiso", "esp", "vol", "obs"]);
    expect(columnasElegibles([{ key: "ci", label: "" }]).find((c) => c.id === "ci")?.label).toBe("Destino de la troza");
  });

  it("reparto del pie: el rótulo antes de la primera columna con dato, o al final si es la primera", () => {
    expect(repartoDelPie(["lineNo", "fecha", "vol", "obs"], new Set(["vol"]))).toEqual({ rotuloAntes: 3, rotuloDespues: 0, conCeldas: ["vol", "obs"] });
    expect(repartoDelPie(["vol", "lineNo", "obs"], new Set(["vol"]))).toEqual({ rotuloAntes: 0, rotuloDespues: 3, conCeldas: ["vol"] });
    expect(repartoDelPie(["lineNo", "obs"], new Set())).toEqual({ rotuloAntes: 4, rotuloDespues: 0, conCeldas: [] });
  });
});
