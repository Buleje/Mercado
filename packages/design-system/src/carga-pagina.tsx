"use client";

/**
 * CargaPagina — EL cargador de página de toda la app: un número del 1 al 100
 * y una barra fina. Sin textos, sin botones (Brandon 2026-10-17, con captura
 * de la tarjeta «Cargando… Lleva 7 s… Volver al inicio / Reintentar»: «quiero
 * simplemente una carga del 1 al 100, minimalista; aplícalo a todo»).
 *
 * El progreso es simulado: lo dibuja CSS (`.carga-progreso` en globals.css),
 * sube rápido, se frena cerca de 90 y se queda en ~95 hasta que la página
 * llega. Corre antes de hidratar y también con «reducir movimiento» (contar
 * no es moverse; no hay nada que gire).
 *
 * Modos:
 *   - "pantalla" (default): ocupa el alto de la pantalla — `loading.tsx`.
 *   - "bloque": centrado en un área — fallback de Suspense dentro de una página.
 *   - "flotante": sólo el indicador; NavProgress lo centra encima de la página.
 *
 * Cuándo NO: dentro de un botón, una tabla o una tarjeta (eso es un estado de
 * carga local: skeleton o `LoadingState`).
 */

import { useLayoutEffect, useState } from "react";
import { cn } from "./utils";
import { msDeCarga, registrarCargadorDePagina } from "./carga-pagina-reloj";

export interface CargaPaginaProps {
  modo?: "pantalla" | "bloque" | "flotante";
  /** La página llegó: muestra 100 (lo usa NavProgress antes de irse). */
  completo?: boolean;
  /** Nombre para lectores de pantalla; no se ve. */
  etiqueta?: string;
  className?: string;
}

export function CargaPagina({
  modo = "pantalla",
  completo = false,
  etiqueta = "Cargando",
  className,
}: CargaPaginaProps) {
  // La curva arranca en el clic, no al montar: si NavProgress ya iba en 40,
  // este cargador sigue desde 40 (retraso negativo). Fijo por instancia.
  const [retraso] = useState(() => -Math.round(msDeCarga()));

  // useLayoutEffect: NavProgress decide en un setTimeout(0) tras el commit si
  // hay un cargador en pantalla; un useEffect podría llegar tarde.
  useLayoutEffect(() => (modo === "flotante" ? undefined : registrarCargadorDePagina()), [modo]);

  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-busy={!completo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={completo ? 100 : undefined}
      data-carga-pagina={modo}
      className={cn(
        "carga-progreso flex flex-col items-center justify-center gap-3",
        completo && "carga-completa",
        modo === "pantalla" && "min-h-screen bg-[var(--surface-canvas)]",
        modo === "bloque" && "py-16",
        className,
      )}
      style={retraso < 0 ? { animationDelay: `${retraso}ms` } : undefined}
    >
      {/* Número centrado: el «%» de la izquierda es invisible y compensa al de la derecha. */}
      <span aria-hidden className="flex items-baseline tabular-nums">
        <span className="invisible text-sm font-semibold">%</span>
        <span className="carga-cifra w-[3ch] text-center text-3xl font-semibold leading-none tracking-tight text-[var(--text-primary)]" />
        <span className="text-sm font-semibold text-[var(--text-tertiary)]">%</span>
      </span>
      <span aria-hidden className="block h-[3px] w-28 overflow-hidden rounded-full bg-[var(--rule-base)]">
        <span className="carga-barra block h-full rounded-full bg-[var(--accent)]" />
      </span>
    </div>
  );
}

export default CargaPagina;
