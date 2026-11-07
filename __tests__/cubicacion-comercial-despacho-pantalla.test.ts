/**
 * ADR-483 §8-A · la pantalla de «Cubicación comercial» del despacho: lo que se
 * ve antes de guardar es lo que el servidor va a calcular, y el cuerpo del POST
 * no lleva nada que el servidor no deba recibir.
 *   - el PT que se cobra lo pone la persona: el m³ del libro nunca se vuelve PT
 *     solo; «≈ desde el libro» usa el PT del libro y, si no hay, m³ × 424 rotulado;
 *   - descuentos: por especie (− PT, %) y general, con las mismas funciones del servidor;
 *   - «Uno por uno» manda `cubicacionRefId` y NO manda piezas.
 */
import { describe, expect, it } from "vitest";
import {
  aDescuentoLote, cuerpoComercial, leerNumero, lineasDelLibro, sugerirPt, vistaComercial,
} from "@/components/admin/forestal/hooks/use-cubicacion-comercial-despacho";
import { guardarAserradaSchema } from "@/lib/forestal/cubicacion-comercial-tipos";
import { ultimosPrecios, urlAdelantosAbiertos, type CubicacionTrozas } from "@/components/admin/forestal/hooks/use-cubicaciones-trozas";

const libro = [
  { id: "a", especie: "Tornillo", m3: 2, piezas: 40, ptLibro: null },
  { id: "b", especie: "tornillo ", m3: 0.5, piezas: 10, ptLibro: null },
  { id: "c", especie: "Cumala", m3: 1, piezas: null, ptLibro: 400 },
];

describe("lo que dice el libro", () => {
  it("una línea por especie, m³ y piezas sumados, PT vacío", () => {
    const l = lineasDelLibro(libro);
    expect(l.map((x) => [x.especie, x.m3, x.piezas, x.pt])).toEqual([
      ["Tornillo", "2,5", "50", ""],
      ["Cumala", "1", "", ""],
    ]);
  });
  it("«≈ desde el libro»: el PT del libro si lo tiene; si no, m³ × 424 rotulado «sugerido»", () => {
    const [tornillo, cumala] = lineasDelLibro(libro);
    expect(sugerirPt(cumala, libro)).toMatchObject({ pt: "400", de: "libro" });
    expect(sugerirPt(tornillo, libro)).toMatchObject({ pt: "1060", de: "sugerido" });
  });
  it("lee coma o punto; vacío y cero son «sin dato»", () => {
    expect(leerNumero("1 060,5")).toBe(1060.5);
    expect(leerNumero("2.5")).toBe(2.5);
    expect(leerNumero("")).toBeNull();
    expect(leerNumero("0")).toBeNull();
  });
});

describe("descuentos y vista previa", () => {
  it("sin descuentos → null; con descuentos sólo lo tipeado", () => {
    expect(aDescuentoLote({ pct: "", porEspecie: { tornillo: { pct: "", menos: "" } } })).toBeNull();
    expect(aDescuentoLote({ pct: "2", porEspecie: { tornillo: { pct: "5", menos: "50" }, cumala: { pct: "", menos: "" } } })).toEqual({
      pct: 2,
      porEspecie: [{ clave: "tornillo", pct: 5, menos: 50 }],
    });
  });
  it("bruto → − PT → % de la especie → % general", () => {
    const v = vistaComercial([{ especie: "Tornillo", volumen: 1000 }], "total", { pct: 2, porEspecie: [{ clave: "tornillo", pct: 5, menos: 50 }] });
    expect(v && "neto" in v ? [v.bruto, v.neto] : v).toEqual([1000, 884.45]);
  });
  it("un − PT mayor que la especie no se acepta (lo mismo que dirá el servidor)", () => {
    const v = vistaComercial([{ especie: "Tornillo", volumen: 100 }], "total", { porEspecie: [{ clave: "tornillo", menos: 150 }] });
    expect(v && "error" in v).toBe(true);
  });
});

describe("el cuerpo del POST", () => {
  const base = {
    despachoId: "desp-1", refId: "kv-1", descuentos: null, persona: { beneficiarioId: "b-1", parteId: null },
    sentido: "venta" as const, fecha: "2026-10-02", notas: "",
  };
  it("«Uno por uno» manda la guardada, no las piezas, y pasa el schema del servidor", () => {
    const c = cuerpoComercial({ ...base, modo: "pieza", lineas: lineasDelLibro(libro) });
    expect(c).toMatchObject({ material: "aserrada", modo: "pieza", origen: "despacho", origenId: "desp-1", cubicacionRefId: "kv-1" });
    expect("piezas" in c || "lineas" in c).toBe(false);
    expect(guardarAserradaSchema.safeParse(c).success).toBe(true);
  });
  it("«Rápida» manda sólo las líneas con PT; el m³ va como dato, no como PT", () => {
    const [tornillo, cumala] = lineasDelLibro(libro);
    const c = cuerpoComercial({ ...base, modo: "total", lineas: [{ ...tornillo, pt: "1 000" }, cumala] });
    expect(c.lineas).toEqual([{ especie: "Tornillo", pt: 1000, m3: 2.5, piezas: 50 }]);
    expect(guardarAserradaSchema.safeParse(c).success).toBe(true);
  });
});

describe("último precio de la aserrada", () => {
  it("el PT de la aserrada (tablar) no se mezcla con el de la rolliza Oxapampina", () => {
    const cub = (formula: string, precio: number) =>
      ({ id: formula, codigo: formula, formula, fecha: "2026-10-05", estado: "aplicada", porEspecie: [{ clave: "tornillo", nombre: "Tornillo", n: 1, volumen: 1, precio, monto: precio }] }) as unknown as CubicacionTrozas;
    expect(ultimosPrecios([cub("oxapampina", 1.2), cub("tablar", 3.5)], "tablar")).toEqual({ tornillo: 3.5 });
  });
});

describe("de qué adelantos se descuenta (C-V, 08-10)", () => {
  it("vender pide los RECIBIDO y comprar los DADO: sin `direccion` el GET sólo trae DADO", () => {
    expect(urlAdelantosAbiertos("b 1", "venta")).toBe("/api/adelantos?beneficiarioId=b%201&direccion=RECIBIDO");
    expect(urlAdelantosAbiertos("b1", "compra")).toBe("/api/adelantos?beneficiarioId=b1&direccion=DADO");
  });
});
