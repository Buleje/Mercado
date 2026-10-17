/**
 * Resumen de lo que hay parado en una zona de la planta.
 *
 * Lo que se blinda: que NUNCA se sumen dos unidades distintas. Las trozas van
 * en m³ y la producción puede venir en pies tablares; un total que las mezcle
 * es un número sin significado que igual se va a leer como si lo tuviera. Y que
 * el desglose por especie sea el correcto: es el que decide si un pedido de
 * shihuahuaco se puede cumplir con lo que hay en el patio.
 */
import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/forestal/planta-zona-types";
import {
  fmtSubtotales,
  normalizarUnidad,
  resumirItems,
} from "@/lib/forestal/planta-resumen";

const it_ = (over: Partial<Item> & Pick<Item, "id" | "kind">): Item => ({
  label: over.id, sub: null, cantidad: 0, unidad: "m³", cites: false, ...over,
});

describe("unidades", () => {
  it("m3 y m³ son la misma unidad", () => {
    expect(normalizarUnidad("m3")).toBe("m³");
    expect(normalizarUnidad(" M3 ")).toBe("m³");
    expect(normalizarUnidad("m³")).toBe("m³");
  });

  it("sin unidad cuenta como «u», no como vacío", () => {
    expect(normalizarUnidad(null)).toBe("u");
    expect(normalizarUnidad("")).toBe("u");
  });
});

describe("resumen por tipo", () => {
  it("suma dentro de la misma unidad", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "troza", cantidad: 10, unidad: "m3" }),
      it_({ id: "b", kind: "troza", cantidad: 5.5, unidad: "m³" }),
    ]);
    expect(r.porKind).toHaveLength(1);
    expect(r.porKind[0].subtotales).toEqual([{ unidad: "m³", cantidad: 15.5, lineas: 2 }]);
  });

  it("⭐ NO suma unidades distintas: cada una lleva su subtotal", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "producto", cantidad: 12, unidad: "m3" }),
      it_({ id: "b", kind: "producto", cantidad: 1200, unidad: "pt" }),
    ]);
    const subs = r.porKind[0].subtotales;
    expect(subs).toHaveLength(2);
    expect(subs.find((s) => s.unidad === "m³")?.cantidad).toBe(12);
    expect(subs.find((s) => s.unidad === "pt")?.cantidad).toBe(1200);
  });

  it("los m³ van primero: es la unidad del libro", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "producto", cantidad: 500, unidad: "pt" }),
      it_({ id: "b", kind: "producto", cantidad: 3, unidad: "m3" }),
    ]);
    expect(r.porKind[0].subtotales.map((s) => s.unidad)).toEqual(["m³", "pt"]);
  });

  it("los tipos salen en el orden del flujo, no en el de llegada", () => {
    const r = resumirItems([
      it_({ id: "d", kind: "despacho", cantidad: 1 }),
      it_({ id: "p", kind: "producto", cantidad: 1 }),
      it_({ id: "t", kind: "troza", cantidad: 1 }),
    ]);
    expect(r.porKind.map((k) => k.kind)).toEqual(["troza", "producto", "despacho"]);
  });
});

describe("desglose por especie", () => {
  it("agrupa por especie y ordena por volumen descendente", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "troza", cantidad: 5, sub: "Tornillo" }),
      it_({ id: "b", kind: "troza", cantidad: 30, sub: "Shihuahuaco" }),
      it_({ id: "c", kind: "troza", cantidad: 7, sub: "Tornillo" }),
    ]);
    expect(r.porEspecie.map((e) => e.especie)).toEqual(["Shihuahuaco", "Tornillo"]);
    expect(r.porEspecie[1].subtotales[0].cantidad).toBe(12);
    expect(r.porEspecie[1].lineas).toBe(2);
  });

  it("una especie con dos unidades no las mezcla", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "troza", cantidad: 8, unidad: "m3", sub: "Tornillo" }),
      it_({ id: "b", kind: "producto", cantidad: 900, unidad: "pt", sub: "Tornillo" }),
    ]);
    expect(r.porEspecie).toHaveLength(1);
    expect(r.porEspecie[0].subtotales).toEqual([
      { unidad: "m³", cantidad: 8, lineas: 1 },
      { unidad: "pt", cantidad: 900, lineas: 1 },
    ]);
  });

  it("«Sin especie» va SIEMPRE último aunque pese más", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "troza", cantidad: 999, sub: null }),
      it_({ id: "b", kind: "troza", cantidad: 2, sub: "Capirona" }),
    ]);
    expect(r.porEspecie.map((e) => e.especie)).toEqual(["Capirona", "Sin especie"]);
  });

  it("una especie vacía o de puros espacios cae en «Sin especie»", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "troza", cantidad: 1, sub: "   " }),
      it_({ id: "b", kind: "troza", cantidad: 1, sub: "" }),
    ]);
    expect(r.porEspecie).toHaveLength(1);
    expect(r.porEspecie[0].especie).toBe("Sin especie");
    expect(r.porEspecie[0].lineas).toBe(2);
  });

  it("⭐ el despacho NO entra al desglose: ya salió de la zona", () => {
    const r = resumirItems([
      it_({ id: "t", kind: "troza", cantidad: 10, sub: "Tornillo" }),
      it_({ id: "d", kind: "despacho", cantidad: 4, sub: "Tornillo" }),
    ]);
    // cuenta en su tipo…
    expect(r.porKind.find((k) => k.kind === "despacho")?.subtotales[0].cantidad).toBe(4);
    // …pero lo que hay PARADO en la zona son 10, no 14.
    expect(r.porEspecie[0].subtotales[0].cantidad).toBe(10);
  });

  it("la especie se puede leer de otro campo", () => {
    const r = resumirItems(
      [it_({ id: "a", kind: "producto", cantidad: 3, sub: "Madera aserrada" })],
      () => "Cumala",
    );
    expect(r.porEspecie[0].especie).toBe("Cumala");
  });
});

describe("bordes", () => {
  it("sin ítems no inventa nada", () => {
    const r = resumirItems([]);
    expect(r).toEqual({ porKind: [], porEspecie: [], lineas: 0, cites: false });
  });

  it("marca CITES si cualquier línea lo es", () => {
    expect(resumirItems([it_({ id: "a", kind: "troza", cantidad: 1, cites: true })]).cites).toBe(true);
    expect(resumirItems([it_({ id: "a", kind: "troza", cantidad: 1 })]).cites).toBe(false);
  });

  it("una cantidad no numérica cuenta como 0 y no ensucia el total", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "troza", cantidad: Number.NaN }),
      it_({ id: "b", kind: "troza", cantidad: 4 }),
    ]);
    expect(r.porKind[0].subtotales[0].cantidad).toBe(4);
    expect(r.porKind[0].subtotales[0].lineas).toBe(2);
  });

  it("los decimales no arrastran error de coma flotante", () => {
    const r = resumirItems([
      it_({ id: "a", kind: "troza", cantidad: 0.1 }),
      it_({ id: "b", kind: "troza", cantidad: 0.2 }),
    ]);
    expect(r.porKind[0].subtotales[0].cantidad).toBe(0.3);
  });

  it("el formato une las unidades sin sumarlas", () => {
    expect(fmtSubtotales([
      { unidad: "m³", cantidad: 12.5, lineas: 1 },
      { unidad: "pt", cantidad: 1200, lineas: 1 },
    ])).toBe("12.5 m³ · 1,200 pt");
  });
});
