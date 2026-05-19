/**
 * SectionRenderer — renderiza una seccion del SectionsBuilder en la pagina
 * publica /t/[slug]. Una funcion por cada SectionType.
 *
 * Server Component-safe — no usa hooks ni state. El acordeon del FAQ usa
 * `<details>` nativo.
 *
 * Estilo: tokens del DS · sin emojis decorativos · responsivo.
 */

import {
  Truck,
  ShieldCheck,
  Clock,
  Tag,
  Heart,
  Sparkles,
  Check,
  ChevronRight,
} from "@buleje/design-system/icons";
import type { Section, AboutSection, HoursSection, PaymentSection, HowToOrderSection, FaqSection, BenefitsSection, GallerySection, ImageTextSection } from "@/lib/store-sections-types";

interface RenderProps {
  section: Section;
  primaryColor: string;
  accentColor: string;
}

export default function SectionRenderer({ section, primaryColor, accentColor }: RenderProps) {
  if (!section.visible) return null;

  switch (section.type) {
    case "about":        return <AboutBlock      section={section} primary={primaryColor} />;
    case "hours":        return <HoursBlock      section={section} primary={primaryColor} />;
    case "payment":      return <PaymentBlock    section={section} primary={primaryColor} accent={accentColor} />;
    case "how-to-order": return <HowToOrderBlock section={section} primary={primaryColor} />;
    case "faq":          return <FaqBlock        section={section} primary={primaryColor} />;
    case "benefits":     return <BenefitsBlock   section={section} primary={primaryColor} />;
    case "gallery":      return <GalleryBlock    section={section} primary={primaryColor} />;
    case "image-text":   return <ImageTextBlock  section={section} primary={primaryColor} />;
    default: return null;
  }
}

// ── About ──────────────────────────────────────────────────────────────
function AboutBlock({ section, primary }: { section: AboutSection; primary: string }) {
  const { title, body, imageUrl } = section.data;
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className={`grid gap-6 ${imageUrl ? "md:grid-cols-2 items-center" : ""}`}>
        <div>
          <p
            className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
            style={{ color: primary }}
          >
            Conocenos
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight mb-4">
            {title}
          </h2>
          <p className="text-base text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
            {body}
          </p>
        </div>
        {imageUrl && (
          <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-[var(--surface-sunken)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </section>
  );
}

// ── Horarios ───────────────────────────────────────────────────────────
const DAY_LABELS: Record<string, string> = {
  lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves",
  vie: "Viernes", sab: "Sábado", dom: "Domingo",
};

function HoursBlock({ section, primary }: { section: HoursSection; primary: string }) {
  const { title, note, schedule } = section.data;
  // Estado abierto/cerrado hoy
  const dayKey = (["dom","lun","mar","mie","jue","vie","sab"] as const)[new Date().getDay()];
  const todayRow = schedule.find((s) => s.day === dayKey);
  const isOpenNow = (() => {
    if (!todayRow?.open || !todayRow.from || !todayRow.to) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = todayRow.from.split(":").map(Number);
    const [th, tm] = todayRow.to.split(":").map(Number);
    return cur >= fh * 60 + fm && cur <= th * 60 + tm;
  })();

  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p
            className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
            style={{ color: primary }}
          >
            Horarios
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
            {title}
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${
            isOpenNow
              ? "bg-[var(--data-success-50,#ecfdf5)] text-[var(--data-success-700,#047857)]"
              : "bg-[var(--data-error-50,#fef2f2)] text-[var(--data-error-700,#b91c1c)]"
          }`}
        >
          <span className={`relative inline-flex h-2 w-2`}>
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isOpenNow ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]"}`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${isOpenNow ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]"}`} />
          </span>
          {isOpenNow ? "Abierto ahora" : "Cerrado ahora"}
        </span>
      </div>

      <ul className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden divide-y divide-[var(--rule-soft)]">
        {schedule.map((row) => {
          const isToday = row.day === dayKey;
          return (
            <li
              key={row.day}
              className={`flex items-center justify-between gap-4 px-5 py-3.5 ${
                isToday ? "bg-[var(--accent-soft)]/40" : ""
              }`}
            >
              <span className={`text-sm font-extrabold ${isToday ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
                {DAY_LABELS[row.day]}
                {isToday && <span className="ml-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider opacity-70">Hoy</span>}
              </span>
              <span className={`text-sm font-bold tabular-nums ${row.open ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}>
                {row.open && row.from && row.to
                  ? `${row.from} – ${row.to}`
                  : "Cerrado"}
              </span>
            </li>
          );
        })}
      </ul>

      {note && (
        <p className="mt-3 text-sm text-[var(--text-tertiary)] flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {note}
        </p>
      )}
    </section>
  );
}

// ── Métodos de pago ────────────────────────────────────────────────────
const PAYMENT_META: Record<string, { gradient: string }> = {
  yape:           { gradient: "from-violet-600 to-purple-700" },
  plin:           { gradient: "from-sky-500 to-blue-700" },
  efectivo:       { gradient: "from-emerald-500 to-emerald-700" },
  tarjeta:        { gradient: "from-slate-600 to-slate-800" },
  transferencia:  { gradient: "from-amber-500 to-orange-700" },
};

function PaymentBlock({ section, primary, accent: _accent }: { section: PaymentSection; primary: string; accent: string }) {
  const { title, subtitle, methods } = section.data;
  const enabled = methods.filter((m) => m.enabled);
  if (enabled.length === 0) return null;

  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-6">
        <p
          className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
          style={{ color: primary }}
        >
          Métodos de pago
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {enabled.map((m) => {
          const meta = PAYMENT_META[m.id] ?? { gradient: "from-slate-500 to-slate-700" };
          return (
            <div
              key={m.id}
              className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex flex-col items-center justify-center text-center transition-all hover:border-[var(--accent)]/40 hover:-translate-y-0.5"
            >
              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br ${meta.gradient} text-white shadow-md mb-2`}
              >
                <Check className="h-5 w-5" strokeWidth={2.75} aria-hidden />
              </span>
              <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight">{m.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Cómo pedir ─────────────────────────────────────────────────────────
function HowToOrderBlock({ section, primary }: { section: HowToOrderSection; primary: string }) {
  const { title, subtitle, steps } = section.data;
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <p
          className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
          style={{ color: primary }}
        >
          Cómo pedir
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-base text-[var(--text-secondary)]">{subtitle}</p>
        )}
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step, i) => (
          <li
            key={i}
            className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 relative"
          >
            <p
              className="font-display text-[2.5rem] font-extrabold leading-[0.85] tabular-nums absolute -top-2 right-4"
              style={{ color: `${primary}25` }}
            >
              {String(i + 1).padStart(2, "0")}
            </p>
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white mb-3"
              style={{ background: primary }}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </span>
            <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
              {step.title}
            </h3>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────
function FaqBlock({ section, primary }: { section: FaqSection; primary: string }) {
  const { title, items } = section.data;
  return (
    <section className="max-w-3xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-6">
        <p
          className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
          style={{ color: primary }}
        >
          Preguntas frecuentes
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <details
            key={i}
            className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 [&[open]_svg]:rotate-90 transition-shadow open:shadow-md open:border-[var(--accent)]/30"
          >
            <summary className="flex items-start justify-between gap-3 cursor-pointer list-none font-bold text-[var(--text-primary)]">
              <span>{item.question}</span>
              <ChevronRight
                className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--dur-base)]"
                strokeWidth={2}
              />
            </summary>
            <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── Beneficios ─────────────────────────────────────────────────────────
const BENEFIT_ICONS = {
  truck: Truck,
  shield: ShieldCheck,
  clock: Clock,
  tag: Tag,
  heart: Heart,
  sparkles: Sparkles,
} as const;

// ── Galeria ────────────────────────────────────────────────────────────
function GalleryBlock({ section, primary }: { section: GallerySection; primary: string }) {
  const { title, subtitle, images } = section.data;
  const validImages = images.filter((img) => img.url && img.url.trim() !== "");
  if (validImages.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <p
          className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
          style={{ color: primary }}
        >
          Galería
        </p>
        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 text-base text-[var(--text-secondary)] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      <div
        className={`grid gap-3 ${
          validImages.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
          validImages.length === 3 ? "grid-cols-1 sm:grid-cols-3" :
          "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        }`}
      >
        {validImages.map((img, i) => (
          <figure
            key={i}
            className="group relative rounded-2xl overflow-hidden bg-[var(--surface-sunken)] aspect-square shadow-md hover:shadow-xl transition-shadow"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.alt ?? ""}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[var(--dur-slow)]"
              loading="lazy"
            />
            {img.caption && (
              <figcaption className="absolute inset-x-0 bottom-0 p-3 bg-linear-to-t from-black/80 to-transparent text-white text-xs font-bold leading-snug">
                {img.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}

// ── Imagen + Texto (split) ─────────────────────────────────────────────
function ImageTextBlock({ section, primary }: { section: ImageTextSection; primary: string }) {
  const { title, body, imageUrl, imageAlt, imagePosition, ctaLabel, ctaUrl } = section.data;
  if (!imageUrl || !imageUrl.trim()) return null;

  return (
    <section className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
      <div
        className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center ${
          imagePosition === "left" ? "" : "lg:[&>*:first-child]:order-2"
        }`}
      >
        {/* Imagen */}
        <div className="rounded-3xl overflow-hidden aspect-[4/3] sm:aspect-[16/10] bg-[var(--surface-sunken)] shadow-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={imageAlt ?? ""}
            className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-[var(--dur-slower)]"
          />
        </div>
        {/* Texto */}
        <div>
          <p
            className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-3"
            style={{ color: primary }}
          >
            Historia
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight mb-4">
            {title}
          </h2>
          <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap mb-6">
            {body}
          </p>
          {ctaLabel && ctaUrl && (
            <a
              href={ctaUrl}
              className="inline-flex items-center gap-2 rounded-full px-5 h-11 text-sm font-extrabold text-white shadow-md hover:opacity-90 transition-all"
              style={{ background: primary }}
            >
              {ctaLabel}
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function BenefitsBlock({ section, primary }: { section: BenefitsSection; primary: string }) {
  const { title, items } = section.data;
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-6">
        <p
          className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
          style={{ color: primary }}
        >
          Por qué elegirnos
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((item, i) => {
          const Icon = BENEFIT_ICONS[item.icon] ?? Sparkles;
          return (
            <div
              key={i}
              className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-white mb-3"
                style={{ background: primary }}
              >
                <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
              </span>
              <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
