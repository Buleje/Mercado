/**
 * components/admin/shared/chart-palette.ts
 *
 * Paleta ÚNICA de colores de serie para los gráficos del panel admin.
 *
 * Por qué existe: cada gráfico venía eligiendo sus hex a mano — sólo
 * FinanzasModule tenía 101 literales, y entre módulos el mismo concepto
 * ("gastos", "utilidad") salía de un color distinto según quién lo dibujó.
 * Además los hex no son theme-aware: en modo oscuro quedaban fuera de tono
 * porque ningún cambio de tema los toca.
 *
 * Todo sale de los tokens `--data-*` de `app/globals.css`, que YA tienen su
 * versión clara y oscura. Nada de hex acá.
 *
 * Uso:
 *   import { SERIE, PAGO_COLOR, EJE } from "@/components/admin/shared/chart-palette";
 *   <Line stroke={SERIE.utilidad} />
 *   <XAxis tick={{ fill: EJE.texto }} />
 */

/** Rampa de series genéricas — para gráficos con N series sin semántica fija. */
export const SERIES = [
  "var(--accent)",   // teal de marca
  "var(--data-6)",   // azul
  "var(--data-7)",   // coral
  "var(--data-8)",   // violeta
  "var(--data-2)",   // gris medio
  "var(--data-3)",   // gris claro
] as const;

/**
 * Series con significado fijo en el negocio. Que "gastos" sea SIEMPRE el mismo
 * color en Mi Plata, en Analytics y en el dashboard es la mitad del trabajo de
 * que el panel se lea como un solo producto.
 */
export const SERIE = {
  ingresos:  "var(--data-success-500)",
  gastos:    "var(--data-error-500)",
  // Azul, NO el acento: `--data-success-500` ya es teal, así que con utilidad
  // en `--accent` las dos series salían del mismo color en el mismo gráfico.
  utilidad:  "var(--data-6)",
  proyeccion:"var(--data-8)",
  anterior:  "var(--text-tertiary)",
  alerta:    "var(--data-warning-500)",
} as const;

/**
 * Colores por medio de pago. Son de dominio (el morado de Yape, el celeste de
 * Plin), no decorativos: viven acá para que no se re-declaren en cada módulo.
 */
export const PAGO_COLOR: Record<string, string> = {
  efectivo:      "var(--data-success-500)",
  yape:          "var(--data-8)",
  plin:          "var(--data-6)",
  tarjeta:       "var(--data-6)",
  transferencia: "var(--data-8)",
  fiado:         "var(--data-7)",
  otro:          "var(--data-3)",
};

/** Devuelve el color de un medio de pago sin importar mayúsculas ni acentos. */
export function colorMedioPago(metodo: string | null | undefined): string {
  if (!metodo) return PAGO_COLOR.otro;
  const k = metodo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  return PAGO_COLOR[k] ?? PAGO_COLOR.otro;
}

/** Neutros del chart: ejes, grilla y texto. */
export const EJE = {
  texto:  "var(--text-tertiary)",
  grilla: "var(--rule-base)",
  linea:  "var(--rule-strong)",
} as const;
