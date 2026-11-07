/**
 * `fn` sobre cada elemento con a lo sumo `limite` en vuelo a la vez; el
 * resultado sale en el MISMO orden que `items`.
 *
 * Por qué (11-10): Análisis › Predicción tardaba 50 s en las sugerencias de
 * precio y 17 s en las de reposición: cada producto pedía su historial (y su
 * proveedor) en serie, ~320 consultas seguidas contra Supabase. Con 6 en vuelo
 * el pool de conexiones no se agota y el bucle de reglas queda idéntico.
 */
export async function mapEnParalelo<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let siguiente = 0;
  const trabajador = async (): Promise<void> => {
    while (siguiente < items.length) {
      const i = siguiente++;
      out[i] = await fn(items[i], i);
    }
  };
  const cuantos = Math.max(1, Math.min(limite, items.length));
  await Promise.all(Array.from({ length: cuantos }, trabajador));
  return out;
}
