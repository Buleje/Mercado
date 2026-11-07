"use client";

/**
 * «Ver movimiento» (08-10): los recuadros celestes punteados de `CajasEnVivo`
 * con su propio interruptor, aparte de «Detectar personas», recordado en este
 * navegador para el mosaico y el visor de una cámara. Prendido por defecto:
 * es lo que se veía hasta hoy.
 */

import { useLocalStorage } from "@/hooks/use-local-storage";

export const CLAVE_VER_MOVIMIENTO = "camaras-vivo:ver-movimiento";

export function useVerMovimiento(): [boolean, (v: boolean) => void] {
  const [ver, setVer] = useLocalStorage<boolean>(CLAVE_VER_MOVIMIENTO, true);
  return [ver, setVer];
}
