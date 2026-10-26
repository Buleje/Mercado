"use client";

/**
 * Las listas de trozas de la guía preliminar (Brandon 25-10: «1 guía puede tener
 * varias listas de trozas»). Cada una con la misma región que la GTF: «12» con
 * Pasco se guarda como «19-000012». Una fila vacía no se manda.
 */

import { Plus, Trash2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { MAX_LT_POR_GUIA, numeroConRegion } from "@/lib/forestal/loth-plan-preliminares";
import { cn } from "@/lib/utils";
import { I } from "./ctp-shared";

export default function LothPlanPreliminarLts({
  lts,
  region,
  onCambiar,
  onAgregar,
  onQuitar,
}: {
  lts: string[];
  /** Código del departamento elegido, o `""` sin región. */
  region: string;
  onCambiar: (i: number, valor: string) => void;
  onAgregar: () => void;
  onQuitar: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      {lts.map((lt, i) => {
        const final = numeroConRegion(lt, region);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                className={cn(I, "min-w-0 flex-1")}
                value={lt}
                onChange={(e) => onCambiar(i, e.target.value)}
                placeholder={region ? String(12 + i) : `19-0000${12 + i}`}
                inputMode={region ? "numeric" : undefined}
                aria-label={`N.º de la LT ${i + 1}`}
                data-testid="preliminar-lt"
              />
              {lts.length > 1 && (
                <button
                  type="button"
                  onClick={() => onQuitar(i)}
                  aria-label={`Quitar la LT ${i + 1}`}
                  title="Quitar esta lista"
                  className={button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" })}
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              )}
            </div>
            {final && final !== lt.trim() && <p className="text-xs text-[var(--text-secondary)]">Se guarda como {final}</p>}
          </div>
        );
      })}
      {lts.length < MAX_LT_POR_GUIA && (
        <button
          type="button"
          onClick={onAgregar}
          data-testid="preliminar-lt-agregar"
          className={button({ variant: "ghost", size: "sm", className: "gap-1.5 rounded-xl" })}
        >
          <Plus className="h-4 w-4" aria-hidden /> Agregar otra LT
        </button>
      )}
    </div>
  );
}
