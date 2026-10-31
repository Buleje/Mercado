/**
 * Abre con clave el enlace de UN documento (`/d/<token>`, `/firmar/<token>`).
 * La clave va en el cuerpo de un POST, nunca en la URL (23-10: quedaba en el
 * historial y en el log); si acierta, el servidor deja la cookie de acceso con
 * la que la vista previa (`/raw`) abre sin la clave.
 */
export type AperturaDocumento =
  | { tipo: "ok"; signedUrl: string }
  | { tipo: "rechazada" | "muchas" | "fallo" };

export async function abrirDocumentoConClave(token: string, clave: string): Promise<AperturaDocumento> {
  try {
    const res = await fetch(`/api/public/documents/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: clave }),
    });
    if (res.status === 401) return { tipo: "rechazada" };
    if (res.status === 429) return { tipo: "muchas" };
    if (!res.ok) return { tipo: "fallo" };
    const data = (await res.json()) as { signedUrl?: string };
    return data.signedUrl ? { tipo: "ok", signedUrl: data.signedUrl } : { tipo: "fallo" };
  } catch {
    return { tipo: "fallo" };
  }
}

/** Texto para quien abre el documento. */
export function errorDeAperturaDocumento(tipo: "rechazada" | "muchas" | "fallo"): string {
  if (tipo === "rechazada") return "La contraseña no es correcta.";
  if (tipo === "muchas") return "Se probó muchas veces seguidas. Espera 5 minutos y vuelve a intentarlo.";
  return "No se pudo abrir. Revisa tu conexión y prueba de nuevo.";
}
