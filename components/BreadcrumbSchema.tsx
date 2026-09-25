import BreadcrumbTrail from "@/components/BreadcrumbTrail";

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbSchemaProps {
  items: BreadcrumbItem[];
  /** Show visible breadcrumb nav in addition to schema. Defaults to true. */
  visible?: boolean;
}

/**
 * Convert an absolute URL (https://www.buleje.pe/foo) to a path-only ("/foo")
 * for client-side navigation. Schema.org JSON-LD still uses the absolute form
 * because Google requires it, but visible <Link href> must be relative so the
 * navigation works in localhost / staging / preview deployments.
 */
function toPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // Already a path or malformed — return as-is.
    return url;
  }
}

export default function BreadcrumbSchema({ items, visible = true }: BreadcrumbSchemaProps) {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: {
        "@type": "WebPage",
        "@id": item.url,
        url: item.url,
        name: item.name,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {visible && (
        <BreadcrumbTrail items={items.map((item) => ({ name: item.name, href: toPath(item.url) }))} />
      )}
    </>
  );
}
