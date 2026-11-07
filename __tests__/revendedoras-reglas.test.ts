import { describe, expect, it } from "vitest";
import {
  ConfigRevendedorasSchema,
  configPorDefecto,
  cotizarPedido,
  leerAltas,
  leerConfigRevendedoras,
  mesDeLima,
  nivelPorCompras,
  pisoPorMargen,
  precioRevendedora,
  preciosPorNivel,
  sinCreditoHasta,
  type ConfigRevendedoras,
  type LineaPedido,
} from "@/lib/revendedoras/reglas";

/** Las reglas del manual de Musa (§10 y §11), prendidas, con «Kits y ofertas» fuera del descuento. */
const MUSA: ConfigRevendedoras = { ...configPorDefecto(), activo: true, categoriasSinDescuento: ["Kits y ofertas"] };

const linea = (p: Partial<LineaPedido> & { precioCatalogo: number; cantidad: number }): LineaPedido => ({
  productId: 1,
  nombre: "Producto",
  categoria: "Rostro",
  costo: null,
  ...p,
});

describe("config", () => {
  it("sin nada guardado: los números del manual, apagado", () => {
    const c = leerConfigRevendedoras({});
    expect(c.activo).toBe(false);
    expect(c.niveles).toEqual([{ desde: 0, descuento: 20 }, { desde: 600, descuento: 25 }]);
    expect(c.pedidoMinimo).toBe(150);
    expect(c.envioGratisDesde).toBe(300);
    expect(c.margenMinimo).toBe(30);
  });

  it("lo inválido guardado vuelve a los de fábrica (no rompe la pantalla)", () => {
    expect(leerConfigRevendedoras({ revendedoras: { activo: "sí" } }).activo).toBe(false);
  });

  it("el primer nivel empieza en 0, sube en compras y no baja el descuento", () => {
    const base = configPorDefecto();
    expect(ConfigRevendedorasSchema.safeParse({ ...base, niveles: [{ desde: 100, descuento: 20 }] }).success).toBe(false);
    expect(ConfigRevendedorasSchema.safeParse({ ...base, niveles: [{ desde: 0, descuento: 20 }, { desde: 0, descuento: 25 }] }).success).toBe(false);
    expect(ConfigRevendedorasSchema.safeParse({ ...base, niveles: [{ desde: 0, descuento: 25 }, { desde: 600, descuento: 20 }] }).success).toBe(false);
    expect(ConfigRevendedorasSchema.safeParse(base).success).toBe(true);
  });

  it("altas: sólo fechas AAAA-MM-DD (null = quitada)", () => {
    expect(leerAltas({ revendedorasAltas: { a: "2026-11-02", b: null, c: "ayer" } })).toEqual({ a: "2026-11-02" });
  });
});

describe("nivel por compras del mes", () => {
  it("20 % de entrada y cuánto falta para el 25 %", () => {
    const n = nivelPorCompras(MUSA, 450.5);
    expect(n.descuento).toBe(20);
    expect(n.siguiente).toEqual({ desde: 600, descuento: 25, falta: 149.5 });
  });

  it("desde S/ 600 justos: 25 % y sin siguiente", () => {
    const n = nivelPorCompras(MUSA, 600);
    expect(n.descuento).toBe(25);
    expect(n.siguiente).toBeNull();
  });
});

describe("precio de una unidad", () => {
  it("manual §11: protector S/ 79 → S/ 63,20 al 20 %", () => {
    const p = precioRevendedora({ precioCatalogo: 79, costo: 37.16, descuento: 20, margenMinimo: 30, esOferta: false });
    expect(p.precio).toBe(63.2);
    expect(p.descuento).toBe(20);
    expect(p.motivo).toBeNull();
    expect(p.margen).toBe(41.2); // el manual: S/ 26,04 de ganancia, 41 %
  });

  it("nunca bajo la ganancia mínima: se topa al piso y lo dice", () => {
    // costo 45 → piso 30 % = 45 / 0,7 = 64,2857… → 64,29; al 25 % sería 59,25
    const p = precioRevendedora({ precioCatalogo: 79, costo: 45, descuento: 25, margenMinimo: 30, esOferta: false });
    expect(p.precio).toBe(64.29);
    expect(p.motivo).toBe("margen");
    expect(p.margen).toBeGreaterThanOrEqual(30);
    expect(p.descuento).toBe(18.6);
  });

  it("si ni el catálogo deja la ganancia mínima, va al precio del catálogo", () => {
    const p = precioRevendedora({ precioCatalogo: 50, costo: 40, descuento: 20, margenMinimo: 30, esOferta: false });
    expect(p.precio).toBe(50);
    expect(p.motivo).toBe("catalogo-bajo-margen");
  });

  it("ofertas: los descuentos no se suman", () => {
    const p = precioRevendedora({ precioCatalogo: 149, costo: 64, descuento: 25, margenMinimo: 30, esOferta: true });
    expect(p.precio).toBe(149);
    expect(p.descuento).toBe(0);
    expect(p.motivo).toBe("oferta");
  });

  it("sin costo no se topa, pero se marca", () => {
    const p = precioRevendedora({ precioCatalogo: 59, costo: null, descuento: 20, margenMinimo: 30, esOferta: false });
    expect(p.precio).toBe(47.2);
    expect(p.sinCosto).toBe(true);
    expect(p.margen).toBeNull();
  });

  it("piso al céntimo hacia arriba, sin arrastre del float", () => {
    expect(pisoPorMargen(7, 30)).toBe(10);
    expect(pisoPorMargen(45, 30)).toBe(64.29);
    expect(pisoPorMargen(45, 0)).toBe(0);
  });
});

describe("cotizar un pedido", () => {
  it("ejemplo de Rosa: S/ 500 de catálogo → paga S/ 400, gana S/ 100, envío gratis", () => {
    const c = cotizarPedido(MUSA, {
      compradoEnElMes: 0,
      lineas: [linea({ precioCatalogo: 79, costo: 30, cantidad: 4 }), linea({ productId: 2, precioCatalogo: 46, costo: 18, cantidad: 4 })],
    });
    expect(c.catalogo).toBe(500);
    expect(c.total).toBe(400);
    expect(c.ellaGana).toBe(100);
    expect(c.cumpleMinimo).toBe(true);
    expect(c.envioGratis).toBe(true);
    expect(c.faltaEnvioGratis).toBe(0);
    expect(c.ganancia).toBe(400 - (4 * 30 + 4 * 18));
  });

  it("debajo del mínimo: cuánto falta y aviso; el envío lo paga ella", () => {
    const c = cotizarPedido(MUSA, { compradoEnElMes: 0, lineas: [linea({ precioCatalogo: 59, cantidad: 2 })] });
    expect(c.total).toBe(94.4);
    expect(c.cumpleMinimo).toBe(false);
    expect(c.faltaMinimo).toBe(55.6);
    expect(c.envioGratis).toBe(false);
    expect(c.faltaEnvioGratis).toBe(205.6);
    expect(c.avisos.some((a) => a.includes("pedido mínimo"))).toBe(true);
  });

  it("el pedido con el que pasa los S/ 600 del mes ya sale al 25 %", () => {
    // ya compró 450; este pedido al 20 % son 189,60 → 639,60 ≥ 600 → todo al 25 %
    const c = cotizarPedido(MUSA, { compradoEnElMes: 450, lineas: [linea({ precioCatalogo: 79, costo: 30, cantidad: 3 })] });
    expect(c.subeDeNivel).toBe(true);
    expect(c.nivel.descuento).toBe(25);
    expect(c.total).toBe(177.75);
  });

  it("sin pasar el umbral se queda en 20 %", () => {
    const c = cotizarPedido(MUSA, { compradoEnElMes: 100, lineas: [linea({ precioCatalogo: 79, costo: 30, cantidad: 3 })] });
    expect(c.subeDeNivel).toBe(false);
    expect(c.nivel.descuento).toBe(20);
    expect(c.total).toBe(189.6);
  });

  it("un kit en «Kits y ofertas» va a su precio y la ganancia total se calcula igual", () => {
    const c = cotizarPedido(MUSA, {
      compradoEnElMes: 0,
      lineas: [linea({ nombre: "Kit Rutina facial", categoria: "kits y ofertas", precioCatalogo: 179, costo: 74, cantidad: 1 })],
    });
    expect(c.total).toBe(179);
    expect(c.lineas[0]?.motivo).toBe("oferta");
    expect(c.margen).toBe(58.7);
  });

  it("si falta el costo de una línea, la ganancia del pedido no se inventa", () => {
    const c = cotizarPedido(MUSA, {
      compradoEnElMes: 0,
      lineas: [linea({ precioCatalogo: 79, costo: 30, cantidad: 2 }), linea({ productId: 2, precioCatalogo: 59, cantidad: 1 })],
    });
    expect(c.ganancia).toBeNull();
    expect(c.avisos.some((a) => a.includes("sin costo"))).toBe(true);
  });

  it("sin envío gratis configurado: faltaEnvioGratis null", () => {
    const c = cotizarPedido({ ...MUSA, envioGratisDesde: null }, { compradoEnElMes: 0, lineas: [linea({ precioCatalogo: 500, cantidad: 1 })] });
    expect(c.envioGratis).toBe(false);
    expect(c.faltaEnvioGratis).toBeNull();
  });

  it("líneas en cero no cuentan", () => {
    const c = cotizarPedido(MUSA, { compradoEnElMes: 0, lineas: [linea({ precioCatalogo: 79, cantidad: 0 })] });
    expect(c.lineas).toHaveLength(0);
    expect(c.total).toBe(0);
    expect(c.envioGratis).toBe(false);
  });
});

describe("lista de precios por nivel", () => {
  it("un precio por nivel, en el orden de la config", () => {
    const [p] = preciosPorNivel(MUSA, [{ productId: 1, nombre: "Protector", codigo: "MU013", categoria: "Rostro", precioCatalogo: 79, costo: 30 }]);
    expect(p?.porNivel.map((x) => x.precio)).toEqual([63.2, 59.25]);
  });
});

describe("fechas de Lima", () => {
  it("el 1 de noviembre a las 00:30 de Lima ya es noviembre (05:30 UTC)", () => {
    const m = mesDeLima(new Date("2026-11-01T05:30:00Z"));
    expect(m.clave).toBe("2026-11");
    expect(m.desde.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(m.hasta.toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });

  it("el 31 de octubre a las 23:30 de Lima todavía es octubre", () => {
    expect(mesDeLima(new Date("2026-11-01T04:30:00Z")).clave).toBe("2026-10");
  });

  it("sin crédito hasta: + meses, recortando el fin de mes", () => {
    expect(sinCreditoHasta("2026-11-20", 3)).toBe("2027-02-20");
    expect(sinCreditoHasta("2026-11-30", 3)).toBe("2027-02-28");
    expect(sinCreditoHasta("2026-11-20", 0)).toBeNull();
  });
});
