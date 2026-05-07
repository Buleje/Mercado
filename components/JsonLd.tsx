/**
 * JsonLd — Componente universal para renderizar structured data.
 *
 * SECURITY 2026-05-06: usa `safeJsonLdStringify` para evitar XSS stored.
 * Antes `JSON.stringify(data)` no escapaba `</script>`, lo que permitía a
 * cualquier vendor inyectar JS via `product.name = "</script><script>...".
 * Ahora se escapa `<`, `>`, `&`,  y  para neutralizar el vector.
 *
 * Uso:
 * <JsonLd data={{ "@context": "https://schema.org", "@type": "Product", ... }} />
 */

import { safeJsonLdStringify } from "@/lib/seo/json-ld";

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(data) }}
      suppressHydrationWarning
    />
  );
}

export default JsonLd;
