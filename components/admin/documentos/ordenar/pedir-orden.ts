import { csrfHeaders } from "@/lib/csrf-client";
import { SOLO_LECTURA } from "@/lib/client-cache-fetch";

/** El pedido a «Ordenar mi Archivo» (plan, aplicar, deshacer), con errores en palabras. */

export const URL_ORDENAR = "/api/admin/documents/ordenar";

export async function pedirOrden<T>(cuerpo: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const r = await fetch(URL_ORDENAR, {
    method: "POST",
    credentials: "include",
    // El plan sólo consulta: sin la marca, el caché del cliente lo toma por escritura y borra la lista del Archivo.
    headers: csrfHeaders({ "Content-Type": "application/json", ...(cuerpo.modo === "plan" ? { [SOLO_LECTURA]: "1" } : {}) }),
    body: JSON.stringify(cuerpo),
    signal,
  });
  if (!r.ok) {
    throw new Error(
      r.status === 429 ? "Hiciste muchos cambios seguidos: espera unos minutos y vuelve a intentar."
      : r.status === 401 || r.status === 403 ? "Tu sesión no puede ordenar el Archivo."
      : "No se pudo revisar el Archivo. Vuelve a intentar.",
    );
  }
  return (await r.json()) as T;
}
