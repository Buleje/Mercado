import { csrfHeaders } from "@/lib/csrf-client";

/**
 * Crea un enlace de carpeta de siempre por cada carpeta, con los mismos días y
 * clave, en UNA llamada (`folders/share-lote`): una por carpeta gastaba el tope
 * de 10 cada 15 minutos con un solo envío. Si algo falla a mitad, el servidor
 * corta los que ya creó: un enlace a medias no se entrega.
 */

export type ResultadoEnlaces =
  | { ok: true; tokens: string[]; vence: string }
  | { ok: false; error: string };

function motivo(status: number): string {
  if (status === 403) return "no tienes permiso para compartirlas";
  if (status === 404) return "alguna carpeta ya no existe";
  if (status === 429) return "se llegó al tope de enlaces por ahora; espera unos minutos y prueba otra vez";
  if (status === 401) return "tu sesión venció; vuelve a entrar";
  return "el servidor no respondió bien";
}

export async function crearEnlacesDeCarpetas(
  carpetas: { id: string; name: string }[],
  opciones: { dias: number; clave?: string },
  alAvanzar: (hechas: number) => void,
): Promise<ResultadoEnlaces> {
  const error = (por: string): ResultadoEnlaces => ({ ok: false, error: `No se pudo compartir: ${por}. No se armó el enlace.` });
  try {
    const res = await fetch("/api/admin/documents/folders/share-lote", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        folderIds: carpetas.map((c) => c.id),
        expiresInDays: opciones.dias,
        ...(opciones.clave ? { password: opciones.clave } : {}),
      }),
    });
    if (!res.ok) return error(motivo(res.status));
    const d = (await res.json().catch(() => null)) as { enlaces?: { folderId?: unknown; token?: unknown }[]; expiresAt?: unknown } | null;
    // En el orden en que se eligieron: la primera es la que abre el enlace.
    const porCarpeta = new Map((d?.enlaces ?? []).map((e) => [e.folderId, e.token] as const));
    const tokens = carpetas.map((c) => porCarpeta.get(c.id)).filter((t): t is string => typeof t === "string");
    if (tokens.length !== carpetas.length || typeof d?.expiresAt !== "string") return error(motivo(500));
    alAvanzar(tokens.length);
    return { ok: true, tokens, vence: d.expiresAt };
  } catch {
    return error("se cortó la conexión");
  }
}
