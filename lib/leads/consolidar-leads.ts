/**
 * Un interesado = un `entityId`, no una fila del ActivityLog.
 *
 * `LeadsDB.updateStatus` guarda cada cambio de estado como OTRA fila
 * (entity="lead", mismo `entityId`) con el detalle entero y la fecha del
 * cambio. Sin juntarlas, la lista mostraba al mismo interesado una vez por
 * paso —«Nuevo» y «Contactado» a la vez, con el botón de avanzar en las dos—
 * y el embudo lo contaba dos veces en el total, en «últimos 7 días» y en cada
 * estado (medido 10-10: 1 interesado pasado a Contactado = total 2).
 *
 * Queda el detalle de la fila MÁS NUEVA (su estado de hoy) con la fecha de la
 * MÁS VIEJA (cuándo llegó). Sale ordenado por llegada, el más reciente primero.
 */
export function consolidarLeads<T extends { entityId: string; createdAt: Date }>(
  filas: readonly T[],
): T[] {
  const porId = new Map<string, { ultima: T; llego: Date }>();
  for (const fila of filas) {
    const previo = porId.get(fila.entityId);
    if (!previo) {
      porId.set(fila.entityId, { ultima: fila, llego: fila.createdAt });
      continue;
    }
    if (fila.createdAt > previo.ultima.createdAt) previo.ultima = fila;
    if (fila.createdAt < previo.llego) previo.llego = fila.createdAt;
  }
  return [...porId.values()]
    .map(({ ultima, llego }) => ({ ...ultima, createdAt: llego }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
