import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import type { ProductoDelFeed } from "@/lib/tienda-publica/feed-productos";

/**
 * CatalogoPublicoDB — lo que un negocio muestra al público de SU tienda, para
 * el feed de Google/Meta (`/api/shopping-feed`), el catálogo público
 * (`/api/store-page/public-catalog`) y los enlaces para compartir
 * (`/api/products/share`).
 *
 * Reglas (las mismas que la tienda `/t/<slug>/tienda`):
 *  - `tenantId` en el WHERE de cada consulta (producto, imágenes y ocultos):
 *    el catálogo de un negocio nunca trae productos de otro.
 *  - Activo, sin borrar y sin ocultar en «Página de la tienda»
 *    (`TenantPageProductOverride.visible = false`).
 *  - Nada de costo ni cantidad en stock: solo `disponible` (sí/no).
 *
 * Caché: `"use cache"` con la etiqueta `tenant:<id>:products` que ya
 * invalidan las escrituras de `ProductsDB` (precio, stock, alta, baja). Ocultar
 * un producto en la página de la tienda se nota a los 5 min (revalidate).
 */

export interface NegocioDelCatalogo {
  id: string;
  slug: string;
  nombre: string;
  dominioPropio: string | null;
  activo: boolean;
}

const SELECT_PUBLICO = {
  id: true,
  name: true,
  category: true,
  unit: true,
  price: true,
  image: true,
  description: true,
  brand: true,
  barcode: true,
  badge: true,
  stock: true,
} as const;

type FilaPublica = {
  id: number;
  name: string;
  category: string;
  unit: string;
  price: Parameters<typeof toNumOrZero>[0];
  image: string;
  description: string | null;
  brand: string | null;
  barcode: string | null;
  badge: string | null;
  stock: number | null;
  images?: Array<{ url: string }>;
};

function aProductoPublico(f: FilaPublica): ProductoDelFeed {
  return {
    id: f.id,
    nombre: f.name,
    categoria: f.category,
    unidad: f.unit,
    precio: toNumOrZero(f.price),
    imagen: f.image,
    imagenesExtra: (f.images ?? []).map((i) => i.url),
    descripcion: f.description,
    marca: f.brand,
    codigoBarras: f.barcode,
    etiqueta: f.badge,
    disponible: f.stock === null || f.stock > 0,
  };
}

export const CatalogoPublicoDB = {
  /** Datos públicos del negocio (para el nombre y la dirección de su tienda). */
  async negocio(tenantId: string): Promise<NegocioDelCatalogo | null> {
    if (!tenantId) return null;
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, name: true, customDomain: true, active: true },
    });
    if (!t) return null;
    return { id: t.id, slug: t.slug, nombre: t.name, dominioPropio: t.customDomain, activo: t.active };
  },

  /** Los productos que la tienda del negocio muestra, del id menor al mayor. */
  async productos(tenantId: string): Promise<ProductoDelFeed[]> {
    "use cache";
    cacheLife({ revalidate: 300, stale: 60, expire: 1800 });
    cacheTag(`tenant:${tenantId}:products`, `tenant:${tenantId}:catalogo-publico`);
    if (!tenantId) return [];

    const [filas, ocultos] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId, active: true, deletedAt: null },
        orderBy: { id: "asc" },
        select: {
          ...SELECT_PUBLICO,
          images: { where: { tenantId }, select: { url: true }, orderBy: { position: "asc" }, take: 10 },
        },
      }),
      prisma.tenantPageProductOverride.findMany({
        where: { tenantId, visible: false },
        select: { productId: true },
      }),
    ]);
    const oculto = new Set(ocultos.map((o) => o.productId));
    return filas.filter((f) => !oculto.has(f.id)).map(aProductoPublico);
  },

  /** Un producto público del negocio, o `null` (de otro negocio, inactivo u oculto). */
  async producto(tenantId: string, productId: number): Promise<ProductoDelFeed | null> {
    if (!tenantId || !Number.isInteger(productId)) return null;
    const [fila, oculto] = await Promise.all([
      prisma.product.findFirst({
        where: { id: productId, tenantId, active: true, deletedAt: null },
        select: SELECT_PUBLICO,
      }),
      prisma.tenantPageProductOverride.findFirst({
        where: { tenantId, productId, visible: false },
        select: { id: true },
      }),
    ]);
    if (!fila || oculto) return null;
    return aProductoPublico(fila);
  },
};
