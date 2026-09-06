"use client";

/**
 * SocioDashboardHero — Hero del panel del socio (rediseño 2026-07-04, coherente
 * con la landing premium: gradiente teal de marca + corona shipibo + estado).
 *
 * Saludo + badge de estado + fecha de renovación + plan + CTA "Renovar/Reactivar".
 */

import { PrimaryButton } from "@buleje/design-system";
import { Sparkles, CalendarClock, CreditCard } from "@buleje/design-system/icons";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";
import { SocioCorona } from "@/components/ui-system/illustrations";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function SocioDashboardHero({ name = "Socio" }: { name?: string }) {
  const { status, plan, membershipEnd, resume } = useSocioBuleje();
  const isCanceled = status === "canceled";
  const isTrial = status === "trial";
  const firstName = name.split(" ")[0] ?? "Socio";

  const statusLabel = isCanceled
    ? "Membresía en cancelación"
    : isTrial
      ? "Trial activo"
      : "Socio activo";

  return (
    <section
      className="relative overflow-hidden bg-[var(--accent)]"
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, #0d3b3b 100%)",
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-12 sm:px-6 lg:px-8 lg:py-14">
        {/* Copy */}
        <div className="min-w-0 flex-1 text-white">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[var(--ls-wider)] ring-1 ring-inset backdrop-blur ${
              isCanceled
                ? "bg-amber-400/20 text-amber-100 ring-amber-200/30"
                : "bg-white/15 text-white ring-white/25"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isCanceled ? "bg-amber-300" : "animate-pulse bg-emerald-300"}`} />
            {statusLabel}
          </span>

          <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-white/70">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Bienvenido
          </p>
          <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
            {firstName}, sos Socio Buleje
          </h1>
          <p className="mt-3 max-w-lg text-base leading-relaxed text-white/85">
            Tus beneficios están activos. Delivery gratis, 5% de cashback y precios
            exclusivos en cada pedido del marketplace.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm ring-1 ring-inset ring-white/20 backdrop-blur">
              <CalendarClock className="h-3.5 w-3.5 text-white/70" aria-hidden />
              <span className="text-white/80">{isCanceled ? "Vence el" : "Renovación el"}</span>
              <span className="font-bold text-white">{fmtDate(membershipEnd)}</span>
            </span>
            {plan && (
              <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm ring-1 ring-inset ring-white/20 backdrop-blur">
                <CreditCard className="h-3.5 w-3.5 text-white/70" aria-hidden />
                <span className="text-white/80">Plan</span>
                <span className="font-bold text-white">{plan === "yearly" ? "Anual" : "Mensual"}</span>
              </span>
            )}
          </div>
        </div>

        {/* Corona + CTA */}
        <div className="flex shrink-0 flex-col items-center gap-4">
          <div className="text-white/90 drop-shadow-[0_8px_20px_rgba(0,0,0,0.25)]" aria-hidden="true">
            <SocioCorona size={130} />
          </div>
          {isCanceled ? (
            <PrimaryButton onClick={() => resume()}>Reactivar membresía</PrimaryButton>
          ) : (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[var(--accent-dark)] dark:text-[var(--accent)] shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
            >
              Renovar anticipado
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
