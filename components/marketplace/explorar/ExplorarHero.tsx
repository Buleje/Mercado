"use client";

/**
 * ExplorarHero — banner full-width estilo Amazon Bazaar.
 *
 * Slot para imagen promocional grande (sin texto sobreimpreso por defecto).
 * Cuando no hay imagen configurada (state inicial), muestra un placeholder
 * minimal con icono y un hint discreto al admin.
 *
 * Diseño:
 *   - Aspect-ratio amplio (4:1 desktop, 16:9 mobile).
 *   - Border-radius lg, sin texto encima (la imagen lo trae).
 *   - Click → navega al endpoint de promo (configurable).
 */

import Link from "next/link";
import { ImageIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface ExplorarHeroProps {
  /** URL de la imagen del banner (si vacio, muestra placeholder). */
  imageUrl?: string | null;
  /** Alt text accesible. */
  alt?: string;
  /** Link de destino al click. */
  href?: string;
}

export default function ExplorarHero({
  imageUrl = null,
  alt = "Banner promocional",
  href = "/marketplace/ofertas",
}: ExplorarHeroProps) {
  const hasImage = Boolean(imageUrl);

  return (
    <section
      aria-label="Banner promocional"
      className="w-full pt-4 sm:pt-6"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href={href}
          className={cn(
            "block relative overflow-hidden rounded-2xl",
            "aspect-[16/9] sm:aspect-[3/1] lg:aspect-[4/1]",
            hasImage
              ? "bg-[var(--surface-sunken)]"
              : "bg-gradient-to-br from-[var(--accent-soft)] via-[var(--surface-sunken)] to-[var(--accent-soft)] border border-dashed border-[var(--accent)]/30",
          )}
        >
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl!}
              alt={alt}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--accent)]">
              <ImageIcon className="h-12 w-12 sm:h-16 sm:w-16" strokeWidth={1.25} aria-hidden />
              <p className="text-[length:var(--ts-sm)] font-semibold">
                Aquí va tu imagen del banner promocional
              </p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] max-w-md text-center px-4">
                Configurá una imagen 1600×400 desde el panel admin para llamar la atención.
              </p>
            </div>
          )}
        </Link>
      </div>
    </section>
  );
}
