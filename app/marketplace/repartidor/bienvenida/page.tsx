"use client";

import Link from "next/link";
import { ArrowRight } from "@buleje/design-system/icons";
import {
  MotoIcon,
  PackageIcon,
  RouteIcon,
  CashIcon,
  CheckBadge,
  ClockBadge,
  PinIcon,
  ShieldBadge,
  WhatsAppIcon,
  HeroDeliveryIllustration,
} from "@/components/delivery/icons";

const STEPS = [
  {
    n: "01",
    Icon: ClockBadge,
    title: "Espera tu primer pedido",
    desc: "Cuando un cliente haga un pedido cerca de ti, te llega una notificación por WhatsApp con la dirección de recojo, la entrega y los productos.",
  },
  {
    n: "02",
    Icon: PackageIcon,
    title: "Recoge el pedido",
    desc: "Ve a la tienda indicada y verifica que todo coincida con la lista antes de salir. Si falta algo, avísanos por WhatsApp.",
  },
  {
    n: "03",
    Icon: RouteIcon,
    title: "Entrégaselo al cliente",
    desc: "Lleva el pedido a la dirección. Si es pago contra entrega, cobra el monto exacto. Sé puntual y amable — tu rating depende de eso.",
  },
  {
    n: "04",
    Icon: CashIcon,
    title: "Cobra tus ganancias",
    desc: "La tarifa de envío + propina se acumulan y se pagan semanalmente. Puedes ver tu historial y ganancias dentro de la app del repartidor.",
  },
];

const BADGES = [
  { Icon: ClockBadge, title: "Horario flexible", desc: "Tú decides cuándo trabajar" },
  { Icon: PinIcon, title: "Tu zona", desc: "Pedidos cerca de ti" },
  { Icon: ShieldBadge, title: "Soporte 24/7", desc: "Te ayudamos siempre" },
];

const TIPS = [
  "Mantén el celular cargado y con datos para no perder pedidos.",
  "Revisa los productos antes de salir de la tienda.",
  "Trata los productos con cuidado, sobre todo los frágiles.",
  "Sé puntual y amable — los clientes te califican después de cada entrega.",
  "Cualquier problema, escríbenos por WhatsApp y te respondemos al instante.",
];

export default function BienvenidaRepartidorPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--brand-primary-light)] text-white">
        <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-white/5 blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-14 lg:py-20 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-white/15 backdrop-blur text-sm font-extrabold uppercase tracking-wider">
              Onboarding repartidor
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
              Bienvenido al equipo.
            </h1>
            <p className="mt-5 max-w-xl text-base sm:text-lg text-white/85 leading-relaxed">
              Ya formas parte de la red de repartidores Buleje. Aquí te dejamos en 4 pasos cómo
              funciona tu primera entrega.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/delivery-app/login"
                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-white text-[var(--accent)] text-base font-extrabold shadow-lg hover:translate-y-[-1px] transition-transform"
              >
                <MotoIcon className="h-5 w-5" />
                Ingresar a mi cuenta
                <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
              </Link>
            </div>
          </div>

          <div className="hidden lg:flex justify-center text-white/90">
            <HeroDeliveryIllustration className="h-72 w-auto" />
          </div>
        </div>
      </section>

      {/* Steps + side cards */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-12 lg:py-20 grid lg:grid-cols-[1.4fr_1fr] gap-10">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-wider text-[var(--accent)]">
            Cómo funciona
          </p>
          <h2 className="mt-2 text-3xl lg:text-4xl font-extrabold text-[var(--text-primary)] leading-tight">
            Tu primera entrega en 4 pasos
          </h2>

          <ol className="mt-6 space-y-3">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6 flex items-start gap-4 lg:gap-5"
              >
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="h-12 w-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                    <s.Icon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
                    Paso {s.n}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg lg:text-xl font-extrabold text-[var(--text-primary)] leading-tight">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-base text-[var(--text-secondary)] leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
          <div className="grid gap-3">
            {BADGES.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex items-center gap-3"
              >
                <div className="h-11 w-11 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                  <b.Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                    {b.title}
                  </p>
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">
                    {b.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 lg:p-6">
            <div className="flex items-center gap-2 mb-3">
              <CheckBadge className="h-5 w-5 text-[var(--accent)]" />
              <h3 className="text-base font-extrabold text-[var(--text-primary)]">
                Consejos rápidos
              </h3>
            </div>
            <ul className="space-y-2.5">
              {TIPS.map((tip) => (
                <li key={tip} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {/* Soporte */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 pb-16 lg:pb-24">
        <div className="rounded-3xl border-2 border-[var(--accent)] bg-gradient-to-br from-[var(--accent-soft)] via-[var(--surface-raised)] to-[var(--surface-raised)] p-6 lg:p-10 text-center">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-[var(--text-primary)] leading-tight">
            ¿Tienes dudas? Escríbenos.
          </h2>
          <p className="mt-2 text-base text-[var(--text-secondary)] max-w-md mx-auto">
            Equipo Buleje en línea por WhatsApp todos los días.
          </p>
          <a
            href="https://wa.me/51999999999?text=Hola%2C%20soy%20repartidor%20nuevo%20y%20tengo%20una%20pregunta"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--data-success-500)] text-base font-extrabold text-white shadow-lg shadow-[var(--data-success)]/25 hover:translate-y-[-1px] transition-transform"
          >
            <WhatsAppIcon className="h-5 w-5" />
            WhatsApp de soporte
          </a>
          <div className="mt-6">
            <Link
              href="/marketplace"
              className="text-sm font-extrabold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              ← Volver al marketplace
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
