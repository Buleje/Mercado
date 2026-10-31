/**
 * Cómo se llama cada estado en pantalla (25-10). El servidor guarda CANCELADO y
 * LIQUIDADO; Brandon los dice «anulado» y «pagado». Un anulado no es deuda: la
 * lista no le muestra saldo ni % pagado.
 */
export const ESTADO_VISIBLE: Record<string, string> = {
  ABIERTO: "Abierto",
  LIQUIDADO: "Pagado",
  EXCEDIDO: "Excedido",
  CANCELADO: "Anulado",
};

export const etiquetaEstado = (status: string, porDefecto?: string): string => ESTADO_VISIBLE[status] ?? porDefecto ?? status;

/** Un anulado no se cobra: su saldo no es plata que te deban. */
export const esDeuda = (status: string): boolean => status !== "CANCELADO";
