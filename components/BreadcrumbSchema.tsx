import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";

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
        <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <ol className="flex items-center gap-1 text-sm text-muted flex-wrap">
            {items.map((item, i) => {
              const isLast = i === items.length - 1;
              return (
                <li key={item.url} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted/50 shrink-0" />}
                  {isLast ? (
                    <span className="font-medium text-[var(--text-primary)] truncate max-w-48">{item.name}</span>
                  ) : (
                    <Link href={toPath(item.url)} className="hover:text-primary transition-colors truncate max-w-36">
                      {item.name}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </>
  );
}
