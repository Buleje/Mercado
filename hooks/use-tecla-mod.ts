"use client";

/**
 * La tecla modificadora que corresponde a la máquina: «⌘» en Mac, «Ctrl» en el
 * resto (H12/M05, 17-10: la búsqueda pedía Ctrl+K en Windows y dibujaba ⌘).
 * En el servidor y en el primer render dice «Ctrl» (la mayoría de las cajas son
 * Windows) y después se corrige sin desajuste de hidratación.
 */
import { useSyncExternalStore } from "react";

export type TeclaMod = "⌘" | "Ctrl";

type NavegadorConPlataforma = Navigator & { userAgentData?: { platform?: string } };

export function esMac(nav: NavegadorConPlataforma | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  const plataforma = nav.userAgentData?.platform || nav.platform || "";
  return /mac|iphone|ipad|ipod/i.test(plataforma);
}

const sinCambios = () => () => {};

export function useTeclaMod(): TeclaMod {
  return useSyncExternalStore(
    sinCambios,
    () => (esMac() ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

/** «⌘K» o «Ctrl+K», para textos y `aria-label`. */
export function atajoConMod(mod: TeclaMod, tecla: string): string {
  return mod === "⌘" ? `⌘${tecla}` : `Ctrl+${tecla}`;
}
