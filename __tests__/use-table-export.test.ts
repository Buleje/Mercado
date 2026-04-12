/**
 * __tests__/use-table-export.test.ts
 *
 * Tests unitarios para el hook useTableExport.
 * Cubre: empty, simple, escape de comas y comillas.
 *
 * No usa renderHook — el hook no tiene dependencias de React DOM,
 * las funciones internas se prueban directamente via el resultado del hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTableExport } from "@/hooks/useTableExport";

// ── Mock de APIs del navegador ───────────────────────────────────────────────
const mockCreateObjectURL = vi.fn((_: Blob) => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();

let capturedBlob: Blob | null = null;
let capturedFilename: string | null = null;

beforeEach(() => {
  capturedBlob = null;
  capturedFilename = null;
  mockCreateObjectURL.mockClear();
  mockRevokeObjectURL.mockClear();
  mockAppendChild.mockClear();
  mockRemoveChild.mockClear();
  mockClick.mockClear();

  // Mock URL.createObjectURL y revokeObjectURL
  Object.defineProperty(globalThis, "URL", {
    value: {
      createObjectURL: (blob: Blob) => {
        capturedBlob = blob;
        return mockCreateObjectURL(blob);
      },
      revokeObjectURL: mockRevokeObjectURL,
    },
    writable: true,
  });

  // Mock document.createElement para capturar el filename
  const originalCreateElement = document.createElement.bind(document) as unknown as (
    tagName: string,
    options?: ElementCreationOptions,
  ) => HTMLElement;

  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    const el = originalCreateElement(tag);
    if (tag === "a") {
      const anchor = el as HTMLAnchorElement;
      Object.defineProperty(anchor, "download", {
        set(v: string) { capturedFilename = v; },
        get() { return capturedFilename ?? ""; },
      });
      anchor.click = mockClick;
      return anchor;
    }
    return el;
  }) as unknown as Document["createElement"]);

  const originalAppendChild = document.body.appendChild.bind(document.body);
  const originalRemoveChild = document.body.removeChild.bind(document.body);

  vi.spyOn(document.body, "appendChild").mockImplementation(((node: Node) => {
    mockAppendChild(node);
    return originalAppendChild(node);
  }) as typeof document.body.appendChild);

  vi.spyOn(document.body, "removeChild").mockImplementation(((node: Node) => {
    mockRemoveChild(node);
    return originalRemoveChild(node);
  }) as typeof document.body.removeChild);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helper para leer el contenido del blob ───────────────────────────────────
async function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useTableExport — toCsv", () => {
  it("caso 1: filas vacías — no descarga y emite warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useTableExport([], "test"));

    act(() => { result.current.toCsv(); });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no hay filas"));
    expect(mockClick).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("caso 2: filas simples — genera CSV con encabezado correcto y descarga", async () => {
    const rows = [
      { nombre: "Leche", precio: 3.5, stock: 10 },
      { nombre: "Arroz", precio: 2.0, stock: 50 },
    ];
    const { result } = renderHook(() => useTableExport(rows, "productos"));

    act(() => { result.current.toCsv(); });

    expect(mockClick).toHaveBeenCalledTimes(1);
    expect(capturedFilename).toBe("productos.csv");
    expect(capturedBlob).not.toBeNull();

    const content = await readBlob(capturedBlob!);
    const lines = content.split("\n");
    expect(lines[0]).toBe("nombre,precio,stock");
    expect(lines[1]).toBe("Leche,3.5,10");
    expect(lines[2]).toBe("Arroz,2,50");
  });

  it("caso 3: escape de comas y comillas dobles en valores", async () => {
    const rows = [
      { descripcion: 'Producto "especial", con coma', precio: 1.5 },
      { descripcion: "Normal", precio: 2 },
    ];
    const { result } = renderHook(() => useTableExport(rows, "export"));

    act(() => { result.current.toCsv(); });

    expect(capturedBlob).not.toBeNull();
    const content = await readBlob(capturedBlob!);
    const lines = content.split("\n");
    // El valor con comas y comillas debe estar envuelto en comillas, comillas internas duplicadas
    expect(lines[1]).toBe('"Producto ""especial"", con coma",1.5');
    expect(lines[2]).toBe("Normal,2");
  });
});

describe("useTableExport — toXlsx", () => {
  it("emite warning sobre formato CSV y descarga con extensión .xlsx", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = [{ id: 1, valor: "test" }];
    const { result } = renderHook(() => useTableExport(rows, "datos"));

    act(() => { result.current.toXlsx(); });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("sin librería xlsx"));
    expect(capturedFilename).toBe("datos.xlsx");
    expect(mockClick).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
