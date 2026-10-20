/**
 * Lo que la tienda de CUALQUIER negocio lee de la base, una vez por pedido
 * (`cache` de React). Nació de `pagina-musa/datos.ts` pero sin nada fijo de
 * Musa (ADR-511): categorías, círculos, héroe, franja y confianza salen de los
 * datos del negocio; lo que falta no se inventa. El armado puro vive en
 * `armado.ts` (probado con datos faltantes).
 *
 * Todo por DB classes con `ctx.tenantId`. Sólo productos ACTIVOS y VISIBLES
 * en Mi Tienda (override `visible: false` = oculto).
 */
import "server-only";
import { cache } from "react";
import { PriceHistoryDB, ProductsDB } from "@/lib/db/products.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { StorePageDB } from "@/lib/db/store-page.db";
import { slugify } from "@/data/products";
import { sinDato } from "@/lib/errores/sin-dato";
import { leerConfigPedidos } from "@/lib/tienda-cliente/config";
import type { ContextoPieza } from "../_contrato";
import { leerFicha, presentacionDe } from "../pagina-musa/presentacion";
import { antesDe, armarCirculos, armarConfianza, armarFranja, armarHeroe, normalizarWhatsapp, ordenarCategorias, pagosDe } from "./armado";
import { BLOQUES_POR_DEFECTO, leerPlantilla } from "./config";
import type { DatosTienda, NegocioTienda, ProductoTienda } from "./contenido";
import { temaDe } from "./tema";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const cargar = cache(async (tenantId: string, slug: string): Promise<DatosTienda> => {
  const [ajustes, pagina, productos, overrides] = await Promise.all([
    SettingsDB.get(tenantId).catch(sinDato("tienda · ajustes")),
    StorePageDB.getCustomization(tenantId).catch(sinDato("tienda · portada")),
    ProductsDB.getAll(tenantId).catch(sinDato("tienda · productos")),
    StorePageDB.listOverrides(tenantId).catch(sinDato("tienda · visibilidad")),
  ]);
  const st = (ajustes?.storeTheme ?? {}) as Record<string, unknown>;
  const plantilla = leerPlantilla(st);

  // Si no se pudo leer la visibilidad, no se muestra nada: mejor la vitrina vacía que un producto oculto por el dueño.
  const ocultos = new Set((overrides ?? []).filter((o) => !o.visible).map((o) => o.productId));
  const propios = overrides ? (productos ?? []).filter((p) => p.active !== false && !ocultos.has(p.id)) : [];
  const historial = await PriceHistoryDB.getByProducts(tenantId, propios.map((p) => p.id)).catch(sinDato("tienda · historial de precios"));

  const base = `/t/${encodeURIComponent(slug)}/tienda`;
  const lista: ProductoTienda[] = propios.map((p) => {
    const { antes, descuento } = antesDe(p.price, historial?.[p.id]);
    const ficha = leerFicha(p.specsJson);
    const nombre = p.name;
    const unidad = p.unit || "und";
    const descripcion = p.description?.trim() || null;
    return {
      id: p.id,
      nombre,
      marca: p.brand?.trim() || null,
      categoria: p.category,
      precio: p.price,
      antes,
      descuento,
      // Sin foto: "" (la pieza dibuja el marcador neutro, como `SmartProductImage` en la tienda general).
      imagen: p.image || "",
      descripcion,
      stock: typeof p.stock === "number" ? p.stock : null,
      unidad,
      etiqueta: p.badge?.trim() || null,
      codigo: p.barcode?.trim() || null,
      href: `${base}/${slugify(nombre)}`,
      presentacion: presentacionDe({ nombre, descripcion, unidad, ficha, kit: null }),
      ficha,
    };
  });

  const categorias = ordenarCategorias(lista, ajustes?.categoryOrder);
  const nombre = texto(st.storeName) ?? texto(ajustes?.businessName) ?? slug;
  const gratisDesde = typeof ajustes?.freeDeliveryMin === "number" && ajustes.freeDeliveryMin > 0 ? ajustes.freeDeliveryMin : null;
  const negocio: NegocioTienda = {
    tenantId,
    slug,
    nombre,
    lema: texto(ajustes?.slogan),
    descripcion: texto(st.description) ?? texto(ajustes?.description),
    logo: texto(ajustes?.logoUrl),
    whatsapp: normalizarWhatsapp(st.whatsapp) ?? normalizarWhatsapp(pagina?.whatsappPhone) ?? normalizarWhatsapp(ajustes?.businessPhone),
    horario: texto(ajustes?.hours),
    direccion: texto(pagina?.address) ?? texto(ajustes?.businessAddress),
    redes: ajustes?.socialLinks ?? {},
    pagos: pagosDe(ajustes ?? {}),
    envio: {
      gratisDesde,
      zonas: (ajustes?.deliveryZones ?? []).filter((z) => z && texto(z.name)).map((z) => ({ nombre: z.name, costo: Number(z.fee) || 0 })),
    },
    /* `returnPolicyDays` vale 7 por defecto de la columna y ningún editor lo toca:
       mostrarlo sería prometer algo que el dueño no eligió. Sólo lo que guardó la tienda. */
    devolucionDias: typeof st.devolucionDias === "number" && st.devolucionDias > 0 ? st.devolucionDias : null,
    pedidosCliente: leerConfigPedidos(ajustes?.storeTheme),
  };

  const mayor = Math.max(0, ...lista.map((p) => p.descuento ?? 0));
  return {
    negocio,
    tema: temaDe(ajustes),
    contenido: {
      franja: armarFranja(st.announcements),
      heroe: armarHeroe(pagina, negocio),
      circulos: armarCirculos(categorias, lista, st.categoryBanners, ajustes?.categoryOrder),
      confianza: armarConfianza(negocio, st.trustChips),
      pedido: plantilla.pedido,
      bloques: plantilla.bloques ?? BLOQUES_POR_DEFECTO,
    },
    productos: lista,
    categorias,
    mayorDescuento: mayor > 0 ? mayor : null,
  };
});

/** La tienda del negocio de `ctx`, lista para las piezas. */
export const cargarTienda = (ctx: Pick<ContextoPieza, "tenantId" | "slug">): Promise<DatosTienda> => cargar(ctx.tenantId, ctx.slug);
