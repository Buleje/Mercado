/**
 * PorQueConfiarSection — el "por qué confiar" del concepto de /negocios.
 *
 * /negocios es la landing INSTITUCIONAL (qué es Buleje · por qué confiar).
 * Hasta ahora no tenía un bloque de credibilidad propio — los argumentos de
 * confianza vivían solo en /abrir-tienda (framing de reversión de riesgo:
 * "sin tarjeta, cancelás cuando quieras"). Acá el framing es distinto:
 * CREDIBILIDAD institucional (hecho en Perú, 0% comisión, soporte humano,
 * datos protegidos por ley). No se pisa con las "Garantías" de /abrir-tienda.
 *
 * Layout split (statement editorial a la izquierda + pilares a la derecha)
 * para romper la cadencia de grids de las secciones vecinas.
 *
 * Server component (estático). Geo desde BRAND_GEO (single source).
 */

import Link from "next/link";
import { BRAND_GEO } from "@/lib/geo";
import {
  MapPin,
  HandCoins,
  MessageCircle,
  Lock,
  ArrowUpRight,
} from "@buleje/design-system/icons";

const PILARES = [
  {
    icon: MapPin,
    title: "Hecho en el Perú, para el Perú",
    desc: `Yape, Plin, SUNAT e IGV nativos — no un sistema gringo traducido. Nacimos en ${BRAND_GEO.city} y entendemos la bodega de barrio.`,
  },
  {
    icon: HandCoins,
    title: "0% de comisión por venta",
    desc: "No te quitamos un sol de cada venta. La plata llega completa a tu Yape o tu caja. Solo pagas tu plan, sin sorpresas.",
  },
  {
    icon: MessageCircle,
    title: "Soporte humano, no bots",
    desc: "Una persona real te responde por WhatsApp el mismo día. Sin tickets, sin formularios, sin esperar en una cola.",
  },
  {
    icon: Lock,
    title: "Tus datos son tuyos",
    desc: "Protegidos por la Ley 29733. Respaldos todos los días y exportas todo en CSV cuando quieras. Sin amarres.",
  },
] as const;

export default function PorQueConfiarSection() {
  return (
    <section
      id="por-que-confiar"
      aria-label="Por qué confiar en Buleje"
      className="relative overflow-hidden bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)] py-20 sm:py-28 scroll-mt-20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20 items-start">
          {/* Statement editorial (izquierda, sticky en desktop) */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              Por qué confiar
            </p>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[1]">
              No somos otra app.{" "}
              <span className="italic font-serif text-[var(--accent)]">
                Somos tu socio.
              </span>
            </h2>
            <p className="mt-6 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-md">
              Construimos Buleje desde una bodega real, con las herramientas que
              el comercio peruano de verdad usa. Crecemos solo si tú creces.
            </p>
            <Link
              href="/abrir-tienda"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-3.5 text-sm font-extrabold shadow-lg hover:gap-3 hover:shadow-xl transition-all"
            >
              Probar gratis 1 mes
              <ArrowUpRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.5}
              />
            </Link>
          </div>

          {/* Pilares (derecha) */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {PILARES.map((p) => (
              <li
                key={p.title}
                className="group rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 transition-all hover:border-[var(--accent)]/40 hover:shadow-md"
              >
                <span
                  aria-hidden
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] mb-4 transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
                >
                  <p.icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <h3 className="text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)] leading-tight">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {p.desc}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
