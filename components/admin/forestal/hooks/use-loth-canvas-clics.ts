"use client";

/**
 * useLothCanvasClics — qué hace un CLIC en el mapa según el modo: vértice del
 * polígono, punto de la vía, punto de la cinta métrica o referencia nueva; y la
 * lectura de coordenadas del cursor. Cada modo escucha sólo mientras está
 * prendido.
 *
 * Los efectos están copiados sin cambios desde `LothMapaCanvas` (se partió en
 * 2026-09-18 al pasar de 300 líneas): mismas dependencias, mismo orden.
 */

import { useEffect, type RefObject } from "react";
import type { LeafletCtx, LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

/**
 * Al apagar un modo, devuelve el cursor (y el zoom por doble clic) al mapa que
 * esté vivo AHORA —no al capturado cuando se prendió—: si el canvas se
 * desmontó, `mapRef.current` ya es null y no hay nada que restaurar. Antes
 * eran cuatro copias de las mismas tres líneas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function restaurar(mapRef: RefObject<any>, dobleClic: boolean): void {
  const vivo = mapRef.current;
  if (!vivo) return;
  if (dobleClic) vivo.doubleClickZoom.enable();
  (vivo.getContainer() as HTMLElement).style.cursor = "";
}

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca: llegan
   por parámetro y el linter no puede saber que son estables. Agregarlas no
   re-dispara ningún efecto. */
export function useLothCanvasClics(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef } = ctx;
  const { viaDraft, onViaPoint, onCursor, drawMode, onAddVertex, medicion, onMedicionPunto, markMode, onMarkReferencia } = p;

  // Modo "dibujar vía": cada click agrega un punto a la traza.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || viaDraft === null) return;
    map.doubleClickZoom.disable();
    (map.getContainer() as HTMLElement).style.cursor = "crosshair";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => onViaPoint([e.latlng.lat, e.latlng.lng]);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      restaurar(mapRef, true);
    };
  }, [ready, viaDraft, onViaPoint, mapRef]);

  // ── Dibujo: click = vértice · cursor = lectura de coordenadas ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMove = (e: any) => onCursor([e.latlng.lat, e.latlng.lng]);
    const onOut = () => onCursor(null);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
    };
  }, [ready, onCursor, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !drawMode) return;
    map.doubleClickZoom.disable();
    // Cursor imperativo (NO por className: React borraría las clases de Leaflet).
    (map.getContainer() as HTMLElement).style.cursor = "crosshair";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => onAddVertex([e.latlng.lat, e.latlng.lng]);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      restaurar(mapRef, true);
    };
  }, [ready, drawMode, onAddVertex, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || medicion === null) return;
    (map.getContainer() as HTMLElement).style.cursor = "crosshair";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => onMedicionPunto([e.latlng.lat, e.latlng.lng]);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      restaurar(mapRef, false);
    };
  }, [ready, medicion, onMedicionPunto, mapRef]);

  // Modo "marcar referencia": un click deja el punto donde se tocó.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !markMode) return;
    (map.getContainer() as HTMLElement).style.cursor = "crosshair";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => onMarkReferencia([e.latlng.lat, e.latlng.lng]);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      restaurar(mapRef, false);
    };
  }, [ready, markMode, onMarkReferencia, mapRef]);
}
