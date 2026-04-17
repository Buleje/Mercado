"use client";

import {
  // Empty states
  CanastaVacia,
  PedidoLlegando,
  LupaConfundida,
  CuadernoAbierto,
  OllaVacia,
  EstanteVacio,
  FrascoEstrellas,
  BalanzaVacia,
  MensajeronBuscando,
  ConexionCortada,
  // Success moments
  BodegueroCelebrando,
  CajaFeliz,
  SalamanderSaludando,
  TrofeoEvolving,
  PiscoBotella,
  CampanaRinging,
  // Contextual
  BodegaAbriendo,
  CorazonLatiendo,
  MotoRuta,
  BrujulaPerdida,
  IllustrationCard,
} from "@/components/ui-system/illustrations";

const EMPTY = [
  { name: "CanastaVacia", Comp: CanastaVacia, context: "Favoritos / Carrito vacío" },
  { name: "PedidoLlegando", Comp: PedidoLlegando, context: "Sin pedidos" },
  { name: "LupaConfundida", Comp: LupaConfundida, context: "Búsqueda sin resultados" },
  { name: "CuadernoAbierto", Comp: CuadernoAbierto, context: "Sin fiados" },
  { name: "OllaVacia", Comp: OllaVacia, context: "Recetas vacío" },
  { name: "EstanteVacio", Comp: EstanteVacio, context: "Sin stock" },
  { name: "FrascoEstrellas", Comp: FrascoEstrellas, context: "Puntos en cero" },
  { name: "BalanzaVacia", Comp: BalanzaVacia, context: "Comparador vacío" },
  { name: "MensajeronBuscando", Comp: MensajeronBuscando, context: "Sin conexión" },
  { name: "ConexionCortada", Comp: ConexionCortada, context: "Error network" },
];

const SUCCESS = [
  { name: "BodegueroCelebrando", Comp: BodegueroCelebrando, context: "Post-checkout, vendor first sale" },
  { name: "CajaFeliz", Comp: CajaFeliz, context: "Order placed" },
  { name: "SalamanderSaludando", Comp: SalamanderSaludando, context: "Welcome modal (mascot)" },
  { name: "TrofeoEvolving", Comp: TrofeoEvolving, context: "Level up loyalty" },
  { name: "PiscoBotella", Comp: PiscoBotella, context: "Upgrade plan" },
  { name: "CampanaRinging", Comp: CampanaRinging, context: "Vendor first order" },
];

const CONTEXTUAL = [
  { name: "BodegaAbriendo", Comp: BodegaAbriendo, context: "Apply wizard step 1" },
  { name: "CorazonLatiendo", Comp: CorazonLatiendo, context: "Wishlist saved" },
  { name: "MotoRuta", Comp: MotoRuta, context: "Tracking page" },
  { name: "BrujulaPerdida", Comp: BrujulaPerdida, context: "Not found 404" },
];

export default function IllustrationsDemoPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Hero */}
      <section
        className="py-16 sm:py-20 border-b border-[var(--rule-base)]"
        style={{ background: "var(--brand-ink)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/55 mb-4">
            ADR-065 Ola F · Illustration System v2
          </p>
          <h1 className="text-fs-display text-white leading-[1.02]">
            20 ilustraciones <span className="text-white/45">con firma Buleje</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl">
            Estilo Notion monochrome, stroke 1.5, currentColor (adaptan dark/light automático).
            Cultura amazónica aplicada — salamandra mascot, pisco, bodega, cuaderno fiado.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-0 border-y border-white/10 py-6 max-w-md">
            <div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">10</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 mt-2">Empty states</p>
            </div>
            <div className="border-l border-white/10 pl-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">6</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 mt-2">Success</p>
            </div>
            <div className="border-l border-white/10 pl-4">
              <p className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">4</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 mt-2">Contextual</p>
            </div>
          </div>
        </div>
      </section>

      {/* IllustrationCard demo */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            ★ · IllustrationCard wrapper
          </p>
          <h2 className="text-fs-h2 mb-6">Uso en empty states</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <IllustrationCard
                illustration={<CanastaVacia size={140} />}
                kicker="Favoritos"
                title="Guardá tus favoritos"
                description="Tocá el corazón en cualquier producto para verlos acá cuando vuelvas."
                primaryAction={
                  <button className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold">
                    Explorar productos
                  </button>
                }
              />
            </div>
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <IllustrationCard
                illustration={<BodegueroCelebrando size={140} />}
                kicker="¡Primer pedido!"
                title="Tu pedido está en camino"
                description="Estamos preparando todo. Llega en ~25 min."
                illustrationColor="accent"
                primaryAction={
                  <button className="rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold">
                    Seguir pedido
                  </button>
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* 10 Empty States */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            01 · Empty states (10)
          </p>
          <h2 className="text-fs-h2 mb-6">Ilustraciones para estados vacíos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {EMPTY.map(({ name, Comp, context }) => (
              <div
                key={name}
                className="flex flex-col items-center text-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 hover:border-[var(--rule-strong)] transition-colors"
              >
                <div className="text-[var(--text-primary)]">
                  <Comp size={96} />
                </div>
                <p className="mt-3 text-[10px] font-mono tabular-nums text-[var(--text-primary)]">{name}</p>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)] leading-tight">{context}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 Success Moments */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            02 · Success moments (6)
          </p>
          <h2 className="text-fs-h2 mb-6">Ilustraciones para celebraciones</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {SUCCESS.map(({ name, Comp, context }) => (
              <div
                key={name}
                className="flex flex-col items-center text-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 hover:border-[var(--rule-strong)] transition-colors"
              >
                <div className="text-[var(--brand-accent)]">
                  <Comp size={110} />
                </div>
                <p className="mt-4 text-[10px] font-mono tabular-nums text-[var(--text-primary)]">{name}</p>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)] leading-tight">{context}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 Contextual */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
            03 · Contextuales (4)
          </p>
          <h2 className="text-fs-h2 mb-6">Ilustraciones para momentos especiales</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {CONTEXTUAL.map(({ name, Comp, context }) => (
              <div
                key={name}
                className="flex flex-col items-center text-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 hover:border-[var(--rule-strong)] transition-colors"
              >
                <div className="text-[var(--text-primary)]">
                  <Comp size={110} />
                </div>
                <p className="mt-4 text-[10px] font-mono tabular-nums text-[var(--text-primary)]">{name}</p>
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)] leading-tight">{context}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="py-10 text-center">
        <p className="text-xs text-[var(--text-tertiary)]">
          ADR-065 · Ola F completada · 20 ilustraciones custom <code className="ml-2 px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono text-[10px]">@/components/ui-system/illustrations</code>
        </p>
      </section>
    </main>
  );
}
