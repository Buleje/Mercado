"use client";

/**
 * ImageValidationPanel — muestra warnings/errors de validateProductImage()
 * en formato editorial coherente con el panel admin.
 *
 * Usa iconos grises + copy Feynman. Sin emojis. Separa errores (bloquean
 * el upload) de warnings (permiten continuar).
 *
 * Uso:
 *   const result = await validateProductImage(file);
 *   <ImageValidationPanel result={result} />
 */

import { AlertTriangle, CheckCircle2, Info, XCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ImageValidationResult } from "@/lib/image-validator";

interface Props {
  result: ImageValidationResult;
  className?: string;
}

export function ImageValidationPanel({ result, className }: Props) {
  const { errors, warnings, meta, ok } = result;
  const allIssues = [...errors, ...warnings];

  if (ok && warnings.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2.5",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success)]" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Imagen cumple los requisitos
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {meta.width}×{meta.height} · {meta.sizeKB} KB · {metaBackgroundLabel(meta.estimatedBackground)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {allIssues.map((issue, i) => {
        const isError = issue.severity === "error";
        const Icon = isError ? XCircle : AlertTriangle;
        return (
          <div
            key={i}
            className={cn(
              "flex gap-2.5 rounded-lg border px-3 py-2.5",
              isError
                ? "border-[var(--data-error)] bg-[var(--data-error-50)]"
                : "border-[var(--data-warning)] bg-[var(--data-warning-50)]",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 mt-0.5",
                isError ? "text-[var(--data-error)]" : "text-[var(--data-warning)]",
              )}
              strokeWidth={1.75}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isError ? "text-[var(--data-error)]" : "text-[var(--data-warning)]",
                )}
              >
                {issue.message}
              </p>
              {issue.fix && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                  <span className="font-semibold">Cómo arreglarlo: </span>
                  {issue.fix}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* Meta informativa */}
      {(meta.width > 0 || meta.sizeKB > 0) && (
        <div className="flex items-center gap-2.5 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
          <Info className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="tabular-nums">
            {meta.width > 0 && `${meta.width}×${meta.height} px · `}
            {meta.sizeKB > 0 && `${meta.sizeKB} KB · `}
            {metaBackgroundLabel(meta.estimatedBackground)}
          </span>
        </div>
      )}
    </div>
  );
}

function metaBackgroundLabel(bg: ImageValidationResult["meta"]["estimatedBackground"]): string {
  switch (bg) {
    case "white":
      return "fondo blanco ✓";
    case "transparent":
      return "fondo transparente ✓";
    case "light":
      return "fondo claro (casi blanco)";
    case "colored":
      return "fondo con color — considerá cambiarlo";
    default:
      return "fondo no analizable";
  }
}

/**
 * ImageRequirementsGuide — panel informativo con los requisitos del estándar.
 * Se puede mostrar antes del upload para que el dueño sepa qué necesita.
 */
export function ImageRequirementsGuide({ className }: { className?: string }) {
  const items = [
    { label: "Formato", value: "JPG, PNG o WebP" },
    { label: "Peso máximo", value: "500 KB" },
    { label: "Resolución mínima", value: "800×800 px" },
    { label: "Resolución recomendada", value: "1500×1500 px" },
    { label: "Proporción", value: "Cuadrada (1:1)" },
    { label: "Fondo", value: "Blanco #FFFFFF o transparente" },
    { label: "Color space", value: "sRGB" },
  ];

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Info className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Requisitos de foto de producto
        </h3>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-2 text-xs">
            <dt className="text-[var(--text-tertiary)]">{item.label}</dt>
            <dd className="font-semibold text-[var(--text-primary)] text-right">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-[var(--text-tertiary)] leading-relaxed">
        Fotos que no cumplen se suben igual pero muestran advertencia. El
        catálogo del marketplace se ve más ordenado cuando todas siguen el
        mismo estándar.
      </p>
    </div>
  );
}
