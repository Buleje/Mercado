/**
 * JsonLd — Componente universal para renderizar structured data.
 * 
 * Uso:
 * <JsonLd data={{ "@context": "https://schema.org", "@type": "Product", ... }} />
 */

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      suppressHydrationWarning
    />
  );
}

export default JsonLd;
