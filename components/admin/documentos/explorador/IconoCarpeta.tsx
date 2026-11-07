"use client";

/**
 * La carpeta amarilla del Explorador de Windows, dibujada con clases (sin hex):
 * la tapa de atrás con su pestaña, una hoja asomando y el frente. Si el dueño
 * le puso color, ícono o emoji a la carpeta, se respeta; si le puso una imagen,
 * se ve la imagen con una carpetita en la esquina.
 */

import { useState } from "react";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { cn } from "@/lib/utils";
import { FOLDER_ICON_OPTIONS, docDeIconoCarpeta } from "../folder-visuals";

export type TamIcono = "grande" | "mediano" | "chico";

interface Carpeta {
  icon: string | null;
  color: string | null;
  emoji?: string | null;
}

/** El dibujo solo, al tamaño de su caja. */
export function CarpetaSvg({ color, className }: { color: string | null; className?: string }) {
  // El color del dueño viene de `FOLDER_COLORS` (lo eligió él): va por estilo.
  const frente = color ? { fill: color } : undefined;
  const fondo = color ? { fill: `color-mix(in srgb, ${color} 72%, black)` } : undefined;
  return (
    <svg viewBox="0 0 64 52" className={className} aria-hidden focusable="false">
      <path
        d="M4 6a4 4 0 0 1 4-4h14.3a4 4 0 0 1 2.9 1.2L30 8h26a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"
        className={color ? undefined : "fill-yellow-500 dark:fill-yellow-600"}
        style={fondo}
      />
      <rect x="9" y="11" width="46" height="24" rx="2" className="fill-white opacity-95" />
      <path
        d="M4 18a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"
        className={color ? undefined : "fill-yellow-400 dark:fill-yellow-500"}
        style={frente}
      />
    </svg>
  );
}

const CAJA: Record<TamIcono, string> = {
  grande: "w-[82%]",
  mediano: "w-full",
  chico: "h-6 w-7 shrink-0",
};

const EMOJI: Record<TamIcono, string> = { grande: "text-3xl", mediano: "text-xl", chico: "text-[length:var(--ts-xs)]" };
const SELLO: Record<TamIcono, string> = { grande: "h-8 w-8", mediano: "h-5 w-5", chico: "hidden" };

export default function IconoCarpeta({ carpeta, tam, className }: { carpeta: Carpeta; tam: TamIcono; className?: string }) {
  const [fallo, setFallo] = useState(false);
  const imagen = docDeIconoCarpeta(carpeta.icon);

  if (imagen && !fallo && tam !== "chico") {
    return (
      <span className={cn("relative block h-full w-full overflow-hidden rounded-lg", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urlMiniatura(imagen)} alt="" loading="lazy" onError={() => setFallo(true)} className="h-full w-full object-cover" />
        <span className="absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
          <CarpetaSvg color={carpeta.color} className="w-5" />
        </span>
      </span>
    );
  }

  const emoji = carpeta.emoji?.trim();
  const opcion = !emoji && carpeta.icon && carpeta.icon !== "folder" ? FOLDER_ICON_OPTIONS.find((o) => o.key === carpeta.icon) : undefined;
  return (
    <span className={cn("relative inline-flex items-center justify-center", CAJA[tam], className)}>
      <CarpetaSvg color={carpeta.color} className="w-full" />
      {(emoji || opcion) && (
        // Sobre el frente de la carpeta (el 70 % de abajo), centrado.
        <span className="absolute inset-x-0 bottom-[8%] top-[32%] flex items-center justify-center leading-none">
          {emoji ? (
            <span className={EMOJI[tam]} aria-hidden>{emoji}</span>
          ) : opcion ? (
            <opcion.Icon className={cn(SELLO[tam], carpeta.color ? "text-white/90" : "text-black/45")} strokeWidth={2} aria-hidden />
          ) : null}
        </span>
      )}
    </span>
  );
}
