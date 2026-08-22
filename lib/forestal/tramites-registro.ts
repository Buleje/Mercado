/**
 * tramites-registro — el expediente de un trámite, normalizado en el servidor.
 *
 * Un trámite sin fecha de presentación es un trámite que se vuelve a hacer. Este
 * módulo define QUÉ se guarda y lo normaliza: el cliente propone, el servidor
 * decide (mismo criterio que `cubicacion-registro`, ADR-308 §4).
 *
 * PURO: sin Prisma ni fetch — se testea sin DB.
 */

import { formatoPorId, type AutoridadTramite, type DatosTramite } from "./tramites-catalogo";

/**
 * El ciclo real de un trámite en mesa de partes:
 * borrador → presentado → (observado ⇄ presentado) → resuelto | desistido.
 */
export type EstadoTramite = "borrador" | "presentado" | "observado" | "resuelto" | "desistido";

export const ESTADOS_TRAMITE: { key: EstadoTramite; label: string; tono: "muted" | "info" | "warning" | "success" }[] = [
  { key: "borrador", label: "Borrador", tono: "muted" },
  { key: "presentado", label: "Presentado", tono: "info" },
  { key: "observado", label: "Observado", tono: "warning" },
  { key: "resuelto", label: "Resuelto", tono: "success" },
  { key: "desistido", label: "Desistido", tono: "muted" },
];

export interface TramiteRegistro {
  id: string;
  /** Id del formato del catálogo (`visado-talonario-gtf`, …). */
  formatoId: string;
  /** Copia del nombre: si mañana se renombra el formato, el expediente viejo
   *  sigue diciendo lo que se presentó. */
  formatoNombre: string;
  autoridad: AutoridadTramite;
  asunto: string;
  datos: DatosTramite;
  estado: EstadoTramite;
  /** N° que le puso la autoridad al expediente (el que sirve para preguntar). */
  expedienteAutoridad: string | null;
  /** Cuándo se presentó en mesa de partes (date-only, `YYYY-MM-DD`). */
  fechaPresentacion: string | null;
  /** Cuándo respondió la autoridad. */
  fechaRespuesta: string | null;
  /**
   * Fecha límite real para presentar ESTE trámite (date-only), cuando responde
   * a una notificación con plazo propio (ej. descargo ante supervisión: el
   * plazo corre desde `fechaNotificacion` del formato, no desde hoy).
   *
   * SIEMPRE la tipea el operador — el catálogo no inventa un número de días
   * por formato (regla de honestidad legal del módulo, `tramites-catalogo.ts`):
   * cada TUPA/norma sectorial cuenta distinto y el sistema no lo sabe. Lo que
   * el sistema SÍ hace es avisar con anticipación una vez que el operador
   * cargó la fecha real (`tramitesPorVencer`, T-3 por defecto).
   */
  fechaLimite: string | null;
  notas: string | null;
  /**
   * N° de documento propio, correlativo por año ("001-2026") — sólo en
   * formatos con `correlativo: true` (ADR-364 ronda 3). `null` hasta que el
   * trámite pasa a "Presentado" por primera vez; una vez asignado NUNCA se
   * reasigna, ni siquiera si el trámite vuelve a "Borrador".
   */
  numeroDocumento: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface TramiteInput {
  id?: string;
  formatoId: string;
  formatoNombre?: string;
  autoridad: AutoridadTramite;
  asunto?: string;
  datos?: DatosTramite;
  estado?: string;
  expedienteAutoridad?: string | null;
  fechaPresentacion?: string | null;
  fechaRespuesta?: string | null;
  fechaLimite?: string | null;
  notas?: string | null;
  /** Preservado por el caller (`ForestTramitesDB.save`) desde el registro
   *  existente — el cliente nunca lo manda, `construirTramite` lo asigna solo. */
  numeroDocumento?: string | null;
  createdAt?: string;
  createdBy?: string;
  /** El ahora, inyectado: así el registro es determinista en los tests. */
  ahora?: string;
}

const texto = (v: unknown, max: number): string =>
  String(v ?? "")
    .trim()
    .slice(0, max);

const opcional = (v: unknown, max: number): string | null => {
  const t = texto(v, max);
  return t || null;
};

/** `YYYY-MM-DD` o null. Una fecha inventada es peor que ninguna. */
const fechaSolo = (v: unknown): string | null => {
  const t = texto(v, 30);
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
};

const ESTADOS = new Set(ESTADOS_TRAMITE.map((e) => e.key));

/**
 * Siguiente correlativo del formato, para el AÑO de `hoy`: "NNN-YYYY", 3
 * dígitos, se resetea cada año (un talonario real no arrastra la numeración
 * de un año al otro). Mira sólo los `numeroDocumento` YA asignados de ese
 * mismo formato — un trámite todavía sin número (borrador) no cuenta.
 */
function siguienteNumeroDocumento(existentes: TramiteRegistro[], formatoId: string, hoy: Date): string {
  const sufijo = `-${hoy.getUTCFullYear()}`;
  const usados = existentes
    .filter((t) => t.formatoId === formatoId && t.numeroDocumento?.endsWith(sufijo))
    .map((t) => Number(t.numeroDocumento!.slice(0, -sufijo.length)))
    .filter((n) => Number.isFinite(n));
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${String(siguiente).padStart(3, "0")}${sufijo}`;
}

/**
 * Los valores del formulario, acotados: es un JSON en KV, no un textarea
 * infinito. `datos.guiasJson` (ADR-364, la relación de guías con su lista de
 * trozas) es el campo más pesado: unas 60 guías con detalle de trozas rondan
 * los 15-18 KB, así que el tope sube de 4 KB a 20 KB — sigue acotado, no es
 * "cualquier cosa cabe".
 */
const MAX_CAMPOS = 40;
const MAX_LARGO_CAMPO = 20_000;

function limpiarDatos(datos: DatosTramite | undefined): DatosTramite {
  const out: DatosTramite = {};
  if (!datos || typeof datos !== "object") return out;
  for (const [k, val] of Object.entries(datos)) {
    if (Object.keys(out).length >= MAX_CAMPOS) break;
    const clave = texto(k, 60);
    if (!clave) continue;
    out[clave] = texto(val, MAX_LARGO_CAMPO);
  }
  return out;
}

/** Id estable y legible: `tra-<formato>-<sufijo>`. */
function nuevoId(formatoId: string, ahora: string): string {
  const slug = formatoId.replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "tramite";
  // Sufijo derivado del instante: sin `Math.random` para que el registro sea
  // reproducible desde el mismo input (los tests pasan `ahora`).
  const suf = ahora.replace(/[^0-9]/g, "").slice(-9);
  return `tra-${slug}-${suf}`;
}

/**
 * Arma el registro que se guarda. Reglas que impone (no son opcionales):
 *
 * · un trámite `presentado`/`observado`/`resuelto` SIN fecha de presentación no
 *   tiene sentido: se le pone la de hoy, porque "presentado" es un hecho con
 *   fecha y sin ella no se puede contar el plazo de respuesta;
 * · `resuelto` sin fecha de respuesta toma la de hoy por la misma razón;
 * · un estado desconocido cae a `borrador`, nunca a "presentado" (no se declara
 *   presentado algo que quizá no salió de la oficina).
 */
export function construirTramite(input: TramiteInput, existentes: TramiteRegistro[] = []): TramiteRegistro {
  const ahora = input.ahora ?? new Date().toISOString();
  const hoy = ahora.slice(0, 10);
  const estado: EstadoTramite = ESTADOS.has(input.estado as EstadoTramite)
    ? (input.estado as EstadoTramite)
    : "borrador";
  const formatoId = texto(input.formatoId, 60);

  const yaSalio = estado === "presentado" || estado === "observado" || estado === "resuelto";
  const fechaPresentacion = fechaSolo(input.fechaPresentacion) ?? (yaSalio ? hoy : null);
  const fechaRespuesta = fechaSolo(input.fechaRespuesta) ?? (estado === "resuelto" ? hoy : null);

  // El N° de documento se asigna UNA sola vez, al primer "Presentado" — nunca
  // se reasigna (`opcional(input.numeroDocumento,…)` trae el que ya tenía, el
  // caller lo preserva desde el registro existente).
  const numeroPrevio = opcional(input.numeroDocumento, 20);
  const necesitaNumero = Boolean(formatoPorId(formatoId)?.correlativo) && yaSalio && !numeroPrevio;
  const numeroDocumento = necesitaNumero
    ? siguienteNumeroDocumento(existentes, formatoId, new Date(ahora))
    : numeroPrevio;

  return {
    id: texto(input.id, 80) || nuevoId(formatoId, ahora),
    formatoId,
    formatoNombre: texto(input.formatoNombre, 120) || texto(formatoId, 120),
    autoridad: input.autoridad,
    asunto: texto(input.asunto, 300),
    datos: limpiarDatos(input.datos),
    estado,
    expedienteAutoridad: opcional(input.expedienteAutoridad, 80),
    fechaPresentacion,
    fechaRespuesta,
    fechaLimite: fechaSolo(input.fechaLimite),
    notas: opcional(input.notas, 2000),
    numeroDocumento,
    createdAt: input.createdAt ?? ahora,
    createdBy: texto(input.createdBy, 80) || "unknown",
    updatedAt: ahora,
  };
}

/** Días transcurridos desde la presentación (para "hace 12 días sin respuesta"). */
export function diasDesdePresentacion(t: TramiteRegistro, hoy: Date): number | null {
  if (!t.fechaPresentacion) return null;
  const d = new Date(`${t.fechaPresentacion}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.max(0, Math.floor((hoyUtc - d.getTime()) / 86_400_000));
}

/**
 * Los que están esperando respuesta hace más de `dias`. No es un plazo legal
 * (cada procedimiento tiene el suyo en el TUPA): es el recordatorio de ir a
 * preguntar, que es lo que en la práctica mueve un expediente.
 */
export function tramitesSinRespuesta(
  lista: TramiteRegistro[],
  hoy: Date,
  dias = 15,
): TramiteRegistro[] {
  return lista
    .filter((t) => t.estado === "presentado" || t.estado === "observado")
    .filter((t) => (diasDesdePresentacion(t, hoy) ?? 0) >= dias)
    .sort((a, b) => (a.fechaPresentacion ?? "").localeCompare(b.fechaPresentacion ?? ""));
}

/**
 * Días que faltan hasta `fechaLimite` (negativo = ya venció). Ese límite lo
 * carga el operador con la fecha real de SU caso (la que dice la notificación
 * o su TUPA) — acá sólo se cuenta la resta, nunca se inventa el plazo.
 */
export function diasHastaLimite(t: TramiteRegistro, hoy: Date): number | null {
  if (!t.fechaLimite) return null;
  const d = new Date(`${t.fechaLimite}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.floor((d.getTime() - hoyUtc) / 86_400_000);
}

/**
 * Los que vencen pronto o ya vencieron: el aviso que tiene que llegar ANTES
 * del plazo, no 15 días después (a diferencia de `tramitesSinRespuesta`, que
 * mira hacia atrás desde que se presentó). Sólo entran los que siguen vivos
 * (ni resueltos ni desistidos) — un trámite resuelto no "vence" más.
 */
export function tramitesPorVencer(
  lista: TramiteRegistro[],
  hoy: Date,
  diasAntes = 3,
): (TramiteRegistro & { diasRestantes: number })[] {
  return lista
    .filter((t) => t.estado !== "resuelto" && t.estado !== "desistido" && t.fechaLimite)
    .map((t) => ({ t, dias: diasHastaLimite(t, hoy) }))
    .filter((x): x is { t: TramiteRegistro; dias: number } => x.dias !== null && x.dias <= diasAntes)
    .sort((a, b) => a.dias - b.dias)
    .map(({ t, dias }) => ({ ...t, diasRestantes: dias }));
}

/** Conteo por estado para los chips de la bandeja. */
export function contarPorEstado(lista: TramiteRegistro[]): Record<EstadoTramite, number> {
  const base: Record<EstadoTramite, number> = {
    borrador: 0,
    presentado: 0,
    observado: 0,
    resuelto: 0,
    desistido: 0,
  };
  for (const t of lista) base[t.estado] += 1;
  return base;
}
