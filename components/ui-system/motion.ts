"use client";

import type { Variants, Transition } from "framer-motion";

/**
 * Editorial motion system.
 * Curves y durations consistentes. Reduced-motion manejado por framer automáticamente
 * via useReducedMotion() — estas variantes SIEMPRE respetan el preference del usuario
 * porque usan transform y opacity (auto-flattened por framer-motion cuando reduced-motion).
 */

/**
 * v4 — 6 curvas canonicas (ADR-062). Mantenemos aliases legacy (expo,
 * bounceSoft) como alias hacia las nuevas para no romper imports existentes.
 */
export const EASE = {
  // Curvas v4 oficiales
  editorial: [0.22, 1, 0.36, 1] as const,   // smooth out (Linear/Apple). Default entrada.
  snap: [0.4, 0, 0.1, 1] as const,          // Press/tap. Mas agresivo.
  soft: [0.4, 0, 0.2, 1] as const,          // Transiciones UI suaves (hover, theme).
  entrance: [0.16, 1, 0.3, 1] as const,     // Modals, sheets, dropdowns al aparecer.
  exit: [0.7, 0, 0.84, 0] as const,         // Salida rapida, uso con modals.
  bounce: [0.34, 1.56, 0.64, 1] as const,   // Success/celebracion. Uso escaso.

  // Aliases legacy (deprecated, usar arriba)
  expo: [0.16, 1, 0.3, 1] as const,
  bounceSoft: [0.34, 1.32, 0.64, 1] as const,
} as const;

export const DURATION = {
  instant: 0.08,
  fast: 0.15,
  base: 0.25,
  slow: 0.4,
  deliberate: 0.6,
  theatrical: 0.8,
} as const;

/* ─── Basic entry variants ─── */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE.editorial },
  },
};

export const fadeUpLarge: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE.editorial },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.slow } },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.base, ease: EASE.editorial },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -24 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: DURATION.base, ease: EASE.editorial },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION.base, ease: EASE.bounceSoft },
  },
};

/* ─── Stagger containers ─── */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE.editorial },
  },
};

/* ─── Hover transitions ─── */
export const hoverLift: Transition = {
  duration: DURATION.base,
  ease: EASE.editorial,
};

/* ─── Scroll-reveal presets (framer whileInView) ─── */
export const scrollRevealPresets = {
  fadeUp: {
    initial: "hidden",
    whileInView: "show",
    viewport: { once: true, amount: 0.2 },
    variants: fadeUp,
  },
  staggered: {
    initial: "hidden",
    whileInView: "show",
    viewport: { once: true, amount: 0.15 },
    variants: staggerContainer,
  },
} as const;

/* ─── Page transitions ─── */
export const pageEnter: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE.editorial },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: DURATION.fast },
  },
};

/* ─── Drawer / sheet (used with vaul/radix) ─── */
export const drawerVariants: Variants = {
  hidden: { x: "100%" },
  show: {
    x: 0,
    transition: { duration: DURATION.base, ease: EASE.editorial },
  },
  exit: {
    x: "100%",
    transition: { duration: DURATION.base, ease: EASE.editorial },
  },
};

/* ─── v4 — nuevos presets canonicos ─── */

/** Tap / press feedback — uso con <motion.button whileTap={tapPress}> */
export const tapPress = {
  scale: 0.97,
  transition: { duration: DURATION.instant, ease: EASE.snap },
};

/** Soft hover para cards — uso con <motion.div whileHover={hoverSoft}> */
export const hoverSoft = {
  y: -2,
  transition: { duration: DURATION.fast, ease: EASE.soft },
};

/** Number flow update con bounce sutil — para KPIs que cambian */
export const numberBeat: Variants = {
  hidden: { scale: 0.95, opacity: 0.8 },
  show: {
    scale: 1,
    opacity: 1,
    transition: { duration: DURATION.base, ease: EASE.bounce },
  },
};

/** Modal entrance usando entrance + exit curves */
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.entrance },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -4,
    transition: { duration: DURATION.fast, ease: EASE.exit },
  },
};

/** Popover entrance — mas rapido que modal */
export const popoverVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DURATION.fast, ease: EASE.entrance },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -4,
    transition: { duration: DURATION.instant, ease: EASE.exit },
  },
};

/** Stagger fino para listas — uso en <motion.ul variants={listStagger}> */
export const listStagger: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

/** Reveal on view — uso <motion.div {...revealOnView} /> */
export const revealOnView = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, amount: 0.15, margin: "0px 0px -80px 0px" },
  variants: fadeUp,
} as const;

/** Reveal staggered list on view — contenedor + hijos auto */
export const revealStaggered = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, amount: 0.1 },
  variants: listStagger,
} as const;
