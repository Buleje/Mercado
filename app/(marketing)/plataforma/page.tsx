"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import PricingTable from "@/components/marketing/PricingTable";

// ── Viewport compartido para whileInView ──────────────────────────────────────
const VIEWPORT = { once: true, margin: "-80px" } as const;
const VIEWPORT_SM = { once: true, margin: "-60px" } as const;

// ── Datos de features ────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    title: "Punto de venta (POS)",
    description:
      "Cobra en segundos con teclado, lector de codigos o tactil. Vuelto automatico, Yape, efectivo y tarjeta.",
  },
  {
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
      </svg>
    ),
    title: "Inventario FEFO",
    description:
      "Control de stock con vencimientos. Alertas automaticas cuando el stock baja. Nunca mas productos vencidos.",
  },
  {
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Delivery integrado",
    description:
      "Gestiona repartidores, rutas y estados de pedido en tiempo real. Tus clientes rastrean su pedido en vivo.",
  },
  {
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Reportes y analytics",
    description:
      "Ventas por hora, producto mas vendido, margen por categoria. Decide con datos, no con suposiciones.",
  },
  {
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: "WhatsApp integrado",
    description:
      "Pedidos, confirmaciones y seguimiento por WhatsApp. Notificaciones automaticas sin esfuerzo adicional.",
  },
  {
    icon: (
      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    title: "Multi-sucursal",
    description:
      "Administra varias tiendas desde un solo panel. Stock, ventas y personal de cada local en tiempo real.",
  },
];

// ── Estadísticas de social proof ──────────────────────────────────────────────
const STATS = [
  { value: "120+", label: "bodegas en Pucallpa" },
  { value: "S/2M+", label: "en ventas procesadas" },
  { value: "99.9%", label: "de disponibilidad" },
  { value: "2 min", label: "para empezar" },
];

const TESTIMONIALS = [
  {
    quote:
      "Antes perdia horas contando el stock a mano. Ahora en 5 minutos tengo todo el reporte del dia.",
    name: "Maria Quispe",
    role: "Bodega El Progreso, Pucallpa",
    initials: "MQ",
  },
  {
    quote:
      "El sistema de delivery me ayuda a organizar a mis dos repartidores sin llamarlos cada 10 minutos.",
    name: "Carlos Rengifo",
    role: "Minimarket San Martin, Pucallpa",
    initials: "CR",
  },
  {
    quote:
      "Empece con el plan gratis y en 2 semanas ya estaba vendiendo por WhatsApp con la tienda en linea.",
    name: "Rosa Panduro",
    role: "Bodega La Familia, Ucayali",
    initials: "RP",
  },
];

// ── Sección Hero ──────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 py-20 sm:py-28 lg:py-36 dark:to-primary/10">
      {/* Decoración de fondo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
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
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          Sistema ERP para bodegas y minimarkets
        </motion.div>

        {/* Titular */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Tu bodega,{" "}
          <span className="text-primary">en linea.</span>
        </motion.h1>

        {/* Subtítulo */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted leading-relaxed sm:text-xl"
        >
          Sistema completo de gestion para bodegas y minimarkets en Peru.
          POS, inventario, delivery, WhatsApp y mas. Todo desde un solo lugar.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <Link
            href="/plataforma/registro"
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary px-8 text-base font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
          >
            Empieza gratis
          </Link>
          <Link
            href="/#planes"
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-border bg-card px-8 text-base font-semibold text-foreground transition-all hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-card/80 sm:w-auto"
          >
            Ver planes y precios
          </Link>
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
      </div>
    </section>
  );
}

// ── Sección Features ──────────────────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Encabezado */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Todo lo que necesita tu bodega
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted">
            Herramientas disenadas para el dia a dia de bodegas y minimarkets peruanos, sin complicaciones.
          </p>
        </motion.div>

        {/* Grid de cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_SM}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="group rounded-2xl border border-border/60 bg-card p-6 transition-shadow hover:shadow-md dark:hover:shadow-black/20"
            >
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/15">
                {feature.icon}
              </div>
              <h3 className="mb-2 text-base font-bold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Sección Social Proof ──────────────────────────────────────────────────────
function SocialProofSection() {
  return (
    <section className="border-y border-border/60 bg-surface py-16 dark:bg-card/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Estadísticas */}
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_SM}
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

        {/* Testimonios */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.blockquote
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_SM}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="rounded-2xl border border-border/60 bg-card p-6"
            >
              <p className="text-sm text-foreground/80 leading-relaxed">
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

// ── Sección Pricing ───────────────────────────────────────────────────────────
function PricingSection() {
  return (
    <section id="planes" className="py-20 sm:py-24 scroll-mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Planes para cada etapa de tu negocio
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted">
            Empieza gratis y crece segun necesites. Sin costos ocultos.
          </p>
        </motion.div>

        <PricingTable />
      </div>
    </section>
  );
}

// ── Sección CTA Final ─────────────────────────────────────────────────────────
function FinalCTASection() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-dark p-10 text-center shadow-xl shadow-primary/20 sm:p-14"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Registra tu bodega en 2 minutos
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-white/80">
            Sin contratos. Sin tarjeta de credito. Cancela cuando quieras.
            Empieza hoy con el plan gratuito.
          </p>
          <Link
            href="/plataforma/registro"
            className="mt-8 inline-flex min-h-[52px] items-center justify-center rounded-xl bg-white px-10 text-base font-bold text-primary shadow-lg transition-all hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
          >
            Crear cuenta gratis
          </Link>
          <p className="mt-4 text-sm text-white/60">
            Ya son mas de 120 bodegas en Pucallpa
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MarketingPage() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <SocialProofSection />
      <PricingSection />
      <FinalCTASection />
    </>
  );
}
