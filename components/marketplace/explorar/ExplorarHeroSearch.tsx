"use client";

/**
 * ExplorarHeroSearch — hero superior de /explorar con search XL + chips.
 *
 * Patron Amazon/MercadoLibre adaptado a identidad Buleje:
 *   - Kicker editorial uppercase + accent dot
 *   - H1 black + tracking-tight con highlight (underline accent)
 *   - Search box gigante con icon + voz (mock)
 *   - Chips de busquedas populares horizontales
 *   - Trust strip: 3 mini stats (envios, bodegas, satisfaccion)
 *
 * Sin colores hardcoded — solo tokens. Sin emojis.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Mic, Sparkles, Truck, Store, Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const POPULAR_CHIPS: Array<{ label: string; q: string }> = [
  { label: "Arroz", q: "arroz" },
  { label: "Pollo entero", q: "pollo" },
  { label: "Aceite Primor", q: "aceite primor" },
  { label: "Leche Gloria", q: "leche gloria" },
  { label: "Detergente", q: "detergente" },
  { label: "Coca Cola", q: "coca cola" },
  { label: "Pan del dia", q: "pan" },
  { label: "Cerveza", q: "cerveza" },
];

const TRUST_STATS: Array<{ Icon: typeof Truck; value: string; label: string }> = [
  { Icon: Truck, value: "25 min", label: "Entrega promedio" },
  { Icon: Store, value: "120+", label: "Bodegas verificadas" },
  { Icon: Star, value: "4.8/5", label: "Calificacion clientes" },
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
      aria-label="Hero de busqueda"
      className="relative w-full overflow-hidden border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
    >
      {/* Decorative blobs accent (subtle) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-20">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-4">
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            Hub de descubrimiento
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[0.95]">
            Encontrá lo que necesitás,{" "}
            <span className="relative inline-block">
              <span className="relative z-10">en un toque.</span>
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-1 sm:bottom-2 h-3 sm:h-4 bg-[var(--accent)]/20 -z-0"
              />
            </span>
          </h1>

          <p className="mt-4 sm:mt-6 text-base sm:text-lg lg:text-xl text-[var(--text-secondary)] leading-relaxed max-w-2xl">
            Miles de productos de las bodegas mas cercanas a tu casa. Pucallpa entera, en tu celular.
          </p>

          {/* Search XL */}
          <form
            onSubmit={submit}
            className={cn(
              "mt-8 flex items-stretch gap-2 rounded-2xl border-2 transition-all duration-200",
              "bg-[var(--surface-raised)]",
              focused
                ? "border-[var(--accent)] shadow-[0_0_0_4px_rgba(var(--accent-rgb,16_185_129)/0.12)]"
                : "border-[var(--rule-base)] hover:border-[var(--rule-mid)]",
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
              placeholder="Busca productos, marcas, bodegas..."
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
              className="rounded-xl m-1.5 px-5 sm:px-7 bg-[var(--text-primary)] text-[var(--surface-canvas)] text-sm sm:text-base font-bold hover:bg-[var(--accent)] hover:text-[var(--surface-canvas)] transition-colors"
            >
              Buscar
            </button>
          </form>

          {/* Keyboard hint */}
          <p className="mt-3 text-sm text-[var(--text-tertiary)] hidden sm:flex items-center gap-1.5">
            Tip: presioná{" "}
            <kbd className="inline-flex items-center justify-center h-6 px-2 rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] font-mono text-xs font-bold text-[var(--text-secondary)]">
              /
            </kbd>{" "}
            para buscar desde cualquier parte
          </p>

          {/* Popular chips — tamaño legible */}
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mr-1">
              Populares
            </span>
            {POPULAR_CHIPS.map((chip) => (
              <button
                key={chip.q}
                type="button"
                onClick={() =>
                  router.push(`/marketplace?vista=catalogo&q=${encodeURIComponent(chip.q)}`)
                }
                className="inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-semibold border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors shadow-sm"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trust strip — más prominente */}
        <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 max-w-3xl">
          {TRUST_STATS.map(({ Icon, value, label }) => (
            <div
              key={label}
              className="flex items-center gap-3.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]/80 backdrop-blur-sm px-4 py-3.5 transition-all duration-300 hover:border-[var(--accent)]/40 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-black tabular-nums tracking-[-0.01em] text-[var(--text-primary)] leading-tight">
                  {value}
                </p>
                <p className="text-xs font-semibold text-[var(--text-tertiary)] leading-tight">
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
