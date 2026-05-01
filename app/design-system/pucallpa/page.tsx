"use client";

import {
  DoniaElena,
  MotorizadoUcayali,
  CuadernoFiadoReal,
  PaicheEnOlla,
  MalocaAtardecer,
  RioUcayali,
  SenioraShipiba,
  TallasDePalo,
  PiscoIncaKola,
  MapaUcayaliAutentico,
} from "@/components/ui-system/illustrations";
import { BulejeStoryKPI } from "@/components/ui-system/cards";
import { ShipiboPattern, TimeAwareMascot } from "@/components/ui-system/micro";

const PUCALLPA_ITEMS = [
  { name: "DoniaElena", Comp: DoniaElena, context: "Bodeguera de siempre · admin welcome" },
  { name: "MotorizadoUcayali", Comp: MotorizadoUcayali, context: "Repartidor local · delivery tracking" },
  { name: "CuadernoFiadoReal", Comp: CuadernoFiadoReal, context: "Fiado tradicional · portal crédito" },
  { name: "PaicheEnOlla", Comp: PaicheEnOlla, context: "Gastronomía amazónica · recetas empty" },
  { name: "MalocaAtardecer", Comp: MalocaAtardecer, context: "Cultural identity · about hero" },
  { name: "RioUcayali", Comp: RioUcayali, context: "Geografía local · scroll markers" },
  { name: "SenioraShipiba", Comp: SenioraShipiba, context: "Inclusión cultural · about page" },
  { name: "TallasDePalo", Comp: TallasDePalo, context: "Artesanía regional · productos culturales" },
  { name: "PiscoIncaKola", Comp: PiscoIncaKola, context: "Peruanidad universal · celebrations" },
  { name: "MapaUcayaliAutentico", Comp: MapaUcayaliAutentico, context: "Mapa real · SEO zona" },
];

const AMAZON_COLORS = [
  { name: "amazon-earth", label: "Tierra húmeda", token: "var(--amazon-earth)" },
  { name: "amazon-sunset", label: "Atardecer río", token: "var(--amazon-sunset)" },
  { name: "amazon-jungle", label: "Verde selva", token: "var(--amazon-jungle)" },
  { name: "amazon-river", label: "Agua Ucayali", token: "var(--amazon-river)" },
  { name: "shipibo-red", label: "Textil shipibo", token: "var(--shipibo-red)" },
  { name: "cushma-cream", label: "Textil sagrado", token: "var(--cushma-cream)" },
  { name: "clay-terracotta", label: "Cerámica shipiba", token: "var(--clay-terracotta)" },
];

export default function PucallpaDemoPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      {/* Hero */}
      <section
        className="py-16 sm:py-20 border-b border-[var(--rule-base)] relative overflow-hidden"
        style={{ background: "var(--brand-ink)" }}
      >
        <ShipiboPattern variant="horizontal" opacity={0.1} color="#FAFAF7" height={40} className="absolute top-0 left-0 right-0" />
        <ShipiboPattern variant="horizontal" opacity={0.1} color="#FAFAF7" height={40} className="absolute bottom-0 left-0 right-0" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/55 mb-4">
            ADR-067 · Personalización máxima Buleje · 4 olas O-R
          </p>
          <h1 className="text-fs-display text-white leading-[1.02]">
            Identidad <span className="text-white/45">Pucallpa auténtica</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl">
            10 ilustraciones regionales · 7 tokens amazónicos · KPIs con historia · micro-detalles culturales.
            Sin IA genérica. Con alma Ucayali.
          </p>
        </div>
      </section>

      {/* Story KPI demo */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            Ola Q · BulejeStoryKPI
          </p>
          <h2 className="text-fs-h2 mb-3">Números con historia — no fríos</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
            Cada KPI genera narrativa contextual: causa probable + next action. Reemplaza "S/4,520 ↑12%" por "Tu mejor martes del año".
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <BulejeStoryKPI
              kicker="Ventas de hoy"
              value={4520}
              previousValue={3800}
              avgValue={3600}
              bestValue={4500}
              unit="ventas"
              prefix="S/ "
              decimals={2}
              sparkline={[3200, 3400, 3100, 3800, 4200, 4100, 4520]}
              nextActionHref="#"
            />
            <BulejeStoryKPI
              kicker="Pedidos hoy"
              value={0}
              unit="pedidos"
              sparkline={[2, 4, 3, 5, 3, 2, 0]}
              nextActionHref="#"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <BulejeStoryKPI
              kicker="Clientes únicos"
              value={48}
              previousValue={22}
              unit="clientes"
              sparkline={[15, 18, 22, 20, 25, 28, 48]}
              nextActionHref="#"
            />
            <BulejeStoryKPI
              kicker="Ventas de hoy"
              value={1200}
              previousValue={3800}
              avgValue={3600}
              unit="ventas"
              prefix="S/ "
              decimals={2}
              sparkline={[3200, 3400, 3100, 3800, 4200, 4100, 1200]}
              nextActionHref="#"
            />
          </div>
        </div>
      </section>

      {/* Ilustraciones Pucallpa */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            Ola O · 10 ilustraciones auténticas Ucayali
          </p>
          <h2 className="text-fs-h2 mb-6">Doña Elena, Maloca, Río, Shipibo y más</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {PUCALLPA_ITEMS.map(({ name, Comp, context }) => (
              <div
                key={name}
                className="flex flex-col items-center text-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 hover:border-[var(--rule-strong)] transition-colors"
              >
                <div className="text-[var(--text-primary)]">
                  <Comp size={100} />
                </div>
                <p className="mt-3 text-[length:var(--ts-2xs)] font-mono tabular-nums text-[var(--text-primary)]">{name}</p>
                <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight">{context}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Paleta amazónica */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            Ola P · Paleta amazónica (7 tokens · 5% del diseño)
          </p>
          <h2 className="text-fs-h2 mb-6">Colores con alma regional</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {AMAZON_COLORS.map((c) => (
              <div key={c.name} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
                <div
                  className="h-24 w-full border-b border-[var(--rule-soft)]"
                  style={{ background: c.token }}
                />
                <div className="p-3">
                  <p className="text-xs font-extrabold text-[var(--text-primary)] tracking-tight">{c.label}</p>
                  <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)] mt-0.5">--{c.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Micro-details */}
      <section className="py-12 border-b border-[var(--rule-base)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
            Ola R · Micro-detalles marca
          </p>
          <h2 className="text-fs-h2 mb-6">Touch-points memorables</h2>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Shipibo pattern horizontal */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
                Shipibo Pattern (horizontal)
              </p>
              <div className="bg-[var(--surface-sunken)] rounded-lg p-4 text-[var(--amazon-earth)]">
                <ShipiboPattern variant="horizontal" opacity={0.4} height={50} />
              </div>
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                Uso: footer bands, hero decoration, divider cultural.
              </p>
            </div>

            {/* Shipibo divider */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
                Shipibo Divider
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Sección superior</p>
              <div className="py-3 text-[var(--shipibo-red)]">
                <ShipiboPattern variant="divider" opacity={0.6} />
              </div>
              <p className="text-sm text-[var(--text-secondary)]">Sección inferior</p>
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                Uso: separador entre secciones culturales.
              </p>
            </div>

            {/* Time-aware Mascot */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 md:col-span-2">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
                TimeAwareMascot — Salamandra que cambia según la hora del día
              </p>
              <div className="grid grid-cols-4 gap-4 mt-3">
                <div className="text-center">
                  <div className="bg-[var(--surface-sunken)] rounded-lg p-4 text-[var(--amazon-jungle)]">
                    <TimeAwareMascot size={80} />
                  </div>
                  <p className="mt-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Actual</p>
                </div>
                <div className="text-center">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">Mañana 5-11h</p>
                  <p className="text-xs text-[var(--text-secondary)]">Bebiendo mate<br/>"Buenos días"</p>
                </div>
                <div className="text-center">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">Tarde 12-18h</p>
                  <p className="text-xs text-[var(--text-secondary)]">Con cuaderno<br/>"Trabajando"</p>
                </div>
                <div className="text-center">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">Noche 19-4h</p>
                  <p className="text-xs text-[var(--text-secondary)]">Durmiendo<br/>"Zzz"</p>
                </div>
              </div>
            </div>

            {/* DiaDelBodeguero — info */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 md:col-span-2">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
                DiaDelBodeguero (aparece solo el 20 de agosto)
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Widget que aparece automáticamente el 20 de agosto (Día del Bodeguero Peruano) con Doña Elena + mensaje personalizado.
                Se guarda flag para no mostrar más de una vez por año. Ejemplo visible en producción solo en esa fecha.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer con pattern shipibo */}
      <section className="py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            ADR-067 · 4 olas completadas · Personalización máxima Buleje
          </p>
          <div className="text-[var(--shipibo-red)]">
            <ShipiboPattern variant="divider" opacity={0.5} />
          </div>
        </div>
      </section>
    </main>
  );
}
