/**
 * Un pedido vivo (pendiente → en camino) que nadie tocó en este tiempo se
 * avisa en Inicio como «olvidado». Se mide sobre `updatedAt`: cualquier cambio
 * de estado lo mueve. Medido 09-10 en main: 18 pedidos (S/ 354,40) quietos
 * desde abril–agosto sin ningún aviso.
 *
 * Vive aparte de `lib/db/overview.db.ts` para que la lista de Pedidos aplique
 * la MISMA regla en el navegador sin arrastrar Prisma.
 */
export const HORAS_PEDIDO_OLVIDADO = 24;

/** Los estados que cuentan como «vivo» (los mismos del conteo de Inicio). */
export const ESTADOS_PEDIDO_VIVO = ["pendiente", "confirmado", "preparando", "en_camino"] as const;

/** ¿Este pedido es de los que el aviso «N pedidos esperan» cuenta? */
export function esPedidoOlvidado(
  pedido: { status: string; updatedAt?: string | null; createdAt: string },
  ahora: number = Date.now(),
): boolean {
  if (!(ESTADOS_PEDIDO_VIVO as readonly string[]).includes(pedido.status)) return false;
  const tocado = Date.parse(pedido.updatedAt ?? pedido.createdAt);
  return Number.isFinite(tocado) && tocado < ahora - HORAS_PEDIDO_OLVIDADO * 60 * 60 * 1000;
}
