"use client";

/**
 * Las «zonas a ignorar» de cada cámara del lado del navegador (2026-10-08).
 *
 * Un almacén chico a nivel de módulo, como el detector mismo: el mosaico vive
 * a nivel del panel (sobrevive al cambio de pestaña) y las zonas se pueden
 * cambiar desde la fila de la cámara con el mosaico minimizado. Con el
 * almacén, el detector toma la zona nueva en la próxima mirada sin reabrir.
 *
 * Se llena con la lista de cámaras (`use-camaras`) y con cada guardado.
 */

import { useSyncExternalStore } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { zonasDeCamara, type ZonaIgnorada } from "@/lib/camaras/zonas-ignorar";
import { API_CAMARAS } from "./camaras-ui";

const SIN_ZONAS: readonly ZonaIgnorada[] = Object.freeze([]);
const porCamara = new Map<string, readonly ZonaIgnorada[]>();
/**
 * Cuándo se guardaron desde ESTE navegador. Con varias instancias, la lista
 * puede volver vieja hasta 5 min (caché por instancia de `PlatformSettingsDB`):
 * una recarga silenciosa de la lista no pisa lo recién guardado.
 */
const guardadasEn = new Map<string, number>();
const LISTA_PUEDE_VENIR_VIEJA_MS = 5 * 60_000;
const oyentes = new Set<() => void>();

const avisar = () => {
  for (const o of oyentes) o();
};

const iguales = (a: readonly ZonaIgnorada[], b: readonly ZonaIgnorada[]) =>
  a.length === b.length &&
  a.every((z, i) => z.x === b[i].x && z.y === b[i].y && z.w === b[i].w && z.h === b[i].h);

/** Anota las zonas de una cámara (sólo avisa si cambiaron: el arreglo nuevo re-renderiza). */
export function anotarZonas(camaraId: string, zonas: readonly ZonaIgnorada[]): void {
  if (iguales(porCamara.get(camaraId) ?? SIN_ZONAS, zonas)) return;
  porCamara.set(camaraId, zonas.length ? [...zonas] : SIN_ZONAS);
  avisar();
}

/** Toma las zonas de la lista de cámaras que manda el GET. */
export function anotarZonasDeLista(camaras: readonly { id: string; zonasIgnorar?: unknown }[]): void {
  const ahora = Date.now();
  for (const c of camaras) {
    if (ahora - (guardadasEn.get(c.id) ?? 0) < LISTA_PUEDE_VENIR_VIEJA_MS) continue;
    anotarZonas(c.id, zonasDeCamara(c));
  }
}

export function zonasDe(camaraId: string): readonly ZonaIgnorada[] {
  return porCamara.get(camaraId) ?? SIN_ZONAS;
}

function suscribir(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Las zonas de una cámara, al día con cada guardado. */
export function useZonasIgnorar(camaraId: string): readonly ZonaIgnorada[] {
  return useSyncExternalStore(
    suscribir,
    () => zonasDe(camaraId),
    () => SIN_ZONAS,
  );
}

export type ResultadoGuardarZonas = { ok: true; mensaje: string } | { ok: false; mensaje: string };

/** PUT de las zonas; si sale, el almacén queda con lo que guardó el servidor. */
export async function guardarZonas(
  camaraId: string,
  zonas: readonly ZonaIgnorada[],
): Promise<ResultadoGuardarZonas> {
  try {
    const r = await fetch(`${API_CAMARAS}/${encodeURIComponent(camaraId)}/zonas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      credentials: "include",
      body: JSON.stringify({ zonas }),
    });
    const j = (await r.json().catch(() => null)) as {
      ok?: boolean;
      zonas?: unknown;
      mensaje?: string;
      message?: string;
    } | null;
    if (r.ok && j?.ok) {
      guardadasEn.set(camaraId, Date.now());
      anotarZonas(camaraId, zonasDeCamara({ zonasIgnorar: j.zonas }));
      return { ok: true, mensaje: j.mensaje ?? "Zonas guardadas." };
    }
    if (r.status === 403) {
      return { ok: false, mensaje: "Sólo el dueño o un administrador cambia las zonas." };
    }
    return { ok: false, mensaje: j?.message ?? "No se pudieron guardar las zonas. Prueba de nuevo." };
  } catch (err) {
    logger.warn("[camaras] no se pudieron guardar las zonas", { error: String(err) });
    return { ok: false, mensaje: "Sin conexión: las zonas no se guardaron." };
  }
}
