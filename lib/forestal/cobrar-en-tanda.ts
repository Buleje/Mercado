/**
 * cobrar-en-tanda.ts — lógica pura de «Cobrar aserrío en tanda» (ADR-412).
 *
 * El servidor cobra de a 3 corridas con un tope de 45 s por tanda (~2 s cada
 * una en dev; 200 corridas no entran en una pasada, entran unas 65). Las que
 * no alcanzan vuelven con `cobrado:false` y un motivo de tiempo, no de datos.
 * Esta lógica decide cuáles se pueden reintentar solas y cómo se acumulan los
 * resultados de varias pasadas sin perder lo ya cobrado en la anterior.
 */

export interface ResultadoFilaTanda {
  id: string;
  lineNo: number;
  cobrado: boolean;
  importe: number | null;
  parteNombre: string | null;
  motivo: string | null;
  /** Opcional: todavía lo está sumando otro agente al contrato del servidor
   *  (`lib/forestal/aserrio-cobro.ts`). El código de acá tiene que funcionar
   *  igual el día que el campo no venga. */
  accion?: "crear" | "actualizar" | "baja" | "nada";
  importeDadoDeBaja?: number | null;
}

/** Sólo las que se quedaron sin tiempo se pueden reintentar sueltas: las que
 *  no cobraron por falta de tarifa/precio van a fallar IGUAL de nuevo, y una
 *  dada de baja a propósito no es un fallo que se deba reintentar. */
export function esPendientePorTiempo(fila: ResultadoFilaTanda): boolean {
  return !fila.cobrado && fila.accion !== "baja" && (fila.motivo ?? "").includes("No alcanzó el tiempo");
}

/** Se dejó de cobrar a propósito (el operador eligió «Madera del centro» para
 *  corridas que ya tenían dueño) — no es un fallo, es una acción explícita. */
export function esDadaDeBaja(fila: ResultadoFilaTanda): boolean {
  return fila.accion === "baja";
}

export interface ResumenDeFilasTanda {
  cobradas: number;
  dadasDeBaja: number;
  sinCobrar: number;
  importeCobrado: number;
  importeDadoDeBaja: number;
}

/** El resumen se arma SIEMPRE desde las filas ya acumuladas de todas las
 *  pasadas, nunca aparte: dos cuentas que se llevan por separado terminan
 *  desincronizadas (mismo criterio que `resumirTanda` del servidor). */
export function resumirFilasTanda(filas: readonly ResultadoFilaTanda[]): ResumenDeFilasTanda {
  const cobradas = filas.filter((f) => f.cobrado);
  const dadasDeBaja = filas.filter(esDadaDeBaja);
  return {
    cobradas: cobradas.length,
    dadasDeBaja: dadasDeBaja.length,
    sinCobrar: filas.length - cobradas.length - dadasDeBaja.length,
    importeCobrado: cobradas.reduce((a, f) => a + (f.importe ?? 0), 0),
    importeDadoDeBaja: dadasDeBaja.reduce((a, f) => a + (f.importeDadoDeBaja ?? 0), 0),
  };
}

/** Acumula resultados de varias pasadas por id: una pasada nueva agrega o
 *  corrige SU fila, nunca borra lo que ya se cobró en una pasada anterior. */
export function fusionarResultadosTanda(
  previos: ReadonlyMap<string, ResultadoFilaTanda>,
  nuevos: readonly ResultadoFilaTanda[],
): Map<string, ResultadoFilaTanda> {
  const combinado = new Map(previos);
  for (const fila of nuevos) combinado.set(fila.id, fila);
  return combinado;
}

/** Muchas corridas a 3 por vez con un tope de 45 s no entran en una sola
 *  pasada (medido: ~2 s cada una en dev, unas 65 entran en 45 s). */
export const UMBRAL_AVISO_TANDA = 60;

/** Si conviene avisar ANTES de enviar que la tanda puede no completarse en
 *  una sola pasada. */
export function superaUmbralDeTanda(cantidad: number): boolean {
  return cantidad > UMBRAL_AVISO_TANDA;
}

/**
 * Cuántos pedidos de paquetes se disparan a la vez al abrir la tanda.
 *
 * El endpoint de una corrida tiene un límite de 100/min; pedir los de una
 * tanda de 200 corridas de una sola vez (MEDIO, revisión 2026-09-14) dispara
 * 200 fetches simultáneos. Mismo criterio que `TANDA_EN_PARALELO` del
 * servidor (`forest-aserrio.db.ts`), pero del lado del cliente.
 */
export const PAQUETES_EN_PARALELO = 10;

/**
 * Corre `fn` sobre cada item con a lo sumo `limite` en vuelo a la vez — "N
 * trabajadores sacando de una cola", el mismo patrón que `cobrarTanda` usa en
 * el servidor. El resultado queda en el mismo orden que `items`.
 */
export async function mapConLimite<T, R>(
  items: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limite, 1), items.length) }, trabajador));
  return resultados;
}

/**
 * El precio manual con el que se cotiza CADA corrida en la vista previa.
 *
 * Sin tocar el precio, cada corrida se cotiza con SU trato de siempre —el
 * precio a mano que ya tenía pactado, o la tarifa vigente de su fecha si
 * nunca tuvo uno— igual que el servidor. Recién cuando el operador toca el
 * precio para TODA la tanda, ese valor único pisa el trato de cada una (ALTO
 * relacionado, revisión 2026-09-14: antes se usaba el valor de la pantalla
 * para todas desde el principio, así nadie lo hubiera tocado).
 */
export function precioParaCotizar(
  precioTocado: boolean,
  precioDeLaTanda: number | null,
  precioPropioDeLaCorrida: number | null | undefined,
): number | null {
  return precioTocado ? precioDeLaTanda : (precioPropioDeLaCorrida ?? null);
}

/**
 * Poda una selección a lo que sigue VISIBLE — cambiar período, búsqueda,
 * filtro o página cambia qué corridas se ven, y una marcada que ya no está
 * ahí se cae de la selección sola (MEDIO, revisión 2026-09-14: la barra decía
 * 8 marcadas y el modal terminaba cobrando 5, o una que el operador ya no
 * tenía a la vista). Nunca RESUCITA una marca que ya no está: sólo saca.
 * Devuelve el MISMO `Set` si no hay nada que sacar (no dispara un re-render
 * de más).
 */
export function podarSeleccion(seleccion: ReadonlySet<string>, idsVisibles: readonly string[]): Set<string> {
  if (seleccion.size === 0) return seleccion as Set<string>;
  const vivos = new Set(idsVisibles);
  return [...seleccion].every((id) => vivos.has(id)) ? (seleccion as Set<string>) : new Set([...seleccion].filter((id) => vivos.has(id)));
}
