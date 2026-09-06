/**
 * NosotrosSection v2 (2026-05-10) — editorial rediseñado.
 *
 * Estructura:
 *  1. Header dramático (kicker + headline + subheadline)
 *  2. Manifesto block — pull quote en serif italic con borde lateral accent
 *  3. Stats inline — 4 números grandes con etiqueta
 *  4. Values grid — 4 cards rectangulares con icono accent + hover transform
 *  5. CTA single — sin sticky, sin link blando
 */

import Link from "next/link";
import { Heart, MapPin, Users, Zap, ArrowUpRight } from "@buleje/design-system/icons";
import T from "@/components/T";

const VALUES = [
  { icon: Heart,  keyTitle: "about.value1.title", keyDesc: "about.value1.desc" },
  { icon: MapPin, keyTitle: "about.value2.title", keyDesc: "about.value2.desc" },
  { icon: Users,  keyTitle: "about.value3.title", keyDesc: "about.value3.desc" },
  { icon: Zap,    keyTitle: "about.value4.title", keyDesc: "about.value4.desc" },
];

// Stats curados (no se repiten con los del hero — hero usa stock count y
// tienda count; acá usamos métricas de la promesa de producto).
const STATS = [
  { value: "5 min", label: "para abrir tu tienda" },
  { value: "0%",    label: "comisión por venta" },
  { value: "24/7",  label: "pedidos automáticos" },
  { value: "1-a-1", label: "acompañamiento 90 días" },
];

export default function NosotrosSection() {
  return (
    <section
      id="nosotros"
      aria-label="Sobre nosotros"
      className="relative overflow-hidden bg-[var(--surface-canvas)] border-y border-[var(--rule-soft)] py-20 sm:py-28 lg:py-32 scroll-mt-20"
    >
      {/* Blobs decorativos */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -left-40 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── 1. Header editorial ─────────────────────────────────────────── */}
        <div className="max-w-4xl mb-14 sm:mb-20">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span
              aria-hidden
              className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
            />
            <T k="about.kicker" fallback="Nosotros" />
          </p>
          <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
            <T k="about.headline1" fallback="El sistema que pone" />{" "}
            <br />
            <span className="text-[var(--accent)]">
              <T k="about.headlineAccent" fallback="a vender tu negocio." />
            </span>
          </h2>
          <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] leading-[1.4] max-w-3xl">
            <T k="about.subheadline" fallback="Catálogo, pagos, delivery, repartidores y reportes — en una sola plataforma. Tú vendes, nosotros nos ocupamos de la tecnología." />
          </p>
        </div>

        {/* ── 2. Manifesto pull-quote ─────────────────────────────────────── */}
        <figure className="mb-16 sm:mb-20 relative pl-6 sm:pl-8 border-l-[3px] border-[var(--accent)]">
          <span
            aria-hidden
            className="absolute -left-1.5 top-0 inline-flex h-3 w-3 rounded-full bg-[var(--accent)] shadow-[0_0_0_4px_var(--surface-canvas)]"
          />
          <blockquote className="text-2xl sm:text-3xl lg:text-4xl font-serif italic text-[var(--text-primary)] leading-[1.25] max-w-4xl">
            <T
              k="about.manifesto"
              fallback="“Cada bodega del Perú merece la misma tecnología que las grandes cadenas — pero sin programar, sin pagar técnicos, sin tarjeta.”"
            />
          </blockquote>
          <figcaption className="mt-5 inline-flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] font-extrabold text-sm"
            >
              B
            </span>
            <div>
              <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                Brandon Buleje
              </p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-tight">
                Fundador · Pucallpa, Perú
              </p>
            </div>
          </figcaption>
        </figure>

        {/* ── 3. Stats strip — 4 números grandes ──────────────────────────── */}
        <ul className="mb-16 sm:mb-20 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-[var(--rule-soft)] border border-[var(--rule-soft)]">
          {STATS.map(({ value, label }) => (
            <li
              key={label}
              className="bg-[var(--surface-raised)] px-5 py-7 sm:py-8 flex flex-col items-start gap-2"
            >
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {label}
              </p>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] tabular-nums text-[var(--text-primary)] leading-none">
                {value === "0%" ? (
                  <>
                    <span className="text-[var(--accent)]">0</span>
                    <span className="text-[var(--text-secondary)]">%</span>
                  </>
                ) : (
                  <span>{value}</span>
                )}
              </p>
            </li>
          ))}
        </ul>

        {/* ── 4. Values grid — 4 cards más sólidas ────────────────────────── */}
        <div className="mb-16 sm:mb-20">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-4">
            Lo que prometemos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {VALUES.map(({ icon: Icon, keyTitle, keyDesc }) => (
              <article
                key={keyTitle}
                className="group relative rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 transition-all duration-[var(--dur-base)] hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
              >
                <span
                  aria-hidden
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-5 transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <h3 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                  <T k={keyTitle} />
                </h3>
                <p className="mt-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  <T k={keyDesc} />
                </p>
                {/* Arrow decorativo bottom-right */}
                <span
                  aria-hidden
                  className="absolute bottom-5 right-5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] opacity-0 transition-all group-hover:opacity-100 group-hover:bg-[var(--accent)] group-hover:text-white"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
              </article>
            ))}
          </div>
        </div>

        {/* ── 5. CTA editorial ────────────────────────────────────────────── */}
        <div className="text-center">
          <Link
            href="/abrir-tienda"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-8 py-4 text-base font-extrabold shadow-md hover:gap-3 hover:shadow-lg transition-all"
          >
            Probar gratis 1 mes
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.5}
            />
          </Link>
          <p className="mt-4 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Sin tarjeta · Cancelas cuando quieras · Setup en 5 minutos
          </p>
        </div>
      </div>
    </section>
  );
}
