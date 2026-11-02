/**
 * Estado de la conversación en pantalla (Buleje IA, ADR-528), en funciones
 * puras: el hook `use-buleje-ia-chat` sólo las llama. Así el «se ve tu mensaje
 * al instante, después llega el de verdad» se prueba sin red ni React.
 */
import type { MensajeApp } from "@/lib/ia-proveedores/tipos";

export interface FotoLocal {
  nombre: string;
  /** `blob:` del navegador, para la miniatura mientras sube. */
  url: string;
}

/** Un mensaje como lo dibuja la pantalla: el del servidor + cómo va el envío. */
export interface MensajeVista extends MensajeApp {
  estado?: "enviando" | "error";
  error?: string;
  fotosLocales?: FotoLocal[];
}

/** Cómo quedó una tarjeta «¿Confirmas?» después de tocarla. */
export type Resolucion =
  | { estado: "enCurso"; decision: "aprobar" | "rechazar" }
  | { estado: "aprobada"; detalle: string }
  | { estado: "rechazada" }
  | { estado: "error"; detalle: string };

export const ID_TEMPORAL = "tmp-";

export function mensajeOptimista(id: string, texto: string, fotos: FotoLocal[], ahora = new Date()): MensajeVista {
  return {
    id,
    rol: "user",
    texto,
    creadoEl: ahora.toISOString(),
    estado: "enviando",
    fotosLocales: fotos.length ? fotos : undefined,
  };
}

/**
 * Llegó la respuesta: el temporal se cambia por el mensaje guardado (que trae
 * los adjuntos ya en Documentos) y se suma la respuesta del asistente. Si el
 * temporal ya no está (cambiaste de conversación), no se toca nada.
 */
export function confirmarEnvio(
  lista: MensajeVista[],
  idTemporal: string,
  usuario: MensajeApp,
  asistente: MensajeApp,
): MensajeVista[] {
  const i = lista.findIndex((m) => m.id === idTemporal);
  if (i < 0) return lista;
  const copia = lista.slice();
  copia.splice(i, 1, usuario, asistente);
  return copia;
}

export function marcarFallo(lista: MensajeVista[], idTemporal: string, error: string): MensajeVista[] {
  return lista.map((m) => (m.id === idTemporal ? { ...m, estado: "error" as const, error } : m));
}

export function marcarEnviando(lista: MensajeVista[], idTemporal: string): MensajeVista[] {
  return lista.map((m) => (m.id === idTemporal ? { ...m, estado: "enviando" as const, error: undefined } : m));
}

export function quitarMensaje(lista: MensajeVista[], id: string): MensajeVista[] {
  return lista.filter((m) => m.id !== id);
}

/** Hay un envío en curso (para mostrar «pensando…» y no mandar dos a la vez). */
export const hayEnvioEnCurso = (lista: MensajeVista[]) => lista.some((m) => m.estado === "enviando");

/** Las URL `blob:` de un mensaje temporal, para soltarlas al reemplazarlo. */
export const urlsLocales = (m: MensajeVista | undefined) => (m?.fotosLocales ?? []).map((f) => f.url);
