"use client";

/**
 * El estado de la bolsa de Musa que no es el carrito.
 *
 * · ¿Está abierta? Un estado PROPIO de esta página, no el `isOpen` del carrito:
 *   en la cuenta y en «Mis pedidos» la tienda monta además su cajón general
 *   (`CartSidebar`), que se abre con ese `isOpen`. Si la bolsa también lo usara,
 *   se abrirían los dos a la vez. Es un almacén de módulo (no un contexto): el
 *   botón vive en el encabezado y el cajón en los flotantes del marco, dos ramas
 *   distintas del layout.
 * · `usePedido` — nombre, pueblo y forma de pago del pedido por WhatsApp. Vive en
 *   el cajón (que queda montado aunque esté cerrado) porque el pueblo lo leen dos
 *   piezas: la barra de envío gratis, arriba, y el formulario, abajo. Nombre y
 *   pueblo se recuerdan en este navegador al escribirlos.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { pagosPara, PUEBLO_SIN_COSTO, PUEBLOS, type Pago, type Pueblo } from "./pedido-whatsapp";

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

/* ── Los datos del pedido ──────────────────────────────────────────────────── */

const RECUERDO = "musa-pedido";

export interface Pedido {
  nombre: string;
  pueblo: Pueblo;
  pago: Pago;
  setNombre: (v: string) => void;
  setPueblo: (p: Pueblo) => void;
  setPago: (p: Pago) => void;
}

function guardar(nombre: string, pueblo: Pueblo) {
  try {
    localStorage.setItem(RECUERDO, JSON.stringify({ nombre: nombre.trim(), pueblo }));
  } catch {
    /* sin almacenamiento (modo privado): no pasa nada */
  }
}

export function usePedido(): Pedido {
  const [nombre, setNombre] = useState("");
  const [pueblo, setPueblo] = useState<Pueblo>(PUEBLO_SIN_COSTO);
  const [pago, setPago] = useState<Pago>("Yape");

  // Lo que dejó el pedido anterior en este navegador (sólo nombre y pueblo).
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(RECUERDO) ?? "null") as {
        nombre?: string;
        pueblo?: string;
      } | null;
      if (guardado?.nombre) setNombre(guardado.nombre);
      if (guardado?.pueblo && (PUEBLOS as readonly string[]).includes(guardado.pueblo))
        setPueblo(guardado.pueblo as Pueblo);
    } catch {
      /* sin almacenamiento: se empieza vacío */
    }
  }, []);

  return {
    nombre,
    pueblo,
    pago,
    setPago,
    setNombre: (v) => {
      setNombre(v);
      guardar(v, pueblo);
    },
    setPueblo: (p) => {
      setPueblo(p);
      if (!pagosPara(p).includes(pago)) setPago("Yape");
      guardar(nombre, p);
    },
  };
}
