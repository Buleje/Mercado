/**
 * Dónde se cobran los fiados: Ventas y caja › Me deben.
 *
 * Plan «panel unificado», ola 3 (2026-10-10), decisión de Brandon: los fiados
 * tienen UNA casa, Ventas y caja › Me deben (el cajero cobra el fiado a la caja
 * abierta). Hasta el 11-10 este archivo era además una tarjeta-enlace arriba de
 * «Todo lo que me deben» que repetía la cifra de los fiados (ya estaba en su
 * chip); la cifra quedó en los Indicadores de esa vista y el salto, en su «⋯».
 * Queda la dirección, que usan esa vista, «A quién fiarle» y la caja.
 */
export const ME_DEBEN = { tab: "ventas-caja", params: { vista: "cuentas-cobrar" } } as const;
