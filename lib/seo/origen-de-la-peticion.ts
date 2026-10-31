import "server-only";
import { headers } from "next/headers";

/**
 * El dominio con el que ENTRÓ esta petición («https://mercado-hazel.vercel.app»,
 * «https://musa.pe», «http://localhost:3000»), para las URL absolutas de lo que
 * se comparte (canónica, `og:url`, `og:image`).
 *
 * Por qué: `NEXT_PUBLIC_BASE_URL` y el `metadataBase` del layout dicen
 * `https://www.buleje.pe`, que no existe (NXDOMAIN, medido 11-10): la tarjeta de
 * un enlace compartido por WhatsApp salía sin imagen. El host de la petición es
 * por definición un dominio que contesta.
 *
 * Sólo acepta un host con forma de host (letras, dígitos, `.`, `-` y puerto):
 * cualquier otra cosa cae a `NEXT_PUBLIC_BASE_URL`. En Vercel el host lo valida
 * la plataforma (sólo llegan los dominios del proyecto).
 */
const HOST_VALIDO = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export async function origenDeLaPeticion(): Promise<string> {
  const respaldo = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]?.trim() ?? "";
    if (!HOST_VALIDO.test(host)) return respaldo;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) || host.endsWith(".localhost") || /\.localhost:\d+$/.test(host);
    const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
    const esquema = proto === "http" || proto === "https" ? proto : local ? "http" : "https";
    return `${esquema}://${host}`;
  } catch {
    return respaldo;
  }
}
