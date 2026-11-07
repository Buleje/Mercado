/**
 * Un lote, un permiso (ADR-393).
 *
 * Un lote de aserrío se declara ANTES de llenarse: primero se dice qué se va a
 * aserrar y después se eligen las piezas. Faltaba un filtro — el título
 * habilitante. Con dos permisos en un mismo lote, la corrida que sale no puede
 * decir de qué título salió su madera, y esa ambigüedad se arrastra hasta el
 * certificado.
 *
 * Lo que estos casos protegen es el equilibrio: filtrar de más rompe los lotes
 * viejos, filtrar de menos deja pasar la mezcla.
 */

import { describe, it, expect } from "vitest";
import { disponiblePorEspecie, disponiblePorPermiso, trozasDelLote } from "@/lib/forestal/lote-programacion";

const A = "19-SEC/REG-PLT-2026-032";
const B = "25-PUC/REG-CON-2025-011";

const troza = (over: Record<string, unknown> = {}) =>
  ({
    id: "t1",
    especieComun: "TORNILLO",
    especieCientifica: "Cedrelinga cateniformis",
    volumenM3: 1,
    permiso: A,
    loteAserrioId: null,
    consumidaEnId: null,
    guiaRecepcionada: true,
    ...over,
  }) as never;

const lote = (over: Record<string, unknown> = {}) =>
  ({ id: "L1", speciesCommon: "TORNILLO", ...over }) as never;

describe("trozasDelLote — el permiso del lote manda", () => {
  const patio = [
    troza({ id: "a1", permiso: A }),
    troza({ id: "a2", permiso: A }),
    troza({ id: "b1", permiso: B }),
    troza({ id: "sin", permiso: null }),
  ];

  it("un lote con permiso sólo toma madera de ESE permiso", () => {
    const r = trozasDelLote(patio, lote({ permiso: A }));
    expect(r.map((t) => (t as { id: string }).id)).toEqual(["a1", "a2"]);
  });

  it("sin permiso declarado se comporta como siempre (no rompe lo viejo)", () => {
    const r = trozasDelLote(patio, lote({ permiso: null }));
    expect(r).toHaveLength(4);
  });

  it("una pieza YA en el lote se sigue viendo aunque su permiso no coincida", () => {
    // Un lote armado antes de la regla puede tener mezcla: hay que poder verla
    // para sacarla, no esconderla.
    const conMezcla = [...patio, troza({ id: "vieja", permiso: B, loteAserrioId: "L1" })];
    const r = trozasDelLote(conMezcla, lote({ permiso: A }));
    expect(r.map((t) => (t as { id: string }).id)).toContain("vieja");
  });

  it("la madera sin permiso NO entra a un lote que declaró uno", () => {
    const r = trozasDelLote(patio, lote({ permiso: A }));
    expect(r.map((t) => (t as { id: string }).id)).not.toContain("sin");
  });

  it("el permiso no aturde los filtros que ya existían", () => {
    const conBasura = [
      ...patio,
      troza({ id: "otra-especie", especieComun: "CAPIRONA", permiso: A }),
      troza({ id: "consumida", permiso: A, consumidaEnId: "c1" }),
      troza({ id: "sin-recibir", permiso: A, guiaRecepcionada: false }),
    ];
    const ids = trozasDelLote(conBasura, lote({ permiso: A })).map((t) => (t as { id: string }).id);
    expect(ids).toEqual(["a1", "a2"]);
  });
});

describe("lo que ofrece el modal al armar el lote", () => {
  const patio = [
    troza({ id: "a1", permiso: A, volumenM3: 2 }),
    troza({ id: "a2", permiso: A, especieComun: "CAPIRONA", volumenM3: 1 }),
    troza({ id: "b1", permiso: B, volumenM3: 5 }),
    troza({ id: "sin", permiso: null, especieComun: "LUPUNA", volumenM3: 3 }),
  ];

  it("lista los permisos del patio con lo que hay de cada uno", () => {
    const r = disponiblePorPermiso(patio);
    expect(r.map((p) => p.permiso)).toEqual([B, A]); // ordenado por volumen
    const a = r.find((p) => p.permiso === A);
    expect(a?.piezas).toBe(2);
    expect(a?.volumen).toBe(3);
    expect(a?.especies).toBe(2);
  });

  it("la madera sin permiso no inventa un título", () => {
    expect(disponiblePorPermiso(patio).some((p) => !p.permiso)).toBe(false);
  });

  it("elegido un permiso, las especies se acotan a ese", () => {
    const todas = disponiblePorEspecie(patio).map((e) => e.nombre).sort();
    expect(todas).toEqual(["CAPIRONA", "LUPUNA", "TORNILLO"]);
    const soloA = disponiblePorEspecie(patio, A).map((e) => e.nombre).sort();
    expect(soloA).toEqual(["CAPIRONA", "TORNILLO"]);
    const soloB = disponiblePorEspecie(patio, B).map((e) => e.nombre);
    expect(soloB).toEqual(["TORNILLO"]);
  });

  it("«todos los permisos» sigue mostrando el patio entero", () => {
    expect(disponiblePorEspecie(patio, null)).toHaveLength(3);
    expect(disponiblePorEspecie(patio, "")).toHaveLength(3);
  });
});
