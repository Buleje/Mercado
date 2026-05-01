"use client";

import { useEffect, useState, startTransition, useMemo } from "react";
import Link from "next/link";
import { ShoppingCart, MessageCircle, ArrowRight, Star, Clock, MapPin } from "@buleje/design-system/icons";
import { trackCTAClick, trackWhatsAppClick } from "@/lib/analytics";
import { useSettings } from "@/contexts/settings-context";
import { useStoreProducts } from "@/hooks/use-store-products";

function computeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Buenos días";
  if (h >= 12 && h < 18) return "Buenas tardes";
  return "Buenas noches";
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Mapa de emojis para categorías conocidas. */
const CATEGORY_EMOJI: Record<string, string> = {
  carnes: "🥩", verduras: "🥦", frutas: "🍎", lacteos: "🥛", lácteos: "🥛",
  panaderia: "🍞", panadería: "🍞", bebidas: "🧃", limpieza: "🧹",
  snacks: "🍿", huevos: "🥚", abarrotes: "🛒", embutidos: "🌭",
  congelados: "🧊", higiene: "🧴", mascotas: "🐾",
};

function getCategoryEmoji(label: string) {
  const key = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return CATEGORY_EMOJI[key] ?? "📦";
}

export default function Hero() {
  const { homepage: hp, deliveryConfig, storeTheme } = useSettings();
  const { categories } = useStoreProducts();
  const [greeting, setGreeting] = useState("");
  const [mounted, setMounted] = useState(false);
  const [storeStatus, setStoreStatus] = useState<{ open: boolean; label: string }>({ open: false, label: "" });

  useEffect(() => {
    setMounted(true);
    startTransition(() => setGreeting(computeGreeting()));
  }, []);

  useEffect(() => {
    const now = new Date();
    const dayName = DAY_NAMES[now.getDay()];
    const todayConfig = deliveryConfig.hours.find(h => h.day === dayName);
    if (!todayConfig || !todayConfig.enabled) { setStoreStatus({ open: false, label: "Cerrado hoy" }); return; }
    const [oH, oM] = todayConfig.open.split(":").map(Number);
    const [cH, cM] = todayConfig.close.split(":").map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < oH * 60 + oM || nowMin >= cH * 60 + cM) { setStoreStatus({ open: false, label: "Cerrado" }); return; }
    const remaining = cH * 60 + cM - nowMin;
    if (remaining <= 30) setStoreStatus({ open: true, label: `Cierra en ${remaining}min` });
    else setStoreStatus({ open: true, label: "Abierto ahora" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryConfig.hours]);

  const displayCategories = useMemo(
    () => categories.filter((c) => c.id !== "todos").slice(0, 8),
    [categories]
  );

  return (
    <section id="inicio" aria-label="Inicio — Buleje" className="relative min-h-svh flex items-center overflow-hidden bg-[#060e08]">

      {/* ── Background: single clean gradient ── */}
      <div className="absolute inset-0" aria-hidden="true">
        {/* Primary teal glow — top right */}
        <div className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full opacity-20"
          style={{ background: "radial-gradient(ellipse, var(--color-primary) 0%, transparent 70%)", filter: "blur(100px)" }} />
        {/* Secondary warm glow — bottom left */}
        <div className="absolute -bottom-[15%] -left-[5%] w-[40vw] h-[40vw] rounded-full opacity-10"
          style={{ background: "radial-gradient(ellipse, var(--color-secondary) 0%, transparent 70%)", filter: "blur(100px)" }} />
      </div>

      {/* ── Subtle grid texture ── */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 0.5px, transparent 0.5px)", backgroundSize: "40px 40px" }} />

      {/* ── Content ── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-32 md:py-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">

          {/* ── LEFT: 7 columns ── */}
          <div className="lg:col-span-7 flex flex-col text-center lg:text-left">

            {/* Store status + location */}
            <div className="flex items-center gap-3 justify-center lg:justify-start mb-8 animate-[fadeIn_0.5s_ease-out]">
              {/* Status pill */}
              <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
                style={{
                  background: mounted && storeStatus.open ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${mounted && storeStatus.open ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                }}>
                <span className="relative flex h-2 w-2">
                  {mounted && storeStatus.open && (
                    <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
                  )}
                  <span className={`relative block h-2 w-2 rounded-full ${mounted && storeStatus.open ? "bg-green-400" : "bg-red-400"}`} />
                </span>
                <span className={`text-xs font-semibold ${mounted && storeStatus.open ? "text-green-300" : "text-red-300"}`}>
                  {mounted ? storeStatus.label : ""}
                </span>
              </div>
              {/* Location */}
              <div className="inline-flex items-center gap-1.5 text-white/30 text-xs">
                <MapPin className="w-3 h-3" />
                <span>Ucayali, Perú</span>
              </div>
            </div>

            {/* Greeting */}
            {hp.heroGreetingEnabled && greeting && (
              <p className="text-white/40 text-sm font-medium mb-3 animate-[fadeIn_0.5s_ease-out_0.1s_both]">
                {greeting}
              </p>
            )}

            {/* Heading */}
            <h1 className="animate-[fadeIn_0.6s_ease-out_0.15s_both]"
              style={{
                fontSize: "clamp(2.5rem, 5vw, 4.2rem)",
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
                color: "#f0f4f1",
              }}>
              {storeTheme?.heroTitle || hp.heroTitle}{" "}
              <span className="bg-linear-to-r from-teal-400 via-primary to-secondary bg-clip-text text-transparent">
                {hp.heroTitleAccent}
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-5 mb-8 text-white/45 leading-relaxed max-w-lg mx-auto lg:mx-0 animate-[fadeIn_0.6s_ease-out_0.25s_both]"
              style={{ fontSize: "clamp(0.95rem, 1.5vw, 1.1rem)" }}>
              {storeTheme?.heroSubtitle || hp.heroSubtitle}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start mb-10 animate-[fadeIn_0.6s_ease-out_0.35s_both]">
              <Link
                href={storeTheme?.heroLink ? `/${storeTheme.heroLink}` : hp.heroCta1Link}
                onClick={() => trackCTAClick({ source: "hero", destination: storeTheme?.heroLink ? `/${storeTheme.heroLink}` : hp.heroCta1Link, ctaText: storeTheme?.heroCTA || hp.heroCta1Text })}
                className="group inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-4px_rgba(15,118,110,0.5)]"
              >
                <ShoppingCart className="w-[18px] h-[18px]" />
                {storeTheme?.heroCTA || hp.heroCta1Text}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href={hp.heroCta2Link}
                onClick={() => trackWhatsAppClick("hero")}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-semibold text-white/80 bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:border-white/20 backdrop-blur-sm transition-all duration-200"
              >
                <MessageCircle className="w-[18px] h-[18px]" />
                {hp.heroCta2Text}
              </a>
            </div>

            {/* Social proof — single clean row */}
            <div className="flex items-center gap-5 justify-center lg:justify-start text-xs animate-[fadeIn_0.6s_ease-out_0.45s_both]">
              <div className="flex items-center gap-1.5 text-white/50">
                <Star className="w-3.5 h-3.5 text-secondary fill-secondary" />
                <span className="text-white/80 font-bold">4.8</span>
                <span>valoración</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="flex items-center gap-1.5 text-white/50">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-white/80 font-bold">~30min</span>
                <span>delivery</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div className="text-white/50">
                <span className="text-white/80 font-bold">+800</span> clientes
              </div>
            </div>
          </div>

          {/* ── RIGHT: 5 columns — Categories ── */}
          <div className="lg:col-span-5 hidden lg:block animate-[fadeIn_0.7s_ease-out_0.4s_both]">
            <div className="relative">
              {/* Subtle glow behind */}
              <div className="absolute inset-0 -m-8 rounded-3xl opacity-30"
                style={{ background: "radial-gradient(ellipse, var(--color-primary) 0%, transparent 70%)", filter: "blur(60px)" }}
                aria-hidden="true" />

              {/* Category grid */}
              {displayCategories.length > 0 && (
                <nav aria-label="Categorías de productos" className="relative grid grid-cols-4 gap-2.5">
                  {displayCategories.map(({ id, label }, i) => (
                    <Link key={id} href={`/tienda?category=${id}`}
                      aria-label={`Ver categoría ${label}`}
                      className="group flex flex-col items-center gap-2 rounded-2xl p-4 bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.07] hover:border-white/[0.14] hover:-translate-y-0.5 transition-all duration-200"
                      style={{ animationDelay: `${0.45 + i * 0.04}s` }}
                    >
                      <span className="text-2xl leading-none group-hover:scale-110 transition-transform duration-200">
                        {getCategoryEmoji(label)}
                      </span>
                      <span className="text-[length:var(--ts-2xs)] font-semibold text-white/50 uppercase tracking-wider text-center leading-tight group-hover:text-white/70 transition-colors">
                        {label}
                      </span>
                    </Link>
                  ))}
                </nav>
              )}
            </div>
          </div>

          {/* ── MOBILE: Category row ── */}
          {displayCategories.length > 0 && (
            <div className="lg:hidden animate-[fadeIn_0.6s_ease-out_0.5s_both] -mt-4">
              <nav aria-label="Categorías de productos" className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-2 px-2" style={{ scrollSnapType: "x mandatory" }}>
                {displayCategories.map(({ id, label }) => (
                  <Link key={id} href={`/tienda?category=${id}`}
                    aria-label={`Ver categoría ${label}`}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <span className="text-base leading-none">{getCategoryEmoji(label)}</span>
                    <span className="text-[length:var(--ts-2xs)] font-semibold text-white/50 whitespace-nowrap">{label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom fade transition ── */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background to-transparent" aria-hidden="true" />
    </section>
  );
}
