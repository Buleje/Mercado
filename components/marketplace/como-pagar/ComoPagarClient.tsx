"use client";

/**
 * ComoPagarClient — Pagina informativa de metodos de pago.
 *
 * Rediseno 2026-05-27 (Brandon): alineado al formato editorial de /negocios.
 *   - Tipografia sobria (sin titulos gigantes), copy corto y directo.
 *   - Bloque Yape limpio en tokens del sitio (sin gradiente morado ni mockup).
 *   - Menos scroll: removida la seccion "Primera vez con Yape" (redundante).
 *   - Mismos patrones que /negocios: kicker + titulo + acento serif, tarjetas
 *     sobrias, acento teal, secciones limpias.
 *
 * Sin mocks de pago: solo metodos REALES que la app soporta hoy.
 */

import Link from "next/link";
import {
  Smartphone,
  Banknote,
  Building2,
  CreditCard,
  ShieldCheck,
  ArrowRight,
  Check,
  Zap,
  QrCode,
  Wallet,
  Truck,
  Receipt,
} from "@buleje/design-system/icons";

// ── Metodos secundarios (Yape va destacado en su propia seccion) ──────────
type Method = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  steps: string[];
  icon: typeof Smartphone;
};

const OTHER_METHODS: Method[] = [
  {
    id: "efectivo",
    eyebrow: "Pagás al recibir",
    title: "Efectivo",
    description: "Le pagás al motorizado cuando llega. Indicás si necesitás vuelto al confirmar.",
    steps: ["Pedí desde la app", "Elegí 'Efectivo'", "Indicá tu vuelto", "Pagá al recibir"],
    icon: Banknote,
  },
  {
    id: "plin",
    eyebrow: "Alternativa rápida",
    title: "Plin",
    description: "Igual que Yape, desde tu app bancaria (BCP, Interbank, BBVA, Scotiabank).",
    steps: ["Elegí Plin", "Buscá el número", "Enviá el pago", "Confirmá con la bodega"],
    icon: Smartphone,
  },
  {
    id: "transferencia",
    eyebrow: "Pedidos grandes",
    title: "Transferencia",
    description: "Para pedidos sobre S/500. La bodega te pasa su CCI y confirma al recibir.",
    steps: ["Avisá por WhatsApp", "Recibí el CCI", "Transferí", "Enviá el voucher"],
    icon: Building2,
  },
  {
    id: "tarjeta",
    eyebrow: "Online seguro",
    title: "Tarjeta",
    description: "Visa o Mastercard vía Stripe. La bodega nunca ve tus datos completos.",
    steps: ["Elegí 'Tarjeta'", "Cargá los datos", "Confirmá con OTP", "Recibí tu comprobante"],
    icon: CreditCard,
  },
];

// ── Tabla comparativa: las 5 dimensiones que importan ─────────────────────
type Feature = {
  key: "instant" | "noCard" | "payOnDelivery" | "bigAmounts" | "noFee";
  label: string;
};

const FEATURES: Feature[] = [
  { key: "instant",       label: "Instantáneo" },
  { key: "noCard",        label: "Sin tarjeta" },
  { key: "payOnDelivery", label: "Pagás al recibir" },
  { key: "bigAmounts",    label: "Montos grandes" },
  { key: "noFee",         label: "Sin comisión" },
];

const MATRIX: Array<{ id: string; name: string } & Record<Feature["key"], boolean>> = [
  { id: "yape",          name: "Yape",          instant: true,  noCard: true,  payOnDelivery: false, bigAmounts: false, noFee: true  },
  { id: "plin",          name: "Plin",          instant: true,  noCard: true,  payOnDelivery: false, bigAmounts: false, noFee: true  },
  { id: "efectivo",      name: "Efectivo",      instant: false, noCard: true,  payOnDelivery: true,  bigAmounts: true,  noFee: true  },
  { id: "transferencia", name: "Transferencia", instant: false, noCard: true,  payOnDelivery: false, bigAmounts: true,  noFee: true  },
  { id: "tarjeta",       name: "Tarjeta",       instant: true,  noCard: false, payOnDelivery: false, bigAmounts: true,  noFee: false },
];

const YAPE_STEPS = [
  { icon: Wallet,     n: 1, t: "Elegí Yape",  d: "Al confirmar el pedido" },
  { icon: QrCode,     n: 2, t: "Escaneá QR",  d: "O copiá el número" },
  { icon: Smartphone, n: 3, t: "Yapeá",       d: "El monto exacto" },
  { icon: Check,      n: 4, t: "Listo",       d: "La bodega empaca" },
];

const FAQ = [
  { q: "¿La bodega cobra comisión por usar Yape?", a: "No. Pagás exactamente lo que ves en el carrito — ni un sol más." },
  { q: "¿Puedo cambiar el método de pago después de pedir?", a: "Sí, mientras la bodega no haya despachado. Avisá por el chat del pedido." },
  { q: "¿Y si pago en efectivo y no tengo el monto exacto?", a: "Indicás con cuánto pagás (ej. 'con S/100') y la bodega prepara tu vuelto." },
  { q: "¿Mi tarjeta queda guardada en Buleje?", a: "Solo si lo pedís. Stripe y Mercado Pago tokenizan cada cobro; Buleje nunca ve el número completo." },
  { q: "¿Qué hago si mi Yape no aparece en la bodega?", a: "Puede tardar hasta 30s. Si pasa de 1 minuto, enviá el comprobante por WhatsApp a la bodega." },
  { q: "¿Aceptan Yape de empresa?", a: "Sí. Poné tu RUC en la nota del pedido para que te emitan factura electrónica." },
];

// ── Sub-componentes ───────────────────────────────────────────────────────

// Mismo kicker que /negocios: text-xs font-bold + dash teal.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
      <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
      {children}
    </p>
  );
}

// Clases de titulo identicas a /negocios (sin font-display, clamp grande).
const H2_CLS =
  "text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.03em] text-[var(--text-primary)] leading-[1.05]";

function MethodCard({ method }: { method: Method }) {
  const Icon = method.icon;
  return (
    <article className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 flex flex-col gap-4 transition-all hover:border-[var(--accent)]/40 hover:shadow-md">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {method.eyebrow}
          </p>
          <h3 className="font-display text-lg font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
            {method.title}
          </h3>
        </div>
      </header>

      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {method.description}
      </p>

      <ol className="grid grid-cols-2 gap-2">
        {method.steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span
              aria-hidden
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[length:var(--ts-2xs)] font-extrabold tabular-nums"
            >
              {i + 1}
            </span>
            <span className="leading-snug">{s}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}

// ── Pagina ─────────────────────────────────────────────────────────────────

export default function ComoPagarClient() {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ════════════════════════ HERO ════════════════════════ */}
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-10">
        <Eyebrow>Pagás como prefieras</Eyebrow>
        <h1 className="text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] leading-[0.98] text-[var(--text-primary)] max-w-3xl">
          5 formas de pagar.{" "}
          <span className="italic font-serif text-[var(--accent)]">Vos elegís.</span>
        </h1>
        <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          Sin tarjeta obligatoria ni trámites. Si nunca compraste online,
          también funciona: pagás en efectivo al recibir.
        </p>

        {/* Trust chips compactos */}
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { icon: Zap, label: "87% paga con Yape" },
            { icon: ShieldCheck, label: "Datos cifrados" },
            { icon: Truck, label: "Pagás al recibir" },
            { icon: Receipt, label: "Boleta o factura" },
          ].map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)]"
            >
              <c.icon className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.75} />
              {c.label}
            </span>
          ))}
        </div>
      </section>

      {/* ════════════════════════ YAPE (card limpia) ════════════════════════ */}
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-9">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-7">
            <div className="max-w-2xl">
              <Eyebrow>El más usado en Pucallpa</Eyebrow>
              <h2 className={H2_CLS}>
                Yape: <span className="italic font-serif text-[var(--accent)]">instantáneo</span> y sin comisión.
              </h2>
              <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed">
                Escaneás el QR de la bodega y ponés tu huella. La bodega ve el pago
                en segundos y empieza a empacar.
              </p>
            </div>
            <Link
              href="/tiendas"
              className="shrink-0 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-5 py-3 text-sm font-extrabold hover:bg-[var(--accent)]/90 transition-colors shadow-sm"
            >
              Probar ahora
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>

          {/* 4 pasos limpios */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {YAPE_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.n}
                  className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4"
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white text-[length:var(--ts-xs)] font-extrabold tabular-nums">
                      {step.n}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">{step.t}</p>
                  <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-snug">{step.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════════════════ TABLA COMPARATIVA ════════════════════════ */}
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="mb-6 max-w-2xl">
          <Eyebrow>En 1 vistazo</Eyebrow>
          <h2 className={H2_CLS}>
            ¿Cuál te <span className="italic font-serif text-[var(--accent)]">conviene?</span>
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--rule-soft)]">
                <th className="sticky left-0 bg-[var(--surface-raised)] px-4 sm:px-5 py-4 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Método
                </th>
                {FEATURES.map((f) => (
                  <th
                    key={f.key}
                    className="px-3 py-4 text-center text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row, idx) => (
                <tr key={row.id} className={idx % 2 === 1 ? "bg-[var(--surface-sunken)]/40" : ""}>
                  <th
                    scope="row"
                    className="sticky left-0 bg-inherit px-4 sm:px-5 py-4 font-extrabold text-[var(--text-primary)] whitespace-nowrap"
                  >
                    {row.id === "yape" && (
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] mr-2" aria-hidden />
                    )}
                    {row.name}
                  </th>
                  {FEATURES.map((f) => (
                    <td key={f.key} className="px-3 py-4 text-center">
                      {row[f.key] ? (
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-600,#059669)] dark:bg-emerald-950/40 dark:text-emerald-400"
                          aria-label="Sí"
                        >
                          <Check className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                        </span>
                      ) : (
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                          aria-label="No"
                        >
                          <span className="h-0.5 w-3 rounded-full bg-[var(--rule-mid)]" aria-hidden />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          <strong className="text-[var(--text-secondary)]">Tip:</strong> pedidos chicos del barrio, Yape o efectivo. Pedidos grandes, transferencia.
        </p>
      </section>

      {/* ════════════════════════ OTROS METODOS ════════════════════════ */}
      <section id="metodos" className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 scroll-mt-24">
        <div className="mb-6 max-w-2xl">
          <Eyebrow>Otros métodos</Eyebrow>
          <h2 className={H2_CLS}>
            Si Yape no te queda, hay{" "}
            <span className="italic font-serif text-[var(--accent)]">4 maneras más.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {OTHER_METHODS.map((m) => (
            <MethodCard key={m.id} method={m} />
          ))}
        </div>
      </section>

      {/* ════════════════════════ FAQ ════════════════════════ */}
      <section className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <Eyebrow>Dudas frecuentes</Eyebrow>
          <h2 className={`${H2_CLS} mb-7`}>
            Preguntas frecuentes
          </h2>

          <div className="space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5 [&[open]_svg]:rotate-90 transition-shadow open:shadow-md open:border-[var(--accent)]/30"
              >
                <summary className="flex items-start justify-between gap-4 cursor-pointer list-none font-bold text-[var(--text-primary)]">
                  <span>{f.q}</span>
                  <ArrowRight
                    className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)]"
                    strokeWidth={2}
                  />
                </summary>
                <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════ CTA FINAL (estilo /negocios) ════════════════════════ */}
      <section className="relative overflow-hidden py-16 sm:py-24 bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)]">
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[480px] w-[480px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
        />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <Eyebrow>Empezá hoy</Eyebrow>
          <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-extrabold tracking-[-0.035em] leading-[0.95] text-[var(--text-primary)]">
            Ya sabés cómo pagar.{" "}
            <span className="italic font-serif text-[var(--accent)]">Falta sólo el pedido.</span>
          </h2>
          <p className="mt-5 text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
            Mirá las bodegas que están entregando hoy y armá tu primer pedido.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/tiendas"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-extrabold text-white hover:bg-[var(--accent)]/90 transition-colors shadow-lg shadow-[var(--accent)]/30"
            >
              Ver bodegas activas
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <Link
              href="/marketplace/ofertas"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-6 py-3.5 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Ver ofertas del día
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
