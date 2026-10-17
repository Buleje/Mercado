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
  expect(revisarCierre({ ...LIMPIO, saldosNegativos: 1 }, "junio de 2026").titulo).toBe("Revisa esto antes de cerrar junio de 2026");
  expect(revisarCierre(LIMPIO).titulo).toBe("Todo en orden para cerrar el mes");
});

/* La observación de corridas sin materia prima decía sólo «N corridas», y eso
   promedia a la que no declaró nada con la que afirma en el libro cuánta madera
   entró y no tiene ni una troza detrás — que es la que un fiscalizador mira
   primero. Medido en Blas el 2026-09-19: 5 de 14 declaran 142,26 m³. */
describe("cierre — la corrida que DECLARA entrada sin trozas se nombra aparte", () => {
  const base = {
    ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
    despachosSinGtf: 0, despachosSinAnexo: 0, saldosNegativos: 0,
    trozasVaradas: 0, ingresosSinCosto: 0, m3SinCosto: 0,
  };
  const corrida = (declaradoM3: number, id: string) => ({
    id, lineNo: 1, fecha: "2026-08-01", producido: 1, unidad: "m3", declaradoM3,
  });

  it("dice cuántas declaran y cuánto, cuando alguna declara", () => {
    const r = revisarCierre({
      ...base,
      corridasSinOrigen: 3,
      corridasSinOrigenDetalle: [corrida(27.52, "a"), corrida(67.69, "b"), corrida(0, "c")],
    });
    const obs = r.observaciones.find((o) => o.includes("sin materia prima"));
    expect(obs).toContain("3 corridas sin materia prima atribuida");
    expect(obs).toContain("2 declaran 95.21 m³ de entrada sin una sola troza");
  });

  it("no inventa la frase cuando ninguna declara entrada", () => {
    const r = revisarCierre({
      ...base,
      corridasSinOrigen: 2,
      corridasSinOrigenDetalle: [corrida(0, "a"), corrida(0, "b")],
    });
    const obs = r.observaciones.find((o) => o.includes("sin materia prima"));
    expect(obs).toContain("2 corridas sin materia prima atribuida");
    expect(obs).not.toContain("declaran");
  });

  it("sin detalle (respuesta vieja cacheada) no rompe ni miente", () => {
    const r = revisarCierre({ ...base, corridasSinOrigen: 4 });
    const obs = r.observaciones.find((o) => o.includes("sin materia prima"));
    expect(obs).toContain("4 corridas sin materia prima atribuida");
    expect(obs).not.toContain("declaran");
  });
});
