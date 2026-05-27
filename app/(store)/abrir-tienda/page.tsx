import type { Metadata } from "next";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Store,
  ChevronDown,
  ArrowUpRight,
  Check,
  X,
  Crown,
  Receipt,
  CreditCard,
  ShieldCheck,
  Download,
  RefreshCcw,
  Sparkles,
  Wrench,
  MessageCircle,
  Camera,
  Percent,
  MapPin,
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

// ── Por qué Buleje — los 3 caminos (cuaderno / POS caro / Buleje) ──
// Copy simple para cualquier bodeguero + psicología: aversión a la pérdida
// (cuaderno/POS = lo que perdés), anclaje (S/300 vs S/0) y reversión de riesgo
// (sin tarjeta, cancelás cuando quieras) en Buleje.
const PATHS: {
  name: string;
  verdict: string;
  cost: string;
  points: string[];
  reassurance?: string;
  positive: boolean;
}[] = [
  {
    name: "El cuaderno",
    verdict: "Te roba tiempo y plata",
    cost: "Gratis… pero te sale caro",
    points: [
      "Solo te compran los que pasan por tu puerta",
      "Sumás a mano y a veces no te cuadra la caja",
      "No sabés qué se vende ni qué se te está acabando",
      "Si te olvidás de un fiado, esa plata se pierde",
      "Cierras de noche, cansado y sin saber cómo te fue",
    ],
    positive: false,
  },
  {
    name: "Un sistema caro",
    verdict: "Te cobra todos los meses",
    cost: "S/ 300 o más al mes",
    points: [
      "Pagás caro aunque ese mes vendas poco",
      "Solo cobra: no te consigue ni un cliente nuevo",
      "Necesitás un técnico para instalarlo y arreglarlo",
      "Atado a una máquina en el mostrador, no a tu celular",
      "Sin tienda online ni delivery para tus clientes",
    ],
    positive: false,
  },
  {
    name: "Buleje",
    verdict: "Te hace vender más",
    cost: "Gratis para empezar · sin tarjeta",
    points: [
      "Tu puesto en el marketplace de Pucallpa: miles de vecinos te ven cada día",
      "Tu propia tienda online con tu marca — vendés aunque la bodega esté cerrada",
      "Cobrás con Yape, Plin, efectivo o tarjeta — la plata llega directo a vos",
      "Tus clientes te piden por WhatsApp y vos despachás con delivery",
      "Sabés al instante qué vendiste, qué falta y a quién le fiaste",
      "Boletas y facturas SUNAT, fiado digital y reportes, todo en una app",
      "Lo abrís en tu celular en 5 minutos, sin técnico ni local",
    ],
    reassurance: "0% comisión · sin tarjeta · cancelás cuando quieras",
    positive: true,
  },
];

// ── Garantías de confianza ──
const GUARANTEES = [
  { icon: CreditCard, t: "Empezás sin pagar", d: "Probás gratis y sin dejar tu tarjeta. Si no te sirve, no perdiste ni un sol." },
  { icon: RefreshCcw, t: "Cancelás cuando quieras", d: "Con un click, sin llamadas ni penalidad. Te quedás solo si te conviene." },
  { icon: Download, t: "Tu plata y tus datos son tuyos", d: "El dinero llega directo a vos. Y tus clientes y ventas te los llevás cuando quieras." },
  { icon: ShieldCheck, t: "Tu info segura", d: "Respaldos todos los días y protección de la Ley 29733 del Perú." },
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

// ── Por qué Buleje — los 3 caminos (tarjetas) ──
function CompareSection() {
  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            Por qué Buleje
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
            Tres caminos.{" "}
            <span className="italic font-serif text-[var(--accent)]">Uno te hace crecer.</span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            El cuaderno te cuesta tiempo. El POS caro te cuesta plata.
            Buleje, ninguno de los dos.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 items-start pt-5">
          {PATHS.map((p) =>
            p.positive ? (
              // ── Tarjeta ganadora: Buleje ──
              <div key={p.name} className="relative lg:-translate-y-4 pt-3">
                {/* Corona (fuera del overflow-hidden para que no se recorte) */}
                <span className="absolute top-0 left-1/2 z-20 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-4 py-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shadow-md shadow-[var(--accent)]/30 whitespace-nowrap">
                  <Crown className="h-3.5 w-3.5" strokeWidth={2.5} /> Tu mejor opción
                </span>
                <div className="relative rounded-3xl bg-[var(--surface-raised)] ring-2 ring-[var(--accent)] shadow-[var(--shadow-xl)] shadow-[var(--accent)]/25 p-7 sm:p-8 overflow-hidden">
                  <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[var(--accent)]/15 blur-3xl" />
                  <div className="relative">
                    <p className="mt-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">{p.verdict}</p>
                    <h3 className="mt-1 text-3xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-none">{p.name}</h3>
                    <p className="mt-3 text-lg font-extrabold text-[var(--accent)]">{p.cost}</p>
                    <ul className="mt-6 space-y-3">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-3 text-sm text-[var(--text-primary)] font-medium leading-snug">
                          <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white">
                            <Check className="h-3 w-3" strokeWidth={3.25} />
                          </span>
                          {pt}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/marketplace/registrar"
                      className="group mt-7 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-6 py-3.5 text-sm font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
                    >
                      Empezar gratis
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
                    </Link>
                    {p.reassurance && (
                      <p className="mt-3 text-center text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">
                        {p.reassurance}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // ── Tarjetas opacas: cuaderno / POS caro ──
              <div
                key={p.name}
                className="rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-base)] p-7 sm:p-8"
              >
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">{p.verdict}</p>
                <h3 className="mt-1 text-2xl font-extrabold tracking-[-0.01em] text-[var(--text-secondary)] leading-none">{p.name}</h3>
                <p className="mt-3 text-base font-bold text-[var(--text-tertiary)]">{p.cost}</p>
                <ul className="mt-6 space-y-3">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-3 text-sm text-[var(--text-tertiary)] leading-snug">
                      <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                        <X className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
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
          <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            No te pedimos tarjeta ni te amarramos a un contrato. Probás, y si no
            te sirve, te vas sin haber perdido nada.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GUARANTEES.map((g) => (
            <div key={g.t} className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 transition-all hover:border-[var(--accent)]/40 hover:shadow-md">
              <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
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
// v3 (2026-05-27): value-stacking con anclaje de precio. Cada beneficio
// del Plan Fundador es un servicio que normalmente se cobra aparte; al
// sumar su valor real (S/ 690+) y ponerlo contra "Hoy: S/ 0" se ancla
// la percepción de ganga. Honesto: son servicios que de verdad damos.
const FOUNDER_PERKS = [
  {
    icon: Wrench,
    title: "Te armamos tu tienda completa, 1-a-1",
    sub: "Cargamos productos, fotos y precios contigo. No tocás nada.",
    value: "S/ 300",
  },
  {
    icon: MessageCircle,
    title: "90 días de soporte directo por WhatsApp",
    sub: "Una persona real te responde, no un bot ni un ticket.",
    value: "S/ 240",
  },
  {
    icon: Camera,
    title: "Sesión de fotos de tus productos",
    sub: "Fotos que venden, listas para tu catálogo y el marketplace.",
    value: "S/ 150",
  },
  {
    icon: Percent,
    title: "0% comisión tus primeros 90 días",
    sub: "Cada sol de tus ventas llega completo a tu bolsillo.",
    value: "según ventas",
  },
  {
    icon: MapPin,
    title: "En el mapa de Pucallpa desde el día 1",
    sub: "Miles de vecinos te encuentran apenas abrís.",
    value: "incluido",
  },
] as const;

function SocialProofSection() {
  const CUPOS_TOTAL = 10;
  const CUPOS_TOMADOS = 3;
  const libres = CUPOS_TOTAL - CUPOS_TOMADOS;
  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Encabezado centrado — momento de "oferta final" */}
        <div className="text-center mb-12 sm:mb-14">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-5">
            <span aria-hidden className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            Plan Fundador · Pucallpa
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[1]">
            Sé de las primeras{" "}
            <span className="italic font-serif text-[var(--accent)]">{CUPOS_TOTAL} bodegas</span>
            <br className="hidden sm:block" /> y arrancá con todo gratis.
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto">
            Elegimos a los primeros negocios de Pucallpa para crecer juntos.
            Lo que normalmente se cobra aparte, hoy lo hacés{" "}
            <strong className="text-[var(--text-primary)]">sin pagar un sol</strong>.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-6 sm:p-8 lg:p-10">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-[var(--accent)]/15 blur-3xl" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-8 lg:gap-12 items-start">
            {/* Izquierda — value stack con anclaje de precio */}
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-4">
                Lo que te llevás como fundador
              </p>
              <ul className="space-y-2.5">
                {FOUNDER_PERKS.map((perk) => {
                  const Icon = perk.icon;
                  return (
                    <li
                      key={perk.title}
                      className="group flex items-center gap-4 rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-3.5 sm:p-4 transition-all hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-sm)]"
                    >
                      <span aria-hidden className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]/20">
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] leading-snug">
                          {perk.title}
                        </p>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-snug mt-0.5">
                          {perk.sub}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] line-through tabular-nums">
                          {perk.value}
                        </p>
                        <p className="text-[length:var(--ts-xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                          Gratis
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Total anclado — valor real vs hoy S/0 */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--surface-raised)] px-5 py-4">
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Valor real del arranque
                  </p>
                  <p className="text-xl font-extrabold text-[var(--text-tertiary)] line-through tabular-nums leading-none mt-0.5">
                    S/ 690+
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
                    Hoy pagás
                  </p>
                  <p className="text-3xl sm:text-4xl font-extrabold text-[var(--accent)] tabular-nums leading-none mt-0.5">
                    S/ 0
                  </p>
                </div>
              </div>
            </div>

            {/* Derecha — cupos tangibles + prueba social + CTA */}
            <div className="rounded-[1.75rem] border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-7 shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Cupos del mes</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-50,#fffbeb)] text-[var(--data-warning-700,#b45309)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                  <Sparkles className="h-3 w-3" strokeWidth={2.5} /> Quedan pocos
                </span>
              </div>

              {/* Casilleros — 10 cupos, ocupados vs libres (más tangible que barra) */}
              <div className="grid grid-cols-5 gap-2" aria-hidden>
                {Array.from({ length: CUPOS_TOTAL }).map((_, i) => {
                  const tomado = i < CUPOS_TOMADOS;
                  return (
                    <span
                      key={i}
                      className={`h-9 rounded-lg border-2 flex items-center justify-center transition-colors ${
                        tomado
                          ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                          : "border-dashed border-[var(--accent)]/40 bg-[var(--accent-soft)]/40 text-[var(--accent)]"
                      }`}
                    >
                      {tomado ? (
                        <Check className="h-4 w-4" strokeWidth={3} />
                      ) : (
                        <span className="text-[10px] font-extrabold uppercase">libre</span>
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)] font-extrabold tabular-nums">{libres} de {CUPOS_TOTAL}</strong> cupos libres este mes en Pucallpa.
              </p>

              {/* Prueba social */}
              <div className="mt-5 flex items-center gap-3 pt-5 border-t border-[var(--rule-soft)]">
                <div className="flex -space-x-2" aria-hidden>
                  {[
                    { l: "D", c: "var(--accent)" },
                    { l: "P", c: "#722EAB" },
                    { l: "L", c: "#f97316" },
                  ].map(({ l, c }) => (
                    <span key={l} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white font-extrabold text-sm ring-3 ring-[var(--surface-raised)]" style={{ background: c }}>
                      {l}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-snug">
                  <strong className="font-extrabold text-[var(--text-primary)]">Don Lucho</strong> y {CUPOS_TOMADOS} bodegas más ya entraron.
                </p>
              </div>

              <Link
                href="/marketplace/registrar"
                className="group mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-6 py-3.5 text-sm font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                Reservar mi cupo gratis
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
              </Link>

              {/* Sello de garantía */}
              <div className="mt-4 flex items-center justify-center gap-2 text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)]">
                <ShieldCheck className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} />
                Sin tarjeta · sin permanencia · te contactamos por WhatsApp
              </div>
            </div>
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
