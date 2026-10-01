// @vitest-environment jsdom
/**
 * La observación de cada pieza sale en el Excel del cubicador (2026-09-23),
 * como el dueño: una columna sólo si alguna pieza la tiene — sin ninguna, la
 * hoja queda igual que antes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { exportarExcel } from "@/lib/forestal/cubicador-export";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

const pieza = (id: string, observacion?: string): PiezaCubicada => ({
  id, cantidad: 2, espesor: 2, ancho: 8, largo: 10,
  uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
  especie: "Tornillo", pieTablar: 26.67, m3: 0.0629,
  ...(observacion ? { observacion } : {}),
});

/** Genera el Excel y devuelve la hoja «Detalle» ya leída de vuelta. */
async function detalle(rows: PiezaCubicada[]) {
  /* El Blob de jsdom no se deja leer de vuelta: se atrapa el buffer que exceljs
     le pasa al construirlo. */
  let buffer: ArrayBuffer | null = null;
  const BlobReal = globalThis.Blob;
  vi.stubGlobal("Blob", class extends BlobReal {
    constructor(partes: BlobPart[], opciones?: BlobPropertyBag) {
      buffer = partes[0] as ArrayBuffer;
      super(partes, opciones);
    }
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:x") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await exportarExcel(rows, { precioPt: 0 });
  if (!buffer) throw new Error("no se generó el archivo");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet("Detalle");
  if (!ws) throw new Error("sin hoja Detalle");
  const cabecera = (ws.getRow(1).values as unknown[]).filter(Boolean) as string[];
  return { ws, cabecera };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Excel del cubicador — observación", () => {
  it("con alguna observación, sale su columna y cada pieza lleva la suya", async () => {
    const { ws, cabecera } = await detalle([pieza("a", "rajada"), pieza("b")]);
    const col = cabecera.indexOf("Observación") + 1;
    expect(col).toBeGreaterThan(0);
    expect(cabecera.indexOf("Observación")).toBe(cabecera.indexOf("Especie") + 1);
    expect(ws.getRow(2).getCell(col).value).toBe("rajada");
    expect(ws.getRow(3).getCell(col).value ?? "").toBe("");
  });

  it("sin ninguna, la hoja no inventa una columna vacía", async () => {
    const { cabecera } = await detalle([pieza("a"), pieza("b")]);
    expect(cabecera).not.toContain("Observación");
  });
});
