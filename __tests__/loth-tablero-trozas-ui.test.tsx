/**
 * Tests — vista «Control del permiso» montada de verdad (jsdom).
 *
 * Lo que un gate estático no ve: que la placa llegue desde la GTF por la API,
 * que el selector de columnas se recuerde en localStorage, que el orden se
 * aplique al clic y que el lugar del `encabezado` quede donde se prometió.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LothTableroTrozas from "@/components/admin/forestal/LothTableroTrozas";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const base = {
  despachoCode: null, isRama: false, speciesScientific: null, cites: false, diamMayorM: null, diamMenorM: null,
  lengthM: null, productType: null, quantity: null, unit: null, pieces: null, gtfNumber: null, discarded: false,
  consumoInterno: false, observations: null, status: "registrado" as const, annulledReason: null, gpsLat: null,
  gpsLng: null, photoUrl: null, treeCode: null, speciesCommon: null, volumeM3: null, planId: null,
};
const l = (p: Partial<LothEntryDTO> & Pick<LothEntryDTO, "section" | "trozaCode">): LothEntryDTO => ({
  ...base, id: Math.random().toString(36).slice(2), lineNo: 1, entryDate: "2026-09-22T00:00:00.000Z", ...p,
});

const ENTRIES: LothEntryDTO[] = [
  l({ section: "trozado", trozaCode: "111-A", treeCode: "111", speciesCommon: "Shihuahuaco", volumeM3: "4.9510" }),
  l({ section: "trozado", trozaCode: "002-TOR-A", treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: "1.5150" }),
  l({ section: "despacho_troza", trozaCode: "111-A", gtfNumber: "019-0000002", entryDate: "2026-09-29T00:00:00.000Z" }),
  l({ section: "consumo_troza", trozaCode: "002-TOR-A", entryDate: "2026-09-25T00:00:00.000Z" }),
];

function mockApi(ok = true) {
  return vi.fn(async (url: string) => {
    if (!ok) return new Response("{}", { status: 500 });
    const body = url.includes("/gtf")
      ? { gtfs: [{ gtfNumber: "019-0000002", status: "emitida", placaVehiculo: "W2D-835", destino: "Pucallpa" }] }
      : { plans: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LothTableroTrozas", () => {
  it("por defecto 8 columnas, con «Días en patio» y «Placa»; la placa viene de la GTF", async () => {
    vi.stubGlobal("fetch", mockApi());
    const { container } = render(<LothTableroTrozas entries={ENTRIES} />);
    const cab = [...container.querySelectorAll("thead th")].map((th) => th.getAttribute("data-label"));
    expect(cab).toEqual(["Cód. troza", "Árbol", "Especie", "Vol. m³", "Estado", "GTF / salida", "Días en patio", "Placa"]);
    await waitFor(() => expect(screen.getByText("W2D-835")).toBeTruthy());
  });

  it("el encabezado va entre la banda del permiso y «Estado de las trozas»", () => {
    vi.stubGlobal("fetch", mockApi());
    const { container } = render(<LothTableroTrozas entries={ENTRIES} encabezado={<div data-testid="slot">ficha</div>} />);
    const html = container.innerHTML;
    expect(html.indexOf("Titular")).toBeLessThan(html.indexOf('data-testid="slot"'));
    expect(html.indexOf('data-testid="slot"')).toBeLessThan(html.indexOf("Estado de las trozas"));
  });

  it("prender una columna la muestra y queda recordada", () => {
    vi.stubGlobal("fetch", mockApi());
    const { container, unmount } = render(<LothTableroTrozas entries={ENTRIES} />);
    fireEvent.click(screen.getByRole("button", { name: /Columnas/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Columnas visibles" })).getByLabelText("Destino"));
    expect(container.querySelector('thead th[data-label="Destino"]')).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("loth-tablero-columnas-v1") ?? "[]")).toContain("destino");
    unmount();
    const otra = render(<LothTableroTrozas entries={ENTRIES} />);
    expect(otra.container.querySelector('thead th[data-label="Destino"]')).toBeTruthy();
  });

  it("clic en «Vol. m³» ordena de menor a mayor y marca aria-sort", () => {
    vi.stubGlobal("fetch", mockApi());
    const { container } = render(<LothTableroTrozas entries={ENTRIES} />);
    fireEvent.click(screen.getByTitle("Ordenar por vol. m³"));
    const codigos = [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("td")?.textContent);
    expect(codigos).toEqual(["002-TOR-A", "111-A"]);
    expect(container.querySelector('th[data-label="Vol. m³"]')?.getAttribute("aria-sort")).toBe("ascending");
  });

  it("si la API de guías falla, lo dice y la tabla sigue", async () => {
    vi.stubGlobal("fetch", mockApi(false));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<LothTableroTrozas entries={ENTRIES} />);
    await waitFor(() => expect(screen.getByText(/No se pudieron leer las guías/)).toBeTruthy());
    expect(screen.getByText("111-A")).toBeTruthy();
  });

  it("un localStorage roto no tumba la vista", () => {
    vi.stubGlobal("fetch", mockApi());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    window.localStorage.setItem("loth-tablero-columnas-v1", "{no es json");
    const { container } = render(<LothTableroTrozas entries={ENTRIES} />);
    expect(container.querySelectorAll("thead th")).toHaveLength(8);
  });
});

describe("exportarTableroExcel — el archivo se arma y se lee de vuelta", () => {
  it("3 hojas; «Trozas» con todas las columnas y la placa; nombre con el título", async () => {
    const { construirTablero, guiaDesdeApi } = await import("@/lib/forestal/loth-tablero-trozas");
    const { exportarTableroExcel } = await import("@/lib/forestal/loth-tablero-export");
    const { COLUMNAS_TABLERO } = await import("@/lib/forestal/loth-tablero-columnas");
    const filas = construirTablero(ENTRIES, new Date("2026-09-30T15:00:00Z"), {
      guias: [guiaDesdeApi({ gtfNumber: "019-0000002", placaVehiculo: "W2D-835" })!],
    });
    let blob: Blob | null = null;
    let nombre = "";
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => ((blob = b), "blob:x"), revokeObjectURL: () => {} }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      nombre = this.download;
    });
    await exportarTableroExcel(filas, { tituloHabilitante: "25-TAM/C-OPB-A-001-17" }, new Date("2026-09-30T15:00:00Z"));
    click.mockRestore();
    expect(nombre).toBe("control-permiso-25-TAM-C-OPB-A-001-17-2026-09-30.xlsx");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (blob as unknown as Blob).arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Trozas", "Cómo se lee"]);
    const trozas = wb.getWorksheet("Trozas")!;
    expect(trozas.getRow(1).cellCount).toBe(COLUMNAS_TABLERO.length + 1);
    const valores = trozas.getSheetValues().flat().map(String);
    expect(valores).toContain("W2D-835");
    const resumen = wb.getWorksheet("Resumen")!.getSheetValues().flat().map(String);
    expect(resumen).toContain("25-TAM/C-OPB-A-001-17");
    expect(resumen).toContain("Total");
  });
});
