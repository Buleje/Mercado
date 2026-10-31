/**
 * Los estados con los que se marca un documento del drive.
 *
 * Sirven para lo que uno hace con una pila de papeles: separar lo que está
 * listo de lo que hay que corregir. El color no es decoración — es la forma de
 * ver de un vistazo, sin abrir nada, cuál necesita atención.
 *
 * Client-safe a propósito: lo usan la grilla, el visor y los endpoints, para
 * que la lista de estados válidos no viva duplicada en tres lados.
 */

export const ESTADOS_DOC = ["none", "draft", "review", "observado", "approved", "archived"] as const;
export type EstadoDoc = (typeof ESTADOS_DOC)[number];

/** El orden en que se ofrecen y se muestran (de "recién empieza" a "cerrado"). */
export const ORDEN_ESTADOS: EstadoDoc[] = ["draft", "review", "observado", "approved", "archived"];

/**
 * Tono semántico de cada estado. La UI mapea el tono a los tokens del design
 * system; acá no hay clases de CSS para que este módulo sirva también en el
 * servidor.
 */
export type TonoEstado = "neutro" | "aviso" | "alerta" | "ok" | "info";

export const META_ESTADO: Record<EstadoDoc, { label: string; tono: TonoEstado; ayuda: string }> = {
  none: { label: "Sin estado", tono: "neutro", ayuda: "Todavía no lo marcaste." },
  draft: { label: "Borrador", tono: "neutro", ayuda: "Está empezado, todavía no se revisó." },
  review: { label: "En revisión", tono: "aviso", ayuda: "Alguien lo está mirando." },
  observado: { label: "Hay que corregir", tono: "alerta", ayuda: "Tiene algo mal: no usarlo así." },
  approved: { label: "Aprobado", tono: "ok", ayuda: "Está bien, se puede usar." },
  archived: { label: "Archivado", tono: "info", ayuda: "Ya no se usa, queda guardado." },
};

/** ¿Es un estado conocido? (lo que llega de la base puede ser cualquier cosa) */
export function esEstadoValido(v: string | null | undefined): v is EstadoDoc {
  return !!v && (ESTADOS_DOC as readonly string[]).includes(v);
}

/** El estado de un documento, normalizado: lo desconocido cuenta como sin estado. */
export function estadoDe(v: string | null | undefined): EstadoDoc {
  return esEstadoValido(v) ? v : "none";
}
