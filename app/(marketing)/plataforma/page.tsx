"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PricingTable from "@/components/marketing/PricingTable";

// ── Viewport compartido para whileInView ──────────────────────────────────────
const VP = { once: true, margin: "-80px" } as const;
const VP_SM = { once: true, margin: "-60px" } as const;

// ── WhatsApp link ─────────────────────────────────────────────────────────────
const WA_LINK =
  "https://wa.me/51999999999?text=Hola%2C%20quiero%20saber%20m%C3%A1s%20sobre%20Buleje%20ERP";

// ── JSON-LD Schema.org ────────────────────────────────────────────────────────
// Renderizado como string inline; el componente es client pero el script es
// estático — ideal para SEO sin bloquear hidratación.
function JsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Buleje ERP",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    description:
      "Sistema ERP completo para bodegas y minimarkets en Perú. POS, inventario, fiado digital, delivery, WhatsApp y reportes diarios.",
    url: "https://buleje.pe/plataforma",
    inLanguage: "es-PE",
    offers: [
      {
        "@type": "Offer",
        name: "Plan Gratis",
        price: "0",
        priceCurrency: "PEN",
        description: "100 productos, 1 usuario, POS básico",
      },
      {
        "@type": "Offer",
        name: "Plan Starter",
        price: "49",
        priceCurrency: "PEN",
        description: "1000 productos, 3 usuarios, fiado + delivery",
      },
      {
        "@type": "Offer",
        name: "Plan Pro",
        price: "149",
        priceCurrency: "PEN",
        description: "Ilimitado, WhatsApp bot, IA coach, marketplace",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "127",
    },
    author: {
      "@type": "Organization",
      name: "Buleje",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Pucallpa",
        addressRegion: "Ucayali",
        addressCountry: "PE",
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    ),
    title: "POS rápido",
    badge: "< 2 seg por venta",
    description:
      "Cobra en menos de 2 segundos con teclado, lector de codigos o pantalla tactil. Vuelto automatico, Yape, efectivo y tarjeta.",
  },
  {
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
    title: "Fiado digital inteligente",
    badge: "Scoring automatico",
    description:
      "Lleva el fiado de cada cliente con scoring automatico. Sabe quien paga bien, quien no, y manda recordatorios por WhatsApp.",
  },
  {
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7"
        />
      </svg>
    ),
    title: "Inventario con alertas",
    badge: "Te avisa antes",
    description:
      "Control de stock con vencimientos FEFO. Te avisa antes de que se acabe o venza. Nunca mas perdidas por productos olvidados.",
  },
  {
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
    title: "WhatsApp automatico",
    badge: "Recibos y recordatorios",
    description:
      "Envia recibos, recordatorios de pago y confirmaciones de pedidos por WhatsApp sin que tengas que hacer nada.",
  },
  {
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
    title: "Delivery con tracking",
    badge: "Tu cliente sabe donde va",
    description:
      "Gestiona repartidores y pedidos en tiempo real. Tu cliente rastrea su pedido en el mapa, igual que un delivery grande.",
  },
  {
    icon: (
      <svg
        className="size-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    title: "Reportes diarios",
    badge: "Cuanto vendiste hoy",
    description:
      "Al cerrar el dia ves exactamente cuanto vendiste, que productos rotaron mas y cual fue tu margen. Sin calcular nada a mano.",
  },
];

// ── Stats ─────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "144", label: "modulos del sistema" },
  { value: "592", label: "funciones activas" },
  { value: "24/7", label: "operacion automatica" },
  { value: "2 min", label: "para configurar" },
];

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote:
      "Antes perdia horas contando el stock a mano. Ahora en 5 minutos tengo todo el reporte del dia.",
    name: "Maria Quispe",
    role: "Bodega El Progreso, Ucayali",
    initials: "MQ",
  },
  {
    quote:
      "El fiado digital me cambio la vida. Antes olvidaba quien me debia. Ahora WhatsApp avisa solo.",
    name: "Carlos Rengifo",
    role: "Minimarket La Union, Pucallpa",
    initials: "CR",
  },
  {
    quote:
      "Empece con el plan gratis y en 2 semanas ya estaba haciendo delivery con tracking. Mis clientes alucinan.",
    name: "Rosa Panduro",
    role: "Bodega La Familia, Ucayali",
    initials: "RP",
  },
];

// ── Pricing simplificado (3 planes para bodegas) ──────────────────────────────
const SIMPLE_PLANS = [
  {
    id: "free" as const,
    name: "Gratis",
    price: "S/0",
    period: "para siempre",
    description: "Para empezar sin riesgo",
    features: [
      "100 productos",
      "1 usuario",
      "POS básico",
      "Inventario simple",
      "App móvil",
    ],
    cta: "Empieza gratis",
    href: "/plataforma/registro?plan=free",
    popular: false,
    highlight: false,
  },
  {
    id: "pro" as const,
    name: "Starter",
    price: "S/49",
    period: "/mes",
    description: "El mas elegido por bodegas",
    features: [
      "1,000 productos",
      "3 usuarios",
      "POS completo",
      "Fiado digital",
      "Delivery con tracking",
      "WhatsApp automatico",
      "Reportes avanzados",
    ],
    cta: "Empieza gratis",
    href: "/plataforma/registro?plan=pro",
    popular: true,
    highlight: true,
  },
  {
    id: "business" as const,
    name: "Pro",
    price: "S/149",
    period: "/mes",
    description: "Para bodegas que quieren crecer mas",
    features: [
      "Productos ilimitados",
      "Usuarios ilimitados",
      "Todo el plan Starter",
      "WhatsApp bot IA",
      "Coach IA de ventas",
      "Marketplace en linea",
      "Multi-sucursal",
      "API + integraciones",
    ],
    cta: "Empieza gratis",
    href: "/plataforma/registro?plan=business",
    popular: false,
    highlight: false,
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "Funciona sin internet?",
    a: "Si. El modo offline guarda tus ventas localmente y sincroniza automaticamente cuando recuperas la conexion. Ideal para zonas con internet inestable.",
  },
  {
    q: "Necesito computadora?",
    a: "No. Buleje funciona desde tu celular Android o iPhone. Tambien puedes usar una tablet o computadora — lo que tengas a mano.",
  },
  {
    q: "Como hago mis boletas SUNAT?",
    a: "El sistema esta integrado con la SUNAT via OSE. Emite boletas y facturas electronicamente con un toque. Sin instalar nada extra.",
  },
  {
    q: "Puedo probarlo gratis?",
    a: "Si, el plan Gratis no tiene limite de tiempo. Ademas, los planes de pago incluyen 14 dias de prueba sin tarjeta de credito.",
  },
  {
    q: "Que pasa con mis datos?",
    a: "Tus datos son 100% tuyos. Estan alojados en servidores seguros con respaldo diario. Puedes exportarlos en cualquier momento. Cumplimos con la Ley 29733 de Proteccion de Datos del Peru.",
  },
];

// ── Subcomponentes ────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-linear-to-br from-background via-background to-primary/5 py-20 sm:py-28 lg:py-36 dark:to-primary/10"
      aria-label="Presentacion de Buleje ERP"
    >
      {/* Decoracion de fondo */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -right-32 -top-32 size-[600px] rounded-full bg-primary/5 blur-3xl dark:bg-primary/10" />
        <div className="absolute -bottom-32 -left-32 size-[400px] rounded-full bg-secondary/5 blur-3xl dark:bg-secondary/10" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        {/* Pill badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary dark:border-primary/30 dark:bg-primary/10"
        >
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          Hecho para bodegas de Pucallpa
        </motion.div>

        {/* Titular */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Tu bodega en Pucallpa{" "}
          <span className="text-primary">merece un sistema inteligente</span>
        </motion.h1>

        {/* Subtitulo */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl"
        >
          Ventas, inventario, fiado digital, delivery — todo en 1 app.{" "}
          <strong className="font-semibold text-foreground">
            Prueba gratis 14 dias.
          </strong>
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          {/* CTA principal */}
          <Link
            href="/registro"
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary px-8 text-base font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
          >
            Empieza gratis
          </Link>

          {/* CTA WhatsApp */}
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-8 text-base font-semibold text-foreground transition-all hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-card/80 sm:w-auto"
          >
            {/* Icono WhatsApp */}
            <svg
              className="size-5 shrink-0 text-[#25D366]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            Escribenos
          </a>
        </motion.div>

        {/* Nota sin tarjeta */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="mt-4 text-sm text-muted"
        >
          Sin tarjeta de credito. Configuracion en 2 minutos.
        </motion.p>

        {/* Mockup / ilustracion placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          className="mt-14 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-primary/10 dark:shadow-primary/5"
          aria-label="Vista previa del sistema POS"
        >
          {/* Barra de navegacion falsa */}
          <div className="flex items-center gap-1.5 border-b border-border/60 bg-surface px-4 py-3 dark:bg-card/50">
            <span className="size-3 rounded-full bg-danger/60" />
            <span className="size-3 rounded-full bg-warning/60" />
            <span className="size-3 rounded-full bg-success/60" />
            <span className="ml-3 flex-1 rounded-md bg-border/40 py-1 text-center text-xs text-muted">
              buleje.pe/admin/pos
            </span>
          </div>

          {/* Contenido del mockup POS */}
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-5">
            {/* Catalogo izquierda */}
            <div className="col-span-3 border-r border-border/40 p-4 sm:p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                Catalogo rápido
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "Gaseosa 1.5L", price: "S/4.50", color: "bg-primary/10 text-primary" },
                  { name: "Pan Frances", price: "S/0.20", color: "bg-secondary/10 text-secondary" },
                  { name: "Aceite 1L", price: "S/8.90", color: "bg-success/10 text-success" },
                  { name: "Arroz 1kg", price: "S/3.80", color: "bg-primary/10 text-primary" },
                  { name: "Azucar 1kg", price: "S/3.50", color: "bg-secondary/10 text-secondary" },
                  { name: "Leche 1L", price: "S/5.20", color: "bg-success/10 text-success" },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-surface px-2 py-3 text-center dark:bg-card/40"
                  >
                    <span className={`mb-1.5 rounded-lg px-2 py-0.5 text-xs font-bold ${item.color}`}>
                      {item.price}
                    </span>
                    <span className="text-xs text-muted leading-tight">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ticket derecha */}
            <div className="col-span-2 p-4 sm:p-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                Venta actual
              </p>
              <ul className="flex flex-col gap-1.5 text-xs">
                {[
                  { name: "Gaseosa 1.5L x2", total: "S/9.00" },
                  { name: "Pan Frances x6", total: "S/1.20" },
                  { name: "Aceite 1L", total: "S/8.90" },
                ].map((line) => (
                  <li
                    key={line.name}
                    className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5 dark:bg-card/40"
                  >
                    <span className="text-foreground/80">{line.name}</span>
                    <span className="font-semibold text-foreground">
                      {line.total}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2">
                <span className="text-xs font-bold text-primary">Total</span>
                <span className="text-base font-extrabold text-primary">
                  S/19.10
                </span>
              </div>
              <button
                type="button"
                className="mt-3 w-full rounded-xl bg-primary py-2 text-xs font-bold text-white"
                tabIndex={-1}
                aria-hidden="true"
              >
                Cobrar
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Features section ──────────────────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section className="py-20 sm:py-24" aria-label="Funcionalidades principales">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Todo lo que necesita tu bodega
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted">
            Disenado especificamente para el dia a dia de bodegas y minimarkets
            peruanos. Sin complicaciones.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP_SM}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="group rounded-2xl border border-border/60 bg-card p-6 transition-shadow hover:shadow-md dark:hover:shadow-black/20"
            >
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15">
                {feature.icon}
              </div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {feature.title}
                </h3>
                <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-semibold text-secondary">
                  {feature.badge}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Social Proof section ──────────────────────────────────────────────────────
function SocialProofSection() {
  return (
    <section
      className="border-y border-border/60 bg-surface py-16 dark:bg-card/30"
      aria-label="Prueba social y estadisticas"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Etiqueta */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={VP}
          transition={{ duration: 0.4 }}
          className="mb-10 text-center text-sm font-semibold uppercase tracking-widest text-muted"
        >
          Hecho para bodegas de Pucallpa — y de todo el Peru
        </motion.p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP_SM}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="text-center"
            >
              <p className="text-3xl font-extrabold text-primary sm:text-4xl">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-muted">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Placeholders de bodegas */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP_SM}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-4"
          aria-label="Bodegas que usan Buleje"
        >
          {[
            "Bodega El Progreso",
            "Minimarket La Union",
            "Bodega La Familia",
            "Tienda Don Carlos",
            "Bodega Las Americas",
          ].map((name) => (
            <div
              key={name}
              className="flex h-12 items-center justify-center rounded-xl border border-border/60 bg-card px-4 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary dark:bg-card/50"
            >
              {name}
            </div>
          ))}
        </motion.div>

        {/* Testimonios */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.blockquote
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP_SM}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-2xl border border-border/60 bg-card p-6"
            >
              <p className="text-sm leading-relaxed text-foreground/80">
                &ldquo;{t.quote}&rdquo;
              </p>
              <footer className="mt-4 flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.name}
                  </p>
                  <p className="text-xs text-muted">{t.role}</p>
                </div>
              </footer>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing section ───────────────────────────────────────────────────────────
function SimplePricingSection() {
  return (
    <section
      id="planes"
      className="scroll-mt-16 py-20 sm:py-24"
      aria-label="Planes y precios"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Planes para cada etapa de tu negocio
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted">
            Empieza gratis y crece segun necesites. Sin costos ocultos, sin
            permanencia.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {SIMPLE_PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP_SM}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlight
                  ? "border-primary bg-primary/5 shadow-xl shadow-primary/10 ring-2 ring-primary dark:bg-primary/10"
                  : "border-border/60 bg-card"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                    Mas popular
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground">
                  {plan.name}
                </h3>
                <p className="mt-0.5 text-sm text-muted">{plan.description}</p>
              </div>

              <div className="mb-6 flex items-end gap-1">
                <span className="text-4xl font-extrabold tabular-nums text-foreground">
                  {plan.price}
                </span>
                <span className="mb-1 text-sm text-muted">{plan.period}</span>
              </div>

              <Link
                href={plan.href}
                className={`mb-6 flex min-h-[44px] w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  plan.highlight
                    ? "bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary-dark"
                    : "border border-border text-foreground hover:bg-surface dark:hover:bg-card/80"
                }`}
              >
                {plan.cta}
              </Link>

              <hr className="mb-5 border-border/60" />

              <ul className="flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-foreground/80"
                  >
                    <svg
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Comparacion completa */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={VP}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-10 text-center"
        >
          <p className="text-sm text-muted">
            Quieres ver todos los detalles?{" "}
            <Link
              href="#tabla-completa"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Ver tabla comparativa completa
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Tabla completa de planes (componente existente) */}
      <div id="tabla-completa" className="mx-auto mt-16 max-w-7xl scroll-mt-16 px-4 sm:px-6 lg:px-8">
        <PricingTable />
      </div>
    </section>
  );
}

// ── FAQ accordion ─────────────────────────────────────────────────────────────
function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      className="border-t border-border/60 py-20 sm:py-24"
      aria-label="Preguntas frecuentes"
    >
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Preguntas frecuentes
          </h2>
          <p className="mt-4 text-base text-muted">
            Las dudas mas comunes de los bodegueros antes de empezar.
          </p>
        </motion.div>

        <dl className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VP_SM}
                transition={{ duration: 0.35, delay: i * 0.06 }}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  isOpen
                    ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                    : "border-border/60 bg-card"
                }`}
              >
                <dt>
                  <button
                    type="button"
                    className="flex min-h-[52px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span>{item.q}</span>
                    <svg
                      className={`size-4 shrink-0 text-muted transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                </dt>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.dd
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-sm leading-relaxed text-muted">
                        {item.a}
                      </p>
                    </motion.dd>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

// ── Footer CTA ────────────────────────────────────────────────────────────────
function FooterCtaSection() {
  return (
    <section
      className="py-20 sm:py-24"
      aria-label="Llamada a la accion final"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-3xl bg-linear-to-br from-primary to-primary-dark p-10 text-center shadow-xl shadow-primary/20 sm:p-14"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Listo para modernizar tu bodega?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-white/80">
            Unete a cientos de bodegas en Peru que ya venden mas, pierden menos
            y trabajan sin estres.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/registro"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-white px-10 text-base font-bold text-primary shadow-lg transition-all hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary sm:w-auto"
            >
              Empieza gratis ahora
            </Link>

            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-white/40 px-8 text-base font-semibold text-white transition-all hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-auto"
            >
              <svg
                className="size-5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              Escribenos por WhatsApp
            </a>
          </div>

          <p className="mt-5 text-sm text-white/60">
            Sin contrato. Sin tarjeta. Cancela cuando quieras.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ── Pagina principal ──────────────────────────────────────────────────────────
export default function MarketingPage() {
  return (
    <>
      <JsonLd />
      <HeroSection />
      <FeaturesSection />
      <SocialProofSection />
      <SimplePricingSection />
      <FaqAccordion />
      <FooterCtaSection />
    </>
  );
}
