/**
 * Revisión previa al cierre: qué impide, qué observa y qué ya no se arregla.
 */
import { describe, expect, it } from "vitest";
import { revisarCierre } from "@/lib/forestal/ctp-cierre-checklist";
import type { DatosPendientes } from "@/lib/forestal/ctp-pendientes";

const LIMPIO: DatosPendientes = {
  ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
  despachosSinGtf: 0, despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
};

describe("revisarCierre", () => {
  it("mes limpio: listo para cerrar", () => {
    const r = revisarCierre(LIMPIO);
    expect(r.veredicto).toBe("listo");
    expect(r.impedimentos).toEqual([]);
    expect(r.titulo).toMatch(/Todo en orden/);
  });

  it("saldo negativo es lo único que impide cerrar", () => {
    const r = revisarCierre({ ...LIMPIO, saldosNegativos: 1 });
    expect(r.veredicto).toBe("no_conviene");
    expect(r.impedimentos[0]).toMatch(/acta quedaría falsa/);
  });

  it("ingresos sin validar o despachos sin GTF observan, no impiden", () => {
    const r = revisarCierre({ ...LIMPIO, ingresosPendientes: 3, despachosSinGtf: 1 });
    expect(r.veredicto).toBe("con_observaciones");
    expect(r.impedimentos).toEqual([]);
    expect(r.observaciones).toHaveLength(2);
  });

  it("lo que el cierre NO arregla va como nota, no como observación", () => {
    const r = revisarCierre({ ...LIMPIO, fueraDePlazo: 2, despachosSinAnexo: 1 });
    expect(r.veredicto).toBe("listo");        // no bloquea ni observa
    expect(r.nota).toHaveLength(2);
    expect(r.nota.join(" ")).toMatch(/ya quedó en el acta/);
  });

  it("singular y plural sin '1 guías'", () => {
    expect(revisarCierre({ ...LIMPIO, guiasSinIngresar: 1 }).observaciones[0]).toContain("1 guía ");
    expect(revisarCierre({ ...LIMPIO, guiasSinIngresar: 4 }).observaciones[0]).toContain("4 guías");
  });
});

it("nombra el mes en el veredicto (convive con el panel de otro período)", () => {
  expect(revisarCierre(LIMPIO, "junio de 2026").titulo).toBe("Todo en orden para cerrar junio de 2026");
  expect(revisarCierre({ ...LIMPIO, saldosNegativos: 1 }, "junio de 2026").titulo).toBe("Revisá esto antes de cerrar junio de 2026");
  expect(revisarCierre(LIMPIO).titulo).toBe("Todo en orden para cerrar el mes");
});
