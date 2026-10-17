import "server-only";
/**
 * Las inspecciones de planta del superadmin (fase 3 de «Plantas forestales»,
 * ADR-498, 17-10): lo que las rutas piden, encima de `ForestInspeccionPlantaDB`.
 *
 *  · Abrir = congelar el libro de la planta SIN caché (`calcularParaInspeccion`)
 *    con las trozas que el libro da en el patio: las MISMAS que cuenta la propia
 *    planta (`trozasComoConsumibles` → `aTrozaDelConteo`, con su cancha del Mapa
 *    de Planta, igual que `/api/admin/forestal/trozas/patio`).
 *  · Editar con conteo = el conteo se clava a esa foto (`conteoDeLaInspeccion`)
 *    antes de guardarlo: los totales los arma el servidor, no el equipo.
 *  · Cerrar y anular cambian las incoherencias y el semáforo de la planta
 *    (los hallazgos de la última cerrada pesan): se olvida su cálculo cacheado.
 *
 * `tenantId` es SIEMPRE el de una planta de `PlantasForestalesDB.listar()`: la
 * ruta lo valida antes (un id que no es planta → 404).
 */
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { ForestInspeccionPlantaDB, InspeccionError, type InspeccionDetalle } from "@/lib/db/forest-inspeccion-planta.db";
import { ForestPatioConteoDB } from "@/lib/db/forest-patio-conteo.db";
import { ForestPlantaAsignacionDB } from "@/lib/db/forest-planta-asignacion.db";
import { ForestPlantaZonaDB } from "@/lib/db/forest-planta-zona.db";
import { aTrozaDelConteo, type ConteoPatio, type TrozaDelConteo } from "@/lib/forestal/conteo-patio";
import { MAX_TROZAS_CONTEO } from "@/lib/forestal/conteo-patio-guardado";
import { nombreDeCancha } from "@/lib/forestal/conteo-patio-pasos";
import { claveTroza } from "@/lib/forestal/planta-zona-types";
import { conteoDeLaInspeccion } from "./inspeccion";
import { esDiaReal, periodoPorDefecto } from "./periodo";
import { calcularParaInspeccion, olvidarPlantas, type PatioLeido } from "./resumen.server";
import type { EditarInspeccion } from "./schemas";
import type { EstadoInspeccion, FotoDelLibro, InspeccionResumen, PlantaIdentidad } from "./tipos";

/** Un error que la ruta devuelve tal cual (status + mensaje en castellano). */
export class InspeccionRutaError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422 | 503,
  ) {
    super(message);
    this.name = "InspeccionRutaError";
  }
}

/**
 * El error de una inspección como lo devuelve la ruta: `{ status, cuerpo }`, o
 * `null` si no es de los esperados (la ruta loguea y responde 500). Un 409 lleva
 * el estado actual para que la pantalla diga «ya la cerraron» sin adivinar.
 */
export function errorDeInspeccion(err: unknown): { status: number; cuerpo: { error: string; estado?: EstadoInspeccion } } | null {
  if (err instanceof InspeccionRutaError) return { status: err.status, cuerpo: { error: err.message } };
  if (err instanceof InspeccionError) {
    if (err.status === 500) return null;
    return { status: err.status, cuerpo: { error: err.message, ...(err.estado ? { estado: err.estado } : {}) } };
  }
  return null;
}

/** Lo que devuelven GET y PATCH de una inspección (la pantalla lo lee plano). */
export type InspeccionParaPantalla = InspeccionDetalle & {
  conteoPatio: ConteoPatio | null;
  planta: { nombre: string; slug: string };
  plantaNombre: string;
};

/* ── Abrir ──────────────────────────────────────────────────────────────── */

/**
 * `zonaId → nombre` y `clave → zonaId` del Mapa de Planta, sólo con zonas vivas.
 * Falla en `null`: no saber dónde está apilada una carga no frena la inspección.
 */
async function canchasDeLaPlanta(tenantId: string): Promise<((t: { id: string; woodEntryId: string }) => string | null) | null> {
  try {
    const [mapa, zonas] = await Promise.all([ForestPlantaAsignacionDB.getMap(tenantId), ForestPlantaZonaDB.list(tenantId)]);
    const nombres = new Map(zonas.map((z) => [z.id, nombreDeCancha(z)]));
    return (t) => {
      const zona = mapa[claveTroza(t.id)] ?? mapa[t.woodEntryId];
      return (zona && nombres.get(zona)) || null;
    };
  } catch (err) {
    logger.warn("[plantas-forestales] canchas de la inspección no disponibles", { tenantId, error: String(err) });
    return null;
  }
}

/** Las trozas del patio como las cuenta la planta: todas (también las bloqueadas), con su cancha. */
export function trozasParaContar(
  patio: PatioLeido,
  cancha: ((t: { id: string; woodEntryId: string }) => string | null) | null,
): { trozas: TrozaDelConteo[]; truncado: boolean } {
  const filas = patio.filas.slice(0, MAX_TROZAS_CONTEO);
  return {
    trozas: filas.map((t) => (cancha ? { ...aTrozaDelConteo(t), cancha: cancha(t) } : aTrozaDelConteo(t))),
    truncado: patio.truncado || patio.filas.length > MAX_TROZAS_CONTEO,
  };
}

export async function crearInspeccion(
  identidad: PlantaIdentidad,
  datos: { fecha: string; inspector: string; notas?: string },
): Promise<InspeccionParaPantalla> {
  const tid = identidad.tenantId;
  if (!esDiaReal(datos.fecha)) throw new InspeccionRutaError("Esa fecha no existe: usa AAAA-MM-DD", 400);
  if (datos.fecha > limaDateKey()) throw new InspeccionRutaError("La inspección no puede tener fecha futura", 400);

  const tomadaEn = new Date().toISOString();
  const [{ libro, incoherenciasDetalle, patio }, cancha] = await Promise.all([
    calcularParaInspeccion(identidad, periodoPorDefecto(datos.fecha)),
    canchasDeLaPlanta(tid),
  ]);
  /* Sin el patio no hay contra qué contar: abrirla así sería un acta con «faltan 0». */
  if (!patio) throw new InspeccionRutaError("No se pudo leer el patio de la planta; vuelve a intentarlo en un momento", 503);

  const { trozas, truncado } = trozasParaContar(patio, cancha);
  const foto: FotoDelLibro = {
    ...libro,
    tomadaEn,
    trozasDelPatio: trozas,
    ...(truncado ? { trozasDelPatioTruncado: true } : {}),
    incoherenciasDetalle,
  };
  const d = await ForestInspeccionPlantaDB.crear(
    tid,
    { fecha: datos.fecha, inspector: datos.inspector, libro: foto, notas: datos.notas },
    datos.inspector,
  );
  return { ...d, conteoPatio: null, planta: { nombre: identidad.nombre, slug: identidad.slug }, plantaNombre: identidad.nombre };
}

/* ── Leer ───────────────────────────────────────────────────────────────── */

/** El conteo guardado (para retomarlo e imprimir el acta). Ilegible → `null` con log, no 500. */
async function conteoDe(tenantId: string, conteoPatioId: string | null): Promise<ConteoPatio | null> {
  if (!conteoPatioId) return null;
  try {
    return (await ForestPatioConteoDB.porId(tenantId, conteoPatioId))?.conteo ?? null;
  } catch (err) {
    logger.warn("[plantas-forestales] conteo de la inspección no disponible", { tenantId, conteoPatioId, error: String(err) });
    return null;
  }
}

async function paraPantalla(identidad: PlantaIdentidad, d: InspeccionDetalle): Promise<InspeccionParaPantalla> {
  return {
    ...d,
    conteoPatio: await conteoDe(identidad.tenantId, d.conteoPatioId),
    planta: { nombre: identidad.nombre, slug: identidad.slug },
    plantaNombre: identidad.nombre,
  };
}

export async function obtenerParaPantalla(identidad: PlantaIdentidad, id: string): Promise<InspeccionParaPantalla | null> {
  const d = await ForestInspeccionPlantaDB.obtener(identidad.tenantId, id);
  return d ? paraPantalla(identidad, d) : null;
}

/* ── Editar, cerrar, anular ─────────────────────────────────────────────── */

export type AccionDeEdicion = "editar" | "cerrar" | "anular";

/**
 * PATCH de una inspección. `anular` va solo (es la última palabra sobre el
 * acta); `cerrar` puede venir con los últimos cambios: primero se guardan y
 * después se cierra. `null` = no existe en esta planta.
 */
export async function editarInspeccion(
  identidad: PlantaIdentidad,
  id: string,
  cambios: EditarInspeccion,
  usuario: string,
): Promise<{ inspeccion: InspeccionParaPantalla; acciones: AccionDeEdicion[] } | null> {
  const tid = identidad.tenantId;
  const { cerrar, anular, conteoPatio, ...resto } = cambios;
  const hayEdicion = conteoPatio !== undefined || Object.values(resto).some((v) => v !== undefined);

  if (anular !== undefined) {
    if (hayEdicion || cerrar) throw new InspeccionRutaError("Anular va solo: no se combina con otros cambios", 422);
    const d = await ForestInspeccionPlantaDB.anular(tid, id, anular, usuario);
    if (!d) return null;
    olvidarPlantas(tid);
    return { inspeccion: await paraPantalla(identidad, d), acciones: ["anular"] };
  }

  const acciones: AccionDeEdicion[] = [];
  let d: InspeccionDetalle | null = null;
  if (hayEdicion) {
    let conteo: ConteoPatio | undefined;
    if (conteoPatio) {
      /* El conteo se clava a la foto de ESTA inspección: hace falta leerla primero. */
      const actual = await ForestInspeccionPlantaDB.obtener(tid, id);
      if (!actual) return null;
      conteo = conteoDeLaInspeccion(conteoPatio, actual);
    }
    d = await ForestInspeccionPlantaDB.editar(tid, id, { ...resto, ...(conteo ? { conteoPatio: conteo } : {}) }, usuario);
    if (!d) return null;
    acciones.push("editar");
  }
  if (cerrar) {
    d = await ForestInspeccionPlantaDB.cerrar(tid, id, usuario);
    if (!d) return null;
    olvidarPlantas(tid);
    acciones.push("cerrar");
  }
  if (!d) {
    d = await ForestInspeccionPlantaDB.obtener(tid, id);
    if (!d) return null;
  }
  return { inspeccion: await paraPantalla(identidad, d), acciones };
}

/* ── La lista de todas las plantas ──────────────────────────────────────── */

export type InspeccionDeLaLista = InspeccionResumen & { tenantId: string; plantaNombre: string };

export async function listarTodas(
  plantas: readonly PlantaIdentidad[],
  o: { estado?: EstadoInspeccion; limite?: number } = {},
): Promise<InspeccionDeLaLista[]> {
  const nombre = new Map(plantas.map((p) => [p.tenantId, p.nombre]));
  const filas = await ForestInspeccionPlantaDB.listarDePlantas([...nombre.keys()], o);
  return filas.map((f) => ({ ...f, plantaNombre: nombre.get(f.tenantId) ?? f.tenantId }));
}
