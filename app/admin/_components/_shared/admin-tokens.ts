/**
 * admin-tokens.ts — clases tailwind canónicas para todo el panel
 * `/admin/store-page`. Toda tab debe usar estos tokens en lugar de
 * inventar colores, radii o tamaños propios.
 *
 * Filosofia: Holded/Linear — sin emojis, sin saturacion, jerarquia
 * tipografica clara, botones neutros con accent solo en hover.
 */

/**
 * 2026-04-26 — Unificación premium: la jerarquía tipográfica del superadmin
 * y del admin se equipara al hero de /superadmin/marca y /superadmin/banners
 * para tener un look cohesivo (font-display serif + kicker + icon badge).
 *
 * Cambios clave:
 *  - headingH2: text-xl font-bold → text-2xl sm:text-3xl font-extrabold + font-display
 *  - kicker: tracking más cerrado + color accent
 *  - Nuevos: headingHero, headerBar, iconBadge, statPill — para el hero estilo premium
 */

export const ADMIN_TOKENS = {
  /** Heading hero (premium) — h1 grande con font-display. Para top de página. */
  headingHero:
    "font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]",
  /** Heading principal del tab (h2). Premium serif por defecto. */
  headingH2:
    "font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]",
  /** Heading de seccion dentro del tab (h3). */
  headingH3: "font-display text-lg font-bold text-[var(--text-primary)] tracking-tight",
  /** Texto de cuerpo / descripciones. */
  bodyText: "text-sm text-[var(--text-secondary)]",
  /** Texto de cuerpo grande para descripción del hero. */
  bodyTextLg: "text-sm sm:text-base text-[var(--text-secondary)]",
  /** Kicker uppercase (label encima de heading o sectionizing). Color accent. */
  kicker:
    "text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]",
  /** Header bar premium — fondo surface-raised + border bottom para top de página. */
  headerBar:
    "border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8",
  /** Icon badge premium — cuadrado teal, ideal a la izquierda del título hero. */
  iconBadge:
    "inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shrink-0",
  /** Stat pill — card pequeña para stats en el header (ej. "23 banners totales"). */
  statPill:
    "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]",
  /** Card base — el que se usa para casi todos los containers. */
  card:
    "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
  /** Card con padding y space-y. Mas comodo que escribir las clases siempre. */
  cardPadded:
    "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 space-y-4",
  /** Boton primario admin: neutro pro con accent en hover. */
  btnPrimary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-2 text-sm font-bold hover:bg-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
  /** Boton secundario / discard. */
  btnSecondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-primary)] px-4 py-2 text-sm font-semibold hover:border-[var(--accent)]/40 transition-colors",
  /** Boton ghost / link discreto. */
  btnGhost:
    "inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors",
  /** Input base. Aplicar a inputs, selects, textareas. */
  input:
    "w-full rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 transition-shadow",
  /** Label de un campo. */
  label: "text-sm font-semibold text-[var(--text-primary)]",
  /** Hint debajo del label. */
  hint:
    "text-[length:var(--ts-xs)] text-[var(--text-tertiary)]",
  /** Spacing vertical canonico entre secciones del tab. */
  sectionGap: "space-y-6",
  /** Chip accent (ej "Universal", "Beta"). */
  chipAccent:
    "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]",
  /** Chip muted (info secundaria). */
  chipMuted:
    "inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]",
  /** Banner de error. */
  errorBanner:
    "rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 px-4 py-2 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
  /** Banner de exito. */
  successBanner:
    "rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 px-4 py-2 text-sm text-[var(--data-success-700)] dark:text-emerald-300",
} as const;
