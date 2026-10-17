"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import type { DbSupplier } from "@/lib/jsondb";
import { cn, limaDateKey } from "@/lib/utils";
import { cicloDeOrden } from "@/lib/compras/ciclo-oc";
import { formatCurrency } from "@/lib/format";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { STATUS_LABELS, STATUS_COLORS, TONO_TEXTO, diaDeOrden, esAutomatica, type OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";
import OcDetalleOrden from "@/components/admin/ordenes-compra/OcDetalleOrden";
import OcAccionesOrden from "@/components/admin/ordenes-compra/OcAccionesOrden";

/** Columnas de la tabla (la fila del detalle las abarca todas). */
export const COLUMNAS_OC = 5;

/** Un clic en un control de la fila (Recibir, ⋯, el enlace al proveedor o el menú en su portal) no abre el detalle. */
const esControl = (e: MouseEvent | KeyboardEvent) =>
  e.target instanceof Element && e.target.closest("button, a, input, select, [role=menu]") !== null;

/**
 * Una orden como FILA de la tabla (10-10): proveedor completo con lo que lleva,
 * día, total, estado en pastilla y «Recibir» + «⋯». Antes era una tarjeta de
 * ~250 px con el proveedor cortado («Frigori…») y una barra de pasos
 * Borr./Env./Conf./Rec. que no existen: una orden pendiente se leía «Borrador» y
 * una parcial «Enviada». Clic en la fila: el detalle debajo (y `?oc=` en la URL).
 */
export default function OcFilaOrden({ oc, o, supplier, isExpanded }: { oc: OrdenesCompra; o: OrdenOC; supplier: DbSupplier | undefined; isExpanded: boolean }) {
  const { setExpanded } = oc;
  const alternar = () => setExpanded(isExpanded ? null : o.id);
  const productos = `${o.items.length} producto${o.items.length === 1 ? "" : "s"}`;
  /* La nota del reabastecimiento («Auto-generado por sistema…») ocupaba la línea entera: dice «Automática». */
  const nota = esAutomatica(o) ? "Automática" : o.notes || null;
  const linea = [productos, supplier?.ruc ? `RUC ${supplier.ruc}` : null, o.invoiceNumber ? `Fact. ${o.invoiceNumber}` : null, nota]
    .filter(Boolean)
    .join(" · ");
  /* C10: el estado solo no dice qué sigue (una «Recibida» puede deber plata; una pendiente, estar atrasada). */
  const { siguiente } = cicloDeOrden(o, o.seguimiento, limaDateKey());
  return (
    <>
      <tr
        id={`oc-${o.id}`}
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`Orden de ${o.supplierName} por ${formatCurrency(Number(o.total))}, ${STATUS_LABELS[o.status]}`}
        onClick={(e) => { if (!esControl(e)) alternar(); }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); }
        }}
        className={cn(
          "scroll-mt-24 cursor-pointer",
          isExpanded && "bg-[var(--surface-sunken)]",
        )}
      >
        {/* Desde 640 px la columna del proveedor toma lo que sobra y CORTA con «…» (ancho 100 % + tope 0):
            antes la línea pedía 448 px fijos y la tabla medía 1.082 px en un marco de 962 a 1280. */}
        <td className="sm:w-full sm:max-w-0">
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--text-primary)]" title={o.supplierName}>
              <EnlacePanel cosa="proveedor" id={o.supplierId} apariencia="heredada">{o.supplierName}</EnlacePanel>
            </p>
            <p className="truncate text-sm text-[var(--text-secondary)]" title={o.notes ? `${linea}\n${o.notes}` : linea}>{linea}</p>
          </div>
        </td>
        <td className="whitespace-nowrap text-[var(--text-secondary)]">{diaDeOrden(o.createdAt)}</td>
        <td className="num whitespace-nowrap font-bold tabular-nums">{formatCurrency(Number(o.total))}</td>
        <td>
          <span
            data-testid="estado-oc"
            data-estado={o.status}
            className={cn("inline-flex items-center whitespace-nowrap rounded-lg border px-2 py-1 text-sm font-semibold", STATUS_COLORS[o.status])}
          >
            {STATUS_LABELS[o.status]}
          </span>
          {siguiente.accion && (
            <p data-testid="sigue-oc" className={cn("mt-1 max-w-[14rem] truncate text-sm font-semibold", TONO_TEXTO[siguiente.tono])} title={`Sigue: ${siguiente.texto}`}>
              Sigue: {siguiente.texto}
            </p>
          )}
        </td>
        <td>
          <OcAccionesOrden oc={oc} o={o} supplier={supplier} abierta={isExpanded} />
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={COLUMNAS_OC} className="p-0!">
            <OcDetalleOrden oc={oc} o={o} />
          </td>
        </tr>
      )}
    </>
  );
}
