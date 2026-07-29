/**
 * tramites-registro — el expediente de un trámite, normalizado en el servidor.
 *
 * Un trámite sin fecha de presentación es un trámite que se vuelve a hacer. Este
 * módulo define QUÉ se guarda y lo normaliza: el cliente propone, el servidor
 * decide (mismo criterio que `cubicacion-registro`, ADR-308 §4).
 *
 * PURO: sin Prisma ni fetch — se testea sin DB.
 */

import type { AutoridadTramite, DatosTramite } from "./tramites-catalogo";

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
  notas: string | null;
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
  notas?: string | null;
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

/** Los valores del formulario, acotados: es un JSON en KV, no un textarea infinito. */
const MAX_CAMPOS = 40;
const MAX_LARGO_CAMPO = 4000;

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
export function construirTramite(input: TramiteInput): TramiteRegistro {
  const ahora = input.ahora ?? new Date().toISOString();
  const hoy = ahora.slice(0, 10);
  const estado: EstadoTramite = ESTADOS.has(input.estado as EstadoTramite)
    ? (input.estado as EstadoTramite)
    : "borrador";

  const yaSalio = estado === "presentado" || estado === "observado" || estado === "resuelto";
  const fechaPresentacion = fechaSolo(input.fechaPresentacion) ?? (yaSalio ? hoy : null);
  const fechaRespuesta = fechaSolo(input.fechaRespuesta) ?? (estado === "resuelto" ? hoy : null);

  return {
    id: texto(input.id, 80) || nuevoId(input.formatoId, ahora),
    formatoId: texto(input.formatoId, 60),
    formatoNombre: texto(input.formatoNombre, 120) || texto(input.formatoId, 120),
    autoridad: input.autoridad,
    asunto: texto(input.asunto, 300),
    datos: limpiarDatos(input.datos),
    estado,
    expedienteAutoridad: opcional(input.expedienteAutoridad, 80),
    fechaPresentacion,
    fechaRespuesta,
    notas: opcional(input.notas, 2000),
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
