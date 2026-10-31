"use client";

/**
 * El estado de la bolsa de la tienda que NO es el carrito (ADR-511; nació de
 * `pagina-musa/estado-bolsa.ts`).
 *
 * · ¿Está abierta? Un estado PROPIO, no el `isOpen` del carrito: en la cuenta y
 *   en «Mis pedidos» la tienda monta además su cajón general (`CartSidebar`),
 *   que se abre con ese `isOpen`; si la bolsa lo usara, se abrirían los dos. Es
 *   un almacén de módulo: el botón vive en el encabezado (`EncabezadoVivo`) y el
 *   cajón en los flotantes del marco, dos ramas distintas del layout.
 * · `usePedido` — nombre, celular, entrega, pago y la ubicación en vivo del
 *   pedido por WhatsApp. Vive en el cajón (queda montado aunque esté cerrado):
 *   el GPS sigue mirando aunque cierres la bolsa. Se recuerda POR NEGOCIO en
 *   este navegador (otra tienda no hereda tu zona ni tu pago).
 * · `?bolsa=1` (la vuelta de «Continuar con Google») reabre la bolsa. El
 *   `?carrito=abrir` de otras páginas lo atiende el encabezado.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useUbicacionEnVivo, type UsoUbicacionEnVivo } from "@/components/store/cliente/use-ubicacion-en-vivo";
import type { MedioDePago } from "./contenido";

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
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${resto ? `?${resto}` : ""}${window.location.hash}`);
    abrirBolsa();
  }, []);
}

/* ── Los datos del pedido por WhatsApp ─────────────────────────────────────── */

export interface Pedido {
  nombre: string;
  /** Lo que escribió (crudo); `normalizarCelularPe` dice si sirve. */
  celular: string;
  /** La zona elegida o lo que escribió («Jr. Ucayali 123»). */
  entrega: string;
  pago: MedioDePago | "";
  setNombre: (v: string) => void;
  setCelular: (v: string) => void;
  setEntrega: (v: string) => void;
  setPago: (v: MedioDePago) => void;
  /** El GPS vive acá (el cajón queda montado): sigue mirando aunque cierres la bolsa. */
  gps: UsoUbicacionEnVivo;
}

interface Recuerdo {
  nombre: string;
  celular: string;
  entrega: string;
  pago: string;
}

const clave = (slug: string) => `tienda-pedido:${slug}`;

function leer(slug: string): Partial<Recuerdo> {
  try {
    const v = JSON.parse(localStorage.getItem(clave(slug)) ?? "null") as unknown;
    return v && typeof v === "object" ? (v as Partial<Recuerdo>) : {};
  } catch {
    return {}; // sin almacenamiento (modo privado) o guardado roto: se empieza vacío
  }
}

function guardar(slug: string, r: Recuerdo) {
  try {
    localStorage.setItem(clave(slug), JSON.stringify({ ...r, nombre: r.nombre.trim(), celular: r.celular.trim() }));
  } catch {
    /* sin almacenamiento: se vuelve a pedir la próxima vez */
  }
}

/**
 * `pagos`: los medios que prendió el negocio (el primero va por defecto);
 * `entregas`: las opciones de entrega (lo recordado sólo vale si sigue en la lista).
 */
export function usePedido(slug: string, pagos: readonly MedioDePago[], entregas: readonly string[]): Pedido {
  const [r, setR] = useState<Recuerdo>({ nombre: "", celular: "", entrega: entregas[0] ?? "", pago: pagos[0] ?? "" });
  const gps = useUbicacionEnVivo();

  useEffect(() => {
    const g = leer(slug);
    setR((a) => ({
      nombre: typeof g.nombre === "string" ? g.nombre : a.nombre,
      celular: typeof g.celular === "string" ? g.celular : a.celular,
      entrega: typeof g.entrega === "string" && (entregas.length === 0 || entregas.includes(g.entrega)) ? g.entrega : a.entrega,
      pago: typeof g.pago === "string" && (pagos as readonly string[]).includes(g.pago) ? g.pago : a.pago,
    }));
    // Una vez por negocio: las listas llegan del servidor y no cambian mientras se compra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const poner = (campo: keyof Recuerdo) => (v: string) =>
    setR((a) => {
      const nuevo = { ...a, [campo]: v };
      guardar(slug, nuevo);
      return nuevo;
    });

  return {
    nombre: r.nombre,
    celular: r.celular,
    entrega: r.entrega,
    pago: (pagos as readonly string[]).includes(r.pago) ? (r.pago as MedioDePago) : "",
    setNombre: poner("nombre"),
    setCelular: poner("celular"),
    setEntrega: poner("entrega"),
    setPago: poner("pago"),
    gps,
  };
}
