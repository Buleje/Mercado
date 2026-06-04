/**
 * ParaQuienSection — "Un sistema, todos los rubros".
 *
 * Refuerza el concepto institucional de /negocios: Buleje NO es solo para
 * bodegas — el MISMO sistema se transforma según el rubro (motor de verticales,
 * ADR-100). En vez de un grid estático de iconos, montamos un demo interactivo
 * (RubroSwitcher) donde el panel cambia su título, módulos y vocabulario al
 * elegir cada rubro — un diferenciador real del producto, no un cuadro genérico.
 *
 * Server component (el switcher interactivo es el client child).
 */

import Link from "next/link";
import { ArrowUpRight } from "@buleje/design-system/icons";
import RubroSwitcher from "./RubroSwitcher";

export default function ParaQuienSection() {
  return (
    <section
      id="para-quien"
      aria-label="Para qué negocios es Buleje"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-20 sm:py-28 scroll-mt-20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-[440px] w-[440px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="max-w-2xl mb-12 sm:mb-16">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            Para tu rubro
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[1]">
            Un sistema que{" "}
            <span className="italic font-serif text-[var(--accent)]">
              habla tu idioma.
            </span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Buleje no es genérico: el mismo panel se transforma según tu negocio.
            Elige tu rubro y mira cómo cambian los módulos y hasta el nombre de
            las cosas — sin pagar nada extra.
          </p>
        </div>

        {/* Demo interactivo */}
        <RubroSwitcher />

        {/* CTA */}
        <div className="mt-12 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/abrir-tienda"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-3.5 text-sm font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
          >
            Probar gratis 1 mes
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.5}
            />
          </Link>
          <p className="text-sm text-[var(--text-tertiary)]">
            ¿Otro rubro? Activas solo los módulos que necesitas. Buleje crece contigo.
          </p>
        </div>
      </div>
    </section>
  );
}
