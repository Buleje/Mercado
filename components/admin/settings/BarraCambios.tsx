"use client";

/**
 * La barra de «cambios sin guardar» de Configuración (Shopify y Loyverse la
 * usan así): aparece sólo cuando tocaste algo, se queda pegada abajo mientras
 * te mueves por el formulario y dice en qué secciones hay cambios. Reemplaza
 * al botón «Guardar cambios» de ancho completo que cada sección tenía al final
 * (una fila entera aunque no hubieras cambiado nada).
 */
import { button } from "@/components/ui-system/button-variants";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { CircleDot, Save, Undo2 } from "@buleje/design-system/icons";
import { TABS } from "./secciones";
import type { SeccionConGuardar } from "./use-cambios-ajustes";

export function BarraCambios({ secciones, guardando, onGuardar, onDescartar }: {
  secciones: readonly SeccionConGuardar[];
  guardando: boolean;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  if (secciones.length === 0) return null;
  const nombres = secciones.map((id) => TABS.find((t) => t.id === id)?.label ?? id);
  return (
    <div
      role="region"
      aria-label="Cambios sin guardar"
      className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] p-2 pl-4 shadow-[var(--shadow-lg)]"
    >
      {/* En el celular el texto va en su fila y los botones debajo, a la derecha. */}
      <p className="flex min-w-0 flex-1 basis-full items-center gap-2 text-sm font-semibold text-[var(--text-primary)] sm:basis-auto" aria-live="polite">
        <CircleDot className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
        <span className="min-w-0">Cambios sin guardar en {nombres.join(" y ")}</span>
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
