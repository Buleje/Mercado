import { describe, expect, it } from "vitest";
import {
  armarMargen, compraDesdeCuentas, comprasQueCalzan, margenDelCamion, precioEscrito, rendimientoDelCruce, ventaDelCamion,
  type ComercialParaMargen, type GuardadaParaMargen,
} from "@/lib/forestal/cubicacion-margen";
import type { CruceConGuia, FilaDelCruce } from "@/lib/forestal/cubicacion-rendimiento-guia";

const G: GuardadaParaMargen = { id: "cub-1", gtfNumber: "001-0000120", valor: 4600, pt: 2000 };

const com = (o: Partial<ComercialParaMargen> & Pick<ComercialParaMargen, "id">): ComercialParaMargen => ({
  codigo: `CUB-${o.id}`, fecha: "2026-10-24", sentido: "compra", estado: "aplicada", material: "aserrada", formula: "tablar",
  unidad: "PT", volumen: 2000, monto: 3600, gtfNumber: null, parteId: "ccnn", personaNombre: "CCNN QA", cubicacionRefId: null, ...o,
});

const cruce = (tipo: CruceConGuia["tipo"], rendimientoPct: number | null): CruceConGuia => {
  const total = { rendimientoPct } as FilaDelCruce;
  return { tipo, filas: [], total };
};

describe("ventaDelCamion", () => {
  it("usa el monto de la venta valorizada en la cuenta (la base), no el valor del cubicador", () => {
    const v = ventaDelCamion(G, [com({ id: "v", sentido: "venta", monto: 5000, volumen: 2000, cubicacionRefId: "cub-1" })]);
    expect(v).toMatchObject({ ok: true, venta: { fuente: "cuenta", porPt: 2.5, pt: 2000, total: 5000 } });
  });
  it("sin valorizar (borrador) cae al valor de la guardada y lo dice", () => {
    const v = ventaDelCamion(G, [com({ id: "v", sentido: "venta", estado: "borrador", monto: null, cubicacionRefId: "cub-1" })]);
    expect(v).toMatchObject({ ok: true, venta: { fuente: "cubicador", porPt: 2.3, cub: { id: "v" } } });
  });
  it("una anulada no cuenta; sin precio en ningún lado dice qué falta", () => {
    const v = ventaDelCamion({ ...G, valor: 0 }, [com({ id: "v", sentido: "venta", estado: "anulada", cubicacionRefId: "cub-1" })]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.falta).toMatch(/Falta el precio de venta/);
  });
});

describe("comprasQueCalzan", () => {
  it("primero la compra del MISMO lote", () => {
    const r = comprasQueCalzan(G, [com({ id: "a", cubicacionRefId: "cub-1" })], [com({ id: "b", gtfNumber: "001-0000120" })], "ccnn");
    expect(r?.origen).toBe("lote");
    expect(r?.cubs.map((c) => c.id)).toEqual(["a"]);
  });
  it("si no, las de la comunidad con la misma GTF (un N° corto calza con el completo)", () => {
    const r = comprasQueCalzan(G, [], [com({ id: "b", gtfNumber: "120" }), com({ id: "c", gtfNumber: "001-0000121" })], "ccnn");
    expect(r?.origen).toBe("guia");
    expect(r?.cubs.map((c) => c.id)).toEqual(["b"]);
  });
  it("de otra persona, anulada o de venta no calza", () => {
    const r = comprasQueCalzan(G, [], [
      com({ id: "x", gtfNumber: "001-0000120", parteId: "otra" }),
      com({ id: "y", gtfNumber: "001-0000120", estado: "anulada" }),
      com({ id: "z", gtfNumber: "001-0000120", sentido: "venta" }),
    ], "ccnn");
    expect(r).toBeNull();
  });
});

describe("compraDesdeCuentas", () => {
  it("aserrada en PT: directa", () => {
    const r = compraDesdeCuentas([com({ id: "a", monto: 3600, volumen: 2000 })], "guia", { falta: "x" });
    expect(r).toMatchObject({ ok: true, compra: { porPt: 1.8, conversion: { tipo: "directa" } } });
  });
  it("troza en m³: se convierte con el rendimiento de la GTF (derivado)", () => {
    /* 10 m³ a S/ 400 = S/ 4.000; 56,9 % → 5,69 m³ = 2.412,56 PT → S/ 1,658 por PT. */
    const r = compraDesdeCuentas([com({ id: "t", material: "troza", formula: "smalian", unidad: "m³", volumen: 10, monto: 4000 })], "guia", { pct: 56.9, gtf: "001-0000120" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.compra.conversion).toEqual({ tipo: "rendimiento", porM3: 400, pct: 56.9, gtf: "001-0000120" });
      expect(r.compra.porPt).toBeCloseTo(4000 / (10 * 0.569 * 424), 6);
    }
  });
  it("troza en m³ sin rendimiento: dice qué falta, no inventa un cero", () => {
    const r = compraDesdeCuentas([com({ id: "t", material: "troza", formula: "smalian", unidad: "m³", volumen: 10 })], "guia", { falta: "falta el rendimiento: esta cubicación no tiene GTF" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.falta).toMatch(/no tiene GTF/);
  });
  it("Oxapampina (PT de troza): PT con PT", () => {
    const r = compraDesdeCuentas([com({ id: "o", material: "troza", formula: "oxapampina", unidad: "PT", volumen: 305, monto: 366 })], "elegida", { falta: "x" });
    expect(r).toMatchObject({ ok: true, compra: { porPt: 1.2, conversion: { tipo: "oxapampina" } } });
  });
  it("sin valorizar o mezclando m³ y PT: no hay precio", () => {
    expect(compraDesdeCuentas([com({ id: "a", monto: null })], "guia", { falta: "x" }).ok).toBe(false);
    expect(compraDesdeCuentas([com({ id: "a" }), com({ id: "b", unidad: "m³", material: "troza", formula: "smalian" })], "guia", { pct: 50, gtf: "1" }).ok).toBe(false);
  });
  it("varias compras de la misma guía se suman", () => {
    const r = compraDesdeCuentas([com({ id: "a", monto: 1000, volumen: 500 }), com({ id: "b", monto: 2600, volumen: 1500 })], "guia", { falta: "x" });
    expect(r).toMatchObject({ ok: true, compra: { porPt: 1.8, monto: 3600, volumen: 2000 } });
  });
});

describe("margenDelCamion", () => {
  it("el ejemplo de Brandon: 1,80 → 2,50 = 0,70 por PT, 1.400 el camión de 2.000 PT, 28 %", () => {
    expect(margenDelCamion({ porPt: 2.5, pt: 2000, total: 5000 }, { porPt: 1.8 })).toEqual({
      porPt: 0.7, camion: 1400, pct: 28, pt: 2000, ventaTotal: 5000, compraTotal: 3600,
    });
  });
  it("pierde: margen negativo", () => {
    const m = margenDelCamion({ porPt: 1.5, pt: 100, total: 150 }, { porPt: 1.8 });
    expect(m.camion).toBe(-30);
    expect(m.porPt).toBe(-0.3);
  });
});

describe("rendimientoDelCruce y precioEscrito", () => {
  it("sólo una guía de troza con m³ y ≤ 100 % sirve para convertir", () => {
    expect(rendimientoDelCruce("1", cruce("trozas", 56.9))).toMatchObject({ pct: 56.9, gtf: "1" });
    expect(rendimientoDelCruce("1", cruce("producto", 56.9))).toHaveProperty("falta");
    expect(rendimientoDelCruce("1", cruce("trozas", null))).toHaveProperty("falta");
    expect(rendimientoDelCruce("1", cruce("trozas", 120))).toHaveProperty("falta");
  });
  it("lee coma o punto; rechaza vacío, cero y basura", () => {
    expect(precioEscrito("1,80")).toBe(1.8);
    expect(precioEscrito(" 2.5 ")).toBe(2.5);
    expect(precioEscrito("")).toBeNull();
    expect(precioEscrito("0")).toBeNull();
    expect(precioEscrito("-1")).toBeNull();
    expect(precioEscrito("1,8x")).toBeNull();
  });
});

describe("armarMargen", () => {
  const venta = com({ id: "v", sentido: "venta", monto: 5000, volumen: 2000, cubicacionRefId: "cub-1", parteId: "comprador" });
  const base = { guardada: G, deLaRef: [venta], comunidadParteId: "ccnn", precioAMano: "", rendimiento: { falta: "x" } } as const;

  it("sin compra que calce: compra null, y las de la comunidad para elegir", () => {
    const m = armarMargen({ ...base, deLaComunidad: [com({ id: "b", gtfNumber: "999" })], eleccion: "" });
    expect(m.compra).toBeNull();
    expect(m.margen).toBeNull();
    expect(m.candidatas.map((c) => c.id)).toEqual(["b"]);
  });
  it("elegida a mano de la lista o precio escrito → margen", () => {
    const elegida = armarMargen({ ...base, deLaComunidad: [com({ id: "b", gtfNumber: "999" })], eleccion: "b" });
    expect(elegida.margen?.camion).toBe(1400);
    const aMano = armarMargen({ ...base, deLaComunidad: [], eleccion: "mano", precioAMano: "2,00" });
    expect(aMano.compra).toMatchObject({ ok: true, compra: { origen: "a-mano", porPt: 2 } });
    expect(aMano.margen?.camion).toBe(1000);
    expect(armarMargen({ ...base, deLaComunidad: [], eleccion: "mano", precioAMano: "" }).compra?.ok).toBe(false);
  });
  it("la venta del comprador no aparece entre las compras para elegir", () => {
    const m = armarMargen({ ...base, comunidadParteId: undefined, deLaComunidad: [venta], eleccion: "" });
    expect(m.candidatas).toEqual([]);
  });
});

describe("revisión 24-10", () => {
  it("GTF en 2 camiones: el rendimiento suma las dos guardadas (compra ≈ 1,50 por PT, nunca 3,00)", async () => {
    const { cruzarConGuia, piezasDeLaMismaGuia } = await import("@/lib/forestal/cubicacion-rendimiento-guia");
    const guia = { tipo: "trozas" as const, m3Total: 20, volumenPorEspecie: [{ especie: "TORNILLO", m3: 20, piezas: 40 }] };
    const camion = (id: string) => ({ id, gtfNumber: "001-0000120", especie: "Tornillo", piezas: [{ pieTablar: 2000 }] });
    const juntas = piezasDeLaMismaGuia(camion("a"), [camion("b"), { ...camion("c"), gtfNumber: "001-0000999" }]);
    expect(juntas.cubicaciones.map((x) => x.id)).toEqual(["a", "b"]);
    const rend = rendimientoDelCruce("001-0000120", cruzarConGuia(guia, juntas.piezas), juntas.cubicaciones.length);
    const compra = compraDesdeCuentas([com({ id: "t", material: "troza", formula: "smalian", unidad: "m³", volumen: 20, monto: 6000 })], "guia", rend);
    expect(compra.ok && compra.compra.porPt).toBeCloseTo(1.5, 2);
    const m = margenDelCamion({ porPt: 2.5, pt: 2000, total: 5000 }, compra.ok ? compra.compra : { porPt: 0 });
    expect(m.camion).toBeCloseTo(2000, 0);
  });

  it("compra del mismo lote: el costo del camión es su monto de la base, no PT vendidos × precio", () => {
    const compra = compraDesdeCuentas([com({ id: "l", cubicacionRefId: "cub-1", volumen: 2000, monto: 3000 })], "lote", { falta: "x" });
    const m = margenDelCamion({ porPt: 2.5, pt: 1900, total: 4750 }, compra.ok ? compra.compra : { porPt: 0 });
    expect(m.compraTotal).toBe(3000);
    expect(m.camion).toBe(1750);
  });

  it("sin la comunidad en la ficha, no se elige sola la compra de otra persona con la misma GTF", () => {
    expect(comprasQueCalzan(G, [], [com({ id: "otro", gtfNumber: "001-0000120", parteId: "otra" })], undefined)).toBeNull();
  });

  it("una compra guardada sólo con el beneficiario de la comunidad (parteId null) sí calza", () => {
    const r = comprasQueCalzan(G, [], [com({ id: "b", gtfNumber: "001-0000120", parteId: null })], "ccnn");
    expect(r?.cubs.map((c) => c.id)).toEqual(["b"]);
  });
});
