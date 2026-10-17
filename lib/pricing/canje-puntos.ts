/**
 * lib/pricing/canje-puntos.ts
 *
 * Valida el canje de puntos de un pedido de la tienda ANTES de crearlo
 * (`POST /api/orders`). El débito real va después, en la MISMA transacción
 * que crea el pedido (`OrdersDB.add` con `canjePuntos`), con el guard atómico
 * `saldo + débito >= 0` de `lib/db/loyalty.db.ts`: si dos pedidos llegan a la
 * vez con el mismo saldo, solo uno canjea. Esto es el chequeo amable previo
 * (mensajes claros, 4xx sin tocar stock ni cupón).
 *
 * Identidad (Ley 29733, security 2026-10-08): los puntos son de quien PROBÓ
 * ser dueño del teléfono — sesión de teléfono (`telefonoDeLaSesion`: código
 * por WhatsApp/SMS; Google y Facebook no prueban el teléfono) del MISMO
 * teléfono y del MISMO negocio. El teléfono del
 * cuerpo del pedido nunca alcanza para leer ni gastar puntos: el invitado
 * recibe 401 y sus puntos no se tocan.
 */
import "server-only";
import { normalizePhone } from "@/lib/db/misc.db";
import { LoyaltyDB, LoyaltyCrossTenantError } from "@/lib/db/loyalty.db";
import { resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { maxPuntosCanjeables, solesPorPuntos } from "@/lib/pricing/total-pedido";

/** Canje aprobado: quién paga, cuántos puntos y cuántos soles valen. */
export interface CanjePuntos {
  /** `Customer.phone` normalizado (la PK del saldo). */
  clienteId: string;
  puntos: number;
  soles: number;
}

export type ResultadoCanje =
  | { ok: true; canje: CanjePuntos }
  | {
      ok: false;
      status: 400 | 401 | 409;
      code: "CANJE_REQUIERE_SESION" | "PUNTOS_INSUFICIENTES" | "PUNTOS_SOBRE_TOPE";
      error: string;
      /** Solo al dueño verificado: su saldo y el máximo de este pedido. */
      saldo?: number;
      maxPuntos?: number;
    };

/**
 * ¿Puede este pedido canjear `puntos`? `totalSinPuntos` = el total con
 * cupón, promoción y descuento automático, antes de los puntos (sobre él se
 * mide el tope `TOPE_CANJE_PCT`).
 */
export async function validarCanjePuntos(
  tenantId: string,
  req: { cookies: { get(name: string): { value: string } | undefined } },
  p: { telefono: string | null | undefined; puntos: number; totalSinPuntos: number },
): Promise<ResultadoCanje> {
  const sinSesion: ResultadoCanje = {
    ok: false,
    status: 401,
    code: "CANJE_REQUIERE_SESION",
    error: "Inicia sesión con tu número para usar tus puntos",
  };
  const telefono = normalizePhone((p.telefono ?? "").trim());
  if (!telefono) return sinSesion;

  const { getCustomerPayload, telefonoDeLaSesion, CUSTOMER_SESSION } = await import(
    "@/lib/auth/customer-session"
  );
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const payload = token ? await getCustomerPayload(token) : null;
  // Solo una sesión que PROBÓ este teléfono (código; `e2e` fuera de
  // producción). Google/Facebook prueban un correo, no el teléfono.
  if (!payload || telefonoDeLaSesion(payload) !== telefono) {
    return sinSesion;
  }
  // La sesión puede traer el slug («main») o el id: se comparan resueltos.
  const tenantDeLaSesion = await resolveTenantSlugToId(payload.tenantId);
  if (tenantDeLaSesion !== tenantId) return sinSesion;

  // Ficha de otro negocio = en este negocio no tiene puntos.
  const saldo = await LoyaltyDB.getBalance(tenantId, telefono).catch((err: unknown) => {
    if (err instanceof LoyaltyCrossTenantError) return 0;
    throw err;
  });
  if (p.puntos > saldo) {
    return {
      ok: false,
      status: 409,
      code: "PUNTOS_INSUFICIENTES",
      error: `Tienes ${saldo} puntos; no alcanzan para canjear ${p.puntos}`,
      saldo,
    };
  }
  const maxPuntos = maxPuntosCanjeables(saldo, p.totalSinPuntos);
  if (p.puntos > maxPuntos) {
    return {
      ok: false,
      status: 400,
      code: "PUNTOS_SOBRE_TOPE",
      error: `En este pedido puedes canjear hasta ${maxPuntos} puntos`,
      saldo,
      maxPuntos,
    };
  }
  return { ok: true, canje: { clienteId: telefono, puntos: p.puntos, soles: solesPorPuntos(p.puntos) } };
}
