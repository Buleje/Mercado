"use client";

/**
 * Acceso rápido del Archivo: carpetas y archivos fijados arriba de la barra
 * lateral, en el orden que elijas (como «Fijar en Acceso rápido» de Windows).
 *
 * Se guarda en ESTE navegador y por tienda (`drive-acceso-rapido:<slug>`):
 * `/api/admin/preferences` es por tienda y no por persona, y el cajero no
 * tiene por qué ver fijado lo que fijó el dueño. Sincronizarlo entre
 * dispositivos pide guardar preferencias por usuario en el servidor.
 */

import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

export interface Fijado {
  tipo: "carpeta" | "archivo";
  id: string;
  /** El nombre al fijarlo: si el archivo no está cargado, es lo que se muestra. */
  nombre: string;
}

const esFijado = (x: unknown): x is Fijado =>
  !!x && typeof x === "object" &&
  ((x as Fijado).tipo === "carpeta" || (x as Fijado).tipo === "archivo") &&
  typeof (x as Fijado).id === "string" && typeof (x as Fijado).nombre === "string";

export function useAccesoRapido(slug: string) {
  const [crudo, setCrudo] = useLocalStorage<unknown>(`drive-acceso-rapido:${slug}`, []);
  // Lo guardado puede venir de otra versión o tocado a mano: sólo lo que tiene forma.
  const fijados = useMemo<Fijado[]>(() => (Array.isArray(crudo) ? crudo.filter(esFijado) : []), [crudo]);

  const guardar = useCallback(
    (f: (prev: Fijado[]) => Fijado[]) =>
      setCrudo((prev: unknown) => f(Array.isArray(prev) ? prev.filter(esFijado) : [])),
    [setCrudo],
  );

  const estaFijado = useCallback((id: string) => fijados.some((x) => x.id === id), [fijados]);

  const fijar = useCallback(
    (item: Fijado) => guardar((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item])),
    [guardar],
  );
  const quitar = useCallback((id: string) => guardar((prev) => prev.filter((x) => x.id !== id)), [guardar]);
  const alternar = useCallback(
    (item: Fijado) => guardar((prev) => (prev.some((x) => x.id === item.id) ? prev.filter((x) => x.id !== item.id) : [...prev, item])),
    [guardar],
  );

  /** Subir (-1) o bajar (+1) un lugar. */
  const mover = useCallback(
    (id: string, delta: -1 | 1) =>
      guardar((prev) => {
        const i = prev.findIndex((x) => x.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      }),
    [guardar],
  );

  /** Soltar `id` donde está `destinoId` (arrastrar para reordenar). */
  const reordenar = useCallback(
    (id: string, destinoId: string) =>
      guardar((prev) => {
        const desde = prev.findIndex((x) => x.id === id);
        const hasta = prev.findIndex((x) => x.id === destinoId);
        if (desde < 0 || hasta < 0 || desde === hasta) return prev;
        const next = [...prev];
        const [movido] = next.splice(desde, 1);
        next.splice(hasta, 0, movido);
        return next;
      }),
    [guardar],
  );

  /** Saca las carpetas que ya no existen (se borraron desde otro lado). */
  const podarCarpetas = useCallback(
    (existe: (id: string) => boolean) =>
      guardar((prev) => {
        const next = prev.filter((x) => x.tipo !== "carpeta" || existe(x.id));
        return next.length === prev.length ? prev : next;
      }),
    [guardar],
  );

  return { fijados, estaFijado, fijar, quitar, alternar, mover, reordenar, podarCarpetas };
}
