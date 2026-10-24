/**
 * Cuál es la deuda de ESTE cliente.
 *
 * Existe por un cobro mal aplicado (auditoría 2026-08-12): el POS pedía los
 * fiados con `?customerPhone=`, un parámetro que la API no lee, así que la
 * respuesta traía los fiados activos de TODA la bodega. La pantalla tomaba el
 * primero de la lista y le abonaba ahí: se cobraba S/50 a un cliente y la
 * deuda que bajaba era la de otro.
 *
 * La lección es que el filtro del servidor no alcanza como única defensa
 * cuando lo que sigue es mover plata. Acá se vuelve a comprobar, con el dato
 * que el fiado ya trae.
 */

export type FiadoElegible = {
  id: string;
  saldo: number;
  status: string;
  /** En este modelo el `customerId` del fiado ES el teléfono del cliente. */
  customerId?: string;
  customerPhone?: string;
};

/** Con saldo y todavía cobrable. Un fiado PAGADO o ANULADO no se abona. */
function estaAbierto(f: FiadoElegible): boolean {
  return f.saldo > 0 && (f.status === "ACTIVO" || f.status === "VENCIDO");
}

export function esDelCliente(f: FiadoElegible, telefono: string): boolean {
  if (!telefono) return false;
  return f.customerId === telefono || f.customerPhone === telefono;
}

/**
 * El fiado abierto de ese teléfono, o `null`.
 *
 * Si hay varios abiertos del mismo cliente devuelve el de mayor saldo: es el
 * que la pantalla ofrece abonar, y equivocarse hacia «la deuda más grande» es
 * menos malo que elegir al azar por orden de creación.
 */
export function fiadoDelCliente(
  fiados: readonly FiadoElegible[],
  telefono: string,
): FiadoElegible | null {
  const suyos = fiados.filter((f) => estaAbierto(f) && esDelCliente(f, telefono));
  if (suyos.length === 0) return null;
  return suyos.reduce((mayor, f) => (f.saldo > mayor.saldo ? f : mayor));
}
