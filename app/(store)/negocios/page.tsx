import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
// Brandon 2026-05-27 — rediseño B2B: /negocios deja de reusar el home B2C
// (LandingHero "Más clientes", categorías de productos, reseñas de clientes,
// bodeguero spotlight). Ahora es una landing de SOFTWARE clara y distinta de
// /abrir-tienda: hero B2B propio + grid de MÓDULOS del software. Las secciones
// de apoyo (cómo funciona, planes, plan fundador, FAQ) se conservan.
// Brandon 2026-06-03 — dos secciones nuevas que refuerzan el concepto
// institucional de /negocios ("qué es Buleje · por qué confiar"):
//  · ParaQuienSection: un sistema, todos los rubros (verticales reales).
//  · PorQueConfiarSection: credibilidad institucional (hecho en Perú, 0%
//    comisión, soporte humano, datos protegidos por ley).
const ParaQuienSection = dynamic(
  () => import("@/components/landing/sections/ParaQuienSection"),
  { loading: () => <SectionSkeleton /> },
);
const PorQueConfiarSection = dynamic(
  () => import("@/components/landing/sections/PorQueConfiarSection"),
  { loading: () => <SectionSkeleton /> },
);
const ComoFuncionaSection = dynamic(
  () => import("@/components/landing/sections/ComoFuncionaSection"),
  { loading: () => <div className="min-h-[400px] bg-[var(--surface-raised)]" aria-hidden /> },
);
const NosotrosSection = dynamic(
  () => import("@/components/landing/sections/NosotrosSection"),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
// FAQ removido de /negocios (Brandon 2026-06-03): la FAQ extensa vive SOLO en
// /abrir-tienda (página de conversión). /negocios es top-funnel institucional.
const StickyMobileCTA = dynamic(() => import("@/components/landing/StickyMobileCTA"));
import { Reveal } from "@/components/landing/Reveal";
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import T from "@/components/T";
import {
  Store,
  ArrowUpRight,
  Smartphone,
  Package,
  Truck,
  Wallet,
  Receipt,
  MessageCircle,
  BarChart3,
  ShieldCheck,
  Sparkles,
  Check,
  MapPin,
} from "@buleje/design-system/icons";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
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
  // Brandon 2026-06-03 SEO: title 71→52 chars (con sufijo "| Buleje") para no
  // truncar en SERP. Description reescrita — antes mencionaba "Plan Fundador en
  // Pucallpa" (se movió a /abrir-tienda + geo viejo). Ahora posiciona por
  // "software para bodega" (intención B2B), nacional (SaaS), sin contenido stale.
  title: "Software para bodegas y minimarkets en Perú",
  description:
    "El software todo-en-uno para tu bodega: POS, inventario, fiado digital, facturación SUNAT y delivery. Cobra con Yape, sin comisión.",
  // Brandon 2026-06-04 SEO (auditoría): meta keywords eliminadas — Google/Bing
  // las ignoran hace años (keyword-stuffing inerte, sin beneficio). Las keywords
  // reales viven en title, description, el kicker del hero y el JSON-LD
  // (featureList → rich understanding). hreflang es-PE explícito abajo.
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
    title: "Software para bodegas y minimarkets en Perú",
    description:
      "POS, inventario, fiado digital, SUNAT y delivery en una sola app. Cobra con Yape, sin comisión.",
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
    title: "Software para bodegas y minimarkets en Perú",
    description:
      "POS, inventario, fiado digital, SUNAT y delivery en una sola app. Cobra con Yape, sin comisión.",
    images: ["/api/og/negocios"],
  },
};

// ── JSON-LD structured data (B2B landing) ──
// Brandon 2026-06-03 — 3 schemas para /negocios (institucional, top-funnel):
// 1) SoftwareApplication (tipo correcto para landing B2B software)
// 2) BreadcrumbList
// 3) HowTo (cómo abrir tu tienda en 5 min)
// FAQPage REMOVIDO: la FAQ visible se movió a /abrir-tienda; mantener el schema
// sin contenido visible viola la policy de Google (rich result sin match).
// AggregateRating sintético eliminado (penalty risk Google).
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
    operatingSystem: "Web, Android, iOS",
    inLanguage: "es-PE",
    // featureList: ayuda a Google/IAs a entender el alcance del producto como
    // entidad (rich understanding + citación en respuestas generativas).
    featureList: [
      "Punto de venta (POS) con Yape y Plin",
      "Inventario en tiempo real y alertas de quiebre",
      "Fiado digital con historial y recordatorios",
      "Facturación electrónica SUNAT (boletas, guías, notas)",
      "Delivery con zonas, tarifas y tracking en vivo",
      "Pedidos por WhatsApp con asistente IA",
      "Reportes de ventas, caja y flujo de dinero",
    ],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "PEN",
      lowPrice: "0",
      highPrice: "349",
      offerCount: 4,
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "PEN" },
        { "@type": "Offer", name: "Starter", price: "89", priceCurrency: "PEN" },
        { "@type": "Offer", name: "Pro", price: "179", priceCurrency: "PEN" },
        { "@type": "Offer", name: "Business", price: "349", priceCurrency: "PEN" },
      ],
    },
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
        name: "Regístrate gratis",
        text: "Crea tu cuenta en buleje.pe/abrir-tienda. No pedimos tarjeta de crédito.",
        url: `${baseUrl}/abrir-tienda`,
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Carga tus productos y zonas de delivery",
        text: "Sube tu catálogo con precios y stock, y define las zonas a las que repartes. Si quieres, hacemos el setup 1-a-1 contigo.",
        url: `${baseUrl}/abrir-tienda`,
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Comparte tu tienda y recibe pedidos",
        text: "Comparte el link de tu tienda. Recibes los pedidos por WhatsApp y cobras con Yape, Plin, efectivo o tarjeta, directo a tu cuenta.",
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
            <h1 className="text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Un solo sistema para{" "}
              <span className="italic font-serif text-[var(--accent)]">vender, cobrar y crecer.</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-xl">
              La plataforma de comercio para los negocios del Perú: POS,
              inventario, delivery, fiado digital y boletas SUNAT — todo
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
                { icon: Wallet, label: "Cobras con Yape/Plin" },
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

            {/* Wrapper al ANCHO EXACTO del teléfono — ancla los chips a sus
                bordes (antes flotaban en el vacío del contenedor ancho). */}
            <div className="relative w-[300px] sm:w-[340px]">
              {/* Chip Yape — cuelga del borde IZQUIERDO, casi todo afuera (solo
                  besa el borde), arriba. No tapa el monto. Solo lg: hay gutter. */}
              <div className="absolute left-0 top-16 -translate-x-[94%] z-20 hidden lg:flex items-center gap-1.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-lg)]">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <Wallet className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="leading-tight">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Yape recibido</p>
                  <p className="text-xs font-extrabold text-[var(--text-primary)] tabular-nums">+ S/ 28.50</p>
                </div>
              </div>
              {/* Chip Delivery — también cuelga del borde IZQUIERDO, abajo (el
                  gutter derecho es chico y se recortaba en el viewport). */}
              <div className="absolute left-0 bottom-24 -translate-x-[94%] z-20 hidden lg:flex items-center gap-1.5 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-lg)]">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--data-success-500)]/15 text-[var(--data-success-600,#059669)]">
                  <Truck className="h-4 w-4" strokeWidth={2} />
                </span>
                <div className="leading-tight">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">En camino</p>
                  <p className="text-xs font-extrabold text-[var(--text-primary)]">Marco · 12 min</p>
                </div>
              </div>

              {/* Frame del teléfono */}
              <div className="relative w-full rounded-[3rem] bg-[var(--text-primary)] p-3 shadow-[var(--shadow-xl)] shadow-[var(--accent)]/25 ring-1 ring-white/10">
              {/* Botones laterales del teléfono */}
              <span aria-hidden className="absolute -left-[3px] top-[118px] h-7 w-[3px] rounded-l-full bg-[var(--text-primary)]" />
              <span aria-hidden className="absolute -left-[3px] top-[160px] h-11 w-[3px] rounded-l-full bg-[var(--text-primary)]" />
              <span aria-hidden className="absolute -right-[3px] top-[150px] h-16 w-[3px] rounded-r-full bg-[var(--text-primary)]" />
              <div className="relative rounded-[2.4rem] bg-[var(--surface-canvas)] overflow-hidden">
                {/* Reflejo sutil del vidrio */}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 z-10 bg-linear-to-b from-white/10 to-transparent" />
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

                {/* Últimos pedidos — da altura y realismo a la pantalla */}
                <div className="px-4 mt-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Últimos pedidos</p>
                  <ul className="space-y-1.5">
                    {[
                      { n: "Doña Marta", d: "Pollo broaster", v: "28.50", t: "2 min" },
                      { n: "Carlos S.", d: "Yape confirmado", v: "15.00", t: "5 min" },
                      { n: "Lucía P.", d: "Abarrotes", v: "42.30", t: "7 min" },
                    ].map((o) => (
                      <li key={o.n} className="flex items-center gap-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-2.5 py-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[length:var(--ts-2xs)] font-extrabold text-[var(--accent)]">
                          {o.n.charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="text-[length:var(--ts-xs)] font-extrabold text-[var(--text-primary)] truncate">{o.n}</p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{o.d}</p>
                        </div>
                        <div className="text-right leading-tight shrink-0">
                          <p className="text-[length:var(--ts-xs)] font-extrabold tabular-nums text-[var(--text-primary)]">S/ {o.v}</p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{o.t}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Footer CTA */}
                <div className="mx-3 mt-3 h-10 rounded-xl bg-[var(--accent-600,var(--accent))] text-white flex items-center justify-between px-4 shadow-[var(--shadow-md)]">
                  <span className="text-xs font-extrabold">Ver todos los pedidos</span>
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
                </div>
                {/* Home indicator */}
                <div aria-hidden className="mx-auto my-2.5 h-1 w-28 rounded-full bg-[var(--text-tertiary)]/30" />
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

// ── Módulos del software — BENTO XL con mini-pantallas vivas ───────────────
// Brandon 2026-06-04 (rediseño "más potente"): el bento ahora abre con un tile
// POS grande que cuenta la CADENA — un cobro mueve stock + caja + boleta SUNAT
// (el diferenciador real: "todo en una app"). Cada tile lleva su categoría
// (Vender/Controlar/Cobrar/Crecer) y debajo se revela el sistema completo:
// 25 módulos REALES agrupados por lo que resuelven. Concreto, denso, honesto.

// Catálogo completo de módulos, agrupado por lo que resuelve cada uno. Nombres
// REALES del producto (POS, Fiado, SUNAT, ADRs 077 gift-cards / 117 adelantos /
// 119 documentos, schema Prisma: PurchaseOrder, Turno, Cotizacion, Treasury…).
const MODULE_CATEGORIES = [
  { label: "Vender", icon: Smartphone, modules: ["POS", "Marketplace", "Pedidos WhatsApp", "Promociones", "Cupones", "Gift cards", "Reservas"] },
  { label: "Controlar", icon: Package, modules: ["Inventario", "Lotes y vencimientos", "Compras", "Proveedores", "Caja y arqueo", "Turnos"] },
  { label: "Cobrar", icon: Wallet, modules: ["Fiado digital", "Yape y Plin", "Tarjeta", "Boletas SUNAT", "Tesorería", "Adelantos"] },
  { label: "Crecer", icon: Sparkles, modules: ["Delivery", "WhatsApp + IA", "Reportes", "Lealtad", "Reseñas", "Documentos"] },
] as const;

// Shell común de cada tile del bento (icono + título + blurb + categoría + visual).
function BentoCard({
  className = "",
  icon: Icon,
  title,
  blurb,
  category,
  children,
}: {
  className?: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  blurb: string;
  /** Categoría (Vender / Controlar / Cobrar / Crecer) — pill sutil arriba a la derecha. */
  category?: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6 transition-all hover:border-[var(--accent)]/50 hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5",
        className,
      )}
    >
      {/* Glow de marca al hover — profundidad sin coste de render. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[var(--accent)]/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)] leading-none">
            {title}
          </h3>
          <p className="mt-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] leading-tight">
            {blurb}
          </p>
        </div>
        {category && (
          <span className="shrink-0 inline-flex items-center rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
            {category}
          </span>
        )}
      </div>
      <div className="relative mt-5 flex flex-1 flex-col justify-end">{children}</div>
    </article>
  );
}

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
            <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
              No te lo contamos con viñetas — te lo mostramos. Así se ve cada
              módulo trabajando dentro de tu negocio.
            </p>
          </div>
          <Link
            href="/abrir-tienda"
            className="shrink-0 inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Ver todo en acción
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </div>

        {/* Bento asimétrico: POS grande (2×2), inventario ancho, fiado+delivery
            chicos, SUNAT y WhatsApp anchos abajo. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[repeat(3,minmax(12rem,1fr))] gap-4 sm:gap-5">
          {/* ── POS — tile grande con mini-pantalla de cobro ── */}
          <BentoCard
            icon={Smartphone}
            title="Punto de venta"
            blurb="Cobra y todo tu negocio se actualiza solo"
            category="Vender"
            className="lg:col-span-2 lg:row-span-2 bg-gradient-to-br from-[var(--accent-soft)]/50 to-[var(--surface-raised)]"
          >
            <div className="space-y-3">
              {/* Mini-estado del día — el POS no solo cobra, es tu caja en vivo. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1">
                  <span aria-hidden className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500)] opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
                  </span>
                  <span className="text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-[var(--text-secondary)]">Hoy S/ 2,840</span>
                  <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-600,#059669)]">+18%</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                  42 pedidos
                </span>
              </div>

              {/* Cobro POS con carrito real. */}
              <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-center justify-between">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cobrando · 3 productos</p>
                  <p className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">09:41</p>
                </div>
                <ul className="mt-2.5 space-y-1.5">
                  {[
                    { n: "Arroz Costeño 5 kg", v: "18.50" },
                    { n: "Aceite Primor 1 L", v: "8.50" },
                    { n: "Gaseosa 1.5 L", v: "1.50" },
                  ].map((it) => (
                    <li key={it.n} className="flex items-center justify-between gap-2 text-[length:var(--ts-xs)]">
                      <span className="truncate text-[var(--text-secondary)]">{it.n}</span>
                      <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">S/ {it.v}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 flex items-end justify-between border-t border-[var(--rule-soft)] pt-2.5">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total</span>
                  <span className="text-[2rem] font-extrabold tabular-nums tracking-[-0.04em] leading-none text-[var(--text-primary)]">S/ 28.50</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Yape", "Plin", "Efectivo", "Tarjeta"].map((m, i) => (
                    <span
                      key={m}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold",
                        i === 0 ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                      )}
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-[var(--data-success-500)]/12 px-3 py-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--data-success-600,#059669)] text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <p className="text-[length:var(--ts-xs)] font-extrabold text-[var(--data-success-600,#059669)]">Yape confirmado · S/ 28.50</p>
                </div>
              </div>

              {/* La CADENA — un cobro mueve todo el sistema. Este es el diferenciador. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                  Con 1 cobro
                </span>
                {["Venta registrada", "Stock −3", "Boleta SUNAT"].map((step) => (
                  <span key={step} className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                    <Check className="h-3 w-3 text-[var(--data-success-600,#059669)]" strokeWidth={3} />
                    {step}
                  </span>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* ── Inventario — barras de stock en vivo ── */}
          <BentoCard
            icon={Package}
            title="Inventario"
            blurb="Stock en vivo + alertas de quiebre"
            category="Controlar"
            className="lg:col-span-2"
          >
            <ul className="space-y-2.5">
              {[
                { n: "Arroz 5kg", pct: 82, tone: "ok" },
                { n: "Aceite 1L", pct: 44, tone: "warn" },
                { n: "Balón de gas", pct: 12, tone: "low" },
              ].map((p) => (
                <li key={p.n} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)]">
                    {p.n}
                  </span>
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        p.tone === "ok" && "bg-[var(--data-success-500)]",
                        p.tone === "warn" && "bg-[var(--data-warning-500,#ff6b5b)]",
                        p.tone === "low" && "bg-[var(--data-error-500,#ef4444)]",
                      )}
                      style={{ width: `${p.pct}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "w-9 shrink-0 text-right text-[length:var(--ts-2xs)] font-extrabold tabular-nums",
                      p.tone === "low" ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {p.pct}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-600,#dc2626)]">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-error-500,#ef4444)] animate-pulse" />
              1 producto por agotarse
            </p>
          </BentoCard>

          {/* ── Fiado digital — semáforo de riesgo ── */}
          <BentoCard icon={Wallet} title="Fiado digital" blurb="Semáforo de riesgo" category="Cobrar">
            <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[length:var(--ts-2xs)] font-extrabold text-[var(--accent)]">
                  M
                </span>
                <span className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)]">Doña Marta</span>
                <span className="ml-auto text-[length:var(--ts-xs)] font-extrabold tabular-nums text-[var(--text-primary)]">
                  S/ 45
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500,#ff6b5b)] ring-2 ring-[var(--data-warning-500,#ff6b5b)]/30" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--surface-sunken)]" />
                <span className="ml-auto text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700,#c93b2c)]">
                  Recordar pago
                </span>
              </div>
            </div>
          </BentoCard>

          {/* ── Delivery — mini ruta con tracking ── */}
          <BentoCard icon={Truck} title="Delivery" blurb="Tracking en vivo" category="Crecer">
            <div className="relative rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3.5">
              <div className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
                <span
                  aria-hidden
                  className="h-[2px] flex-1 bg-[repeating-linear-gradient(to_right,var(--accent)_0,var(--accent)_4px,transparent_4px,transparent_8px)]"
                />
                <span className="relative inline-flex h-4 w-4 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500)] opacity-60 animate-ping" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)]" />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)]">Marco</span>
                <span className="rounded-full bg-[var(--data-success-500)]/15 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-600,#059669)]">
                  12 min
                </span>
              </div>
            </div>
          </BentoCard>

          {/* ── Facturación SUNAT — mini boleta electrónica ── */}
          <BentoCard
            icon={Receipt}
            title="Facturación SUNAT"
            blurb="Boletas, guías y notas en regla"
            category="Controlar"
            className="lg:col-span-2"
          >
            <div className="flex items-center gap-4 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
              <div className="flex-1 space-y-1.5">
                <span aria-hidden className="block h-2 w-2/3 rounded-full bg-[var(--surface-sunken)]" />
                <span aria-hidden className="block h-2 w-full rounded-full bg-[var(--surface-sunken)]" />
                <span aria-hidden className="block h-2 w-4/5 rounded-full bg-[var(--surface-sunken)]" />
                <div className="flex items-center justify-between pt-1.5">
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Total IGV inc.
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">S/ 28.50</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1.5 border-l border-[var(--rule-soft)] pl-4 text-center">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--data-success-500)]/15 text-[var(--data-success-600,#059669)]">
                  <Check className="h-5 w-5" strokeWidth={3} />
                </span>
                <span className="text-[length:var(--ts-2xs)] font-extrabold text-[var(--data-success-600,#059669)] leading-tight">
                  Enviada a<br />SUNAT
                </span>
              </div>
            </div>
          </BentoCard>

          {/* ── WhatsApp + IA — mini chat con respuesta automática ── */}
          <BentoCard
            icon={MessageCircle}
            title="WhatsApp + IA"
            blurb="El asistente que vende por ti 24/7"
            category="Vender"
            className="lg:col-span-2"
          >
            <div className="space-y-2">
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-[var(--surface-sunken)] px-3.5 py-2">
                <p className="text-[length:var(--ts-xs)] text-[var(--text-primary)]">Hola, ¿tienen balón de gas?</p>
              </div>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--accent)] px-3.5 py-2">
                <p className="text-[length:var(--ts-xs)] font-medium text-white">
                  ¡Sí! Balón a S/ 52. ¿Te lo llevo a tu casa?
                </p>
              </div>
              <p className="ml-auto inline-flex w-full items-center justify-end gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                <Sparkles className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.25} />
                Respondido por la IA en 2 seg
              </p>
            </div>
          </BentoCard>
        </div>

        {/* ── El sistema completo: 25 módulos agrupados por lo que resuelven ──
            Las 6 mini-pantallas de arriba son la punta del iceberg. Acá se ve
            que "todo lo que incluye" es literal — sin cobrar extra por cada uno. */}
        <div className="mt-4 sm:mt-5 rounded-3xl border border-[var(--rule-soft)] bg-gradient-to-br from-[var(--surface-raised)] to-[var(--accent-soft)]/30 p-6 sm:p-8">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
                El sistema completo
              </p>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
                Y mucho más —{" "}
                <span className="italic font-serif text-[var(--accent)]">25+ módulos</span>{" "}
                en el mismo plan.
              </h3>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 self-start rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-2 text-sm font-extrabold text-[var(--text-secondary)]">
              <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
              Sin pagar extra por cada uno
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-7">
            {MODULE_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <p className="mb-3.5 flex items-center gap-2 text-sm font-extrabold text-[var(--text-primary)]">
                  <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                    <cat.icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  {cat.label}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {cat.modules.map((m) => (
                    <li
                      key={m}
                      className="inline-flex items-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
        {/* CTA principal (activar) + secundario (ver precios). Ambos llevan a
            /abrir-tienda, la única página de conversión y de precios. */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/abrir-tienda"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-10 py-5 text-lg font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
          >
            Probar gratis 1 mes
            <ArrowUpRight
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.5}
            />
          </Link>
          <Link
            href="/abrir-tienda#planes"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-8 py-5 text-lg font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Ver planes y precios
            <ArrowUpRight className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        </div>
        <p className="mt-6 text-sm text-[var(--text-tertiary)]">
          Sin tarjeta · Setup en 5 minutos · Cancelas cuando quieras
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
      {/* Brandon 2026-06-04 SEO (auditoría): el h1 ahora es el TITULAR VISIBLE
          del hero ("Un solo sistema para vender, cobrar y crecer") — humano, no
          robótico. Se eliminó el h1 sr-only con keyword-stuffing (anti-patrón
          que Google penaliza). Las keywords ("software para bodega/minimarket")
          viven en title, description, el kicker del hero y el JSON-LD. */}

      {/* Brandon 2026-06-03 — /negocios = top-funnel INSTITUCIONAL ("qué es
          Buleje · por qué confiar"). Precios completos, Plan Fundador detallado
          y FAQ larga se movieron a /abrir-tienda (página de conversión) para no
          tener dos landings gemelas ni dos fuentes de precio que sincronizar.
          Formas de pago se quitó (lo cubre /abrir-tienda con más detalle).
          Flujo (2026-06-04, auditoría): hero (qué es) → módulos (qué incluye) →
          cómo funciona (¿cómo empiezo?) → para quién (todos los rubros) → por
          qué confiar (credibilidad) → nosotros (quiénes somos) → CTA. */}
      <B2BHero />

      {/* Módulos del software — qué incluye, a alto nivel */}
      <Reveal>
        <FeaturesGrid />
      </Reveal>

      {/* Cómo funciona — 4 pasos. Brandon 2026-06-04: subido aquí (justo tras
          módulos) — responde "¿y cómo empiezo?" mientras el interés está alto,
          antes de segmentar por rubro (auditoría). Compartido con el home. */}
      <Reveal>
        <ComoFuncionaSection />
      </Reveal>

      {/* Para quién es — un sistema, todos los rubros (verticales reales) */}
      <Reveal>
        <ParaQuienSection />
      </Reveal>

      {/* Por qué confiar — credibilidad institucional (único de /negocios) */}
      <Reveal>
        <PorQueConfiarSection />
      </Reveal>

      {/* Nosotros — historia + valores (único de /negocios) */}
      <Reveal>
        <NosotrosSection />
      </Reveal>

      {/* CTA final → /abrir-tienda (planes + plan fundador + FAQ viven allá) */}
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
