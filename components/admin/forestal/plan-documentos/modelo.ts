/**
 * Una sola forma de pintar «Documentos del plan», venga de donde venga.
 *
 * Con el plan guardado, la vista la manda el servidor (ADR-467). En un alta, la
 * arma esta pantalla con la plantilla del negocio más lo que se va cargando en
 * memoria. Los componentes no distinguen: reciben `CarpetaVista[]` y cada
 * archivo dice si ya está en el Drive o si se sube al guardar.
 *
 * PURO: sin React ni fetch.
 */

import { claveDesdeNombre } from "@/lib/campos-personalizados";
import {
  estadoDeCasillero,
  type ArchivoDelPlan,
  type CarpetaDelPlan,
  type CarpetaSemilla,
  type EstadoCasillero,
} from "@/lib/forestal/plan-documentos-tipos";
import type { PlantillaCarpeta } from "./plan-documentos-api";
import type { ArchivoPendiente, PendientesDocumentos } from "./pendientes";

export interface ArchivoVista {
  /** `documentId` si ya está en el Drive; el id local si es pendiente. */
  key: string;
  documentId: string | null;
  nombre: string;
  mimeType: string;
  size: number;
  /** `YYYY-MM-DD` o null. */
  vence: string | null;
  /** Se sube al guardar el plan. */
  pendiente: boolean;
  error?: string;
}

export interface CasilleroVista {
  /** null = casillero nuevo que todavía no existe en el servidor. */
  campoId: string | null;
  clave: string;
  nombre: string;
  descripcion: string | null;
  soloEstePlan: boolean;
  estado: EstadoCasillero;
  archivos: ArchivoVista[];
  pendiente: boolean;
}

export interface CarpetaVista {
  clave: string;
  nombre: string;
  folderId: string | null;
  plantillaId: string | null;
  soloEstePlan: boolean;
  orden: number;
  casilleros: CasilleroVista[];
  sueltos: ArchivoVista[];
  subcarpetas: number;
  /** Carpeta creada en esta alta: todavía no existe. */
  pendiente: boolean;
  /**
   * Está en la lista de carpetas del plan (plantilla o sólo-este-plan). La que
   * se hizo a mano en Documentos NO: hasta sumarla no admite campos (el
   * servidor rechaza campos de una carpeta que no está en la plantilla).
   */
  enLaLista: boolean;
  /**
   * Carpeta SUGERIDA de un negocio que nunca preparó un plan: se ve, se le
   * sube, pero hasta la primera subida no existe ni en la plantilla ni en el
   * Drive (sus campos de texto esperan a eso).
   */
  provisional?: boolean;
}

const deServidor = (a: ArchivoDelPlan): ArchivoVista => ({
  key: a.documentId,
  documentId: a.documentId,
  nombre: a.nombre,
  mimeType: a.mimeType,
  size: a.size,
  vence: a.expiresAt ? a.expiresAt.slice(0, 10) : null,
  pendiente: false,
});

const dePendiente = (a: ArchivoPendiente): ArchivoVista => ({
  key: a.id,
  documentId: a.documentId ?? null,
  nombre: a.file.name,
  mimeType: a.file.type,
  size: a.file.size,
  vence: a.vence,
  pendiente: true,
  error: a.error,
});

/** El estado se calcula igual en los dos lados: con el mismo módulo del contrato. */
const conEstado = (archivos: ArchivoVista[], hoy: string): EstadoCasillero =>
  estadoDeCasillero(archivos.map((a) => ({ expiresAt: a.vence })), hoy);

/** La vista del servidor, en la forma de pintar. */
export function carpetasDelServidor(carpetas: readonly CarpetaDelPlan[]): CarpetaVista[] {
  return [...carpetas]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
    .map((c) => ({
      clave: c.clave,
      nombre: c.nombre,
      folderId: c.folderId,
      plantillaId: c.plantillaId,
      soloEstePlan: c.soloEstePlan,
      orden: c.orden,
      subcarpetas: c.subcarpetas,
      pendiente: false,
      enLaLista: c.plantillaId != null,
      sueltos: c.sueltos.map(deServidor),
      casilleros: c.casilleros.map((k) => ({
        campoId: k.campo.id,
        clave: k.campo.clave,
        nombre: k.campo.nombre,
        descripcion: k.campo.descripcion,
        soloEstePlan: k.campo.soloParaRegistroId != null,
        estado: k.estado,
        archivos: k.archivos.map(deServidor),
        pendiente: false,
      })),
    }));
}

/**
 * La semilla del contrato como plantilla: lo que el primer `preparar` del
 * negocio va a escribir. La clave de cada casillero sale del nombre, igual que
 * la escribe el servidor (`filasDeSemilla`): así el archivo cargado en el alta
 * encuentra su casillero después de preparar.
 */
export function plantillaDeSemilla(semilla: readonly CarpetaSemilla[]): PlantillaCarpeta[] {
  return semilla.map((c, i) => ({
    clave: c.clave,
    nombre: c.nombre,
    descripcion: c.descripcion || null,
    orden: i + 1,
    plantillaId: null,
    archivos: c.archivos.map((a) => ({ id: null, clave: claveDesdeNombre(a.nombre), nombre: a.nombre, descripcion: a.descripcion || null })),
  }));
}

/**
 * Lo que se ve en un alta: la plantilla del negocio + lo cargado en memoria.
 * Un archivo pendiente cuenta como «cargado» (se sube al guardar); si el
 * vencimiento ya pasó, dice «vencido» igual que en el Drive.
 */
export function carpetasDelAlta(plantilla: readonly PlantillaCarpeta[], pend: PendientesDocumentos, hoy: string): CarpetaVista[] {
  const base: CarpetaVista[] = plantilla.map((c) => ({
    clave: c.clave,
    nombre: c.nombre,
    folderId: null,
    plantillaId: c.plantillaId,
    soloEstePlan: false,
    orden: c.orden,
    subcarpetas: 0,
    pendiente: false,
    enLaLista: true,
    sueltos: [],
    casilleros: c.archivos.map((a) => ({
      campoId: a.id,
      clave: a.clave,
      nombre: a.nombre,
      descripcion: a.descripcion,
      soloEstePlan: false,
      estado: "falta" as EstadoCasillero,
      archivos: [],
      pendiente: false,
    })),
  }));
  const ultimoOrden = base.reduce((m, c) => Math.max(m, c.orden), 0);
  pend.carpetas.forEach((c, i) =>
    base.push({
      clave: c.clave,
      nombre: c.nombre,
      folderId: null,
      plantillaId: null,
      soloEstePlan: !c.paraTodosLosPlanes,
      orden: ultimoOrden + i + 1,
      subcarpetas: 0,
      pendiente: true,
      enLaLista: true,
      sueltos: [],
      casilleros: [],
    }),
  );
  for (const k of pend.casilleros) {
    base.find((c) => c.clave === k.carpetaClave)?.casilleros.push({
      campoId: null,
      clave: k.clave,
      nombre: k.nombre,
      descripcion: k.descripcion || null,
      soloEstePlan: k.soloEstePlan,
      estado: "falta",
      archivos: [],
      pendiente: true,
    });
  }
  for (const a of pend.archivos) {
    const carpeta = base.find((c) => c.clave === a.carpetaClave);
    if (!carpeta) continue;
    const cas = a.casillero
      ? carpeta.casilleros.find((k) => (a.casillero?.id != null && k.campoId === a.casillero.id) || k.clave === a.casillero?.clave)
      : undefined;
    (cas ? cas.archivos : carpeta.sueltos).push(dePendiente(a));
  }
  for (const c of base) for (const k of c.casilleros) k.estado = conEstado(k.archivos, hoy);
  return base;
}

// ── «Lo que falta» ──────────────────────────────────────────────────────────

export interface ChipFalta {
  carpetaClave: string;
  carpetaNombre: string;
  casilleroClave: string;
  nombre: string;
  estado: EstadoCasillero;
  /** El vencimiento más próximo, `YYYY-MM-DD`. */
  vence: string | null;
  /** Hay archivos esperando el guardado. */
  porSubir: boolean;
}

export interface ResumenFalta {
  esperados: number;
  cargados: number;
  faltan: number;
  vencenPronto: number;
  vencidos: number;
  chips: ChipFalta[];
}

/**
 * Un chip por documento esperado, primero lo que pide acción (vencido, falta,
 * vence pronto) y al final lo que está bien. `cargados` = esperados − faltan,
 * la MISMA cuenta que el servidor (`resumirCarpetas`): un papel vencido o por
 * vencer ESTÁ cargado —hay que renovarlo, no buscarlo— y se cuenta además en
 * su columna.
 */
export function loQueFalta(carpetas: readonly CarpetaVista[]): ResumenFalta {
  const peso: Record<EstadoCasillero, number> = { vencido: 0, falta: 1, vence_pronto: 2, cargado: 3 };
  const chips: ChipFalta[] = carpetas.flatMap((c) =>
    c.casilleros.map((k) => ({
      carpetaClave: c.clave,
      carpetaNombre: c.nombre,
      casilleroClave: k.clave,
      nombre: k.nombre,
      estado: k.estado,
      vence: k.archivos.map((a) => a.vence).filter((v): v is string => Boolean(v)).sort()[0] ?? null,
      porSubir: k.archivos.some((a) => a.pendiente),
    })),
  );
  chips.sort((a, b) => peso[a.estado] - peso[b.estado]);
  const n = (e: EstadoCasillero) => chips.filter((c) => c.estado === e).length;
  return {
    esperados: chips.length,
    cargados: chips.length - n("falta"),
    faltan: n("falta"),
    vencenPronto: n("vence_pronto"),
    vencidos: n("vencido"),
    chips,
  };
}

/** El estado de una carpeta entera, para el punto del árbol. */
export function estadoDeCarpeta(c: CarpetaVista): EstadoCasillero | null {
  if (c.casilleros.length === 0) return null;
  const e = c.casilleros.map((k) => k.estado);
  if (e.includes("vencido")) return "vencido";
  if (e.includes("falta")) return "falta";
  if (e.includes("vence_pronto")) return "vence_pronto";
  return "cargado";
}

/** Cuántos archivos tiene la carpeta, entre casilleros y sueltos. */
export const archivosDeCarpeta = (c: CarpetaVista): number =>
  c.sueltos.length + c.casilleros.reduce((s, k) => s + k.archivos.length, 0);
