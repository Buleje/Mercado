"use client";

/**
 * ¿Qué producto muestra la ficha rápida? (`null` = cerrada). Almacén de
 * módulo, igual que `estado-bolsa.ts`: las tarjetas viven en la portada, el
 * catálogo y la ficha, y el modal una sola vez junto a la bolsa del marco.
 *
 * `hayFicha()` dice si el modal está montado: sin él, el enlace de la tarjeta
 * navega a la ficha como siempre (nunca un clic que no hace nada).
 */
import { useEffect, useSyncExternalStore } from "react";
import type { ProductoSalon } from "./datos";

let actual: ProductoSalon | null = null;
let montadas = 0;
const oyentes = new Set<() => void>();

function avisar(valor: ProductoSalon | null) {
  if (actual === valor) return;
  actual = valor;
  oyentes.forEach((o) => o());
}

export const abrirFicha = (p: ProductoSalon) => avisar(p);
export const cerrarFicha = () => avisar(null);
export const hayFicha = () => montadas > 0;

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** El producto abierto en la ficha rápida. En el servidor, ninguno. */
export function useFichaAbierta(): ProductoSalon | null {
  return useSyncExternalStore(
    suscribir,
    () => actual,
    () => null,
  );
}

/** Lo llama el modal al montarse: desde ahí los enlaces lo abren en vez de navegar. */
export function useRegistrarFicha(): void {
  useEffect(() => {
    montadas += 1;
    return () => {
      montadas -= 1;
      if (montadas === 0) cerrarFicha();
    };
  }, []);
}
