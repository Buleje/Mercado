"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Truck, Package, MapPin, ExternalLink } from "@buleje/design-system/icons";
import { ErrorAlert, SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";

// Dropshipping (ADR-298) — lista de envíos al proveedor generados automáticamente
// cuando entra un pedido pagado en una tienda con dropshipEnabled.
//
// Plan «panel unificado», ola 3 (F20): vive en Compras › Dropship (`?tab=dropship`
// llega ahí por alias). Dentro de Compras no lleva título propio (`enCompras`).
// Muestra el NOMBRE del proveedor (antes, 8 letras de su id), el pedido es un
// enlace a su ficha, y si el servidor falla lo dice: antes un 500 se veía como
// «Todavía no hay envíos».

interface ItemSnapshot { productId: number | null; name: string; qty: number; unitCost: number; supplierSku: string | null; }
interface Fulfillment {
  id: string; orderId: string; supplierId: string | null; status: string;
  itemsJson: string; costTotal: string | number | null;
  shipName: string | null; shipPhone: string | null; shipLocation: string | null;
  trackingNumber: string | null; trackingUrl: string | null; createdAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]",
  forwarded: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  confirmed: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  shipped: "bg-[var(--data-info-50,var(--accent-soft))] text-[var(--data-info-500,var(--accent))]",
  delivered: "bg-[var(--data-success-50)] text-[var(--data-success-500)]",
  cancelled: "bg-[var(--data-error-50)] text-[var(--data-error-500)]",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", forwarded: "Enviado al proveedor", confirmed: "Confirmado",
  shipped: "Despachado", delivered: "Entregado", cancelled: "Cancelado",
};

/** El mensaje que trae la respuesta de error, o su código. */
async function motivoDeError(r: Response): Promise<string> {
  try {
    const j = (await r.json()) as { error?: unknown };
    if (typeof j?.error === "string" && j.error) return `${j.error} (HTTP ${r.status})`;
  } catch {
    // cuerpo sin JSON: queda el código
  }
  return `HTTP ${r.status}`;
}

/**
 * Nombre de cada proveedor por id (`GET /api/suppliers`). Es un adorno: si falla
 * (el cajero no lista proveedores) queda el id corto, como antes.
 */
function useNombresDeProveedores(): Map<string, string> {
  const [nombres, setNombres] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let vivo = true;
    fetch("/api/suppliers", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (!vivo || !d) return;
        const lista = (Array.isArray(d) ? d : ((d as { suppliers?: unknown[] }).suppliers ?? [])) as Array<{ id?: unknown; name?: unknown }>;
        const m = new Map<string, string>();
        for (const p of lista) if (typeof p.id === "string" && typeof p.name === "string") m.set(p.id, p.name);
        setNombres(m);
      })
      .catch((err: unknown) => console.warn("[dropship] proveedores sin nombre", err instanceof Error ? err.message : String(err)));
    return () => { vivo = false; };
  }, []);
  return nombres;
}

export default function DropshipModule({ enCompras = false }: { enCompras?: boolean } = {}) {
  const [rows, setRows] = useState<Fulfillment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nombres = useNombresDeProveedores();

  const cargar = useCallback(() => {
    setError(null);
    setRows(null);
    fetch("/api/admin/dropship", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await motivoDeError(r));
        return r.json();
      })
      .then((d: unknown) => setRows(Array.isArray(d) ? (d as Fulfillment[]) : []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

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
      {enCompras ? (
        <div className="flex items-center gap-1.5">
          <SectionTitle className="text-[var(--text-primary)]">Envíos de dropship</SectionTitle>
          <InfoTip
            title="Dropship"
            what={<span>Cuando se paga un pedido con productos dropship, se arma sola la orden al proveedor con la dirección del cliente, el costo y el tracking.</span>}
            affects={<span>El proveedor despacha directo al cliente: tú no tocas la mercadería.</span>}
          />
        </div>
      ) : (
        <AdminModuleHeader
          eyebrow="Abastecimiento · Dropshipping"
          title="Dropshipping"
          description="Envíos al proveedor generados automáticamente cuando se paga un pedido. El proveedor despacha directo al cliente."
          icon={Truck}
        />
      )}

      {error ? (
        <ErrorAlert
          title="No se pudieron traer los envíos al proveedor"
          description={error}
          action={
            <button type="button" onClick={cargar} className={button({ variant: "secondary" })}>
              Reintentar
            </button>
          }
        />
      ) : rows === null ? (
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
                      <EnlacePanel cosa="pedido" id={f.orderId} apariencia="heredada">Pedido #{f.orderId.slice(0, 8)}</EnlacePanel>
                      <span className="text-[var(--text-tertiary)] font-normal">
                        {" · "}
                        {f.supplierId ? (
                          <EnlacePanel cosa="proveedor" id={f.supplierId} apariencia="heredada">
                            {nombres.get(f.supplierId) ?? `proveedor ${f.supplierId.slice(0, 8)}`}
                          </EnlacePanel>
                        ) : (
                          "proveedor sin asignar"
                        )}
                      </span>
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
                      <span className="text-xs text-[var(--text-tertiary)]">costo {formatCurrency(Number(it.unitCost))}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                  <span>Costo al proveedor: <strong className="text-[var(--text-primary)]">{formatCurrency(Number(f.costTotal ?? 0))}</strong></span>
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
