"use client";

/**
 * POSProductImage — la foto del producto, o algo decente en su lugar.
 *
 * En el catálogo real 52 de 57 productos tienen `image` cargada… apuntando a un
 * dominio externo que no responde (URLs que quedaron del seed). El `p.image ||
 * "/placeholder.svg"` sólo cubría el campo VACÍO, no el 404: con la URL rota,
 * `next/image` cae al `alt` y la grilla del POS mostraba el nombre del producto
 * en texto crudo sobre un rectángulo gris, en 22 de las 24 tarjetas visibles.
 *
 * Un mostrador se opera mirando: si no hay foto, es mejor una ficha legible con
 * la inicial y un color estable que un párrafo de texto desbordado.
 */

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Color estable derivado del nombre: el mismo producto siempre se ve igual. */
function tonoDe(nombre: string): { fondo: string; texto: string } {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) % 360;
  return {
    fondo: `oklch(0.93 0.045 ${h})`,
    texto: `oklch(0.42 0.11 ${h})`,
  };
}

/** Hasta dos iniciales: «Arroz Costeño Extra» → «AC». */
function iniciales(nombre: string): string {
  const palabras = nombre
    .split(/\s+/)
    .filter((p) => p.length > 2 && !/^\d/.test(p))
    .slice(0, 2);
  const txt = palabras.map((p) => p[0]).join("");
  return (txt || nombre.slice(0, 2)).toUpperCase();
}

export default function POSProductImage({
  src,
  name,
  className,
  sizes = "(max-width:768px) 25vw, 160px",
  priority = false,
}: {
  src?: string | null;
  name: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [fallo, setFallo] = useState(false);
  const usarFoto = !!src && !fallo;

  if (usarFoto) {
    return (
      <Image
        src={src as string}
        alt={name}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className={cn("object-cover", className)}
        onError={() => setFallo(true)}
      />
    );
  }

  const { fondo, texto } = tonoDe(name);
  return (
    <div
      className={cn("absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-1.5 text-center", className)}
      style={{ background: fondo }}
      // El nombre ya está escrito debajo de la tarjeta: acá sería redundante
      // para un lector de pantalla.
      aria-hidden="true"
    >
      <span className="font-black leading-none" style={{ color: texto, fontSize: "clamp(1.1rem, 2.6vw, 1.9rem)" }}>
        {iniciales(name)}
      </span>
      <span className="line-clamp-2 text-[length:var(--ts-2xs,0.6875rem)] font-semibold leading-tight opacity-70" style={{ color: texto }}>
        {name}
      </span>
    </div>
  );
}
