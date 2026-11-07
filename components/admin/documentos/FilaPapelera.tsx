"use client";

import { Trash2, RotateCcw } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { cn } from "@/lib/utils";
import { formatBytes, getFileIcon } from "./archivo-visual";
import { textoRetencion } from "@/lib/documents/papelera-retencion";

/** "hoy", "ayer" o "hace N días" — cuánto le queda de vida al archivo. */
function borradoHace(iso: string | null): string {
  if (!iso) return "";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "borrado hoy";
  if (dias === 1) return "borrado ayer";
  if (dias < 30) return `borrado hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `borrado hace ${meses} mes${meses > 1 ? "es" : ""}`;
}

/**
 * Una fila: qué es, cuánto pesa y cuándo se va. Las dos acciones son íconos de
 * 48 px con su nombre en `aria-label`/`title`: con 50 archivos borrados, dos
 * botones con texto por fila eran 100 botones gritando lo mismo.
 */
export function FilaPapelera({
  doc: d,
  marcado,
  ocupado,
  onAlternar,
  onRestore,
  onPurge,
}: {
  doc: DbDocument;
  marcado: boolean;
  ocupado: boolean;
  onAlternar: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const { Icon, tint, bg } = getFileIcon(d.mimeType, d.name);
  const plazo = textoRetencion(d.deletedAt);
  return (
    <li className={cn("flex items-center gap-3 px-4 py-2 transition-colors", marcado && "bg-primary/5")}>
      <input
        type="checkbox"
        checked={marcado}
        onChange={onAlternar}
        className="h-4 w-4 shrink-0 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
        aria-label={`Elegir ${d.name}`}
      />
      <span className={cn("hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}>
        <Icon className={cn("h-4 w-4", tint)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm text-[var(--text-primary)] truncate" title={d.name}>{d.name}</div>
        {/* Una cifra por dato: el «se borra solo en N días» ya dice cuánto
            lleva; la fecha del borrado queda en el title. */}
        <div className="truncate text-xs text-[var(--text-tertiary)] tabular-nums" title={borradoHace(d.deletedAt)}>
          {formatBytes(d.size)}
          {d.category ? ` · ${d.category}` : ""}
          {plazo && (
            <span
              className={cn(
                "font-bold",
                plazo.urgente ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]",
              )}
            >
              {" "}· {plazo.texto}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onRestore}
        disabled={ocupado}
        aria-label={`Restaurar ${d.name}`}
        title="Restaurar"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <RotateCcw className="h-5 w-5" />
      </button>
      <button
        onClick={onPurge}
        disabled={ocupado}
        aria-label={`Eliminar ${d.name} definitivamente`}
        title="Eliminar definitivamente"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)] hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </li>
  );
}
