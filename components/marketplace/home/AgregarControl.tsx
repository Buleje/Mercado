"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { m, useReducedMotion } from "framer-motion";
import { BellRing, Minus, Plus } from "@buleje/design-system/icons";
import { EASE, DURATION } from "@/components/ui-system/motion";
import { cn } from "@/lib/utils";

/**
 * AgregarControl — el «+» de la tarjeta de la home que, al agregar, se vuelve
 * el contador `[− N +]` (Instacart/Getir). 40 px visibles y 48 de área táctil.
 * Agotado → campana «Avísame» por WhatsApp. Lógica: hooks/use-agregar-producto.
 *
 * El «+» va en `--accent` con el ícono en tinta del dosel (blanco medía
 * 2,6:1 sobre el turquesa de la tienda); el contador lleva texto y va en
 * blanco sobre `--accent-dark` (4,86:1).
 */

interface Props {
  nombre: string;
  cantidad: number;
  agotado: boolean;
  enTope: boolean;
  pendiente: boolean;
  avisarHref: string;
  onAgregar: () => void;
  onQuitar: () => void;
  onPreparar: () => void;
  className?: string;
}

// El área táctil crece 4 px por lado sin mover el dibujo.
const AREA = "relative after:absolute after:-inset-1 after:content-['']";
const FOCO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]";

export default function AgregarControl({
  nombre,
  cantidad,
  agotado,
  enTope,
  pendiente,
  avisarHref,
  onAgregar,
  onQuitar,
  onPreparar,
  className,
}: Props) {
  const reducir = useReducedMotion() ?? false;
  const abierto = cantidad > 0;
  // El botón que tenía el foco se desmonta al cambiar de forma: el foco pasa al
  // botón equivalente de la forma nueva (teclado sin saltos al <body>).
  const moverFoco = useRef(false);
  const agregarRef = useRef<HTMLButtonElement>(null);
  const masRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!moverFoco.current) return;
    moverFoco.current = false;
    (abierto ? masRef.current : agregarRef.current)?.focus();
  }, [abierto]);
  const alClic = (accion: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
    moverFoco.current = e.currentTarget === document.activeElement;
    accion();
  };

  if (agotado) {
    return (
      <a
        href={avisarHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Avísame cuando llegue ${nombre}`}
        title="Avísame cuando llegue"
        className={cn(
          AREA,
          FOCO,
          "z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-[var(--shadow-md)] ring-1 ring-[var(--rule-base)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--accent-soft)]",
          className,
        )}
      >
        <BellRing className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden />
      </a>
    );
  }

  return (
    <m.div
      initial={false}
      animate={{ width: abierto ? 112 : 40 }}
      transition={{ duration: reducir ? 0 : DURATION.base, ease: EASE.editorial }}
      className={cn(
        "z-10 flex h-10 items-center justify-between rounded-full text-white shadow-[var(--shadow-md)] transition-colors duration-[var(--dur-base)]",
        abierto ? "bg-[var(--accent-dark)]" : "bg-[var(--accent)]",
        className,
      )}
    >
      {abierto ? (
        <>
          <button
            type="button"
            onClick={alClic(onQuitar)}
            aria-label={cantidad === 1 ? `Quitar ${nombre} del carrito` : `Quitar uno de ${nombre}`}
            className={cn(AREA, FOCO, "grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/15")}
          >
            <Minus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
          </button>
          <span aria-hidden className="min-w-[1.5rem] text-center text-sm font-extrabold tabular-nums">
            {cantidad > 99 ? "99+" : cantidad}
          </span>
          <button
            ref={masRef}
            type="button"
            onClick={alClic(onAgregar)}
            onPointerDown={onPreparar}
            aria-disabled={enTope || undefined}
            aria-label={enTope ? `${nombre}: alcanzaste el stock disponible` : `Agregar otro ${nombre}`}
            className={cn(
              AREA,
              FOCO,
              "grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/15",
              enTope && "cursor-not-allowed opacity-50",
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
          </button>
        </>
      ) : (
        <button
          ref={agregarRef}
          type="button"
          onClick={alClic(onAgregar)}
          onPointerDown={onPreparar}
          onFocus={onPreparar}
          aria-busy={pendiente || undefined}
          aria-label={`Agregar ${nombre} al carrito`}
          className={cn(
            AREA,
            FOCO,
            "grid h-10 w-10 place-items-center rounded-full transition-transform duration-[var(--dur-fast)] active:scale-90 motion-reduce:active:scale-100",
            pendiente && "animate-pulse",
          )}
        >
          {/* Tinta del dosel sobre el turquesa: el blanco daba 2,6:1 medido. */}
          <Plus className="h-5 w-5 text-[var(--dosel-950)]" strokeWidth={2.75} aria-hidden />
        </button>
      )}
      {/* Siempre montada: así también anuncia cuando quitas el último (cantidad 0). */}
      <span aria-live="polite" className="sr-only">
        {cantidad > 0 ? `${nombre}: ${cantidad} en el carrito` : `${nombre}: fuera del carrito`}
      </span>
    </m.div>
  );
}
