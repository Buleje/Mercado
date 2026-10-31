/**
 * ADR-513 — para qué dominio vale la passkey (rpId) y desde qué origen se acepta.
 *
 * NUNCA se confía en el `Origin` que manda el navegador sin una lista: sale de
 * la configuración. Si el origen del pedido no está en la lista, no hay
 * ceremonia (`null`). El rpId es el host de ese origen: una passkey registrada
 * en `localhost` no sirve en el dominio del túnel ni en producción, y al
 * cambiar de dominio se registra de nuevo.
 *
 * La lista:
 *  - el origen de `NEXT_PUBLIC_BASE_URL` (es el que llevan los enlaces de firma);
 *  - `PASSKEY_ORIGENES` (coma), con comodín de subdominio: `https://*.buleje.pe`;
 *  - fuera de producción, además, `localhost`/`127.0.0.1` en cualquier puerto y
 *    los túneles de `allowedDevOrigins` (`next.config.ts`) por https.
 *
 * Puro: recibe el entorno, así se prueba sin tocar `process.env`.
 */

export type EntornoRp = { baseUrl?: string; origenes?: string; produccion: boolean };

const TUNELES_DEV = ["https://*.trycloudflare.com", "https://*.ngrok-free.app", "https://*.ngrok.io", "https://buleje-panel.*.ts.net"];

function normalizar(origen: string): URL | null {
  try {
    const u = new URL(origen);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u;
  } catch {
    return null;
  }
}

/** `https://*.x.com` → el host termina en `.x.com`; `https://a.*.ts.net` → un tramo comodín en el medio. */
function encajaPatron(u: URL, patron: string): boolean {
  const m = /^(https?):\/\/([^/]+)$/.exec(patron.trim().replace(/\/$/, ""));
  if (!m) return false;
  if (`${m[1]}:` !== u.protocol) return false;
  const host = u.host.toLowerCase();
  const p = m[2].toLowerCase();
  if (!p.includes("*")) return host === p;
  const re = new RegExp(`^${p.split("*").map((t) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9-]+(?:\\.[a-z0-9-]+)*")}$`);
  return re.test(host);
}

export function patronesPermitidos(e: EntornoRp): string[] {
  const lista: string[] = [];
  const base = e.baseUrl ? normalizar(e.baseUrl) : null;
  if (base) lista.push(base.origin);
  for (const o of (e.origenes ?? "").split(",")) if (o.trim()) lista.push(o.trim());
  if (!e.produccion) lista.push(...TUNELES_DEV);
  return lista;
}

const ES_LOCAL = new Set(["localhost", "127.0.0.1"]);

/** El origen y el rpId de la ceremonia, o `null` si ese origen no está en la lista. */
export function rpDelOrigen(origen: string | null | undefined, e: EntornoRp): { origin: string; rpId: string } | null {
  if (!origen) return null;
  const u = normalizar(origen);
  if (!u || u.origin !== origen.replace(/\/$/, "")) return null;
  const local = !e.produccion && ES_LOCAL.has(u.hostname);
  /* WebAuthn exige contexto seguro: http sólo en localhost. */
  if (u.protocol === "http:" && !ES_LOCAL.has(u.hostname)) return null;
  if (!local && !patronesPermitidos(e).some((p) => encajaPatron(u, p))) return null;
  return { origin: u.origin, rpId: u.hostname };
}

export function entornoRp(): EntornoRp {
  return {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
    origenes: process.env.PASSKEY_ORIGENES,
    produccion: process.env.NODE_ENV === "production",
  };
}
