"use client";
/**
 * La barra de «cambios sin guardar» de Tienda online (Apariencia y Redes y
 * medición), con el aspecto de la de Configuración (`settings/BarraCambios`,
 * commit 5d6ec9cf2): aparece SÓLO si tocaste algo y se queda pegada abajo
 * mientras recorres el formulario. Aquella nombra las secciones de Ajustes por
 * su tipo; ésta recibe el texto ya armado («3 cambios sin guardar»).
 *
 * Reemplaza al botón «Guardar cambios» de ancho completo y 56 px que iba al
 * pie de Apariencia y a la barra «Guardar canales» de Redes, siempre a la vista.
 */
import { CircleDot, Save, Undo2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";

export function BarraSinGuardar({
  texto,
  guardando,
  error,
  onGuardar,
  onDescartar,
}: {
  /** null = no hay cambios: la barra no se dibuja. */
  texto: string | null;
  guardando: boolean;
  error?: string | null;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  if (!texto) return null;
  return (
    <div
      role="region"
      aria-label="Cambios sin guardar"
      className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] p-2 pl-4 shadow-[var(--shadow-lg)]"
    >
      <p className="flex min-w-0 flex-1 basis-full items-center gap-2 text-sm font-semibold text-[var(--text-primary)] sm:basis-auto" aria-live="polite">
        <CircleDot className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
        <span className="min-w-0">{texto}</span>
        {error && <span className="min-w-0 text-[var(--data-error-ink)]">· {error}</span>}
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button type="button" onClick={onDescartar} disabled={guardando} className={button({ variant: "ghost" })}>
          <Undo2 className="h-4 w-4" aria-hidden /> Descartar
        </button>
        <button type="button" onClick={onGuardar} disabled={guardando} className={button({ variant: "primary" })}>
          {guardando ? <LoadingSpinner size={16} /> : <Save className="h-4 w-4" aria-hidden />}
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
