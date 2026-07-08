"use client";

// SupplierTimeline — historial combinado de Órdenes de Compra + Devoluciones
// de un proveedor, en un solo timeline cronológico (evita saltar de tab).
// Consume SOLO endpoints existentes (/api/purchases y /api/supplier-returns),
// sin backend nuevo.

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/admin/shared/EmptyState";
import { Package, Undo2, Loader2, AlertCircle, RotateCw } from "@buleje/design-system/icons";

type PurchaseStatus = "pendiente" | "recibido" | "parcial" | "cancelado" | "auto_generated";
type ReturnEstado = "PENDIENTE" | "ENVIADA" | "RESUELTA";

type PurchaseOrder = {
  id: string;
  supplierId: string;
  total: number;
  status: PurchaseStatus;
  createdAt: string;
};

type SupplierReturn = {
  id: string;
  proveedorId?: string | null;
  motivo: string;
  estado: ReturnEstado;
  createdAt: string;
  items: Array<{ nombre: string; cantidad: number; unidad: string }>;
};

type TimelineEntry =
  | { kind: "purchase"; id: string; date: string; total: number; status: PurchaseStatus }
  | { kind: "return"; id: string; date: string; motivo: string; estado: ReturnEstado; itemsCount: number };

interface SupplierTimelineProps {
  supplierId: string;
  supplierName?: string;
}

const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  pendiente: "Pendiente",
  recibido: "Recibido",
  parcial: "Parcial",
  cancelado: "Cancelado",
  auto_generated: "Auto-generada",
};

const PURCHASE_STATUS_COLOR: Record<PurchaseStatus, string> = {
  pendiente: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]",
  recibido: "bg-[var(--accent-soft)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]",
  parcial: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]",
  cancelado: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]",
  auto_generated: "bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

const RETURN_ESTADO_COLOR: Record<ReturnEstado, string> = {
  PENDIENTE: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]",
  ENVIADA: "bg-[var(--accent-soft)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]",
  RESUELTA: "bg-[var(--accent-soft)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]",
};

// Fecha absoluta es-PE + relativa ("hace 2 días") sin depender de date-fns.
function formatFecha(iso: string): { absoluta: string; relativa: string } {
  const date = new Date(iso);
  const absoluta = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(date);
  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  let relativa: string;
  if (Math.abs(diffDays) >= 1) {
    relativa = rtf.format(diffDays, "day");
  } else {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    relativa = diffHours === 0 ? "hace instantes" : rtf.format(diffHours, "hour");
  }
  return { absoluta, relativa };
}

function TimelineSkeleton() {
  return (
    <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)] dark:text-muted">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      <span className="text-sm">Cargando historial...</span>
    </div>
  );
}

export default function SupplierTimeline({ supplierId, supplierName }: SupplierTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de loading/error al cambiar supplierId/reloadKey
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const [purchasesRes, returnsRes] = await Promise.all([
          fetch(`/api/purchases?supplierId=${encodeURIComponent(supplierId)}`, { signal: controller.signal }),
          fetch(`/api/supplier-returns?proveedorId=${encodeURIComponent(supplierId)}`, { signal: controller.signal }),
        ]);

        if (!purchasesRes.ok || !returnsRes.ok) {
          setError(true);
          setEntries(null);
          return;
        }

        const [purchases, returns]: [PurchaseOrder[], SupplierReturn[]] = await Promise.all([
          purchasesRes.json(),
          returnsRes.json(),
        ]);

        // El endpoint no filtra server-side por proveedor: filtramos acá.
        const purchaseEntries: TimelineEntry[] = purchases
          .filter((p) => p.supplierId === supplierId)
          .map((p) => ({ kind: "purchase", id: p.id, date: p.createdAt, total: p.total, status: p.status }));

        const returnEntries: TimelineEntry[] = returns
          .filter((r) => r.proveedorId === supplierId)
          .map((r) => ({
            kind: "return",
            id: r.id,
            date: r.createdAt,
            motivo: r.motivo,
            estado: r.estado,
            itemsCount: r.items?.length ?? 0,
          }));

        const merged = [...purchaseEntries, ...returnEntries].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
        setEntries(merged);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn("[SupplierTimeline] fetch failed:", err);
        setError(true);
        setEntries(null);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [supplierId, reloadKey]);

  if (loading) return <TimelineSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <AlertCircle className="h-6 w-6 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted">No se pudo cargar el historial{supplierName ? ` de ${supplierName}` : ""}.</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
        >
          <RotateCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Sin movimientos"
        description="Sin movimientos con este proveedor todavía."
        className="py-6"
      />
    );
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const { absoluta, relativa } = formatFecha(entry.date);
        const isPurchase = entry.kind === "purchase";
        const Icon = isPurchase ? Package : Undo2;
        return (
          <li
            key={`${entry.kind}-${entry.id}`}
            className="flex items-start gap-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] p-3"
          >
            <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {isPurchase ? "Orden de compra" : "Devolución"}
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                    isPurchase ? PURCHASE_STATUS_COLOR[entry.status] : RETURN_ESTADO_COLOR[entry.estado],
                  )}
                >
                  {isPurchase ? PURCHASE_STATUS_LABEL[entry.status] : entry.estado}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">
                {isPurchase
                  ? `Total S/ ${Number(entry.total).toFixed(2)}`
                  : `${entry.motivo} · ${entry.itemsCount} item${entry.itemsCount !== 1 ? "s" : ""}`}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1" title={absoluta}>
                {relativa} · {absoluta}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
