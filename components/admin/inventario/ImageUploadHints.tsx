"use client";

/**
 * ImageUploadHints — guia visual para el admin antes de subir/pegar una
 * imagen de producto. Muestra los requisitos que mejoran la experiencia
 * en el marketplace + ejemplos visuales OK / NO.
 *
 * Estilo Holded: minimal, tokens, sin sombras. Caja inline arriba del input.
 */

import { Check, X, ImageIcon, Info } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const HINTS = [
  { ok: true, text: "PNG con fondo transparente o WebP con alpha" },
  { ok: true, text: "Producto centrado, ocupa ~80% del cuadro" },
  { ok: true, text: "Cuadrado 800x800 px (recomendado)" },
  { ok: true, text: "Máximo 200 KB" },
  { ok: false, text: "JPG/JPEG (no soporta transparencia)" },
  { ok: false, text: "Fondos blancos, gradientes, o fotos con sombras" },
];

export default function ImageUploadHints({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
        <p className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">
          Requisitos de imagen
        </p>
      </div>

      <ul className="space-y-1.5">
        {HINTS.map((h, i) => {
          const Icon = h.ok ? Check : X;
          const colorCls = h.ok
            ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            : "bg-[var(--data-error-50)] text-[var(--data-error-500)]";
          return (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  colorCls,
                )}
              >
                <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </span>
              <span className={cn(h.ok ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]")}>
                {h.text}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 pt-2 border-t border-[var(--rule-soft)] text-xs text-[var(--text-tertiary)]">
        <ImageIcon className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        <span>
          Imagenes que no cumplen aparecen marcadas con <strong className="text-[var(--data-warning-500)]">badge naranja</strong> en el listado.
        </span>
      </div>
    </div>
  );
}
