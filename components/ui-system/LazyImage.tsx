"use client";

/**
 * LazyImage — Image con blur-up placeholder + fade-in al cargar.
 *
 * Prefiere next/image para rutas internas. Este componente es para casos
 * donde necesitas control explicito: background images, CDN externo, etc.
 *
 * - IntersectionObserver: no descarga hasta estar cerca del viewport.
 * - Blur-up: si hay `placeholder`, lo muestra mientras carga.
 * - Fade-in smooth al terminar de cargar.
 * - Respeta reduced-motion.
 *
 * Uso:
 *   <LazyImage src={url} alt="Arroz" width={400} height={400} />
 */

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { cn } from "@/lib/utils";

interface Props extends Omit<ImageProps, "onLoad" | "placeholder"> {
  /** Placeholder de blur en base64 o color solido. Opcional */
  placeholder?: string;
  /** Distancia extra para prefetch. Default "200px" */
  rootMargin?: string;
  /** ClassName del wrapper */
  wrapperClassName?: string;
}

export default function LazyImage({
  src,
  alt,
  placeholder,
  rootMargin = "200px",
  wrapperClassName,
  className,
  ...rest
}: Props) {
  const { ref, isInView } = useIntersectionObserver<HTMLDivElement>({
    rootMargin,
    once: true,
  });
  const [loaded, setLoaded] = useState(false);

  return (
    <div ref={ref} className={cn("relative overflow-hidden", wrapperClassName)}>
      {/* Placeholder layer */}
      {!loaded && placeholder && (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center motion-safe:blur-md"
          style={{ backgroundImage: `url(${placeholder})` }}
        />
      )}
      {!loaded && !placeholder && (
        <div
          aria-hidden
          className="absolute inset-0 bg-[var(--surface-sunken)] motion-safe:animate-pulse"
        />
      )}
      {isInView && (
        <Image
          {...rest}
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={cn(
            "motion-safe:transition-opacity motion-safe:duration-500",
            loaded ? "opacity-100" : "opacity-0",
            className,
          )}
        />
      )}
    </div>
  );
}
