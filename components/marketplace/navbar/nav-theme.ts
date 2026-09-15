import type { CSSProperties } from "react";

/**
 * LIGHT_SEARCH_VARS — remapea los tokens de superficie/texto/borde a sus
 * valores CLAROS, scopeados a un subárbol. Lo usa el buscador del nav (que vive
 * dentro del `<nav>` oscuro, estilo Amazon) para renderizar BLANCO con texto
 * negro — input + dropdown — sin tocar el resto del nav. El acento (teal) no se
 * toca, así el botón "Buscar" sigue turquesa.
 */
export const LIGHT_SEARCH_VARS = {
  "--surface-raised": "#ffffff",
  "--surface-canvas": "#ffffff",
  "--surface-sunken": "#f5f5f5",
  "--surface-alt": "#ececec",
  "--text-primary": "#0a0a0a",
  "--text-secondary": "#525252",
  "--text-tertiary": "#737373",
  "--rule-soft": "#eeeeee",
  "--rule-base": "#e5e5e5",
  "--rule-strong": "#171717",
} as CSSProperties;
