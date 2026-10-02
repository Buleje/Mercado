/**
 * Lo que la página de «Buleje Beauty» lee de la base, una vez por pedido.
 *
 * Todo por DB classes con `ctx.tenantId` (ADR-457). Nada se inventa:
 * · Sólo productos ACTIVOS y VISIBLES en Mi Tienda, de las categorías de belleza.
 * · «Antes» = el último cambio de precio del historial que dejó el precio de
 *   hoy (`oldPrice` > precio). Sin ese registro, no hay «antes» ni %.
 * · Si una lectura falla, la sección se ve vacía (con su aviso), no la página.
 */
import "server-only";
import { cache } from "react";
import { PriceHistoryDB, ProductsDB } from "@/lib/db/products.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { StorePageDB } from "@/lib/db/store-page.db";
import { slugify } from "@/data/products";
import { sinDato } from "@/lib/errores/sin-dato";
import { CATEGORIA_SERVICIOS, CATEGORIAS } from "./anuncios";

export interface ProductoSalon {
  id: number;
  nombre: string;
  marca: string | null;
  categoria: string;
  precio: number;
  /** Precio anterior según el historial; null si no hubo rebaja. */
  antes: number | null;
  /** % de rebaja redondeado, calculado de `antes` y `precio`. */
  descuento: number | null;
  imagen: string;
  descripcion: string | null;
  stock: number | null;
  unidad: string;
  /** El badge que puso el dueño (Nuevo, Favorito…), sin los de descuento. */
  etiqueta: string | null;
  duracion: string | null;
  /** Ficha del producto en el catálogo de la tienda. */
  href: string;
}

export interface DatosSalon {
  nombre: string;
  descripcion: string | null;
  productos: ProductoSalon[];
  servicios: ProductoSalon[];
  /** Número de WhatsApp en formato internacional sin «+» (p. ej. 51987654321), o null. */
  whatsapp: string | null;
  horario: string | null;
  direccion: string | null;
  redes: { facebook?: string; instagram?: string; tiktok?: string };
  /** El mayor % de rebaja real de la tienda (para la franja). */
  mayorDescuento: number | null;
  /** Medios de pago prendidos en Ajustes, en una frase («Yape o efectivo contra entrega»); null si ninguno. */
  pagos: string | null;
}

/** «a», «a o b», «a, b o c». */
function lista(xs: string[]): string | null {
  if (xs.length === 0) return null;
  return xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} o ${xs[xs.length - 1]}`;
}

const NOMBRES_BELLEZA = new Set<string>(CATEGORIAS.map((c) => c.nombre));

/** Deja sólo dígitos y antepone 51 a un celular peruano de 9 dígitos. */
export function normalizarWhatsapp(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null;
  const d = crudo.replace(/\D/g, "");
  if (d.length === 9 && d.startsWith("9")) return `51${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Badge del dueño que NO es un descuento (esos se calculan del historial). */
const etiquetaDe = (badge: string | undefined) => (badge && !/%|dscto|oferta/i.test(badge) ? badge : null);

export const cargarSalon = cache(async (tenantId: string, slug: string): Promise<DatosSalon> => {
  const [productos, catalogo, ajustes, pagina] = await Promise.all([
    ProductsDB.getAll(tenantId).catch(sinDato("página salón · productos")),
    StorePageDB.listCatalogWithVisibility(tenantId).catch(sinDato("página salón · visibilidad")),
    SettingsDB.get(tenantId).catch(sinDato("página salón · ajustes")),
    StorePageDB.getCustomization(tenantId).catch(sinDato("página salón · portada")),
  ]);

  const visibles = new Set((catalogo ?? []).filter((c) => c.visible && c.active).map((c) => c.productId));
  const propios = (productos ?? []).filter(
    (p) =>
      p.active !== false &&
      visibles.has(p.id) &&
      (NOMBRES_BELLEZA.has(p.category) || p.category === CATEGORIA_SERVICIOS),
  );

  const historial = await PriceHistoryDB.getByProducts(
    tenantId,
    propios.map((p) => p.id),
  ).catch(sinDato("página salón · historial de precios"));

  const base = `/t/${encodeURIComponent(slug)}/tienda`;
  const aSalon = (p: (typeof propios)[number]): ProductoSalon => {
    // El historial viene del más nuevo al más viejo: el primero que dejó el precio de hoy.
    const cambio = historial?.[p.id]?.find((h) => Math.abs(h.newPrice - p.price) < 0.005);
    const antes = cambio && cambio.oldPrice > p.price ? cambio.oldPrice : null;
    return {
      id: p.id,
      nombre: p.name,
      marca: p.brand?.trim() || null,
      categoria: p.category,
      precio: p.price,
      antes,
      descuento: antes ? Math.round(((antes - p.price) / antes) * 100) : null,
      imagen: p.image || "",
      descripcion: p.description?.trim() || null,
      stock: typeof p.stock === "number" ? p.stock : null,
      unidad: p.unit || "und",
      etiqueta: etiquetaDe(p.badge),
      duracion: p.durationLabel?.trim() || null,
      href: `${base}/${slugify(p.name)}`,
    };
  };

  const todos = propios.map(aSalon);
  const servicios = todos.filter((p) => p.categoria === CATEGORIA_SERVICIOS);
  const enVenta = todos.filter((p) => p.categoria !== CATEGORIA_SERVICIOS);
  const st = (ajustes?.storeTheme ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const descuentos = enVenta.map((p) => p.descuento ?? 0);

  return {
    nombre: texto(st.storeName) ?? texto(ajustes?.businessName) ?? "Buleje Beauty",
    descripcion: texto(st.description) ?? texto(ajustes?.description),
    productos: enVenta,
    servicios,
    whatsapp:
      normalizarWhatsapp(st.whatsapp) ??
      normalizarWhatsapp(pagina?.whatsappPhone) ??
      normalizarWhatsapp(ajustes?.businessPhone),
    horario: texto(ajustes?.hours),
    direccion: texto(pagina?.address) ?? texto(ajustes?.businessAddress),
    redes: ajustes?.socialLinks ?? {},
    mayorDescuento: descuentos.length && Math.max(...descuentos) > 0 ? Math.max(...descuentos) : null,
    pagos: lista(
      [ajustes?.yapeEnabled ? "Yape" : "", ajustes?.plinEnabled ? "Plin" : "", ajustes?.cashEnabled !== false ? "efectivo contra entrega" : ""].filter(Boolean),
    ),
  };
});

/** El mayor % de rebaja real dentro de un grupo (categoría o marca). */
export function mayorDescuentoDe(productos: ProductoSalon[], grupo: { categoria: string } | { marca: string }): number | null {
  const del = productos.filter((p) => ("categoria" in grupo ? p.categoria === grupo.categoria : p.marca === grupo.marca));
  const max = Math.max(0, ...del.map((p) => p.descuento ?? 0));
  return max > 0 ? max : null;
}
