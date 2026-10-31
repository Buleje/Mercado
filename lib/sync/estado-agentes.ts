import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

/**
 * lib/sync/estado-agentes.ts — qué está haciendo el agente de escritorio (ADR-307).
 *
 * El sync funcionaba a ciegas: si el agente se caía, si la tarea de arranque no
 * levantaba, si la carpeta cambiaba de lugar o si había un conflicto sin resolver,
 * el panel no decía nada. El dueño se enteraba al notar que un archivo no estaba.
 *
 * Cada ciclo el agente manda un LATIDO con lo que hizo, y eso se guarda por equipo
 * en un `PlatformSetting` (mismo patrón que las cubicaciones guardadas y los
 * trámites: sin fabricar una migración para un dato operativo de unas pocas filas).
 *
 * Es telemetría de operación, no del libro: si se pierde, no se pierde nada del
 * negocio — el agente vuelve a reportar en el próximo ciclo.
 */

const KEY_PREFIX = "sync-agentes:";
/** Equipos recordados por tenant. Más que esto es un error de configuración. */
const MAX_EQUIPOS = 12;
/** Últimos conflictos que se guardan por equipo (lo viejo ya no es accionable). */
const MAX_CONFLICTOS = 8;

export interface LatidoAgente {
  /** Id estable del equipo (hostname + usuario, lo arma el agente). */
  equipoId: string;
  /** Cómo lo llama una persona: "DESKTOP-BRANDON". */
  nombre: string;
  /** Carpeta que está sincronizando, tal como la ve Windows. */
  carpeta: string;
  /** Versión del agente, para saber si hay uno viejo dando vueltas. */
  version: string;
  /** Motivo del ciclo: arranque · cambio en la carpeta · revisión periódica. */
  motivo?: string;
  /** Qué hizo este ciclo. */
  subidos?: number;
  bajados?: number;
  borrados?: number;
  /** Archivos que quedaron en la carpeta al terminar. */
  archivos?: number;
  /** Rutas con conflicto resuelto (se guardó copia "(del panel)"). */
  conflictos?: string[];
  /** Si el ciclo falló, el mensaje. */
  error?: string | null;
}

export interface EstadoAgente extends Omit<LatidoAgente, "conflictos"> {
  /** ISO del último latido. */
  visto: string;
  /** Ciclos reportados desde que se conoce el equipo. */
  ciclos: number;
  /** Acumulado histórico (para decir "ya movió 340 archivos"). */
  totalSubidos: number;
  totalBajados: number;
  totalBorrados: number;
  /** Últimos conflictos con su fecha. */
  conflictos: { ruta: string; cuando: string }[];
}

const clave = (tenantId: string) => `${KEY_PREFIX}${tenantId}`;

const texto = (v: unknown, max: number): string => String(v ?? "").trim().slice(0, max);

/** Lee el estado de todos los equipos, el más reciente primero. */
export async function listarAgentes(tenantId: string): Promise<EstadoAgente[]> {
  if (!tenantId) throw new Error("tenantId is required");
  const raw = await PlatformSettingsDB.get<unknown[]>(clave(tenantId));
  if (!Array.isArray(raw)) return [];
  return (raw as EstadoAgente[])
    .filter((a) => a && typeof a.equipoId === "string")
    .sort((a, b) => (b.visto ?? "").localeCompare(a.visto ?? ""));
}

/**
 * Registra un latido. Acumula los totales del equipo y deja los conflictos
 * recientes; el resto se sobrescribe con lo último reportado (la carpeta o la
 * versión pueden cambiar y lo que importa es el estado de AHORA).
 */
export async function registrarLatido(
  tenantId: string,
  latido: LatidoAgente,
  ahora = new Date().toISOString(),
): Promise<EstadoAgente> {
  if (!tenantId) throw new Error("tenantId is required");
  const equipoId = texto(latido.equipoId, 80);
  if (!equipoId) throw new Error("equipoId is required");

  const lista = await listarAgentes(tenantId);
  const previo = lista.find((a) => a.equipoId === equipoId);

  const nuevosConflictos = (latido.conflictos ?? [])
    .map((r) => ({ ruta: texto(r, 300), cuando: ahora }))
    .filter((c) => c.ruta);

  const estado: EstadoAgente = {
    equipoId,
    nombre: texto(latido.nombre, 80) || equipoId,
    carpeta: texto(latido.carpeta, 300),
    version: texto(latido.version, 20),
    motivo: texto(latido.motivo, 60) || undefined,
    visto: ahora,
    subidos: Math.max(0, latido.subidos ?? 0),
    bajados: Math.max(0, latido.bajados ?? 0),
    borrados: Math.max(0, latido.borrados ?? 0),
    archivos: Math.max(0, latido.archivos ?? 0),
    error: texto(latido.error, 300) || null,
    ciclos: (previo?.ciclos ?? 0) + 1,
    totalSubidos: (previo?.totalSubidos ?? 0) + Math.max(0, latido.subidos ?? 0),
    totalBajados: (previo?.totalBajados ?? 0) + Math.max(0, latido.bajados ?? 0),
    totalBorrados: (previo?.totalBorrados ?? 0) + Math.max(0, latido.borrados ?? 0),
    conflictos: [...nuevosConflictos, ...(previo?.conflictos ?? [])].slice(0, MAX_CONFLICTOS),
  };

  const siguiente = [estado, ...lista.filter((a) => a.equipoId !== equipoId)].slice(0, MAX_EQUIPOS);
  await PlatformSettingsDB.set(clave(tenantId), siguiente, "sync-agente");
  return estado;
}

/** Olvida un equipo (se cambió de PC, se desinstaló el agente). */
export async function olvidarAgente(tenantId: string, equipoId: string): Promise<boolean> {
  const lista = await listarAgentes(tenantId);
  if (!lista.some((a) => a.equipoId === equipoId)) return false;
  await PlatformSettingsDB.set(
    clave(tenantId),
    lista.filter((a) => a.equipoId !== equipoId),
    "admin",
  );
  return true;
}

/** Minutos desde el último latido (para decidir el semáforo). */
export function minutosDesde(visto: string, ahora = new Date()): number {
  const t = new Date(visto).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 60_000));
}

export type SaludAgente = "activo" | "demorado" | "caido";

/**
 * Semáforo del equipo. Los umbrales miran el intervalo real del agente (30s por
 * defecto): tres minutos sin latir ya es raro, un cuarto de hora es que no está.
 * Un error en el último ciclo pesa más que el reloj — reportó, pero falló.
 */
export function saludAgente(a: EstadoAgente, ahora = new Date()): SaludAgente {
  const min = minutosDesde(a.visto, ahora);
  if (min >= 15) return "caido";
  if (a.error) return "demorado";
  return min >= 3 ? "demorado" : "activo";
}

/**
 * Dos agentes sobre la MISMA carpeta se pisan (el "falta" del ADR-307): cada uno
 * ve los archivos del otro como cambios ajenos y rebotan trabajo entre ellos.
 * Devuelve las carpetas con más de un equipo activo reportando.
 */
export function carpetasEnConflicto(lista: EstadoAgente[], ahora = new Date()): string[] {
  const porCarpeta = new Map<string, number>();
  for (const a of lista) {
    if (saludAgente(a, ahora) === "caido") continue;
    const k = a.carpeta.trim().toLowerCase();
    if (!k) continue;
    porCarpeta.set(k, (porCarpeta.get(k) ?? 0) + 1);
  }
  return [...porCarpeta.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
