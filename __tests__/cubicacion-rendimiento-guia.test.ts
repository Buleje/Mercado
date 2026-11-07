import { describe, expect, it } from "vitest";
import { cruzarConGuia, resumirVolumenDeGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";

describe("resumirVolumenDeGuia", () => {
  it("suma por especie sin distinguir mayúsculas y redondea una vez", () => {
    const r = resumirVolumenDeGuia("trozas", [
      { species: "TORNILLO", volumeM3: 0.7104, pieces: 1 },
      { species: "Tornillo", volumeM3: 0.7104 },
      { species: "Cedro", volumeM3: "0.5", pieces: 2 },
    ]);
    expect(r.volumenPorEspecie).toEqual([
      { especie: "TORNILLO", m3: 1.421, piezas: 2 },
      { especie: "Cedro", m3: 0.5, piezas: 2 },
    ]);
    expect(r.m3Total).toBe(1.921);
  });
});

describe("cruzarConGuia", () => {
  const guia = (m3: number, especie = "TORNILLO") => ({ tipo: "trozas" as const, m3Total: m3, volumenPorEspecie: [{ especie, m3, piezas: 1 }] });

  it("troza parejo: 3.200 PT de 15,2 m³ = 49,7 %", () => {
    const c = cruzarConGuia(guia(15.2), [{ especie: "Tornillo", pieTablar: 3200 }]);
    expect(c.total.rendimientoPct).toBe(49.7);
    expect(c.total.m3Cubicado).toBe(7.547);
    expect(c.total.veredicto).toBe("bajo");
    expect(c.filas).toHaveLength(1);
  });

  it("alcanza la meta: 56 % o más es bueno", () => {
    const c = cruzarConGuia(guia(10), [{ especie: "tornillo", pieTablar: 2400 }]);
    expect(c.total.rendimientoPct).toBe(56.6);
    expect(c.total.veredicto).toBe("bueno");
  });

  it("dos especies: cada una con su rendimiento y el total junto", () => {
    const g = { tipo: "trozas" as const, m3Total: 20, volumenPorEspecie: [{ especie: "Tornillo", m3: 10, piezas: 5 }, { especie: "Cedro", m3: 10, piezas: 5 }] };
    const c = cruzarConGuia(g, [{ especie: "TORNILLO", pieTablar: 2544 }, { especie: "Cedro", pieTablar: 1060 }]);
    const por = Object.fromEntries(c.filas.map((f) => [f.especie, f.rendimientoPct]));
    expect(por).toEqual({ Tornillo: 60, Cedro: 25 });
    expect(c.total.rendimientoPct).toBe(42.5);
  });

  it("especie sólo en la guía: sin piezas, marcada; y sólo en la cubicación: sin %", () => {
    const g = { tipo: "trozas" as const, m3Total: 8, volumenPorEspecie: [{ especie: "Cedro", m3: 8, piezas: 3 }] };
    const c = cruzarConGuia(g, [{ especie: "Capirona", pieTablar: 424 }]);
    const cedro = c.filas.find((f) => f.especie === "Cedro")!;
    const capi = c.filas.find((f) => f.especie === "Capirona")!;
    expect(cedro.soloEnGuia).toBe(true);
    expect(cedro.pt).toBe(0);
    expect(capi.soloEnCubicacion).toBe(true);
    expect(capi.rendimientoPct).toBeNull();
  });

  it("troza: lo cubicado de una especie que no vino en la guía no sube el rendimiento", () => {
    const c = cruzarConGuia(guia(10), [{ especie: "Tornillo", pieTablar: 2400 }, { especie: "Cedro", pieTablar: 500 }]);
    expect(c.total.pt).toBe(2400);
    expect(c.total.rendimientoPct).toBe(56.6);
  });

  it("aserrada: diferencia con signo en m³ y PT", () => {
    const g = { tipo: "producto" as const, m3Total: 10, volumenPorEspecie: [{ especie: "Tornillo", m3: 10, piezas: 40 }] };
    const c = cruzarConGuia(g, [{ especie: "Tornillo", pieTablar: 4000 }]);
    expect(c.total.m3Cubicado).toBe(9.434);
    expect(c.total.difM3).toBe(-0.566);
    expect(c.total.difPt).toBe(-240);
    const justo = cruzarConGuia(g, [{ especie: "Tornillo", pieTablar: 4240 }]);
    expect(justo.total.difM3).toBe(0);
    expect(justo.total.difPt).toBe(0);
  });

  it("guía con 0 m³: no divide por cero", () => {
    const c = cruzarConGuia(guia(0), [{ especie: "Tornillo", pieTablar: 100 }]);
    expect(c.total.rendimientoPct).toBeNull();
    expect(c.total.veredicto).toBeNull();
    expect(Number.isFinite(c.total.difM3)).toBe(true);
  });

  it("piezas sin especie usan la del lote", () => {
    const c = cruzarConGuia(guia(10), [{ pieTablar: 2400 }], "Tornillo");
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0].rendimientoPct).toBe(56.6);
  });
});
