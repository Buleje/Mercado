"use client";

import { AlertCircle, ChevronDown, ChevronUp, Loader2, Package, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DIAS_LIMITE_RESPUESTA, ESTADO_LABEL, ESTADO_LABEL_SIGUIENTE, ESTADO_SIGUIENTE, ESTADO_STYLES,
  diasEsperando, soles, valorDevolucion, type Devolucion,
} from "./tipos";

interface Props {
  dev: Devolucion;
  abierta: boolean;
  ocupada: boolean;
  onAlternar: () => void;
  onAvanzar: () => void;
  onEliminar: () => void;
}

/** Una devolución: la acción del estado a la vista (48 px) y el resto en «⋯». */
export function FilaDevolucion({ dev, abierta, ocupada, onAlternar, onAvanzar, onEliminar }: Props) {
  const { total } = valorDevolucion(dev.items);
  const dias = diasEsperando(dev);
  const vencida = dias > DIAS_LIMITE_RESPUESTA;
  const resumen = dev.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join(" · ");
  const acciones: MenuAccion[] = [
    { id: "eliminar", label: "Eliminar registro", hint: "Definitivo; si ya había sacado stock, lo devuelve", icon: Trash2, tone: "danger", onSelect: onEliminar, disabled: ocupada },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              <EnlacePanel cosa="proveedor" id={dev.proveedorId} apariencia="heredada">{dev.proveedorNombre}</EnlacePanel>
            </span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-sm font-bold", ESTADO_STYLES[dev.estado])}>{ESTADO_LABEL[dev.estado]}</span>
            {dev.estado === "ENVIADA" && (
              <span className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-sm font-bold",
                vencida ? "bg-[var(--data-error-100)] text-[var(--data-error-ink)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
              )}>
                {vencida && <AlertCircle className="h-3 w-3" aria-hidden />}
                {dias === 0 ? "enviada hoy" : `esperando hace ${dias} ${dias === 1 ? "día" : "días"}`}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-[var(--text-secondary)]">
            <span>{formatDate(dev.createdAt)}</span>
            <span className="truncate" title={`${dev.motivo} — ${resumen}`}>{dev.motivo}</span>
            <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" aria-hidden />{dev.items.length} {dev.items.length === 1 ? "item" : "items"}</span>
            {total > 0 && <span className="font-bold tabular-nums text-[var(--text-primary)]">{soles(total)}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ESTADO_SIGUIENTE[dev.estado] && (
            <button type="button" onClick={onAvanzar} disabled={ocupada} className={button({ variant: "secondary", className: "gap-1 whitespace-nowrap" })}>
              {ocupada && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {ESTADO_LABEL_SIGUIENTE[dev.estado]}
            </button>
          )}
          <button type="button" onClick={onAlternar} aria-expanded={abierta} aria-label={abierta ? "Ocultar detalle" : "Ver detalle"} className="flex h-12 w-12 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]">
            {abierta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <ActionMenu label="Más acciones" actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Eliminar registro" />
        </div>
      </div>

      {abierta && (
        <div className="space-y-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium text-[var(--text-secondary)]">Motivo</p>
              <p className="text-sm text-[var(--text-primary)]">{dev.motivo}</p>
            </div>
            {dev.notas && (
              <div>
                <p className="mb-1 text-sm font-medium text-[var(--text-secondary)]">Notas</p>
                <p className="text-sm text-[var(--text-secondary)]">{dev.notas}</p>
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Items devueltos</p>
            <div className="space-y-1">
              {dev.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Package className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  <span className="flex-1 text-[var(--text-primary)]">
                    {/* Sin productId el ítem es texto libre (ADR-379): no hay ficha a la que ir. */}
                    <EnlacePanel cosa="producto" id={item.productId != null ? String(item.productId) : null} apariencia="heredada">{item.nombre}</EnlacePanel>
                  </span>
                  <span className="font-medium tabular-nums text-[var(--text-primary)]">{item.cantidad} {item.unidad}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
