/**
 * «Venta desde una foto» (18-10): el emparejador puro del pedido escrito con
 * el catálogo (`lib/ventas/emparejar-pedido.ts`). Catálogo con los nombres
 * reales de `main` (bodega) para que los casos sean los de verdad.
 */
import { describe, expect, it } from "vitest";
import { candidatosPorTexto, cantidadValida, emparejarPedido, normalizarTexto, partir, type ProductoDelCatalogo } from "@/lib/ventas/emparejar-pedido";

const CATALOGO: ProductoDelCatalogo[] = [
  { id: 1252403, nombre: "Leche Gloria Entera 1L UHT", precio: 7.2, unidad: "caja", codigos: ["7751271011234"] },
  { id: 1252404, nombre: "Leche Evaporada Gloria 400ml", precio: 4.9, unidad: "lata" },
  { id: 1252382, nombre: "Arroz Costeño Extra 5kg", precio: 24.9, unidad: "bolsa" },
  { id: 1252387, nombre: "Lentejas Costeño 500g", precio: 4.9, unidad: "bolsa" },
  { id: 1252383, nombre: "Azúcar Rubia Cartavio 1kg", precio: 4.8, unidad: "bolsa", taxType: "exonerado" },
  { id: 1252384, nombre: "Aceite Primor Premium 1L", precio: 11.9, unidad: "botella" },
  { id: 1252394, nombre: "Inca Kola 1.5L", precio: 8.5, unidad: "botella" },
  { id: 1252395, nombre: "Coca-Cola 1.5L", precio: 8.5, unidad: "botella" },
  { id: 1252390, nombre: "Huevos La Calera x30", precio: 14.9, unidad: "bandeja" },
];

const linea = (textoLeido: string, cantidad = 1, precioLeido: number | null = null) => ({ textoLeido, cantidad, precioLeido });

describe("normalizar y partir lo escrito", () => {
  it("sin tildes ni mayúsculas, coma decimal → punto", () => {
    expect(normalizarTexto("Azúcar RUBIA 1,5 Kg.")).toBe("azucar rubia 1.5 kg");
  });
  it("la cantidad y la unidad del principio no son parte del nombre; la medida sí, exacta", () => {
    expect(partir("2 cj leche gloria", true)).toEqual({ palabras: ["leche", "gloria"], medidas: [], unidad: "caja" });
    expect(partir("3doc huevos", true)).toEqual({ palabras: ["huevos"], medidas: [], unidad: "docena" });
    expect(partir("aceite primor 1 lt", true)).toEqual({ palabras: ["aceite", "primor"], medidas: ["1l"], unidad: null });
    expect(partir("Leche Evaporada Gloria 400ml", false).medidas).toEqual(["400ml"]);
  });
});

describe("emparejarPedido", () => {
  it("«2 cj leche gloria» → Leche Gloria (la de caja, no la lata), cantidad 2", () => {
    const [l] = emparejarPedido([linea("2 cj leche gloria", 2)], CATALOGO);
    expect(l.productoId).toBe(1252403);
    expect(l.productoNombre).toBe("Leche Gloria Entera 1L UHT");
    expect(l.cantidad).toBe(2);
    expect(l.confianza).not.toBe("sin_match");
    // La otra leche queda a un toque, como alternativa.
    expect(l.alternativas.map((a) => a.productoId)).toContain(1252404);
  });

  it("un texto que no está en el catálogo → sin_match, sin producto ni precio", () => {
    const [l] = emparejarPedido([linea("3 panetones donofrio", 3)], CATALOGO);
    expect(l).toMatchObject({ productoId: null, productoNombre: null, precioCatalogo: null, confianza: "sin_match", cantidad: 3 });
  });

  it("precio leído distinto del catálogo → gana el catálogo; el del papel queda como referencia", () => {
    const [l] = emparejarPedido([linea("arroz costeño 5kg", 1, 20)], CATALOGO);
    expect(l.productoId).toBe(1252382);
    expect(l.precioCatalogo).toBe(24.9);
    expect(l.precioLeido).toBe(20);
  });

  it("sin tildes, con una letra mal escrita y por prefijo", () => {
    const r = emparejarPedido([linea("azucar rubia"), linea("aceite primr"), linea("inca kol")], CATALOGO);
    expect(r.map((l) => l.productoId)).toEqual([1252383, 1252384, 1252394]);
    expect(r[0].taxType).toBe("exonerado");
  });

  it("alta sólo cuando no hay otro parecido; la misma marca en dos productos baja la confianza", () => {
    const [arroz] = emparejarPedido([linea("arroz costeño")], CATALOGO);
    expect(arroz.confianza).toBe("alta");
    const [leche] = emparejarPedido([linea("leche gloria")], CATALOGO);
    expect(leche.confianza).toBe("media");
  });

  it("la medida se compara exacta: 400 ml no es la leche de 1 L", () => {
    const [l] = emparejarPedido([linea("leche gloria 400 ml")], CATALOGO);
    expect(l.productoId).toBe(1252404);
  });

  it("el código de barras escrito tal cual es ese producto", () => {
    const [l] = emparejarPedido([linea("7751271011234")], CATALOGO);
    expect(l).toMatchObject({ productoId: 1252403, confianza: "alta" });
  });

  it("como mucho 3 alternativas y nunca el elegido repetido", () => {
    const [l] = emparejarPedido([linea("leche")], CATALOGO);
    expect(l.alternativas.length).toBeLessThanOrEqual(3);
    expect(l.alternativas.map((a) => a.productoId)).not.toContain(l.productoId);
  });

  it("cantidad sin dato, 0 o negativa → 1", () => {
    expect([cantidadValida(undefined), cantidadValida(0), cantidadValida(-2), cantidadValida(2.5)]).toEqual([1, 1, 1, 2.5]);
  });

  it("candidatosPorTexto respeta el límite y ordena de mayor a menor", () => {
    const [c] = candidatosPorTexto(["leche gloria"], CATALOGO, 2);
    expect(c).toHaveLength(2);
    expect(c[0].puntaje).toBeGreaterThanOrEqual(c[1].puntaje);
  });
});
