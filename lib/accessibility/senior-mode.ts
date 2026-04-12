import "server-only";

/**
 * ROADMAP ITEM #71 — Modo senora mayor (accessibility preset)
 *
 * Preset accesible para clientes mayores: fuentes grandes, contrast alto,
 * iconos XL, botones de 60px+, sin animaciones. Se activa como cookie del
 * lado del cliente (`ux_preset=senior`) que el layout lee y aplica clases
 * globales `senior-mode` al <body>.
 */

export const SENIOR_MODE_COOKIE = "ux_preset";
export const SENIOR_MODE_VALUE = "senior";

export const SENIOR_MODE_CLASS = "senior-mode";

/**
 * CSS utility classnames the rest of the app can conditionally use.
 * Keep this list short and stable — styles live in globals.css under
 * `body.senior-mode` selectors.
 */
export const SENIOR_CLASS_TOKENS = {
  body: "senior-mode",
  btnLarge: "senior-btn",
  textLg: "senior-text",
  cardLg: "senior-card",
} as const;
