"use client";

/**
 * SmartProductImage — wrapper alrededor de next/image que cae al placeholder
 * estándar cuando:
 *   - `src` es null/undefined/empty
 *   - O la imagen falla en cargar (404, dominio no whitelisteado, CORS, etc.)
 *
 * Reusado por todas las secciones del catálogo para tener un único lenguaje
 * visual cuando falta el material gráfico.
 */

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import ProductImagePlaceholder from "@/components/store/ProductImagePlaceholder";

interface SmartProductImageProps extends Omit<ImageProps, "src" | "alt" | "onError"> {
  src?: string | null;
  alt: string;
  /** Tamaño del icono del placeholder. */
  placeholderSize?: number;
  /** Si false, oculta el texto "Falta agregar imagen". */
  showPlaceholderLabel?: boolean;
}

export default function SmartProductImage({
  src,
  alt,
  placeholderSize = 28,
  showPlaceholderLabel = true,
  ...rest
}: SmartProductImageProps) {
  const [errored, setErrored] = useState(false);
  const hasValidSrc =
    typeof src === "string" && src.trim().length > 0 && !errored;

  if (!hasValidSrc) {
    return (
      <ProductImagePlaceholder
        size={placeholderSize}
        showLabel={showPlaceholderLabel}
      />
    );
  }

  return (
    <Image
      src={src as string}
      alt={alt}
      onError={() => setErrored(true)}
      {...rest}
    />
  );
}
