import { describe, it, expect, vi } from "vitest";
import {
  armarRebajas,
  describirRebajas,
  diasHasta,
  elegirLoteQueVence,
  pctDeRegla,
  type DatosRebaja,
  type LoteQueVence,
} from "@/lib/precios/rebajas";
import { leerPedidoDeRebajas, type ProductoPrecio } from "@/lib/admin/comandos-ia/precios";

const db = vi.hoisted(() => ({
  caja: vi.fn(async () => [] as Array<{ productId: number; quantity: number }>),
  pedidos: vi.fn(async () => [] as Array<{ productId: number; quantity: number }>),
  kits: vi.fn(async () => [] as Array<{ productId: number; quantity: number }>),
}));
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { getAll: vi.fn(async () => []) } }));
vi.mock("@/lib/db/sales.db", () => ({ SalesDB: { findSaleItemsByProducts: db.caja } }));
vi.mock("@/lib/db/orders.db", () => ({ OrdersDB: { findOrderItemsByProducts: db.pedidos } }));
vi.mock("@/lib/db/kits.db", () => ({ KitsDB: { salidasComoComponente: db.kits } }));
vi.mock("@/lib/db/batches.db", () => ({ BatchesDB: { getExpiring: vi.fn(async () => []), getExpiredWithStock: vi.fn(async () => []) } }));

const HOY = "2026-10-19";

const p = (id: number, name: string, price: number, costPrice: number | null, stock: number | null): ProductoPrecio => ({
  id,
  name,
  category: "Abarrotes",
  price,
  costPrice,
  stock,
});

/** `vence`: la fecha sola = un lote de 5 u.; o el lote entero. */
function datos(productos: ProductoPrecio[], vendidas: Record<number, number> = {}, vence: Record<number, string | LoteQueVence> = {}): DatosRebaja {
  return {
    productos,
    vendidas: new Map(Object.entries(vendidas).map(([k, v]) => [Number(k), v])),
    vence: new Map(Object.entries(vence).map(([k, v]) => [Number(k), typeof v === "string" ? { fecha: v, cantidad: 5 } : v])),
    hoy: HOY,
    dias: 30,
  };
}

const fila = (l: ReturnType<typeof armarRebajas>, id: number) => l.filas.find((f) => f.productId === id);
const noEntra = (l: ReturnType<typeof armarRebajas>, id: number) => l.noEntran.find((x) => x.productId === id)?.motivo;

describe("regla única de rebajas", () => {
  it("sin ventas en la ventana → 15 %, redondeado a 10 céntimos", () => {
    const l = armarRebajas(datos([p(1, "Lentejas", 10, 5, 20)]));
    expect(fila(l, 1)).toMatchObject({ motivo: "sin-venta", precioHoy: 10, precioNuevo: 8.5, pct: -15, enPiso: false });
    expect(fila(l, 1)?.detalle).toBe("Sin ventas en 30 días · 20 u. paradas");
  });

  it("nunca baja del costo + 5 %: queda en el piso y lo dice", () => {
    const l = armarRebajas(datos([p(2, "Quinua", 6, 5.5, 10)]));
    // 6 − 15 % = 5,10 < piso 5,775 → 5,80 (techo a 10 céntimos)
    expect(fila(l, 2)).toMatchObject({ precioNuevo: 5.8, enPiso: true, pct: -3.3 });
    expect(fila(l, 2)?.detalle).toContain("tope: costo + 5 %");
  });

  it("ya en su piso → no entra, con el costo a la vista", () => {
    const l = armarRebajas(datos([p(3, "Azúcar", 5.8, 5.5, 10)]));
    expect(l.filas).toHaveLength(0);
    expect(noEntra(l, 3)).toBe("ya está en su piso (costo S/ 5.50 + 5 %): bajarlo es perder");
  });

  it("vence primero: 30 % hoy, 20 % a los 15 días, proporcional en medio — aunque se venda", () => {
    const l = armarRebajas(
      datos([p(4, "Yogur A", 10, 4, 5), p(5, "Yogur B", 10, 4, 5), p(6, "Yogur C", 10, 4, 5)], { 4: 50, 5: 50, 6: 50 }, {
        4: HOY,
        5: "2026-11-03",
        6: "2026-10-25",
      }),
    );
    expect(fila(l, 4)).toMatchObject({ motivo: "vence", precioNuevo: 7, detalle: "5 u. vencen hoy" });
    expect(fila(l, 5)).toMatchObject({ motivo: "vence", precioNuevo: 8 });
    expect(fila(l, 6)).toMatchObject({ motivo: "vence", precioNuevo: 7.4, detalle: "5 u. vencen en 6 días (25/10)" });
    // Orden: el que vence antes, primero.
    expect(l.filas.map((f) => f.productId)).toEqual([4, 6, 5]);
  });

  it("vencido → no se rebaja: se saca de la venta", () => {
    const l = armarRebajas(datos([p(7, "Leche", 4, 2, 6)], {}, { 7: "2026-10-18" }));
    expect(l.filas).toHaveLength(0);
    expect(noEntra(l, 7)).toBe("venció el 18/10 (5 u.): sácalo de la venta, no se rebaja");
  });

  it("sin costo cargado → no entra (antes se inventaba costo = 70 % del precio)", () => {
    const l = armarRebajas(datos([p(8, "Tinte", 25, null, 10)]));
    expect(l.filas).toHaveLength(0);
    expect(noEntra(l, 8)).toBe("sin costo cargado: no sé hasta dónde bajar sin perder");
  });

  it("sin stock → no entra; stock null (no se controla: servicios) tampoco entra como sin ventas", () => {
    const l = armarRebajas(datos([p(9, "Fideos", 4, 2, 0), p(10, "Corte de cabello", 25, 10, null)]));
    expect(noEntra(l, 9)).toBe("sin stock: no se vende porque no hay");
    expect(l.filas).toHaveLength(0);
    expect(noEntra(l, 10)).toBeUndefined();
  });

  it("lote chico que vence: rebaja el producto y dice cuántas unidades vencen de cuántas", () => {
    const l = armarRebajas(datos([p(17, "Yogur D", 10, 4, 40)], { 17: 50 }, { 17: { fecha: "2026-10-25", cantidad: 12 } }));
    expect(fila(l, 17)).toMatchObject({ motivo: "vence", detalle: "12 u. de 40 vencen en 6 días (25/10)" });
  });

  it("rota poco: stock de más de 3 veces lo vendido → 10 % a 15 %; lo que se vende bien no aparece", () => {
    const l = armarRebajas(datos([p(11, "Aceite", 10, 5, 90), p(12, "Atún", 10, 5, 40), p(13, "Arroz", 10, 5, 10)], { 11: 10, 12: 10, 13: 10 }));
    expect(fila(l, 11)).toMatchObject({ motivo: "rota-poco", precioNuevo: 8.5 });
    // 10,83 % → 8,9167 → techo a 10 céntimos = 9,00
    expect(fila(l, 12)).toMatchObject({ motivo: "rota-poco", precioNuevo: 9, pct: -10 });
    expect(fila(l, 13)).toBeUndefined();
    expect(noEntra(l, 13)).toBeUndefined();
  });

  it("dentro del motivo, primero lo que más plata tiene parada (stock × costo)", () => {
    const l = armarRebajas(datos([p(14, "Chico", 10, 5, 2), p(15, "Grande", 10, 5, 50)]));
    expect(l.filas.map((f) => f.productId)).toEqual([15, 14]);
  });

  it("con el % de la frase («Rebaja 10 %»): sólo sin ventas, mismo piso y redondeo", () => {
    const l = armarRebajas(datos([p(1, "Lentejas", 10, 5, 20), p(2, "Quinua", 6, 5.5, 10), p(16, "Atún", 10, 5, 90)], { 16: 10 }), {
      motivos: ["sin-venta"],
      operacion: { tipo: "pct", valor: -10 },
    });
    expect(fila(l, 1)?.precioNuevo).toBe(9);
    expect(fila(l, 2)).toMatchObject({ precioNuevo: 5.8, enPiso: true });
    expect(fila(l, 16)).toBeUndefined(); // rota poco no entra en «lo que no se vendió»
  });

  it("pctDeRegla y diasHasta", () => {
    expect(pctDeRegla("vence", { diasVence: 0 })).toBe(30);
    expect(pctDeRegla("vence", { diasVence: 15 })).toBe(20);
    expect(pctDeRegla("sin-venta", {})).toBe(15);
    expect(pctDeRegla("rota-poco", { stock: 30, vendidas: 10 })).toBe(10);
    expect(diasHasta(HOY, "2026-10-18")).toBe(-1);
    expect(diasHasta(HOY, "2026-11-03T00:00:00.000Z")).toBe(15);
  });

  it("describirRebajas dice la regla entera", () => {
    expect(describirRebajas(30)).toBe(
      "Rebajar lo que no se vende · vence en 15 días, sin ventas en 30 días, rota poco · nunca bajo el costo + 5 % · redondea a 10 céntimos",
    );
  });
});

describe("elegirLoteQueVence: el lote que manda", () => {
  it("un lote vencido viejo no tapa al que está por vencer; mismo día suma unidades", () => {
    const m = elegirLoteQueVence(
      [
        { productId: 1, expiryDate: "2026-09-01T00:00:00.000Z", quantity: 30 },
        { productId: 1, expiryDate: "2026-11-01T00:00:00.000Z", quantity: 8 },
        { productId: 1, expiryDate: "2026-10-25T00:00:00.000Z", quantity: 7 },
        { productId: 1, expiryDate: "2026-10-25", quantity: 5 },
        { productId: 1, expiryDate: "2026-10-20", quantity: 0 },
      ],
      HOY,
    );
    expect(m.get(1)).toEqual({ fecha: "2026-10-25", cantidad: 12 });
  });

  it("sólo vencidos → el más reciente con el total vencido; fuera de la lista o sin producto, nada", () => {
    const m = elegirLoteQueVence(
      [
        { productId: 2, expiryDate: "2026-09-01", quantity: 3 },
        { productId: 2, expiryDate: "2026-10-10", quantity: 4 },
        { productId: 3, expiryDate: "2026-10-22", quantity: 4 },
        { productId: null, expiryDate: "2026-10-22", quantity: 4 },
      ],
      HOY,
      new Set([2]),
    );
    expect(m.get(2)).toEqual({ fecha: "2026-10-10", cantidad: 7 });
    expect(m.has(3)).toBe(false);
    expect(m.size).toBe(1);
  });
});

describe("leerDatosDeRebaja: lo vendido como componente de un kit cuenta", () => {
  it("componente que sólo sale por el kardex del kit → no entra como «sin ventas»", async () => {
    db.kits.mockResolvedValueOnce([{ productId: 20, quantity: 4 }]);
    const { leerDatosDeRebaja } = await import("@/lib/precios/rebajas-servidor");
    const productos = [p(20, "Esmalte (va en el kit)", 10, 5, 6), p(21, "Esmalte suelto", 10, 5, 6)];
    const d = await leerDatosDeRebaja("t-musa", productos, 30);
    expect(db.kits).toHaveBeenCalledWith("t-musa", [20, 21], expect.any(Date));
    expect(d.vendidas.get(20)).toBe(4);
    const l = armarRebajas(d);
    expect(fila(l, 20)).toBeUndefined();
    expect(fila(l, 21)).toMatchObject({ motivo: "sin-venta" });
  });
});

describe("leerPedidoDeRebajas: la frase sin cifra arma la lista única", () => {
  const CATS = ["Abarrotes", "Bebidas"];

  it("«Rebaja lo que no se vende» → la lista entera a 30 días", () => {
    expect(leerPedidoDeRebajas("Rebaja lo que no se vende", CATS)).toEqual({ dias: 30, soloVence: false, redondeo: 0, categorias: [], excluye: [] });
  });

  it("con ventana, categoría y «menos …»", () => {
    expect(leerPedidoDeRebajas("rebaja las bebidas que no se vendieron en 2 semanas menos la coca cola", CATS)).toMatchObject({
      dias: 14,
      categorias: ["Bebidas"],
      excluye: ["coca cola"],
    });
  });

  it("«baja lo que vence» → sólo el motivo vence", () => {
    expect(leerPedidoDeRebajas("baja lo que está por vencer", CATS)).toMatchObject({ soloVence: true });
  });

  it("con cifra es una orden normal (null): «Rebaja 10 % lo que no se vendió en 30 días»", () => {
    expect(leerPedidoDeRebajas("Rebaja 10 % lo que no se vendió en 30 días", CATS)).toBeNull();
    expect(leerPedidoDeRebajas("Sube 5 % Abarrotes", CATS)).toBeNull();
    expect(leerPedidoDeRebajas("Baja los Snacks", CATS)).toBeNull();
  });

  it("con un producto o una cifra en letras → null (sigue a la IA, no la lista entera)", () => {
    expect(leerPedidoDeRebajas("Rebaja la leche que vence", CATS)).toBeNull();
    expect(leerPedidoDeRebajas("Rebaja diez por ciento lo que no rota", CATS)).toBeNull();
    expect(leerPedidoDeRebajas("Baja un sol lo que no se vende", CATS)).toBeNull();
    expect(leerPedidoDeRebajas("Baja a margen veinte lo que no se vende", CATS)).toBeNull();
  });

  it("las frases de la lista siguen leyéndose", () => {
    expect(leerPedidoDeRebajas("aplica las rebajas sugeridas", CATS)).toMatchObject({ dias: 30, soloVence: false });
    expect(leerPedidoDeRebajas("remata lo que no rota", CATS)).toMatchObject({ dias: 30 });
    expect(leerPedidoDeRebajas("Rebaja las bebidas que vencen", CATS)).toMatchObject({ soloVence: true, categorias: ["Bebidas"] });
  });
});
