/**
 * ctp-compliance.ts — single source de cumplimiento SERFOR del Libro de
 * Operaciones CTP: el plazo de registro (15 días) y el score de cumplimiento
 * del período.
 *
 * Antes esta lógica vivía duplicada en dos lugares que podían desincronizarse:
 *   - `components/admin/forestal/ctp-shared.ts` (PLAZO_REGISTRO_DIAS + diasDeRegistro)
 *   - `lib/forestal/ctp-export.ts` (su propio PLAZO_DIAS + lateDays)
 *
 * Vive en `lib/forestal/` (no en `components/`) porque `ctp-export.ts` es una
 * lib client-only y no puede importar de `components/`; los componentes SÍ
 * pueden importar de acá sin problema.
 */

/** SERFOR: el registro debe hacerse dentro de los 15 días de la actividad. */
export const PLAZO_REGISTRO_DIAS = 15;

const MS_POR_DIA = 86_400_000;

/**
 * Días entre la operación y su registro — para MOSTRAR ("registrado 18 días
 * después"). Va floored porque nadie lee "17.6 días".
 *
 * OJO: no uses `diasDeRegistro(e) > PLAZO_REGISTRO_DIAS` para decidir si algo
 * está fuera de plazo — usá `estaFueraDePlazo()`. Ver el porqué ahí abajo.
 */
export function diasDeRegistro(entry: {
  entryDate: string | Date;
  createdAt: string | Date;
}): number {
  const actividad = new Date(entry.entryDate).getTime();
  const registro = new Date(entry.createdAt).getTime();
  if (Number.isNaN(actividad) || Number.isNaN(registro)) return 0;
  return Math.max(0, Math.floor((registro - actividad) / MS_POR_DIA));
}

/**
 * ¿El registro se hizo fuera del plazo SERFOR? Predicado ÚNICO — lo usan el
 * badge de la tabla, el detalle y el Excel.
 *
 * Debe coincidir EXACTO con el SQL de `WoodEntriesDB.stats().lateCount`:
 *   ("createdAt" - "entryDate") > (15 * interval '1 day')
 *
 * Por eso compara milisegundos y NO `diasDeRegistro(e) > 15`: ese floor hacía
 * que un ingreso a 15.5 días fuera "en plazo" para la tabla y "fuera de plazo"
 * para el panel y el Excel — el mismo módulo contradiciéndose en la cifra que
 * se le muestra a un fiscalizador.
 */
export function estaFueraDePlazo(entry: {
  entryDate: string | Date;
  createdAt: string | Date;
}): boolean {
  const actividad = new Date(entry.entryDate).getTime();
  const registro = new Date(entry.createdAt).getTime();
  if (Number.isNaN(actividad) || Number.isNaN(registro)) return false;
  return registro - actividad > PLAZO_REGISTRO_DIAS * MS_POR_DIA;
}

/** Las 6 alertas de cumplimiento del período — las mismas que exporta el Excel. */
export interface CtpComplianceCounts {
  /** Ingresos registrados con más de PLAZO_REGISTRO_DIAS días entre entryDate y createdAt. */
  fueraPlazo: number;
  /** Ingresos con status "pendiente" (aún sin validar por un admin). */
  pendientes: number;
  /** Ingresos de especies CITES en el período (requieren permiso). */
  citesCount: number;
  /** Especies con saldo negativo: se consumió más volumen validado del que ingresó. */
  especiesEnNegativo: number;
  /** Productos transformados con stock negativo (se despachó más de lo producido). */
  stockNegativo: number;
  /** Despachos sin cadena de custodia completa: no pueden emitir certificado (ADR-135 D3). */
  despachosSinTraza: number;
}

/**
 * Categorías que RESTAN puntos: sólo las que el operador puede corregir o evitar.
 *
 * `citesCount` queda deliberadamente FUERA. Tener madera CITES no es una
 * infracción: es un hecho legal que requiere permiso archivado. Si restara,
 * un aserradero que trabaja shihuahuaco con todos sus papeles en regla quedaría
 * clavado en 80/100 para siempre, sin ninguna acción posible para subirlo — un
 * score que castiga lo incorregible es ruido, no señal, y enseña a ignorarlo.
 * CITES se muestra en el panel como recordatorio ("tené el permiso a mano"),
 * no como falta.
 *
 * `fueraPlazo` sí resta aunque el pasado no se pueda cambiar: es una infracción
 * real al plazo SERFOR, y sale sola del score cuando el período avanza.
 *
 * `despachosSinTraza` resta desde que existe "Editar atribución" en la ficha
 * del despacho (CtpAtribucionEditor): el operador ya puede completar la cadena
 * sin anular y recrear, así que el hueco es corregible — el criterio que
 * define esta lista. El libro sigue ADMITIENDO huecos al guardar (I4 es `≤`,
 * ADR-135); lo que resta es dejarlos abiertos al cierre del período.
 */
const CATEGORIAS_QUE_RESTAN = [
  "fueraPlazo",
  "pendientes",
  "especiesEnNegativo",
  "stockNegativo",
  "despachosSinTraza",
] as const satisfies readonly (keyof CtpComplianceCounts)[];

/** Tope de puntos que puede restar una sola categoría (5 categorías × 25 = 125, con piso en 0). */
const TOPE_PUNTOS_POR_ALERTA = 25;
/** Puntos que resta cada caso dentro de una categoría (tope a partir del 5º caso). */
const PUNTOS_POR_CASO = 5;

/**
 * Score 0-100 de cumplimiento del período: arranca en 100 y cada categoría
 * corregible resta hasta 25 puntos (5 por caso, tope en 5 casos — a partir de
 * ahí da lo mismo si son 5 o 50, la categoría ya está roja).
 *
 * Suma explícita por categoría (no `Object.values`): así agregar un contador
 * informativo nuevo a `CtpComplianceCounts` no cambia el score en silencio.
 */
export function ctpComplianceScore(counts: CtpComplianceCounts): number {
  const deduccion = CATEGORIAS_QUE_RESTAN.reduce(
    (total, key) => total + Math.min(Math.max(counts[key], 0) * PUNTOS_POR_CASO, TOPE_PUNTOS_POR_ALERTA),
    0,
  );
  return Math.max(0, 100 - deduccion);
}

export type CtpComplianceTone = "success" | "warning" | "error";

/** Lectura semántica del score para tono de UI (gauge, StatCard emphasis). */
export function ctpComplianceTone(score: number): CtpComplianceTone {
  if (score >= 90) return "success";
  if (score >= 70) return "warning";
  return "error";
}
