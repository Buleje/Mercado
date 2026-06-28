"use client";

import { useState, useEffect, useMemo } from "react";
import { Truck, Package, MapPin, ExternalLink } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// Dropshipping (ADR-298) — lista de envíos al proveedor generados automáticamente
// cuando entra un pedido pagado en una tienda con dropshipEnabled.

interface ItemSnapshot { productId: number | null; name: string; qty: number; unitCost: number; supplierSku: string | null; }
interface Fulfillment {
  id: string; orderId: string; supplierId: string | null; status: string;
  itemsJson: string; costTotal: string | number | null;
  shipName: string | null; shipPhone: string | null; shipLocation: string | null;
  trackingNumber: string | null; trackingUrl: string | null; createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]",
  forwarded: "bg-[var(--accent-soft)] text-[var(--accent)]",
  confirmed: "bg-[var(--accent-soft)] text-[var(--accent)]",
  shipped: "bg-[var(--data-info-50,var(--accent-soft))] text-[var(--data-info-500,var(--accent))]",
  delivered: "bg-[var(--data-success-50)] text-[var(--data-success-500)]",
  cancelled: "bg-[var(--data-error-50)] text-[var(--data-error-500)]",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", forwarded: "Enviado al proveedor", confirmed: "Confirmado",
  shipped: "Despachado", delivered: "Entregado", cancelled: "Cancelado",
};

export default function DropshipModule() {
  const [rows, setRows] = useState<Fulfillment[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/dropship", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, []);

  // Parsea itemsJson una sola vez por carga de datos (no en cada render).
  const parsedRows = useMemo(
    () =>
      (rows ?? []).map((f) => {
        let items: ItemSnapshot[] = [];
        try { items = JSON.parse(f.itemsJson); } catch { items = []; }
        return { ...f, items };
      }),
    [rows],
  );

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        eyebrow="Abastecimiento · Dropshipping"
        title="Dropshipping"
        description="Envíos al proveedor generados automáticamente cuando se paga un pedido. El proveedor despacha directo al cliente."
        icon={Truck}
      />

      {rows === null ? (
        <S />
      ) : rows.length === 0 ? (
        <ChartsEmptyState
          icon={Truck}
          title="Todavía no hay envíos a proveedor"
          description="Cuando se confirme un pedido con productos marcados como dropship, vas a ver acá la orden al proveedor con la dirección del cliente, el costo y el tracking."
        />
      ) : (
        <div className="space-y-3">
          {parsedRows.map((f) => {
            const items = f.items;
            return (
              <div key={f.id} className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      Pedido #{f.orderId.slice(0, 8)}
                      <span className="text-[var(--text-tertiary)] font-normal"> · proveedor {f.supplierId ? f.supplierId.slice(0, 8) : "sin asignar"}</span>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {f.shipName ?? "Cliente"}{f.shipPhone ? ` · ${f.shipPhone}` : ""}{f.shipLocation ? ` · ${f.shipLocation}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[f.status] ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                    {STATUS_LABEL[f.status] ?? f.status}
                  </span>
                </div>
                <ul className="space-y-1 mb-2">
                  {items.map((it, i) => (
                    <li key={i} className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
                      <span className="flex-1 truncate">{it.qty}× {it.name}{it.supplierSku ? ` (SKU ${it.supplierSku})` : ""}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">costo S/ {Number(it.unitCost).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                  <span>Costo al proveedor: <strong className="text-[var(--text-primary)]">S/ {Number(f.costTotal ?? 0).toFixed(2)}</strong></span>
                  {f.trackingUrl ? (
                    <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                      Tracking {f.trackingNumber ?? ""} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : f.trackingNumber ? (
                    <span>Tracking: {f.trackingNumber}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
