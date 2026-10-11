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
 * · `usePedido` — nombre, celular, pueblo, pago y la ubicación en vivo del pedido
 *   por WhatsApp (la cuenta de Google la pregunta `DatosCliente` al abrir). Vive en el cajón (que queda montado aunque
 *   esté cerrado): el pueblo lo leen la línea de envío, arriba, y el pie; y el GPS
 *   sigue mirando aunque cierres la bolsa. Nombre y pueblo se recuerdan en este
 *   navegador; el celular, por negocio.
 * · `?bolsa=1` en la dirección (la vuelta de «Continuar con Google») reabre la bolsa.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  useUbicacionEnVivo,
  type UsoUbicacionEnVivo,
} from "@/components/store/cliente/use-ubicacion-en-vivo";
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

/** El parámetro que reabre la bolsa al cargar (la vuelta de Google lo trae). */
const PARAM_BOLSA = "bolsa";

/** Esta página con `?bolsa=1`: adonde vuelve «Continuar con Google». */
export function rutaConBolsa(): string {
  const params = new URLSearchParams(window.location.search);
  params.set(PARAM_BOLSA, "1");
  return `${window.location.pathname}?${params.toString()}`;
}

/** Con `?bolsa=1`: lo borra ANTES de abrir (una recarga no la reabre) y abre la bolsa. */
export function useAbrirBolsaDelEnlace() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(PARAM_BOLSA) !== "1") return;
    params.delete(PARAM_BOLSA);
    const resto = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${resto ? `?${resto}` : ""}${window.location.hash}`,
    );
    abrirBolsa();
  }, []);
}

/* ── Los datos del pedido ──────────────────────────────────────────────────── */

const RECUERDO = "musa-pedido";

export interface Pedido {
  nombre: string;
  /** Lo que escribió (crudo); `normalizarCelularPe` dice si sirve. */
  celular: string;
  pueblo: Pueblo;
  pago: Pago;
  setNombre: (v: string) => void;
  setCelular: (v: string) => void;
  setPueblo: (p: Pueblo) => void;
  setPago: (p: Pago) => void;
  /** El GPS vive acá (el cajón queda montado): sigue mirando aunque cierres la bolsa. */
  gps: UsoUbicacionEnVivo;
}

function guardar(nombre: string, pueblo: Pueblo) {
  try {
    localStorage.setItem(RECUERDO, JSON.stringify({ nombre: nombre.trim(), pueblo }));
  } catch {
    /* sin almacenamiento (modo privado): no pasa nada */
  }
}

/** El celular se recuerda POR NEGOCIO (`/t/<negocio>` o, en su dominio, el host). */
function claveCelular(): string {
  const negocio = window.location.pathname.match(/^\/t\/([^/]+)/)?.[1] ?? window.location.host;
  return `${RECUERDO}-celular:${negocio}`;
}

function guardarCelular(v: string) {
  try {
    localStorage.setItem(claveCelular(), v.trim());
  } catch {
    /* sin almacenamiento: se vuelve a pedir la próxima vez */
  }
}

export function usePedido(): Pedido {
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [pueblo, setPueblo] = useState<Pueblo>(PUEBLO_SIN_COSTO);
  const [pago, setPago] = useState<Pago>("Yape");
  const gps = useUbicacionEnVivo();

  // Lo que dejó el pedido anterior en este navegador (nombre y pueblo; el celular, de este negocio).
  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem(RECUERDO) ?? "null") as {
        nombre?: string;
        pueblo?: string;
      } | null;
      if (guardado?.nombre) setNombre(guardado.nombre);
      if (guardado?.pueblo && (PUEBLOS as readonly string[]).includes(guardado.pueblo))
        setPueblo(guardado.pueblo as Pueblo);
      setCelular(localStorage.getItem(claveCelular()) ?? "");
    } catch {
      /* sin almacenamiento: se empieza vacío */
    }
  }, []);

  return {
    nombre,
    celular,
    pueblo,
    pago,
    gps,
    setPago,
    setNombre: (v) => {
      setNombre(v);
      guardar(v, pueblo);
    },
    setCelular: (v) => {
      setCelular(v);
      guardarCelular(v);
    },
    setPueblo: (p) => {
      setPueblo(p);
      if (!pagosPara(p).includes(pago)) setPago("Yape");
      guardar(nombre, p);
    },
  };
}
