/**
 * ItemListJsonLd — componente reutilizable para emitir JSON-LD `ItemList`
 * en páginas con listados de productos, tiendas, recetas, artículos.
 *
 * Por qué SEO: Google usa `ItemList` para rich results (lista numerada en
 * el SERP). Específicamente útil para:
 *   - /marketplace → lista de bodegas/tiendas
 *   - /marketplace/ofertas → lista de ofertas
 *   - /recetas → lista de recetas
 *   - /marketplace/[slug] → lista de productos de la tienda
 *   - /zona/[ciudad] → lista de bodegas en la ciudad
 *
 * Uso:
 *   <ItemListJsonLd
 *     name="Bodegas en Lima"
 *     description="20 bodegas y tiendas con delivery en Lima."
 *     url="https://www.buleje.pe/marketplace?zona=lima"
 *     items={stores.map((s, i) => ({
 *       position: i + 1,
 *       name: s.name,
 *       url: `https://www.buleje.pe/marketplace/${s.slug}`,
 *       image: s.logo,
 *       description: s.description,
 *     }))}
 *   />
 *
 * Referencia: https://schema.org/ItemList
 */

export interface ItemListItem {
  position: number;
  name: string;
  url: string;
  image?: string | null;
  description?: string | null;
  /** Para products específicos: precio, moneda y disponibilidad. */
  offers?: {
    price: number;
    priceCurrency?: string;
    availability?: "InStock" | "OutOfStock" | "PreOrder";
  };
  /** Para ratings (solo si son reales — sin fallback fake). */
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
}

interface Props {
  /** Nombre de la lista (ej. "Bodegas en Lima"). */
  name: string;
  /** Descripción de la lista. */
  description?: string;
  /** URL canonical de la página que contiene la lista. */
  url?: string;
  items: ItemListItem[];
  /** Tipo de items. Default: "Thing" (genérico). Usar "Product", "LocalBusiness", etc. */
  itemType?: "Thing" | "Product" | "LocalBusiness" | "Store" | "Restaurant" | "Recipe";
  /** Si true, emite `ItemList` con `itemListElement` siendo `ListItem.item` anidado.
      Si false, emite `url`-only format más simple. Default: true (más rico). */
  detailed?: boolean;
}

export default function ItemListJsonLd({
  name,
  description,
  url,
  items,
  itemType = "Thing",
  detailed = true,
}: Props) {
  if (items.length === 0) return null;

  const buildItemElement = (item: ItemListItem) => {
    if (!detailed) {
      return {
        "@type": "ListItem",
        position: item.position,
        url: item.url,
      };
    }

    const itemData: Record<string, unknown> = {
      "@type": itemType,
      name: item.name,
      url: item.url,
    };
    if (item.image) itemData.image = item.image;
    if (item.description) itemData.description = item.description;
    if (item.offers) {
      itemData.offers = {
        "@type": "Offer",
        price: item.Number(offers.price).toFixed(2),
        priceCurrency: item.offers.priceCurrency ?? "PEN",
        availability: `https://schema.org/${item.offers.availability ?? "InStock"}`,
      };
    }
    if (item.aggregateRating && item.aggregateRating.reviewCount > 0) {
      itemData.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: item.Number(aggregateRating.ratingValue).toFixed(1),
        reviewCount: item.aggregateRating.reviewCount,
        bestRating: 5,
        worstRating: 1,
      };
    }

    return {
      "@type": "ListItem",
      position: item.position,
      item: itemData,
    };
  };

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: items.map(buildItemElement),
  };
  if (description) jsonLd.description = description;
  if (url) jsonLd.url = url;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
