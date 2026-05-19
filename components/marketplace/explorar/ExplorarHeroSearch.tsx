"use client";

/**
 * ExplorarHeroSearch — Hero unificado del marketplace.
 *
 * Combina en una sola sección: identidad (kicker + title + sub),
 * búsqueda XL funcional, chips populares, 4 stats minimal y
 * atajos a destinos. Sin saturación — accent solo donde cuenta.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Mic,
  Compass,
  Store,
  Percent,
  Lightbulb,
  Bot,
  ChevronRight,
  Sparkles,
  ArrowDown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const POPULAR_CHIPS: Array<{ label: string; q: string }> = [
  { label: "Arroz", q: "arroz" },
  { label: "Pollo entero", q: "pollo" },
  { label: "Aceite Primor", q: "aceite primor" },
  { label: "Leche Gloria", q: "leche gloria" },
  { label: "Detergente", q: "detergente" },
  { label: "Coca Cola", q: "coca cola" },
  { label: "Pan del día", q: "pan" },
  { label: "Cerveza", q: "cerveza" },
];

const STATS = [
  { value: "200+", label: "Bodegas" },
  { value: "5.4k", label: "Vecinos" },
  { value: "25min", label: "Entrega" },
  { value: "24/7", label: "Soporte" },
];

const QUICK_DESTINATIONS = [
  { href: "/marketplace", icon: Store, label: "Bodegas" },
  { href: "/marketplace/ofertas", icon: Percent, label: "Ofertas" },
  { href: "/recetas", icon: Lightbulb, label: "Recetas" },
  { href: "/asistente", icon: Bot, label: "IA" },
];

export default function ExplorarHeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/marketplace?vista=catalogo&q=${encodeURIComponent(term)}`);
  };

  return (
    <section
      aria-label="Hero de búsqueda"
      className="relative w-full overflow-hidden border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
    >
      {/* Decorative dots pattern — textura sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Soft accent glow — un solo color diluido */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        {/* ── Eyebrow ───────────────────────────────────────── */}
        <p className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)] mb-6 shadow-sm">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          <Compass className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2} />
          Hub de descubrimiento
        </p>

        {/* ── Title + sub ───────────────────────────────────── */}
        <h1 className="font-display font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.9] text-[clamp(3rem,9vw,6.5rem)] max-w-4xl">
          Todo Pucallpa,{" "}
          <span className="text-[var(--accent)]">en un toque.</span>
        </h1>

        <p className="mt-5 sm:mt-7 text-lg sm:text-xl lg:text-2xl text-[var(--text-secondary)] leading-snug max-w-2xl font-semibold">
          El menú visual de tu marketplace. Acá no comprás —{" "}
          <strong className="text-[var(--text-primary)] font-extrabold">descubrís</strong> qué
          tiene Buleje y elegís dónde entrar a comprar.
        </p>

        {/* ── Search XL ─────────────────────────────────────── */}
        <form
          onSubmit={submit}
          className={cn(
            "mt-8 sm:mt-10 flex items-stretch gap-2 rounded-2xl border-2 transition-all duration-[var(--dur-fast)] max-w-3xl",
            "bg-[var(--surface-raised)]",
            focused
              ? "border-[var(--accent)] shadow-[0_0_0_4px_rgba(0,180,166,0.10)]"
              : "border-[var(--rule-base)] hover:border-[var(--rule-mid,var(--rule-base))]",
          )}
        >
          <span className="pl-5 flex items-center text-[var(--text-tertiary)]">
            <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Buscá productos, marcas, bodegas…"
            aria-label="Buscar en el marketplace"
            className="flex-1 bg-transparent border-0 outline-none px-3 py-4 sm:py-5 text-base sm:text-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] min-w-0"
          />
          <button
            type="button"
            aria-label="Buscar por voz"
            className="hidden sm:inline-flex items-center justify-center w-12 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
          >
            <Mic className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="submit"
            className="rounded-xl m-1.5 px-6 sm:px-8 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-base sm:text-lg font-extrabold uppercase tracking-wider hover:bg-[var(--accent)] transition-colors"
          >
            Buscar
          </button>
        </form>

        {/* ── Keyboard hint + Popular chips ─────────────────── */}
        <div className="mt-4 max-w-3xl">
          <p className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            Tip: presioná{" "}
            <kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
              /
            </kbd>{" "}
            para buscar desde cualquier parte
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mr-1">
              Popular:
            </span>
            {POPULAR_CHIPS.map((chip) => (
              <button
                key={chip.q}
                type="button"
                onClick={() =>
                  router.push(`/marketplace?vista=catalogo&q=${encodeURIComponent(chip.q)}`)
                }
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats + Quick destinations — split row ────────── */}
        <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-10 items-center">
          {/* 4 stats inline minimal */}
          <div className="grid grid-cols-4 gap-3 sm:gap-6">
            {STATS.map((s) => (
              <div key={s.label} className="text-center sm:text-left group cursor-default">
                <p className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)] leading-none transition-colors group-hover:text-[var(--accent)]">
                  {s.value}
                </p>
                <p className="mt-1.5 text-[length:var(--ts-2xs)] sm:text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Quick destinations */}
          <div className="flex flex-wrap gap-1.5 lg:justify-end">
            <span className="inline-flex items-center text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mr-1">
              Ir directo:
            </span>
            {QUICK_DESTINATIONS.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.href}
                  href={q.href}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Icon
                    className="h-3.5 w-3.5 text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--accent)]"
                    strokeWidth={2}
                    aria-hidden
                  />
                  {q.label}
                  <ChevronRight
                    className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Scroll cue ────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16 flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <Sparkles className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
            8 destinos · una pantalla
          </div>
          <ArrowDown
            className="h-4 w-4 text-[var(--text-tertiary)] animate-bounce"
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </div>

      {/* Bottom fade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-b from-transparent to-[var(--surface-canvas)]"
      />
    </section>
  );
}
