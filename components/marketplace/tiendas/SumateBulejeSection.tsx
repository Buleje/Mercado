import Link from "next/link";
import { Store, Bike, ArrowRight, Sparkles } from "@buleje/design-system/icons";

/**
 * SumateBulejeSection — CTA B2B creativa al pie de /tiendas (Brandon 2026-07-06).
 * Dos tarjetas con gradiente firma + greca amazónica + orbes: "Abre tu tienda"
 * (teal) y "Sé repartidor" (coral). Tipografía suave (bold, no black).
 */
export default function SumateBulejeSection() {
  return (
    <section
      aria-label="Sumate a Buleje"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
    >
      <header className="mb-5 sm:mb-6 text-center">
        <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Para negocios y repartidores
        </p>
        <h2 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          Sumate a Buleje
        </h2>
        <p className="mt-1.5 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)]">
          Tu bodega o tu moto, generando ingresos en el barrio.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <SumateCard
          href="/abrir-tienda"
          icon={<Store className="h-7 w-7" strokeWidth={1.75} aria-hidden />}
          kicker="Gratis · sin comisión de alta"
          title="Abre tu tienda"
          desc="Vendé en Buleje con delivery incluido. Publicá tus productos y llegá a todo el barrio."
          cta="Empezar a vender"
          gradient="linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, #0d3b3b 100%)"
        />
        <SumateCard
          href="/marketplace/repartidor"
          icon={<Bike className="h-7 w-7" strokeWidth={1.75} aria-hidden />}
          kicker="Flexible · a tu ritmo"
          title="Sé repartidor"
          desc="Ganá repartiendo pedidos cerca de casa. Vos elegís cuándo salir."
          cta="Quiero repartir"
          gradient="linear-gradient(135deg, #ff8676 0%, #ff6b5b 50%, #b83a2c 100%)"
        />
      </div>
    </section>
  );
}

function SumateCard({
  href,
  icon,
  kicker,
  title,
  desc,
  cta,
  gradient,
}: {
  href: string;
  icon: React.ReactNode;
  kicker: string;
  title: string;
  desc: string;
  cta: string;
  gradient: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-3xl p-6 sm:p-7 text-white transition-transform duration-[var(--dur-base)] hover:-translate-y-1"
      style={{ background: gradient }}
    >
      {/* Greca amazónica sutil */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
        width="100%"
        height="100%"
      >
        <defs>
          <pattern id={`greca-${title}`} width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M0 13h6v-6h6v6h8v6h-6v6h-6v-6H0z" fill="none" stroke="white" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#greca-${title})`} />
      </svg>
      {/* Orbes */}
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-black/10 blur-2xl" />
      {/* Brillo diagonal en hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-y-10 -left-1/4 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/25 backdrop-blur-sm">
          {icon}
        </span>
        <p className="mt-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/85">
          {kicker}
        </p>
        <h3 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight leading-tight">
          {title}
        </h3>
        <p className="mt-2 max-w-xs text-[length:var(--ts-sm)] text-white/90 leading-snug">
          {desc}
        </p>
        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 h-11 text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] transition-transform group-hover:gap-3">
          {cta}
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
      </div>
    </Link>
  );
}
