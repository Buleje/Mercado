import { describe, expect, it } from "vitest";
import {
  DatosMercadoSchema,
  firmarCambios,
  fusionarMercado,
  normalizarMercado,
  precioVigente,
  resumirMercado,
  sugerenciasMercado,
  type DatosMercado,
  type PrecioVisto,
} from "@/lib/compras/mercado";

const HOY = "2026-10-17";
const visto = (precio: number, extra: Partial<PrecioVisto> = {}): PrecioVisto => ({ precio, moneda: "PEN", fecha: "2026-10-10", fuente: "visita", ...extra });

/** C38: precios de la competencia con origen; separados de lo que pagas. */
describe("normalizarMercado", () => {
  it("lee la forma vieja del navegador (precio suelto) sin inventarle fecha", () => {
    const d = normalizarMercado({
      competitors: [{ id: "c1", name: "Bodega Pérez" }],
      products: [{ productId: "p1", productName: "Arroz", myPrice: 5, prices: { c1: 4.8, fantasma: 3 } }],
    });
    expect(d.products[0].prices).toEqual({ c1: { precio: 4.8, moneda: "PEN", fecha: null, fuente: "otro" } });
  });

  it("descarta basura sin romperse", () => {
    expect(normalizarMercado("nada")).toEqual({ competitors: [], products: [] });
    expect(normalizarMercado({ competitors: [{ id: "", name: "x" }], products: [{ productName: "sin id" }] })).toEqual({ competitors: [], products: [] });
  });
});

describe("vigencia", () => {
  it("sólo cuenta en soles, con fecha y de hace 30 días o menos", () => {
    expect(precioVigente(visto(5), HOY)).toBe(true);
    expect(precioVigente(visto(5, { fecha: "2026-09-17" }), HOY)).toBe(true);
    expect(precioVigente(visto(5, { fecha: "2026-09-16" }), HOY)).toBe(false);
    expect(precioVigente(visto(5, { fecha: null }), HOY)).toBe(false);
    expect(precioVigente(visto(5, { moneda: "USD" }), HOY)).toBe(false);
    expect(precioVigente(visto(0), HOY)).toBe(false);
  });

  it("el resumen y las sugerencias ignoran lo viejo y lo dicen", () => {
    const d: DatosMercado = {
      competitors: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      products: [
        { productId: "p", productName: "Arroz", myPrice: 5, prices: { a: visto(6), b: visto(2, { fecha: "2026-01-01" }) } },
        { productId: "q", productName: "Azúcar", myPrice: 4, prices: { a: visto(3, { moneda: "USD" }) } },
      ],
    };
    const r = resumirMercado(d, HOY);
    expect(r).toMatchObject({ comparadas: 1, masBarato: 1, fueraDeCuenta: 2 });
    expect(r.oportunidad).toEqual({ producto: "Arroz", diferencia: 1 });
    const s = sugerenciasMercado(d, HOY);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ productId: "p", promedio: 6, muestra: 1, estado: "alineado" });
  });
});

describe("compartir con el equipo", () => {
  it("fusiona por nombre (sin tildes ni mayúsculas) y en cada casilla gana el precio más nuevo", () => {
    const equipo: DatosMercado = {
      competitors: [{ id: "c1", name: "Bodega Pérez" }],
      products: [{ productId: "p1", productName: "Arroz", myPrice: 5, prices: { c1: visto(4.8, { fecha: "2026-10-01" }) } }],
    };
    const local: DatosMercado = {
      competitors: [{ id: "x", name: "bodega perez" }, { id: "c1", name: "Market Plaza" }],
      products: [
        { productId: "z", productName: "ARROZ", myPrice: 0, prices: { x: visto(5, { fecha: "2026-10-12" }), c1: visto(5.2) } },
        { productId: "p1", productName: "Aceite", myPrice: 9, prices: {} },
      ],
    };
    const u = fusionarMercado(equipo, local);
    expect(u.competitors.map((c) => c.name)).toEqual(["Bodega Pérez", "Market Plaza"]);
    // El id local que choca con otro del equipo se renombra: no se pisan.
    expect(new Set(u.competitors.map((c) => c.id)).size).toBe(2);
    expect(new Set(u.products.map((p) => p.productId)).size).toBe(2);
    const arroz = u.products.find((p) => p.productName === "Arroz");
    expect(arroz?.myPrice).toBe(5);
    expect(arroz?.prices.c1?.precio).toBe(5); // el de Bodega Pérez del 12-10 gana al del 01-10
    const plaza = u.competitors.find((c) => c.name === "Market Plaza")!;
    expect(arroz?.prices[plaza.id]?.precio).toBe(5.2);
  });

  it("firma sólo lo nuevo o cambiado", () => {
    const antes: DatosMercado = {
      competitors: [{ id: "a", name: "A" }],
      products: [{ productId: "p", productName: "Arroz", myPrice: 5, prices: { a: visto(4, { registradoPor: "rosa" }) } }],
    };
    const igual = firmarCambios(antes, antes, "luis");
    expect(igual.products[0].prices.a?.registradoPor).toBe("rosa");
    const cambiado = firmarCambios(antes, { ...antes, products: [{ ...antes.products[0], prices: { a: visto(4.5, { registradoPor: "rosa" }) } }] }, "luis");
    expect(cambiado.products[0].prices.a?.registradoPor).toBe("luis");
  });

  it("el servidor rechaza listas sin tope o con precios negativos", () => {
    const muchos = { competitors: Array.from({ length: 51 }, (_, i) => ({ id: `c${i}`, name: `C${i}` })), products: [] };
    expect(DatosMercadoSchema.safeParse(muchos).success).toBe(false);
    const negativo = { competitors: [], products: [{ productId: "p", productName: "X", myPrice: -1, prices: {} }] };
    expect(DatosMercadoSchema.safeParse(negativo).success).toBe(false);
  });
});
