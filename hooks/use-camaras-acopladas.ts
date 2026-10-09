"use client";

/**
 * ¿Están las cámaras «al lado»? (mosaico «Ver todas en vivo» acoplado,
 * `components/admin/forestal/camaras/use-acople-mosaico.ts`).
 *
 * Lo lee la barra lateral del panel para encogerse a íconos mientras dure
 * (Brandon 2026-10-09: a 1280 px la asistencia quedaba con 466 px de ancho; con
 * la barra angosta, 682). Se escucha la marca `data-mosaico-acoplado` de
 * `<html>` y no un contexto: la barra vive fuera del proveedor del mosaico.
 */

import { useSyncExternalStore } from "react";

const MARCA = "data-mosaico-acoplado";

function suscribir(avisar: () => void) {
  const obs = new MutationObserver(avisar);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: [MARCA] });
  return () => obs.disconnect();
}

export function useCamarasAcopladas(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => document.documentElement.hasAttribute(MARCA),
    () => false,
  );
}
