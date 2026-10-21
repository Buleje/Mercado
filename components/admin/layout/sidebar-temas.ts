/**
 * Temas, densidades y acentos de la barra lateral del panel — un solo mapa
 * (Brandon 2026-10-20: «mejórame los diseños… en Ejecutivo que estén un poco
 * más separados los enlaces… y puedes añadir otros diseños»).
 *
 * Antes cada pieza (AdminSidebar, SidebarEnlacesSueltos, la vista previa del
 * configurador) decidía sus colores con `isDarkTheme ? … : …`: un tema nuevo
 * obligaba a tocar 20 ternarios y el texto activo de un fondo claro salía
 * blanco. Ahora cada tema trae TODO lo que se dibuja (fondo, texto, hover,
 * activo con su texto, íconos, chevrons) y las vistas previas usan las MISMAS
 * clases: lo que se ve en la tarjeta es lo que queda en la barra.
 *
 * Contraste del texto en reposo sobre su fondo (medido en el navegador,
 * 2026-10-20): todos ≥ 7:1.
 */
import type { AccentColor, Density } from "@/components/admin/shared/SidebarConfigurator";

export type SidebarTheme =
  | "light"
  | "dark"
  | "cristal"
  | "shaded"
  | "buleje"
  | "minimal"
  | "bosque"
  | "noche"
  | "vibrante"
  | "arena";

/** Lo que entiende la barra superior (AdminTopHeader sólo conoce estos 5). */
export type FamiliaTema = "light" | "dark" | "cristal" | "shaded" | "buleje";

export interface EstiloBarra {
  bg: string;
  /** Texto en reposo. */
  text: string;
  /** Fondo + texto al pasar el mouse. */
  hover: string;
  border: string;
  /** Fila activa: fondo, texto y peso. */
  activeItem: string;
  headerBorder: string;
  iconoActivo: string;
  /** Ícono de un enlace de segundo nivel en reposo. */
  iconoSub: string;
  chevron: string;
  oscuro: boolean;
  /** La barra de acento del activo con halo (temas de marca) o sin él (sobrios). */
  barraBrillo: boolean;
  familia: FamiliaTema;
  flyout: "light" | "dark" | "cristal";
}

const BULEJE: EstiloBarra = {
  // Halo del acento arriba + degradado azul profundo (identidad de marca).
  bg: "bg-[radial-gradient(ellipse_120%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_18%,transparent)_0%,transparent_60%),linear-gradient(180deg,#0b1f2b_0%,#0a1922_50%,#091621_100%)] dark:bg-[radial-gradient(ellipse_120%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_14%,transparent)_0%,transparent_60%),linear-gradient(180deg,#050e15_0%,#040a10_50%,#03070d_100%)]",
  text: "text-white/75",
  hover: "hover:bg-linear-to-r hover:from-white/[0.07] hover:to-white/[0.02] hover:text-white",
  border: "border-[color-mix(in_oklab,var(--accent)_25%,transparent)]",
  // Píldora de marca (sin cambios desde v2): degradado + filo + halo del acento.
  activeItem:
    "bg-linear-to-r from-[color-mix(in_oklab,var(--accent)_42%,transparent)] via-[color-mix(in_oklab,var(--accent)_28%,transparent)] to-[color-mix(in_oklab,var(--accent)_10%,transparent)] text-white font-semibold shadow-[inset_4px_0_0_var(--accent),0_2px_16px_-2px_color-mix(in_oklab,var(--accent)_55%,transparent)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_35%,transparent)]",
  headerBorder: "border-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
  iconoActivo: "text-[color-mix(in_oklab,var(--accent)_60%,white)] drop-shadow-[0_0_6px_color-mix(in_oklab,var(--accent)_50%,transparent)]",
  iconoSub: "text-white/50",
  chevron: "text-white/40 group-hover:text-white/70",
  oscuro: true,
  barraBrillo: true,
  familia: "buleje",
  flyout: "cristal",
};

const TEMAS: Record<SidebarTheme, EstiloBarra> = {
  buleje: BULEJE,
  cristal: BULEJE,
  shaded: BULEJE,
  // Ejecutivo: grafito sobrio, sin halos; el activo es una placa clara con filo.
  dark: {
    bg: "bg-zinc-950",
    text: "text-zinc-300",
    hover: "hover:bg-white/[0.07] hover:text-white",
    border: "border-white/[0.08]",
    activeItem: "bg-white/[0.1] text-white font-semibold ring-1 ring-inset ring-white/[0.14]",
    headerBorder: "border-white/[0.08]",
    iconoActivo: "text-[color-mix(in_oklab,var(--accent)_65%,white)]",
    iconoSub: "text-zinc-500",
    chevron: "text-zinc-500 group-hover:text-zinc-300",
    oscuro: true,
    barraBrillo: false,
    familia: "dark",
    flyout: "dark",
  },
  // Sereno: claro con el acento como tinte (hover y activo), íconos de color.
  light: {
    bg: "bg-[var(--surface-raised)]",
    text: "text-[var(--text-secondary)]",
    hover: "hover:bg-[color-mix(in_oklab,var(--accent)_9%,transparent)] hover:text-[var(--text-primary)]",
    border: "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
    activeItem:
      "bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-[var(--text-primary)] font-semibold ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_32%,transparent)]",
    headerBorder: "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
    iconoActivo: "text-[color-mix(in_oklab,var(--accent)_70%,black)] dark:text-[var(--accent)]",
    iconoSub: "text-[var(--text-tertiary)]",
    chevron: "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]",
    oscuro: false,
    barraBrillo: false,
    familia: "light",
    flyout: "light",
  },
  // Mínimo: lienzo blanco, gris neutro y el acento SOLO en la rayita del activo.
  minimal: {
    bg: "bg-[var(--surface-canvas)]",
    text: "text-[var(--text-secondary)]",
    hover: "hover:bg-[color-mix(in_oklab,var(--text-primary)_5%,transparent)] hover:text-[var(--text-primary)]",
    border: "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
    activeItem: "bg-[color-mix(in_oklab,var(--text-primary)_7%,transparent)] text-[var(--text-primary)] font-semibold",
    headerBorder: "border-[var(--rule-soft)] dark:border-[var(--rule-base)]",
    iconoActivo: "text-[var(--text-primary)]",
    iconoSub: "text-[var(--text-tertiary)]",
    chevron: "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]",
    oscuro: false,
    barraBrillo: false,
    familia: "light",
    flyout: "light",
  },
  // Arena: crema cálido (un toque ámbar sobre la superficie; en oscuro, tierra), activo del acento.
  arena: {
    bg: "bg-[color-mix(in_oklab,var(--data-warning-500)_7%,var(--surface-raised))]",
    text: "text-[var(--text-secondary)]",
    hover: "hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] hover:text-[var(--text-primary)]",
    border: "border-[color-mix(in_oklab,var(--data-warning-500)_22%,var(--rule-soft))]",
    activeItem:
      "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--text-primary)] font-semibold ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
    headerBorder: "border-[color-mix(in_oklab,var(--data-warning-500)_22%,var(--rule-soft))]",
    iconoActivo: "text-[color-mix(in_oklab,var(--accent)_70%,black)] dark:text-[var(--accent)]",
    iconoSub: "text-[var(--text-tertiary)]",
    chevron: "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]",
    oscuro: false,
    barraBrillo: false,
    familia: "light",
    flyout: "light",
  },
  // Bosque: verde profundo del monte (forestal), activo esmeralda.
  bosque: {
    // Verde de base + un claro de luz del acento arriba (como el sol entre los árboles).
    bg: "bg-green-950 bg-[radial-gradient(ellipse_120%_55%_at_50%_0%,color-mix(in_oklab,var(--accent)_16%,transparent)_0%,transparent_65%)]",
    text: "text-white/75",
    hover: "hover:bg-white/[0.08] hover:text-white",
    border: "border-[color-mix(in_oklab,var(--accent)_22%,transparent)]",
    activeItem:
      "bg-[color-mix(in_oklab,var(--accent)_24%,transparent)] text-white font-semibold ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_40%,transparent)]",
    headerBorder: "border-[color-mix(in_oklab,var(--accent)_22%,transparent)]",
    iconoActivo: "text-[color-mix(in_oklab,var(--accent)_45%,white)]",
    iconoSub: "text-white/50",
    chevron: "text-white/40 group-hover:text-white/75",
    oscuro: true,
    barraBrillo: true,
    familia: "dark",
    flyout: "dark",
  },
  // Noche: negro neutro de alto contraste; el activo se invierte (placa blanca).
  noche: {
    bg: "bg-neutral-950",
    text: "text-white/90",
    hover: "hover:bg-white/[0.12] hover:text-white",
    border: "border-white/[0.16]",
    activeItem: "bg-white/95 text-neutral-950 font-semibold",
    headerBorder: "border-white/[0.16]",
    iconoActivo: "text-neutral-950",
    iconoSub: "text-white/60",
    chevron: "text-white/60 group-hover:text-white",
    oscuro: true,
    barraBrillo: false,
    familia: "dark",
    flyout: "dark",
  },
  // Vibrante: morado intenso con el acento en una píldora encendida.
  vibrante: {
    bg: "bg-purple-950 bg-[radial-gradient(ellipse_120%_60%_at_50%_0%,color-mix(in_oklab,var(--accent)_24%,transparent)_0%,transparent_65%)]",
    text: "text-white/75",
    hover: "hover:bg-white/[0.08] hover:text-white",
    border: "border-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
    activeItem:
      "bg-linear-to-r from-[color-mix(in_oklab,var(--accent)_55%,transparent)] to-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-white font-semibold ring-1 ring-inset ring-white/20",
    headerBorder: "border-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
    iconoActivo: "text-white",
    iconoSub: "text-white/50",
    chevron: "text-white/40 group-hover:text-white/70",
    oscuro: true,
    barraBrillo: true,
    familia: "dark",
    flyout: "cristal",
  },
};

export function estiloDeTema(t: SidebarTheme): EstiloBarra {
  return TEMAS[t] ?? BULEJE;
}

/** «cristal» y «shaded» son alias viejos de «buleje»: se dibujan igual. */
export function normalizarTema(t: SidebarTheme): SidebarTheme {
  return t === "cristal" || t === "shaded" ? "buleje" : t;
}

/** Los temas que se eligen en «Tema de fondo», en orden. */
export const TEMAS_ELEGIBLES: Array<{ id: SidebarTheme; label: string }> = [
  { id: "buleje", label: "Marca" },
  { id: "dark", label: "Grafito" },
  { id: "light", label: "Claro" },
  { id: "minimal", label: "Mínimo" },
  { id: "arena", label: "Arena" },
  { id: "bosque", label: "Bosque" },
  { id: "noche", label: "Noche" },
  { id: "vibrante", label: "Morado" },
];

// ─── Densidad: alto de fila Y separación (antes sólo el padding, con 1 px entre filas) ───

export interface Densidad {
  /** Padding + margen inferior de una fila de primer nivel. */
  fila: string;
  gap: string;
  /** Alto mínimo de un enlace de segundo nivel. */
  sub: string;
  subEspacio: string;
  separador: string;
}

/* Medido 2026-10-20 (fila de 14 px): compacta 33+1 → 37+2, normal 41+1 → 41+4,
   amplia 45+1 → 45+6. El «muy juntos» era el 1 px entre filas: los hovers y el
   activo se tocaban y la lista se leía como un bloque. */
export const DENSIDADES: Record<Density, Densidad> = {
  compact: { fila: "px-2.5 py-2 mb-0.5", gap: "gap-2.5", sub: "min-h-9", subEspacio: "space-y-0.5", separador: "my-2" },
  normal: { fila: "px-3 py-2.5 mb-1", gap: "gap-3", sub: "min-h-10", subEspacio: "space-y-1", separador: "my-2.5" },
  spacious: { fila: "px-3.5 py-3 mb-1.5", gap: "gap-3.5", sub: "min-h-11", subEspacio: "space-y-1", separador: "my-3" },
};

// ─── Acentos: un solo mapa (antes 3 copias en el configurador y la barra) ───

export const COLOR_DE_ACENTO: Record<AccentColor, string> = {
  teal: "var(--accent-buleje, #00A29C)",
  emerald: "#10B981",
  sky: "#0EA5E9",
  violet: "#8B5CF6",
  amber: "#ff6b5b",
  rose: "#F43F5E",
};

// ─── Guardado: la barra superior sólo entiende la «familia» ───

const CLAVE_TEMA = "admin-sidebar-theme";
/** Diseño exacto cuando no es uno de los 5 que entiende la barra superior (2026-10-20). */
const CLAVE_VARIANTE = "admin-sidebar-theme-variante";
const FAMILIAS = new Set<string>(["light", "dark", "cristal", "shaded", "buleje"]);

/* La barra superior (AdminTopHeader) lee `admin-sidebar-theme` al montar y,
   si no lo conoce, se pinta como «buleje» hasta el primer evento: un tema
   nuevo guardado ahí parpadeaba azul en cada carga. Por eso la clave vieja
   guarda la familia y la variante va aparte. */
export function leerTema(): SidebarTheme {
  try {
    const base = localStorage.getItem(CLAVE_TEMA);
    const variante = localStorage.getItem(CLAVE_VARIANTE) as SidebarTheme | null;
    if (variante && variante in TEMAS && !FAMILIAS.has(variante) && TEMAS[variante].familia === base) return variante;
    if (base && FAMILIAS.has(base)) return base as SidebarTheme;
  } catch {
    /* sin almacenamiento: el de fábrica */
  }
  return "buleje";
}

export function guardarTema(t: SidebarTheme): void {
  try {
    localStorage.setItem(CLAVE_TEMA, estiloDeTema(t).familia === t ? t : estiloDeTema(t).familia);
    if (FAMILIAS.has(t)) localStorage.removeItem(CLAVE_VARIANTE);
    else localStorage.setItem(CLAVE_VARIANTE, t);
  } catch {
    /* sin almacenamiento */
  }
}
