/**
 * ADR-511 · la portada de la plantilla de tienda con un negocio «pelado»
 * (sin logo, sin WhatsApp, sin fotos, sin políticas) y con uno completo:
 * lo que falta no se dibuja (nada roto ni vacío) y los bloques salen en el
 * orden de `contenido.bloques`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CartProvider } from "@/contexts/cart-context";
import { CONFIG_PEDIDOS_POR_DEFECTO } from "@/lib/tienda-cliente/contrato";
import type { DatosTienda, ProductoTienda } from "@/extensiones/pagina-tienda/contenido";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/t/pizza-demo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { VistaTienda } = await import("@/extensiones/pagina-tienda/PaginaTienda");
const { topesDe } = await import("@/extensiones/pagina-tienda/PorPrecio");
const { elegirDestacados } = await import("@/extensiones/pagina-tienda/Destacados");

const producto = (id: number, precio: number, extra: Partial<ProductoTienda> = {}): ProductoTienda => ({
  id,
  nombre: `Pizza ${id}`,
  marca: null,
  categoria: id % 2 ? "pizzas" : "bebidas",
  precio,
  antes: null,
  descuento: null,
  imagen: "",
  descripcion: null,
  stock: null,
  unidad: "unidad",
  etiqueta: null,
  codigo: null,
  href: `/t/pizza-demo/tienda/pizza-${id}`,
  presentacion: null,
  ficha: [],
  ...extra,
});

function datos(over: { negocio?: Partial<DatosTienda["negocio"]>; contenido?: Partial<DatosTienda["contenido"]>; productos?: ProductoTienda[] } = {}): DatosTienda {
  const productos = over.productos ?? [5, 8, 9, 12, 15, 25].map((p, i) => producto(i + 1, p));
  return {
    negocio: {
      tenantId: "t1",
      slug: "pizza-demo",
      nombre: "Pizza Pucallpa",
      lema: null,
      descripcion: null,
      logo: null,
      whatsapp: null,
      horario: null,
      direccion: null,
      redes: {},
      pagos: [],
      envio: { gratisDesde: null, zonas: [] },
      devolucionDias: null,
      pedidosCliente: CONFIG_PEDIDOS_POR_DEFECTO,
      ...over.negocio,
    },
    tema: { acento: "#1a1a1a", letra: "jakarta", radio: "suave" },
    contenido: {
      franja: [],
      heroe: { titulo: "Pizza Pucallpa", boton: "Ver productos", imagen: null },
      circulos: [
        { nombre: "Pizzas", categoria: "pizzas", imagen: null },
        { nombre: "Bebidas", categoria: "bebidas", imagen: null },
      ],
      confianza: [{ titulo: "Paga como te acomode", texto: "Al recibir tu pedido." }],
      pedido: "checkout",
      bloques: ["franja", "heroe", "circulos", "porPrecio", "destacados", "confianza", "politicas"],
      ...over.contenido,
    },
    productos,
    categorias: ["pizzas", "bebidas"],
    mayorDescuento: null,
  };
}

const html = (d: DatosTienda) =>
  renderToStaticMarkup(
    <CartProvider tenantSlug={d.negocio.slug}>
      <VistaTienda datos={d} />
    </CartProvider>,
  );

describe("portada de la plantilla de tienda", () => {
  it("negocio sin logo, sin WhatsApp, sin fotos ni políticas: monograma y nada roto", () => {
    const h = html(datos());
    expect(h).toMatch(/<text[^>]*>P<\/text>/); // el sello con la inicial
    expect(h).not.toContain("wa.me");
    expect(h).not.toContain('src=""');
    expect(h).not.toContain('id="politicas"');
    expect(h).not.toContain("Envíos, pagos y cambios");
    expect(h).toContain("Pizza Pucallpa");
  });

  it("con WhatsApp y políticas: botón de WhatsApp y cada línea con su dato", () => {
    const h = html(
      datos({
        negocio: { whatsapp: "51921585006", pagos: ["Yape", "Efectivo"], envio: { gratisDesde: 50, zonas: [{ nombre: "Centro", costo: 0 }] }, devolucionDias: 7 },
      }),
    );
    expect(h).toContain("https://wa.me/51921585006");
    expect(h).toContain('id="politicas"');
    expect(h).toContain("Sin costo de envío.");
    expect(h).toContain("En pedidos desde S/ 50.");
    expect(h).toContain("Hasta 7 días después de tu compra.");
    expect(h).toContain("Pagas como prefieras:");
  });

  it("los bloques salen en el orden de contenido.bloques", () => {
    const h = html(datos({ contenido: { bloques: ["heroe", "confianza", "circulos"] } }));
    expect(h.indexOf('id="ti-confianza"')).toBeGreaterThan(-1);
    expect(h.indexOf('id="ti-confianza"')).toBeLessThan(h.indexOf('id="ti-circulos"'));
    expect(h).not.toContain('id="ti-precio"');
  });

  it("sin productos: «Estamos preparando la vitrina», sin carriles", () => {
    const h = html(datos({ productos: [] }));
    expect(h).toContain("Estamos preparando la vitrina");
    expect(h).not.toContain('id="ti-circulos"');
    expect(h).not.toContain('id="ti-destacados"');
  });
});

describe("reglas de los bloques", () => {
  it("topes por precio: sólo los que dejan ≥4 debajo y alguno encima", () => {
    expect(topesDe([5, 8, 9, 12, 15, 25].map((p, i) => producto(i + 1, p)))).toEqual([20]);
    expect(topesDe([1, 2, 3].map((p, i) => producto(i + 1, p)))).toEqual([]);
  });

  it("destacados: marcados primero (mayor descuento antes); sin marcados, lo más nuevo", () => {
    const lista = [producto(1, 10), producto(2, 10, { descuento: 10 }), producto(3, 10, { etiqueta: "Nuevo" }), producto(4, 10, { descuento: 30 })];
    const r = elegirDestacados(lista);
    expect(r.marcados).toBe(true);
    expect(r.lista.map((p) => p.id)).toEqual([4, 2, 3, 1]);
    expect(elegirDestacados([producto(1, 1), producto(2, 1)])).toEqual({ lista: [producto(2, 1), producto(1, 1)], marcados: false });
  });
});
