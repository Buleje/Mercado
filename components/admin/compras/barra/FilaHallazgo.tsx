"use client";

/**
 * Un resultado de «Buscar en Compras»: qué es, en qué va, lo vinculado (sus
 * recepciones, su cuenta, su orden), por qué apareció y sus siguientes pasos.
 * El primer paso es el que hace Enter.
 */
import { ClipboardList, CreditCard, PackageCheck, RotateCcw, Users, type LucideIcon } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { AccionHallazgo, Hallazgo, TipoHallazgo } from "@/lib/compras/buscar-compras";

export const ICONO_DE_TIPO: Record<TipoHallazgo, LucideIcon> = {
  orden: ClipboardList,
  proveedor: Users,
  cuenta: CreditCard,
  recepcion: PackageCheck,
  devolucion: RotateCcw,
};

export function FilaHallazgo({
  h,
  id,
  activo,
  onActivar,
  onAccion,
}: {
  h: Hallazgo;
  id: string;
  activo: boolean;
  onActivar: () => void;
  onAccion: (a: AccionHallazgo) => void;
}) {
  const Icono = ICONO_DE_TIPO[h.tipo];
  return (
    <li
      id={id}
      role="option"
      aria-selected={activo}
      onMouseEnter={onActivar}
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 transition-colors",
        activo ? "border-[var(--rule-strong)] bg-[var(--surface-sunken)]" : "border-[var(--rule-soft)] bg-[var(--surface-raised)]",
      )}
    >
      <Icono className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-[var(--text-primary)]">{h.titulo}</span>
          {h.exacto && (
            <span className="rounded-full bg-[var(--data-success-50)] px-2 py-0.5 text-xs font-semibold text-[var(--data-success-700)]">
              Coincide exacto
            </span>
          )}
        </div>
        <div className="text-sm text-[var(--text-secondary)]">{h.detalle}</div>
        {h.vinculos.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Lo vinculado">
            {h.vinculos.map((v) => (
              <li key={v} className="rounded-md bg-[var(--surface-sunken)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                {v}
              </li>
            ))}
          </ul>
        )}
        {h.motivo && !h.exacto && <div className="mt-1 truncate text-xs text-[var(--text-tertiary)]">Coincide en {h.motivo}</div>}
        {h.acciones.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {h.acciones.map((a, i) => (
              <button
                key={a.rotulo}
                type="button"
                onClick={() => onAccion(a)}
                tabIndex={activo ? 0 : -1}
                className={button({ variant: i === 0 ? "secondary" : "ghost", className: "rounded-xl" })}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
