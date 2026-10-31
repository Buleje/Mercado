"use client";

/** Piezas chicas que usan la grabadora, la lista y sus ventanas. */
import type { SyntheticEvent } from "react";
import { cn } from "@/lib/utils";

export const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export const TEXTO_ERROR = "text-sm text-[var(--data-error-ink)]";
export const TEXTO_META = "text-xs text-[var(--text-secondary)]";

/**
 * Chrome graba webm SIN duración en la cabecera: el `<audio>` dice «Infinity»
 * y la barra no avanza. Saltar al final obliga a leerla; después se vuelve al
 * principio.
 */
function arreglarDuracion(e: SyntheticEvent<HTMLAudioElement>) {
  const a = e.currentTarget;
  if (a.duration !== Infinity) return;
  const volver = () => {
    a.removeEventListener("timeupdate", volver);
    a.currentTime = 0;
  };
  a.addEventListener("timeupdate", volver);
  a.currentTime = 1e101;
}

export function ReproductorAudio({
  src,
  autoPlay = false,
  className,
  etiqueta,
}: {
  src: string;
  autoPlay?: boolean;
  className?: string;
  etiqueta: string;
}) {
  return (
    <audio
      src={src}
      controls
      autoPlay={autoPlay}
      preload="metadata"
      aria-label={etiqueta}
      onLoadedMetadata={arreglarDuracion}
      className={cn("h-11 w-full dark:[color-scheme:dark]", className)}
    />
  );
}
