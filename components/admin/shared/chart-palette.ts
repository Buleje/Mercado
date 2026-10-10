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
 *   import { COLOR_CONCEPTO, SERIE, PAGO_COLOR, EJE, TICK } from "@/components/admin/shared/chart-palette";
 *   import { ChartTooltip } from "@/components/admin/shared/ChartTooltip";
 *   <Bar dataKey="ventas" fill={COLOR_CONCEPTO.ventas} />
 *   <XAxis tick={TICK} stroke={EJE.grilla} />
 *   <Tooltip content={<ChartTooltip formato={soles} />} />
 *
 * Tema ÚNICO de los gráficos del panel (contrato de diseño, ADR-489): colores
 * por concepto (`COLOR_CONCEPTO`), series sin semántica (`SERIES`), neutros
 * (`EJE`), tamaño de eje (`TICK`) y tooltip (`ChartTooltip.tsx`). Un hex en
 * `fill`/`stroke` de un archivo con recharts lo marca `ds-no-hex-chart`
 * (scripts/lint-design-tokens.ts).
 */

/**
 * Un color por concepto, el mismo en todas las pestañas. Vive en
 * lib/admin/inicio/formato-tablero.ts (lo importan ~40 archivos desde ahí y
 * así siguen); acá se reexporta para que el tema esté en un solo import.
 */
export { COLOR_CONCEPTO, type ConceptoTablero } from "@/lib/admin/inicio/formato-tablero";

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

/**
 * Tamaño de eje ÚNICO (hoy conviven 7: 8 a 14 px). 12 px = `--ts-xs`, el del
 * Inicio. Uso: `<XAxis tick={TICK} />`. Para cambiar el color de un eje
 * puntual: `tick={{ ...TICK, fill: EJE.linea }}`.
 */
export const TICK = { fontSize: 12, fill: EJE.texto } as const;
