/**
 * /ayuda — Centro de Ayuda Buleje (completo).
 *
 * Server Component puro (sin "use client"). FAQ con <details> nativo (0-JS).
 * Estilo "página de negocio" (igual que /libro-de-reclamaciones y /privacidad):
 * max-w-7xl, hero + tarjeta de contacto, índice por tema, cards 1px + shadow.
 * Contenido en lib/help-content.ts (9 temas, ~45 preguntas: clientes, negocios y
 * repartidores). Contacto real desde lib/legal.ts. SEO: FAQPage + HowTo +
 * Speakable + BreadcrumbList JSON-LD.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  MessageCircle,
  Phone,
  Mail,
  ChevronDown,
  ChevronRight,
  Search,
  ShoppingCart,
  CreditCard,
  Truck,
  User,
  Tag,
  RotateCcw,
  Store,
  Bike,
  ShieldCheck,
  LifeBuoy,
  Clock,
  type LucideIcon,
} from "lucide-react";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { JsonLd } from "@/components/JsonLd";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import { generateHowToLD, generateSpeakableLD } from "@/lib/seo/json-ld";
import { buildWaLink } from "@/lib/wa-number";
import { LEGAL } from "@/lib/legal";
import { HELP_TOPICS, ALL_HELP_FAQS } from "@/lib/help-content";

const SUPPORT_EMAIL = "contacto@buleje.pe";

const CARD =
  "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

/** Mapa clave-string → componente Lucide (los datos de help-content son puros). */
const ICONS: Record<string, LucideIcon> = {
  ShoppingCart,
  CreditCard,
  Truck,
  User,
  Tag,
  RotateCcw,
  Store,
  Bike,
  ShieldCheck,
};

export async function generateMetadata(): Promise<Metadata> {
  const { buildTenantTitle } = await import("@/lib/store-metadata");
  return {
    ...(await buildTenantTitle(
      "Centro de Ayuda",
      "Guía completa de Buleje: pedidos, pagos, delivery, cuenta, devoluciones, vender en la plataforma, repartidores y soporte por WhatsApp.",
    )),
    alternates: { canonical: "https://www.buleje.pe/ayuda" },
  };
}

// ─── JSON-LD ───────────────────────────────────────────────────────────────
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ALL_HELP_FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: { "@type": "Answer", text: faq.a },
  })),
};

const howToJsonLd = generateHowToLD({
  name: "Cómo comprar en Buleje",
  description:
    "Pasos para hacer un pedido en el marketplace de bodegas de Ciudad Constitución y pagar con Yape, Plin o efectivo.",
  steps: [
    { name: "Buscá tu bodega", text: "Entrá a buleje.pe y buscá una tienda por nombre, categoría o zona." },
    { name: "Armá tu pedido", text: "Agregá productos al carrito; ves el total real en vivo, sin sorpresas." },
    { name: "Elegí cómo pagar", text: "Pagá con Yape, Plin o efectivo al recibir. No necesitás tarjeta." },
    { name: "Recibí en tu puerta", text: "El pedido llega a tu domicilio en 25 minutos promedio." },
  ],
});

const speakableJsonLd = generateSpeakableLD([".faq-question", ".faq-answer"]);

// ─── Datos de contacto (reales) ──────────────────────────────────────────────
const waHelp = buildWaLink(LEGAL.whatsapp, "Hola Buleje, necesito ayuda.");
const telHref = `tel:${LEGAL.telefono.replace(/\s/g, "")}`;

const CONTACT = [
  { icon: MessageCircle, title: "WhatsApp", sub: "Respondemos en minutos", href: waHelp, external: true },
  { icon: Phone, title: LEGAL.telefono, sub: "Lun a Sáb, 8am–8pm", href: telHref, external: false },
  { icon: Mail, title: SUPPORT_EMAIL, sub: "Respuesta en 24h", href: `mailto:${SUPPORT_EMAIL}`, external: false },
] as const;

// ─── Componentes ───────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] transition-colors open:border-[var(--accent)]/30 open:shadow-[var(--shadow-sm)] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-base font-bold text-[var(--text-primary)] sm:text-lg">
        <span className="faq-question">{q}</span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-[var(--accent)] transition-transform duration-200 group-open:rotate-180"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </summary>
      <p className="faq-answer px-5 pb-5 text-base leading-relaxed text-[var(--text-secondary)]">{a}</p>
    </details>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function AyudaPage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <JsonLd data={howToJsonLd} />
      <JsonLd data={speakableJsonLd} />
      <BreadcrumbSchema
        visible={false}
        items={[
          { name: "Buleje", url: "https://www.buleje.pe" },
          { name: "Ayuda", url: "https://www.buleje.pe/ayuda" },
        ]}
      />

      <main id="main-content" className="bg-[var(--surface-canvas)]">
        {/* ── Breadcrumb ── */}
        <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <Breadcrumbs items={[{ label: "Centro de Ayuda" }]} />
          </div>
        </div>

        {/* ── Hero (2 columnas) ── */}
        <section className="relative overflow-hidden border-b border-[var(--rule-soft)] bg-gradient-to-b from-[var(--accent-soft)]/60 to-[var(--surface-raised)]">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--accent)]/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-16">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--surface-raised)] px-3 py-1 text-sm font-bold text-[var(--accent)] shadow-[var(--shadow-sm)]">
                <LifeBuoy className="h-4 w-4" strokeWidth={2.5} />
                Centro de Ayuda · estamos para vos
              </span>
              <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-5xl">
                ¿En qué podemos ayudarte?
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
                Guías y respuestas para clientes, negocios y repartidores. Si no
                encuentras lo que buscas, escríbenos por WhatsApp y respondemos en minutos.
              </p>
              <Link
                href="/buscar"
                className="mt-6 flex w-full max-w-md items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-base text-[var(--text-tertiary)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--accent)]/40"
                aria-label="Buscar en la ayuda"
              >
                <Search className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-hidden="true" />
                Buscar productos, tiendas o temas…
              </Link>
            </div>

            {/* Tarjeta de contacto directo */}
            <aside className="lg:justify-self-end">
              <div className={`${CARD} w-full overflow-hidden lg:w-[380px]`}>
                <div className="flex items-center gap-2 bg-[var(--accent)] px-5 py-4 text-base font-extrabold text-white">
                  <MessageCircle className="h-5 w-5" strokeWidth={2.25} /> Contacto directo
                </div>
                <div className="divide-y divide-[var(--rule-soft)]">
                  {CONTACT.map(({ icon: Icon, title, sub, href, external }) =>
                    href ? (
                      <a
                        key={title}
                        href={href}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-primary/10"
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                          <Icon className="h-5 w-5" strokeWidth={2.25} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-base font-bold text-[var(--text-primary)]">{title}</span>
                          <span className="block text-sm text-[var(--text-tertiary)]">{sub}</span>
                        </span>
                        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2.5} aria-hidden="true" />
                      </a>
                    ) : null,
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* ── Categorías (jump links) ── */}
        <section className="border-b border-[var(--rule-soft)]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <p className="text-sm font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
              Explora por tema
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
              Ayuda para todo tipo de uso
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {HELP_TOPICS.map((topic) => {
                const Icon = ICONS[topic.icon] ?? ShoppingCart;
                return (
                  <a
                    key={topic.id}
                    href={`#${topic.id}`}
                    className={`${CARD} group flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/30`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                        <Icon className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-xs font-bold text-[var(--text-tertiary)]">
                        {topic.audience}
                      </span>
                    </div>
                    <span className="text-base font-extrabold text-[var(--text-primary)]">{topic.title}</span>
                    <span className="text-base leading-relaxed text-[var(--text-secondary)]">{topic.intro}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)]">
                      {topic.faqs.length} preguntas
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Contenido por tema (índice + secciones) ── */}
        <section className="bg-[var(--surface-raised)]">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:py-16">
            {/* Índice */}
            <nav aria-label="Índice de temas" className="hidden lg:block lg:sticky lg:top-24">
              <p className="mb-3 text-xs font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
                Temas
              </p>
              <ul className="space-y-1">
                {HELP_TOPICS.map((topic) => (
                  <li key={topic.id}>
                    <a
                      href={`#${topic.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent)]"
                    >
                      {topic.title}
                      <span className="tabular-nums text-[var(--text-tertiary)]">{topic.faqs.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Secciones */}
            <div className="space-y-10">
              {HELP_TOPICS.map((topic) => {
                const Icon = ICONS[topic.icon] ?? ShoppingCart;
                return (
                  <section key={topic.id} id={topic.id} className="scroll-mt-24">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                        <Icon className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <div>
                        <h2 className="text-xl font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-2xl">
                          {topic.title}
                        </h2>
                        <p className="text-sm text-[var(--text-tertiary)]">{topic.intro}</p>
                      </div>
                    </div>
                    <ul className="space-y-3">
                      {topic.faqs.map((faq) => (
                        <li key={faq.q}>
                          <FaqItem q={faq.q} a={faq.a} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── No encontraste / contacto ── */}
        <section className="border-t border-[var(--rule-soft)]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
            <div className={`${CARD} bg-[var(--surface-sunken)] p-6 text-center sm:p-10`}>
              <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
                ¿No encontraste lo que buscabas?
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-base leading-relaxed text-[var(--text-secondary)]">
                Nuestro equipo te ayuda en minutos. Elige el canal que prefieras.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {waHelp && (
                  <a
                    href={waHelp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-6 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
                  >
                    <MessageCircle className="h-5 w-5" strokeWidth={2.5} /> Escribir por WhatsApp
                  </a>
                )}
                <a
                  href={telHref}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] px-6 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]/40"
                >
                  <Phone className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} /> Llamar
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA negocios + links útiles ── */}
        <section>
          <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
            <div className={`${CARD} flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8`}>
              <div className="flex items-center gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <Store className="h-6 w-6" strokeWidth={2.25} />
                </span>
                <div>
                  <h2 className="text-lg font-extrabold text-[var(--text-primary)]">¿Tienes una bodega o negocio?</h2>
                  <p className="mt-0.5 text-base text-[var(--text-secondary)]">Abre tu tienda online en Buleje en minutos.</p>
                </div>
              </div>
              <Link
                href="/negocios"
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-6 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
              >
                Buleje para negocios <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} /> Soporte Lun–Sáb, 8am–8pm
              </span>
              <Link href="/guias" className="hover:text-[var(--accent)]">Guías y consejos</Link>
              <Link href="/recetas" className="hover:text-[var(--accent)]">Recetario</Link>
              <Link href="/privacidad" className="hover:text-[var(--accent)]">Privacidad</Link>
              <Link href="/terminos" className="hover:text-[var(--accent)]">Términos</Link>
              <Link href="/libro-de-reclamaciones" className="hover:text-[var(--accent)]">Libro de Reclamaciones</Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
