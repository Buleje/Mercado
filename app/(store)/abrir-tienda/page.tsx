import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Store,
  ChevronDown,
  ArrowUpRight,
  Check,
  Minus,
  Receipt,
  CreditCard,
  ShieldCheck,
  Download,
  Database,
  RefreshCcw,
  Sparkles,
} from "@buleje/design-system/icons";

// LandingHeader + Footer removidos — chrome unificado vive en
// app/(store)/layout.tsx (mismo nav que /tiendas y /marketplace).
// RoiCalculator REMOVIDO (Brandon mayo 2026): prometía cifras que no
// se pueden garantizar. Reemplazado por HowItChanges — comparación
// concreta del día a día sin uplifts mágicos.
const HowItChanges = dynamic(
  () => import("@/components/landing/abrir-tienda/HowItChanges"),
  { loading: () => <SectionSkeleton h="600px" /> },
);
const BenefitsTabs = dynamic(
  () => import("@/components/landing/abrir-tienda/BenefitsTabs"),
  { loading: () => <SectionSkeleton h="600px" /> },
);
const PlansToggle = dynamic(
  () => import("@/components/landing/abrir-tienda/PlansToggle"),
  { loading: () => <SectionSkeleton h="700px" /> },
);
const LiveSignupTicker = dynamic(
  () => import("@/components/landing/abrir-tienda/LiveSignupTicker"),
);
const BodegaScene = dynamic(
  () => import("@/components/landing/abrir-tienda/BodegaScene"),
);

export const metadata: Metadata = {
  title: "Activa tu tienda online — Plataforma todo-en-uno",
  description:
    "Más clientes, más pedidos, cero tecnología. Plan Estándar con primer mes gratis · Sin tarjeta · Sin contrato. Cancelás cuando quieras.",
  alternates: { canonical: "/abrir-tienda" },
  openGraph: {
    title: "Activa tu tienda online",
    description:
      "Plataforma todo-en-uno para que tu negocio venda online en 5 minutos.",
    type: "website",
  },
};

const FAQS = [
  {
    q: "¿Cuánto tarda el setup?",
    a: "5 minutos. Subís logo, catálogo y horarios. Te ayudamos por WhatsApp si quieres.",
  },
  {
    q: "¿Puedo cambiar de plan después?",
    a: "Sí. Subís o bajás de plan cuando quieras. Los cambios se aplican al siguiente ciclo de facturación.",
  },
  {
    q: "¿Hay contrato o permanencia mínima?",
    a: "No. Todos los planes son sin permanencia. Cancelás con un click cuando quieras.",
  },
  {
    q: "¿Necesito tarjeta de crédito para registrarme?",
    a: "No. Empezás con Yape o efectivo y migrás a tarjeta cuando quieras.",
  },
  {
    q: "¿Qué pasa con mis datos si dejo de usarlo?",
    a: "Te llevás todo exportado en CSV: clientes, pedidos, productos, reportes. Tus datos son tuyos.",
  },
  {
    q: "¿Tienen soporte humano?",
    a: "Sí. Respondemos en menos de 2 horas por WhatsApp. Sin bots, sin formularios. Personas reales.",
  },
  {
    q: "¿Buleje cobra comisión por cada venta?",
    a: "No. 0% de comisión. El dinero llega directo a tu Yape, tu cuenta o tu caja. Solo pagás el plan mensual, sin sorpresas.",
  },
  {
    q: "¿Mis clientes necesitan instalar una app?",
    a: "No. Tus clientes te compran desde el navegador con un link — no descargan nada. Vos manejás tu tienda desde el celular o la compu.",
  },
  {
    q: "¿Funciona si no sé nada de tecnología?",
    a: "Sí. Si sabés usar WhatsApp, sabés usar Buleje. Y en el Plan Fundador hacemos el setup 1-a-1 contigo por videollamada.",
  },
  {
    q: "¿Puedo usar mi propia marca y dominio?",
    a: "Sí. Tu tienda lleva tu logo, tus colores y tu nombre. Desde el plan Starter podés conectar tu propio dominio.",
  },
];

// ── Comparativa honesta — Buleje vs el cuaderno vs un POS caro ──
type Cell = boolean | string;
const COMPARE: { f: string; cuaderno: Cell; pos: Cell; buleje: Cell }[] = [
  { f: "Ventas registradas solas", cuaderno: false, pos: true, buleje: true },
  { f: "Stock en tiempo real", cuaderno: false, pos: true, buleje: true },
  { f: "Cobrás con Yape / Plin", cuaderno: true, pos: false, buleje: true },
  { f: "Boletas y facturas SUNAT", cuaderno: false, pos: true, buleje: true },
  { f: "Pedidos por WhatsApp + delivery", cuaderno: false, pos: false, buleje: true },
  { f: "Reportes del día al instante", cuaderno: false, pos: true, buleje: true },
  { f: "Funciona desde el celular", cuaderno: true, pos: false, buleje: true },
  { f: "Sin instalación ni técnico", cuaderno: true, pos: false, buleje: true },
  { f: "Costo", cuaderno: "Tu tiempo y tu plata", pos: "S/ 300+/mes + instalación", buleje: "Desde S/ 0 · sin tarjeta" },
];

// ── Garantías de confianza ──
const GUARANTEES = [
  { icon: RefreshCcw, t: "Sin permanencia", d: "Cancelás con un click cuando quieras. Sin contratos ni letra chica." },
  { icon: Download, t: "Tus datos son tuyos", d: "Exportás todo en CSV — clientes, ventas, productos — cuando quieras." },
  { icon: Database, t: "Backups diarios", d: "Tu información respaldada cada día. Nunca perdés tu historial." },
  { icon: ShieldCheck, t: "Protección Ley 29733", d: "Cumplimos la ley peruana de protección de datos personales." },
];

function SectionSkeleton({ h = "400px" }: { h?: string }) {
  return (
    <div
      aria-hidden
      style={{ height: h }}
      className="bg-[var(--surface-sunken)] animate-pulse"
    />
  );
}

// ── Integraciones — marquee animado con logos reales (Simple Icons CDN) ──
// Brandon 2026-05-27: mas impacto + movimiento. Logos de marca via
// cdn.simpleicons.org (los que existen) + marcas de color para los peruanos
// (Yape, Plin) y SUNAT. Loop infinito con la utility .marquee de globals.css.
type LogoItem =
  | { kind: "img"; src: string; name: string }
  | { kind: "mark"; mark: string; name: string; color: string }
  | { kind: "text"; name: string };

const INTEGRATION_LOGOS: LogoItem[] = [
  { kind: "mark", mark: "Y", name: "Yape", color: "#722EAB" },
  { kind: "mark", mark: "P", name: "Plin", color: "#00BFB3" },
  { kind: "img", src: "https://cdn.simpleicons.org/whatsapp", name: "WhatsApp" },
  { kind: "img", src: "https://cdn.simpleicons.org/mercadopago", name: "Mercado Pago" },
  { kind: "img", src: "https://cdn.simpleicons.org/stripe", name: "Stripe" },
  { kind: "img", src: "https://cdn.simpleicons.org/visa", name: "Visa" },
  { kind: "img", src: "https://cdn.simpleicons.org/mastercard", name: "Mastercard" },
  { kind: "text", name: "SUNAT" },
];

// Nodo del hub de red — tile flotante con el logo (nombre en title/aria).
// Yape/Plin usan su wordmark de marca (lee como logo real).
function NodeTile({ item }: { item: LogoItem }) {
  return (
    <div
      title={item.name}
      aria-label={item.name}
      className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-[1.25rem] border border-[var(--rule-base)] shadow-[var(--shadow-xl)] ring-1 ring-black/5 transition-transform duration-300 hover:scale-110"
      style={item.kind === "img" ? { background: "#ffffff" } : item.kind === "mark" ? { background: item.color } : undefined}
    >
      {item.kind === "img" ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo de marca via CDN
        <img src={item.src} alt={`Logo ${item.name}`} width={40} height={40} loading="lazy" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
      ) : item.kind === "mark" ? (
        <span aria-hidden className="text-white text-sm sm:text-base font-black tracking-tight">{item.name}</span>
      ) : (
        <span aria-hidden className="inline-flex h-full w-full items-center justify-center rounded-[1.25rem] bg-[var(--accent-soft)] text-[var(--accent)]">
          <Receipt className="h-7 w-7 sm:h-9 sm:w-9" strokeWidth={2} />
        </span>
      )}
    </div>
  );
}

// Un anillo de nodos que orbita. Cada nodo se posiciona en su angulo y
// contra-gira para mantenerse derecho respecto al viewport.
// Posiciones de cada logo en el viewBox 1000x600 (centro = 500,300).
// Constelacion balanceada alrededor del hub Buleje.
const NET_POS: Record<string, { x: number; y: number }> = {
  Stripe: { x: 500, y: 78 },
  WhatsApp: { x: 175, y: 158 },
  "Mercado Pago": { x: 825, y: 158 },
  Yape: { x: 108, y: 348 },
  Visa: { x: 892, y: 348 },
  Plin: { x: 268, y: 524 },
  SUNAT: { x: 500, y: 552 },
  Mastercard: { x: 732, y: 524 },
};
const NET_CX = 500;
const NET_CY = 300;

function NetworkHub() {
  return (
    <div className="net-hub relative mx-auto w-full max-w-4xl aspect-[5/3]">
      {/* Glow de marca detras del hub */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 sm:h-80 sm:w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]/20 blur-3xl"
      />

      {/* SVG: lineas de conexion (wire base + pulso animado con glow) */}
      <svg
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {INTEGRATION_LOGOS.map((item) => {
          const p = NET_POS[item.name];
          if (!p) return null;
          return (
            <g key={item.name}>
              <line x1={p.x} y1={p.y} x2={NET_CX} y2={NET_CY} stroke="var(--accent)" strokeWidth={3} strokeOpacity={0.28} />
              <line x1={p.x} y1={p.y} x2={NET_CX} y2={NET_CY} stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" className="net-line" strokeOpacity={0.95} />
            </g>
          );
        })}
      </svg>

      {/* Nodos de logos */}
      {INTEGRATION_LOGOS.map((item, i) => {
        const p = NET_POS[item.name];
        if (!p) return null;
        return (
          <div
            key={item.name}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(p.x / 1000) * 100}%`, top: `${(p.y / 600) * 100}%` }}
          >
            <div className="net-float" style={{ animationDelay: `${i * 0.45}s` }}>
              <NodeTile item={item} />
            </div>
          </div>
        );
      })}

      {/* Hub central — Buleje */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <span aria-hidden className="absolute inset-0 -m-3 rounded-full bg-[var(--accent)]/25 animate-ping" />
        <span aria-hidden className="absolute inset-0 -m-1.5 rounded-full ring-2 ring-[var(--accent)]/30" />
        <div className="relative flex h-24 w-24 sm:h-32 sm:w-32 flex-col items-center justify-center rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] text-white shadow-[var(--shadow-xl)] shadow-[var(--accent)]/50 ring-4 ring-[var(--surface-raised)]">
          <span className="text-4xl sm:text-5xl font-black leading-none">b</span>
          <span className="mt-1 text-[length:var(--ts-2xs)] sm:text-xs font-extrabold uppercase tracking-[0.18em] opacity-90">Buleje</span>
        </div>
      </div>
    </div>
  );
}

function IntegrationsStrip() {
  return (
    <section className="py-16 sm:py-24 bg-[var(--surface-raised)] border-b border-[var(--rule-soft)] overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 text-center mb-8 sm:mb-12">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-5">
          <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
          Sin instalar nada
        </p>
        <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[1.02] max-w-2xl mx-auto">
          Todo lo que tu negocio usa,{" "}
          <span className="italic font-serif text-[var(--accent)]">conectado a Buleje.</span>
        </h2>
        <p className="mt-4 text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
          Yape, Plin, WhatsApp, SUNAT y las tarjetas — ya integrados. No instalás
          nada, no contratás a nadie.
        </p>
      </div>

      <NetworkHub />
    </section>
  );
}

// ── Comparativa honesta ──
function CompareCell({ value, accent = false }: { value: Cell; accent?: boolean }) {
  if (typeof value === "string") {
    return (
      <span className={`text-[length:var(--ts-xs)] font-extrabold ${accent ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
        {value}
      </span>
    );
  }
  return value ? (
    <span
      className={
        accent
          ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white shadow-sm shadow-[var(--accent)]/30"
          : "inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-600,#059669)] dark:bg-emerald-950/40 dark:text-emerald-400"
      }
      aria-label="Sí"
    >
      <Check className={accent ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2.75} aria-hidden />
    </span>
  ) : (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" aria-label="No">
      <Minus className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
    </span>
  );
}

function CompareSection() {
  const lastIdx = COMPARE.length - 1;
  // Marco teal continuo en la columna Buleje (destacada como ganadora).
  const bjCell = "relative bg-[var(--accent-soft)] border-x-2 border-[var(--accent)]/35";
  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            Por qué Buleje
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
            Toda la potencia,{" "}
            <span className="italic font-serif text-[var(--accent)]">sin el costo de siempre.</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Lo que un sistema caro cobra cada mes — y lo que el cuaderno nunca
            te dio — en una sola app que arranca gratis.
          </p>
        </div>

        <div className="overflow-x-auto pt-3">
          <table className="w-full text-left min-w-[680px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="px-5 py-4 align-bottom text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Lo que necesitás
                </th>
                <th className="px-3 py-4 align-bottom text-center text-sm font-extrabold text-[var(--text-secondary)]">El cuaderno</th>
                <th className="px-3 py-4 align-bottom text-center text-sm font-extrabold text-[var(--text-secondary)]">POS caro</th>
                {/* Buleje — encabezado destacado (tope del marco teal) */}
                <th className="px-3 pb-4 text-center border-x-2 border-t-2 border-[var(--accent)]/35 rounded-t-2xl bg-[var(--accent-soft)]">
                  <span className="inline-flex flex-col items-center gap-1 pt-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-3 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shadow-sm shadow-[var(--accent)]/30">
                      <Sparkles className="h-3 w-3" strokeWidth={2.5} /> Recomendado
                    </span>
                    <span className="text-base font-black text-[var(--accent)]">Buleje</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row, idx) => {
                const isLast = idx === lastIdx;
                return (
                  <tr key={row.f}>
                    <th scope="row" className={`px-5 py-3.5 font-bold text-sm text-[var(--text-primary)] ${idx % 2 === 1 ? "bg-[var(--surface-sunken)]/40" : ""} ${isLast ? "rounded-bl-2xl" : ""}`}>
                      {row.f}
                    </th>
                    <td className={`px-3 py-3.5 text-center ${idx % 2 === 1 ? "bg-[var(--surface-sunken)]/40" : ""}`}>
                      <CompareCell value={row.cuaderno} />
                    </td>
                    <td className={`px-3 py-3.5 text-center ${idx % 2 === 1 ? "bg-[var(--surface-sunken)]/40" : ""}`}>
                      <CompareCell value={row.pos} />
                    </td>
                    <td className={`px-3 py-3.5 text-center ${bjCell} ${isLast ? "border-b-2 rounded-b-2xl" : ""}`}>
                      <CompareCell value={row.buleje} accent />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* CTA tras la comparativa */}
        <div className="mt-10 text-center">
          <Link
            href="/marketplace/registrar"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
          >
            Empezar gratis con Buleje
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Garantías / confianza ──
function GuaranteeSection() {
  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            Sin riesgo
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
            Probás tranquilo.{" "}
            <span className="italic font-serif text-[var(--accent)]">Sin letra chica.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GUARANTEES.map((g) => (
            <div key={g.t} className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6">
              <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
                <g.icon className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <h3 className="text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)] leading-tight">{g.t}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">{g.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Prueba social honesta — Plan Fundador (sin reseñas inventadas) ──
function SocialProofSection() {
  const CUPOS_TOTAL = 10;
  const CUPOS_TOMADOS = 3;
  const libres = CUPOS_TOTAL - CUPOS_TOMADOS;
  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-12 items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-5">
              <span aria-hidden className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Plan Fundador · Pucallpa
            </p>
            <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[1]">
              Sé de los primeros{" "}
              <span className="italic font-serif text-[var(--accent)]">{CUPOS_TOTAL} negocios.</span>
            </h2>
            <p className="mt-4 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-lg">
              Setup 1-a-1, 90 días de acompañamiento por WhatsApp, sesión de fotos
              sin costo y 0% comisión los primeros 90 días.
            </p>
            <div className="mt-7 flex items-center gap-3">
              <div className="flex -space-x-2" aria-hidden>
                {[
                  { l: "D", c: "var(--accent)" },
                  { l: "P", c: "#722EAB" },
                  { l: "L", c: "#f97316" },
                ].map(({ l, c }) => (
                  <span key={l} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white font-extrabold text-sm ring-3 ring-[var(--surface-canvas)]" style={{ background: c }}>
                    {l}
                  </span>
                ))}
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-snug">
                <strong className="font-extrabold text-[var(--text-primary)]">Don Lucho, Pòlleria El Dorado</strong> y otros ya están vendiendo con Buleje.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-7 shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Cupos disponibles</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-50,#fffbeb)] text-[var(--data-warning-700,#b45309)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                <Sparkles className="h-3 w-3" strokeWidth={2.5} /> Limitado
              </span>
            </div>
            <p className="text-5xl font-extrabold tracking-[-0.04em] tabular-nums leading-none mt-1">
              <span className="text-[var(--accent)]">{libres}</span>
              <span className="text-[var(--text-tertiary)] text-2xl font-extrabold ml-1">/ {CUPOS_TOTAL}</span>
            </p>
            <div className="mt-5 h-2.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
              <span className="block h-full rounded-full bg-linear-to-r from-[var(--accent)] to-[var(--accent-600,var(--accent))]" style={{ width: `${(CUPOS_TOMADOS / CUPOS_TOTAL) * 100}%` }} />
            </div>
            <Link
              href="/marketplace/registrar"
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-6 py-3.5 text-sm font-extrabold shadow-md hover:shadow-lg transition-all"
            >
              Reservar mi cupo gratis
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// Brandon 2026-05-20 v5: LandingHeader + Footer removidos. Chrome unificado
// heredado del layout app/(store)/layout.tsx (mismo nav que /tiendas).
export default function AbrirTiendaPage() {
  return (
    <>
      <main id="main-content">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)]">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 -left-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
          />

          <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 lg:pt-28 pb-14 sm:pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-[7fr_5fr] gap-12 lg:gap-16 items-end">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
                  <span
                    aria-hidden
                    className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
                  />
                  <Store className="h-4 w-4" strokeWidth={2} />
                  Plataforma todo-en-uno
                </p>
                {/* H1 reducido: antes clamp(2.75,7.5vw,5.5rem) aplastaba la
                    jerarquía y dejaba el subtítulo sin aire. Bajo a 4rem max. */}
                <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                  Activa tu tienda
                  <br />
                  <span className="text-[var(--accent)]">
                    online en 5 minutos.
                  </span>
                </h1>
                <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-[1.45] max-w-2xl">
                  Catálogo, pagos Yape, delivery y reportes — todo listo para
                  que vendas hoy. Sin código, sin técnicos, sin contratos.
                </p>

                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <Link
                    href="/marketplace/registrar"
                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-8 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
                  >
                    Activar gratis por 1 mes
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={2.5}
                    />
                  </Link>
                  <a
                    href="#planes"
                    className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-8 py-4 text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    Ver planes
                  </a>
                </div>

                <div className="mt-6">
                  <LiveSignupTicker />
                </div>

                {/* Chips de confianza — refuerzan el pitch arriba del fold */}
                <div className="mt-5 flex flex-wrap gap-2">
                  {[
                    { icon: ShieldCheck, label: "0% comisión" },
                    { icon: CreditCard, label: "Sin tarjeta" },
                    { icon: RefreshCcw, label: "Sin permanencia" },
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
              </div>

              {/* Trust illustration — bodega con tecnología vendiendo en vivo.
                  v2 (2026-05-10): antes era un card con 4 stats de texto. Brandon
                  pidió algo "ilustrativo y referencial a la página", al estilo
                  del PhoneMockup del home. BodegaScene muestra una bodega
                  estilizada (toldo, estantes, contador con tablet Buleje
                  ticker en vivo) + las 4 garantías como pills flotando. */}
              <div className="relative">
                <BodegaScene />
              </div>
            </div>
          </div>
        </section>

        {/* ── Integraciones — lo que tu negocio ya usa ───────────────── */}
        <IntegrationsStrip />

        {/* ── Cómo cambia tu día con Buleje (sin promesas mágicas) ──── */}
        <HowItChanges />

        {/* ── Beneficios con tabs interactivas ───────────────────────── */}
        <BenefitsTabs />

        {/* ── Comparativa honesta — Buleje vs cuaderno vs POS caro ───── */}
        <CompareSection />

        {/* ── Plans con toggle mensual/anual ─────────────────────────── */}
        <PlansToggle />

        {/* ── Garantías / confianza ──────────────────────────────────── */}
        <GuaranteeSection />

        {/* ── Prueba social — Plan Fundador ──────────────────────────── */}
        <SocialProofSection />

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 lg:gap-20">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
                <span
                  aria-hidden
                  className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
                />
                Preguntas
              </p>
              <h2 className="text-[clamp(2.25rem,5.5vw,3.75rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                Resuelve tus dudas
                <br />
                <span className="text-[var(--accent)]">
                  antes de empezar.
                </span>
              </h2>
              <p className="mt-6 text-base text-[var(--text-secondary)] leading-relaxed">
                Respuestas directas, sin jerga técnica ni letra chica.
              </p>
            </div>
            <div>
              <ul className="divide-y divide-[var(--rule-soft)] border-y border-[var(--rule-soft)]">
                {FAQS.map((f, idx) => (
                  <li key={f.q}>
                    <details className="group">
                      <summary className="flex cursor-pointer items-start justify-between gap-6 py-6 list-none [&::-webkit-details-marker]:hidden">
                        <span className="flex items-start gap-5">
                          <span className="text-xs font-bold tabular-nums text-[var(--text-tertiary)] uppercase tracking-wider mt-1.5">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="text-lg sm:text-xl font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] group-open:text-[var(--accent)] transition-colors">
                            {f.q}
                          </span>
                        </span>
                        <ChevronDown
                          className="h-5 w-5 shrink-0 text-[var(--text-tertiary)] group-open:rotate-180 group-open:text-[var(--accent)] transition-all duration-[var(--dur-fast)]"
                          strokeWidth={2}
                        />
                      </summary>
                      <div className="pb-6 pl-12 pr-4">
                        <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                          {f.a}
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────── */}
        <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-canvas)]">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
          />
          <div className="relative max-w-4xl mx-auto px-4 text-center">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Última llamada
            </p>
            {/* Heading reducido: antes 5rem en 3 líneas competía con el CTA.
                Ahora clamp 4rem max + 2 líneas exactas. */}
            <h2 className="text-[clamp(2.25rem,5.5vw,4rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95] max-w-3xl mx-auto">
              Tu negocio merece <span className="text-[var(--accent)]">vender más</span>.
            </h2>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
              5 minutos para activarlo. Sin tarjeta, sin compromiso. En la primera
              semana ya estás vendiendo.
            </p>
            <div className="mt-8 flex justify-center">
              <LiveSignupTicker />
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/marketplace/registrar"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-8 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                <Store className="h-4 w-4" strokeWidth={2.25} />
                Activar gratis por 1 mes
                <ArrowUpRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.5}
                />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-8 py-4 text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
