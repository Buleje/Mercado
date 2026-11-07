/**
 * PDF del cumplimiento del Libro TH (reviewer 26-10): si algo quedó sin leer o
 * la ruta de los chequeos avanzados falló, el PDF dice «No se revisó: …» y el
 * veredicto NO dice «al día» (antes salía «100/100 · Sin observaciones»).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const abrir = vi.hoisted(() => vi.fn());
vi.mock("@/lib/forestal/ctp-print-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forestal/ctp-print-shared")>()),
  openCtpReport: abrir,
}));

import { computeLothCompliance } from "@/lib/forestal/loth-compliance";
import { loNoRevisado, printLothCumplimiento } from "@/lib/forestal/loth-cumplimiento-print";

const CARATULA_OK = { titularName: "Maderera Blas SAC", tituloHabilitante: "CONC-25-001" };
const limpio = () => computeLothCompliance({ anomalias: [], caratula: CARATULA_OK, totalLineas: 10 });
const html = () => String((abrir.mock.calls.at(-1)?.[0] as { body: string }).body);

beforeEach(() => abrir.mockReset());

describe("printLothCumplimiento — lo que no se revisó", () => {
  it("todo leído y sin problemas → «al día» y sin «No se revisó»", () => {
    const result = limpio();
    expect(result.readiness).toBe("ready");
    printLothCumplimiento({ result, caratula: CARATULA_OK, totalLineas: 10, sinLeer: [] });
    expect(html()).toContain("El libro está al día");
    expect(html()).not.toContain("No se revisó");
  });

  it("con algo sin leer → dice «No se revisó» con lo que falta y no «al día»", () => {
    printLothCumplimiento({ result: limpio(), caratula: CARATULA_OK, totalLineas: 10, sinLeer: ["las guías emitidas", "los papeles de PO 12"] });
    expect(html()).toContain("No se revisó");
    expect(html()).toContain("las guías emitidas · los papeles de PO 12");
    expect(html()).not.toMatch(/al día/);
    expect(html()).not.toContain("el libro no tiene problemas detectados");
    expect(html()).toContain("(sobre lo revisado)");
  });

  it("la ruta avanzada falló sin cálculo anterior → «No se revisó» los chequeos avanzados", () => {
    printLothCumplimiento({ result: limpio(), caratula: CARATULA_OK, totalLineas: 10, errorAvanzado: "HTTP 500", avanzadoLeido: false });
    expect(html()).toContain("No se revisó");
    expect(html()).toContain("los chequeos avanzados");
    expect(html()).not.toMatch(/al día/);
  });

  it("una recarga fallida con el cálculo anterior del mismo plan no cuenta como sin revisar", () => {
    expect(loNoRevisado({ errorAvanzado: "HTTP 500", avanzadoLeido: true })).toEqual([]);
    expect(loNoRevisado({ errorAvanzado: "HTTP 500", avanzadoLeido: false, sinLeer: ["x"] })).toHaveLength(2);
  });
});
