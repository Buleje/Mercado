/**
 * /ayuda — Centro de Ayuda Buleje.
 *
 * Server Component puro (sin "use client" en este archivo).
 * FAQ con details/summary nativo para 0-JS expand/collapse.
 * Ilustraciones DS, tokens DS, 0 emojis, estilo Holded enterprise.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import {
  MessageCircle,
  Phone,
  Mail,
  MessageSquare,
  ChevronDown,
  ShoppingCart,
  CreditCard,
  User,
  Tag,
  RotateCcw,
  Store,
  Shield,
  Info,
} from "@buleje/design-system/icons";
// Designer audit: /ayuda usaba Header (navbar de tienda white-label)
// que rompía el contexto corporativo. Ahora LandingHeader como /about.
import LandingHeader from "@/components/landing/LandingHeader";
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
import { FEATURED_FAQS } from "@/lib/mock-faq";

// Ilustraciones via dynamic para no bloquear SSR con SVG pesado
const CorazonLatiendo = dynamic(
  () =>
    import("@/components/ui-system/illustrations/contextual").then(
      (m) => m.CorazonLatiendo
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
const PedidoLlegando = dynamic(
  () =>
    import("@/components/ui-system/illustrations/empty-states").then(
      (m) => m.PedidoLlegando
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
const MotoRuta = dynamic(
  () =>
    import("@/components/ui-system/illustrations/contextual").then(
      (m) => m.MotoRuta
    ),
  { ssr: true }
);

export async function generateMetadata(): Promise<Metadata> {
  const { buildTenantTitle } = await import("@/lib/store-metadata");
  return {
    ...(await buildTenantTitle(
      "Centro de Ayuda",
      "Preguntas frecuentes, guías de uso y soporte directo por WhatsApp.",
    )),
    alternates: { canonical: "https://www.buleje.pe/ayuda" },
  };
}

// ─── JSON-LD FAQPage ───────────────────────────────────────────────────────────
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FEATURED_FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

// ─── Secciones de categorias ───────────────────────────────────────────────────
const HELP_CATEGORIES = [
  {
    icon: ShoppingCart,
    title: "Pedidos y entrega",
    description: "Cómo hacer, seguir y cancelar pedidos",
    articles: 8,
    illustration: PedidoLlegando,
    href: "/ayuda#pedidos",
  },
  {
    icon: CreditCard,
    title: "Pagos",
    description: "Yape, Plin, efectivo y transferencia",
    articles: 5,
    illustration: null,
    href: "/ayuda#pagos",
  },
  {
    icon: User,
    title: "Mi cuenta",
    description: "Perfil, direcciones y puntos de lealtad",
    articles: 6,
    illustration: DoniaElena,
    href: "/ayuda#cuenta",
  },
  {
    icon: Tag,
    title: "Cupones y promos",
    description: "Descuentos, referidos y beneficios",
    articles: 4,
    illustration: null,
    href: "/ayuda#cupones",
  },
  {
    icon: RotateCcw,
    title: "Devoluciones",
    description: "Cambios y reembolsos paso a paso",
    articles: 3,
    illustration: null,
    href: "/ayuda#devoluciones",
  },
  {
    icon: Store,
    title: "Tu bodega online",
    description: "Registro, planes y configuración",
    articles: 12,
    illustration: BodegaAbriendo,
    href: "/negocios",
  },
  {
    icon: Shield,
    title: "Seguridad",
    description: "Privacidad y protección de tu cuenta",
    articles: 4,
    illustration: null,
    href: "/privacidad",
  },
  {
    icon: Info,
    title: "Sobre Buleje",
    description: "Quiénes somos, misión y valores",
    articles: 5,
    illustration: null,
    href: "/about",
  },
] as const;

// ─── Quick actions ─────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    icon: MessageCircle,
    title: "WhatsApp",
    subtitle: "Respondemos en 5 min",
    href: "https://wa.me/51900000000?text=Hola%20Buleje%2C%20necesito%20ayuda",
    external: true,
    accent: true,
  },
  {
    icon: Phone,
    title: "Llamar ahora",
    subtitle: "Lun-Sáb 8am-8pm",
    href: "tel:+51900000000",
    external: false,
    accent: false,
  },
  {
    icon: Mail,
    title: "Email",
    subtitle: "Respuesta en 24h",
    href: "mailto:soporte@buleje.pe",
    external: false,
    accent: false,
  },
  {
    icon: MessageSquare,
    title: "Chat soporte",
    subtitle: "Próximamente",
    href: "#",
    external: false,
    accent: false,
  },
] as const;

// ─── Componentes ───────────────────────────────────────────────────────────────

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group border-b border-[var(--rule-soft)] last:border-0">
      <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm font-medium text-[var(--text-primary)] hover:text-[var(--brand-ink)] transition-colors duration-[var(--dur-fast)] list-none select-none">
        <span>{question}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-fast)] group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-4 pr-8 text-sm leading-relaxed text-[var(--text-secondary)]">
        {answer}
      </div>
    </details>
  );
}

function CategoryCard({
  icon: Icon,
  title,
  description,
  articles,
  href,
}: (typeof HELP_CATEGORIES)[number]) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition-shadow duration-[var(--dur-fast)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] focus-visible:ring-offset-2"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--surface-sunken)]">
        <Icon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
      </div>
      <div>
        <CardTitle className="mb-1 text-sm">{title}</CardTitle>
        <BodyText className="text-xs text-[var(--text-secondary)] leading-snug">
          {description}
        </BodyText>
      </div>
      <Caption className="mt-auto font-medium text-[var(--brand-ink)]">
        {articles} artículos
      </Caption>
    </Link>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AyudaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <BreadcrumbSchema
        items={[
          { name: "Buleje", url: "https://www.buleje.pe" },
          { name: "Ayuda", url: "https://www.buleje.pe/ayuda" },
        ]}
      />
      <LandingHeader minimal />
      <div className="h-[6.75rem] sm:h-[7.75rem]" />

      <main id="main-content" className="bg-[var(--surface-canvas)]">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
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
                <li className="text-[var(--text-secondary)] font-medium">Ayuda</li>
              </ol>
            </nav>

            <div className="flex items-center justify-between gap-8">
              <div className="max-w-xl">
                <Kicker className="mb-3 block">AYUDA · ESTAMOS PARA VOS</Kicker>
                <PageTitle className="mb-3">
                  ¿En qué podemos ayudarte?
                </PageTitle>
                <BodyText className="mb-8 text-base text-[var(--text-secondary)] leading-relaxed">
                  Encuentra respuestas rápidas o contáctanos por WhatsApp. Nuestro equipo responde en menos de 5 minutos.
                </BodyText>

                {/* Search decorativo — sin JS, redirige a buscar */}
                <Link
                  href="/buscar"
                  className="flex w-full max-w-md items-center gap-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-tertiary)] transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]"
                  aria-label="Buscar en la ayuda"
                >
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 5.25 5.25a7.5 7.5 0 0 0 11.4 11.4z"
                    />
                  </svg>
                  Buscar en la ayuda...
                </Link>
              </div>

              {/* Ilustración hero — oculta en mobile */}
              <div
                className="hidden shrink-0 text-[var(--text-tertiary)] opacity-70 dark:opacity-50 lg:block"
                aria-hidden="true"
              >
                <CorazonLatiendo size={200} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]">
          <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <a
                    key={action.title}
                    href={action.href}
                    {...(action.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className={[
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-shadow duration-[var(--dur-fast)] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)] focus-visible:ring-offset-2",
                      action.accent
                        ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white hover:opacity-90"
                        : "border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)]",
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="text-xs font-semibold">{action.title}</span>
                    <Caption
                      className={
                        action.accent
                          ? "text-white/80"
                          : "text-[var(--text-tertiary)]"
                      }
                    >
                      {action.subtitle}
                    </Caption>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Categorias ────────────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]">
          <div className="mx-auto max-w-5xl px-4 py-12">
            <div className="mb-6">
              <Kicker className="mb-2 block">TEMAS POPULARES</Kicker>
              <SectionTitle>Navega por categoría</SectionTitle>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {HELP_CATEGORIES.map((cat) => (
                <CategoryCard key={cat.title} {...cat} />
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]" id="faq">
          <div className="mx-auto max-w-5xl px-4 py-12">
            <div className="grid gap-10 lg:grid-cols-[280px_1fr]">
              {/* Columna izquierda — copy + ilustracion */}
              <div>
                <Kicker className="mb-2 block">FRECUENTES</Kicker>
                <SectionTitle className="mb-3">
                  Preguntas más comunes
                </SectionTitle>
                <BodyText className="text-[var(--text-secondary)] leading-relaxed">
                  Estas son las consultas que recibimos con más frecuencia. Si no encuentras lo que buscas, el equipo de soporte está disponible por WhatsApp.
                </BodyText>

                <div
                  className="mt-8 hidden text-[var(--text-tertiary)] opacity-60 dark:opacity-40 lg:block"
                  aria-hidden="true"
                >
                  <MotoRuta size={160} />
                </div>
              </div>

              {/* Columna derecha — accordion nativo */}
              <div className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-6 divide-y-0">
                {FEATURED_FAQS.map((faq) => (
                  <FaqItem
                    key={faq.id}
                    question={faq.question}
                    answer={faq.answer}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Contacto ─────────────────────────────────────────────────── */}
        <section className="border-b border-[var(--rule-soft)]" id="contacto">
          <div className="mx-auto max-w-5xl px-4 py-12">
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-8">
              <div className="mb-6">
                <Kicker className="mb-2 block">
                  ¿NO ENCONTRASTE LO QUE BUSCABAS?
                </Kicker>
                <SectionTitle className="mb-2">
                  Nuestro equipo te responde
                </SectionTitle>
                <BodyText className="text-[var(--text-secondary)]">
                  Elige el canal que prefieras. Siempre hay alguien disponible.
                </BodyText>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {/* WhatsApp */}
                <a
                  href="https://wa.me/51900000000?text=Hola%20Buleje%2C%20necesito%20ayuda"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]"
                >
                  <MessageCircle className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
                  <CardTitle className="text-sm">WhatsApp</CardTitle>
                  <Caption className="text-[var(--text-tertiary)]">
                    Respondemos en 5 min
                  </Caption>
                </a>

                {/* Email */}
                <a
                  href="mailto:soporte@buleje.pe"
                  className="flex flex-col gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]"
                >
                  <Mail className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
                  <CardTitle className="text-sm">Email</CardTitle>
                  <Caption className="text-[var(--text-tertiary)]">
                    Respuesta en 24h
                  </Caption>
                </a>

                {/* Teléfono */}
                <a
                  href="tel:+51900000000"
                  className="flex flex-col gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]"
                >
                  <Phone className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden="true" />
                  <CardTitle className="text-sm">Teléfono</CardTitle>
                  <Caption className="text-[var(--text-tertiary)]">
                    Lun-Sáb 8am-8pm
                  </Caption>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA final + links útiles ─────────────────────────────────── */}
        <section>
          <div className="mx-auto max-w-5xl px-4 py-10">
            <div className="flex flex-col items-center gap-6 text-center">
              <BodyText className="text-[var(--text-secondary)]">
                ¿Sos dueño de una bodega?
              </BodyText>
              <Link
                href="/negocios"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ink)]"
              >
                <Store className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
                Ver Buleje para negocios
              </Link>

              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-[var(--text-tertiary)]">
                <Link href="/guias" className="hover:text-[var(--text-secondary)] transition-colors">
                  Guías y consejos
                </Link>
                <Link href="/pricing" className="hover:text-[var(--text-secondary)] transition-colors">
                  Ver planes
                </Link>
                <Link href="/recetas" className="hover:text-[var(--text-secondary)] transition-colors">
                  Recetario
                </Link>
                <Link href="/privacidad" className="hover:text-[var(--text-secondary)] transition-colors">
                  Privacidad
                </Link>
                <Link href="/terminos" className="hover:text-[var(--text-secondary)] transition-colors">
                  Términos
                </Link>
              </div>
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
