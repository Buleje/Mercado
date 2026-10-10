/**
 * El número que lleva cada pestaña del libro CTP (`alertasPorVista`).
 *
 * Un pendiente que se resuelve en una pestaña se anuncia EN esa pestaña. Las
 * reservas vencidas y los paquetes sin medidas se miran en la campana, pero la
 * madera es de Productos disponibles: su contador va en SU pestaña, a la vista
 * sin abrir Herramientas (la campana queda a dos clics).
 *
 * De los paquetes sin medidas entra SÓLO los que siguen en el patio
 * (`ForestCtpDB.paquetesSinMedidasEnElPatio`): el mismo número que el chip «sin
 * escuadría» de esa pantalla. El total histórico —con lo ya despachado— queda
 * en la campana. PURO.
 */
export function alertasPorVistaDe(
  lista: readonly { vista: string; cantidad: number }[],
  extra: { reservasVencidas: number; sinMedidasEnElPatio: number },
): Record<string, number> {
  const acc = lista.reduce<Record<string, number>>((a, p) => {
    a[p.vista] = (a[p.vista] ?? 0) + p.cantidad;
    return a;
  }, {});
  const deDisponibles = extra.reservasVencidas + extra.sinMedidasEnElPatio;
  if (deDisponibles > 0) acc.disponibles = (acc.disponibles ?? 0) + deDisponibles;
  return acc;
}
