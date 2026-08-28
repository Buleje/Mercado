import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  Sparkles,
  MessageCircle,
  ArrowRight,
  ShoppingBag,
  Tag,
  Truck,
  LayoutGrid,
  ArrowUpRight,
} from "lucide-react";

/**
 * TenantHero — hero del storefront `/t/<slug>` con VARIANTES de diseño
 * (Brandon 2026-06-26, page builder Fase 4). El dueño elige el layout desde
 * el Modo Creativo > Hero. 4 variantes:
 *  - editorial: imagen/gradiente + texto izq + bento de productos (default, el clásico).
 *  - centered:  texto centrado, CTAs al medio, tipo landing.
 *  - split:     texto izq | una foto grande a la derecha.
 *  - immersive: foto full-bleed con el texto y CTA encima (overlay).
 *
 * Es server component (sin interactividad) → LCP/SEO intactos. Los colores usan
 * `var(--tenant-*)` para que el live-preview del editor los pise en caliente.
 * `data-pb="hero"` (page builder) y `data-live` (live text) se conservan.
 */

export type HeroVariant = "editorial" | "centered" | "split" | "immersive" | "minimal";

export interface TenantHeroProps {
  variant: HeroVariant;
  heroTitle: string;
  heroSubtitle?: string | null;
  heroImage?: string | null;
  // Lote B (Brandon 2026-06-27): gradiente del hero (si no hay imagen).
  heroGradientFrom?: string;
  heroGradientTo?: string;
  heroGradientAngle?: number;
  // Lote D (Brandon 2026-06-27): video de fondo + segundo CTA.
  heroVideoUrl?: string;
  heroCta2Label?: string;
  heroCta2Url?: string;
  displayName: string;
  slug: string;
  ownerPhone?: string | null;
  whatsappPhone?: string | null;
  createdYear?: number | null;
  logoUrl?: string | null;
  logoText: ReactNode;
  primary: string;
  accent: string;
  btnRadiusFallback: string;
  exclusiveCount: number;
  productCount: number;
  heroFeatured:
    | { id: string; name: string; image?: string | null; price: number; exclusivePrice?: number | null }
    | null;
  heroTiles: { name: string; count: number }[];
  isPreview: boolean;
  badgeLabel?: string;
  badgeClassName?: string;
  heroCtaLabel?: string | null;
  heroCtaUrl?: string | null;
  // Controles de "editar potencia" (Brandon 2026-06-26)
  overlay?: number; // 0-100 oscurecimiento extra de la foto (legibilidad)
  align?: "left" | "center";
  height?: "compact" | "normal" | "tall";
  showBadges?: boolean;
  // Texto inline editable desde Modo Creativo (Brandon 2026-06-27). Vacío = default.
  inlineText?: Record<string, string>;
}

const HEIGHT_PAD: Record<NonNullable<TenantHeroProps["height"]>, string> = {
  compact: "pt-8 pb-12 sm:pt-10 sm:pb-16",
  normal: "pt-10 sm:pt-14 pb-20 sm:pb-24",
  tall: "pt-16 pb-28 sm:pt-20 sm:pb-32",
};

export default function TenantHero(props: TenantHeroProps) {
  const {
    variant,
    heroTitle,
    heroSubtitle,
    heroImage,
    heroGradientFrom,
    heroGradientTo,
    heroGradientAngle,
    heroVideoUrl,
    heroCta2Label,
    heroCta2Url,
    displayName,
    slug,
    ownerPhone,
    whatsappPhone,
    createdYear,
    logoUrl,
    logoText,
    primary,
    accent,
    btnRadiusFallback,
    exclusiveCount,
    productCount,
    heroFeatured,
    heroTiles,
    isPreview,
    badgeLabel,
    badgeClassName,
    heroCtaLabel,
    heroCtaUrl,
    overlay = 0,
    align = "left",
    height = "normal",
    showBadges = true,
    inlineText,
  } = props;
  // Helper de texto inline editable (data-live = doble-click en el preview).
  const htxt = (key: string, fallback: string) => inlineText?.[key] || fallback;

  const cssPrimary = `var(--tenant-primary, ${primary})`;
  const cssAccent = `var(--tenant-accent, ${accent})`;
  const cssPrimaryA = (p: number) => `color-mix(in srgb, var(--tenant-primary, ${primary}) ${p}%, transparent)`;
  const cssAccentA = (p: number) => `color-mix(in srgb, var(--tenant-accent, ${accent}) ${p}%, transparent)`;
  const cssBtnRadius = `var(--tenant-btn-radius, ${btnRadiusFallback})`;
  const formatPrice = (n: number) => `S/${n.toFixed(2)}`;
  const catalogHref = `/t/${slug}/tienda`;
  const phone = (whatsappPhone ?? ownerPhone ?? "").replace(/\D/g, "");
  const waHref = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hola ${displayName}, quiero hacer un pedido.`)}`
    : null;
  const scrim = Math.max(0, Math.min(100, overlay)) / 100; // 0..1
  const centered = align === "center" || variant === "centered" || variant === "immersive";

  /* ── Piezas compartidas ─────────────────────────────────────────────── */

  const Eyebrow = (
    <p
      className={`inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white/85 mb-5 ${centered ? "justify-center" : ""}`}
    >
      <span aria-hidden className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-60 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      Tienda en Buleje
      {createdYear && (
        <>
          <span aria-hidden className="text-white/40">·</span>
          <span>Desde {createdYear}</span>
        </>
      )}
    </p>
  );

  const Title = (
    <h1
      data-live="heroTitle"
      className={`font-display text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold text-white tracking-[var(--ls-tight)] leading-[0.95] mb-5 ${centered ? "mx-auto max-w-3xl" : ""}`}
    >
      {heroTitle}
    </h1>
  );

  const Subtitle = heroSubtitle ? (
    <p
      data-live="heroSubtitle"
      className={`text-white/85 text-lg sm:text-xl leading-[1.45] mb-7 ${centered ? "mx-auto max-w-xl" : "max-w-xl"}`}
    >
      {heroSubtitle}
    </p>
  ) : null;

  const ExclusiveBadge =
    exclusiveCount > 0 ? (
      <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-white font-extrabold text-sm mb-5">
        <Sparkles className="w-4 h-4" strokeWidth={2.5} aria-hidden />
        {exclusiveCount} {exclusiveCount === 1 ? "precio exclusivo hoy" : "precios exclusivos hoy"}
      </div>
    ) : null;

  const Ctas = (
    <div className={`flex items-center gap-3 flex-wrap ${centered ? "justify-center" : ""}`}>
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2 px-6 h-12 bg-white font-extrabold text-sm hover:gap-2.5 transition-all shadow-xl"
          style={{ color: cssPrimary, borderRadius: cssBtnRadius }}
        >
          <MessageCircle className="w-4 h-4" strokeWidth={2.75} />
          <span data-live="inlineText:hero.ctaWhatsApp">{htxt("hero.ctaWhatsApp", "Pedir por WhatsApp")}</span>
          <ArrowRight className="w-4 h-4 opacity-70" strokeWidth={2.5} />
        </a>
      )}
      <Link
        href={catalogHref}
        className="inline-flex items-center gap-2 px-6 h-12 border-2 border-white/40 text-white font-extrabold text-sm hover:bg-white/15 backdrop-blur transition-all"
        style={{ borderRadius: cssBtnRadius }}
      >
        <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
        <span data-live="inlineText:hero.ctaCatalog">{htxt("hero.ctaCatalog", "Ver catálogo")}</span>
      </Link>
      {/* Lote D: segundo CTA configurable (ej. "Ver el menú" / "Contáctanos"). */}
      {heroCta2Label && heroCta2Url && (
        <Link
          href={/^(\/|https?:\/\/)/.test(heroCta2Url) ? heroCta2Url : "#"}
          target={heroCta2Url.startsWith("http") ? "_blank" : undefined}
          rel={heroCta2Url.startsWith("http") ? "noopener noreferrer" : undefined}
          className="inline-flex items-center gap-2 px-6 h-12 border-2 border-white/40 text-white font-extrabold text-sm hover:bg-white/15 backdrop-blur transition-all"
          style={{ borderRadius: cssBtnRadius }}
        >
          <span data-live="inlineText:hero.cta2">{heroCta2Label}</span>
        </Link>
      )}
    </div>
  );

  const Stats = showBadges ? (
    <div className={`mt-7 flex flex-wrap items-center gap-2.5 ${centered ? "justify-center" : ""}`}>
      {productCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
          <ShoppingBag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          {productCount} {productCount === 1 ? "producto" : "productos"}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
        <Tag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Yape · Plin · Efectivo
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 backdrop-blur">
        <Truck className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        Delivery 25–35 min
      </span>
    </div>
  ) : null;

  const PreviewExtras = isPreview ? (
    <div className={`mt-5 flex items-center gap-2 flex-wrap opacity-90 ${centered ? "justify-center" : ""}`}>
      {badgeLabel && (
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeClassName ?? ""}`}>
          Vista previa · plan {badgeLabel}
        </span>
      )}
      {heroCtaLabel && heroCtaUrl && (
        <Link
          href={/^(\/|https?:\/\/)/.test(heroCtaUrl) ? heroCtaUrl : "#"}
          className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition-colors"
        >
          {heroCtaLabel}
        </Link>
      )}
    </div>
  ) : null;

  const TextColumn = (
    <div className={centered ? "text-center" : "text-left"}>
      {Eyebrow}
      {Title}
      {Subtitle}
      {ExclusiveBadge}
      {Ctas}
      {Stats}
      {PreviewExtras}
    </div>
  );

  /* ── Capas de fondo (imagen + gradiente + patrón + mask) ────────────── */

  // Lote B: gradiente personalizado del dueño (2 colores + ángulo) tiene prioridad
  // sobre el degradado por defecto basado en la marca. Solo si no hay foto de fondo.
  const customGradient = heroGradientFrom && heroGradientTo
    ? `linear-gradient(${heroGradientAngle ?? 135}deg, ${heroGradientFrom}, ${heroGradientTo})`
    : null;
  const gradientBg = heroImage
    ? undefined
    : {
        background: customGradient
          ?? `radial-gradient(circle at 30% 20%, ${cssAccentA(40)} 0%, transparent 50%), linear-gradient(135deg, ${cssPrimary} 0%, ${cssPrimaryA(87)} 50%, ${cssPrimary} 100%)`,
      };

  // Lote D: video de fondo (MP4 o YouTube). Tiene prioridad sobre imagen/gradiente.
  const ytId = heroVideoUrl?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)?.[1];
  const isMp4Hero = !!heroVideoUrl && /\.mp4($|\?)/i.test(heroVideoUrl);

  const BgLayers = (
    <>
      {heroVideoUrl && (ytId || isMp4Hero) && (
        <>
          {ytId ? (
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&loop=1&playlist=${ytId}&controls=0&showinfo=0&modestbranding=1&playsinline=1`}
              title="Video de fondo del hero"
              aria-hidden
              tabIndex={-1}
              className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2"
              allow="autoplay; encrypted-media"
            />
          ) : (
            <video src={heroVideoUrl} autoPlay muted loop playsInline aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${(0.35 + (overlay ?? 0) / 200).toFixed(3)})` }} aria-hidden />
        </>
      )}
      {heroImage && !heroVideoUrl && (
        <>
          <Image
            src={heroImage}
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            className="object-cover"
            aria-hidden
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(180deg, ${cssPrimaryA(87)} 0%, ${cssPrimaryA(67)} 50%, ${cssPrimaryA(80)} 100%)`,
            }}
          />
          {scrim > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: `rgba(0,0,0,${(scrim * 0.7).toFixed(3)})` }}
            />
          )}
        </>
      )}
      {/* Patrón decorativo sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Gradient mask abajo para suavizar borde con la siguiente seccion */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-b from-transparent to-[var(--surface-canvas)]"
      />
    </>
  );

  const Bento = (
    <div className="relative hidden lg:block">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[2rem] blur-3xl opacity-40"
        style={{ background: cssAccent }}
      />
      <div className="relative grid grid-cols-2 gap-3">
        {heroFeatured && (
          <Link
            href={catalogHref}
            className="col-span-2 group flex items-center gap-4 rounded-2xl bg-white/95 p-4 shadow-[var(--shadow-xl)] ring-1 ring-white/30 transition-all hover:-translate-y-0.5"
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
              {heroFeatured.image ? (
                <Image src={heroFeatured.image} alt={heroFeatured.name} fill sizes="80px" className="object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center">
                  <ShoppingBag className="h-7 w-7 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="mb-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)]"
                style={{ color: cssPrimary }}
              >
                Destacado
              </p>
              <p className="line-clamp-2 font-extrabold leading-tight text-[var(--text-primary)]">{heroFeatured.name}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-extrabold" style={{ color: cssPrimary }}>
                  {formatPrice(heroFeatured.exclusivePrice ?? heroFeatured.price)}
                </span>
                {heroFeatured.exclusivePrice != null && (
                  <span className="text-xs text-[var(--text-tertiary)] line-through">{formatPrice(heroFeatured.price)}</span>
                )}
              </div>
            </div>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.5}
              aria-hidden
            />
          </Link>
        )}
        {heroTiles.map((cat) => (
          <Link
            key={cat.name}
            href={catalogHref}
            className="group rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/15"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                <LayoutGrid className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 text-white/50 transition-colors group-hover:text-white" strokeWidth={2.5} aria-hidden />
            </div>
            <p className="truncate font-extrabold leading-tight text-white">{cat.name}</p>
            <p className="text-xs font-semibold text-white/70">{cat.count} {cat.count === 1 ? "producto" : "productos"}</p>
          </Link>
        ))}
        <Link
          href={catalogHref}
          className={`group flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/30 p-4 text-center transition-all hover:bg-white/10 ${heroTiles.length % 2 === 0 ? "col-span-2" : ""}`}
        >
          <span className="mb-1 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
            <ShoppingBag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </span>
          <p data-live="inlineText:hero.catalogCardTitle" className="font-extrabold leading-tight text-white">{htxt("hero.catalogCardTitle", "Ver todo el catálogo")}</p>
          <p className="text-xs font-semibold text-white/70">{productCount} {productCount === 1 ? "producto" : "productos"}</p>
        </Link>
      </div>
    </div>
  );

  const MobileLogo = (
    <div className="lg:hidden order-first flex items-center gap-3">
      <span className="inline-flex w-16 h-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur border-2 border-white/25 text-white text-xl font-extrabold shadow-lg overflow-hidden">
        {logoUrl ? (
          <Image src={logoUrl} alt={`Logo de ${displayName}`} width={64} height={64} priority sizes="64px" className="w-full h-full object-cover" />
        ) : (
          logoText
        )}
      </span>
    </div>
  );

  const PhotoPanel = (
    <div className="relative hidden lg:block">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 rounded-[2rem] blur-3xl opacity-40"
        style={{ background: cssAccent }}
      />
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] ring-1 ring-white/30 shadow-[var(--shadow-xl)] bg-white/10">
        {heroImage || heroFeatured?.image ? (
          <Image
            src={(heroImage || heroFeatured?.image) as string}
            alt={heroFeatured?.name ?? displayName}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 40vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ShoppingBag className="h-16 w-16 text-white/60" strokeWidth={1.25} aria-hidden />
          </div>
        )}
      </div>
    </div>
  );

  /* ── Variantes ───────────────────────────────────────────────────────── */

  const padding = HEIGHT_PAD[height];

  // MINIMAL: hero claro y aireado — fondo casi blanco con un velo de marca sutil,
  // texto oscuro y el color de marca solo como acento (eyebrow, CTA). Sin bloque
  // de color saturado ni caja vacía de imagen. (Brandon 2026-06-26.)
  if (variant === "minimal") {
    return (
      <section data-pb="hero" className="relative overflow-hidden border-b border-[var(--rule-soft)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(180deg, ${cssPrimaryA(7)} 0%, transparent 55%)` }}
        />
        <div className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${padding}`}>
          <div className={align === "center" ? "text-center max-w-3xl mx-auto" : "max-w-3xl"}>
            <p
              className={`inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] mb-5 ${align === "center" ? "justify-center" : ""}`}
              style={{ color: cssPrimary }}
            >
              <span aria-hidden className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping" style={{ background: cssPrimary }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: cssPrimary }} />
              </span>
              Tienda en Buleje
              {createdYear && (
                <>
                  <span aria-hidden className="text-[var(--text-tertiary)]">·</span>
                  <span>Desde {createdYear}</span>
                </>
              )}
            </p>
            <h1
              data-live="heroTitle"
              className="font-display text-[clamp(2.25rem,6vw,4rem)] font-extrabold text-[var(--text-primary)] tracking-[var(--ls-tight)] leading-[1.02] mb-5"
            >
              {heroTitle}
            </h1>
            {heroSubtitle && (
              <p
                data-live="heroSubtitle"
                className={`text-[var(--text-secondary)] text-lg sm:text-xl leading-[1.5] mb-8 ${align === "center" ? "mx-auto max-w-xl" : "max-w-xl"}`}
              >
                {heroSubtitle}
              </p>
            )}
            <div className={`flex items-center gap-3 flex-wrap ${align === "center" ? "justify-center" : ""}`}>
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 px-6 h-12 font-extrabold text-sm text-white hover:gap-2.5 transition-all shadow-lg"
                  style={{ background: cssPrimary, borderRadius: cssBtnRadius }}
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2.75} />
                  <span data-live="inlineText:hero.ctaWhatsApp">{htxt("hero.ctaWhatsApp", "Pedir por WhatsApp")}</span>
                  <ArrowRight className="w-4 h-4 opacity-80" strokeWidth={2.5} />
                </a>
              )}
              <Link
                href={catalogHref}
                className="inline-flex items-center gap-2 px-6 h-12 border-2 font-extrabold text-sm text-[var(--text-primary)] transition-all hover:bg-[var(--surface-sunken)]"
                style={{ borderColor: "var(--rule-base)", borderRadius: cssBtnRadius }}
              >
                <ShoppingBag className="w-4 h-4" strokeWidth={2.5} />
                <span data-live="inlineText:hero.ctaCatalog">{htxt("hero.ctaCatalog", "Ver catálogo")}</span>
              </Link>
            </div>
            {showBadges && (
              <div className={`mt-7 flex flex-wrap items-center gap-2.5 ${align === "center" ? "justify-center" : ""}`}>
                {productCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold text-[var(--text-secondary)] border border-[var(--rule-soft)] bg-[var(--color-card)]">
                    <ShoppingBag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    {productCount} {productCount === 1 ? "producto" : "productos"}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold text-[var(--text-secondary)] border border-[var(--rule-soft)] bg-[var(--color-card)]">
                  <Tag className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Yape · Plin · Efectivo
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold text-[var(--text-secondary)] border border-[var(--rule-soft)] bg-[var(--color-card)]">
                  <Truck className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Delivery 25–35 min
                </span>
              </div>
            )}
            {isPreview && badgeLabel && (
              <p className={`mt-5 ${align === "center" ? "text-center" : ""}`}>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${badgeClassName ?? ""}`}>
                  Vista previa · plan {badgeLabel}
                </span>
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  // SPLIT: texto izq | foto der (sin imagen de fondo full-bleed; usa gradiente)
  if (variant === "split") {
    return (
      <section data-pb="hero" className="relative overflow-hidden" style={gradientBg}>
        {!heroImage && BgLayers}
        {heroImage && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(135deg, ${cssPrimary} 0%, ${cssPrimaryA(85)} 100%)`,
            }}
          />
        )}
        <div className={`relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 ${padding}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {TextColumn}
            {PhotoPanel}
            {MobileLogo}
          </div>
        </div>
      </section>
    );
  }

  // IMMERSIVE: foto full-bleed con texto encima (centrado abajo)
  if (variant === "immersive") {
    return (
      <section
        data-pb="hero"
        className="relative overflow-hidden flex items-end"
        style={{ minHeight: height === "tall" ? "78vh" : height === "compact" ? "52vh" : "66vh", ...gradientBg }}
      >
        {BgLayers}
        <div className={`relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 ${padding}`}>
          <div className="text-center">
            {Eyebrow}
            {Title}
            {Subtitle}
            {ExclusiveBadge}
            {Ctas}
            {Stats}
            {PreviewExtras}
          </div>
        </div>
      </section>
    );
  }

  // CENTERED: una columna centrada, sin bento
  if (variant === "centered") {
    return (
      <section data-pb="hero" className="relative overflow-hidden" style={gradientBg}>
        {BgLayers}
        <div className={`relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 ${padding}`}>
          {TextColumn}
        </div>
      </section>
    );
  }

  // EDITORIAL (default): imagen/gradiente + texto izq + bento der
  return (
    <section data-pb="hero" className="relative overflow-hidden" style={gradientBg}>
      {BgLayers}
      <div className={`relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 ${padding}`}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 items-center">
          {TextColumn}
          {Bento}
          {MobileLogo}
        </div>
      </div>
    </section>
  );
}
