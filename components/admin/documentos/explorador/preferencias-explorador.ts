"use client";

/**
 * Lo que el explorador del Archivo recuerda en este navegador: si se ve el
 * panel lateral, cómo se agrupa y si el orden va dado vuelta. Si el navegador
 * no deja guardar (modo privado, cuota llena), funciona igual sin recordar.
 */

import { useCallback, useState } from "react";
import { AGRUPACIONES, type AgruparPor } from "./orden-agrupar";

const CLAVE_PANEL = "doc-panel-lateral";
const CLAVE_AGRUPAR = "doc-explorador-agrupar";
const CLAVE_INVERTIDO = "doc-explorador-invertido";

function leer(clave: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento: la preferencia dura hasta recargar.
  }
}

const AGRUPAR_VALIDOS = new Set<string>(AGRUPACIONES.map((a) => a.id));

export function usePreferenciasExplorador() {
  /** `null` = nunca lo tocaste: el explorador va sin panel y Tarjetas con panel. */
  const [panelLateral, setPanel] = useState<boolean | null>(() => {
    const v = leer(CLAVE_PANEL);
    return v === "1" ? true : v === "0" ? false : null;
  });
  const [agruparPor, setAgrupar] = useState<AgruparPor>(() => {
    const v = leer(CLAVE_AGRUPAR);
    return v && AGRUPAR_VALIDOS.has(v) ? (v as AgruparPor) : "ninguno";
  });
  const [invertido, setInvertido] = useState(() => leer(CLAVE_INVERTIDO) === "1");

  const fijarPanel = useCallback((si: boolean) => {
    setPanel(si);
    guardar(CLAVE_PANEL, si ? "1" : "0");
  }, []);
  const fijarAgrupar = useCallback((a: AgruparPor) => {
    setAgrupar(a);
    guardar(CLAVE_AGRUPAR, a);
  }, []);
  const fijarInvertido = useCallback((si: boolean) => {
    setInvertido(si);
    guardar(CLAVE_INVERTIDO, si ? "1" : "0");
  }, []);

  return { panelLateral, fijarPanel, agruparPor, fijarAgrupar, invertido, fijarInvertido };
}
