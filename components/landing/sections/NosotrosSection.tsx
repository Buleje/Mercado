/**
 * NosotrosSection — historia, valores, equipo con diseño editorial.
 *
 * Estilo: tipografía grande dramática + números grandes + grid asimétrico.
 * Inspiración: Linear, Stripe, Framer about pages.
 */

import Link from "next/link";
import { Heart, MapPin, Users, Zap } from "@buleje/design-system/icons";

const VALUES = [
  {
    icon: Heart,
    title: "Sin intermediarios",
    desc: "Vos vendes, tú decides. Nosotros sólo facilitamos la tecnología y el delivery.",
  },
  {
    icon: MapPin,
    title: "Local primero",
    desc: "Pucallpa construye para Pucallpa. El software entiende cómo funciona tu barrio.",
  },
  {
    icon: Users,
    title: "Comunidad real",
    desc: "Cada bodega que vende aquí conoce a sus clientes por nombre. No somos Amazon.",
  },
  {
    icon: Zap,
    title: "Sin burocracia",
    desc: "Registro en 5 min. Sin contratos, sin mínimos, sin letra chica.",
  },
];

export default function NosotrosSection() {
  return (
    <section
      id="nosotros"
      aria-label="Sobre nosotros"
      className="relative overflow-hidden bg-[var(--surface-canvas)] border-y border-[var(--rule-soft)] py-20 sm:py-28 lg:py-32 scroll-mt-20"
    >
      {/* Blob decorativo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header editorial con título dramático */}
        <div className="max-w-4xl mb-16 sm:mb-24">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
            <span
              aria-hidden
              className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
            />
            Nosotros
          </p>
          <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
            La bodega del barrio,
            <br />
            <span className="italic font-serif text-[var(--accent)]">ahora digital.</span>
          </h2>
          <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-3xl">
            Somos una bodega familiar de Pucallpa que decidió construir el software
            que nos hubiera gustado tener. Hoy esa herramienta la usan 120+ bodegas
            del Perú.
          </p>
        </div>

        {/* Grid asimétrico: 1 párrafo grande + 4 valores compactos */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-12 lg:gap-16 mb-20 sm:mb-24">
          {/* Columna izquierda — statement grande */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed">
              <span className="text-[var(--text-primary)] font-semibold">
                No construimos Amazon ni Mercado Libre.
              </span>{" "}
              Construimos la herramienta para que{" "}
              <span className="text-[var(--accent)] font-semibold">
                la bodega de la esquina
              </span>{" "}
              le gane a esos gigantes en su propio barrio.
            </p>
            <p className="mt-6 text-base text-[var(--text-tertiary)] leading-relaxed">
              Tu cliente es tu vecino. Lo conoces por nombre. Sabes qué compra cada semana.
              Ese vínculo no lo reemplaza ningún algoritmo — pero sí lo amplificamos con
              delivery, inventario, reportes y cobros digitales.
            </p>
          </div>

          {/* Columna derecha — 4 valores en grid 2x2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 transition-all duration-300 hover:border-[var(--accent)]/40 hover:-translate-y-0.5"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="text-base font-black tracking-[-0.01em] text-[var(--text-primary)]">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA sutil — stats viven en el hero, no se duplican aqui */}
        <div className="mt-4 text-center">
          <Link
            href="/abrir-tienda"
            className="inline-flex items-center gap-2 text-base font-bold text-[var(--accent)] hover:gap-3 transition-all"
          >
            Si sos bodega, sumate
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
