"use client";

/**
 * ComoPagarClient — Pagina informativa de metodos de pago.
 *
 * Estructura (v2 - rediseno mayo 2026):
 *   1. Hero con social proof (87% paga con Yape, <30s, cifrado)
 *   2. Featured Yape — card grande con QR mockup + 4 pasos visuales
 *   3. Tabla comparativa — "¿Cual me conviene?" en 1 vistazo
 *   4. Grid de otros metodos (Plin, Efectivo, Transferencia, Tarjeta)
 *   5. "Primera vez con Yape?" — tutorial de activacion
 *   6. FAQ categorizado
 *   7. CTA final con copy concreto
 *
 * Sin mocks de pago: solo metodos REALES que la app soporta hoy.
 * Tono: Feynman, lenguaje Pucallpa, sin jerga, sin emojis decorativos.
 */

import Link from "next/link";
import {
  Smartphone,
  Banknote,
  Building2,
  Truck,
  CreditCard,
  ShieldCheck,
  ArrowRight,
  Check,
  Clock,
  Zap,
  QrCode,
  Sparkles,
  Receipt,
  Wallet,
  Users,
} from "@buleje/design-system/icons";

// ── Metodos secundarios (Yape va destacado en su propia seccion) ──────────
type Method = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  steps: string[];
  icon: typeof Smartphone;
  variant: "ink" | "soft" | "warm";
};

const OTHER_METHODS: Method[] = [
  {
    id: "efectivo",
    eyebrow: "Paga al recibir",
    title: "Efectivo",
    description:
      "Le pagas al motorizado cuando llega a tu puerta. Si necesitas vuelto, lo indicas al confirmar y la bodega prepara el cambio exacto.",
    steps: [
      "Pide normalmente desde la app",
      "Elige 'Efectivo' al confirmar",
      "Indica si necesitas vuelto",
      "Paga al motorizado al recibir",
    ],
    icon: Banknote,
    variant: "ink",
  },
  {
    id: "plin",
    eyebrow: "Alternativa rapida",
    title: "Plin",
    description:
      "Si tu banco es BCP, Interbank, BBVA o Scotiabank, podes pagar desde la app de tu banco. Funciona igual que Yape: solo necesitas el numero de la bodega.",
    steps: [
      "Elige Plin en el checkout",
      "Busca el numero de la bodega",
      "Envia el pago desde tu app bancaria",
      "Confirma con la bodega",
    ],
    icon: Smartphone,
    variant: "soft",
  },
  {
    id: "transferencia",
    eyebrow: "Pedidos grandes",
    title: "Transferencia bancaria",
    description:
      "Ideal cuando el pedido pasa los S/500 o es mayorista. La bodega te comparte su numero de cuenta o CCI y confirma apenas recibe el deposito.",
    steps: [
      "Avisa a la bodega por WhatsApp",
      "Recibe los datos de cuenta (CCI)",
      "Transfiere desde tu app bancaria",
      "Envia el voucher para confirmar",
    ],
    icon: Building2,
    variant: "warm",
  },
  {
    id: "tarjeta",
    eyebrow: "Online seguro",
    title: "Tarjeta (Visa / Mastercard)",
    description:
      "Disponible en planes Buleje y en tiendas que activaron pagos online. Procesado por Stripe y Mercado Pago — la bodega nunca ve tus datos completos.",
    steps: [
      "Elige 'Tarjeta' al confirmar",
      "Carga los datos en el formulario seguro",
      "Confirma con el OTP de tu banco",
      "Recibi el comprobante por email",
    ],
    icon: CreditCard,
    variant: "soft",
  },
];

// ── Tabla comparativa: las 5 dimensiones que importan ─────────────────────
type Feature = {
  key: "instant" | "noCard" | "payOnDelivery" | "bigAmounts" | "noFee";
  label: string;
};

const FEATURES: Feature[] = [
  { key: "instant",       label: "Instantaneo" },
  { key: "noCard",        label: "Sin tarjeta" },
  { key: "payOnDelivery", label: "Pagas al recibir" },
  { key: "bigAmounts",    label: "Montos grandes (>S/500)" },
  { key: "noFee",         label: "Sin comision" },
];

const MATRIX: Array<{ id: string; name: string } & Record<Feature["key"], boolean>> = [
  { id: "yape",          name: "Yape",          instant: true,  noCard: true,  payOnDelivery: false, bigAmounts: false, noFee: true  },
  { id: "plin",          name: "Plin",          instant: true,  noCard: true,  payOnDelivery: false, bigAmounts: false, noFee: true  },
  { id: "efectivo",      name: "Efectivo",      instant: false, noCard: true,  payOnDelivery: true,  bigAmounts: true,  noFee: true  },
  { id: "transferencia", name: "Transferencia", instant: false, noCard: true,  payOnDelivery: false, bigAmounts: true,  noFee: true  },
  { id: "tarjeta",       name: "Tarjeta",       instant: true,  noCard: false, payOnDelivery: false, bigAmounts: true,  noFee: false },
];

// ── Sub-componentes ───────────────────────────────────────────────────────

function YapeMockup() {
  // Mockup visual de un pago Yape — no es un QR real, es decorativo.
  return (
    <div className="relative mx-auto w-full max-w-xs aspect-[9/16] rounded-3xl bg-white shadow-2xl shadow-black/30 overflow-hidden border-[10px] border-[var(--text-primary)]">
      {/* Status bar mockup */}
      <div className="absolute inset-x-0 top-0 h-6 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] bg-white">
        9:41
      </div>
      <div className="absolute inset-x-0 top-6 bottom-0 bg-linear-to-b from-violet-600 to-violet-700 px-5 pt-8 pb-6 flex flex-col">
        <p className="text-xs font-bold uppercase tracking-wider text-white/70">
          Buleje · Bodega Yarinacocha
        </p>
        <p className="mt-2 text-3xl font-black text-white tabular-nums leading-tight">
          S/ 24<span className="text-white/60">.50</span>
        </p>
        <p className="mt-1 text-xs text-white/80">
          Pago a comerciante
        </p>

        {/* QR placeholder */}
        <div className="mt-6 mx-auto h-32 w-32 rounded-2xl bg-white p-2 grid grid-cols-7 gap-0.5">
          {Array.from({ length: 49 }).map((_, i) => (
            <span
              key={i}
              className={
                // patron pseudo-aleatorio pero estable
                ((i * 7 + 3) % 5 === 0 || i % 11 === 0 || i % 13 === 0)
                  ? "bg-violet-700 rounded-[1px]"
                  : "bg-transparent"
              }
            />
          ))}
        </div>

        <div className="mt-auto rounded-2xl bg-white/15 backdrop-blur-sm py-3 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-white/80">
            Confirma con tu huella
          </p>
          <p className="mt-0.5 text-sm font-black text-white">
            Yapear S/ 24.50
          </p>
        </div>
      </div>
    </div>
  );
}

function MethodCard({ method }: { method: Method }) {
  const Icon = method.icon;
  const isInk = method.variant === "ink";
  const isWarm = method.variant === "warm";
  return (
    <article
      className={[
        "rounded-2xl border p-6 sm:p-7 flex flex-col gap-4 transition-all hover:shadow-md hover:-translate-y-0.5",
        isInk
          ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-transparent"
          : isWarm
            ? "bg-[var(--accent-soft)] text-[var(--text-primary)] border-[var(--accent)]/20"
            : "bg-[var(--surface-raised)] border-[var(--rule-soft)] text-[var(--text-primary)]",
      ].join(" ")}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className={[
            "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            isInk ? "bg-white/15" : "bg-[var(--accent-soft)] text-[var(--accent)]",
          ].join(" ")}
        >
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={[
              "text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] mb-1",
              isInk ? "opacity-80" : "text-[var(--text-tertiary)]",
            ].join(" ")}
          >
            {method.eyebrow}
          </p>
          <h3 className="font-display text-xl sm:text-2xl font-black tracking-[var(--ls-tight)] leading-tight">
            {method.title}
          </h3>
        </div>
      </header>

      <p
        className={[
          "text-[length:var(--ts-sm)] leading-relaxed",
          isInk ? "text-white/90" : "text-[var(--text-secondary)]",
        ].join(" ")}
      >
        {method.description}
      </p>

      <ol className="space-y-2 text-sm">
        {method.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={[
                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-black tabular-nums",
                isInk
                  ? "bg-white/20 text-white"
                  : "bg-[var(--accent-soft)] text-[var(--accent)]",
              ].join(" ")}
            >
              {i + 1}
            </span>
            <span className={isInk ? "text-white/90" : "text-[var(--text-secondary)]"}>
              {s}
            </span>
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
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-8 sm:pb-10">
        <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-4">
          <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
          Pagas como prefieras
        </p>
        <h1 className="font-display text-[clamp(2.25rem,5.5vw,3.75rem)] font-black tracking-[-0.03em] leading-[0.95] text-[var(--text-primary)] max-w-3xl">
          5 maneras reales de pagar.<br className="hidden sm:block" /> Vos eliges cual.
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-[var(--text-secondary)] leading-[1.4] max-w-2xl">
          Sin tarjeta obligatoria. Sin tramites. Si nunca compraste online,
          tambien funciona — pagas en efectivo al recibir.
        </p>

        {/* Social proof stats */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
          <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-4 py-3.5">
            <p className="font-display text-2xl font-black text-[var(--accent)] tabular-nums leading-none">
              87%
            </p>
            <p className="mt-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
              de pedidos<br />pagados con Yape
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-4 py-3.5">
            <p className="font-display text-2xl font-black text-[var(--text-primary)] tabular-nums leading-none flex items-baseline gap-0.5">
              &lt;30<span className="text-base text-[var(--text-tertiary)]">s</span>
            </p>
            <p className="mt-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
              confirmacion<br />promedio
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-4 py-3.5">
            <p className="font-display text-2xl font-black text-[var(--text-primary)] tabular-nums leading-none">
              0
            </p>
            <p className="mt-1 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
              comisiones<br />ocultas
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)]">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            Datos cifrados
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)]">
            <Truck className="h-3.5 w-3.5" strokeWidth={1.75} />
            Pagas al recibir si queres
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-[var(--surface-raised)] border border-[var(--rule-soft)] text-[var(--text-secondary)]">
            <Receipt className="h-3.5 w-3.5" strokeWidth={1.75} />
            Boleta o factura digital
          </span>
        </div>
      </section>

      {/* ════════════════════════ FEATURED YAPE ════════════════════════ */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16">
        <div className="rounded-3xl bg-linear-to-br from-violet-600 via-violet-700 to-purple-800 text-white overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 sm:gap-10 p-6 sm:p-10 md:p-12 items-center">
            {/* Texto + pasos */}
            <div className="md:col-span-3 order-2 md:order-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 mb-4">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)]">
                  El mas usado en Pucallpa
                </span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black leading-[0.95] tracking-[-0.02em]">
                Yape. Instantaneo, sin comision, desde tu celular.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-white/85 leading-relaxed max-w-xl">
                Si ya tenes Yape activo, pagar es escanear el QR de la bodega
                y poner tu huella. La bodega ve el pago en segundos y empieza
                a empacar.
              </p>

              {/* 4 pasos en grid */}
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: Wallet,     n: 1, t: "Elegi Yape", d: "Al confirmar el pedido" },
                  { icon: QrCode,     n: 2, t: "Escanea QR",  d: "O copia el numero" },
                  { icon: Smartphone, n: 3, t: "Yapea",       d: "Monto exacto" },
                  { icon: Check,      n: 4, t: "Listo",       d: "La bodega empaca" },
                ].map((step) => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.n}
                      className="rounded-2xl bg-white/10 backdrop-blur p-4 border border-white/15"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-[length:var(--ts-xs)] font-black tabular-nums">
                          {step.n}
                        </span>
                        <Icon className="h-4 w-4 text-white/70" strokeWidth={1.75} />
                      </div>
                      <p className="text-sm font-black leading-tight">{step.t}</p>
                      <p className="mt-0.5 text-[length:var(--ts-xs)] text-white/70 leading-snug">
                        {step.d}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Trust badges + CTA */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-xs font-bold">
                  <Zap className="h-3.5 w-3.5" strokeWidth={2} />
                  Sin comision para ti
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1.5 text-xs font-bold">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                  Auditado por BCP
                </span>
                <Link
                  href="/tiendas"
                  className="ml-auto inline-flex items-center gap-2 rounded-full bg-white text-violet-700 px-5 py-2.5 text-sm font-black hover:bg-white/95 transition-colors"
                >
                  Probar ahora
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
              </div>
            </div>

            {/* Mockup */}
            <div className="md:col-span-2 order-1 md:order-2 flex justify-center">
              <YapeMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════ TABLA COMPARATIVA ════════════════════════ */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16">
        <div className="mb-6 sm:mb-8 max-w-2xl">
          <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            En 1 vistazo
          </p>
          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            ¿Cual te conviene?
          </h2>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Compara las 5 opciones segun lo que necesitas hoy.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="border-b border-[var(--rule-soft)]">
                <th className="sticky left-0 bg-[var(--surface-raised)] px-4 sm:px-5 py-4 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Metodo
                </th>
                {FEATURES.map((f) => (
                  <th
                    key={f.key}
                    className="px-3 py-4 text-center text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row, idx) => (
                <tr
                  key={row.id}
                  className={
                    idx % 2 === 1
                      ? "bg-[var(--surface-sunken)]/40"
                      : ""
                  }
                >
                  <th
                    scope="row"
                    className="sticky left-0 bg-inherit px-4 sm:px-5 py-4 font-black text-[var(--text-primary)] whitespace-nowrap"
                  >
                    {row.id === "yape" && (
                      <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] mr-2" aria-hidden />
                    )}
                    {row.name}
                  </th>
                  {FEATURES.map((f) => {
                    const val = row[f.key];
                    return (
                      <td key={f.key} className="px-3 py-4 text-center">
                        {val ? (
                          <span
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-600,#059669)] dark:bg-emerald-950/40 dark:text-emerald-400"
                            aria-label="Si"
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
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          <strong className="text-[var(--text-secondary)]">Tip:</strong>{" "}
          Para pedidos chicos del barrio, Yape o efectivo. Para pedidos grandes
          de tu negocio, transferencia.
        </p>
      </section>

      {/* ════════════════════════ OTROS METODOS ════════════════════════ */}
      <section id="metodos" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 sm:pb-16 scroll-mt-24">
        <div className="mb-6 sm:mb-8 max-w-2xl">
          <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Otros metodos
          </p>
          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Si Yape no te queda, hay 4 maneras mas.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {OTHER_METHODS.map((m) => (
            <MethodCard key={m.id} method={m} />
          ))}
        </div>
      </section>

      {/* ════════════════════════ PRIMERA VEZ ════════════════════════ */}
      <section className="bg-[var(--surface-sunken)]/60 border-y border-[var(--rule-soft)]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            <div className="md:col-span-1">
              <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
                ¿Es tu primera vez?
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight">
                No tienes Yape todavia?
              </h2>
              <p className="mt-3 text-base text-[var(--text-secondary)] leading-relaxed">
                Te lleva 5 minutos activarlo desde tu celular. Solo necesitas
                tu DNI y un numero de celular activo. Funciona con cualquier
                banco peruano.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-3 py-1.5 text-xs font-extrabold">
                <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                5 minutos
              </div>
            </div>

            <ol className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  n: 1,
                  t: "Descarga la app",
                  d: "Busca 'Yape' en la Play Store o App Store y la instalas.",
                },
                {
                  n: 2,
                  t: "Registra tu DNI",
                  d: "Toma foto de tu DNI por ambos lados y un selfie de validacion.",
                },
                {
                  n: 3,
                  t: "Vincula tu cuenta",
                  d: "Conecta tu banco (BCP, Interbank, BBVA, etc) o usa la billetera Yape directa.",
                },
                {
                  n: 4,
                  t: "Listo, ya podes yapear",
                  d: "Tu numero de celular es tu Yape. Ya puedes pagar en cualquier bodega de Buleje.",
                },
              ].map((step) => (
                <li
                  key={step.n}
                  className="rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white text-sm font-black tabular-nums">
                      {step.n}
                    </span>
                  </div>
                  <p className="font-black text-base text-[var(--text-primary)] leading-tight">
                    {step.t}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                    {step.d}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ════════════════════════ FAQ AMPLIADO ════════════════════════ */}
      <section className="py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
            Te aclaramos todas las dudas
          </p>
          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] mb-8">
            Preguntas frecuentes
          </h2>

          <div className="space-y-3">
            {[
              {
                q: "¿La bodega cobra comision por usar Yape?",
                a: "No. Yape es gratis para vos y para la bodega. El monto que ves en el carrito es exactamente lo que pagas — ni un sol mas.",
              },
              {
                q: "¿Puedo cambiar el metodo de pago si ya hice el pedido?",
                a: "Si, mientras la bodega no haya despachado el pedido. Le avisas por WhatsApp o desde el chat del pedido y te ayudan a cambiarlo en segundos.",
              },
              {
                q: "¿Que pasa si pago en efectivo y no tengo el monto exacto?",
                a: "Al confirmar el pedido indicas cuanto vas a entregar (ej. 'Pago con S/100') y la bodega te prepara el vuelto exacto en billetes y monedas. Sin sorpresas.",
              },
              {
                q: "¿Mi tarjeta queda guardada en Buleje?",
                a: "Solo si vos lo pedis explicitamente. Por defecto, los datos no se guardan — Stripe y Mercado Pago tokenizan cada cobro y Buleje nunca ve el numero completo.",
              },
              {
                q: "¿Que hago si mi Yape no aparece en la bodega?",
                a: "El sistema puede tardar hasta 30 segundos en confirmarte. Si pasa de 1 minuto, le envias el screenshot del comprobante de Yape al WhatsApp de la bodega y resuelven al toque.",
              },
              {
                q: "¿Aceptan Yape de empresa o solo personal?",
                a: "Las bodegas aceptan ambos. Si pagas con Yape Empresa, indica en la nota del pedido el RUC para que la bodega te emita factura electronica.",
              },
              {
                q: "¿Puedo dividir el pago entre 2 metodos?",
                a: "Hoy no. Cada pedido se paga con un solo metodo. Si necesitas pagar parte con Yape y parte con efectivo, escribile a la bodega antes del pedido.",
              },
              {
                q: "¿Que pasa si el motorizado se va con mi dinero antes de entregar?",
                a: "Tranqui — el motorizado es empleado/contratado de la bodega y firma recibir el monto. Si hay problema con el delivery, la bodega responde por el pedido completo.",
              },
            ].map((f) => (
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

      {/* ════════════════════════ CTA BOTTOM ════════════════════════ */}
      <section className="bg-[var(--text-primary)] text-[var(--surface-canvas)]">
        <div className="max-w-3xl mx-auto px-4 py-16 sm:py-20 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-white/90 mb-5">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            Bodegas activas en Pucallpa
          </span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black tracking-[-0.02em] leading-tight">
            Ya sabes como pagar. Falta solo el pedido.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-white/70 max-w-xl mx-auto">
            Mira las bodegas que ya estan delivereando hoy y arma tu primer
            pedido. Pagas como prefieras al final.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/tiendas"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-black text-white hover:bg-[var(--accent)]/90 transition-colors shadow-lg shadow-[var(--accent)]/30"
            >
              Ver bodegas activas
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <Link
              href="/marketplace/ofertas"
              className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-6 py-3.5 text-sm font-black text-white hover:bg-white/10 transition-colors"
            >
              Ver ofertas del dia
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
