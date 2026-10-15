"use client";

/**
 * useEspecieFijada — la especie que el operador FIJÓ para una pantalla de
 * carga (Brandon 15-10: «podré poner una especie y fijarla y al poner los demás
 * campos se pondrán en esa especie»). Mientras está fijada, cada fila nueva la
 * toma sola; soltarla vuelve a pedirla.
 *
 * Se recuerda en el navegador POR NEGOCIO (`active-tenant-slug`): la especie de
 * Blas no aparece fijada en otra planta. `localStorage` puede no estar (modo
 * privado, cuota llena): sin él, la especie sigue fijada mientras dure la
 * pantalla.
 */

import { useCallback, useState } from "react";

const clave = (contexto: string): string => {
  let slug = "main";
  try {
    slug = localStorage.getItem("active-tenant-slug") ?? "main";
  } catch {
    /* sin localStorage: la del tenant por defecto */
  }
  return `buleje-especie-fijada-${contexto}-${slug}`;
};

function leer(contexto: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(clave(contexto))?.trim() || null;
  } catch {
    return null;
  }
}

function escribir(contexto: string, especie: string | null): void {
  try {
    if (especie) localStorage.setItem(clave(contexto), especie);
    else localStorage.removeItem(clave(contexto));
  } catch {
    /* sin localStorage: queda fijada sólo en esta pantalla */
  }
}

export interface EspecieFijada {
  /** La especie fijada, o `null` si no hay. */
  fijada: string | null;
  fijar: (especie: string) => void;
  soltar: () => void;
}

/** `contexto` separa pantallas: lo fijado al despachar no se fija en el cubicador. */
export function useEspecieFijada(contexto: string): EspecieFijada {
  const [fijada, setFijada] = useState<string | null>(() => leer(contexto));
  const fijar = useCallback(
    (especie: string) => {
      const e = especie.trim() || null;
      setFijada(e);
      escribir(contexto, e);
    },
    [contexto],
  );
  const soltar = useCallback(() => {
    setFijada(null);
    escribir(contexto, null);
  }, [contexto]);
  return { fijada, fijar, soltar };
}
