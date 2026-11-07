"use client";

/**
 * Atrás / Adelante del explorador del Archivo, como los de Windows. Va aparte
 * del historial del navegador: el Drive cambia la carpeta sin crear entradas
 * (`replaceState`), y el Atrás del navegador te sacaría de la pantalla.
 *
 * La lógica es pura (`llegar`, `retroceder`, `avanzar`) para poder probarla;
 * el hook sólo la guarda y avisa cuándo cambian los botones.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Historial {
  atras: readonly (string | null)[];
  adelante: readonly (string | null)[];
  actual: string | null;
}

/** Llegaste a otra carpeta por tu cuenta: lo de adelante se pierde. */
export function llegar(h: Historial, destino: string | null): Historial {
  if (destino === h.actual) return h;
  return { atras: [...h.atras, h.actual], adelante: [], actual: destino };
}

export function retroceder(h: Historial): { h: Historial; destino: string | null } | null {
  if (h.atras.length === 0) return null;
  const destino = h.atras[h.atras.length - 1];
  return { destino, h: { atras: h.atras.slice(0, -1), adelante: [...h.adelante, h.actual], actual: destino } };
}

export function avanzar(h: Historial): { h: Historial; destino: string | null } | null {
  if (h.adelante.length === 0) return null;
  const destino = h.adelante[h.adelante.length - 1];
  return { destino, h: { atras: [...h.atras, h.actual], adelante: h.adelante.slice(0, -1), actual: destino } };
}

export function useHistorialCarpetas(actual: string | null) {
  const ref = useRef<Historial>({ atras: [], adelante: [], actual });
  const [largos, setLargos] = useState({ atras: 0, adelante: 0 });
  const avisar = () => setLargos({ atras: ref.current.atras.length, adelante: ref.current.adelante.length });

  useEffect(() => {
    const h = llegar(ref.current, actual);
    if (h === ref.current) return;
    ref.current = h;
    setLargos({ atras: h.atras.length, adelante: h.adelante.length });
  }, [actual]);

  /** A dónde ir (`undefined` = no hay). La carpeta la abre quien llama. */
  const atras = useCallback((): string | null | undefined => {
    const r = retroceder(ref.current);
    if (!r) return undefined;
    ref.current = r.h;
    avisar();
    return r.destino;
  }, []);

  const adelante = useCallback((): string | null | undefined => {
    const r = avanzar(ref.current);
    if (!r) return undefined;
    ref.current = r.h;
    avisar();
    return r.destino;
  }, []);

  return { puedeAtras: largos.atras > 0, puedeAdelante: largos.adelante > 0, atras, adelante };
}
