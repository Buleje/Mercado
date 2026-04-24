"use client";

import { useState } from "react";
import {
  VisuallyHidden,
  SkipToContent,
  LiveRegion,
  useAnnounce,
  FocusTrap,
} from "@/components/ui-system/a11y";
import { useDebouncedValue, useIdleMount } from "@/hooks/perf";
import { Search, Trash2, Heart, Sparkles } from "lucide-react";

/**
 * /design-system/a11y — demo viva de primitives Ola 6.
 */
export default function A11yPerfDemoPage() {
  const announce = useAnnounce();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [cartCount, setCartCount] = useState(0);
  const [trapOpen, setTrapOpen] = useState(false);
  const idleReady = useIdleMount(1500);

  return (
    <>
      <SkipToContent />

      <main
        id="main-content"
        className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]"
      >
        {/* Hero */}
        <section
          className="py-16 sm:py-20 border-b border-[var(--rule-base)]"
          style={{ background: "var(--brand-ink)" }}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/55 mb-4">
              Ola 6 · Performance + A11y
            </p>
            <h1 className="text-fs-display text-white leading-[1.02]">
              Accesible <span className="text-white/45">y rápido</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl">
              Primitives WCAG 2.2 AA + hooks para Core Web Vitals. Prueba Tab
              desde aquí para ver focus ring editorial + skip-to-content.
            </p>
          </div>
        </section>

        {/* Section 1 — Visually hidden */}
        <section className="py-12 border-b border-[var(--rule-base)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
              01 · VisuallyHidden
            </p>
            <h2 className="text-fs-h2 mb-3">Labels invisibles para screen readers</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
              Botones con iconos solos necesitan label accesible. VisuallyHidden oculta
              el texto pero los lectores de pantalla lo leen.
            </p>
            <div className="flex gap-2">
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--rule-base)] hover:border-[var(--rule-strong)] transition-colors">
                <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                <VisuallyHidden>Eliminar producto</VisuallyHidden>
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--rule-base)] hover:border-[var(--rule-strong)] transition-colors">
                <Heart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                <VisuallyHidden>Agregar a favoritos</VisuallyHidden>
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--rule-base)] hover:border-[var(--rule-strong)] transition-colors">
                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                <VisuallyHidden>Sugerir con IA</VisuallyHidden>
              </button>
            </div>
          </div>
        </section>

        {/* Section 2 — LiveRegion announce */}
        <section className="py-12 border-b border-[var(--rule-base)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
              02 · LiveRegion + useAnnounce
            </p>
            <h2 className="text-fs-h2 mb-3">Anuncios dinámicos para SR</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
              Cambios dinámicos (carrito, notificaciones) se anuncian sin mover el
              foco. Activa VoiceOver/NVDA y tocá agregar.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setCartCount((c) => c + 1);
                  announce(`Producto agregado. ${cartCount + 1} en tu carrito.`);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold hover:opacity-90"
              >
                Agregar al carrito
              </button>
              <span className="text-sm text-[var(--text-secondary)]">
                Carrito: <span className="font-bold tabular-nums">{cartCount}</span>
              </span>
            </div>
            {/* LiveRegion visible para debug */}
            <LiveRegion politeness="polite" className="mt-4 text-xs text-[var(--text-tertiary)] italic">
              Carrito actualizado: {cartCount} {cartCount === 1 ? "producto" : "productos"}
            </LiveRegion>
          </div>
        </section>

        {/* Section 3 — Debounced search */}
        <section className="py-12 border-b border-[var(--rule-base)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
              03 · useDebouncedValue (perf)
            </p>
            <h2 className="text-fs-h2 mb-3">Debounce search 300ms → INP mejora</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
              Cada keystroke no dispara request. Sólo después de 300ms sin tipear. Evita flooding de API.
            </p>
            <div className="max-w-md">
              <label htmlFor="demo-search" className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                Búsqueda
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
                <input
                  id="demo-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Busca arroz, aceite, gaseosas…"
                  className="w-full rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] pl-10 pr-4 py-2.5 text-sm focus:outline-none"
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">
                    Valor actual
                  </p>
                  <p className="font-mono text-[var(--text-primary)] tabular-nums truncate">
                    {search || <span className="text-[var(--text-tertiary)]">—</span>}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">
                    Debounced (300ms)
                  </p>
                  <p className="font-mono text-[var(--text-primary)] tabular-nums truncate">
                    {debouncedSearch || <span className="text-[var(--text-tertiary)]">—</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4 — FocusTrap */}
        <section className="py-12 border-b border-[var(--rule-base)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
              04 · FocusTrap
            </p>
            <h2 className="text-fs-h2 mb-3">Foco atrapado en modales</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
              Al abrir el panel, presioná Tab repetidas veces. El foco gira dentro del panel sin salir.
              Shift+Tab desde el primer elemento va al último.
            </p>
            <button
              onClick={() => setTrapOpen(!trapOpen)}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold hover:opacity-90"
            >
              {trapOpen ? "Cerrar panel" : "Abrir panel con FocusTrap"}
            </button>
            {trapOpen && (
              <FocusTrap active={trapOpen}>
                <div className="mt-6 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-6 max-w-md">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
                    Panel con focus trap activo
                  </p>
                  <div className="space-y-2">
                    <button className="w-full rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm text-left hover:bg-[var(--surface-sunken)]">
                      Opción 1
                    </button>
                    <button className="w-full rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm text-left hover:bg-[var(--surface-sunken)]">
                      Opción 2
                    </button>
                    <button className="w-full rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm text-left hover:bg-[var(--surface-sunken)]">
                      Opción 3
                    </button>
                  </div>
                  <button
                    onClick={() => setTrapOpen(false)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2 text-xs font-bold"
                  >
                    Cerrar
                  </button>
                </div>
              </FocusTrap>
            )}
          </div>
        </section>

        {/* Section 5 — Idle mount */}
        <section className="py-12 border-b border-[var(--rule-base)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
              05 · useIdleMount (perf)
            </p>
            <h2 className="text-fs-h2 mb-3">Montaje diferido tras idle</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
              Componentes pesados esperan que el navegador termine el render crítico.
              El bloque abajo aparece 1.5s después de load, sin competir con LCP.
            </p>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 min-h-24">
              {idleReady ? (
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--data-success)] mb-2">
                    Idle mounted
                  </p>
                  <p className="text-sm">Este componente se montó tras el idle del navegador.</p>
                </div>
              ) : (
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-2">
                    Esperando idle…
                  </p>
                  <div className="skeleton-v4 h-4 w-full" />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 6 — Focus ring test */}
        <section className="py-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
              06 · Focus ring global
            </p>
            <h2 className="text-fs-h2 mb-3">Keyboard navigation test</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
              Presioná Tab para navegar. El ring aparece solo con keyboard (no mouse).
              Outline negro sobre fondos claros, blanco sobre hero dark.
            </p>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2 text-sm font-bold">
                Botón primario
              </button>
              <button className="rounded-full border border-[var(--rule-base)] px-4 py-2 text-sm font-bold">
                Botón secundario
              </button>
              <a href="#" className="rounded-full underline px-4 py-2 text-sm font-bold">
                Link
              </a>
              <input
                type="text"
                placeholder="Input field"
                className="rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-4 py-2 text-sm"
              />
              <select className="rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] px-4 py-2 text-sm">
                <option>Opción 1</option>
                <option>Opción 2</option>
              </select>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
