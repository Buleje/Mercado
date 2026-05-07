import type { Product } from "@/data/products";

interface ProductSchemaProps {
  products: Product[];
}

export default function ProductSchema({ products }: ProductSchemaProps) {
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: product.name,
        description: `${product.name} - ${product.category}`,
        image: `https://www.buleje.pe${product.image}`,
        sku: product.id,
        brand: {
          "@type": "Brand",
          name: "Buleje",
        },
        offers: {
          "@type": "Offer",
          url: "https://www.buleje.pe/tienda",
          priceCurrency: "PEN",
          price: Number(product.price).toFixed(2),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Product type may have stock field from API
          availability: (product as any).stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          seller: {
            "@type": "Organization",
            name: "Buleje",
          },
        },
        ...(product.badge && {
          additionalProperty: {
            "@type": "PropertyValue",
            name: "Badge",
            value: product.badge,
          },
        }),
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
    />
  );
}
