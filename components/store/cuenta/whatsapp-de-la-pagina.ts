"use client";

/**
 * El WhatsApp que la página propia del negocio conoce (Musa lo trae en su
 * extensión, no en la configuración de la tienda). El menú de cuenta lo
 * anota al montarse y «Mi cuenta › Ayuda» lo lee: los dos mandan al MISMO
 * número aunque la configuración esté vacía.
 */

import { useEffect, useSyncExternalStore } from "react";

let numero: string | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  for (const o of oyentes) o();
}

export function useAnotarWhatsappDeLaPagina(n: string | null | undefined): void {
  useEffect(() => {
    if (!n) return;
    numero = n;
    avisar();
    return () => {
      if (numero === n) {
        numero = null;
        avisar();
      }
    };
  }, [n]);
}

export function useWhatsappDeLaPagina(): string | null {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => numero,
    () => null,
  );
}
