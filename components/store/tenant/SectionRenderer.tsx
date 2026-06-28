/**
 * SectionRenderer — renderiza una seccion del SectionsBuilder en la pagina
 * publica /t/[slug]. Una funcion por cada SectionType.
 *
 * Server Component-safe — no usa hooks ni state. El acordeon del FAQ usa
 * `<details>` nativo.
 *
 * Estilo: tokens del DS · sin emojis decorativos · responsivo.
 */

import Image from "next/image";
import {
  Truck,
  ShieldCheck,
  Clock,
  Tag,
  Heart,
  Sparkles,
  Check,
  ChevronRight,
  MapPin,
  ArrowRight,
  Users,
  Instagram,
  Facebook,
  Link2,
  MessageCircle,
} from "@buleje/design-system/icons";
import type { Section, AboutSection, HoursSection, PaymentSection, HowToOrderSection, FaqSection, BenefitsSection, GallerySection, ImageTextSection, CtaSection, VideoSection, MapSection, LogosSection, CountdownSection, TeamSection, SocialSection, CategoriesSection } from "@/lib/store-sections-types";
import CountdownBanner from "@/components/store/tenant/CountdownBanner";
import RichText from "@/components/store/tenant/RichText";

interface RenderProps {
  section: Section;
  primaryColor: string;
  accentColor: string;
}

export default function SectionRenderer({ section, primaryColor, accentColor }: RenderProps) {
  if (!section.visible) return null;

  let block: React.ReactNode = null;
  switch (section.type) {
    case "about":        block = <AboutBlock      section={section} primary={primaryColor} />; break;
    case "hours":        block = <HoursBlock      section={section} primary={primaryColor} />; break;
    case "payment":      block = <PaymentBlock    section={section} primary={primaryColor} accent={accentColor} />; break;
    case "how-to-order": block = <HowToOrderBlock section={section} primary={primaryColor} />; break;
    case "faq":          block = <FaqBlock        section={section} primary={primaryColor} />; break;
    case "benefits":     block = <BenefitsBlock   section={section} primary={primaryColor} />; break;
    case "gallery":      block = <GalleryBlock    section={section} primary={primaryColor} />; break;
    case "image-text":   block = <ImageTextBlock  section={section} primary={primaryColor} accent={accentColor} />; break;
    case "cta":          block = <CtaBlock        section={section} primary={primaryColor} accent={accentColor} />; break;
    case "video":        block = <VideoBlock      section={section} primary={primaryColor} />; break;
    case "map":          block = <MapBlock        section={section} primary={primaryColor} />; break;
    case "logos":        block = <LogosBlock      section={section} primary={primaryColor} />; break;
    case "countdown":    block = <CountdownBlock  section={section} primary={primaryColor} />; break;
    case "team":         block = <TeamBlock       section={section} primary={primaryColor} />; break;
    case "social":       block = <SocialBlock     section={section} primary={primaryColor} accent={accentColor} />; break;
    case "categories":   block = <CategoriesBlock section={section} primary={primaryColor} accent={accentColor} />; break;
    default: return null;
  }
  // #12: data-section-* para el tracker de engagement (IntersectionObserver).
  return <div data-section-type={section.type} data-section-id={section.id}>{block}</div>;
}

// ── Categorías visual ──────────────────────────────────────────────────
function CategoriesBlock({ section, primary, accent }: { section: CategoriesSection; primary: string; accent: string }) {
  const { title, subtitle, items } = section.data;
  const list = (items || []).filter((c) => c.name);
  return (
    <section className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-7 text-center">
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title || "Explorá por categoría"}
        </h2>
        {subtitle && <p data-live={`customText:${section.id}:subtitle`} className="mt-2 text-base text-[var(--text-secondary)]">{subtitle}</p>}
      </div>
      {list.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((c, i) => (
            <a key={i} href={c.url || "#"} className="group relative block aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-black/5">
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagen de categoría (aspect variable)
                <img src={c.image} alt={c.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }} />
              )}
              <span className="absolute inset-0 bg-linear-to-t from-black/65 via-black/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-3 text-base font-extrabold text-white drop-shadow">{c.name}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-[var(--text-tertiary)]">Agregá categorías desde el editor</p>
      )}
    </section>
  );
}

// ── Nuestro equipo ─────────────────────────────────────────────────────
function TeamBlock({ section, primary }: { section: TeamSection; primary: string }) {
  const { title, subtitle, members } = section.data;
  const list = (members || []).filter((m) => m.name);
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-7 text-center">
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title || "Nuestro equipo"}
        </h2>
        {subtitle && <p data-live={`customText:${section.id}:subtitle`} className="mt-2 text-base text-[var(--text-secondary)]">{subtitle}</p>}
      </div>
      {list.length > 0 ? (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((m, i) => (
            <div key={i} className="flex flex-col items-center text-center">
              <div className="relative h-24 w-24 overflow-hidden rounded-full bg-[var(--surface-sunken)] ring-2 ring-black/5">
                {m.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto de equipo (aspect variable)
                  <img src={m.photo} alt={m.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center" style={{ color: primary }}>
                    <Users className="h-9 w-9" strokeWidth={1.5} aria-hidden />
                  </span>
                )}
              </div>
              <p className="mt-3 text-base font-bold text-[var(--text-primary)]">{m.name}</p>
              {m.role && <p className="text-sm text-[var(--text-secondary)]">{m.role}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-[var(--text-tertiary)]">Agregá personas desde el editor</p>
      )}
    </section>
  );
}

// ── Redes sociales ─────────────────────────────────────────────────────
const SOCIAL_META: Record<string, { label: string; Icon: typeof Instagram }> = {
  instagram: { label: "Instagram", Icon: Instagram },
  facebook: { label: "Facebook", Icon: Facebook },
  tiktok: { label: "TikTok", Icon: MessageCircle },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle },
  web: { label: "Sitio web", Icon: Link2 },
};
function SocialBlock({ section, primary, accent }: { section: SocialSection; primary: string; accent: string }) {
  const { title, links } = section.data;
  const list = (links || []).filter((l) => l.url);
  return (
    <section className="max-w-3xl mx-auto px-4 py-10 sm:py-12 text-center">
      {title && (
        <h2 data-live={`customText:${section.id}:title`} className="mb-6 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
      )}
      {list.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {list.map((l, i) => {
            const meta = SOCIAL_META[l.platform] ?? SOCIAL_META.web;
            const Icon = meta.Icon;
            return (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 h-12 text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
                <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                {meta.label}
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">Agregá los links de tus redes desde el editor</p>
      )}
    </section>
  );
}

// ── Banner CTA ─────────────────────────────────────────────────────────
function CtaBlock({ section, primary, accent }: { section: CtaSection; primary: string; accent: string }) {
  const { title, subtitle, buttonLabel, buttonUrl, background } = section.data;
  const onColor = background === "brand" || background === "dark" || !background;
  const bg = background === "dark" ? "#0F172A" : background === "light" ? "var(--surface-sunken)" : `linear-gradient(135deg, ${primary}, ${accent})`;
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="rounded-3xl px-6 py-10 sm:px-10 sm:py-14 text-center" style={{ background: bg }}>
        <h2 data-live={`customText:${section.id}:title`} className={`font-display text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight ${onColor ? "text-white" : "text-[var(--text-primary)]"}`}>
          {title}
        </h2>
        {subtitle && (
          <p data-live={`customText:${section.id}:subtitle`} className={`mt-3 text-base sm:text-lg ${onColor ? "text-white/85" : "text-[var(--text-secondary)]"}`}>
            {subtitle}
          </p>
        )}
        {buttonLabel && (
          <a
            href={buttonUrl || "#"}
            target={buttonUrl?.startsWith("http") ? "_blank" : undefined}
            rel={buttonUrl?.startsWith("http") ? "noopener noreferrer" : undefined}
            className={`mt-6 inline-flex items-center gap-2 rounded-full px-7 h-12 text-sm font-extrabold shadow-lg transition-all hover:gap-3 ${onColor ? "bg-white text-[var(--text-primary)]" : "text-white"}`}
            style={onColor ? undefined : { background: primary }}
          >
            {buttonLabel}
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </a>
        )}
      </div>
    </section>
  );
}

// ── Video ──────────────────────────────────────────────────────────────
function toYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}
function VideoBlock({ section, primary }: { section: VideoSection; primary: string }) {
  const { title, subtitle, videoUrl } = section.data;
  const yt = videoUrl ? toYouTubeEmbed(videoUrl) : null;
  const isMp4 = !!videoUrl && /\.mp4($|\?)/i.test(videoUrl);
  return (
    <section className="max-w-4xl mx-auto px-4 py-10 sm:py-12">
      {(title || subtitle) && (
        <div className="mb-6 text-center">
          {title && (
            <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              {title}
            </h2>
          )}
          {subtitle && <p data-live={`customText:${section.id}:subtitle`} className="mt-2 text-base text-[var(--text-secondary)]">{subtitle}</p>}
        </div>
      )}
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-[var(--surface-sunken)] ring-1 ring-black/5">
        {yt ? (
          <iframe src={yt} title={title || "Video"} className="absolute inset-0 h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        ) : isMp4 ? (
          <video src={videoUrl} controls className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center">
            <p className="px-6 text-sm text-[var(--text-tertiary)]" style={{ color: primary }}>Pegá un link de YouTube o un .mp4 en el editor</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Mapa ───────────────────────────────────────────────────────────────
function MapBlock({ section, primary }: { section: MapSection; primary: string }) {
  const { title, address } = section.data;
  const src = address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed` : null;
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-4 flex items-center gap-2">
        <MapPin className="h-5 w-5" strokeWidth={2} style={{ color: primary }} aria-hidden />
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title || "Dónde estamos"}
        </h2>
      </div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-[var(--surface-sunken)] ring-1 ring-black/5">
        {src ? (
          <iframe src={src} title={title || "Mapa"} className="absolute inset-0 h-full w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="px-6 text-sm text-[var(--text-tertiary)]">Escribí tu dirección en el editor</p>
          </div>
        )}
      </div>
      {address && <p className="mt-2 text-sm text-[var(--text-secondary)]">{address}</p>}
    </section>
  );
}

// ── Logos / marcas ─────────────────────────────────────────────────────
function LogosBlock({ section }: { section: LogosSection; primary: string }) {
  const { title, logos } = section.data;
  const list = (logos || []).filter((l) => l.url);
  return (
    <section className="max-w-5xl mx-auto px-4 py-10 sm:py-12">
      {title && (
        <p data-live={`customText:${section.id}:title`} className="mb-6 text-center text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {title}
        </p>
      )}
      {list.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {list.map((l, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- logos de marcas (aspect variable)
            <img key={i} src={l.url} alt={l.alt || "Marca"} className="h-10 sm:h-12 w-auto object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0" />
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-[var(--text-tertiary)]">Agregá logos desde el editor</p>
      )}
    </section>
  );
}

// ── Countdown ──────────────────────────────────────────────────────────
function CountdownBlock({ section, primary }: { section: CountdownSection; primary: string }) {
  const { title, subtitle, endsAt } = section.data;
  return (
    <section className="max-w-4xl mx-auto px-4 py-10 sm:py-12 text-center">
      <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
        {title}
      </h2>
      {subtitle && <p data-live={`customText:${section.id}:subtitle`} className="mt-2 text-base text-[var(--text-secondary)]">{subtitle}</p>}
      <div className="mt-5 flex justify-center">
        {endsAt ? (
          <CountdownBanner title="" endsAt={endsAt} />
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]" style={{ color: primary }}>Elegí la fecha de fin en el editor</p>
        )}
      </div>
    </section>
  );
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
          <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight mb-4">
            {title}
          </h2>
          <RichText text={body} className="space-y-2 text-base text-[var(--text-secondary)] leading-relaxed" />
        </div>
        {imageUrl && (
          <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-[var(--surface-sunken)] relative">
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
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
          <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
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
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
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
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
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
  const { title, items, layout } = section.data;
  // Lote J: "open" = todas las respuestas visibles (lista abierta) sin colapsar.
  const openList = layout === "open";
  return (
    <section className="max-w-3xl mx-auto px-4 py-10 sm:py-12">
      <div className="mb-6">
        <p
          className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
          style={{ color: primary }}
        >
          Preguntas frecuentes
        </p>
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
      </div>
      {openList ? (
        <div className="space-y-3" data-pb-faq="open">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <p className="font-bold text-[var(--text-primary)]">{item.question}</p>
              <RichText text={item.answer} className="mt-2 space-y-1.5 text-sm text-[var(--text-secondary)] leading-relaxed" />
            </div>
          ))}
        </div>
      ) : (
      <div className="space-y-2" data-pb-faq="accordion">
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
            <RichText text={item.answer} className="mt-3 space-y-1.5 text-sm text-[var(--text-secondary)] leading-relaxed" />
          </details>
        ))}
      </div>
      )}
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
  const { title, subtitle, images, columns } = section.data;
  const validImages = images.filter((img) => img.url && img.url.trim() !== "");
  if (validImages.length === 0) return null;
  // Lote I: columnas configurables (override del auto-por-cantidad).
  const colsClass = columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-2 sm:grid-cols-3" : columns === 4 ? "grid-cols-2 md:grid-cols-4" : null;

  return (
    <section className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
      <div className="mb-8 text-center max-w-2xl mx-auto">
        <p
          className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-2"
          style={{ color: primary }}
        >
          Galería
        </p>
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 text-base text-[var(--text-secondary)] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      <div
        className={`grid gap-3 ${colsClass ?? (
          validImages.length === 2 ? "grid-cols-1 sm:grid-cols-2" :
          validImages.length === 3 ? "grid-cols-1 sm:grid-cols-3" :
          "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        )}`}
      >
        {validImages.map((img, i) => (
          <figure
            key={i}
            className="group relative rounded-2xl overflow-hidden bg-[var(--surface-sunken)] aspect-square shadow-md hover:shadow-xl transition-shadow"
          >
            <Image
              src={img.url}
              alt={img.alt ?? ""}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-[var(--dur-slow)]"
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

// ── Imagen + Texto (banda editorial) ───────────────────────────────────
// Bloque potente imagen-al-lado-de-texto, configurable desde el admin:
// lado de la imagen (izq/der), fondo (claro/marca/oscuro), eyebrow, título,
// texto y CTA. Pensado para apilar varios y contar la historia de la marca.
function ImageTextBlock({ section, primary, accent }: { section: ImageTextSection; primary: string; accent: string }) {
  const {
    title, body, imageUrl, imageAlt, imagePosition,
    ctaLabel, ctaUrl, eyebrow, background = "light",
  } = section.data;
  if (!imageUrl || !imageUrl.trim()) return null;

  const isDark = background === "dark";
  const isBrand = background === "brand";
  const onColor = isDark || isBrand; // texto claro sobre fondo oscuro/marca

  const outerClass = isDark
    ? "bg-[#0d1414]"
    : isBrand
      ? ""
      : "bg-[var(--surface-sunken)]";
  const outerStyle = isBrand
    ? { background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)` }
    : undefined;

  // Lote I: posición de la imagen — left/right (lado) o top/bottom (vertical).
  const vertical = imagePosition === "top" || imagePosition === "bottom";
  const gridClass = vertical
    ? "grid-cols-1 gap-8 max-w-3xl mx-auto text-center"
    : "grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center";
  const imageOrder = imagePosition === "right" || imagePosition === "bottom" ? "lg:order-2 order-2" : "";

  return (
    <section className={`w-full ${outerClass}`} style={outerStyle}>
      <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20">
        <div className={`grid ${gridClass}`}>
          {/* Imagen — con glow de realce detrás */}
          <div className={`relative ${imageOrder}`}>
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-3 rounded-[2rem] blur-2xl opacity-70"
              style={{ background: onColor ? "rgba(255,255,255,0.14)" : `color-mix(in oklab, ${primary} 18%, transparent)` }}
            />
            <div className="relative rounded-3xl overflow-hidden aspect-[4/3] sm:aspect-[16/11] bg-[var(--surface-sunken)] shadow-[var(--shadow-xl)] ring-1 ring-black/5">
              <Image
                src={imageUrl}
                alt={imageAlt ?? ""}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-transform duration-[var(--dur-slower)] hover:scale-[1.03]"
              />
            </div>
          </div>

          {/* Texto */}
          <div className={imagePosition === "left" ? "lg:pl-2" : "lg:pr-2"}>
            <p
              className={`text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-3 ${onColor ? "text-white/80" : ""}`}
              style={onColor ? undefined : { color: primary }}
            >
              {eyebrow || "Conocé más"}
            </p>
            <h2 data-live={`customText:${section.id}:title`} className={`font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight leading-[1.05] mb-5 ${onColor ? "text-white" : "text-[var(--text-primary)]"}`}>
              {title}
            </h2>
            <RichText text={body} className={`space-y-2 text-base sm:text-lg leading-relaxed mb-7 ${onColor ? "text-white/85" : "text-[var(--text-secondary)]"}`} />
            {ctaLabel && ctaUrl && (
              <a
                href={ctaUrl}
                className="inline-flex items-center gap-2 rounded-full px-6 h-12 text-sm font-extrabold shadow-md transition-all hover:gap-3"
                style={isBrand ? { background: "#fff", color: primary } : { background: primary, color: "#fff" }}
              >
                {ctaLabel}
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </a>
            )}
          </div>
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
        <h2 data-live={`customText:${section.id}:title`} className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
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
