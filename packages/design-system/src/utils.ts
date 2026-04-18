/**
 * cn() — className merger. Re-export desde clsx + tailwind-merge.
 *
 * Copia local para mantener el package autonomo. Fase 3 de ADR-069.
 * Si quieres extraer este package, este archivo es la unica dependencia
 * interna que tenia que moverse.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
