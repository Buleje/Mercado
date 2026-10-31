/**
 * El puente entre los datos de la tienda (`ProductoTienda`, `DatosTienda`) y el
 * CARRITO DE LA TIENDA que ya existe (`contexts/cart-context`). Puro, sin
 * `"use client"`: lo usan el servidor (catálogo, ficha, la bolsa del marco) y
 * los componentes del navegador.
 *
 * · `aProducto` — un producto como lo guarda el carrito (`Product`). Sin
 *   existencias cargadas (`stock: null`) no se manda `stock`: el carrito no lo
 *   limita y la tienda nunca dice «agotado».
 * · `nombresDeCategorias` — la clave de cada categoría («pollo-brasa») con el
 *   nombre que puso el dueño en sus círculos o, si no, en tipo oración («Pollo brasa»).
 * · `datosBolsa` — lo poco que la bolsa necesita saber del negocio (cómo se pide,
 *   envío, pagos, códigos para el mensaje). No viaja el catálogo entero.
 */
import type { Product } from "@/data/products";
import type { ConfigPedidosCliente } from "@/lib/tienda-cliente/contrato";
import { nombreDeCategoria } from "./armado";
import type { DatosTienda, MedioDePago, NegocioTienda, ProductoTienda } from "./contenido";
import { codigoLegible } from "./pedido-whatsapp";
import { rutasTienda } from "./ui";

export function aProducto(p: ProductoTienda): Product {
  return {
    id: p.id,
    name: p.nombre,
    category: p.categoria,
    price: p.precio,
    image: p.imagen,
    unit: p.unidad,
    ...(p.stock !== null ? { stock: p.stock } : {}),
  };
}

/** Clave → nombre para leer. Lo que el dueño escribió en sus círculos manda. */
export function nombresDeCategorias(d: Pick<DatosTienda, "categorias" | "contenido">): Record<string, string> {
  const propios = new Map(d.contenido.circulos.map((c) => [c.categoria, c.nombre.trim()]));
  const nombres: Record<string, string> = {};
  for (const clave of d.categorias) nombres[clave] = propios.get(clave) || nombreDeCategoria(clave);
  return nombres;
}

/** Las marcas que hay, sin repetir y en orden alfabético (para el filtro «Marca»). */
export function marcasDe(productos: readonly Pick<ProductoTienda, "marca">[]): string[] {
  const marcas = new Set<string>();
  for (const p of productos) if (p.marca?.trim()) marcas.add(p.marca.trim());
  return [...marcas].sort((a, b) => a.localeCompare(b, "es"));
}

export interface DatosBolsa {
  slug: string;
  nombre: string;
  logo: string | null;
  whatsapp: string | null;
  direccion: string | null;
  pagos: MedioDePago[];
  envio: NegocioTienda["envio"];
  pedidosCliente: ConfigPedidosCliente;
  /** «checkout» = el checkout del negocio; «whatsapp» = el mensaje armado. */
  pedido: "checkout" | "whatsapp";
  /** El acento del negocio (la imagen del pedido lo usa). */
  acento: string;
  /** id → código interno legible (AB-12), sólo los que tienen letras: el mensaje los escribe. */
  codigos: Record<number, string>;
  /** El catálogo (adonde va «Seguir comprando» y el respaldo de «Finalizar compra»). */
  catalogo: string;
}

export function datosBolsa(d: DatosTienda): DatosBolsa {
  const n = d.negocio;
  const codigos: Record<number, string> = {};
  for (const p of d.productos) {
    const c = codigoLegible(p.codigo);
    if (c) codigos[p.id] = c;
  }
  return {
    slug: n.slug,
    nombre: n.nombre,
    logo: n.logo,
    whatsapp: n.whatsapp,
    direccion: n.direccion,
    pagos: n.pagos,
    envio: n.envio,
    pedidosCliente: n.pedidosCliente,
    // Sin WhatsApp no hay a quién mandarle el mensaje: el checkout de siempre.
    pedido: d.contenido.pedido === "whatsapp" && n.whatsapp ? "whatsapp" : "checkout",
    acento: d.tema.acento,
    codigos,
    catalogo: rutasTienda(n.slug).catalogo,
  };
}
