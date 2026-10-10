/**
 * Lo que «Musa» lee de la base, una vez por pedido (`cache` de React).
 *
 * Dos lecturas, para que cada página pague sólo lo que dibuja (ADR-460):
 * · `cargarMarco` — LIVIANA: el nombre, contacto, redes, pagos y qué
 *   categorías tienen productos. La usan el encabezado y el pie en TODAS las
 *   páginas de la tienda (cuenta, pedidos, legales…).
 * · `cargarVitrina` — los productos y servicios con su precio y su «antes».
 *   La usan la portada y el catálogo.
 * `cargarSalon` = las dos juntas (la portada).
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
import type { CodigosProductos } from "./PedirPorWhatsapp";
import { esPorEncargo, WHATSAPP_MUSA } from "./pedido-whatsapp";

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
  /** El badge que puso el dueño (Preventa, Por encargo…), sin los de descuento. */
  etiqueta: string | null;
  /** El código del catálogo (`barcode`: MU001, KT02…); se pide por código. */
  codigo: string | null;
  duracion: string | null;
  /** Ficha del producto en el catálogo de la tienda. */
  href: string;
  /** Kit o dúo: qué trae y cuánto ahorras frente a comprar cada cosa (null en un producto suelto). */
  kit: KitSalon | null;
}

/** Lo que trae un kit, con los precios de HOY de la base (nunca escritos a mano). */
export interface KitSalon {
  componentes: { id: number; codigo: string; nombre: string; precio: number; cantidad: number; href: string }[];
  /** Σ precio × cantidad de los componentes. */
  porSeparado: number;
  /** porSeparado − precio del kit; la tarjeta lo muestra sólo si es > 0. */
  ahorro: number;
}

/**
 * Qué trae cada kit y dúo (manual §5, «Kits»). Sólo la RECETA: los precios
 * salen de la base cada vez, así «por separado» nunca miente si un precio cambia.
 * Cuentas del 10-10 (cierran con el manual): KT01 167/18 · KT02 197/18 ·
 * KT03 177/18 · KT04 177/18 · KT05 138/13 · MU016-2 78/9 · MU013-2 158/9.
 */
export const COMPOSICION_KITS: Readonly<Record<string, readonly { codigo: string; cantidad: number }[]>> = {
  KT01: [
    { codigo: "MU001", cantidad: 1 },
    { codigo: "MU002", cantidad: 1 },
    { codigo: "MU005", cantidad: 1 },
  ],
  KT02: [
    { codigo: "MU009", cantidad: 1 },
    { codigo: "MU011", cantidad: 1 },
    { codigo: "MU013", cantidad: 1 },
  ],
  KT03: [
    { codigo: "MU001", cantidad: 1 },
    { codigo: "MU003", cantidad: 1 },
    { codigo: "MU005", cantidad: 1 },
  ],
  KT04: [
    { codigo: "MU012", cantidad: 1 },
    { codigo: "MU015", cantidad: 1 },
    { codigo: "MU016", cantidad: 1 },
  ],
  KT05: [
    { codigo: "MU013", cantidad: 1 },
    { codigo: "MU020", cantidad: 1 },
  ],
  "MU016-2": [{ codigo: "MU016", cantidad: 2 }],
  "MU013-2": [{ codigo: "MU013", cantidad: 2 }],
};

/** El kit de `codigo` con los productos de hoy; null si no es kit o le falta un componente (oculto o inactivo). */
export function armarKit(codigo: string | null, precio: number, productos: readonly Pick<ProductoSalon, "id" | "codigo" | "nombre" | "precio" | "href">[]): KitSalon | null {
  const receta = codigo ? COMPOSICION_KITS[codigo] : undefined;
  if (!receta) return null;
  const componentes: KitSalon["componentes"] = [];
  for (const r of receta) {
    const x = productos.find((p) => p.codigo === r.codigo);
    if (!x) return null;
    componentes.push({ id: x.id, codigo: r.codigo, nombre: x.nombre, precio: x.precio, cantidad: r.cantidad, href: x.href });
  }
  const porSeparado = Math.round(componentes.reduce((s, c) => s + c.precio * c.cantidad, 0) * 100) / 100;
  return { componentes, porSeparado, ahorro: Math.round((porSeparado - precio) * 100) / 100 };
}

export interface DatosMarco {
  nombre: string;
  descripcion: string | null;
  /** Número de WhatsApp en formato internacional sin «+» (p. ej. 51987654321), o null. */
  whatsapp: string | null;
  horario: string | null;
  direccion: string | null;
  redes: { facebook?: string; instagram?: string; tiktok?: string };
  /** Medios de pago prendidos en Ajustes, en una frase («Yape o efectivo contra entrega»); null si ninguno. */
  pagos: string | null;
  /** Las categorías de belleza con algún producto activo, en el orden de `CATEGORIAS`. */
  categorias: string[];
  /** Código (`barcode`: MU001, KT02…) y «por encargo» de cada producto, por id: los usa el pedido por WhatsApp. */
  codigos: CodigosProductos;
}

export interface DatosVitrina {
  productos: ProductoSalon[];
  servicios: ProductoSalon[];
  /** El mayor % de rebaja real de la tienda (para la franja). */
  mayorDescuento: number | null;
}

export type DatosSalon = DatosMarco & DatosVitrina;

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
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** La lista de productos del negocio (la DB class ya la guarda en caché): la comparten marco y vitrina. */
/** Preventa o por encargo: se vende sin existencias. */
const bajoPedido = (badge: string | null | undefined) => esPorEncargo(badge) || /^preventa$/i.test((badge ?? "").trim());

const leerProductos = cache((tenantId: string) => ProductsDB.getAll(tenantId).catch(sinDato("página salón · productos")));

export const cargarMarco = cache(async (tenantId: string): Promise<DatosMarco> => {
  const [ajustes, pagina, productos] = await Promise.all([
    SettingsDB.get(tenantId).catch(sinDato("página salón · ajustes")),
    StorePageDB.getCustomization(tenantId).catch(sinDato("página salón · portada")),
    leerProductos(tenantId),
  ]);
  const st = (ajustes?.storeTheme ?? {}) as Record<string, unknown>;
  const conProductos = new Set((productos ?? []).filter((p) => p.active !== false).map((p) => p.category));
  return {
    nombre: texto(st.storeName) ?? texto(ajustes?.businessName) ?? "Musa",
    descripcion: texto(st.description) ?? texto(ajustes?.description),
    whatsapp:
      normalizarWhatsapp(st.whatsapp) ??
      normalizarWhatsapp(pagina?.whatsappPhone) ??
      normalizarWhatsapp(ajustes?.businessPhone) ??
      WHATSAPP_MUSA,
    horario: texto(ajustes?.hours),
    direccion: texto(pagina?.address) ?? texto(ajustes?.businessAddress),
    redes: ajustes?.socialLinks ?? {},
    pagos: lista(
      [ajustes?.yapeEnabled ? "Yape" : "", ajustes?.plinEnabled ? "Plin" : "", ajustes?.cashEnabled !== false ? "efectivo contra entrega" : ""].filter(Boolean),
    ),
    categorias: CATEGORIAS.map((c) => c.nombre).filter((c) => conProductos.has(c)),
    // Nombre, precio, imagen y componentes: los usa «Drucila te sugiere» en la bolsa (SugerenciaKit);
    // sólo un kit ACTIVO lleva `componentes`, así nunca se sugiere uno apagado.
    codigos: Object.fromEntries(
      (productos ?? []).map((p) => {
        const codigo = p.barcode?.trim() || null;
        const receta = codigo && p.active !== false ? COMPOSICION_KITS[codigo] : undefined;
        return [
          String(p.id),
          {
            codigo,
            encargo: esPorEncargo(p.badge),
            nombre: p.name,
            precio: p.price,
            imagen: p.image || "",
            categoria: p.category,
            unidad: p.unit,
            ...(receta ? { componentes: receta.flatMap((r) => Array.from({ length: r.cantidad }, () => r.codigo)) } : {}),
          },
        ];
      }),
    ),
  };
});

export const cargarVitrina = cache(async (tenantId: string, slug: string): Promise<DatosVitrina> => {
  // Velocidad (08-10): la lista de productos ya está en caché, así que de ahí salen los
  // candidatos y las dos lecturas que faltan van A LA VEZ (antes: visibilidad → historial,
  // en fila, y la visibilidad volvía a traer todos los productos sin caché = 3 viajes a la
  // base por visita; ahora 1). Oculto = un override con `visible: false` (Mi Tienda →
  // Catálogo); sin override, se ve. Si la visibilidad no se pudo leer, no se muestra nada
  // (como antes): mejor la vitrina vacía con su aviso que un producto que el dueño ocultó.
  const productos = await leerProductos(tenantId);
  const candidatos = (productos ?? []).filter(
    (p) => p.active !== false && (NOMBRES_BELLEZA.has(p.category) || p.category === CATEGORIA_SERVICIOS),
  );
  const [overrides, historial] = await Promise.all([
    StorePageDB.listOverrides(tenantId).catch(sinDato("página salón · visibilidad")),
    PriceHistoryDB.getByProducts(
      tenantId,
      candidatos.map((p) => p.id),
    ).catch(sinDato("página salón · historial de precios")),
  ]);
  const ocultos = new Set((overrides ?? []).filter((o) => !o.visible).map((o) => o.productId));
  const propios = overrides ? candidatos.filter((p) => !ocultos.has(p.id)) : [];

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
      // Preventa y «Por encargo» se piden aunque no haya existencias (Musa los trae al confirmar el pago):
      // sin stock que mostrar, la tarjeta no dice «Agotado».
      stock: typeof p.stock === "number" && !bajoPedido(p.badge) ? p.stock : null,
      unidad: p.unit || "und",
      etiqueta: etiquetaDe(p.badge),
      codigo: p.barcode?.trim() || null,
      duracion: p.durationLabel?.trim() || null,
      href: `${base}/${slugify(p.name)}`,
      kit: null,
    };
  };

  const sueltos = propios.map(aSalon);
  // Los kits se arman con los precios de hoy de sus componentes (en el servidor: el cliente no suma).
  const todos = sueltos.map((p) => (COMPOSICION_KITS[p.codigo ?? ""] ? { ...p, kit: armarKit(p.codigo, p.precio, sueltos) } : p));
  const enVenta = todos.filter((p) => p.categoria !== CATEGORIA_SERVICIOS);
  const mayor = Math.max(0, ...enVenta.map((p) => p.descuento ?? 0));
  return {
    productos: enVenta,
    servicios: todos.filter((p) => p.categoria === CATEGORIA_SERVICIOS),
    mayorDescuento: mayor > 0 ? mayor : null,
  };
});

export const cargarSalon = cache(async (tenantId: string, slug: string): Promise<DatosSalon> => {
  const [marco, vitrina] = await Promise.all([cargarMarco(tenantId), cargarVitrina(tenantId, slug)]);
  return { ...marco, ...vitrina };
});

/** El mayor % de rebaja real dentro de un grupo (categoría o marca). */
export function mayorDescuentoDe(productos: ProductoSalon[], grupo: { categoria: string } | { marca: string }): number | null {
  const del = productos.filter((p) => ("categoria" in grupo ? p.categoria === grupo.categoria : p.marca === grupo.marca));
  const max = Math.max(0, ...del.map((p) => p.descuento ?? 0));
  return max > 0 ? max : null;
}
