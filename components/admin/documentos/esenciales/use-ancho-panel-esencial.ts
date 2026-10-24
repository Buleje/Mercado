import { useCallback, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

/**
 * El ancho del panel de Esenciales (Brandon 24-10: «una barra lateral más
 * ancha, para que tenga más espacio y pueda ver los documentos más
 * ampliamente»). De fábrica 26rem; «Más ancho» lo lleva a 44rem y el borde se
 * arrastra. Nunca deja a las tarjetas con menos de 480 px: a 1280 de pantalla
 * (1004 libres) el ancho llega a 524; a 1920, a los 704 enteros.
 * Se recuerda en este navegador (sin prefijo `admin-`: al cambiar de negocio
 * `tenant-cache` borra esas claves y esto es de la persona).
 */
export const ANCHO_ESENCIAL = { fabrica: 416, amplio: 704, min: 320 } as const;
/** Lo que les queda como mínimo a las tarjetas, a la izquierda del panel. */
export const RESTO_TARJETAS = 480;
const CLAVE = "documentos-esenciales-ancho-panel";

/** El ancho pedido dentro de lo que entra (`libre` = pantalla sin la barra izquierda). */
export function anchoEsencial(pedido: number | null, libre: number): number {
  const tope = Math.max(ANCHO_ESENCIAL.min, libre - RESTO_TARJETAS);
  return Math.round(Math.min(tope, Math.max(ANCHO_ESENCIAL.min, pedido ?? ANCHO_ESENCIAL.fabrica)));
}

export interface MedidaPanelEsencial {
  /** El ancho que se ve (con el arrastre en curso), en px. */
  visible: number;
  /** El máximo que entra ahora. */
  tope: number;
  /** Pediste más que el de fábrica: el botón dice «Más angosto» y el cajón va a 90vw. */
  amplio: boolean;
  alternar: () => void;
  acotar: (px: number) => number;
  /** Guardar (px) o volver al de fábrica (`null`). */
  guardar: (px: number | null) => void;
  setArrastre: (px: number | null) => void;
}

export function useAnchoPanelEsencial(libre: number): MedidaPanelEsencial {
  const [guardado, setGuardado] = useLocalStorage<number | null>(CLAVE, null);
  // Lo guardado a mano o por otra versión puede no ser un número: se toma el de fábrica.
  const pedido = typeof guardado === "number" && Number.isFinite(guardado) ? guardado : null;
  const [arrastre, setArrastre] = useState<number | null>(null);
  const actual = arrastre ?? pedido;
  const amplio = (actual ?? ANCHO_ESENCIAL.fabrica) > ANCHO_ESENCIAL.fabrica;
  const acotar = useCallback((px: number) => anchoEsencial(px, libre), [libre]);
  return {
    visible: anchoEsencial(actual, libre),
    tope: anchoEsencial(Number.MAX_SAFE_INTEGER, libre),
    amplio,
    alternar: () => setGuardado(amplio ? null : ANCHO_ESENCIAL.amplio),
    acotar,
    guardar: (px) => setGuardado(px === null || px === ANCHO_ESENCIAL.fabrica ? null : px),
    setArrastre,
  };
}
