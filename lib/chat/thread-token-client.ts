/**
 * Token de conversación del chat de invitado, lado navegador (2026-10-17).
 *
 * El servidor lo entrega al abrir el hilo (`/api/chat/public?action=open` →
 * `data.threadToken`) y lo pide para leer, escribir y escuchar ese hilo
 * (ver `lib/chat/thread-token.ts`). Se guarda en `localStorage` por hilo y,
 * si el navegador lo bloquea (modo privado, cuota), en memoria mientras dure
 * la pestaña.
 */

const PREFIJO = "buleje-chat-token-";
const enMemoria = new Map<string, string>();

export function guardarTokenHilo(threadId: string, token: string | null | undefined): void {
  if (!threadId || !token) return;
  enMemoria.set(threadId, token);
  try {
    window.localStorage.setItem(PREFIJO + threadId, token);
  } catch {
    // localStorage desactivado: queda el de memoria.
  }
}

export function leerTokenHilo(threadId: string | null | undefined): string | null {
  if (!threadId) return null;
  const propio = enMemoria.get(threadId);
  if (propio) return propio;
  try {
    return window.localStorage.getItem(PREFIJO + threadId);
  } catch {
    return null;
  }
}

export function borrarTokenHilo(threadId: string | null | undefined): void {
  if (!threadId) return;
  enMemoria.delete(threadId);
  try {
    window.localStorage.removeItem(PREFIJO + threadId);
  } catch {
    // nada que borrar
  }
}

/** Header para los GET (el token no viaja en la URL salvo en el EventSource). */
export function headersTokenHilo(threadId: string | null | undefined): Record<string, string> {
  const token = leerTokenHilo(threadId);
  return token ? { "x-chat-token": token } : {};
}
