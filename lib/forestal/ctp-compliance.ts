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

/**
 * SERFOR: el registro en el Libro de Operaciones debe hacerse dentro de los
 * **2 días HÁBILES** de la operación (RDE N° D000025-2023-MIDAGRI-SERFOR-DE).
 *
 * Antes acá vivía `15` días CALENDARIO — era incorrecto. El cambio a días
 * hábiles se hace en ESTE archivo y en el SQL de `WoodEntriesDB.stats()` en el
 * MISMO commit: los dos comparten la definición para no contradecirse (ADR-137).
 */
export const PLAZO_REGISTRO_DIAS = 2;

const MS_POR_DIA = 86_400_000;

/**
 * Días CALENDARIO entre la operación y su registro — sólo para MOSTRAR
 * ("registrado 3 días después"). Va floored porque nadie lee "2.6 días".
 *
 * OJO: no uses esto para decidir fuera-de-plazo (el plazo es en días HÁBILES) —
 * usá `estaFueraDePlazo()` / `diasHabilesDeRegistro()`.
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

/** isodow en UTC: 1=Lunes … 7=Domingo (entryDate se guarda a medianoche UTC). */
function isodowUTC(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/**
 * Días HÁBILES (lun–vie) transcurridos entre la operación y el registro.
 *
 * Fórmula cerrada sobre `(díasCalendario, isodowDeLaOperación)` — pura
 * aritmética entera, para poder replicarla IDÉNTICA en el SQL de
 * `WoodEntriesDB.stats().lateCount` y que el badge, el panel y el Excel nunca
 * digan cosas distintas ante un fiscalizador (la lección del fuera-de-plazo).
 *
 * ⚠️ NO descuenta feriados nacionales (limitación conocida, ADR-137): un
 * registro tardío sólo por un feriado puede marcarse. Es una advertencia del
 * score, no un bloqueo.
 */
export function diasHabilesDeRegistro(entry: {
  entryDate: string | Date;
  createdAt: string | Date;
}): number {
  const actividad = new Date(entry.entryDate);
  const registro = new Date(entry.createdAt);
  const s = actividad.getTime();
  const e = registro.getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  const n = Math.floor((e - s) / MS_POR_DIA); // días calendario (entryDate = medianoche UTC)
  const w0 = isodowUTC(actividad);
  const full = Math.floor(n / 7);
  const rem = n % 7;
  let count = full * 5;
  for (let i = 1; i <= rem; i++) {
    const dow = ((w0 - 1 + i) % 7) + 1;
    if (dow <= 5) count++;
  }
  return count;
}

/**
 * ¿El registro se hizo fuera del plazo SERFOR (2 días hábiles)? Predicado ÚNICO
 * — lo usan el badge de la tabla, el detalle y el Excel.
 *
 * Debe coincidir EXACTO con el SQL de `WoodEntriesDB.stats().lateCount`, que
 * calcula los mismos días hábiles con la misma fórmula cerrada.
 */
export function estaFueraDePlazo(entry: {
  entryDate: string | Date;
  createdAt: string | Date;
}): boolean {
  return diasHabilesDeRegistro(entry) > PLAZO_REGISTRO_DIAS;
}

/**
 * N° de permiso CITES de un ingreso. Se guarda en `notes` ("… · Permiso CITES: X")
 * en vez de una columna aparte (mismo patrón sin-migración que la GTF de salida).
 * Single source (lib) para leerlo estructurado en el detalle, el form y el export.
 */
export function parseCitesPermiso(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/Permiso CITES:\s*([^·]+?)\s*(?:·|$)/i);
  return m ? m[1].trim() || null : null;
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
  /**
   * INFORMATIVOS (opcionales, NO restan score — como `citesCount`). Son señales
   * para revisar, no infracciones corregibles con una acción del operador:
   *  - `citesSinPermiso`: especies CITES del período sin permiso cargado en la Ficha.
   *  - `rendimientoAlto`: corridas con rendimiento sobre el referencial SERFOR
   *    (posible sobre-declaración; ver ctp-rendimiento.ts).
   */
  citesSinPermiso?: number;
  rendimientoAlto?: number;
  /** Títulos habilitantes / permisos CITES vencidos en la Ficha (informativo). */
  documentosVencidos?: number;
  /**
   * Documentos de la Ficha que vencen dentro de 30 días (informativo).
   *
   * No resta: todavía están vigentes y el operador ya está haciendo lo correcto.
   * Sirve para llegar a tiempo — la renovación ante la ARFFS no es inmediata, y
   * enterarse el día que venció es enterarse tarde.
   */
  documentosPorVencer?: number;
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

/** Etiqueta legible de cada categoría que resta puntos (para el desglose del score). */
const CATEGORIA_LABEL: Record<(typeof CATEGORIAS_QUE_RESTAN)[number], string> = {
  fueraPlazo: "Ingresos fuera de plazo",
  pendientes: "Ingresos sin validar",
  especiesEnNegativo: "Especies en saldo negativo",
  stockNegativo: "Productos con stock negativo",
  despachosSinTraza: "Despachos sin cadena completa",
};

export interface CtpComplianceDeduccion {
  key: (typeof CATEGORIAS_QUE_RESTAN)[number];
  label: string;
  casos: number;
  /** Puntos que esta categoría le resta al score (0..TOPE_PUNTOS_POR_ALERTA). */
  puntos: number;
  /** true si la categoría llegó al tope (da igual 5 o 50 casos). */
  topeAlcanzado: boolean;
}

/**
 * Desglose del score: cuántos puntos resta cada categoría corregible. Single
 * source con `ctpComplianceScore` (mismas categorías, mismos pesos) — el panel
 * lo muestra sin re-derivar la fórmula, así nunca divergen del score real.
 */
export function ctpComplianceBreakdown(counts: CtpComplianceCounts): CtpComplianceDeduccion[] {
  return CATEGORIAS_QUE_RESTAN.map((key) => {
    const casos = Math.max(counts[key], 0);
    const puntos = Math.min(casos * PUNTOS_POR_CASO, TOPE_PUNTOS_POR_ALERTA);
    return { key, label: CATEGORIA_LABEL[key], casos, puntos, topeAlcanzado: puntos >= TOPE_PUNTOS_POR_ALERTA && casos > 0 };
  });
}
