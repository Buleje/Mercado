/**
 * arqueo-veredicto — qué se puede afirmar de un cuadre de caja, y qué no.
 *
 * El veredicto viejo miraba UNA sola cosa: si la diferencia era cero, «Conforme».
 * Con ese criterio el tablero de una bodega real mostraba «2 · 100% conformes»
 * mientras pasaban estas dos cosas:
 *
 *  1. **Nadie contó nada.** El cron de cierre automático cierra la caja usando
 *     el monto ESPERADO como si fuera el contado. Diferencia cero por
 *     construcción → «Conforme». Un arqueo que se aprueba solo no es un control,
 *     es una formalidad.
 *  2. **El monto era imposible.** Un turno cerró con esperado −S/ 630: una caja
 *     física no puede tener menos seiscientos treinta soles. Ese número dice que
 *     los movimientos están mal cargados, y la pantalla lo daba por bueno porque
 *     el contado copiaba al esperado.
 *
 * PURO y client-safe.
 */

export type ArqueoEstado =
  | "pendiente"
  /** Cuadró: alguien contó y coincide. */
  | "conforme"
  | "sobrante"
  | "faltante"
  /** Se cerró solo (cron/inactividad): NADIE contó. No es conforme ni falla. */
  | "sin_conteo"
  /** El esperado no puede existir en una caja física: hay que revisar movimientos. */
  | "imposible";

export interface ArqueoEntrada {
  /** Monto que debería haber según apertura + ingresos − egresos. */
  expectedAmount: number | null | undefined;
  /** Lo que se contó al cerrar. */
  countedAmount: number | null | undefined;
  difference?: number | null;
  /** Texto del cierre: de acá sale si lo cerró una persona o el sistema. */
  notes?: string | null;
  closedAt?: string | null;
}

/** Marca del cierre automático (la escribe el cron). */
const MARCA_AUTOMATICO = /cierre autom[áa]tico/i;

export function esCierreAutomatico(notes: string | null | undefined): boolean {
  return MARCA_AUTOMATICO.test(notes ?? "");
}

/**
 * Un esperado negativo no es «una caja con poca plata»: es imposible. Significa
 * que se registraron más egresos que ingresos + apertura, o que falta cargar
 * ventas. Se marca aunque la diferencia sea cero.
 */
export function montoImposible(expected: number | null | undefined): boolean {
  return expected != null && expected < 0;
}

export function veredictoArqueo(e: ArqueoEntrada, tolerancia = 0.01): ArqueoEstado {
  if (montoImposible(e.expectedAmount)) return "imposible";
  if (e.countedAmount == null || !e.closedAt) return "pendiente";
  // El orden importa: un cierre automático NUNCA puede declarar conformidad,
  // aunque los números den cero, porque el cero lo puso el propio sistema.
  if (esCierreAutomatico(e.notes)) return "sin_conteo";
  const diff = e.difference ?? e.countedAmount - (e.expectedAmount ?? 0);
  if (diff == null) return "pendiente";
  if (Math.abs(diff) < tolerancia) return "conforme";
  return diff > 0 ? "sobrante" : "faltante";
}

export interface ResumenArqueos {
  total: number;
  /** Los que un humano contó y cuadraron. */
  conformes: number;
  /** % sobre los arqueos VERIFICABLES (no sobre el total: los que nadie contó no cuentan). */
  conformesPct: number | null;
  /** Cerrados por el sistema, sin conteo humano. */
  sinConteo: number;
  imposibles: number;
  faltantes: number;
  sobrantes: number;
  pendientes: number;
  totalFaltanteS: number;
  totalSobranteS: number;
}

/**
 * El porcentaje se calcula sobre lo que **se puede afirmar**. Incluir los cierres
 * automáticos en el denominador —como hacía el tablero— convierte «nadie contó»
 * en «todo perfecto».
 */
export function resumirArqueos(items: { estado: ArqueoEstado; difference: number }[]): ResumenArqueos {
  const cuenta = (e: ArqueoEstado) => items.filter((i) => i.estado === e).length;
  const conformes = cuenta("conforme");
  const faltantes = cuenta("faltante");
  const sobrantes = cuenta("sobrante");
  const verificables = conformes + faltantes + sobrantes;
  return {
    total: items.length,
    conformes,
    conformesPct: verificables > 0 ? Math.round((conformes / verificables) * 100) : null,
    sinConteo: cuenta("sin_conteo"),
    imposibles: cuenta("imposible"),
    faltantes,
    sobrantes,
    pendientes: cuenta("pendiente"),
    totalFaltanteS:
      Math.round(items.filter((i) => i.estado === "faltante").reduce((a, i) => a + Math.abs(i.difference), 0) * 100) / 100,
    totalSobranteS:
      Math.round(items.filter((i) => i.estado === "sobrante").reduce((a, i) => a + i.difference, 0) * 100) / 100,
  };
}

/** Qué decirle al usuario en cada caso, en una línea. */
export const ARQUEO_LABEL: Record<ArqueoEstado, string> = {
  pendiente: "Pendiente",
  conforme: "Conforme",
  sobrante: "Sobrante",
  faltante: "Faltante",
  sin_conteo: "Cerrada sin conteo",
  imposible: "Revisar movimientos",
};

export const ARQUEO_DETALLE: Record<ArqueoEstado, string> = {
  pendiente: "El turno todavía no se cerró.",
  conforme: "Se contó el efectivo y coincide con lo esperado.",
  sobrante: "Se contó más efectivo del esperado.",
  faltante: "Se contó menos efectivo del esperado.",
  sin_conteo: "La cerró el sistema por inactividad: el monto es el calculado, nadie contó el efectivo.",
  imposible: "El esperado es negativo: una caja no puede tener menos que cero. Revisá los movimientos del turno.",
};
