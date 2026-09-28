/**
 * Tests — «Trozar un árbol» igual que el Trozado de a una (Brandon 28-09).
 *
 *   - lo puro: los códigos siguen a lo asentado (A-D → E, F, G; 111-2 → 111-3),
 *     lo que queda resta lo asentado Y todas las nuevas con la comparación de
 *     T4, los renglones a medias no se asientan y la medición cruda va con su
 *     forma;
 *   - el modal montado con la red simulada: la ficha del árbol (censo, tala,
 *     «Ya trozado (4)» / «Estas trozas (3)» / «Se pasa»), las dos formas con la
 *     elección fijada, el recorrido con Enter hasta «Agregar troza» y lo que se
 *     manda al asentar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import LothTrozadoMultipleModal from "@/components/admin/forestal/LothTrozadoMultipleModal";
import { olvidarArbolEnElLibro } from "@/components/admin/forestal/hooks/use-arbol-en-el-libro";
import { olvidarCensoDeTala } from "@/components/admin/forestal/hooks/use-censo-de-tala";
import { CLAVE_FORMA_MEDICION } from "@/components/admin/forestal/hooks/use-forma-medicion";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { medidasVacias } from "@/lib/forestal/loth-forma-medicion";
import type { ArbolEnElLibro } from "@/lib/forestal/loth-restante";
import {
  calcularRenglones,
  codigosLibres,
  restanteDeLote,
  trozasParaAsentar,
  type RenglonTroza,
} from "@/lib/forestal/loth-trozado-multiple";

const troza = (trozaCode: string, volumeM3: number | null, lineNo = 1) => ({ id: trozaCode, lineNo, trozaCode, volumeM3 });
const ARBOL: ArbolEnElLibro = {
  treeCode: "85-TOR",
  tala: { lineNo: 1, fecha: "2026-05-28", diamMayorM: 0.8, diamMenorM: 0.6, lengthM: 13, volumeM3: 5.003, motosierrista: null, horaTala: null, gpsOrigen: null },
  trozas: [troza("85-TOR-A", 1.471), troza("85-TOR-B", 1.29), troza("85-TOR-C", 0.995), troza("85-TOR-D", 1.131)],
};

describe("lo puro", () => {
  it("los códigos siguen a lo asentado, en letras o en números", () => {
    expect(codigosLibres("85-TOR", ARBOL.trozas, 3)).toEqual(["85-TOR-E", "85-TOR-F", "85-TOR-G"]);
    expect(codigosLibres("111", [troza("111-1", 1), troza("111-2", 1)], 2)).toEqual(["111-3", "111-4"]);
    expect(codigosLibres("9", [], 2)).toEqual(["9-A", "9-B"]);
  });

  it("lo que queda resta lo asentado y TODAS las nuevas; pasarse se marca como T4", () => {
    const r = restanteDeLote(ARBOL, [
      { trozaCode: "85-TOR-E", volumeM3: 0.05 },
      { trozaCode: "85-TOR-F", volumeM3: 0.066 },
      { trozaCode: "85-TOR-G", volumeM3: null },
    ]);
    expect(r).toMatchObject({ asentadoM3: 4.887, asentadas: 4, nuevasM3: 0.116, nuevas: 2, trozadoM3: 5.003, restanteM3: 0, excede: false });
    const pasa = restanteDeLote(ARBOL, [{ trozaCode: "85-TOR-E", volumeM3: 0.1161 }]);
    expect(pasa.excede).toBe(true);
    expect(pasa.restanteM3).toBe(-0.0001);
  });

  it("los renglones a medias no se asientan; la medición cruda va con la forma", () => {
    const r = (id: number, m: Partial<ReturnType<typeof medidasVacias>>): RenglonTroza => ({ id, isRama: false, medidas: { ...medidasVacias(), ...m } });
    const calc = calcularRenglones(
      [r(0, { mayor: ["0.62", "0.58"], menor: ["0.52", "0.48"], totalM: "3" }), r(1, { mayor: ["0.5", ""] }), r(2, {})],
      "cruzadas",
      "85-TOR",
      ARBOL.trozas,
    );
    expect(calc.map((c) => [c.codigo, c.completo, c.aMedias])).toEqual([
      ["85-TOR-E", true, false],
      ["85-TOR-F", false, true],
      ["85-TOR-G", false, false],
    ]);
    const [e] = trozasParaAsentar(calc, "cruzadas");
    // Ø 0.600 y 0.500 → Smalian 0.7854 × 0.55² × 3 = 0.71275 → 0.7128
    expect(e).toMatchObject({ trozaCode: "85-TOR-E", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 3, volumeM3: 0.7128 });
    expect(e.medicionCruda).toMatchObject({ forma: "cruzadas", mayor: [0.62, 0.58], menor: [0.52, 0.48], totalM: 3 });
    expect(trozasParaAsentar(calc, "cruzadas")).toHaveLength(1);
  });
});

// ─── El modal montado ────────────────────────────────────────────────────────

const TALA: LothEntryDTO = {
  id: "tala-85",
  section: "tala",
  lineNo: 1,
  entryDate: "2026-05-28T00:00:00.000Z",
  treeCode: "85-TOR",
  trozaCode: null,
  speciesCommon: "Tornillo",
  volumeM3: "5.0030",
  status: "registrado",
} as unknown as LothEntryDTO;

const linea = (x: Record<string, unknown>) => ({ entryDate: "2026-05-28T00:00:00.000Z", treeCode: "85-TOR", trozaCode: null, status: "registrado", ...x });
const LIBRO_85 = [
  linea({ id: "l0", section: "tala", lineNo: 1, volumeM3: "5.0030", diamMayorM: "0.800", diamMenorM: "0.600", lengthM: "13.00", motosierrista: "Juan Pérez" }),
  linea({ id: "l1", section: "trozado", lineNo: 1, trozaCode: "85-TOR-A", volumeM3: "1.4710" }),
  linea({ id: "l2", section: "trozado", lineNo: 2, trozaCode: "85-TOR-B", volumeM3: "1.2900" }),
  linea({ id: "l3", section: "trozado", lineNo: 3, trozaCode: "85-TOR-C", volumeM3: "0.9950" }),
  linea({ id: "l4", section: "trozado", lineNo: 4, trozaCode: "85-TOR-D", volumeM3: "1.1310" }),
];
const CENSO = [
  { id: "t1", treeCode: "85-TOR", speciesCommon: "Tornillo", speciesScientific: "Cedrelinga cateniformis", cites: false, dapM: "0.800", alturaComercialM: "13.00", volumenEstimadoM3: "4.2474", condicion: "Aprovechable", notes: null, estado: "en_pie" },
];

function responder(url: string) {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  if (url.startsWith("/api/admin/forestal/plan/census?treeCode=85-TOR")) return json({ tree: { planId: "p1" } });
  if (url.startsWith("/api/admin/forestal/plan/census?planId=p1")) return json({ trees: CENSO, total: 1, truncado: false });
  if (url.startsWith("/api/admin/forestal/loth?usoCenso=1")) return json({ usos: [] });
  if (url.startsWith("/api/admin/forestal/loth/poa")) return json({ config: { dmcOverrides: {}, semillerosPct: 10 } });
  if (url.startsWith("/api/admin/forestal/loth?search=85-TOR")) return json({ entries: LIBRO_85, total: LIBRO_85.length });
  return { ok: false, status: 404, json: async () => ({}) };
}

beforeEach(() => {
  window.localStorage.clear();
  olvidarArbolEnElLibro();
  olvidarCensoDeTala();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => responder(String(url))));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ficha = () => document.querySelector('[data-ficha-trozado="85-TOR"]') as HTMLElement;
const campo = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const tipear = (label: string, v: string) => fireEvent.change(campo(label), { target: { value: v } });
/** El pie: lo que se ve y lo que le llega al lector (sólo el aviso). */
const pie = () => {
  const f = document.querySelector('[role="dialog"][aria-label="Trozar un árbol"] footer') as HTMLElement;
  return { visible: f.querySelector("p")?.textContent ?? "", lector: f.querySelector('[aria-live="polite"]')?.textContent ?? "" };
};

async function abrir(onGuardar = vi.fn(async () => ({ creadas: 0, errores: [] as string[] }))) {
  render(<LothTrozadoMultipleModal open talas={[TALA]} onClose={() => {}} onGuardar={onGuardar} />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "tala-85" } });
  // Los códigos pasan a la primera letra libre cuando responde el libro.
  await waitFor(() => expect(screen.getByRole("group", { name: "Troza 85-TOR-E" })).toBeTruthy());
  return onGuardar;
}

describe("el modal «Trozar un árbol»", () => {
  it("trae la ficha del árbol con la tala y suma TODAS las trozas contra lo talado", async () => {
    await abrir();
    const f = ficha();
    await waitFor(() => expect(within(f).getByText("Tornillo")).toBeTruthy());
    expect(f.querySelector('[data-tala-linea="1"]')?.textContent).toMatch(/Juan Pérez/);
    for (const c of ["85-TOR-A", "85-TOR-D"]) expect(within(f).getByText(c)).toBeTruthy();

    // 3 trozas «Varias medidas» (la forma por defecto).
    fireEvent.click(screen.getByRole("button", { name: "Agregar troza" }));
    const medir = (codigo: string, m: [string, string, string, string, string]) => {
      const [a, b, c, d, l] = m;
      tipear(`${codigo} · Ø mayor 1`, a);
      tipear(`${codigo} · Ø mayor 2`, b);
      tipear(`${codigo} · Ø menor 1`, c);
      tipear(`${codigo} · Ø menor 2`, d);
      tipear(`${codigo} · Largo`, l);
    };
    medir("85-TOR-E", ["0.30", "0.30", "0.20", "0.20", "0.5"]);
    medir("85-TOR-F", ["0.20", "0.20", "0.20", "0.20", "0.5"]);
    medir("85-TOR-G", ["0.30", "0.30", "0.30", "0.30", "1"]);

    const resta = f.querySelector('[data-restante="Lo que queda por trozar"]') as HTMLElement;
    expect(within(resta).getByRole("rowheader", { name: /Ya trozado \(4\)/ }).closest("tr")?.textContent).toMatch(/4\.887/);
    expect(within(resta).getByRole("rowheader", { name: /Estas trozas \(3\)/ })).toBeTruthy();
    // 4.887 + 0.0245 + 0.0157 + 0.0707 = 4.998 → quedan 0.005
    expect(within(resta).getByRole("rowheader", { name: /Queda/ }).closest("tr")?.textContent).toMatch(/0\.005/);
    expect(within(f).getByText("85-TOR-G")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Asentar 3 trozas" })).toBeTruthy();

    // Una troza más larga se pasa: aviso en la ficha y en el pie.
    tipear("85-TOR-G · Largo", "2");
    await waitFor(() => expect(within(resta).getByRole("rowheader", { name: /Se pasa/ })).toBeTruthy());
    expect(pie().visible).toMatch(/Se pasa de lo talado por 0\.066 m³/);
    expect(pie().lector).toMatch(/Se pasa de lo talado por 0\.066 m³/);
  });

  it("«D1 y D2 promediados» se fija en el equipo y se asienta con su forma", async () => {
    const onGuardar = await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "D1 y D2 promediados" }));
    expect(window.localStorage.getItem(CLAVE_FORMA_MEDICION)).toBe('"promedio"');
    tipear("85-TOR-E · D1 · Ø mayor", "0,40");
    tipear("85-TOR-E · D2 · Ø menor", "0.30");
    tipear("85-TOR-E · Largo", "0.5");
    // F queda a medias: se avisa y no se manda.
    tipear("85-TOR-F · D1 · Ø mayor", "0.3");
    expect(pie().visible).toMatch(/85-TOR-F a medias: no se asienta/);
    expect(pie().lector).toMatch(/85-TOR-F a medias/);
    fireEvent.click(screen.getByRole("button", { name: "Asentar 1 troza" }));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1));
    const [arbol, trozas] = onGuardar.mock.calls[0] as unknown as [LothEntryDTO, unknown[]];
    expect(arbol.treeCode).toBe("85-TOR");
    expect(trozas).toEqual([
      {
        trozaCode: "85-TOR-E",
        diamMayorM: 0.4,
        diamMenorM: 0.3,
        lengthM: 0.5,
        volumeM3: 0.0481,
        isRama: false,
        medicionCruda: { forma: "promedio", mayor: [], menor: [], totalM: 0.5, descuentos: [] },
      },
    ]);
  });

  it("con el teclado: Enter recorre la troza, pasa a la siguiente y termina en «Agregar troza»", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "D1 y D2 promediados" }));
    const e1 = campo("85-TOR-E · D1 · Ø mayor");
    e1.focus();
    const orden = ["85-TOR-E · D2 · Ø menor", "85-TOR-E · Largo", "85-TOR-F · D1 · Ø mayor", "85-TOR-F · D2 · Ø menor", "85-TOR-F · Largo"];
    for (const label of orden) {
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
      expect(document.activeElement).toBe(campo(label));
    }
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    const agregar = screen.getByRole("button", { name: "Agregar troza" });
    expect(document.activeElement).toBe(agregar);
    // «Agregar troza» deja el foco en la troza nueva.
    fireEvent.click(agregar);
    await waitFor(() => expect(document.activeElement).toBe(campo("85-TOR-G · D1 · Ø mayor")));
    // → al borde vuelve a la anterior con ←.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(campo("85-TOR-F · Largo"));
  });
});
