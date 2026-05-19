/**
 * app/(marketing)/demo/page.tsx
 *
 * Landing pública para captura de leads — high-conversion focus.
 * URL: https://buleje.pe/demo
 *
 * Optimizado para outbound WhatsApp + FB ads.
 * Estructura: hero personal (Brandon) → dolor + solución → ROI calc → form.
 */

import { Metadata } from "next";
import DemoLeadForm from "@/components/marketing/DemoLeadForm";

export const metadata: Metadata = {
  title: "Demo gratis — Buleje | El sistema que uso en mi bodega",
  description:
    "Soy Brandon, dueño de Bodega San Martín en Pucallpa. Construí Buleje para mi bodega y lo abro a 10 bodegueros. Demo gratis 10 min por WhatsApp.",
  openGraph: {
    title: "Demo gratis Buleje · Sistema para tu bodega",
    description:
      "Sistema completo (inventario + WhatsApp + delivery + fiados + Yape) por S/89/mes. Plan Fundador 10 cupos.",
    type: "website",
  },
};

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20">
        {/* Hero personal */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[var(--ls-wider)] font-extrabold text-[var(--accent)] mb-3">
            Plan Fundador · solo 10 cupos
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold text-[var(--text-primary)] tracking-tight leading-tight mb-5">
            El sistema que uso en mi bodega
            <br />
            <span className="text-[var(--accent)]">ahora abierto a vos</span>
          </h1>
          <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            Soy <strong>Brandon Buleje</strong>, dueño de Bodega San Martín acá
            en Pucallpa. Hace 8 meses construí Buleje para no perder más plata
            en mermas y fiados. <strong>Me ahorra 3 horas por día.</strong>
          </p>
        </div>

        {/* Stats reales */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Recuperé en fiados", value: "S/4,200" },
            { label: "Horas ahorradas/día", value: "3 hrs" },
            { label: "Cupos disponibles", value: "10" },
            { label: "Setup + 1er mes", value: "S/289" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)] p-4 text-center"
            >
              <div className="text-2xl sm:text-3xl font-extrabold text-[var(--accent)] mb-1">
                {s.value}
              </div>
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Lo que recibes */}
        <div className="rounded-3xl bg-[var(--surface-sunken)] border-2 border-[var(--rule-base)] p-6 sm:p-8 mb-12">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] mb-5">
            Lo que recibes el día 1 (con S/200 setup)
          </h2>
          <ul className="space-y-3">
            {[
              "Sistema funcionando con TUS productos + TU logo",
              "Catálogo WhatsApp listo para mandar a tus clientes",
              "Inventario digital (lo que tenés en Excel/cuaderno)",
              "Yape integrado con notificación automática",
              "Panel admin desde tu celular (no necesitás computadora)",
              "1 hora de capacitación 1-a-1 conmigo por video",
              "Soporte directo conmigo por WhatsApp",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-base text-[var(--text-secondary)]">
                <span className="text-[var(--accent)] font-bold flex-shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Garantía */}
        <div className="rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-5 mb-12 text-center">
          <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
            🛡 Garantía de devolución: 30 días
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Si en 30 días Buleje no te ahorra al menos 2 horas por semana,
            te devuelvo los S/200 + el primer mes. Sin trucos.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-3xl bg-[var(--surface-canvas)] border-2 border-[var(--accent)] shadow-[var(--shadow-lg)] p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] mb-2">
            Reservá tu demo de 10 minutos
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Te escribo por WhatsApp en menos de 24 horas para coordinar.
            Sin presión, sin venta agresiva — si después no te interesa, está bien.
          </p>
          <DemoLeadForm />
        </div>

        {/* Trust footer */}
        <p className="text-xs text-center text-[var(--text-tertiary)] mt-8">
          Datos protegidos por Ley 29733 PE · Bodega San Martín, Pucallpa, Perú ·
          Si preferís, escribime directo a{" "}
          <a
            href="https://wa.me/51994000000"
            className="text-[var(--accent)] underline font-bold"
            target="_blank"
            rel="noopener"
          >
            WhatsApp +51 994...
          </a>
        </p>
      </section>
    </main>
  );
}
