"use client";

/**
 * ImageWarningBadge — badge sutil que se muestra arriba de una imagen de
 * producto cuando NO cumple los requisitos del proyecto (ver image-validators).
 *
 * Estilo Holded: pill mini con icono y tooltip nativo title=. Sin sombras.
 * Severity:
 *   - "error":   badge rojo (data-error)   — JPG, sin imagen.
 *   - "warning": badge naranja (data-warn) — formato dudoso o sin transparencia.
 *
 * Uso:
 * ```tsx
 * <div className="relative">
 *   <Image src={p.image} ... />
 *   <ImageWarningBadge image={p.image} />
 * </div>
 * ```
 */

import { AlertCircle, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { validateImageUrl } from "@/lib/image-validators";

export default function ImageWarningBadge({
  image,
  className,
  size = "sm",
}: {
  image: string | null | undefined;
  className?: string;
  size?: "sm" | "md";
}) {
  const result = validateImageUrl(image);
  if (result.valid) return null;

  const Icon = result.severity === "error" ? AlertCircle : AlertTriangle;
  const isError = result.severity === "error";
  const sizeCls =
    size === "md"
      ? "h-5 w-5 [&>svg]:h-3 [&>svg]:w-3"
      : "h-4 w-4 [&>svg]:h-2.5 [&>svg]:w-2.5";

  return (
    <span
      title={result.reason ?? "Imagen no cumple requisitos"}
      aria-label={result.reason ?? "Imagen no cumple requisitos"}
      className={cn(
        "absolute top-0.5 right-0.5 inline-flex items-center justify-center rounded-full",
        "border border-white shadow-sm",
        isError
          ? "bg-[var(--data-error)] text-white"
          : "bg-[var(--data-warning)] text-white",
        sizeCls,
        className,
      )}
    >
      <Icon strokeWidth={2.5} aria-hidden />
    </span>
  );
}
