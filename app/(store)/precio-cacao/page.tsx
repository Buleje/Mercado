import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { getCacaoMarket } from "@/lib/cacao/cacao-market";
import PrecioCacaoInteractive from "@/components/cacao-public/PrecioCacaoInteractive";

/**
 * /precio-cacao — página pública del precio del cacao (Fase 1, ADR pendiente).
 * Cotización internacional (ICE, USD/t) + referencia en chacra (S//kg) para Perú.
 * Imán de SEO + leads: gráfico de 1 año, variación del día, calculadora de cosecha
 * y CTA a registro. Datos globales (no tenant) vía getCacaoMarket, cacheados con
 * "use cache" para prerender estático bajo Cache Components. Brandon 2026-07-03.
 */

const BASE = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Precio del cacao hoy en Perú — USD/t (ICE) y S/ por kg en chacra | Buleje",
  description:
    "Precio del cacao hoy: cotización internacional (ICE, USD por tonelada) y referencia en soles por kilo en chacra para Perú. Gráfico de 1 año, variación del día y calculadora para saber cuánto vale tu cosecha.",
  keywords: ["precio del cacao", "precio cacao hoy", "precio cacao Perú", "precio cacao en chacra", "cotización del cacao", "cuánto vale el cacao"],
  alternates: { canonical: `${BASE}/precio-cacao` },
  openGraph: {
    title: "Precio del cacao hoy en Perú",
    description: "Cotización internacional (ICE) y referencia en chacra (S//kg), con gráfico y calculadora de tu cosecha.",
    type: "website",
    locale: "es_PE",
    url: `${BASE}/precio-cacao`,
  },
};

async function marketCached() {
  "use cache";
  cacheLife({ revalidate: 1200, stale: 1800 });
  return getCacaoMarket();
}

const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });
const fdate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Lima" }); } catch { return ""; } };

const FAQ = [
  { q: "¿Cómo se fija el precio del cacao?", a: "El cacao se cotiza en la bolsa ICE de Nueva York en dólares por tonelada métrica. El precio en chacra —lo que te pagan en Perú— parte de ese valor: se convierte a soles con el tipo de cambio del día y se le descuenta flete, secado y el margen del acopiador." },
  { q: "¿Por qué el precio en chacra es más bajo que el internacional?", a: "La cotización internacional es por cacao puesto en destino y con calidad de exportación. En chacra se restan transporte, mermas, humedad y el margen de quien acopia. Por eso el valor en soles por kilo es una referencia, no el precio final que vas a cobrar." },
  { q: "¿Cada cuánto se actualiza?", a: "El gráfico usa el cierre diario del último año y se refresca varias veces al día con la cotización de la bolsa y el tipo de cambio USD/PEN." },
  { q: "¿Este es el precio que me van a pagar?", a: "No. Es una referencia de mercado para que negocies con información. Cada acopiador fija su precio según calidad (fermentación, humedad NTP 208.040), volumen y zona. Usá la calculadora como piso de conversación." },
];

export default async function PrecioCacaoPage() {
  const m = await marketCached();
  const p = m.price;
  const up = (p?.changePct ?? 0) > 0, down = (p?.changePct ?? 0) < 0;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mb-6">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-[var(--accent)]">Cacao · Perú</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">Precio del cacao hoy</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--text-secondary)]">Cotización internacional (bolsa ICE) y referencia en chacra en soles por kilo, para el productor y el acopiador peruano.{m.generatedAt ? ` Actualizado al ${fdate(m.generatedAt)}.` : ""}</p>
      </header>

      {/* Precio de hoy — server-rendered (SEO) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Internacional (ICE)</p>
          <p className="mt-1 font-mono text-3xl font-extrabold text-[var(--text-primary)]">{p ? `USD ${n0(p.value)}` : "—"}<span className="ml-1 text-base font-bold text-[var(--text-tertiary)]">/t</span></p>
          {p?.changePct != null && <p className={`mt-0.5 text-sm font-bold ${up ? "text-[var(--data-success-700)]" : down ? "text-[var(--data-error-700)]" : "text-[var(--text-secondary)]"}`}>{up ? "▲ +" : down ? "▼ " : ""}{Number(p.changePct).toFixed(1)}% vs. ayer</p>}
        </div>
        <div className="rounded-2xl border-2 border-[var(--accent)] bg-primary/10 p-5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">En chacra (estimado)</p>
          <p className="mt-1 font-mono text-3xl font-extrabold text-[var(--accent)]">{m.pricePenPerKg != null ? `S/ ${n2(m.pricePenPerKg)}` : "—"}<span className="ml-1 text-base font-bold">/kg</span></p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">seco · referencia, antes de flete y margen</p>
        </div>
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Tipo de cambio</p>
          <p className="mt-1 font-mono text-3xl font-extrabold text-[var(--text-primary)]">{m.usdPen != null ? `S/ ${n2(m.usdPen)}` : "—"}<span className="ml-1 text-base font-bold text-[var(--text-tertiary)]">/USD</span></p>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">usado para el precio en soles</p>
        </div>
      </div>

      <div className="mt-8">
        {p && p.series.length > 1 ? (
          <PrecioCacaoInteractive series={p.series} usdPen={m.usdPen} pricePenPerKg={m.pricePenPerKg} />
        ) : (
          <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center text-sm text-[var(--text-tertiary)]">El precio no está disponible en este momento. Probá de nuevo en unos minutos.</p>
        )}
      </div>

      {/* Explicador / FAQ — server (SEO + JSON-LD) */}
      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">Preguntas frecuentes sobre el precio del cacao</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
              <h3 className="text-base font-bold text-[var(--text-primary)]">{f.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 text-xs text-[var(--text-tertiary)]">Fuente del precio internacional: bolsa ICE (cacao, contrato CC). La referencia en soles por kilo es un estimado (precio internacional ÷ 1000 × tipo de cambio) y no constituye una oferta de compra. Buleje no compra ni vende cacao: te damos la información para que negocies mejor.</p>
    </main>
  );
}
