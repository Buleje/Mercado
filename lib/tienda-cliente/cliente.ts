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
