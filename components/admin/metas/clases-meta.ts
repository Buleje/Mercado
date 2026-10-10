/**
 * components/admin/metas/clases-meta.ts — las clases que comparten la vista de
 * metas, la tarjeta, el modal y las plantillas (ADR-488).
 *
 * Botones de 40 px (h-10) como mínimo: los de 28 px de la pantalla vieja no se
 * acertaban con el dedo. Color sólo por tokens; el verde/ámbar/rojo del estado
 * es el de los datos (`--data-*`), con su par -700/-500 para leerse en claro y
 * en oscuro.
 */
import type { EstadoMeta } from "@/lib/admin/metas-periodo";

const BOTON =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

/** `--accent-dark` es el mismo teal oscuro en los dos temas: el blanco encima da AA. */
export const BOTON_PRIMARIO = `${BOTON} bg-[var(--accent-dark)] text-white shadow-sm hover:brightness-110`;
export const BOTON_SECUNDARIO = `${BOTON} border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]`;

/** Chip de filtro o de elección (período, plantilla). */
export function claseChip(activo: boolean): string {
  return `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
    activo
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
  }`;
}

/** El select de área de la cabecera y los campos del modal (el alto lo pone cada uso: h-10 o h-11). */
export const CAMPO =
  "w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

export type TonoMeta = "exito" | "aviso" | "error" | "neutro";

/**
 * Texto chico de color (la línea de estado, el resumen): `-ink`, que ya trae su
 * variante oscura. El `-700` del preset del panel daba 4,13:1 sobre blanco en
 * el ámbar (medido 09-10 en la tarjeta): no llega a AA en 14 px.
 */
export const TEXTO_TONO: Readonly<Record<TonoMeta, string>> = {
  exito: "text-[var(--data-success-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
  neutro: "text-[var(--text-secondary)]",
};

/** Relleno de la barra según cómo va la meta. */
export const RELLENO_ESTADO: Readonly<Record<EstadoMeta, string>> = {
  cumplida: "bg-[var(--data-success)]",
  en_camino: "bg-[var(--data-success)]",
  atrasada: "bg-[var(--data-warning)]",
  pasada_del_tope: "bg-[var(--data-error)]",
  no_cumplida: "bg-[var(--data-error)]",
  sin_dato: "bg-[var(--text-tertiary)]",
};

/** Cómo se cuenta cada estado en el resumen («3 en camino»). */
export const NOMBRE_ESTADO: Readonly<Record<EstadoMeta, [singular: string, plural: string]>> = {
  cumplida: ["cumplida", "cumplidas"],
  en_camino: ["en camino", "en camino"],
  atrasada: ["atrasada", "atrasadas"],
  pasada_del_tope: ["pasada del tope", "pasadas del tope"],
  no_cumplida: ["no cumplida", "no cumplidas"],
  sin_dato: ["sin dato", "sin dato"],
};

export const TONO_ESTADO: Readonly<Record<EstadoMeta, TonoMeta>> = {
  cumplida: "exito",
  en_camino: "exito",
  atrasada: "aviso",
  pasada_del_tope: "error",
  no_cumplida: "error",
  sin_dato: "neutro",
};

/** Arriba lo que pide atención: pasada del tope, atrasada… y al final lo cumplido. */
export const PRIORIDAD_ESTADO: Readonly<Record<EstadoMeta, number>> = {
  pasada_del_tope: 0,
  atrasada: 1,
  en_camino: 2,
  sin_dato: 3,
  no_cumplida: 4,
  cumplida: 5,
};
