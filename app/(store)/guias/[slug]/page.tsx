/**
 * /guias/[slug] — Guía individual Buleje.
 *
 * Server Component puro. generateStaticParams para SSG de las 15 guias mock.
 * Prose editorial con tokens DS. 0 emojis. Sin react-markdown (body como texto).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, Clock, User, Share2 } from "@buleje/design-system/icons";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { JsonLd } from "@/components/JsonLd";
import { generateArticleLD } from "@/lib/seo/json-ld";
import {
  PageTitle,
  SectionTitle,
  CardTitle,
  BodyText,
  Caption,
  Kicker,
  InfoAlert,
} from "@buleje/design-system";
import {
  getGuideBySlug,
  getRelatedGuides,
  GUIDES,
  type Guide,
} from "@/lib/mock-guides";

// Ilustraciones
const PaicheEnOlla = dynamic(
  () =>
    import("@/components/ui-system/illustrations/pucallpa-locals").then(
      (m) => m.PaicheEnOlla
    ),
  { ssr: true }
);
const BodegaAbriendo = dynamic(
  () =>
    import("@/components/ui-system/illustrations/contextual").then(
      (m) => m.BodegaAbriendo
    ),
  { ssr: true }
);
const DoniaElena = dynamic(
  () =>
    import("@/components/ui-system/illustrations/pucallpa-locals").then(
      (m) => m.DoniaElena
    ),
  { ssr: true }
);
const CanastaVacia = dynamic(
  () =>
    import("@/components/ui-system/illustrations/empty-states").then(
      (m) => m.CanastaVacia
    ),
  { ssr: true }
);
const PedidoLlegando = dynamic(
  () =>
    import("@/components/ui-system/illustrations/empty-states").then(
      (m) => m.PedidoLlegando
    ),
  { ssr: true }
);
const CorazonLatiendo = dynamic(
  () =>
    import("@/components/ui-system/illustrations/contextual").then(
      (m) => m.CorazonLatiendo
    ),
  { ssr: true }
);
const CuadernoFiadoReal = dynamic(
  () =>
    import("@/components/ui-system/illustrations/pucallpa-locals").then(
      (m) => m.CuadernoFiadoReal
    ),
  { ssr: true }
);
const BodegueroCelebrando = dynamic(
  () =>
    import("@/components/ui-system/illustrations/success-moments").then(
      (m) => m.BodegueroCelebrando
    ),
  { ssr: true }
);

const IllustrationMap: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  PaicheEnOlla,
  BodegaAbriendo,
  DoniaElena,
  CanastaVacia,
  PedidoLlegando,
  CorazonLatiendo,
  CuadernoFiadoReal,
  BodegueroCelebrando,
};

// ─── generateStaticParams ──────────────────────────────────────────────────────

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

// ─── generateMetadata ──────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return { title: "Guía no encontrada — Buleje" };
  }

  return {
    title: `${guide.title} — Buleje`,
    description: guide.excerpt,
    alternates: { canonical: `https://www.buleje.pe/guias/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.excerpt,
      type: "article",
      locale: "es_PE",
      publishedTime: guide.date,
      authors: ["Equipo Buleje"],
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Renderiza el body de la guia en HTML semántico.
 * El body es texto plano con formato markdown-like.
 * Implementacion minimal sin dependencia externa (no react-markdown).
 */
function GuideBody({ body }: { body: string }) {
  const lines = body.split("\n");

  const elements: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={key++}
          className="mt-8 mb-3 text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] leading-[var(--lh-tight)]"
        >
          {line.replace("## ", "")}
        </h2>
      );
      i++;
      continue;
    }

    // Heading H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3
          key={key++}
          className="mt-6 mb-2 text-[length:var(--ts-base)] font-semibold text-[var(--text-primary)] leading-[var(--lh-snug)]"
        >
          {line.replace("### ", "")}
        </h3>
      );
      i++;
      continue;
    }

    // Blockquote (>)
    if (line.startsWith("> ")) {
      const text = line.replace("> ", "");
      elements.push(
        <InfoAlert key={key++} className="my-5">
          {text}
        </InfoAlert>
      );
      i++;
      continue;
    }

    // Table header (|---|)
    if (line.startsWith("|") && lines[i + 1]?.startsWith("|---")) {
      const headers = line
        .split("|")
        .filter(Boolean)
        .map((h) => h.trim());
      const rows: string[][] = [];
      i += 2; // skip separator
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(
          lines[i]
            .split("|")
            .filter(Boolean)
            .map((c) => c.trim())
        );
        i++;
      }
      elements.push(
        <div key={key++} className="my-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)]">
                {headers.map((h, hi) => (
                  <th
                    key={hi}
                    className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-[var(--rule-soft)] last:border-0"
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="py-2.5 pr-4 text-sm text-[var(--text-secondary)]"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Lista numerada (1. ...)
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol
          key={key++}
          className="my-4 ml-5 list-decimal space-y-1.5 text-sm text-[var(--text-secondary)] leading-relaxed"
        >
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInlineFormatting(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Lista con guion (-) o bullet
    if (line.startsWith("- ")) {
      const listItems: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        listItems.push(lines[i].replace("- ", ""));
        i++;
      }
      elements.push(
        <ul
          key={key++}
          className="my-4 ml-5 list-disc space-y-1.5 text-sm text-[var(--text-secondary)] leading-relaxed"
        >
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInlineFormatting(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Separador de seccion (linea vacia)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Parrafo normal
    elements.push(
      <p
        key={key++}
        className="my-3 text-sm leading-relaxed text-[var(--text-secondary)]"
      >
        {renderInlineFormatting(line)}
      </p>
    );
    i++;
  }

  return <div className="guide-body">{elements}</div>;
}

/**
 * Renderiza bold (**texto**) e inline code (`texto`) dentro de una linea.
 * Devuelve array de ReactNodes para uso seguro dentro de JSX.
 */
function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[var(--text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 font-mono text-xs text-[var(--text-primary)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// ─── Related card ──────────────────────────────────────────────────────────────

function RelatedGuideCard({ guide }: { guide: Guide }) {
  const Illustration = IllustrationMap[guide.illustration];
  return (
    <Link
      href={`/guias/${guide.slug}`}
      className="group flex flex-col rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] focus-visible:ring-offset-2"
    >
      <div className="flex h-20 items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)] opacity-50">
        {Illustration ? (
          <Illustration size={56} aria-hidden />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[var(--rule-soft)]" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <Kicker className="text-[var(--text-tertiary)]">{guide.category}</Kicker>
        <CardTitle className="text-sm leading-snug line-clamp-2">
          {guide.title}
        </CardTitle>
        <Caption className="mt-1 flex items-center gap-1 text-[var(--text-tertiary)]">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {guide.readingTime} min
        </Caption>
      </div>
    </Link>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function GuiaSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    notFound();
  }

  const relatedGuides = getRelatedGuides(guide.relatedSlugs);
  const Illustration = IllustrationMap[guide.illustration];

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Buleje", url: "https://www.buleje.pe" },
          { name: "Guías", url: "https://www.buleje.pe/guias" },
          { name: guide.category, url: `https://www.buleje.pe/guias?categoria=${encodeURIComponent(guide.category)}` },
          { name: guide.title, url: `https://www.buleje.pe/guias/${guide.slug}` },
        ]}
      />
      {/* SEO 2026-05-24: Article schema — Google Article rich results + citeable
          por answer engines (ChatGPT/Perplexity/Google AI). */}
      <JsonLd
        data={generateArticleLD({
          title: guide.title,
          description: guide.excerpt,
          slug: guide.slug,
          datePublished: guide.date,
          body: guide.body,
        })}
      />
      <Header />
      <div className="h-[6.75rem] sm:h-[7.75rem]" />

      <main id="main-content" className="bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-3xl px-4 py-10">
          {/* ── Breadcrumb ──────────────────────────────────────────────── */}
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <li>
                <Link href="/" className="hover:text-[var(--text-secondary)] transition-colors">
                  Inicio
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/guias" className="hover:text-[var(--text-secondary)] transition-colors">
                  Guías
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/guias?categoria=${encodeURIComponent(guide.category)}`}
                  className="hover:text-[var(--text-secondary)] transition-colors"
                >
                  {guide.category}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-[var(--text-secondary)] font-medium line-clamp-1 max-w-[180px]">
                {guide.title}
              </li>
            </ol>
          </nav>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <header className="mb-8">
            <Kicker className="mb-3 block text-[var(--brand-ink)]">
              {guide.category}
            </Kicker>
            <PageTitle className="mb-4 leading-tight">
              {guide.title}
            </PageTitle>

            {/* Meta row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" aria-hidden="true" />
                  Equipo Buleje
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {guide.readingTime} min de lectura
                </span>
                <time dateTime={guide.date}>{formatDate(guide.date)}</time>
              </div>

              {/* Share decorativo — futuro Web Share API */}
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-md border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]"
                aria-label="Compartir esta guía"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                Compartir
              </button>
            </div>
          </header>

          {/* ── Ilustracion hero ────────────────────────────────────────── */}
          <div
            className="mb-10 flex justify-center rounded-xl bg-[var(--surface-sunken)] py-10 text-[var(--text-tertiary)] opacity-70 dark:opacity-50"
            aria-hidden="true"
          >
            {Illustration ? (
              <Illustration size={180} />
            ) : (
              <div className="h-28 w-28 rounded-full bg-[var(--rule-soft)]" />
            )}
          </div>

          {/* ── Excerpt / subtitulo ──────────────────────────────────────── */}
          <div className="mb-8 rounded-lg border-l-2 border-[var(--brand-ink)] pl-4">
            <BodyText className="text-base leading-relaxed text-[var(--text-secondary)] italic">
              {guide.excerpt}
            </BodyText>
          </div>

          {/* ── Contenido de la guia ─────────────────────────────────────── */}
          <article className="prose-guide">
            <GuideBody body={guide.body} />
          </article>

          {/* ── CTA post-lectura ─────────────────────────────────────────── */}
          <div className="mt-12 rounded-xl border border-[var(--brand-ink)]/20 bg-[var(--brand-ink)]/5 dark:bg-[var(--brand-ink)]/10 p-6 text-center">
            <CardTitle className="mb-2">Aplicá lo que aprendiste</CardTitle>
            <BodyText className="mb-4 text-[var(--text-secondary)]">
              Compra los ingredientes o productos que necesitas directo desde la tienda.
            </BodyText>
            <Link
              href="/tienda"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-ink)] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] focus-visible:ring-offset-2"
            >
              Ir a la tienda
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {/* ── Navegacion back ──────────────────────────────────────────── */}
          <div className="mt-8">
            <Link
              href="/guias"
              className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] rounded"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver a todas las guías
            </Link>
          </div>
        </div>

        {/* ── Guias relacionadas ────────────────────────────────────────── */}
        {relatedGuides.length > 0 && (
          <section className="border-t border-[var(--rule-soft)]">
            <div className="mx-auto max-w-3xl px-4 py-10">
              <div className="mb-5">
                <Kicker className="mb-2 block">GUÍAS RELACIONADAS</Kicker>
                <SectionTitle>También te podría interesar</SectionTitle>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {relatedGuides.map((related) => (
                  <RelatedGuideCard key={related.id} guide={related} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}
