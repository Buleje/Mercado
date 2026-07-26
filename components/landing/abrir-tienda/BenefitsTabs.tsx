"use client";

/**
 * BenefitsTabs — sección interactiva con tabs por categoría.
 * El usuario clickea Vender/Cobrar/Entregar/Fidelizar y ve la feature
 * destacada con preview lado a lado.
 */

import { useState, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Banknote,
  Bike,
  Heart,
  Check,
  Search,
  MapPin,
  Truck,
  Star,
  type LucideIcon,
} from "@buleje/design-system/icons";

type CategoryId = "vender" | "cobrar" | "entregar" | "fidelizar";

interface Category {
  id: CategoryId;
  label: string;
  icon: typeof ShoppingBag;
  headline: string;
  highlight: string;
  features: string[];
  metric: { value: string; label: string };
  bg: string;
  // Visual único por categoría: tipo de mockup en el card derecho.
  mockup: "search" | "payments" | "tracking" | "loyalty";
  mockupIcons: LucideIcon[];
}

const CATEGORIES: Category[] = [
  {
    id: "vender",
    label: "Vendé más",
    icon: ShoppingBag,
    headline: "Aparecé donde tus clientes están buscando",
    highlight: "buscando",
    features: [
      "Tu negocio en buscadores y mapa local",
      "Catálogo ilimitado con fotos, variantes y stock",
      "Promociones y cupones automáticos",
      "Notificaciones push a tus clientes",
    ],
    // Brandon mayo 2026: quitar métricas inventadas + paleta consistente
    // (no naranja/rosa). Ahora un beneficio real verificable.
    metric: { value: "24/7", label: "disponible para tus clientes" },
    bg: "from-[var(--accent)] via-teal-600 to-teal-800",
    mockup: "search",
    mockupIcons: [Search, MapPin],
  },
  {
    id: "cobrar",
    label: "Cobrá rápido",
    icon: Banknote,
    headline: "Yape, Plin, tarjeta o efectivo — todos en uno",
    highlight: "todos en uno",
    features: [
      "Cobros Yape y Plin con confirmación instantánea",
      "Stripe / tarjeta para suscripciones",
      "Fiado digital con recordatorios automáticos",
      "Facturación SUNAT integrada",
    ],
    metric: { value: "Yape · Plin · Tarjeta", label: "todos los métodos del país" },
    bg: "from-teal-500 via-teal-700 to-teal-900",
    mockup: "payments",
    mockupIcons: [Banknote],
  },
  {
    id: "entregar",
    label: "Entregá sin estrés",
    icon: Bike,
    headline: "Tus repartidores, los nuestros, o ambos",
    highlight: "los nuestros",
    features: [
      "Asignación automática de repartidores",
      "Tracking en vivo para ti y tu cliente",
      "Zonas de delivery con tarifas dinámicas",
      "Cobertura cross-vendor compartida",
    ],
    metric: { value: "GPS en vivo", label: "tú y tu cliente lo ven en el mapa" },
    bg: "from-[var(--accent)] via-teal-700 to-teal-900",
    mockup: "tracking",
    mockupIcons: [Truck, MapPin],
  },
  {
    id: "fidelizar",
    label: "Fidelizá clientes",
    icon: Heart,
    headline: "Que vuelvan, recomienden y compren más",
    highlight: "recomienden",
    features: [
      "Historial completo por cliente",
      "Programa Socio Buleje con cashback",
      "Cumpleaños y promociones personalizadas",
      "Reseñas y reputación pública",
    ],
    metric: { value: "CRM completo", label: "cada cliente, cada compra, en un lugar" },
    bg: "from-teal-500 via-teal-600 to-teal-800",
    mockup: "loyalty",
    mockupIcons: [Heart, Star],
  },
];

// Mockup visual único por categoría — reemplaza la lista de bullets duplicada
// que existía antes en el card derecho. Cada uno es una ilustración de UI que
// refuerza la promesa específica de la categoría.
function CategoryMockup({ category }: { category: Category }) {
  if (category.mockup === "search") {
    return (
      <div className="relative space-y-3">
        {/* Search bar mockup */}
        <div className="rounded-2xl bg-white/15 backdrop-blur border border-white/20 p-3.5 flex items-center gap-3">
          <Search className="h-4 w-4 text-white/80 shrink-0" strokeWidth={2.25} />
          <span className="text-sm font-medium text-white/90 truncate">
            &ldquo;bodega cerca de mí&rdquo;
          </span>
          <span className="ml-auto inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-white text-[var(--accent)] text-[length:var(--ts-2xs)] font-extrabold shrink-0">
            Buscar
          </span>
        </div>
        {/* Search results mockup — tu tienda highlighted */}
        {[
          { name: "Tu Bodega · Don Lucho", tag: "0.4 km", featured: true },
          { name: "Minimarket El Sol", tag: "0.8 km", featured: false },
          { name: "Bodega La Esquina", tag: "1.2 km", featured: false },
        ].map((s) => (
          <div
            key={s.name}
            className={`rounded-xl px-3.5 py-2.5 flex items-center gap-3 ${
              s.featured
                ? "bg-white text-[var(--text-primary)] shadow-lg ring-2 ring-white/40"
                : "bg-white/8 text-white/70 border border-white/12"
            }`}
          >
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                s.featured ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-white/10 text-white/60"
              }`}
            >
              <MapPin className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-extrabold truncate ${s.featured ? "" : "text-white/90"}`}>
                {s.name}
              </p>
              {s.featured && (
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
                  ◉ Tu negocio · Top resultado
                </p>
              )}
            </div>
            <span className={`text-[length:var(--ts-2xs)] font-extrabold tabular-nums ${s.featured ? "text-[var(--accent)]" : "text-white/50"}`}>
              {s.tag}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (category.mockup === "payments") {
    return (
      <div className="relative space-y-4">
        {/* Pago entrante */}
        <div className="rounded-2xl bg-white/12 backdrop-blur border border-white/20 px-4 py-3 flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#722EAB] font-extrabold text-base shadow-sm">
            Y
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">Yape · Lucía P.</p>
            <p className="text-[length:var(--ts-2xs)] font-bold text-white/60 uppercase tracking-wider">
              Confirmado · hace 2 seg
            </p>
          </div>
          <p className="text-xl font-extrabold tabular-nums text-white shrink-0">S/ 28.50</p>
        </div>
        {/* Grid de métodos */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { mark: "Y", name: "Yape", color: "#722EAB" },
            { mark: "P", name: "Plin", color: "#00BFB3" },
            { mark: "$", name: "Efectivo", color: "var(--accent)" },
            { mark: "▭", name: "Tarjeta", color: "var(--accent-600)" },
          ].map((p) => (
            <div key={p.name} className="rounded-xl bg-white/8 border border-white/15 px-3 py-2.5 flex items-center gap-2.5">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white font-extrabold text-sm"
                style={{ background: p.color }}
              >
                {p.mark}
              </span>
              <span className="text-sm font-extrabold text-white">{p.name}</span>
              <Check className="h-3.5 w-3.5 ml-auto text-white/70" strokeWidth={3} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (category.mockup === "tracking") {
    return (
      <div className="relative space-y-3">
        {/* Mapa abstracto con ruta */}
        <div className="relative h-44 rounded-2xl bg-white/10 backdrop-blur border border-white/20 overflow-hidden p-4">
          {/* Grid de calles */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          {/* Ruta */}
          <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="absolute inset-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)]">
            <path
              d="M 10 85 Q 50 85 70 50 T 130 30 T 190 15"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="6 4"
              opacity="0.85"
            />
          </svg>
          {/* Pin de origen */}
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-lg">
              <span aria-hidden className="h-3 w-3 rounded-full bg-[var(--accent)]" />
            </span>
          </span>
          {/* Pin de destino con tu Bodega */}
          <span className="absolute top-3 right-3 inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white text-[var(--text-primary)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shadow-md">
              <MapPin className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.5} />
              Cliente
            </span>
          </span>
          {/* Moto en ruta */}
          <span className="absolute top-[42%] left-[44%] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-xl ring-4 ring-white/40">
            <Bike className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} />
          </span>
        </div>
        {/* Card status */}
        <div className="rounded-xl bg-white/12 backdrop-blur border border-white/20 px-4 py-3 flex items-center gap-3">
          <span aria-hidden className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          <p className="text-sm font-bold text-white flex-1">Repartidor en camino</p>
          <p className="text-sm font-extrabold tabular-nums text-white">8 min</p>
        </div>
      </div>
    );
  }

  // loyalty
  return (
    <div className="relative space-y-3">
      {/* Customer card */}
      <div className="rounded-2xl bg-white text-[var(--text-primary)] p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white font-extrabold text-base">
            M
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
              Marta Q. · Cliente fiel
            </p>
            <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
              23 compras · S/ 487 total
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0">
            <Star className="h-3 w-3 fill-current" strokeWidth={0} />
            VIP
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--rule-soft)] flex items-baseline justify-between gap-3">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Cashback acumulado
          </p>
          <p className="text-2xl font-extrabold tabular-nums tracking-tight text-[var(--accent)]">
            S/ 24.30
          </p>
        </div>
      </div>
      {/* Reseña */}
      <div className="rounded-xl bg-white/10 backdrop-blur border border-white/15 px-4 py-3">
        <div className="flex items-center gap-1 mb-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className="h-3.5 w-3.5 text-white fill-white" strokeWidth={0} />
          ))}
          <span className="ml-auto text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/60">
            Hace 2 días
          </span>
        </div>
        <p className="text-sm font-medium text-white/90 leading-snug">
          &ldquo;Pedido perfecto, llegó en 12 minutos. Siempre les pido a ellos.&rdquo;
        </p>
      </div>
    </div>
  );
}

const TAB_BADGES: Record<CategoryId, string> = {
  vender: "Te encontró un cliente",
  cobrar: "Pago recibido · S/ 28.50",
  entregar: "Repartidor asignado",
  fidelizar: "Reseña 5★ nueva",
};

export default function BenefitsTabs() {
  const [active, setActive] = useState<CategoryId>("vender");
  const [paused, setPaused] = useState(false);
  const cat = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];
  const Icon = cat.icon;
  const headlineParts = cat.headline.split(cat.highlight);

  // Auto-rotación de tabs (showcase): avanza cada 4.5s, se pausa al pasar el
  // mouse. El timeout depende de `active` → un click reinicia el ciclo en vez
  // de saltar enseguida.
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => {
      const idx = CATEGORIES.findIndex((c) => c.id === active);
      setActive(CATEGORIES[(idx + 1) % CATEGORIES.length].id);
    }, 4500);
    return () => clearTimeout(id);
  }, [active, paused]);

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Qué obtienes
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Todo lo que necesitás
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                en una sola plataforma.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Hacé click en cada categoría — vas a ver exactamente qué
            herramientas vienen incluidas.
          </p>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map((c) => {
            const isActive = c.id === active;
            const TabIcon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(c.id)}
                className={`group relative inline-flex items-center gap-2 overflow-hidden px-5 py-3 rounded-full text-sm font-extrabold transition-all ${
                  isActive
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-md"
                    : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--rule-soft)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                }`}
              >
                <TabIcon className="h-4 w-4" strokeWidth={2.25} />
                {c.label}
                {/* Barra de progreso del auto-rotado en el tab activo */}
                {isActive && !paused && (
                  <m.span
                    key={`${c.id}-progress`}
                    aria-hidden
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 4.5, ease: "linear" }}
                    className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-[var(--accent)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Preview animado */}
        <AnimatePresence mode="wait">
          <m.div
            key={cat.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8"
          >
            {/* Notificación flotante (desktop) — "señal de vida" por categoría */}
            <m.div
              key={`${cat.id}-badge`}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 20, delay: 0.1 }}
              className="absolute left-[51%] -top-3 z-20 hidden items-center gap-2 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3.5 py-2 text-xs font-extrabold text-[var(--text-primary)] shadow-[var(--shadow-lg)] lg:inline-flex"
            >
              <span aria-hidden className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-70 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              {TAB_BADGES[cat.id]}
            </m.div>

            {/* Lado izquierdo: descripción + features */}
            <div className="rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-8 sm:p-10">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br ${cat.bg} text-white shadow-md mb-6`}>
                <Icon className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <h3 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-extrabold tracking-[-0.03em] text-[var(--text-primary)] leading-[1.05]">
                {headlineParts[0]}
                <span className="italic font-serif text-[var(--accent)]">
                  {cat.highlight}
                </span>
                {headlineParts[1]}
              </h3>
              <ul className="mt-6 space-y-3">
                {cat.features.map((f, i) => (
                  <m.li
                    key={f}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i + 0.15, duration: 0.3 }}
                    className="flex items-start gap-3 text-base text-[var(--text-secondary)]"
                  >
                    <span className="inline-flex h-5 w-5 mt-0.5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {f}
                  </m.li>
                ))}
              </ul>
            </div>

            {/* Lado derecho: mockup ÚNICO por categoría — ya no duplica los
                bullets del lado izquierdo. Cada tab muestra una mini-UI distinta:
                búsqueda, métodos de pago, mapa con tracking, o customer/reviews. */}
            <div className={`relative rounded-3xl bg-linear-to-br ${cat.bg} p-7 sm:p-9 text-white overflow-hidden flex flex-col gap-6 min-h-[420px]`}>
              <div aria-hidden className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/15 blur-3xl pointer-events-none" />
              <div aria-hidden className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />

              {/* Header: métrica grande + tag pequeño */}
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] opacity-80">
                    {cat.metric.label}
                  </p>
                  <p className="mt-1 text-[clamp(2rem,5vw,3rem)] font-extrabold tabular-nums tracking-[-0.035em] leading-[0.95]">
                    {cat.metric.value}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0">
                  <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  Live
                </span>
              </div>

              {/* Mockup específico por categoría */}
              <div className="relative">
                <CategoryMockup category={cat} />
              </div>
            </div>
          </m.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
