import "server-only";
import type { NextRequest } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";

/**
 * ¿Quien pide puede ver el estado de la clave de IA de la PLATAFORMA (si
 * falta, si se acabó el crédito, dónde se pone)? Auditoría de seguridad
 * 2026-10-02: eso es de quien administra la plataforma, no del admin de cada
 * negocio — a él le basta «no está disponible, avisa al administrador».
 *
 * Sí lo ve:
 * - una sesión de superadmin válida en el mismo navegador (la cookie de
 *   plataforma va con `path: "/"`; se verifica firma, vencimiento y el mismo
 *   User-Agent con el que se abrió);
 * - el servidor de DESARROLLO (`next dev`): ahí el único que entra es el dueño,
 *   que es quien edita el `.env.local`. En producción nunca por esta vía.
 */
export async function veDetalleDeClaveIA(req: NextRequest): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return false;
  return (await getPlatformSession(token, { ua: req.headers.get("user-agent") })) != null;
}
