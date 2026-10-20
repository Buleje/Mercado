import "server-only";
import type { NextRequest } from "next/server";
import { CUSTOMER_SESSION, getCustomerPayload, telefonoDeLaSesion } from "@/lib/auth/customer-session";
import { ReferralsDB } from "@/lib/db/referrals.db";
import { claveDeCelular } from "./reglas";

export interface ResultadoCodigo {
  status: number;
  ok: boolean;
  mensaje: string;
  /** El cupón de la amiga, si lo recibe al usar el código. */
  cupon?: string;
}

/**
 * Una clienta usa un código de referida desde la tienda (ADR-510).
 *
 * `null` = el negocio no guardó su programa (y no se pidió `aunSinGuardar`): la ruta sigue con el camino de
 * puntos de siempre. Con programa guardado se emiten cupones, así que se exige
 * la sesión verificada de ESE celular: sin eso cualquiera anotaba celulares
 * ajenos con su código y juntaba cupones.
 */
export async function aplicarCodigoDeReferida(
  req: NextRequest,
  tenantId: string,
  phone: string,
  codigo: string,
  opciones: { aunSinGuardar?: boolean } = {},
): Promise<ResultadoCodigo | null> {
  const { guardada } = await ReferralsDB.config(tenantId);
  if (!guardada && !opciones.aunSinGuardar) return null;
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const sesion = token ? await getCustomerPayload(token) : null;
  const clave = claveDeCelular(phone);
  /* Sólo una sesión que PRUEBA ese celular (OTP): un login de Google/Facebook no vale
     (con cuentas gratis se armaban «amigas» falsas — security 20-10). */
  const telefono = telefonoDeLaSesion(sesion);
  if (!telefono || claveDeCelular(telefono) !== clave) {
    return { status: 401, ok: false, mensaje: "Inicia sesión con tu celular para usar el código." };
  }
  const r = await ReferralsDB.vincular(tenantId, phone, { codigo }, `cliente …${clave.slice(-3)}`);
  if (!r.ok) return { status: r.status, ok: false, mensaje: r.mensaje };
  return { status: 200, ok: true, mensaje: r.mensaje, cupon: r.cupones.find((c) => c.rol === "amiga")?.code };
}
