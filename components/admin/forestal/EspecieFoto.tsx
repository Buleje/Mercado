"use client";

/**
 * La miniatura de referencia de una especie, para pegar al lado del nombre.
 *
 * Se degrada sola: sin foto cargada no dibuja nada (no un placeholder gris que
 * ocupe lugar en cada fila de una tabla de 500 ingresos). El `title` lleva la
 * nota de la foto, que es su procedencia.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { fotoDe, type FotoEspecie } from "@/lib/forestal/especies-fotos";

export default function EspecieFoto({
  especie,
  indice,
  size = 28,
  className,
}: {
  especie: string | null | undefined;
  indice: Map<string, FotoEspecie>;
  size?: number;
  className?: string;
}) {
  const [rota, setRota] = useState(false);
  const foto = fotoDe(indice, especie);
  if (!foto || rota) return null;
  return (
    // Imagen de storage propio con tamaño fijo y sin optimizar: `next/image`
    // exigiría configurar el host del bucket por tenant y acá son miniaturas de
    // 28 px que ya vienen redimensionadas por /api/upload.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={foto.url}
      alt={`Foto de referencia de ${foto.nombre}`}
      title={[foto.nombre, foto.cientifico, foto.nota].filter(Boolean).join(" · ")}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setRota(true)}
      className={cn("shrink-0 rounded-md border border-[var(--rule-base)] object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
