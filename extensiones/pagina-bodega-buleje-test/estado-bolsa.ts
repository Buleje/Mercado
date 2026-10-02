"use client";

/**
 * ¿La bolsa está abierta? Un estado PROPIO de esta página, no el `isOpen` del
 * carrito: en la cuenta y en «Mis pedidos» la tienda monta además su cajón
 * general (`CartSidebar`), que se abre con ese `isOpen`. Si la bolsa también
 * lo usara, se abrirían los dos a la vez.
 *
 * Es un almacén de módulo (no un contexto): el botón vive en el encabezado y
 * el cajón en los flotantes del marco, dos ramas distintas del layout.
 */
import { useSyncExternalStore } from "react";

let abierta = false;
const oyentes = new Set<() => void>();

function avisar(valor: boolean) {
  if (abierta === valor) return;
  abierta = valor;
  oyentes.forEach((o) => o());
}

export const abrirBolsa = () => avisar(true);
export const cerrarBolsa = () => avisar(false);

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** `true` mientras la bolsa está abierta. En el servidor, siempre cerrada. */
export function useBolsaAbierta(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => abierta,
    () => false,
  );
}
