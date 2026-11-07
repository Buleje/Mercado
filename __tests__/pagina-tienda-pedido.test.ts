/**
 * ADR-511 · Plantilla de tienda: el catálogo (buscar, filtrar, ordenar), la
 * ficha (producto de la URL, relacionados) y el pedido por WhatsApp
 * parametrizado con los datos del negocio (sin pueblos ni nombres fijos).
 */
import { describe, expect, it, vi } from "vitest";

// La ficha lee la tienda en el servidor: acá sólo se prueban sus funciones puras.
vi.mock("@/extensiones/pagina-tienda/datos", () => ({ cargarTienda: vi.fn() }));
import type { ProductoTienda } from "@/extensiones/pagina-tienda/contenido";
import { productoDeLaUrl, relacionadosDe } from "@/extensiones/pagina-tienda/Ficha";
import { aParametros, aplicar, contar, leerFiltros, SIN_FILTROS } from "@/extensiones/pagina-tienda/filtros";
import { armarMensajePedido, avanceEnvio, costoEnvio, opcionesEntrega, OTRO_LUGAR, RECOJO } from "@/extensiones/pagina-tienda/pedido-whatsapp";

const p = (id: number, nombre: string, categoria: string, precio: number, extra: Partial<ProductoTienda> = {}): ProductoTienda => ({
  id,
  nombre,
  marca: null,
  categoria,
  precio,
  antes: null,
  descuento: null,
  imagen: "",
  descripcion: null,
  stock: null,
  unidad: "unidad",
  etiqueta: null,
  codigo: null,
  href: `/t/demo/tienda/${id}`,
  presentacion: null,
  ficha: [],
  ...extra,
});

const PRODUCTOS = [
  p(1, "Pollo entero", "pollo-brasa", 62, { descuento: 10, antes: 69 }),
  p(2, "Medio pollo", "pollo-brasa", 34),
  p(3, "Pizza americana", "pizzas", 39, { marca: "Casa", stock: 0 }),
  p(4, "Pizza hawaiana", "pizzas", 42, { stock: 3 }),
  p(5, "Inca Kola 1 L", "bebidas", 6),
];
const nombres: Record<string, string> = { "pollo-brasa": "Pollo a la brasa", pizzas: "Pizzas", bebidas: "Bebidas" };

describe("filtros del catálogo", () => {
  it("lee la URL: sólo categorías y órdenes que existen", () => {
    const f = leerFiltros({ q: "  pizza ", categoria: "pizzas", orden: "precio-asc", oferta: "1" }, ["pizzas"], []);
    expect(f).toMatchObject({ q: "pizza", categoria: "pizzas", orden: "precio-asc", oferta: true });
    expect(leerFiltros({ categoria: "no-existe", orden: "raro" }, ["pizzas"], [])).toMatchObject({ categoria: null, orden: "destacados" });
    expect(aParametros({ ...SIN_FILTROS, q: "pollo", orden: "nuevos" })).toEqual([
      ["q", "pollo"],
      ["orden", "nuevos"],
    ]);
  });

  it("busca sin tildes ni plurales y por el nombre de la categoría", () => {
    const ids = (q: string) => aplicar(PRODUCTOS, { ...SIN_FILTROS, q }, undefined, (c) => nombres[c] ?? c).map((x) => x.id);
    expect(ids("pizzas")).toEqual([3, 4]);
    expect(ids("brasa")).toEqual([1, 2]);
    expect(ids("INCA kola")).toEqual([5]);
  });

  it("ordena por precio y por lo más nuevo; «disponibles» no saca los de stock desconocido", () => {
    expect(aplicar(PRODUCTOS, { ...SIN_FILTROS, orden: "precio-asc" }).map((x) => x.id)).toEqual([5, 2, 3, 4, 1]);
    expect(aplicar(PRODUCTOS, { ...SIN_FILTROS, orden: "nuevos" }).map((x) => x.id)).toEqual([5, 4, 3, 2, 1]);
    expect(aplicar(PRODUCTOS, { ...SIN_FILTROS, disponibles: true }).map((x) => x.id)).toEqual([1, 2, 4, 5]);
  });

  it("cuenta por categoría con los demás filtros puestos", () => {
    const c = contar(PRODUCTOS, { ...SIN_FILTROS, categoria: "pizzas", q: "pizza" });
    expect(c.todos).toBe(2);
    expect(c.porCategoria.get("pizzas")).toBe(2);
    expect(c.porCategoria.get("bebidas")).toBeUndefined();
  });
});

describe("ficha", () => {
  it("encuentra el producto por el slug de su nombre", () => {
    expect(productoDeLaUrl(PRODUCTOS, "pizza-hawaiana")?.id).toBe(4);
    expect(productoDeLaUrl(PRODUCTOS, "")).toBeNull();
    expect(productoDeLaUrl(PRODUCTOS, "no-existe")).toBeNull();
  });

  it("relacionados: primero los de su categoría, sin él mismo", () => {
    expect(relacionadosDe(PRODUCTOS, PRODUCTOS[2], 3).map((x) => x.id)).toEqual([4, 1, 2]);
  });
});

describe("pedido por WhatsApp con los datos del negocio", () => {
  const envio = { gratisDesde: 80, zonas: [{ nombre: "Centro", costo: 5 }] };
  const negocio = { nombre: "Pizza Pucallpa", whatsapp: "51987654321" };
  const lineas = [
    { nombre: "Pizza americana", codigo: "PZ-01", cantidad: 1, precio: 39 },
    { nombre: "Inca Kola 1 L", codigo: "7751271000011", cantidad: 2, precio: 6.1 },
  ];

  it("zonas del negocio + «Otro lugar» y «Recojo» sólo si tiene dirección", () => {
    expect(opcionesEntrega(envio.zonas, true)).toEqual(["Centro", OTRO_LUGAR, RECOJO]);
    expect(opcionesEntrega(envio.zonas)).toEqual(["Centro", OTRO_LUGAR]);
    expect(opcionesEntrega([], true)).toEqual([]);
  });

  it("costo del envío: el de la zona, gratis desde el monto, no se sabe en otro lugar o recojo", () => {
    expect(costoEnvio("Centro", envio, 51.2)).toBe(5);
    expect(costoEnvio("Centro", envio, 80)).toBe(0);
    expect(costoEnvio(OTRO_LUGAR, envio, 20)).toBeNull();
    expect(costoEnvio(RECOJO, envio, 200)).toBeNull();
  });

  it("arma el mensaje con su nombre, el código interno (no el de barras), envío y total en céntimos", () => {
    const r = armarMensajePedido({ lineas, nombre: " Ana  Ruiz ", entrega: "Centro", pago: "Yape", envio: 5, celular: "987 654 321" }, negocio);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total).toBe(56.2);
    expect(r.mensaje.split("\n")).toEqual([
      "Hola Pizza Pucallpa, quiero:",
      "• 1 × Pizza americana (PZ-01) S/ 39",
      "• 2 × Inca Kola 1 L S/ 12.20",
      "Envío (Centro): S/ 5",
      "Total: S/ 56.20",
      "Nombre: Ana Ruiz",
      "Celular: 987 654 321",
      "Entrega: Centro",
      "Pago: Yape",
    ]);
    expect(r.url.startsWith("https://wa.me/51987654321?text=")).toBe(true);
    expect(r.mensaje).not.toMatch(/Drucila|Constituci|Pasco/);
  });

  it("frena sin WhatsApp, sin nombre o con la bolsa vacía", () => {
    expect(armarMensajePedido({ lineas, nombre: "Ana", entrega: "", pago: "" }, { ...negocio, whatsapp: null })).toEqual({ ok: false, motivo: "sin_whatsapp" });
    expect(armarMensajePedido({ lineas, nombre: "  ", entrega: "", pago: "" }, negocio)).toEqual({ ok: false, motivo: "falta_nombre" });
    expect(armarMensajePedido({ lineas: [], nombre: "Ana", entrega: "", pago: "" }, negocio)).toEqual({ ok: false, motivo: "bolsa_vacia" });
  });

  it("avance al envío gratis: nada sin monto; cuánto falta; logrado", () => {
    expect(avanceEnvio(50, null)).toBeNull();
    expect(avanceEnvio(60, 80)).toEqual({ fraccion: 0.75, falta: 20, logrado: false });
    expect(avanceEnvio(90, 80)).toMatchObject({ fraccion: 1, falta: 0, logrado: true });
  });
});
