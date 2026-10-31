"use client";

/**
 * Acceso rápido del Archivo: carpetas y archivos fijados arriba de la barra
 * lateral, en el orden que elijas (como «Fijar en Acceso rápido» de Windows).
 *
 * Se guarda por PERSONA en el servidor (`/api/admin/preferences/fijados-drive`),
 * así se ve igual en la PC y en el celular. Para pintar al instante hay una
 * caché por persona en memoria + `sessionStorage` (`cache-fijados-cliente`;
 * nunca `localStorage`: los nombres no quedan en la PC de caja para el que
 * entra después). Si el servidor no tiene nada, se sube lo de ESTA persona.
 * Fijar/quitar/reordenar es optimista: si el servidor falla, se revierte y avisa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  borrarLegado,
  fijadosGuardados,
  guardarFijados,
  leerLegado,
  puedeAdoptarLegado,
} from "@/lib/documentos/cache-fijados-cliente";

export interface Fijado {
  tipo: "carpeta" | "archivo";
  id: string;
  /** El nombre al fijarlo: si el archivo no está cargado, es lo que se muestra. */
  nombre: string;
}

const URL_FIJADOS = "/api/admin/preferences/fijados-drive";

const esFijado = (x: unknown): x is Fijado =>
  !!x && typeof x === "object" &&
  ((x as Fijado).tipo === "carpeta" || (x as Fijado).tipo === "archivo") &&
  typeof (x as Fijado).id === "string" && typeof (x as Fijado).nombre === "string";

const sanear = (x: unknown): Fijado[] => (Array.isArray(x) ? x.filter(esFijado) : []);

async function guardarEnServidor(fijados: Fijado[]): Promise<void> {
  const res = await fetch(URL_FIJADOS, {
    method: "PUT",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ fijados }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function useAccesoRapido(slug: string) {
  const [crudo, setEstado] = useState<unknown>(() => fijadosGuardados() ?? []);
  const setCrudo = useCallback((l: Fijado[]) => {
    guardarFijados(l);
    setEstado(l);
  }, []);
  // Lo guardado puede venir de otra versión o tocado a mano: sólo lo que tiene forma.
  const fijados = useMemo<Fijado[]>(() => sanear(crudo), [crudo]);

  // Lo último, síncrono: dos cambios en el mismo tick parten del anterior.
  const actual = useRef(fijados);
  actual.current = fijados;
  const tocado = useRef(false); // el usuario cambió algo antes de que llegara el servidor
  const cola = useRef<Promise<void>>(Promise.resolve());
  const existeCarpeta = useRef<((id: string) => boolean) | null>(null);
  const version = useRef(0);
  const sinFantasmas = useCallback((l: Fijado[]) => {
    const existe = existeCarpeta.current;
    return existe ? l.filter((x) => x.tipo !== "carpeta" || existe(x.id)) : l;
  }, []);

  /** Pone la lista en pantalla y caché ya; el servidor se entera en orden. */
  const guardar = useCallback(
    (f: (prev: Fijado[]) => Fijado[]) => {
      const prev = actual.current;
      const next = f(prev);
      if (next === prev) return;
      tocado.current = true;
      const mia = ++version.current;
      actual.current = next;
      setCrudo(next);
      cola.current = cola.current
        .then(() => guardarEnServidor(next))
        .catch((err: unknown) => {
          // Sólo se revierte si nada más cambió después de este cambio.
          if (version.current === mia) {
            actual.current = prev;
            setCrudo(prev);
          }
          toast.error("No se pudo guardar tu Acceso rápido. Revisa tu conexión e inténtalo otra vez.");
          console.warn("[acceso-rapido] guardar falló", err);
        });
    },
    [setCrudo],
  );

  // Una vez al montar: lo del servidor manda; si no hay nada, se sube lo de ESTA
  // persona (su caché de la pestaña) o, sólo para el dueño, lo que quedó en el
  // localStorage de antes del 16-10 sin decir de quién era.
  useEffect(() => {
    let vivo = true;
    fetch(URL_FIJADOS, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ fijados: unknown }>) : null))
      .then((j) => {
        if (!vivo || !j || tocado.current) return;
        const adopta = puedeAdoptarLegado();
        if (j.fijados === null) {
          const propio = actual.current.length > 0 ? actual.current : adopta ? sinFantasmas(sanear(leerLegado(slug))) : [];
          if (propio.length === 0) {
            if (adopta) borrarLegado(slug);
            return;
          }
          if (propio !== actual.current) {
            actual.current = propio;
            setCrudo(propio);
          }
          // Con su `.catch` adentro: una migración caída no deja la cola rechazada
          // (si no, el próximo fijar se revertía sin siquiera intentarlo).
          cola.current = cola.current
            .then(() => guardarEnServidor(propio))
            .then(() => {
              if (adopta) borrarLegado(slug);
            })
            .catch((err: unknown) => console.warn("[acceso-rapido] migrar falló", err));
          return;
        }
        if (adopta) borrarLegado(slug);
        const delServidor = sinFantasmas(sanear(j.fijados));
        actual.current = delServidor;
        setCrudo(delServidor);
      })
      .catch((err: unknown) => console.warn("[acceso-rapido] leer falló", err));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez por tienda (slug)
  }, [slug]);

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

  /** Esconde las carpetas que ya no existen o que este rol no ve (sólo al pintar: no toca el servidor). */
  const podarCarpetas = useCallback(
    (existe: (id: string) => boolean) => {
      existeCarpeta.current = existe;
      const prev = actual.current;
      const next = sinFantasmas(prev);
      if (next.length === prev.length) return;
      actual.current = next;
      setCrudo(next);
    },
    [setCrudo, sinFantasmas],
  );

  return { fijados, estaFijado, fijar, quitar, alternar, mover, reordenar, podarCarpetas };
}
