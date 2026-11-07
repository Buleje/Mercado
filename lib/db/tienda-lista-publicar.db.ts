import "server-only";
import { prisma } from "@/lib/prisma";
import { MIN_PRODUCTOS_LISTOS, type ListaPublicar } from "@/lib/marketplace/lista-publicar";

export type { ListaPublicar };

/**
 * «¿Mi tienda está lista para publicar?» — lo que el vecino ve en el
 * marketplace, medido en la base (09-10: main tenía 56 productos e
 * isPublished=false; 2 de 5 publicadas sin logo o ubicación; «demo» publicada
 * con 0 productos). `calcular` solo lee.
 *
 * - `ubicacion`: el marketplace ubica la tienda con Store.lat/lng («cerca de
 *   ti», mapa). El dueño la marca en Ajustes › Datos del negocio
 *   (Settings.businessLat); `copiarUbicacionDeAjustes` la pasa a la tienda al
 *   guardar (PUT /api/marketplace/stores). «solo-ajustes» = marcada pero aún
 *   sin copiar.
 * - `horario`: Store.hoursJson (columna fuera del schema Prisma → raw SQL).
 * - Producto «listo» = activo en la tienda, producto activo y no borrado, con
 *   foto y con stock > 0 (el mismo corte que la vitrina pública).
 */

export const TiendaListaPublicarDB = {
  async calcular(tenantId: string, storeId: string): Promise<ListaPublicar | null> {
    const store = await prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { logo: true, lat: true, lng: true },
    });
    if (!store) return null;

    const base = { storeId, isActive: true, product: { active: true, deletedAt: null } } as const;
    const [settings, horas, activos, conFoto, conStock, listos] = await Promise.all([
      prisma.settings.findUnique({
        where: { tenantId },
        select: { businessLat: true, businessLon: true },
      }),
      prisma.$queryRaw<Array<{ tiene: boolean }>>`
        SELECT ("hoursJson" IS NOT NULL AND "hoursJson"::text NOT IN ('null', '{}', '[]')) AS tiene
        FROM "Store" WHERE id = ${storeId} AND "tenantId" = ${tenantId} LIMIT 1
      `,
      prisma.storeProduct.count({ where: base }),
      prisma.storeProduct.count({
        where: { ...base, product: { ...base.product, image: { not: "" } } },
      }),
      prisma.storeProduct.count({
        where: { ...base, product: { ...base.product, stock: { gt: 0 } } },
      }),
      prisma.storeProduct.count({
        where: { ...base, product: { ...base.product, image: { not: "" }, stock: { gt: 0 } } },
      }),
    ]);

    const enTienda = store.lat != null && store.lng != null;
    const enAjustes = settings?.businessLat != null && settings?.businessLon != null;

    return {
      logo: Boolean(store.logo && store.logo.trim()),
      ubicacion: enTienda ? "tienda" : enAjustes ? "solo-ajustes" : "falta",
      horario: Boolean(horas[0]?.tiene),
      productos: { activos, conFoto, conStock, listos },
      minimoListos: MIN_PRODUCTOS_LISTOS,
    };
  },

  /**
   * Copia Settings.businessLat/Lon (Ajustes › Negocio) a Store.lat/lng si la
   * tienda todavía no tiene punto propio. Nunca pisa un punto ya puesto (09-10:
   * nada en la app escribía Store.lat → 10 de 14 tiendas sin ubicación y
   * «Publicar mi tienda» bloqueado para siempre). Devuelve true si copió.
   */
  async copiarUbicacionDeAjustes(tenantId: string, storeId: string): Promise<boolean> {
    const settings = await prisma.settings.findUnique({
      where: { tenantId },
      select: { businessLat: true, businessLon: true },
    });
    const lat = settings?.businessLat;
    const lng = settings?.businessLon;
    if (lat == null || lng == null) return false;
    const { count } = await prisma.store.updateMany({
      where: { id: storeId, tenantId, OR: [{ lat: null }, { lng: null }] },
      data: { lat, lng },
    });
    return count > 0;
  },
};
