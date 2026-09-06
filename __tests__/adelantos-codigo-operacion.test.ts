import { describe, expect, it } from "vitest";
import {
  formatearCodigo,
  leerCodigo,
  normalizarBusquedaCodigo,
  siguienteCodigo,
} from "@/lib/adelantos/codigo-operacion";

/**
 * El código va escrito en un papel firmado. Lo que se protege acá es que el
 * contador NUNCA retroceda —reusar un número que ya anda circulando es peor que
 * saltearse uno— y que buscarlo funcione como lo dicta una persona.
 */
describe("formar y leer el código", () => {
  it("rellena el correlativo a cuatro dígitos", () => {
    expect(formatearCodigo(2026, 7)).toBe("ADL-2026-0007");
    expect(formatearCodigo(2026, 1234)).toBe("ADL-2026-1234");
  });

  it("un correlativo que se pasó de cuatro dígitos no se trunca", () => {
    expect(formatearCodigo(2026, 12345)).toBe("ADL-2026-12345");
  });

  it("lee un código bien formado", () => {
    expect(leerCodigo("ADL-2026-0007")).toEqual({ codigo: "ADL-2026-0007", anio: 2026, correlativo: 7 });
  });

  it("un texto cualquiera NO se hace pasar por código", () => {
    expect(leerCodigo("recibo 45")).toBeNull();
    expect(leerCodigo("XYZ-2026-0001")).toBeNull(); // otro prefijo
    expect(leerCodigo(null)).toBeNull();
    expect(leerCodigo("")).toBeNull();
  });
});

describe("el próximo código", () => {
  it("empieza en 0001 cuando el tenant no tiene ninguno", () => {
    expect(siguienteCodigo([], 2026)).toBe("ADL-2026-0001");
  });

  it("sigue del mayor emitido de ESE año", () => {
    expect(siguienteCodigo(["ADL-2026-0001", "ADL-2026-0003", "ADL-2026-0002"], 2026)).toBe("ADL-2026-0004");
  });

  /** Cada año arranca de nuevo, como cualquier talonario. */
  it("no arrastra el correlativo de otro año", () => {
    expect(siguienteCodigo(["ADL-2025-0912"], 2026)).toBe("ADL-2026-0001");
  });

  /**
   * EL invariante: si un adelanto se cancela o se borra, el contador no puede
   * retroceder. Por eso se calcula sobre los códigos emitidos y no con un
   * `count(*)`, que reusaría un número que ya está escrito en un papel.
   */
  it("no reusa un número aunque falten adelantos en el medio", () => {
    expect(siguienteCodigo(["ADL-2026-0001", "ADL-2026-0009"], 2026)).toBe("ADL-2026-0010");
  });

  it("ignora la basura sin romperse", () => {
    expect(siguienteCodigo([null, undefined, "", "no-es-un-codigo", "ADL-2026-0005"], 2026)).toBe("ADL-2026-0006");
  });
});

describe("buscar por código como lo dicta una persona", () => {
  it("acepta el código completo, en cualquier caja", () => {
    expect(normalizarBusquedaCodigo("adl-2026-0007")).toBe("ADL-2026-0007");
    expect(normalizarBusquedaCodigo("  ADL-2026-0007 ")).toBe("ADL-2026-0007");
  });

  /** Nadie dicta los ceros a la izquierda. */
  it("completa los ceros y el prefijo que faltan", () => {
    expect(normalizarBusquedaCodigo("2026-7")).toBe("ADL-2026-0007");
    expect(normalizarBusquedaCodigo("ADL-2026-7")).toBe("ADL-2026-0007");
  });

  it("devuelve null si no se parece a un código: ahí se busca por nombre", () => {
    expect(normalizarBusquedaCodigo("Juana")).toBeNull();
    expect(normalizarBusquedaCodigo("")).toBeNull();
    expect(normalizarBusquedaCodigo("7")).toBeNull();
  });
});
