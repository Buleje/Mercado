"use client";

import { AlertCircle, Ban, ChevronDown, ChevronUp, Coins, Loader2, MessageSquare, Package, Warehouse } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DetalleDevolucion } from "./DetalleDevolucion";
import {
  DIAS_LIMITE_RESPUESTA, ESTADO_LABEL, ESTADO_LABEL_SIGUIENTE, ESTADO_SIGUIENTE, ESTADO_STYLES,
  diasEsperando, etiquetaValor, stockFuera, type Devolucion,
} from "./tipos";

interface Props {
  dev: Devolucion;
  abierta: boolean;
  ocupada: boolean;
  onAlternar: () => void;
  onAvanzar: () => void;
  onAnular: () => void;
  onReingresar: () => void;
  onValorar: () => void;
  onMensaje: () => void;
}

const CHIP = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-sm font-bold";

/** Una devolución: la acción del estado a la vista (48 px) y el resto en «⋯». */
export function FilaDevolucion({ dev, abierta, ocupada, onAlternar, onAvanzar, onAnular, onReingresar, onValorar, onMensaje }: Props) {
  const valor = etiquetaValor(dev.items);
  const anulada = dev.estado === "ANULADA";
  const fuera = stockFuera(dev);
  const dias = diasEsperando(dev);
  const vencida = dias > DIAS_LIMITE_RESPUESTA;
  const resumen = dev.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join(" · ");
  const acciones: MenuAccion[] = [
    { id: "mensaje", label: "Preparar mensaje", hint: "Para el proveedor: lo revisas y lo mandas tú", icon: MessageSquare, onSelect: onMensaje, disabled: anulada },
    ...(valor.sinPrecio > 0 && !anulada
      ? [{ id: "valorar", label: "Poner costo", hint: `${valor.sinPrecio === 1 ? "1 ítem" : `${valor.sinPrecio} ítems`} sin costo: no se sabe cuánto reclamar`, icon: Coins, onSelect: onValorar, disabled: ocupada }]
      : []),
    {
      id: "anular", label: "Anular…", icon: Ban, tone: "danger", onSelect: onAnular, disabled: ocupada || anulada,
      hint: anulada ? "Ya está anulada" : "Queda el registro con el motivo; no se borra",
    },
  ];

  return (
    <div className={cn("overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]", anulada && "bg-[var(--surface-sunken)]/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <div className="min-w-0 flex-1 basis-60">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("truncate text-sm font-semibold", anulada ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]")}>
              <EnlacePanel cosa="proveedor" id={dev.proveedorId} apariencia="heredada">{dev.proveedorNombre}</EnlacePanel>
            </span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-sm font-bold", ESTADO_STYLES[dev.estado])}>{ESTADO_LABEL[dev.estado]}</span>
            {dev.estado === "ENVIADA" && (
              <span className={cn(CHIP, vencida ? "bg-[var(--data-error-100)] text-[var(--data-error-ink)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
                {vencida && <AlertCircle className="h-3 w-3" aria-hidden />}
                {dias === 0 ? "enviada hoy" : `esperando hace ${dias} ${dias === 1 ? "día" : "días"}`}
              </span>
            )}
            {fuera && (
              <span className={cn(CHIP, "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]")}>
                <AlertCircle className="h-3 w-3" aria-hidden />
                Mercadería fuera del almacén
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-[var(--text-secondary)]">
            <span>{formatDate(dev.createdAt)}</span>
            <span className="truncate" title={`${dev.motivo} — ${resumen}`}>{dev.motivo}</span>
            <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" aria-hidden />{dev.items.length} {dev.items.length === 1 ? "item" : "items"}</span>
            {/* C51: sin costo no es «S/ 0»; con costo parcial se dice cuántos faltan. */}
            {valor.pendiente ? (
              <span className={cn(CHIP, "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)]")}>Pendiente de valoración</span>
            ) : (
              <span className={cn("font-bold tabular-nums", anulada ? "text-[var(--text-secondary)] line-through" : "text-[var(--text-primary)]")}>
                {valor.texto}
                {valor.sinPrecio > 0 && <span className="ml-1 font-semibold text-[var(--data-warning-ink)] no-underline">+{valor.sinPrecio} sin valorar</span>}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ESTADO_SIGUIENTE[dev.estado] && (
            <button type="button" onClick={onAvanzar} disabled={ocupada} className={button({ variant: "secondary", className: "gap-1 whitespace-nowrap" })}>
              {ocupada && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {ESTADO_LABEL_SIGUIENTE[dev.estado]}
            </button>
          )}
          {fuera && (
            <button type="button" onClick={onReingresar} disabled={ocupada} className={button({ variant: "secondary", className: "gap-1 whitespace-nowrap" })}>
              {ocupada ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Warehouse className="h-4 w-4" aria-hidden />}
              Volvió al almacén
            </button>
          )}
          <button type="button" onClick={onAlternar} aria-expanded={abierta} aria-label={abierta ? "Ocultar detalle" : "Ver detalle"} className="flex h-12 w-12 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]">
            {abierta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <div className="shrink-0">
            <ActionMenu label="Más acciones" actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Preparar mensaje, poner costo o anular" />
          </div>
        </div>
      </div>

      {abierta && <DetalleDevolucion dev={dev} />}
    </div>
  );
}
