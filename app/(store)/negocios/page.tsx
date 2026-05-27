import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
// Brandon 2026-05-27 — rediseño B2B: /negocios deja de reusar el home B2C
// (LandingHero "Más clientes", categorías de productos, reseñas de clientes,
// bodeguero spotlight). Ahora es una landing de SOFTWARE clara y distinta de
// /abrir-tienda: hero B2B propio + grid de MÓDULOS del software. Las secciones
// de apoyo (cómo funciona, planes, plan fundador, FAQ) se conservan.
const ComoFuncionaSection = dynamic(
  () => import("@/components/landing/sections/ComoFuncionaSection"),
  { loading: () => <div className="min-h-[400px] bg-[var(--surface-raised)]" aria-hidden /> },
);
const NosotrosSection = dynamic(
  () => import("@/components/landing/sections/NosotrosSection"),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const FAQSection = dynamic(
  () => import("@/components/landing/sections/FAQSection"),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const StickyMobileCTA = dynamic(() => import("@/components/landing/StickyMobileCTA"));
import { Reveal } from "@/components/landing/Reveal";
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import T from "@/components/T";
import {
  Store,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Smartphone,
  Package,
  Truck,
  Wallet,
  Receipt,
  MessageCircle,
  BarChart3,
  ShieldCheck,
  Sparkles,
} from "@buleje/design-system/icons";
// Footer ya vive en app/(store)/layout.tsx (chrome unificado v5).
// Brandon 2026-05-27: /negocios es 100% informativa/SEO. El selector
// interactivo de planes + signup vive SOLO en /abrir-tienda (página de
// conversión). Acá mostramos un teaser de precios y enlazamos allá.

// Brandon mayo 14 2026: esta era la home pre-launch B2B (Plan Fundador,
// 10 cupos, planes Free/Starter/Pro/Business, FAQ). Se movió de "/" a
// "/negocios" para liberar la home raíz al flujo B2C tipo Rappi.
// El contenido sigue siendo el mismo, solo cambia metadata + canonical
// + OG para reflejar la nueva URL. La versión anterior de /negocios
// (ERP-focused con POS, SUNAT, inventario) fue reemplazada — ese
// posicionamiento ahora vive en /abrir-tienda.
// Brandon 2026-05-20 SEO audit fixes:
// · Title 40 chars → 56 chars con keywords B2B alta intención
//   ("software bodega", "POS bodega Perú")
// · Description 177 chars → 148 (dentro de 70-155, prioriza hook urgencia)
// · Twitter card agregada explícita (antes ausente)
// · El template del root "%s | Buleje" agrega sufijo automáticamente
export const metadata: Metadata = {
  title: "Software para bodega y tienda en Perú | POS, ventas y delivery",
  description:
    "Vendé sin comisión 90 días. Tu bodega online en 5 minutos con Yape, POS y delivery. Sé de los primeros 10 del Plan Fundador en Pucallpa.",
  // Brandon 2026-05-27 SEO profundo: keywords B2B de alta intención (long-tail
  // local + categoría). Google ya no rankea por meta keywords, pero ayudan a
  // buscadores secundarios, IAs y herramientas SEO. hreflang es-PE explícito.
  keywords: [
    "software para bodega",
    "software para minimarket",
    "POS para bodega Perú",
    "punto de venta bodega",
    "sistema para tienda de abarrotes",
    "abrir tienda online Perú",
    "vender con Yape",
    "facturación electrónica SUNAT bodega",
    "software bodega Pucallpa",
    "ERP para minimarket",
    "delivery para bodega",
    "fiado digital",
  ],
  alternates: {
    canonical: "https://www.buleje.pe/negocios",
    languages: {
      "es-PE": "https://www.buleje.pe/negocios",
      "x-default": "https://www.buleje.pe/negocios",
    },
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
  openGraph: {
    title: "Software para bodega y tienda en Perú",
    description:
      "Vendé sin comisión 90 días. Tu bodega online en 5 minutos.",
    url: "https://www.buleje.pe/negocios",
    type: "website",
    locale: "es_PE",
    siteName: "Buleje",
    images: [
      {
        url: "/api/og/negocios",
        width: 1200,
        height: 630,
        alt: "Buleje para Negocios — Software para bodegas y tiendas en Perú · 0% comisión",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Software para bodega y tienda en Perú",
    description:
      "Vendé sin comisión 90 días. Tu bodega online en 5 minutos con Yape, POS y delivery.",
    images: ["/api/og/negocios"],
  },
};

// ── JSON-LD structured data (B2B landing) ──
// Brandon 2026-05-20 v11 audit Bloque C — 3 schemas para /negocios:
// 1) SoftwareApplication (audit anterior P0: tipo correcto para landing B2B
//    software, antes era "WebPage" genérico)
// 2) BreadcrumbList (audit Bloque C P0: ausente)
// 3) FAQPage (rich results accordion en SERP)
// AggregateRating sintético eliminado (audit anterior: penalty risk Google).
async function BulejeJsonLd() {
  const baseUrl = "https://www.buleje.pe";

  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${baseUrl}/negocios#software`,
    name: "Buleje — Software para bodega y tienda",
    url: `${baseUrl}/negocios`,
    description:
      "Plataforma todo-en-uno para abrir tu tienda online en 5 minutos. POS, inventario, delivery, fiado digital, SUNAT y pagos con Yape/Plin.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "es-PE",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "PEN" },
      { "@type": "Offer", name: "Starter", price: "89", priceCurrency: "PEN" },
      { "@type": "Offer", name: "Pro", price: "179", priceCurrency: "PEN" },
      { "@type": "Offer", name: "Business", price: "349", priceCurrency: "PEN" },
    ],
    publisher: { "@id": `${baseUrl}/#organization` },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Para tu negocio", item: `${baseUrl}/negocios` },
    ],
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "¿Cuánto cuesta abrir tu tienda en Buleje?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Empezás GRATIS con el plan Free (hasta 20 productos, 30 pedidos/mes). Si necesitás más, los planes pagos arrancan en S/89/mes (Starter), con primer mes gratis y sin tarjeta.",
        },
      },
      {
        "@type": "Question",
        name: "¿Necesito tarjeta de crédito para registrarme?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Te registrás sin tarjeta. Solo pedimos forma de pago si decidís pasar a un plan pago tras el primer mes de prueba gratis.",
        },
      },
      {
        "@type": "Question",
        name: "¿Funciona con SUNAT y facturación electrónica?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí. Los planes Pro y Business incluyen facturación electrónica SUNAT, boletas, cotizaciones y guías de remisión, todo integrado.",
        },
      },
      {
        "@type": "Question",
        name: "¿Qué soporte recibo cuando abro mi tienda?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Setup 1-a-1 por WhatsApp, capacitación de 90 días, sesión de fotos sin costo y acompañamiento personal para los primeros 10 negocios del Plan Fundador.",
        },
      },
      // Brandon 2026-05-27 SEO profundo: 4 preguntas extra de alta intención
      // (comisión, tiempo de setup, Yape, tipos de negocio) — cubren las queries
      // que más hacen los dueños y las respuestas que citan las IAs.
      {
        "@type": "Question",
        name: "¿Buleje cobra comisión por cada venta?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Buleje cobra 0% de comisión por venta: el dinero llega directo a tu Yape, tu cuenta bancaria o tu caja. Solo pagás el plan mensual, sin sorpresas.",
        },
      },
      {
        "@type": "Question",
        name: "¿En cuánto tiempo está lista mi tienda online?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "En unos 5 minutos: te registrás, cargás tus productos y compartís el link. Con el Plan Fundador hacemos el setup 1-a-1 contigo para dejarla lista la misma tarde.",
        },
      },
      {
        "@type": "Question",
        name: "¿Mis clientes pueden pagar con Yape y Plin?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí. Tus clientes pagan con Yape, Plin, efectivo y tarjeta. El cobro va directo a tu cuenta; Buleje no intermedia el dinero de tus ventas.",
        },
      },
      {
        "@type": "Question",
        name: "¿Para qué tipo de negocios sirve Buleje?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Para bodegas, minimarkets, tiendas de abarrotes, restaurantes, pizzerías, panaderías, farmacias y ferreterías que quieran vender online con delivery, cobrar con Yape/Plin y emitir comprobantes SUNAT.",
        },
      },
    ],
  };

  // HowTo — pasos para abrir tu tienda. Elegible para rich result de pasos en
  // Google y muy citado por IAs cuando alguien pregunta "cómo abrir mi tienda".
  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Cómo abrir tu tienda online en Buleje en 5 minutos",
    description:
      "Pasos para crear tu tienda online de bodega o minimarket en Perú con POS, delivery y pagos Yape, gratis y sin tarjeta.",
    totalTime: "PT5M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "PEN", value: "0" },
    inLanguage: "es-PE",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Registrate gratis",
        text: "Creá tu cuenta en buleje.pe/abrir-tienda. No pedimos tarjeta de crédito.",
        url: `${baseUrl}/abrir-tienda`,
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Cargá tus productos y zonas de delivery",
        text: "Subí tu catálogo con precios y stock, y definí las zonas a las que repartís. Si querés, hacemos el setup 1-a-1 contigo.",
        url: `${baseUrl}/abrir-tienda`,
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Compartí tu tienda y recibí pedidos",
        text: "Compartí el link de tu tienda. Recibís los pedidos por WhatsApp y cobrás con Yape, Plin, efectivo o tarjeta, directo a tu cuenta.",
        url: `${baseUrl}/negocios`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToLd) }}
      />
    </>
  );
}

// ── Hero B2B — propio de /negocios (NO el LandingHero del home B2C). ──
// Mensaje de software para el dueño: titular grande estilo editorial + panel
// de módulos estilizado a la derecha (distinto del BodegaScene de /abrir-tienda).
function B2BHero() {
  return (
    <section className="relative overflow-hidden bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-[520px] w-[520px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
      />
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 pb-20 sm:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-20 items-center">
          {/* Texto */}
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              <Store className="h-4 w-4" strokeWidth={2} />
              Software para tu negocio
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Un solo sistema para{" "}
              <span className="italic font-serif text-[var(--accent)]">vender, cobrar y crecer.</span>
            </h2>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-xl">
              POS, inventario, delivery, fiado digital y boletas SUNAT — todo
              integrado, desde tu celular. Sin sistemas caros ni técnicos.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/abrir-tienda"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                Probar gratis 1 mes
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
              </Link>
              <a
                href="#modulos"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-7 py-4 text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Ver qué incluye
              </a>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {[
                { icon: ShieldCheck, label: "0% comisión por venta" },
                { icon: Sparkles, label: "Listo en 5 minutos" },
                { icon: Wallet, label: "Cobrás con Yape/Plin" },
              ].map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)]"
                >
                  <c.icon className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.75} />
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Mockup de celular — la app Buleje en vivo ──────────────────
              Brandon 2026-05-27: reemplaza el panel plano. Ilustración del
              software corriendo en el celular del dueño. Estático (server
              component safe) pero con frame premium, dynamic island, glow y
              chips flotantes. */}
          <div className="relative flex justify-center lg:justify-end">
            {/* Glow de marca detrás del teléfono */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]/15 blur-3xl"
            />

            {/* Chips flotantes — refuerzan el pitch */}
            <div className="absolute -left-2 top-12 z-20 hidden sm:flex items-center gap-1.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-lg)]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <Wallet className="h-4 w-4" strokeWidth={2} />
              </span>
              <div className="leading-tight">
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Yape recibido</p>
                <p className="text-xs font-extrabold text-[var(--text-primary)] tabular-nums">+ S/ 28.50</p>
              </div>
            </div>
            <div className="absolute -right-3 bottom-24 z-20 hidden sm:flex items-center gap-1.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-lg)]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--data-success-500)]/15 text-[var(--data-success-600,#059669)]">
                <Truck className="h-4 w-4" strokeWidth={2} />
              </span>
              <div className="leading-tight">
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">En camino</p>
                <p className="text-xs font-extrabold text-[var(--text-primary)]">Marco · 12 min</p>
              </div>
            </div>

            {/* Frame del teléfono */}
            <div className="relative w-[300px] sm:w-[340px] rounded-[3rem] bg-[var(--text-primary)] p-3 shadow-[var(--shadow-xl)] shadow-[var(--accent)]/25 ring-1 ring-white/10">
              <div className="relative rounded-[2.4rem] bg-[var(--surface-canvas)] overflow-hidden">
                {/* Dynamic island */}
                <div aria-hidden className="absolute top-3 left-1/2 -translate-x-1/2 h-6 w-24 rounded-full bg-[var(--text-primary)] z-20" />
                {/* Status bar */}
                <div aria-hidden className="absolute top-3.5 left-0 right-0 z-10 flex items-center justify-between px-5 text-[10px] font-bold text-[var(--text-tertiary)]">
                  <span className="tabular-nums">9:41</span>
                  <span className="flex items-center gap-1">
                    <span className="inline-flex gap-0.5 items-end">
                      <span className="h-1 w-0.5 rounded-full bg-[var(--text-tertiary)]" />
                      <span className="h-1.5 w-0.5 rounded-full bg-[var(--text-tertiary)]" />
                      <span className="h-2 w-0.5 rounded-full bg-[var(--text-tertiary)]" />
                    </span>
                    <span className="h-2 w-3 rounded-[3px] border border-[var(--text-tertiary)]" />
                  </span>
                </div>

                {/* Header */}
                <div className="px-4 pt-12 pb-3 bg-linear-to-b from-[var(--accent)]/10 to-transparent">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Mi negocio · hoy</p>
                      <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight mt-0.5">Estás vendiendo</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)]/15 px-2 py-1">
                      <span aria-hidden className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500)] opacity-75 animate-ping" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
                      </span>
                      <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-600,#059669)]">LIVE</span>
                    </span>
                  </div>
                </div>

                {/* Vendido hoy + barras */}
                <div className="px-4">
                  <p className="text-[2.25rem] font-extrabold tabular-nums tracking-[-0.04em] leading-none text-[var(--text-primary)]">
                    S/ 2,840
                  </p>
                  <div className="mt-1.5 flex items-end justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)]/12 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-600,#059669)]">
                      <BarChart3 className="h-3 w-3" strokeWidth={2.5} /> +18% vs ayer
                    </span>
                    <div className="flex items-end gap-1 h-8" aria-hidden>
                      {[40, 65, 50, 80, 60, 95, 72].map((h, i) => (
                        <span
                          key={i}
                          className="w-1.5 rounded-full bg-linear-to-t from-[var(--accent)]/40 to-[var(--accent)]"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* KPI row */}
                <div className="px-4 mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-2.5">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Pedidos</p>
                    <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)] leading-none mt-0.5">42</p>
                  </div>
                  <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-2.5">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Clientes</p>
                    <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)] leading-none mt-0.5">128</p>
                  </div>
                </div>

                {/* Módulos */}
                <div className="px-4 mt-3 grid grid-cols-3 gap-1.5">
                  {[
                    { icon: Smartphone, l: "POS" },
                    { icon: Package, l: "Stock" },
                    { icon: Truck, l: "Delivery" },
                    { icon: Wallet, l: "Fiado" },
                    { icon: Receipt, l: "SUNAT" },
                    { icon: MessageCircle, l: "WhatsApp" },
                  ].map((m) => (
                    <div key={m.l} className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] py-2 text-center">
                      <m.icon className="h-4 w-4 mx-auto text-[var(--accent)]" strokeWidth={1.75} />
                      <p className="mt-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{m.l}</p>
                    </div>
                  ))}
                </div>

                {/* Footer CTA */}
                <div className="m-3 mt-3 h-10 rounded-xl bg-[var(--accent-600,var(--accent))] text-white flex items-center justify-between px-4 shadow-[var(--shadow-md)]">
                  <span className="text-xs font-extrabold">Ver todos los pedidos</span>
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Franja de stats — da peso al hero (Brandon: "se veía cortito"). */}
        <div className="mt-14 sm:mt-20 grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-3xl border border-[var(--rule-soft)] bg-[var(--rule-soft)]">
          {[
            { v: "5 min", l: "Listo para vender" },
            { v: "0%", l: "Comisión por venta" },
            { v: "+20", l: "Módulos integrados" },
            { v: "24/7", l: "Soporte por WhatsApp" },
          ].map((s) => (
            <div key={s.l} className="bg-[var(--surface-raised)] px-6 py-7 text-center sm:text-left">
              <p className="text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] tabular-nums text-[var(--accent)] leading-none">
                {s.v}
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Módulos del software — la sección que define a /negocios como landing B2B.
// Reemplaza a las "categorías populares de productos" (eso es B2C/marketplace).
const MODULES = [
  { icon: Smartphone, title: "Punto de venta", tags: ["Yape · Plin", "Ticket al toque", "Caja del día"] },
  { icon: Package, title: "Inventario", tags: ["Stock en vivo", "Alertas de quiebre", "Control de mermas"] },
  { icon: Truck, title: "Delivery", tags: ["Zonas y tarifas", "Tracking en vivo", "Tus repartidores"] },
  { icon: Wallet, title: "Fiado digital", tags: ["Historial", "Recordatorios", "Semáforo de riesgo"] },
  { icon: Receipt, title: "Facturación SUNAT", tags: ["Boletas", "Cotizaciones", "Guías de remisión"] },
  { icon: MessageCircle, title: "WhatsApp + IA", tags: ["Pedidos automáticos", "Confirma pagos", "Asistente 24/7"] },
];

function FeaturesGrid() {
  return (
    <section id="modulos" className="bg-[var(--surface-sunken)]/60 border-y border-[var(--rule-soft)] py-20 sm:py-28 scroll-mt-20">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12 sm:mb-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Todo lo que incluye
            </p>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em] text-[var(--text-primary)] leading-[1.05]">
              Todo tu negocio,{" "}
              <span className="italic font-serif text-[var(--accent)]">en una sola app.</span>
            </h2>
          </div>
          <Link
            href="/abrir-tienda"
            className="shrink-0 inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Ver todo en acción
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {MODULES.map((m) => (
            <article
              key={m.title}
              className="group rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 transition-all hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                aria-hidden
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] mb-4 transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
              >
                <m.icon className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h3 className="font-display text-xl font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
                {m.title}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {m.tags.map((t) => (
                  <li
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]"
                  >
                    <span aria-hidden className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                    {t}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Placeholder honesto para fase pre-launch ──
// v2 (2026-05-10): rediseñado con peso editorial. Antes era CTA solo centrado
// en océano vacío. Ahora 2 columnas con visual de cupos + checklist concreta
// + social proof + urgencia (sin inventar números).
function EarlyAdopterPlaceholder() {
  // Cupos: total 10, tomados 3 (ajustable cuando entren onboardings reales).
  const CUPOS_TOTAL = 10;
  const CUPOS_TOMADOS = 3;
  const cuposDisponibles = CUPOS_TOTAL - CUPOS_TOMADOS;
  const progressPct = (CUPOS_TOMADOS / CUPOS_TOTAL) * 100;

  const BENEFICIOS = [
    "Setup 1-a-1 con tu tienda lista en una tarde",
    "Acompañamiento WhatsApp directo · 90 días",
    "Cero comisión por venta los primeros 90 días",
    "Sesión de fotos de tus productos sin costo",
    "Tu negocio en el mapa Buleje desde el día 1",
  ];

  return (
    <section
      aria-label="Únete a los primeros negocios"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-20 sm:py-28 border-y border-[var(--rule-soft)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-20 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
          {/* ── Columna izquierda: pitch + checklist + CTA ──────────────── */}
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Pre-launch · Pucallpa
            </p>
            <h2 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
              Sé de los primeros{" "}
              <span className="text-[var(--accent)]">{CUPOS_TOTAL} negocios.</span>
            </h2>
            <p className="mt-5 text-lg sm:text-xl text-[var(--text-secondary)] leading-[1.45] max-w-xl">
              Estamos arrancando con bodegas seleccionadas. Te contactamos personalmente,
              configuramos tu tienda contigo y te acompañamos cada paso.
            </p>

            {/* Checklist de qué incluye */}
            <ul className="mt-8 space-y-2.5 max-w-xl">
              {BENEFICIOS.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)] shrink-0 mt-0.5"
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 8.5 6.5 12 13 4" />
                    </svg>
                  </span>
                  <span className="text-base text-[var(--text-secondary)] leading-snug">
                    {b}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/abrir-tienda"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                Reservar mi cupo gratis
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
              </Link>
              <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                Sin tarjeta · 5 minutos · Cancelas cuando quieras
              </span>
            </div>
          </div>

          {/* ── Columna derecha: visual de cupos ────────────────────────── */}
          <aside className="relative">
            <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-7 sm:p-9 shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Cupos del Plan Fundador
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-50)] text-[var(--data-warning-700)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                  Limitado
                </span>
              </div>
              <p className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] tabular-nums leading-none mt-2">
                <span className="text-[var(--accent)]">{cuposDisponibles}</span>
                <span className="text-[var(--text-tertiary)] text-2xl sm:text-3xl font-extrabold ml-2">
                  / {CUPOS_TOTAL}
                </span>
              </p>
              <p className="mt-1 text-base text-[var(--text-secondary)]">
                cupos disponibles ahora mismo
              </p>

              {/* Progress bar */}
              <div className="mt-6">
                <div className="relative h-3 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-[var(--accent)] to-[var(--accent-600,var(--accent))] transition-[width] duration-[var(--dur-slower)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[length:var(--ts-xs)]">
                  <span className="font-bold text-[var(--accent)] tabular-nums">
                    {CUPOS_TOMADOS} tomados
                  </span>
                  <span className="font-bold text-[var(--text-tertiary)] tabular-nums">
                    {cuposDisponibles} libres
                  </span>
                </div>
              </div>

              {/* Avatares de fundadores */}
              <div className="mt-7 pt-6 border-t border-[var(--rule-soft)]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
                  Negocios que ya entraron
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {[
                      { l: "D", c: "var(--accent)" },
                      { l: "P", c: "#722EAB" },
                      { l: "L", c: "#f97316" },
                    ].map(({ l, c }) => (
                      <span
                        key={l}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white font-extrabold text-sm ring-3 ring-[var(--surface-raised)]"
                        style={{ background: c }}
                        aria-hidden
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-snug">
                    <strong className="font-extrabold text-[var(--text-primary)]">Don Lucho, Pòlleria El Dorado</strong>{" "}
                    y otros ya están vendiendo con Buleje.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}


// ── Planes snapshot — fuente única plan-tiers.ts ──
// Brandon mayo 2026 v2: 4 planes alineados con /abrir-tienda y superadmin.
//   Free (S/0 siempre gratis con limites) · Starter (S/89 1er mes gratis) ·
//   Pro (S/179 badge "Mas elegido") · Business (S/349).
function AboutAndPricingSnapshot() {
  return (
    <section
      id="planes"
      aria-label="Planes"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-20 sm:py-28 scroll-mt-20"
    >
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12 sm:mb-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              <T k="landing.plans.kicker" fallback="Planes" />
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              <T k="landing.plans.title" fallback="Prueba un mes," />{" "}
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                <T k="landing.plans.titleAccent" fallback="pagá solo si te conviene." />
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            <T k="landing.plans.description" fallback="Cambiás de plan cuando quieras. Sin contratos, sin permanencia, sin sorpresas en la factura." />
          </p>
        </div>

        {/* Teaser de precios (informativo). El selector interactivo + el
            signup viven en /abrir-tienda — esta página solo informa. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { name: "Free", price: "0", note: "Para empezar gratis" },
            { name: "Starter", price: "89", note: "Primer mes gratis" },
            { name: "Pro", price: "179", note: "El más elegido", highlight: true },
            { name: "Business", price: "349", note: "Todo ilimitado" },
          ].map((p) => (
            <div
              key={p.name}
              className={[
                "relative rounded-2xl border p-5 sm:p-6 bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 hover:shadow-md",
                p.highlight
                  ? "border-[var(--accent)]/50 shadow-md shadow-[var(--accent)]/10"
                  : "border-[var(--rule-soft)]",
              ].join(" ")}
            >
              {p.highlight && (
                <span className="absolute -top-2.5 left-5 inline-flex items-center rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white">
                  {p.note}
                </span>
              )}
              <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
                {p.name}
              </p>
              <p className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-[-0.03em] tabular-nums text-[var(--text-primary)] leading-none">
                <span className="text-lg align-top text-[var(--text-tertiary)]">S/</span>
                {p.price}
                <span className="text-base font-bold text-[var(--text-tertiary)]">/mes</span>
              </p>
              {!p.highlight && (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{p.note}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/abrir-tienda#planes"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
          >
            Ver planes y activar mi tienda
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
          </Link>
          <p className="mt-3 text-sm text-[var(--text-tertiary)]">
            Primer mes gratis · Sin tarjeta · Cancelás cuando quieras
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Formas de pago — chip horizontal compacto con colores de marca ──
// Mayo 2026: antes era una sección gigante de 4 cards con iconos genéricos.
// PaymentMethods v2 (2026-05-10) — sección rediseñada: 2 grupos (digital /
// físico) con cards reales por método + callout "0% comisión" con valor
// claro. Antes era un strip de chips delgados que se perdía visualmente entre
// las secciones grandes vecinas (Planes y FinalCTA).
function PaymentMethods() {
  const METHODS = [
    {
      id: "yape",
      name: "Yape",
      tag: "El más usado en Pucallpa",
      type: "digital" as const,
      brandHex: "#722EAB",
      mark: "Y",
    },
    {
      id: "plin",
      name: "Plin",
      tag: "Multibanco — Interbank, BBVA, BCP",
      type: "digital" as const,
      brandHex: "#00BFB3",
      mark: "P",
    },
    {
      id: "efectivo",
      name: "Efectivo",
      tag: "El repartidor lleva vuelto",
      type: "fisico" as const,
      icon: Banknote,
    },
    {
      id: "tarjeta",
      name: "Tarjeta",
      tag: "Crédito o débito · vía Stripe",
      type: "fisico" as const,
      icon: CreditCard,
    },
  ];

  return (
    <section
      aria-label="Formas de pago"
      className="relative overflow-hidden py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-20 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-5">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            <T k="landing.payment.kicker" fallback="Formas de pago" />
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em] text-[var(--text-primary)] leading-[1.05]">
            Tus clientes pagan{" "}
            <span className="italic font-serif text-[var(--accent)]">como ya saben pagar</span>.
          </h2>
          <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
            Cuatro métodos cubiertos. Tu negocio cobra como siempre, sin curva de aprendizaje.
          </p>
        </div>

        {/* Grid 4 métodos */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10 sm:mb-12">
          {METHODS.map((m) => (
            <article
              key={m.id}
              className="group relative rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 transition-all duration-[var(--dur-base)] hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                {m.type === "digital" ? (
                  <span
                    aria-hidden
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-white font-extrabold text-lg shadow-sm"
                    style={{ background: m.brandHex }}
                  >
                    {m.mark}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
                  >
                    {m.icon ? <m.icon className="h-5 w-5" strokeWidth={2} /> : null}
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${
                    m.type === "digital"
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {m.type === "digital" ? "Digital" : "Físico"}
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                {m.name}
              </p>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-snug">
                {m.tag}
              </p>
            </article>
          ))}
        </div>

        {/* Callout 0% comisión + Cobras como ya cobras */}
        <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex items-center gap-5 flex-1 min-w-0">
            <p className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] tabular-nums leading-none shrink-0">
              <span className="text-[var(--accent)]">0</span>
              <span className="text-[var(--text-secondary)]">%</span>
            </p>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Comisión por venta
              </p>
              <p className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] leading-tight">
                Cobras como ya cobras — el dinero llega directo a tu Yape, tu cuenta o tu caja.
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)] leading-snug">
                Buleje no toca tus ventas. Pagas solo el plan mensual, sin sorpresas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA editorial ──
function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
          />
          <T k="landing.finalCta.kicker" fallback="Empieza hoy" />
        </p>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-extrabold tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
          <T k="landing.finalCta.title1" fallback="Tu negocio merece" />{" "}
          <br />
          <span className="italic font-serif text-[var(--accent)]">
            <T k="landing.finalCta.titleAccent" fallback="algo más grande." />
          </span>
        </h2>
        <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
          <T k="landing.finalCta.description" fallback="Activa tu tienda online en 5 minutos y empieza a recibir pedidos hoy mismo. Sin compromiso, cancelas cuando quieras." />
        </p>
        {/* CTA único — antes había 2 botones idénticos hacia /abrir-tienda. */}
        <div className="mt-12 flex justify-center">
          <Link
            href="/abrir-tienda"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-10 py-5 text-lg font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
          >
            Abrir mi tienda gratis
            <ArrowUpRight
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.5}
            />
          </Link>
        </div>
        <p className="mt-6 text-sm text-[var(--text-tertiary)]">
          Sin tarjeta · Setup en 5 minutos · Cancelás cuando quieras
        </p>
      </div>
    </section>
  );
}

// ── Main page ──
// Flujo informativo: hero → categorías → cómo funciona → detrás del marketplace
// (bodegueros) → voz de la comunidad (reseñas) → ser parte (negocio / repartidor)
// → formas de pago → CTA.
// Removido: RecommendationsEngine, SocioPromoBanner, FeaturedStoresSection.
// (La landing debe informar, no vender productos individuales — eso es /marketplace/explorar).
// Brandon 2026-05-20 v5: LandingHeader y Footer removidos. Chrome unificado
// (MarketplaceNavbar + ConditionalPromoBar + ConditionalSecondaryNav +
// BottomNav + Footer) heredado del layout app/(store)/layout.tsx.
export default async function Home() {
  return (
    <main id="main-content">
      <BulejeJsonLd />
      {/* h1 SEO sr-only — jerarquía semántica para Googlebot. El B2BHero usa h2
          para mantener el flujo visual editorial. */}
      <h1 className="sr-only">
        Software para bodega y tienda en Perú — Buleje. Abrí tu tienda
        online en 5 minutos con POS, delivery, fiado, SUNAT y Yape.
      </h1>

      {/* Flujo B2B: hero software → módulos → cómo funciona → planes →
          plan fundador → pagos → nosotros → FAQ → CTA. */}
      <B2BHero />

      <Reveal>
        <FeaturesGrid />
      </Reveal>

      {/* Cómo funciona — 4 pasos */}
      <Reveal>
        <ComoFuncionaSection />
      </Reveal>

      {/* Planes (teaser informativo → /abrir-tienda para activar) */}
      <Reveal>
        <AboutAndPricingSnapshot />
      </Reveal>

      {/* Plan Fundador — primeros 10 negocios (antes era fallback de reviews) */}
      <Reveal>
        <EarlyAdopterPlaceholder />
      </Reveal>

      {/* Formas de pago de tus clientes */}
      <Reveal>
        <PaymentMethods />
      </Reveal>

      {/* Nosotros — historia + valores */}
      <Reveal>
        <NosotrosSection />
      </Reveal>

      {/* FAQ */}
      <Reveal>
        <FAQSection />
      </Reveal>

      {/* CTA final */}
      <Reveal>
        <FinalCTA />
      </Reveal>

      <StickyMobileCTA />
    </main>
  );
}

function SectionSkeleton() {
  return <PaicheLoading variant="section" />;
}
