import { describe, expect, it } from "vitest";
import { notaDelConteo, observacionDeLaNota, pideObservacion, totalesDelConteo } from "@/lib/caja/conteo-efectivo";
import { leerNotasArqueo } from "@/lib/caja/leer-notas-arqueo";

const conteo = { "billete-100": 2, "billete-50": 3, "moneda-1": 4, "moneda-0.5": 3, "moneda-0.1": 7 };

describe("totalesDelConteo", () => {
  it("suma billetes y monedas sin errores de coma flotante", () => {
    // 200 + 150 = 350 · 4 + 1.50 + 0.70 = 6.20
    expect(totalesDelConteo(conteo, 360)).toEqual({ billetes: 350, monedas: 6.2, contado: 356.2, diferencia: -3.8, hayConteo: true });
  });

  it("sin conteo no pide observación; con diferencia sí", () => {
    expect(pideObservacion(totalesDelConteo({}, 100))).toBe(false);
    expect(pideObservacion(totalesDelConteo(conteo, 356.2))).toBe(false);
    expect(pideObservacion(totalesDelConteo(conteo, 360))).toBe(true);
  });
});

describe("notaDelConteo", () => {
  it("la lee `leerNotasArqueo` (el detalle del cuadre) y guarda el desglose y la observación", () => {
    const nota = notaDelConteo(conteo, 360, "  di vuelto\nde más ");
    const leida = leerNotasArqueo(nota);
    expect(leida).toMatchObject({ billetes: 350, monedas: 6.2, totalEfectivo: 356.2, diferencia: -3.8, hayDatos: true });
    expect(nota).toContain("Detalle: 2×S/100, 3×S/50, 4×S/1, 3×S/0.50, 7×S/0.10");
    expect(observacionDeLaNota(nota)).toBe("di vuelto de más");
  });

  it("un sobrante lleva signo +", () => {
    expect(notaDelConteo({ "billete-200": 1 }, 150)).toContain("Diferencia: +S/50.00");
  });
});
