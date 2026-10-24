"use client";

/**
 * «ID 482-917» + copiar (ADR-500): el ID de soporte de una tienda. Lo usan el
 * superadmin (tarjetas, tabla, ficha) y el panel del negocio («ID de tu
 * negocio»): un solo dibujo para que el dueño y Brandon vean lo mismo.
 * Todo el chip es el botón: un toque copia «482-917». No deja pasar el clic
 * ni la tecla al contenedor (las tarjetas abren la ficha al hacer clic).
 */

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { toast } from "sonner";
import { Check, Copy } from "@buleje/design-system/icons";
import { formatearCodigoTienda } from "@/lib/codigo-tienda";
import { cn } from "@/lib/utils";

interface CodigoTiendaProps {
  codigo: string | null | undefined;
  /** Lo que va antes del número: «ID» (superadmin) o «ID de tu negocio». */
  etiqueta?: string;
  /** En el celular, si la etiqueta larga parte el título de al lado («ID»). */
  etiquetaCorta?: string;
  /** `md` para la ficha y Ajustes; `sm` para tarjetas y tabla. */
  tamano?: "sm" | "md";
  className?: string;
}

export function CodigoTienda({ codigo, etiqueta = "ID", etiquetaCorta, tamano = "sm", className }: CodigoTiendaProps) {
  const [copiado, setCopiado] = useState(false);
  const reloj = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (reloj.current != null) window.clearTimeout(reloj.current);
    },
    [],
  );
  if (!codigo) return null;
  const visible = formatearCodigoTienda(codigo);

  const copiar = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigator.clipboard
      .writeText(visible)
      .then(() => {
        toast.success(`Copiaste el ID ${visible}`);
        setCopiado(true);
        reloj.current = window.setTimeout(() => setCopiado(false), 1500);
      })
      .catch((err: unknown) => {
        toast.error(`No se pudo copiar: ${err instanceof Error ? err.message : String(err)}`);
      });
  };
  // Enter/Espacio activan el botón; que no lleguen al `role="button"` de la tarjeta.
  const frenarTecla = (e: KeyboardEvent<HTMLButtonElement>) => e.stopPropagation();

  const Icono = copiado ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copiar}
      onKeyDown={frenarTecla}
      title={`Copiar el ID ${visible}`}
      aria-label={`${etiqueta} ${visible}. Copiar`}
      data-codigo-tienda={codigo}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--rule-base)] bg-[var(--surface-sunken)] font-mono tabular-nums text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        tamano === "md" ? "h-8 px-2.5 text-sm" : "h-6 px-1.5 text-xs",
        className,
      )}
    >
      {etiquetaCorta ? (
        <>
          <span className="font-sans font-semibold text-[var(--text-tertiary)] sm:hidden">{etiquetaCorta}</span>
          <span className="hidden font-sans font-semibold text-[var(--text-tertiary)] sm:inline">{etiqueta}</span>
        </>
      ) : (
        <span className="font-sans font-semibold text-[var(--text-tertiary)]">{etiqueta}</span>
      )}
      <span className="font-bold">{visible}</span>
      <Icono
        className={cn(tamano === "md" ? "h-3.5 w-3.5" : "h-3 w-3", copiado ? "text-[var(--data-success-ink)]" : "text-[var(--text-tertiary)]")}
        aria-hidden="true"
      />
    </button>
  );
}
