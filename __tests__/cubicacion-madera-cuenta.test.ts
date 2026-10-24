/**
 * El lote del Cubicador de madera a la cuenta de una persona: la vista previa
 * usa las MISMAS funciones que el servidor (PT y Zod de las piezas) y guardar
 * dos veces el mismo lote no crea otra cubicación (ni la cobra dos veces).
 */
import { describe, expect, it } from "vitest";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  cubicacionVigente, duenosDelLote, especieDeLaPieza, loteCambio, mezclarDelLote, personaSugerida,
  piezasDeMaderaParaCuenta, preciosParaAplicar, preciosSugeridosMadera, queHacerAlGuardar, valorizarConSugeridos, vistaPreviaMadera,
  type CubicacionDelLote,
} from "@/lib/forestal/cubicacion-madera-cuenta";
import { EspecieConVariosPreciosError, valorizar } from "@/lib/forestal/cubicacion-cuenta";
import { precioDePieza, type ContextoPrecio } from "@/lib/forestal/precio-de-pieza";

let n = 0;
const pieza = (p: Partial<PiezaCubicada> & Pick<PiezaCubicada, "cantidad" | "espesor" | "ancho" | "largo">): PiezaCubicada => ({
  id: `p${++n}`, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", pieTablar: 0, m3: 0, ...p,
});

/* 1"×12"×10' = 10 PT la pieza (×3 = 30) · 2"×6"×8' = 8 PT la pieza (×5 = 40) → 70 PT. */
const lote = (): PiezaCubicada[] => [
  pieza({ cantidad: 3, espesor: 1, ancho: 12, largo: 10, especie: "Tornillo" }),
  pieza({ cantidad: 5, espesor: 2, ancho: 6, largo: 8 }),
];

const cub = (c: Partial<CubicacionDelLote> & Pick<CubicacionDelLote, "id">): CubicacionDelLote => ({
  codigo: `CUB-2026-${c.id}`, estado: "borrador", sentido: "venta", version: 1, monto: null, personaNombre: "Juan", cubicacionRefId: "kv1", ...c,
});

describe("vista previa = lo que congela el servidor", () => {
  it("PT neto de las piezas y la especie del lote para las que no traen", () => {
    const v = vistaPreviaMadera(lote(), "Cumala");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.pt).toBeCloseTo(70, 6);
    expect(v.piezas).toBe(8);
    expect(piezasDeMaderaParaCuenta(lote(), "Cumala").map((p) => p.especie)).toEqual(["Tornillo", "Cumala"]);
  });

  it("sin especie propia ni del lote → «Sin especie» (igual que piezasDelRegistro)", () => {
    expect(especieDeLaPieza({ especie: "  " }, "  ")).toBe("Sin especie");
    expect(especieDeLaPieza({}, null)).toBe("Sin especie");
    expect(especieDeLaPieza({ especie: " Capirona " }, "Cumala")).toBe("Capirona");
  });

  it("una medida que el Zod del servidor rechaza nombra la pieza (antes del 422)", () => {
    const v = vistaPreviaMadera([...lote(), pieza({ cantidad: 2, espesor: 0, ancho: 6, largo: 8 })], "Cumala");
    expect(v).toMatchObject({ ok: false, pieza: 3 });
    expect(vistaPreviaMadera([], "Cumala")).toMatchObject({ ok: false, pieza: 0 });
  });
});

describe("precios sugeridos para «Valorizar»", () => {
  it("el precio por especie que el cubicador ya cobra; una especie con dos precios queda sin sugerir", () => {
    const rows = [...lote(), pieza({ cantidad: 1, espesor: 1, ancho: 12, largo: 10, especie: "Tornillo" })];
    const precios = new Map<string, number>([[rows[0].id, 2.5], [rows[1].id, 1.8], [rows[2].id, 3]]);
    const s = preciosSugeridosMadera(rows, "Cumala", (p) => precios.get(p.id) ?? 0, 2);
    expect(s.general).toBe(2);
    expect(s.porEspecie).toEqual({ cumala: 1.8 });
    expect(s.variosPrecios).toEqual({ tornillo: { nombre: "Tornillo", precios: [2.5, 3], sinPrecio: false } });
  });

  it("sin precio (0) no sugiere nada", () => {
    expect(preciosSugeridosMadera(lote(), "Cumala", () => 0, 0)).toEqual({ general: null, porEspecie: {}, variosPrecios: {} });
  });

  it("Cedro a S/ 5 y S/ 6 (dos tratos) queda marcada y NUNCA recibe el general; con su precio, sí hay monto", () => {
    const rows = [
      pieza({ cantidad: 3, espesor: 1, ancho: 12, largo: 10, especie: "Cedro" }),
      pieza({ cantidad: 5, espesor: 2, ancho: 6, largo: 8, especie: "Cedro" }),
    ];
    const precios = new Map<string, number>([[rows[0].id, 5], [rows[1].id, 6]]);
    const s = preciosSugeridosMadera(rows, null, (p) => precios.get(p.id) ?? 0, 3);
    expect(s.porEspecie).toEqual({});
    expect(s.variosPrecios.cedro).toEqual({ nombre: "Cedro", precios: [5, 6], sinPrecio: false });

    const v = vistaPreviaMadera(rows, null);
    if (!v.ok) throw new Error(v.mensaje);
    expect(valorizarConSugeridos(v.lineas, [], 3, s)).toEqual({ elegir: "Cedro" });
    expect(valorizarConSugeridos(v.lineas, [{ clave: "cedro", precio: 0 }], 3, s)).toEqual({ elegir: "Cedro" });
    expect(valorizarConSugeridos(v.lineas, [{ clave: "cedro", precio: 5 }], 3, s)).toMatchObject({ monto: 350 });
    /* Sin la marca (patio de trozas) sigue la regla de siempre: el general cubre. */
    expect(valorizarConSugeridos(v.lineas, [], 3, null)).toMatchObject({ monto: 210 });
  });

  it("sin general (null) o con general 0, Cedro 5/6 igual pide elegir (no «falta»)", () => {
    const rows = [
      pieza({ cantidad: 3, espesor: 1, ancho: 12, largo: 10, especie: "Cedro" }),
      pieza({ cantidad: 5, espesor: 2, ancho: 6, largo: 8, especie: "Cedro" }),
    ];
    const s = preciosSugeridosMadera(rows, null, (p) => (p.id === rows[0].id ? 5 : 6), 0);
    const v = vistaPreviaMadera(rows, null);
    if (!v.ok) throw new Error(v.mensaje);
    expect(valorizarConSugeridos(v.lineas, [], null, s)).toEqual({ elegir: "Cedro" });
    expect(valorizarConSugeridos(v.lineas, [], 0, s)).toEqual({ elegir: "Cedro" });
  });

  it("«Cédro» a mano y «Cedro» caen en la MISMA clave que el servidor: el precio a mano las separa (3 y 5) → marcada", () => {
    const rows = [
      pieza({ cantidad: 3, espesor: 1, ancho: 12, largo: 10, especie: "Cédro" }),
      pieza({ cantidad: 5, espesor: 2, ancho: 6, largo: 8, especie: "Cedro" }),
    ];
    /* El precio a mano busca la especie en minúsculas CON tilde: «cédro» no es «cedro» → va al general. */
    const ctx: ContextoPrecio = { modo: "manual", aMano: { general: 3, porEspecie: { cedro: "5" } }, fecha: "2026-10-15" };
    const s = preciosSugeridosMadera(rows, null, (p) => precioDePieza(p, ctx).precioPt, 3);
    expect(Object.keys(s.variosPrecios)).toEqual(["cedro"]);
    expect(s.variosPrecios.cedro.precios).toEqual([3, 5]);
    const v = vistaPreviaMadera(rows, null);
    if (!v.ok) throw new Error(v.mensaje);
    expect(v.lineas.map((l) => l.clave)).toEqual(["cedro"]);
    expect(valorizarConSugeridos(v.lineas, [], 3, s)).toHaveProperty("elegir");
  });

  it("aplicar: el general no viaja si cubriría a la marcada; las marcas viajan siempre; el servidor rechaza al que lo mande igual", () => {
    const rows = [
      pieza({ cantidad: 3, espesor: 1, ancho: 12, largo: 10, especie: "Cedro" }),
      pieza({ cantidad: 5, espesor: 2, ancho: 6, largo: 8, especie: "Tornillo" }),
      pieza({ cantidad: 2, espesor: 2, ancho: 6, largo: 8, especie: "Cedro" }),
    ];
    const s = preciosSugeridosMadera(rows, null, (p) => (p.id === rows[2].id ? 6 : 5), 3);
    const v = vistaPreviaMadera(rows, null);
    if (!v.ok) throw new Error(v.mensaje);
    const marcas = [{ clave: "cedro", cuantos: 2 }];
    expect(preciosParaAplicar(v.lineas, [], 3, s)).toEqual({ precios: [], especiesConVariosPrecios: marcas });
    expect(preciosParaAplicar(v.lineas, [{ clave: "cedro", precio: 6 }], 3, s)).toEqual({
      precios: [{ clave: "cedro", precio: 6 }], precioGeneral: 3, especiesConVariosPrecios: marcas,
    });
    /* Sin marca (patio de trozas): como siempre. */
    expect(preciosParaAplicar(v.lineas, [], 3, null)).toEqual({ precios: [], precioGeneral: 3 });
    /* La MISMA valorizar del servidor: con la marca, el general no cubre a Cedro. */
    expect(() => valorizar(v.lineas, [], 3, marcas)).toThrow(EspecieConVariosPreciosError);
    expect(valorizar(v.lineas, [{ clave: "cedro", precio: 6 }], 3, marcas).monto).toBeGreaterThan(0);
  });

  it("unas piezas con precio y otras sin precio también se marcan (el cubicador cobraba 0 a esas)", () => {
    const rows = lote().map((p) => ({ ...p, especie: "Cedro" }));
    const s = preciosSugeridosMadera(rows, null, (p) => (p.id === rows[0].id ? 5 : 0), 0);
    expect(s.variosPrecios.cedro).toEqual({ nombre: "Cedro", precios: [5], sinPrecio: true });
    expect(s.porEspecie).toEqual({});
  });
});

describe("la persona del lote", () => {
  const personas = [
    { clave: "b:1", nombre: "José Pérez", parteId: "pt1" },
    { clave: "b:2", nombre: "Ana Ruiz", parteId: null },
    { clave: "b:3", nombre: "Luis Soto", parteId: null },
    { clave: "b:4", nombre: "luis soto", parteId: null },
  ];

  it("dueño con ficha del Directorio en todas las piezas → esa persona", () => {
    const rows = lote().map((p) => ({ ...p, dueno: "Pepe", duenoParteId: "pt1" }));
    expect(personaSugerida(personas, rows, "otro")?.clave).toBe("b:1");
  });

  it("si no, el «cliente» escrito igual (sin tildes ni mayúsculas); dos con el mismo nombre → no adivina", () => {
    expect(personaSugerida(personas, lote(), "jose perez")?.clave).toBe("b:1");
    expect(personaSugerida(personas, lote(), "Luis Soto")).toBeNull();
    expect(personaSugerida(personas, lote().map((p) => ({ ...p, dueno: "ANA RUIZ" })), "")?.clave).toBe("b:2");
  });

  it("dueños distintos del lote, sin repetir por mayúsculas", () => {
    const rows = lote();
    rows[0].dueno = "Ana";
    rows[1].dueno = "ana ";
    expect(duenosDelLote(rows)).toEqual(["Ana"]);
    rows[1].dueno = "Luis";
    expect(duenosDelLote(rows)).toEqual(["Ana", "Luis"]);
  });
});

describe("guardar dos veces el mismo lote (idempotencia)", () => {
  it("sin nada → nueva; con borrador → actualiza ESA; ya descontada → frena (no se cobra dos veces)", () => {
    expect(queHacerAlGuardar([], "venta")).toEqual({ tipo: "nueva" });
    const b = cub({ id: "0001" });
    expect(queHacerAlGuardar([b], "venta")).toEqual({ tipo: "actualizar", cub: b });
    const a = cub({ id: "0002", estado: "aplicada", monto: 175 });
    expect(queHacerAlGuardar([a, b], "venta")).toEqual({ tipo: "cobrada", cub: a });
  });

  it("el borrador del despacho no se actualiza desde el cubicador (409 ORIGEN_DISTINTO): se avisa", () => {
    const delDespacho = cub({ id: "0011", origen: "despacho" });
    expect(queHacerAlGuardar([delDespacho], "venta")).toEqual({ tipo: "despacho", cub: delDespacho });
    const propio = cub({ id: "0012", origen: "libre" });
    expect(queHacerAlGuardar([delDespacho, propio], "venta")).toEqual({ tipo: "actualizar", cub: propio });
    expect(queHacerAlGuardar([cub({ id: "0013", origen: null })], "venta")).toMatchObject({ tipo: "actualizar" });
  });

  it("anulada no cuenta: se puede volver a guardar; el otro sentido (comprarla y venderla) sigue valiendo", () => {
    expect(queHacerAlGuardar([cub({ id: "0003", estado: "anulada" })], "venta")).toEqual({ tipo: "nueva" });
    expect(queHacerAlGuardar([cub({ id: "0004", estado: "aplicada" })], "compra")).toEqual({ tipo: "nueva" });
  });

  it("la lista vieja no deja crear otra: lo recién guardado (local) entra antes de que el servidor lo traiga", () => {
    const recien = cub({ id: "0005" });
    const delLote = mezclarDelLote([], [recien], new Set(), "kv1");
    expect(queHacerAlGuardar(delLote ?? [], "venta")).toEqual({ tipo: "actualizar", cub: recien });
  });

  it("gana la versión más nueva; lo borrado y lo de otro lote no cuentan; null = cargando", () => {
    const vieja = cub({ id: "0006", version: 1 });
    const aplicada = cub({ id: "0006", version: 2, estado: "aplicada" });
    expect(mezclarDelLote([vieja], [aplicada], new Set(), "kv1")).toEqual([aplicada]);
    expect(mezclarDelLote([aplicada], [vieja], new Set(), "kv1")).toEqual([aplicada]);
    expect(mezclarDelLote([vieja, cub({ id: "0007", cubicacionRefId: "kv2" })], [], new Set(["0006"]), "kv1")).toEqual([]);
    expect(mezclarDelLote(null, [], new Set(), "kv1")).toBeNull();
    expect(mezclarDelLote(null, [vieja], new Set(), null)).toEqual([]);
  });

  it("aplicar/anular no suben la versión: con la misma, manda el estado más avanzado", () => {
    const borrador = cub({ id: "0010", version: 2 });
    const aplicada = cub({ id: "0010", version: 2, estado: "aplicada", monto: 386.66 });
    const anulada = cub({ id: "0010", version: 2, estado: "anulada", monto: 386.66 });
    expect(mezclarDelLote([aplicada], [borrador], new Set(), "kv1")).toEqual([aplicada]);
    expect(mezclarDelLote([aplicada], [anulada], new Set(), "kv1")).toEqual([anulada]);
    expect(queHacerAlGuardar(mezclarDelLote([aplicada], [borrador], new Set(), "kv1") ?? [], "venta")).toMatchObject({ tipo: "cobrada" });
  });

  it("el lote cambió después de guardar el borrador: otro PT u otras piezas", () => {
    const v = vistaPreviaMadera(lote(), "Cumala");
    expect(loteCambio(v, { volumen: 70, nTrozas: 8 })).toBe(false);
    expect(loteCambio(v, { volumen: 70.0001, nTrozas: 8 })).toBe(false);
    expect(loteCambio(v, { volumen: 60, nTrozas: 8 })).toBe(true);
    expect(loteCambio(v, { volumen: 70, nTrozas: 9 })).toBe(true);
    expect(loteCambio(vistaPreviaMadera([], "Cumala"), { volumen: 70, nTrozas: 8 })).toBe(true);
  });

  it("la vigente es la primera no anulada", () => {
    expect(cubicacionVigente([cub({ id: "0008", estado: "anulada" }), cub({ id: "0009" })])?.id).toBe("0009");
    expect(cubicacionVigente(null)).toBeNull();
  });
});
