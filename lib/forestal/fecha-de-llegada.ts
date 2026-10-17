/**
 * Fecha real de llegada de una guía (ADR-434).
 *
 * «Recibir en bloque» le ponía la fecha de HOY a todas las guías marcadas. En
 * Blas, 7 guías del permiso 10-HUA-PUE/PER-FMP-2026-007 quedaron recibidas el
 * 23/09 aunque la sierra ya las usaba desde el 07/09, y T3 (ADR-433) no dejaba
 * vincular 18 de sus 30 corridas: el libro decía que la madera llegó después
 * de aserrarse.
 *
 * Acá viven las reglas de la fecha, puras, para que la pantalla y el servidor
 * digan lo mismo:
 *
 * 1. **Qué se propone** (`propuestaDeLlegada`): la recepción que ya tenga la
 *    guía, si no la fecha de la guía, si no la del asiento. El documento SNIFFS
 *    NO trae fecha de llegada —medido en los 11 documentos de Blas: registro,
 *    expedición y vencimiento; `traslado.fechaFin` es el vencimiento—, así que
 *    no se inventa una.
 * 2. **Qué no se acepta** (`problemaDeLlegada`): sin fecha, una fecha futura
 *    (el «hoy» de Lima) o anterior a la guía.
 * 3. **Qué se avisa sin bloquear**: corridas del permiso de la misma especie
 *    anteriores a la llegada (`avisosDeCorridas`) y el plazo de registro que
 *    queda con esa fecha (`avisoDePlazo`).
 * 4. **Qué bloquea en el servidor al corregir** (`choquesConLaSierra`): una
 *    corrida viva que ya aserró trozas de la guía y es ANTERIOR a la nueva
 *    llegada. Es T3 al revés: en vez de meter una troza en una corrida vieja,
 *    se atrasa la llegada de una troza ya aserrada.
 * 5. **La guía vencida** (`vencimientoDeGuia`, `recibidaDespuesDelVencimiento`,
 *    ADR-434 §Vencimiento): una llegada posterior al vencimiento de la guía
 *    dice que la madera viajó con la guía vencida. Se puede guardar —si pasó,
 *    el libro tiene que poder decirlo—, pero sólo confirmándolo con motivo.
 *
 * PURO y client-safe: sin Prisma, sin Intl (los meses cambian con la versión
 * de ICU). Fechas `AAAA-MM-DD` leídas en UTC, como todo el libro.
 */

import { diasHabilesDeRegistro, PLAZO_REGISTRO_DIAS } from "./ctp-compliance";
import { claveEspecie } from "./loth-constants";
import { diaDelLibro, type FechaDelLibro } from "./recepcion-antes-de-la-sierra";
import { aISO } from "./serfor-gtf-a-datos";

export { diaDelLibro, type FechaDelLibro };

/** De dónde sale la fecha propuesta. */
export type FuenteDeLlegada = "recepcion" | "guia" | "asiento" | "hoy" | "vencimiento" | "expedicion";

export const TEXTO_FUENTE: Record<FuenteDeLlegada, string> = {
  recepcion: "la recepción que ya tiene",
  guia: "la fecha de la guía",
  asiento: "la fecha del asiento (la guía no trae fecha)",
  hoy: "hoy: la guía tiene una fecha futura",
  vencimiento: "el vencimiento de la guía: la otra fecha caía después",
  expedicion: "la expedición de la guía: antes no pudo salir",
};

/** Las fechas de una guía que sirven para proponer y validar su llegada. */
export interface FechasDeLaGuia {
  /** `gtfDate`: la fecha que declara el papel. */
  guia: FechaDelLibro;
  /** `entryDate` del asiento más viejo. */
  asiento: FechaDelLibro;
  /** La recepción que ya tiene (una guía a medio recibir, o la que se corrige). */
  recepcion?: FechaDelLibro;
  /** Expedición y vencimiento del papel: la propuesta no sale de ese tramo. */
  vigencia?: VigenciaDeGuia | null;
}

export interface PropuestaDeLlegada {
  dia: string;
  fuente: FuenteDeLlegada;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** `AAAA-MM-DD` que existe en el calendario (el 31/02 no pasa). */
export function esDiaValido(dia: string): boolean {
  if (!DIA.test(dia)) return false;
  const d = new Date(`${dia}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

/** `AAAA-MM-DD` → `dd/mm`, sin Intl. */
export const ddmm = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/**
 * La fecha que se ofrece para una guía. Nunca futura: si la de la guía lo es
 * (un error de tipeo), se ofrece hoy y la validación dice qué pasa.
 *
 * `usarRecepcion` = una guía a medio recibir mantiene el día que ya declaró. Al
 * CORREGIR no se usa: lo que se corrige es justamente esa fecha.
 *
 * Con la vigencia del papel, lo que se propone queda entre la expedición y el
 * vencimiento (ADR-434 §Vencimiento): proponer un día en que la guía ya no
 * valía sería sugerir el problema. La recepción que ya tiene NO se acota: es un
 * hecho declarado, y si cae después del vencimiento la revisión lo pide
 * confirmado.
 */
export function propuestaDeLlegada(
  f: FechasDeLaGuia,
  hoy: string,
  usarRecepcion = true,
): PropuestaDeLlegada | null {
  const candidatas: [FechaDelLibro, FuenteDeLlegada][] = [
    ...(usarRecepcion ? ([[f.recepcion, "recepcion"]] as [FechaDelLibro, FuenteDeLlegada][]) : []),
    [f.guia, "guia"],
    [f.asiento, "asiento"],
  ];
  for (const [v, fuente] of candidatas) {
    const dia = diaDelLibro(v);
    if (!dia) continue;
    const propuesta: PropuestaDeLlegada = dia > hoy ? { dia: hoy, fuente: "hoy" } : { dia, fuente };
    return fuente === "recepcion" ? propuesta : acotarALaVigencia(propuesta, f.vigencia, hoy);
  }
  const exp = f.vigencia?.expedicion;
  return exp && exp <= hoy ? { dia: exp, fuente: "expedicion" } : null;
}

function acotarALaVigencia(p: PropuestaDeLlegada, v: VigenciaDeGuia | null | undefined, hoy: string): PropuestaDeLlegada {
  if (!v) return p;
  /* `p.dia` ya es ≤ hoy, así que un vencimiento anterior también lo es. */
  if (v.vencimiento && p.dia > v.vencimiento) return { dia: v.vencimiento, fuente: "vencimiento" };
  if (v.expedicion && p.dia < v.expedicion && v.expedicion <= hoy) return { dia: v.expedicion, fuente: "expedicion" };
  return p;
}

/**
 * Qué impide usar esa fecha de llegada. `null` = sirve.
 *
 * Bloquea sólo lo que no puede ser: sin fecha, futura, o antes de que existiera
 * la guía. Lo que puede ser pero merece mirarse (corridas anteriores, plazo)
 * va por los avisos.
 */
export function problemaDeLlegada(dia: string, guia: FechaDelLibro, hoy: string): string | null {
  if (!esDiaValido(dia)) return "Falta la fecha en que llegó la madera.";
  if (dia > hoy) return `No puede ser una fecha futura: hoy es ${ddmm(hoy)}.`;
  const g = diaDelLibro(guia);
  if (g && dia < g) return `La madera no pudo llegar antes de su guía, que es del ${ddmm(g)}.`;
  return null;
}

// ── La vigencia de la guía: expedición y vencimiento (ADR-434 §Vencimiento) ──

/**
 * Lo que el papel dice de su vigencia: casilleros (3) F. Expedición y (4) F.
 * Vencimiento, `AAAA-MM-DD`. `null` = la guía no lo trae y NO se inventa.
 */
export interface VigenciaDeGuia {
  expedicion: string | null;
  vencimiento: string | null;
}

/** Una fila del libro con sus papeles: la ficha de SERFOR y el cuerpo transcrito. */
export interface LineaConPapel {
  /** `WoodEntry.serforGtf`: `fechaExpedicion` y `fechaVencimiento` en «dd/mm/aaaa». */
  serforGtf?: unknown;
  /** `WoodEntry.gtfDatos`: `traslado.fechaInicio` y `traslado.fechaFin` en `AAAA-MM-DD`. */
  gtfDatos?: unknown;
}

const campos = (v: unknown): Record<string, unknown> | null =>
  v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** «dd/mm/aaaa» o `AAAA-MM-DD` → un día que existe, o `null`. Lee con `aISO`, el lector de la ficha. */
function diaDelPapel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = aISO(v);
  return d && esDiaValido(d) ? d : null;
}

/**
 * Expedición y vencimiento de la guía. Manda la ficha oficial de SERFOR
 * (`serforGtf`); sin ella, los casilleros (3) y (4) transcritos al cuerpo de la
 * guía (`gtfDatos.traslado`, la misma fuente con la que se imprime). Sin
 * ninguno de los dos —un alta a mano que no los llenó—, `null`: sin fecha de
 * vencimiento no hay aviso, y nunca se estima una.
 *
 * Un vencimiento anterior a la expedición es un papel mal leído: se descarta
 * antes que pintar de rojo una guía por un tipeo.
 */
export function vencimientoDeGuia(lineas: readonly LineaConPapel[]): VigenciaDeGuia {
  let expedicion: string | null = null;
  let vencimiento: string | null = null;
  for (const l of lineas) {
    const f = campos(l.serforGtf);
    expedicion ??= diaDelPapel(f?.fechaExpedicion);
    vencimiento ??= diaDelPapel(f?.fechaVencimiento);
  }
  for (const l of lineas) {
    const t = campos(campos(l.gtfDatos)?.traslado);
    expedicion ??= diaDelPapel(t?.fechaInicio);
    vencimiento ??= diaDelPapel(t?.fechaFin);
  }
  if (expedicion && vencimiento && vencimiento < expedicion) vencimiento = null;
  return { expedicion, vencimiento };
}

/**
 * ¿La madera figura recibida DESPUÉS de que venció su guía? El día del
 * vencimiento todavía vale (`trasladoVigente` lo mide hasta las 23:59). Sin
 * alguna de las dos fechas, `false`: no se afirma lo que no se sabe.
 */
export function recibidaDespuesDelVencimiento(recepcion: FechaDelLibro, vencimiento: string | null | undefined): boolean {
  const r = diaDelLibro(recepcion);
  return Boolean(r && vencimiento && r > vencimiento);
}

/** La frase, igual en la pantalla, en el servidor y en el rastro. */
export const mensajeDeVencida = (vencimiento: string): string =>
  `La guía venció el ${ddmm(vencimiento)}: con esta fecha, el libro dice que la madera viajó con la guía vencida.`;

/** La llegada elegida cae después del vencimiento: se guarda sólo confirmándolo. */
export interface VencidaAlLlegar {
  vencimiento: string;
  expedicion: string | null;
  mensaje: string;
}

export function vencidaAlLlegar(dia: string, vigencia: Partial<VigenciaDeGuia> | null | undefined): VencidaAlLlegar | null {
  const v = vigencia?.vencimiento ?? null;
  if (!v || !esDiaValido(dia) || !(dia > v)) return null;
  return { vencimiento: v, expedicion: vigencia?.expedicion ?? null, mensaje: mensajeDeVencida(v) };
}

/** Lo que manda quien confirma una llegada posterior al vencimiento. */
export interface ConfirmacionDeVencida {
  aceptaVencida?: boolean;
  motivoVencida?: string | null;
}

/** Mínimo de letras del motivo: el mismo que el de corregir una fecha del libro. */
export const MIN_MOTIVO_VENCIDA = 3;

export const confirmaVencida = (c: ConfirmacionDeVencida | null | undefined): boolean =>
  c?.aceptaVencida === true && (c.motivoVencida ?? "").trim().length >= MIN_MOTIVO_VENCIDA;

/**
 * El freno de la vencida sin confirmar. No es un «no se puede» pelado: dice el
 * tramo en que la guía valía y cómo guardarla si de verdad llegó así.
 */
export function bloqueoDeVencida(
  vencida: VencidaAlLlegar | null,
  c: ConfirmacionDeVencida | null | undefined,
): { codigo: "GUIA_VENCIDA"; mensaje: string } | null {
  if (!vencida || confirmaVencida(c)) return null;
  if (c?.aceptaVencida === true) {
    return { codigo: "GUIA_VENCIDA", mensaje: `Escribe por qué llegó después del vencimiento (mínimo ${MIN_MOTIVO_VENCIDA} letras).` };
  }
  const tramo = vencida.expedicion
    ? `entre el ${ddmm(vencida.expedicion)} y el ${ddmm(vencida.vencimiento)}`
    : `hasta el ${ddmm(vencida.vencimiento)}`;
  return {
    codigo: "GUIA_VENCIDA",
    mensaje: `${vencida.mensaje} Si llegó antes, pon la fecha real (${tramo}); si de verdad llegó así, confírmalo con el motivo.`,
  };
}

/** Una guía de la lista, con lo mínimo para decir si venció. */
export interface GuiaConVigencia {
  status: string;
  lineas: readonly (LineaConPapel & { status?: string; fechaRecepcion?: FechaDelLibro })[];
}

export type EstadoDeVencimiento =
  | { tipo: "recibida_vencida"; vencimiento: string; recepcion: string; texto: string; detalle: string }
  | { tipo: "vencida_sin_recibir"; vencimiento: string; texto: string; detalle: string };

const viva = (s: string | undefined) => s !== "rechazado" && s !== "anulado";

/**
 * El chip de la lista, en palabras y no sólo con color (ADR-434 §Vencimiento):
 * - «recibida después del vencimiento (vencía dd/mm)» — alguna fila viva
 *   figura recibida después; se mira la ÚLTIMA recepción, porque una guía es un
 *   solo viaje y cualquier madera fechada después viajó con la guía vencida.
 * - «vencida el dd/mm, sin recibir» — le falta recibir madera y su guía ya
 *   venció (antes de hoy, en Lima).
 * `null` sin vencimiento conocido, o en una guía rechazada o anulada.
 */
export function estadoDeVencimiento(g: GuiaConVigencia, hoy: string): EstadoDeVencimiento | null {
  if (!viva(g.status)) return null;
  const vivas = g.lineas.filter((l) => viva(l.status));
  const { vencimiento } = vencimientoDeGuia(vivas);
  if (!vencimiento) return null;
  const recepciones = vivas
    .map((l) => diaDelLibro(l.fechaRecepcion))
    .filter((d): d is string => Boolean(d))
    .sort();
  const ultima = recepciones.at(-1);
  if (ultima && recibidaDespuesDelVencimiento(ultima, vencimiento)) {
    return {
      tipo: "recibida_vencida",
      vencimiento,
      recepcion: ultima,
      texto: `recibida después del vencimiento (vencía ${ddmm(vencimiento)})`,
      detalle: `Figura recibida el ${ddmm(ultima)} y la guía venció el ${ddmm(vencimiento)}: el libro dice que la madera viajó con la guía vencida. Si llegó antes, corrige la recepción.`,
    };
  }
  const faltaRecibir = vivas.some((l) => !diaDelLibro(l.fechaRecepcion));
  if (faltaRecibir && vencimiento < hoy) {
    return {
      tipo: "vencida_sin_recibir",
      vencimiento,
      texto: `vencida el ${ddmm(vencimiento)}, sin recibir`,
      detalle: `La guía venció el ${ddmm(vencimiento)}. Si la madera llegó antes, recíbela con esa fecha; si llegó después, el libro te pide confirmarlo con el motivo.`,
    };
  }
  return null;
}

// ── Aviso: corridas del permiso anteriores a la llegada ─────────────────────

/** Una corrida viva del permiso de la guía. */
export interface CorridaDelPermiso {
  especie: string | null;
  /** `AAAA-MM-DD`. */
  dia: string;
}

export interface CorridasAntes {
  /** La especie tal como la escribe la guía. */
  especie: string;
  n: number;
  /** La primera de esas corridas, `AAAA-MM-DD`. */
  desde: string;
}

/**
 * Las corridas del permiso, de una especie de la guía, con fecha ANTERIOR a la
 * llegada. El mismo día pasa (se descarga a la mañana, se asierra a la tarde).
 *
 * No bloquea: esas corridas pueden haber salido de OTRA guía del permiso que
 * llegó antes. Lo que dice es que de ÉSTA no pudieron salir.
 */
export function corridasAntesDeLaLlegada(
  dia: string,
  especiesDeLaGuia: readonly string[],
  corridas: readonly CorridaDelPermiso[],
): CorridasAntes[] {
  if (!esDiaValido(dia)) return [];
  const nombre = new Map<string, string>();
  for (const e of especiesDeLaGuia) {
    const k = claveEspecie(e);
    if (k && !nombre.has(k)) nombre.set(k, e.trim());
  }
  const porEspecie = new Map<string, CorridasAntes>();
  for (const c of corridas) {
    const k = claveEspecie(c.especie);
    const especie = nombre.get(k);
    if (!especie || !(c.dia < dia)) continue;
    const prev = porEspecie.get(k);
    if (prev) {
      prev.n += 1;
      if (c.dia < prev.desde) prev.desde = c.dia;
    } else {
      porEspecie.set(k, { especie, n: 1, desde: c.dia });
    }
  }
  return [...porEspecie.values()].sort((a, b) => a.desde.localeCompare(b.desde) || a.especie.localeCompare(b.especie));
}

/**
 * «Hay 4 corridas de Cachimbo de este permiso desde el 07/09: si la madera
 * llegó el 23/09, esas corridas no pudieron salir de esta guía.» Una sola
 * línea aunque la guía traiga varias especies: tres renglones que dicen lo
 * mismo se dejan de leer. Vacío = nada que avisar.
 */
export function avisosDeCorridas(
  dia: string,
  especiesDeLaGuia: readonly string[],
  corridas: readonly CorridaDelPermiso[],
): string[] {
  const antes = corridasAntesDeLaLlegada(dia, especiesDeLaGuia, corridas);
  if (antes.length === 0) return [];
  const total = antes.reduce((a, c) => a + c.n, 0);
  const cola = `si la madera llegó el ${ddmm(dia)}, ${total === 1 ? "esa corrida no pudo salir" : "esas corridas no pudieron salir"} de esta guía.`;
  if (antes.length === 1) {
    const c = antes[0];
    return [
      `Hay ${c.n === 1 ? "una corrida" : `${c.n} corridas`} de ${c.especie} de este permiso desde el ${ddmm(c.desde)}: ${cola}`,
    ];
  }
  const detalle = antes.map((c) => `${c.especie} ${c.n} desde el ${ddmm(c.desde)}`).join(", ");
  return [`Hay ${total} corridas de este permiso anteriores a esa fecha (${detalle}): ${cola}`];
}

/**
 * La recepción ACTUAL de una guía ya recibida choca con la sierra: hay
 * corridas de su permiso y especie anteriores. Es la señal de «Recibir en
 * bloque» con la fecha de hoy (las 8 guías de 10-HUA en Blas). No prueba que
 * esté mal —esas corridas pueden venir de otra guía—, pero es donde mirar.
 */
export function llegadaSospechosa(ctx: Pick<ContextoDeLlegada, "recepcion" | "especies" | "corridas">): boolean {
  return Boolean(ctx.recepcion) && corridasAntesDeLaLlegada(ctx.recepcion ?? "", ctx.especies, ctx.corridas).length > 0;
}

// ── Aviso: el plazo de registro con esa llegada ─────────────────────────────

/**
 * Días hábiles entre la llegada y el registro del asiento, con la MISMA fórmula
 * que el plazo del libro (`diasHabilesDeRegistro`). `null` sin dato.
 *
 * Es un aviso: el indicador de plazo del libro sigue midiendo desde la fecha
 * del asiento (`estaFueraDePlazo`) y no cambia por esto.
 */
export function plazoDesdeLaLlegada(
  dia: string,
  registradoEl: FechaDelLibro,
): { diasHabiles: number; fuera: boolean } | null {
  if (!esDiaValido(dia) || registradoEl == null || registradoEl === "") return null;
  const diasHabiles = diasHabilesDeRegistro({ entryDate: `${dia}T00:00:00.000Z`, createdAt: registradoEl });
  return { diasHabiles, fuera: diasHabiles > PLAZO_REGISTRO_DIAS };
}

/** «Con esta fecha, el asiento queda fuera de plazo: …», o `null` si queda dentro. */
export function avisoDePlazo(dia: string, registradoEl: FechaDelLibro): string | null {
  const p = plazoDesdeLaLlegada(dia, registradoEl);
  if (!p?.fuera) return null;
  return (
    `Con esta fecha, el asiento queda fuera de plazo: se registró ${p.diasHabiles} días hábiles ` +
    `después de la llegada (el plazo es ${PLAZO_REGISTRO_DIAS}).`
  );
}

// ── Guard: una corrida que ya aserró trozas de la guía ──────────────────────

/** Una troza de la guía que ya entró a una corrida viva. */
export interface PiezaAserrada {
  id: string;
  codigo: string | null;
  /** Su propia fecha de recepción (ADR-336: una guía se descarga en dos viajes). */
  fechaPropia: FechaDelLibro;
  /** La recepción actual de su asiento, antes de corregir. */
  fechaDeSuAsiento: FechaDelLibro;
  corrida: { id: string; lineNo: number | null; fecha: FechaDelLibro };
}

/**
 * ¿La troza toma la fecha nueva de la guía? Sí si no tiene fecha propia o si
 * tiene la misma que su asiento. Una que bajó en otro viaje conserva la suya.
 */
export function sigueALaGuia(p: Pick<PiezaAserrada, "fechaPropia" | "fechaDeSuAsiento">): boolean {
  const propia = diaDelLibro(p.fechaPropia);
  return propia == null || propia === diaDelLibro(p.fechaDeSuAsiento);
}

export interface ChoqueConCorrida {
  corridaId: string;
  lineNo: number | null;
  /** `AAAA-MM-DD`. */
  dia: string;
  trozas: { id: string; codigo: string | null }[];
}

/**
 * Las corridas que dejarían de cumplir T3 si la guía llegara `dia`: aserraron
 * trozas que siguen a la guía y son de un día ANTERIOR. Ordenadas de la más
 * vieja a la más nueva — la primera fija el tope.
 */
export function choquesConLaSierra(dia: string, piezas: readonly PiezaAserrada[]): ChoqueConCorrida[] {
  const porCorrida = new Map<string, ChoqueConCorrida>();
  for (const p of piezas) {
    if (!sigueALaGuia(p)) continue;
    const corridaDia = diaDelLibro(p.corrida.fecha);
    if (!corridaDia || !(corridaDia < dia)) continue;
    const c = porCorrida.get(p.corrida.id) ?? {
      corridaId: p.corrida.id,
      lineNo: p.corrida.lineNo,
      dia: corridaDia,
      trozas: [],
    };
    c.trozas.push({ id: p.id, codigo: p.codigo });
    porCorrida.set(p.corrida.id, c);
  }
  return [...porCorrida.values()].sort((a, b) => a.dia.localeCompare(b.dia) || (a.lineNo ?? 0) - (b.lineNo ?? 0));
}

const NOMBRADAS = 4;

/**
 * El rechazo, con el camino: qué corrida, qué trozas, y hasta qué día sirve.
 * No es un «no se puede» pelado (regla forestal: se rechaza indicando el camino).
 */
export function mensajeDeChoque(gtf: string, dia: string, choques: readonly ChoqueConCorrida[]): string {
  if (choques.length === 0) return "";
  const primera = choques[0];
  const trozas = primera.trozas
    .slice(0, NOMBRADAS)
    .map((t) => t.codigo ?? t.id)
    .join(", ");
  const resto = primera.trozas.length > NOMBRADAS ? ` y ${primera.trozas.length - NOMBRADAS} más` : "";
  const cual = primera.lineNo != null ? `La corrida N° ${primera.lineNo}` : "Una corrida";
  const otras =
    choques.length > 1 ? ` (y ${choques.length - 1} corrida${choques.length === 2 ? "" : "s"} más hasta el ${ddmm(choques[choques.length - 1].dia)})` : "";
  const n = primera.trozas.length;
  return (
    `${cual} del ${ddmm(primera.dia)} ya aserró ${n === 1 ? "la troza" : `${n} trozas`} ${trozas}${resto} de la guía ${gtf}${otras}: ` +
    `la madera no pudo llegar el ${ddmm(dia)}. La llegada tiene que ser el ${ddmm(primera.dia)} o antes, ` +
    `o primero saca esas trozas de la corrida.`
  );
}

// ── El contexto de una guía y la revisión completa ──────────────────────────

/**
 * Lo que el servidor sabe de una guía para revisar su llegada. Viaja al
 * navegador (GET `wood-entries/recepcion`) y el servidor lo vuelve a leer
 * DENTRO de la transacción al corregir: la pantalla y el guard miran lo mismo.
 */
export interface ContextoDeLlegada {
  gtfNumber: string;
  /** Asientos vivos de la guía (sin anulados ni rechazados). */
  asientos: number;
  /** `AAAA-MM-DD` de la guía, del asiento más viejo y de la recepción actual. */
  guia: string | null;
  asiento: string | null;
  /** La recepción actual: la más vieja de sus asientos, o `null` si ninguno tiene. */
  recepcion: string | null;
  /** La más nueva de sus asientos: con ella se dice si alguna madera llegó con la guía vencida. */
  ultimaRecepcion?: string | null;
  /** (3) y (4) del papel (`vencimientoDeGuia`); `null` = la guía no los trae. */
  expedicion?: string | null;
  vencimiento?: string | null;
  /** Todos sus asientos tienen la misma recepción (y ninguno está sin fecha). */
  recepcionPareja: boolean;
  /**
   * La especie de cada fila viva que todavía NO se recibió. Con alguna, la guía
   * está a medio recibir y no se corrige: esa fila se recibe primero (ADR-434).
   */
  filasSinRecibir: string[];
  /** ISO del primer registro del asiento en el sistema: con él se mide el plazo. */
  registradoEl: string | null;
  /** Las especies de la guía: las de sus asientos y las de sus trozas. */
  especies: string[];
  /** El permiso de la guía (código), si lo tiene. */
  permiso: string | null;
  /** Las corridas vivas de ese permiso, de cualquier especie. */
  corridas: CorridaDelPermiso[];
  /** Las trozas de la guía que ya entraron a una corrida viva. */
  piezasAserradas: PiezaAserrada[];
  /** `AAAA-MM` de cada asiento de la guía: el mes del libro al que pertenece. */
  mesesDeAsientos: string[];
  /** Los meses cerrados (y no reabiertos) del libro: `periodKey` «AAAA-MM» + «mayo de 2026». */
  mesesCerrados: { periodKey: string; label: string }[];
  /** Algún consumo de la guía tiene el costo congelado al cierre. */
  congelado: boolean;
}

/** Recibir = la guía todavía no tiene fecha; corregir = ya la tiene y se cambia. */
export type ModoDeLlegada = "recibir" | "corregir";

/** Los códigos coinciden con los de `CtpInvariantError`: el servidor tira con éste. */
export type CodigoDeBloqueo =
  | "VALIDACION"
  | "ESTADO_NO_EDITABLE"
  | "PERIODO_CERRADO"
  | "CONGELADO"
  | "T3_ASERRADA_ANTES_DE_LLEGAR"
  | "GUIA_VENCIDA";

export interface RevisionDeLlegada {
  bloqueo: { codigo: CodigoDeBloqueo; mensaje: string } | null;
  /** Lo que conviene mirar antes de guardar; no impide guardar. */
  avisos: string[];
  /**
   * La fecha cae después del vencimiento de la guía: se guarda sólo con
   * «Confirmo que llegó después del vencimiento» y un motivo. Sin eso, el
   * `bloqueo` es `GUIA_VENCIDA`. Ausente = nada que confirmar.
   */
  vencida?: VencidaAlLlegar;
}

/**
 * Todo lo que se dice de una fecha de llegada, en un solo lugar. Lo usan la
 * fila del modal (antes de guardar) y el servidor (dentro de la transacción).
 *
 * Al RECIBIR, sólo se fechan las trozas sin fecha propia (`recepcionar` no
 * pisa lo ya declarado), así que sólo ésas pueden chocar con la sierra. Al
 * CORREGIR, también las que tenían la fecha de la guía (`sigueALaGuia`).
 *
 * La guía vencida frena DESPUÉS de los frenos del libro: una confirmación no
 * destraba un mes cerrado ni una corrida que ya aserró la madera.
 */
export function revisarLlegada(
  dia: string,
  ctx: ContextoDeLlegada,
  hoy: string,
  modo: ModoDeLlegada,
  confirmacion?: ConfirmacionDeVencida,
): RevisionDeLlegada {
  const invalida = problemaDeLlegada(dia, ctx.guia, hoy);
  if (invalida) return { bloqueo: { codigo: "VALIDACION", mensaje: invalida }, avisos: [] };

  const avisos = avisosDeCorridas(dia, ctx.especies, ctx.corridas);
  const plazo = avisoDePlazo(dia, ctx.registradoEl);
  if (plazo) avisos.push(plazo);

  const vencida = vencidaAlLlegar(dia, ctx);
  const bloqueo = bloqueoDelLibro(dia, ctx, modo) ?? bloqueoDeVencida(vencida, confirmacion);
  return vencida ? { bloqueo, avisos, vencida } : { bloqueo, avisos };
}

/**
 * Lo que se sabe de una fecha ANTES de que llegue el contexto del servidor: el
 * papel (fecha de la guía, vigencia) ya está en la fila. Así el aviso de la
 * vencida aparece al elegir la fecha, sin esperar la red.
 */
export function revisarSinContexto(
  dia: string,
  guia: FechaDelLibro,
  vigencia: VigenciaDeGuia | null,
  hoy: string,
  confirmacion?: ConfirmacionDeVencida,
): RevisionDeLlegada {
  const p = problemaDeLlegada(dia, guia, hoy);
  if (p) return { bloqueo: { codigo: "VALIDACION", mensaje: p }, avisos: [] };
  const vencida = vencidaAlLlegar(dia, vigencia);
  const bloqueo = bloqueoDeVencida(vencida, confirmacion);
  return vencida ? { bloqueo, avisos: [], vencida } : { bloqueo, avisos: [] };
}

/** ¿Alguna madera de la guía figura recibida después de su vencimiento? Con el contexto del servidor. */
export const recibidaVencida = (ctx: Pick<ContextoDeLlegada, "recepcion" | "ultimaRecepcion" | "vencimiento">): boolean =>
  recibidaDespuesDelVencimiento(ctx.ultimaRecepcion ?? ctx.recepcion, ctx.vencimiento);

function bloqueoDelLibro(
  dia: string,
  ctx: ContextoDeLlegada,
  modo: ModoDeLlegada,
): RevisionDeLlegada["bloqueo"] {
  if (modo === "corregir") {
    if (!ctx.recepcion) {
      return {
        codigo: "ESTADO_NO_EDITABLE",
        mensaje: `La guía ${ctx.gtfNumber} todavía no se recibió: usa «Recibir en bloque».`,
      };
    }
    /* A medio recibir (un bloque cortado a mitad de guía, o una fila de otra
       especie agregada después): corregir le pondría fecha a la fila que nadie
       recibió y la sacaría de «por recibir» sin validarla. Se recibe primero. */
    if (ctx.filasSinRecibir.length > 0) {
      const n = ctx.filasSinRecibir.length;
      return {
        codigo: "ESTADO_NO_EDITABLE",
        mensaje:
          `A esta guía le falta recibir ${n === 1 ? "la fila" : "las filas"} de ${ctx.filasSinRecibir.join(", ")}: ` +
          `${n === 1 ? "recíbela" : "recíbelas"} primero en «Recibir en bloque».`,
      };
    }
    if (ctx.recepcionPareja && ctx.recepcion === dia) {
      return { codigo: "VALIDACION", mensaje: `La guía ya figura recibida el ${ddmm(dia)}.` };
    }
    if (ctx.congelado) {
      return {
        codigo: "CONGELADO",
        mensaje: `La guía ${ctx.gtfNumber} ya tiene el costo congelado al cierre: reabre el período para corregir su recepción.`,
      };
    }
  }

  /* El mes del asiento siempre (es el guard de `recepcionar`); al corregir,
     también el de la recepción vieja y el de la nueva: un mes cerrado es un
     acta entregada, y se reabre para tocarla. */
  const meses = new Set(ctx.mesesDeAsientos);
  if (modo === "corregir") {
    if (ctx.recepcion) meses.add(ctx.recepcion.slice(0, 7));
    meses.add(dia.slice(0, 7));
  }
  const cerrado = ctx.mesesCerrados.find((m) => meses.has(m.periodKey));
  if (cerrado) {
    return {
      codigo: "PERIODO_CERRADO",
      mensaje: `El período ${cerrado.label} está cerrado: no se puede cambiar la recepción de la guía ${ctx.gtfNumber}. Reabre el período para corregir.`,
    };
  }

  const piezas =
    modo === "recibir" ? ctx.piezasAserradas.filter((p) => diaDelLibro(p.fechaPropia) == null) : ctx.piezasAserradas;
  const choques = choquesConLaSierra(dia, piezas);
  if (choques.length > 0) {
    return { codigo: "T3_ASERRADA_ANTES_DE_LLEGAR", mensaje: mensajeDeChoque(ctx.gtfNumber, dia, choques) };
  }
  return null;
}

/**
 * ¿La guía tiene una recepción que se pueda mirar para corregir? Viva (ni
 * rechazada ni anulada) y con fecha en algún asiento. Una a medio recibir
 * ENTRA a propósito: el modal le dice qué fila falta recibir, y el servidor
 * frena la corrección con el mismo mensaje (`revisarLlegada`).
 */
export function yaRecibida(g: {
  status: string;
  lineas: readonly { status?: string; fechaRecepcion?: string | Date | null }[];
}): boolean {
  if (g.status === "rechazado" || g.status === "anulado") return false;
  return g.lineas.some(
    (l) => l.status !== "rechazado" && l.status !== "anulado" && Boolean(diaDelLibro(l.fechaRecepcion)),
  );
}
