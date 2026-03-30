---
applyTo: "**/metadata*,**/layout.tsx,**/page.tsx,**/sitemap*,**/robots*"
---

# SEO & Metadata — Buleje

## Metadata estática (layout.tsx)

```typescript
// app/(store)/layout.tsx — storefront
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | Buleje",
    default: "Buleje — Abarrotes Delivery Pucallpa"
  },
  description: "Delivery de abarrotes a domicilio en Pucallpa. Productos frescos, precios bajos, entrega rápida.",
  keywords: ["bodega", "abarrotes", "delivery", "Pucallpa", "minimarket"],
  openGraph: {
    type: "website",
    locale: "es_PE",
    siteName: "Buleje"
  }
};
```

## Metadata dinámica (page.tsx con datos)

```typescript
// app/(store)/producto/[id]/page.tsx
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const product = await ProductsDB.getById(Number(params.id), "main");
  if (!product) return { title: "Producto no encontrado" };

  return {
    title: product.name,
    description: product.description ?? `Compra ${product.name} en Buleje`,
    openGraph: {
      title: product.name,
      description: product.description ?? "",
      images: [{ url: product.image, width: 800, height: 600 }]
    }
  };
}
```

## JSON-LD Schema (datos estructurados)

```tsx
// Para páginas de producto — mejora rich results en Google
export default function ProductPage({ product }: { product: Product }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.image,
    description: product.description,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: "PEN",
      availability: product.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock"
    }
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* resto del componente */}
    </>
  );
}
```

## Sitemap (app/sitemap.ts)

```typescript
import type { MetadataRoute } from "next";
import { ProductsDB } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await ProductsDB.getAll("main");

  const productUrls = products.map(p => ({
    url: `https://buleje.com/producto/${p.id}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8
  }));

  return [
    { url: "https://buleje.com", lastModified: new Date(), priority: 1 },
    { url: "https://buleje.com/tienda", lastModified: new Date(), priority: 0.9 },
    ...productUrls
  ];
}
```

## robots.txt (app/robots.ts)

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }
    ],
    sitemap: "https://buleje.com/sitemap.xml"
  };
}
```

## Open Graph images dinámicas (@vercel/og)

```typescript
// app/api/og/route.tsx — imagen dinámica para compartir
import { ImageResponse } from "next/og";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") ?? "Buleje";

  return new ImageResponse(
    <div style={{ background: "#2d6a4f", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <h1 style={{ color: "white", fontSize: 60 }}>{title}</h1>
    </div>,
    { width: 1200, height: 630 }
  );
}
```

## Gotchas

- **`generateMetadata` es async** — puede hacer queries a la DB para metadata dinámica
- **OG images** — usar `next/og` (ImageResponse), no imágenes estáticas fijas
- **Admin routes** — excluir `/admin/` de robots.txt
- **API routes** — excluir `/api/` de sitemap y robots.txt
- **Locale** — siempre `es_PE` para Perú en OpenGraph
- **`dangerouslySetInnerHTML` en JSON-LD** — único caso donde es aceptable (datos estructurados)

## Anti-patrones

- NO duplicar el title en template y en default — usar `template: "%s | Buleje"`
- NO olvidar metadata en páginas de producto — son las más importantes para SEO
- NO indexar el panel admin — `disallow: ["/admin/"]` en robots.txt
