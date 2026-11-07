/**
 * Una sola forma de hablar con `/api/admin/ia/**` desde la app Buleje IA:
 * CSRF, sin caché y el error ya en palabras de la persona (nunca un «500» suelto).
 */
import { csrfHeaders } from "@/lib/csrf-client";

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export interface Pedido {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

/** La frase para la persona según lo que contestó el servidor. */
export function fraseDeError(status: number, delServidor?: string): string {
  if (status === 0) return "Sin conexión. Revisa tu internet y prueba otra vez.";
  if (status === 401) return "Tu sesión se cerró. Vuelve a entrar al panel.";
  if (status === 403) return delServidor || "No tienes permiso para esto. Pídeselo al dueño del negocio.";
  if (status === 413) return "Lo que mandaste pesa demasiado. Prueba con menos fotos.";
  if (status === 429) return "Vas muy rápido. Espera un momento y prueba otra vez.";
  if (delServidor) return delServidor;
  if (status === 404) return "Eso ya no existe o todavía no está listo.";
  return "Algo falló en el servidor. Prueba otra vez en un momento.";
}

function errorDelCuerpo(cuerpo: unknown): string | undefined {
  if (!cuerpo || typeof cuerpo !== "object") return undefined;
  const c = cuerpo as Record<string, unknown>;
  const e = c.error ?? c.mensaje ?? c.message;
  if (typeof e === "string" && e.trim()) return e;
  if (e && typeof e === "object" && typeof (e as Record<string, unknown>).message === "string") {
    return (e as Record<string, string>).message;
  }
  return undefined;
}

export async function pedirIa<T>(url: string, pedido: Pedido = {}): Promise<Resultado<T>> {
  const { method = "GET", json, form, signal } = pedido;
  const conCuerpo = json !== undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      cache: "no-store",
      signal,
      headers: csrfHeaders(conCuerpo ? { "Content-Type": "application/json" } : {}),
      body: form ?? (conCuerpo ? JSON.stringify(json) : undefined),
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") throw err;
    return { ok: false, status: 0, error: fraseDeError(0) };
  }
  let cuerpo: unknown = null;
  try {
    cuerpo = res.status === 204 ? null : await res.json();
  } catch {
    cuerpo = null;
  }
  if (!res.ok) return { ok: false, status: res.status, error: fraseDeError(res.status, errorDelCuerpo(cuerpo)) };
  return { ok: true, data: cuerpo as T };
}
