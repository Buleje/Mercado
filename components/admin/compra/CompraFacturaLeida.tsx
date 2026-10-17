"use client";

import { CardTitle } from "@buleje/design-system";
import { FileText, X as XIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CompraPendienteFactura from "./CompraPendienteFactura";
import type { FacturaEscaneada } from "./use-factura-escaneada";
import type { CompraCatalogo } from "./use-compra-catalogo";

interface Props {
  factura: FacturaEscaneada;
  catalogo: CompraCatalogo;
  /** Total de la canasta (preview): se compara con el que dice la factura. */
  totalCanasta: number;
  onCrearProveedor: (prefill: { ruc?: string; name?: string }) => void;
}

/** Diferencia que ya no es redondeo: medio sol. */
const TOLERANCIA_SOLES = 0.5;
const TIPO: Record<string, string> = { factura: "Factura", boleta: "Boleta", guia: "Guía" };

/** Lo que leyó el escáner: comprobante, proveedor, cuadre del total y lo que no encontró. */
export default function CompraFacturaLeida({ factura, catalogo, totalCanasta, onCrearProveedor }: Props) {
  const { resumen, pendientes, creando, elegir, quitarPendiente, crearProducto, cerrar } = factura;
  if (!resumen) return null;
  const { proveedor, proveedorElegido, comprobante, fecha, total, agregados, renglones } = resumen;
  const diferencia = total > 0 ? totalCanasta - total : 0;
  const descuadre = Math.abs(diferencia) > TOLERANCIA_SOLES;
  const categorias = catalogo.categories.filter((c) => c !== "Todos");

  return (
    <section id="poc-factura" aria-label="Factura escaneada" className="mb-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 space-y-2">
      <div className="flex items-start gap-2">
        <FileText className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
              {comprobante?.tipo ? TIPO[comprobante.tipo] : "Comprobante"} {comprobante?.numero ?? ""}
            </CardTitle>
            <InfoTip
              title="Factura escaneada"
              what={<span>Los productos que se reconocieron ya están en la canasta con el precio de la factura como costo.</span>}
              affects={<span>Tipo y número del comprobante quedan en la orden.</span>}
              example={<span>Si un producto no aparece, elígelo de tu catálogo o créalo abajo.</span>}
            />
          </div>
          <p className="text-xs text-[var(--text-secondary)] break-words">
            {proveedor.nombre}
            {proveedor.ruc ? ` · RUC ${proveedor.ruc}` : ""}
            {fecha ? ` · ${fecha}` : ""}
            {" · "}
            {agregados} de {renglones} productos en la canasta
          </p>
          {total > 0 && (
            <p className={cn(
              "text-xs tabular-nums",
              descuadre ? "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]",
            )}>
              Total de la factura {formatCurrency(total)} · tu canasta {formatCurrency(totalCanasta)}
              {descuadre && ` (${diferencia > 0 ? "+" : "−"}${formatCurrency(Math.abs(diferencia))})`}
            </p>
          )}
          {!proveedorElegido && proveedor.nombre.trim() && (
            <button
              type="button"
              onClick={() => onCrearProveedor({ ruc: proveedor.ruc, name: proveedor.nombre })}
              className="mt-1 text-xs font-semibold text-primary hover:underline"
            >
              No está en tu lista: crear proveedor «{proveedor.nombre}»
            </button>
          )}
        </div>
        <button type="button" onClick={cerrar} aria-label="Cerrar resumen de la factura" className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <XIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {pendientes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {pendientes.length === 1 ? "1 producto no encontrado" : `${pendientes.length} productos no encontrados`}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {pendientes.map((p) => (
              <CompraPendienteFactura
                key={p.id}
                pendiente={p}
                products={catalogo.products}
                categorias={categorias}
                creando={creando.includes(p.id)}
                onElegir={(productId) => elegir(p.id, productId)}
                onCrear={(datos) => void crearProducto(p.id, datos)}
                onQuitar={() => quitarPendiente(p.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
