/**
 * planta-croquis-guardado — lo que el SERVIDOR decide sobre el croquis del
 * aserradero (ADR-465): la forma del KV, la ruta privada de su imagen, la
 * geometría de una zona dibujada en metros y qué ubicaciones quedaron
 * huérfanas.
 *
 * La geometría NO se reimplementa: es la de `planta-croquis.ts` (la misma que
 * usa la pantalla), así el área que guarda el servidor y la que dibuja el mapa
 * no pueden discrepar. En el croquis el área es la fórmula del cordón sobre
 * metros, NUNCA la geodésica — sobre `[y, x]` en metros una fórmula de esfera
 * da cualquier cosa.
 *
 * PURO y client-safe (lo usan la clase DB, las rutas y los tests).
 */

import { areaPlanaM2, centroidePlano, parsearPoligono, type Punto } from "./planta-croquis";
import type { Ubicacion } from "./planta-ubicacion";
import type { MaquinaPlanta, PlantaCroquis } from "./planta-zona-types";

/**
 * Tope del terreno. No es capricho: la ubicación de una pila se guarda con el
 * mismo parser que la del satélite (`parsearUbicaciones`), que descarta
 * `|lat| > 90` y `|lng| > 180`. En el croquis eso es `y ≤ 90 m` y `x ≤ 180 m`:
 * un terreno más grande perdería en silencio las pilas del fondo. Blas mide
 * 54 × 48 m.
 */
export const CROQUIS_MAX_ANCHO_M = 180;
export const CROQUIS_MAX_ALTO_M = 90;
/** Holgura al validar que una zona cae dentro del terreno (un clic sobre el borde). */
export const HOLGURA_BORDE_M = 0.5;

const finito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Resultado de validar el polígono de una zona del croquis. */
export type GeometriaCroquis =
  | { ok: true; areaM2: number; lat: number; lng: number }
  | { ok: false; error: string };

/**
 * Área plana y centroide de una zona del croquis, validando que el polígono
 * se entienda y caiga dentro del terreno. Sin croquis no hay plano sobre el
 * cual medir: una zona en metros sin terreno no se puede dibujar.
 */
export function geometriaZonaCroquis(
  poligono: string | null | undefined,
  terreno: { anchoM: number; altoM: number } | null,
): GeometriaCroquis {
  if (!terreno) return { ok: false, error: "Primero carga el croquis del aserradero (ancho y alto del terreno)." };
  const pts = parsearPoligono(poligono ?? null);
  if (!pts) return { ok: false, error: "El polígono de la zona necesita al menos 3 puntos [y, x] en metros." };
  const h = HOLGURA_BORDE_M;
  const fuera = pts.find(([y, x]) => y < -h || y > terreno.altoM + h || x < -h || x > terreno.anchoM + h);
  if (fuera) {
    return {
      ok: false,
      error: `El punto [${fuera[0]}, ${fuera[1]}] cae fuera del terreno (${terreno.anchoM} × ${terreno.altoM} m).`,
    };
  }
  const [lat, lng] = centroidePlano(pts as Punto[]);
  return { ok: true, areaM2: r2(areaPlanaM2(pts)), lat: r2(lat), lng: r2(lng) };
}

// ─── El croquis guardado ───────────────────────────────────────────────────

/** Carpeta del bucket privado donde viven las imágenes de fondo. */
export const CARPETA_CROQUIS = "forestal-croquis";

/**
 * Lo que vive en el KV `ctp-planta-croquis:{tenantId}`. Se guarda la RUTA de
 * la imagen en el bucket privado, nunca una URL: la firmada vence a los 10 min
 * y la que va al cliente se arma en cada lectura (`croquisParaCliente`).
 */
export interface CroquisGuardado {
  version: number;
  anchoM: number;
  altoM: number;
  imagenPath: string | null;
  maquinas: MaquinaPlanta[];
  actualizadoEn: string;
  actualizadoPor: string | null;
}

/** Ruta de la imagen de un tenant: `<tenantId>/forestal-croquis/<uuid>.webp`. */
export function pathImagenCroquis(tenantId: string, uuid: string): string {
  return `${tenantId}/${CARPETA_CROQUIS}/${uuid}.webp`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * ¿La ruta es una imagen de croquis de ESTE tenant? Un solo tramo, sin `..`:
 * un PUT no puede colgarle al croquis la imagen de otro negocio.
 */
export function esPathImagenCroquis(path: unknown, tenantId: string): path is string {
  if (typeof path !== "string" || !tenantId) return false;
  const esc = tenantId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${esc}/${CARPETA_CROQUIS}/${UUID}\\.webp$`).test(path);
}

function parsearMaquina(raw: unknown): MaquinaPlanta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const codigo = typeof o.codigo === "string" ? o.codigo.trim() : "";
  if (!codigo || !finito(o.x) || !finito(o.y)) return null;
  return {
    codigo,
    nombre: typeof o.nombre === "string" && o.nombre.trim() ? o.nombre.trim() : codigo,
    x: r2(o.x),
    y: r2(o.y),
    fuera: o.fuera === true,
  };
}

/**
 * Normaliza lo leído del KV. `null` si no hay croquis o las medidas no sirven:
 * un plano sin ancho o alto no se puede dibujar, y es mejor decir «no hay
 * croquis» que mostrar un lienzo de 0 × 0.
 */
export function parsearCroquisGuardado(raw: unknown): CroquisGuardado | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!finito(o.anchoM) || !finito(o.altoM) || o.anchoM <= 0 || o.altoM <= 0) return null;
  const maquinas = Array.isArray(o.maquinas)
    ? o.maquinas.map(parsearMaquina).filter((m): m is MaquinaPlanta => m !== null)
    : [];
  return {
    version: finito(o.version) && o.version >= 1 ? Math.trunc(o.version) : 1,
    anchoM: r2(o.anchoM),
    altoM: r2(o.altoM),
    imagenPath: typeof o.imagenPath === "string" && o.imagenPath.trim() ? o.imagenPath : null,
    maquinas,
    actualizadoEn: typeof o.actualizadoEn === "string" ? o.actualizadoEn : new Date(0).toISOString(),
    actualizadoPor: typeof o.actualizadoPor === "string" ? o.actualizadoPor : null,
  };
}

/** Ruta estable que sirve la imagen: 302 a una URL firmada fresca (ruta `croquis/imagen`). */
export const RUTA_IMAGEN_CROQUIS = "/api/admin/forestal/ctp/planta/croquis/imagen";

/**
 * Lo que viaja al cliente. `imagenUrl` es la ruta propia con el nombre del
 * archivo como `?v=`: estable mientras la imagen no cambie (el navegador la
 * reusa) y distinta cuando se sube otra (no se queda pegada la vieja). La ruta
 * del bucket no sale del servidor.
 */
export function croquisParaCliente(g: CroquisGuardado): PlantaCroquis {
  const archivo = g.imagenPath ? g.imagenPath.slice(g.imagenPath.lastIndexOf("/") + 1).replace(/\.webp$/, "") : null;
  return {
    version: g.version,
    anchoM: g.anchoM,
    altoM: g.altoM,
    imagenUrl: archivo ? `${RUTA_IMAGEN_CROQUIS}?v=${encodeURIComponent(archivo)}` : null,
    maquinas: g.maquinas,
    actualizadoEn: g.actualizadoEn,
  };
}

// ─── Ubicaciones huérfanas ─────────────────────────────────────────────────

/**
 * Separa las ubicaciones guardadas en tres grupos:
 *  · `vigentes`: su ítem está en el plano y su zona existe.
 *  · `zonaMuerta`: apuntan a una zona que ya no existe → huérfanas seguras
 *    (la lista de zonas es completa, no tiene tope).
 *  · `candidatas`: su ítem NO vino en las listas del plano. Pueden estar
 *    muertas o sólo fuera de la ventana de la consulta (300 ingresos, 500
 *    despachos): hay que CONFIRMARLAS contra la base antes de borrarlas —
 *    borrar por ausencia en una lista con tope tiraría pilas que siguen en el
 *    patio.
 */
export function separarHuerfanas(
  ubis: Readonly<Record<string, Ubicacion>>,
  vivas: ReadonlySet<string>,
  zonas: ReadonlySet<string>,
): { vigentes: Record<string, Ubicacion>; zonaMuerta: string[]; candidatas: string[] } {
  const vigentes: Record<string, Ubicacion> = {};
  const zonaMuerta: string[] = [];
  const candidatas: string[] = [];
  for (const [clave, u] of Object.entries(ubis)) {
    if (!zonas.has(u.zonaId)) zonaMuerta.push(clave);
    else if (!vivas.has(clave)) candidatas.push(clave);
    else vigentes[clave] = u;
  }
  return { vigentes, zonaMuerta, candidatas };
}
