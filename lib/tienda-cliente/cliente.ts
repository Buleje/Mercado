/**
 * lib/tienda-cliente/cliente.ts — lo que una tienda puede saber del cliente que
 * entró con Google: nombre, correo y foto. Nada más (contrato en `./contrato.ts`).
 * Lo usan el endpoint `/api/tienda-cliente/yo` (servidor) y sus tests.
 */
import type { ClienteTienda } from "./contrato";

/** Forma mínima del usuario de Supabase que leemos (evita depender del SDK aquí). */
export interface UsuarioSupabaseMinimo {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Nombre (o el usuario del correo si Google no lo dio), correo y foto. */
export function clienteDesdeUsuario(u: UsuarioSupabaseMinimo | null | undefined): ClienteTienda | null {
  if (!u) return null;
  const meta = u.user_metadata ?? {};
  const email = texto(u.email);
  const nombre =
    texto(meta.full_name) ??
    texto(meta.name) ??
    [texto(meta.given_name), texto(meta.family_name)].filter(Boolean).join(" ");
  return {
    nombre: (nombre || (email ? email.split("@")[0] : "")).slice(0, 80),
    email,
    avatar: texto(meta.avatar_url) ?? texto(meta.picture),
    proveedor: "google",
  };
}

/**
 * El `sub` de Google del usuario de Supabase (lo que Google acepta como
 * `login_hint`). Supabase lo guarda en `user_metadata` como `provider_id` y
 * `sub`. Sólo sirve para no volver a elegir la cuenta: no es un token.
 */
export function pistaDesdeUsuario(u: UsuarioSupabaseMinimo | null | undefined): string | null {
  const meta = u?.user_metadata ?? {};
  const pista = texto(meta.provider_id) ?? texto(meta.sub);
  return pista && /^[\w.-]{1,255}$/.test(pista) ? pista : null;
}
