/**
 * Montos con los que el cliente suele pagar un total en efectivo, para tocarlos
 * en vez de tipearlos: el siguiente redondo (de 10, 50, 100, 500, 1000) y cada
 * billete suelto que alcanza. 551 → 560 · 600 · 1000; 18.50 → 20 · 50 · 100;
 * 41.60 → 50 · 100 · 200.
 *
 * Sólo arma la lista: el botón llama a `updateAmount(0, monto)` igual que los
 * montos rápidos fijos de antes ([5, 10, 20, 50, 100], que a S/ 551 no ofrecían
 * ninguno). Nunca devuelve el total exacto: para eso está «Exacto».
 */

/** Redondeos a los que se sube el total (el de 5 sólo por debajo de S/ 5). */
const MULTIPLOS = [10, 50, 100, 500, 1000] as const;
/** Billetes peruanos: uno solo puede pagar todo. */
const BILLETES = [10, 20, 50, 100, 200] as const;

export function montosSugeridos(total: number, cuantos = 3): number[] {
  if (!Number.isFinite(total) || total <= 0 || cuantos <= 0) return [];
  // En céntimos: 0.1 + 0.2 no es 0.3 y un redondeo de float no puede ofrecer «S/ 40» para S/ 40.00.
  const centimos = Math.round(total * 100);
  const multiplos = centimos < 500 ? [5, ...MULTIPLOS] : MULTIPLOS;
  const candidatos = new Set<number>(BILLETES);
  for (const paso of multiplos) candidatos.add(Math.ceil(centimos / (paso * 100)) * paso);
  return [...candidatos]
    .filter((monto) => monto * 100 > centimos)
    .sort((a, b) => a - b)
    .slice(0, cuantos);
}
