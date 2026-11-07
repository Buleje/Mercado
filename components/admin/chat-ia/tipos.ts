/**
 * Tipos del Chat IA (`components/admin/chat-ia/**`).
 *
 * Viven aparte porque los comparten el hook del chat, las filas de mensajes,
 * las tarjetas de aprobación y los botones de navegación.
 */

export type Rol = "user" | "assistant";

/** Tono de las respuestas. Es el único ajuste del chat que el servidor usa. */
export type Tono = "feynman" | "ejecutivo" | "tecnico";

/**
 * Un lugar del panel al que la respuesta puede llevarte. Lo emite el agente
 * `ui` (SSE `{accion}`) cuando la respuesta implica «anda a…»: el texto de un
 * LLM no puede navegar, y nombrar el módulo deja al usuario buscándolo a mano.
 */
export interface AccionNavegar {
  tab: string;
  vista: string | null;
  filtro: string | null;
  label: string;
  url: string;
}

/**
 * Una acción que TOCA datos y espera el sí del usuario (HITL). El servidor ya
 * guardó el pedido con su payload; acá sólo se confirma o se descarta.
 */
export interface AprobacionPendiente {
  id: string;
  tool: string;
  titulo: string;
  /** Lo que va a pasar, en una línea legible («Stock de X: 3 → 4»). */
  resumen?: string | null;
  payload: Record<string, unknown>;
  /** Qué pasó al resolverla — para no dejar la tarjeta viva después del clic. */
  estado?: "hecha" | "cancelada" | "error";
  detalle?: string;
}

export interface Message {
  id: string;
  role: Rol;
  content: string;
  timestamp: number;
  error?: boolean;
  /** Botones «Abrir X» que acompañan a la respuesta. */
  acciones?: AccionNavegar[];
  /** Acciones de escritura esperando confirmación. */
  aprobaciones?: AprobacionPendiente[];
}

export type ResolverAprobacion = (id: string, accion: "approve" | "reject") => void;
