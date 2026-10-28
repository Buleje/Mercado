"use client";

import { useEffect } from "react";
import { registrarApertura } from "@/lib/admin/registro-aperturas";

/** Igual que «Abriste hace poco»: cuenta cuando te quedas 0,9 s en la pestaña (pasar de largo no). */
const QUIETA_MS = 900;

/**
 * Anota la pestaña abierta en el registro del negocio (`lib/admin/registro-aperturas.ts`):
 * una vez por sesión del navegador, sin esperar a nadie. Las sub-vistas las
 * anota la barra del módulo (`use-orden-de-la-barra.ts`).
 */
export function useRegistrarApertura(tab: string, authReady: boolean): void {
  useEffect(() => {
    if (!authReady || !tab) return;
    const t = setTimeout(() => registrarApertura(tab), QUIETA_MS);
    return () => clearTimeout(t);
  }, [tab, authReady]);
}
