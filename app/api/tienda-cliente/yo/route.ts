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
import { cerrarSesionGoogle, traeSesionSupabase } from "@/lib/tienda-cliente/sesion-google";
import { logger } from "@/lib/logger";

const SIN_CACHE = { "Cache-Control": "private, no-store" };

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
  const res = NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  await cerrarSesionGoogle(req, res);
  return res;
}
