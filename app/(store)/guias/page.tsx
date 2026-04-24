/**
 * /guias — Content Hub Buleje.
 *
 * Server Component puro. Grid de guias con categorias como chips.
 * Chips de filtro sin JS — links a ?categoria=X (URL state).
 * Ilustraciones DS, tokens DS, 0 emojis.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Clock, Mail } from "@buleje/design-system/icons";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import {
  PageTitle,
  SectionTitle,
  CardTitle,
  BodyText,
  Caption,
  Kicker,
} from "@buleje/design-system";
import {
  GUIDES,
  FEATURED_GUIDES,
  GUIDE_CATEGORIES,
  type Guide,
  type GuideCategory,
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

export const metadata: Metadata = {
  title: "Guías y Consejos — Buleje",
  description:
    "Guías prácticas para comprar mejor, cocinar con ingredientes amazónicos, ahorrar con cupones y gestionar tu bodega. Contenido de Pucallpa, para Pucallpa.",
  alternates: { canonical: "https://www.buleje.pe/guias" },
  openGraph: {
    title: "Guías y Consejos — Buleje",
    description:
      "Aprende a comprar mejor, cocinar con ingredientes locales y aprovechar tu bodega al máximo.",
    type: "website",
    locale: "es_PE",
  },
};

// ─── Mapa de ilustraciones por nombre string ───────────────────────────────────
// Necesario porque los nombres vienen como strings desde el mock
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function FeaturedGuideCard({ guide }: { guide: Guide }) {
  const Illustration = IllustrationMap[guide.illustration];

  return (
    <Link
      href={`/guias/${guide.slug}`}
      className="group flex flex-col rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden transition-shadow duration-[var(--dur-fast)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] focus-visible:ring-offset-2"
    >
      {/* Zona ilustracion */}
      <div className="flex h-36 items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)] opacity-70 dark:opacity-50">
        {Illustration ? (
          <Illustration size={100} aria-hidden />
        ) : (
          <div className="h-16 w-16 rounded-full bg-[var(--rule-soft)]" />
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-col flex-1 gap-2 p-5">
        <Kicker className="text-[var(--brand-ink)]">{guide.category}</Kicker>
        <CardTitle className="text-base leading-snug line-clamp-2">
          {guide.title}
        </CardTitle>
        <BodyText className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3 flex-1">
          {guide.excerpt}
        </BodyText>
        <div className="mt-3 flex items-center justify-between">
          <Caption className="flex items-center gap-1 text-[var(--text-tertiary)]">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {guide.readingTime} min · {formatDate(guide.date)}
          </Caption>
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--brand-ink)] group-hover:gap-2 transition-all duration-[var(--dur-fast)]">
            Leer
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  const Illustration = IllustrationMap[guide.illustration];

  return (
    <Link
      href={`/guias/${guide.slug}`}
      className="group flex flex-col rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden transition-shadow duration-[var(--dur-fast)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] focus-visible:ring-offset-2"
    >
      {/* Ilustracion compacta */}
      <div className="flex h-24 items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)] opacity-60 dark:opacity-40">
        {Illustration ? (
          <Illustration size={70} aria-hidden />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[var(--rule-soft)]" />
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-col flex-1 gap-1.5 p-4">
        <Kicker className="text-[var(--text-tertiary)]">{guide.category}</Kicker>
        <CardTitle className="text-sm leading-snug line-clamp-2">
          {guide.title}
        </CardTitle>
        <BodyText className="text-xs text-[var(--text-secondary)] line-clamp-3 flex-1 leading-relaxed">
          {guide.excerpt}
        </BodyText>
        <Caption className="mt-2 flex items-center gap-1 text-[var(--text-tertiary)]">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {guide.readingTime} min · {formatDate(guide.date)}
        </Caption>
      </div>
    </Link>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

interface GuiasPageProps {
  searchParams: Promise<{ categoria?: string }>;
}

export default async function GuiasPage({ searchParams }: GuiasPageProps) {
  const params = await searchParams;
  const activeCategory = params.categoria as GuideCategory | undefined;

  // Filtrado por categoria
  const filteredGuides = activeCategory
    ? GUIDES.filter((g) => g.category === activeCategory)
    : GUIDES;

  // Guias destacadas solo en la vista general (sin filtro)
  const showFeatured = !activeCategory;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Buleje", url: "https://www.buleje.pe" },
          { name: "Guías", url: "https://www.buleje.pe/guias" },
        ]}
      />
      <Header />
      <div className="h-[6.75rem] sm:h-[7.75rem]" />

      <main id="main-content" className="bg-[var(--surface-canvas)]">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                <li>
                  <Link href="/" className="hover:text-[var(--text-secondary)] transition-colors">
                    Inicio
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-[var(--text-secondary)] font-medium">Guías</li>
              </ol>
            </nav>

            <div className="flex items-center justify-between gap-8">
              <div className="max-w-xl">
                <Kicker className="mb-3 block">GUÍAS · CONTENIDO</Kicker>
                <PageTitle className="mb-3">Aprende a comprar mejor</PageTitle>
                <BodyText className="text-base text-[var(--text-secondary)] leading-relaxed">
                  Consejos, trucos y guías para aprovechar al máximo tu bodega. Contenido real de Pucallpa, sin relleno.
                </BodyText>
              </div>

              <div
                className="hidden shrink-0 text-[var(--text-tertiary)] opacity-60 dark:opacity-40 lg:block"
                aria-hidden="true"
              >
                <PaicheEnOlla size={180} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Guias destacadas ──────────────────────────────────────────── */}
        {showFeatured && (
          <section className="border-b border-[var(--rule-soft)]">
            <div className="mx-auto max-w-5xl px-4 py-12">
              <div className="mb-6">
                <Kicker className="mb-2 block">DESTACADAS</Kicker>
                <SectionTitle>Las más leídas</SectionTitle>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {FEATURED_GUIDES.map((guide) => (
                  <FeaturedGuideCard key={guide.id} guide={guide} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Categorias chips ───────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]">
          <div className="mx-auto max-w-5xl px-4 py-5">
            <div className="mb-3">
              <Kicker>TEMAS</Kicker>
            </div>
            <div
              className="flex flex-wrap gap-2"
              role="navigation"
              aria-label="Filtrar por categoría"
            >
              {/* Chip "Todas" */}
              <Link
                href="/guias"
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]",
                  !activeCategory
                    ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--brand-ink)] hover:text-[var(--brand-ink)]",
                ].join(" ")}
                aria-current={!activeCategory ? "page" : undefined}
              >
                Todas
              </Link>

              {GUIDE_CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <Link
                    key={cat}
                    href={`/guias?categoria=${encodeURIComponent(cat)}`}
                    className={[
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]",
                      isActive
                        ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--brand-ink)] hover:text-[var(--brand-ink)]",
                    ].join(" ")}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {cat}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Grid de guias ─────────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]">
          <div className="mx-auto max-w-5xl px-4 py-12">
            {activeCategory && (
              <div className="mb-6">
                <Kicker className="mb-2 block">{activeCategory.toUpperCase()}</Kicker>
                <SectionTitle>
                  {filteredGuides.length}{" "}
                  {filteredGuides.length === 1 ? "guía" : "guías"} encontradas
                </SectionTitle>
              </div>
            )}

            {filteredGuides.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="text-[var(--text-tertiary)] opacity-50" aria-hidden="true">
                  <CanastaVacia size={100} />
                </div>
                <BodyText className="text-[var(--text-secondary)]">
                  No hay guías en esta categoría todavía.
                </BodyText>
                <Link
                  href="/guias"
                  className="text-sm font-medium text-[var(--brand-ink)] hover:underline"
                >
                  Ver todas las guías
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGuides.map((guide) => (
                  <GuideCard key={guide.id} guide={guide} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Newsletter ────────────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]">
          <div className="mx-auto max-w-5xl px-4 py-12">
            <div className="rounded-xl border border-[var(--brand-ink)]/20 bg-[var(--brand-ink)]/5 dark:bg-[var(--brand-ink)]/10 p-8">
              <div className="mx-auto max-w-lg text-center">
                <Kicker className="mb-2 block text-[var(--brand-ink)]">
                  RECIBE NOVEDADES
                </Kicker>
                <SectionTitle className="mb-2">
                  Nuevas guías cada semana
                </SectionTitle>
                <BodyText className="mb-6 text-[var(--text-secondary)]">
                  Consejos para comprar y cocinar mejor, sin spam. Cancela cuando quieras.
                </BodyText>

                {/* Form stub — action a implementar con API route */}
                <form
                  action="#"
                  method="POST"
                  className="flex flex-col gap-3 sm:flex-row"
                  aria-label="Suscribirse a novedades"
                >
                  <label htmlFor="newsletter-email" className="sr-only">
                    Tu email
                  </label>
                  <div className="relative flex-1">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
                      aria-hidden="true"
                    />
                    <input
                      id="newsletter-email"
                      type="email"
                      name="email"
                      placeholder="tu@email.com"
                      required
                      className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-2.5 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--brand-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-ink)]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--brand-ink)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] focus-visible:ring-offset-2"
                  >
                    Suscribirme
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>

        {/* ── Recetas relacionadas ──────────────────────────────────────── */}
        <section>
          <div className="mx-auto max-w-5xl px-4 py-10">
            <div className="mb-6">
              <Kicker className="mb-2 block">TAMBIÉN TE PODRÍA INTERESAR</Kicker>
              <SectionTitle>Recetas populares</SectionTitle>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { title: "Ceviche de paiche", slug: "ceviche-paiche" },
                { title: "Tacacho con cecina", slug: "tacacho-cecina" },
                { title: "Juane amazónico", slug: "juane-amazonico" },
                { title: "Inchicapi de gallina", slug: "inchicapi-gallina" },
              ].map((receta) => (
                <Link
                  key={receta.slug}
                  href={`/recetas/${receta.slug}`}
                  className="flex flex-col items-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 text-center transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]"
                >
                  <div
                    className="text-[var(--text-tertiary)] opacity-50"
                    aria-hidden="true"
                  >
                    <PaicheEnOlla size={60} />
                  </div>
                  <CardTitle className="text-xs leading-snug">
                    {receta.title}
                  </CardTitle>
                </Link>
              ))}
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/recetas"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] rounded"
              >
                Ver todas las recetas
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}
