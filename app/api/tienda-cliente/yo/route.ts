/**
 * /api/tienda-cliente/yo — ¿quién entró con Google en esta tienda? (2026-10-11)
 *
 * GET    → `{ cliente: { nombre, email, avatar, proveedor } | null }`
 * DELETE → cierra la sesión de Google de este navegador (`{ ok: true }`).
 *
 * Por qué un endpoint: la cookie de Supabase (`sb-<proyecto>-auth-token`) es
 * httpOnly a propósito (lib/supabase/server.ts, SECURITY 2026-06-13), así que el
 * navegador no la puede leer. Aquí se valida con Supabase (`getUser`) y se
 * devuelve SÓLO lo que rellena el formulario del pedido.
 *
 * Esto NO es una sesión de cliente de la casa: no da descuentos, historial ni
 * privilegios (esa cookie se lee sólo vía `getCustomerPayload`). Sin cookie de
 * Supabase responde `null` sin llamar a nadie.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer, isSupabaseAuthConfiguredServer } from "@/lib/supabase/server";
import { clienteDesdeUsuario } from "@/lib/tienda-cliente/cliente";
import { logger } from "@/lib/logger";

const SIN_CACHE = { "Cache-Control": "private, no-store" };

/** ¿Trae la cookie de sesión de Supabase? (no cuenta el code-verifier del PKCE). */
function traeSesionSupabase(req: NextRequest): boolean {
  return req.cookies
    .getAll()
    .some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value.length > 0);
}

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfiguredServer() || !traeSesionSupabase(req)) {
    return NextResponse.json({ cliente: null }, { headers: SIN_CACHE });
  }
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return NextResponse.json({ cliente: null }, { headers: SIN_CACHE });
    return NextResponse.json({ cliente: clienteDesdeUsuario(data.user) }, { headers: SIN_CACHE });
  } catch (err) {
    logger.warn("[tienda-cliente/yo] getUser falló", { error: String(err) });
    return NextResponse.json({ cliente: null }, { headers: SIN_CACHE });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isSupabaseAuthConfiguredServer() || !traeSesionSupabase(req)) {
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  }
  try {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    logger.warn("[tienda-cliente/yo] signOut falló", { error: String(err) });
  }
  // Por si el SDK no alcanzó a limpiarlas: se vencen aquí también.
  const res = NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  for (const c of req.cookies.getAll()) {
    if (/^sb-.+-auth-token(\.\d+)?$/.test(c.name)) res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
  }
  return res;
}
