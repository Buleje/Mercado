import { describe, expect, it } from "vitest";
import {
  aplicarCambio,
  consolidarPorProducto,
  etapaDe,
  faltantesDe,
  podarAvances,
  type AvancePrep,
  type LineaPrep,
  type PedidoPrep,
} from "@/lib/pedidos/preparacion";

const AHORA = new Date("2026-10-17T15:00:00Z");

const linea = (itemId: number, nombre: string, cantidad: number, extra: Partial<LineaPrep> = {}): LineaPrep => ({
  itemId,
  productoId: itemId * 10,
  nombre,
  unidad: "unidad",
  cantidad,
  categoria: null,
  stock: null,
  detalle: null,
  ...extra,
});

const pedido = (id: string, lineas: LineaPrep[], avance: AvancePrep | null = null): PedidoPrep => ({
  id,
  cliente: `Cliente ${id}`,
  telefono: null,
  estado: "confirmado",
  creado: AHORA.toISOString(),
  enEstadoDesde: AHORA.toISOString(),
  total: 10,
  repartidor: null,
  notas: null,
  entrega: null,
  lineas,
  avance,
});

describe("aplicarCambio", () => {
  const lineas = [linea(1, "Arroz", 3), linea(2, "Leche", 2)];

  it("anota una línea y nunca deja juntar más de lo pedido", () => {
    const r = aplicarCambio(null, lineas, { accion: "linea", itemId: 1, preparada: 2 }, "ana", AHORA);
    expect(r.ok && r.avance?.lineas["1"].preparada).toBe(2);
    const demas = aplicarCambio(null, lineas, { accion: "linea", itemId: 1, preparada: 4 }, "ana", AHORA);
    expect(demas.ok).toBe(false);
    expect(!demas.ok && demas.error).toMatch(/no se junta más de lo pedido/);
  });

  it("rechaza una línea que no es del pedido y una cantidad negativa", () => {
    expect(aplicarCambio(null, lineas, { accion: "linea", itemId: 99, preparada: 1 }, "ana", AHORA).ok).toBe(false);
    expect(aplicarCambio(null, lineas, { accion: "linea", itemId: 1, preparada: -1 }, "ana", AHORA).ok).toBe(false);
  });

  it("volver a 0 todas las líneas deja el pedido sin avance", () => {
    const uno = aplicarCambio(null, lineas, { accion: "linea", itemId: 1, preparada: 1 }, "ana", AHORA);
    if (!uno.ok) throw new Error(uno.error);
    const cero = aplicarCambio(uno.avance, lineas, { accion: "linea", itemId: 1, preparada: 0 }, "ana", AHORA);
    expect(cero).toEqual({ ok: true, avance: null });
  });

  it("listo sin nada juntado se rechaza; listo parcial guarda el faltante", () => {
    expect(aplicarCambio(null, lineas, { accion: "listo", bultos: 1 }, "ana", AHORA).ok).toBe(false);
    const parcial = aplicarCambio(null, lineas, { accion: "linea", itemId: 1, preparada: 3 }, "ana", AHORA);
    if (!parcial.ok) throw new Error(parcial.error);
    const listo = aplicarCambio(parcial.avance, lineas, { accion: "listo", bultos: 2 }, "beto", AHORA);
    if (!listo.ok || !listo.avance) throw new Error("debía marcar listo");
    expect(listo.avance.listo).toMatchObject({ por: "beto", bultos: 2 });
    expect(listo.avance.listo?.faltantes).toEqual([{ itemId: 2, nombre: "Leche", unidad: "unidad", falta: 2 }]);
    expect(etapaDe({ avance: listo.avance, lineas })).toBe("listo-parcial");
  });

  it("con «listo» marcado no se cambia lo juntado hasta deshacerlo", () => {
    const todo = aplicarCambio(null, lineas, { accion: "todo" }, "ana", AHORA);
    if (!todo.ok) throw new Error(todo.error);
    const listo = aplicarCambio(todo.avance, lineas, { accion: "listo", bultos: null }, "ana", AHORA);
    if (!listo.ok) throw new Error(listo.error);
    expect(etapaDe({ avance: listo.avance, lineas })).toBe("listo");
    expect(aplicarCambio(listo.avance, lineas, { accion: "linea", itemId: 1, preparada: 1 }, "ana", AHORA).ok).toBe(false);
    const deshecho = aplicarCambio(listo.avance, lineas, { accion: "deshacer-listo" }, "ana", AHORA);
    expect(deshecho.ok && deshecho.avance?.listo).toBeNull();
    expect(deshecho.ok && deshecho.avance?.lineas["1"].preparada).toBe(3);
  });
});

describe("etapaDe y faltantesDe", () => {
  it("sin avance = sin empezar, con algo = juntando", () => {
    const p = pedido("a", [linea(1, "Arroz", 2)]);
    expect(etapaDe(p)).toBe("sin-empezar");
    expect(faltantesDe(p)).toHaveLength(1);
    const juntando = { ...p, avance: { lineas: { "1": { preparada: 1 } }, por: "x", at: AHORA.toISOString(), listo: null } };
    expect(etapaDe(juntando)).toBe("en-curso");
    expect(faltantesDe(juntando)[0].falta).toBe(1);
  });
});

describe("consolidarPorProducto", () => {
  it("suma por producto entre pedidos, separa por opción y avisa el stock corto", () => {
    const filas = consolidarPorProducto([
      pedido("a", [linea(1, "Arroz", 2, { productoId: 7, stock: 3, categoria: "Abarrotes" }), linea(2, "Café", 1, { productoId: 8, detalle: "Molido", categoria: "Bebidas" })]),
      pedido("b", [linea(3, "Arroz", 4, { productoId: 7, stock: 3, categoria: "Abarrotes" }), linea(4, "Café", 1, { productoId: 8, categoria: "Bebidas" })]),
    ]);
    expect(filas.map((f) => f.nombre)).toEqual(["Arroz", "Café", "Café (Molido)"]);
    const arroz = filas[0];
    expect(arroz.total).toBe(6);
    expect(arroz.pedidos.map((p) => p.id)).toEqual(["a", "b"]);
    expect(arroz.stockCorto).toBe(true);
  });
});

describe("podarAvances", () => {
  it("borra lo que no se toca hace más de 30 días", () => {
    const viejo: AvancePrep = { lineas: {}, por: "x", at: "2026-08-01T00:00:00Z", listo: null };
    const nuevo: AvancePrep = { lineas: {}, por: "x", at: "2026-10-16T00:00:00Z", listo: null };
    expect(Object.keys(podarAvances({ v: viejo, n: nuevo }, AHORA))).toEqual(["n"]);
  });
});
