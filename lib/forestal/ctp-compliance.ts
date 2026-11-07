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

/**
 * Los totales del período (ADR-532): de cuánto son parte los casos y si hubo
 * movimiento. Opcionales a propósito — un total que no vino es `undefined` y
 * la fórmula cae a 5 por caso: nunca se inventa una base ni un «sin movimiento».
 */
export interface CtpComplianceBases {
  /** Ingresos del período (`WoodEntriesDB.stats().totalCount`): base de fueraPlazo y pendientes. */
  ingresos?: number;
  /** Despachos del período (`trazabilidadDelPeriodo().total`): base de despachosSinTraza. */
  despachos?: number;
  /** Corridas de producción del período: sólo cuenta para saber si hubo movimiento. */
  producciones?: number;
}

/** Las 6 alertas de cumplimiento del período — las mismas que exporta el Excel. */
export interface CtpComplianceCounts {
  /** Ingresos registrados con más de PLAZO_REGISTRO_DIAS días entre entryDate y createdAt. */
  fueraPlazo: number;
  /**
   * Ingresos cuya RECEPCIÓN no está cerrada (ADR-339): la madera figura en el
   * libro y nadie declaró haberla visto bajar del camión.
   *
   * Antes esta categoría contaba los `status = "pendiente"` (sin validar). Se
   * cambió el 2026-09-15 porque premiaba el gesto equivocado: «Validar todos»
   * despacha 21 ingresos de un click desde el escritorio y subía el score 25
   * puntos, mientras las 21 guías seguían sin recepcionar y sus 153 trozas
   * (181 m³) fuera del alcance del cubicador. Recepcionar es mirar la pila;
   * validar es firmar un papel. El indicador ahora mide lo primero.
   */
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
  /** Totales del período (ADR-532). Sin ellos, el cálculo de antes (5 por caso, tope 25). */
  bases?: CtpComplianceBases;
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
/**
 * Puntos por caso de las categorías SIN base (especies y productos en
 * negativo) y PISO de las proporcionales: un caso siempre se ve (ADR-532).
 */
const PUNTOS_POR_CASO = 5;

type CategoriaQueResta = (typeof CATEGORIAS_QUE_RESTAN)[number];

/**
 * De qué total es parte cada categoría (ADR-532). Con base, la categoría resta
 * en PROPORCIÓN: 5 de 21 guías sin recepcionar no es lo mismo que 21 de 21, y
 * el tope fijo de 5 casos las igualaba (recepcionar 16 no movía el puntaje).
 * Especies y productos en negativo no tienen una base natural —el universo
 * «con saldo» cambia con la apertura heredada y con el filtro— y siguen a 5
 * por caso con tope 25.
 */
const BASE_DE: Partial<Record<CategoriaQueResta, keyof CtpComplianceBases>> = {
  fueraPlazo: "ingresos",
  pendientes: "ingresos",
  despachosSinTraza: "despachos",
};

function casosDe(key: CategoriaQueResta, counts: CtpComplianceCounts): number {
  const n = counts[key];
  return Number.isFinite(n) ? Math.max(n, 0) : 0;
}

/** La base de una categoría si vino y sirve (> 0); null = resta 5 por caso. */
function baseDe(key: CategoriaQueResta, counts: CtpComplianceCounts): number | null {
  const campo = BASE_DE[key];
  const base = campo ? counts.bases?.[campo] : undefined;
  return base != null && Number.isFinite(base) && base > 0 ? base : null;
}

/**
 * LA fórmula de una categoría (score y desglose la comparten):
 *  - sin casos → 0;
 *  - con base → 25 × casos ÷ base, redondeado, con piso 5 y techo 25;
 *  - sin base → 5 por caso, tope 25 (el cálculo de antes del ADR-532).
 */
function puntosDeCategoria(casos: number, base: number | null): number {
  if (casos <= 0) return 0;
  if (base == null) return Math.min(casos * PUNTOS_POR_CASO, TOPE_PUNTOS_POR_ALERTA);
  const proporcional = Math.round((TOPE_PUNTOS_POR_ALERTA * casos) / base);
  return Math.min(TOPE_PUNTOS_POR_ALERTA, Math.max(PUNTOS_POR_CASO, proporcional));
}

/**
 * ¿El período no tuvo NINGÚN movimiento? (ADR-532). Sólo se afirma con los
 * tres totales a la vista y en 0, y sin un caso que reste: si falta un total
 * no se sabe; si hay un caso (una especie que arrastra saldo negativo de
 * antes) hay algo que calificar.
 */
export function ctpComplianceSinMovimiento(counts: CtpComplianceCounts): boolean {
  const b = counts.bases;
  if (!b || b.ingresos !== 0 || b.despachos !== 0 || b.producciones !== 0) return false;
  return CATEGORIAS_QUE_RESTAN.every((key) => casosDe(key, counts) === 0);
}

/** Lo que muestran el medidor, el chip y el PDF cuando el puntaje es `null`. */
export const CTP_SIN_MOVIMIENTO_LABEL = "Sin movimiento en el período";

/**
 * Score 0-100 de cumplimiento del período: arranca en 100 y cada categoría
 * corregible resta hasta 25 puntos (ver `puntosDeCategoria`).
 *
 * `null` = «Sin movimiento en el período» (ADR-532): un libro que no registró
 * nada no está «en orden», no hay nada que calificar. Antes daba 100 y le
 * ganaba a un CTP que despacha bien con un caso abierto.
 *
 * Suma explícita por categoría (no `Object.values`): así agregar un contador
 * informativo nuevo a `CtpComplianceCounts` no cambia el score en silencio.
 */
export function ctpComplianceScore(counts: CtpComplianceCounts): number | null {
  if (ctpComplianceSinMovimiento(counts)) return null;
  const deduccion = ctpComplianceBreakdown(counts).reduce((total, d) => total + d.puntos, 0);
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
const CATEGORIA_LABEL: Record<CategoriaQueResta, string> = {
  fueraPlazo: "Ingresos fuera de plazo",
  pendientes: "Guías sin recepcionar",
  especiesEnNegativo: "Especies en saldo negativo",
  stockNegativo: "Productos con stock negativo",
  despachosSinTraza: "Despachos sin cadena completa",
};

/**
 * La acción física que sube esos puntos. El label solo («Guías sin
 * recepcionar») dice qué está mal; esto dice qué hacer, que es lo que el panel
 * necesitaba para no quedarse en un diagnóstico.
 */
const CATEGORIA_ACCION: Record<CategoriaQueResta, string> = {
  fueraPlazo: "Ya pasó: sale solo cuando el período avance. Registra los próximos ingresos dentro de los 2 días hábiles.",
  pendientes: "Ve a Ingresos, mira la madera y cierra la recepción de cada guía (se puede en bloque).",
  especiesEnNegativo: "Esa especie consumió más de lo que entró validado: carga el ingreso que falta o corrige el consumo.",
  stockNegativo: "Se despachó más de lo producido: revisa la atribución del despacho o la producción declarada.",
  despachosSinTraza: "Completa la atribución del despacho desde su ficha («Editar atribución»): sin eso no hay certificado.",
};

export interface CtpComplianceDeduccion {
  key: CategoriaQueResta;
  label: string;
  /** Qué hacer para recuperar esos puntos. */
  accion: string;
  casos: number;
  /** Total del que los casos son parte (ingresos o despachos); null = resta 5 por caso. */
  base: number | null;
  /** Puntos que esta categoría le resta al score (0..TOPE_PUNTOS_POR_ALERTA). */
  puntos: number;
  /** true si una categoría SIN base llegó al tope (da igual 5 o 50). Con base, 25 = todos. */
  topeAlcanzado: boolean;
}

/**
 * Desglose del score: cuántos puntos resta cada categoría corregible. Single
 * source con `ctpComplianceScore` (el score SUMA este desglose) — el panel lo
 * muestra sin re-derivar la fórmula, así nunca divergen del score real.
 */
export function ctpComplianceBreakdown(counts: CtpComplianceCounts): CtpComplianceDeduccion[] {
  return CATEGORIAS_QUE_RESTAN.map((key) => {
    const casos = casosDe(key, counts);
    const base = baseDe(key, counts);
    const puntos = puntosDeCategoria(casos, base);
    return {
      key,
      label: CATEGORIA_LABEL[key],
      accion: CATEGORIA_ACCION[key],
      casos,
      base,
      puntos,
      topeAlcanzado: base == null && casos > 0 && puntos >= TOPE_PUNTOS_POR_ALERTA,
    };
  });
}

/** «5 de 21 ingresos» · «1 caso» · «5+ casos»: el mismo texto en el panel y en el PDF. */
export function ctpDeduccionCasosTexto(d: Pick<CtpComplianceDeduccion, "key" | "casos" | "base" | "topeAlcanzado">): string {
  if (d.base != null) return `${d.casos} de ${d.base} ${BASE_DE[d.key] === "despachos" ? "despachos" : "ingresos"}`;
  return `${d.casos}${d.topeAlcanzado ? "+" : ""} ${d.casos === 1 ? "caso" : "casos"}`;
}
