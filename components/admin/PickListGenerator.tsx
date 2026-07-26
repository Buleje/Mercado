"use client";
import { LoadingState, SectionTitle } from "@buleje/design-system";
 

import { useState, useEffect } from "react";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Printer,
  Package,
  CheckSquare,
  Square,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type OrderItem = {
  productId?: number;
  name: string;
  quantity: number;
  unit?: string;
  price: number;
};

type Order = {
  id: string;
  status: string;
  items: OrderItem[];
  customerName?: string;
  total: number;
  createdAt: string;
};

type PickItem = {
  productName: string;
  totalQty: number;
  unit: string;
  orderRefs: string[]; // order IDs
  checked: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortId(id: string) {
  return `#${id.slice(-6).toUpperCase()}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PickListGenerator() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickItems, setPickItems] = useState<PickItem[]>([]);
  const [generated, setGenerated] = useState(false);

  const fetchOrders = () => {
    setLoading(true);
    setError("");
    setGenerated(false);
    fetch("/api/orders?status=confirmado&limit=100")
      .then((r) => r.json())
      .then((data) => {
        const list: Order[] = Array.isArray(data)
          ? data
          : (data.orders ?? data.data ?? []);
        setOrders(list);
      })
      .catch(() => setError("No se pudieron cargar los pedidos."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const generatePickList = () => {
    const map: Record<string, PickItem> = {};
    orders.forEach((order) => {
      (order.items ?? []).forEach((item) => {
        const key = item.name.toLowerCase().trim();
        if (!map[key]) {
          map[key] = {
            productName: item.name,
            totalQty: 0,
            unit: item.unit ?? "und",
            orderRefs: [],
            checked: false,
          };
        }
        map[key].totalQty += item.quantity;
        if (!map[key].orderRefs.includes(shortId(order.id))) {
          map[key].orderRefs.push(shortId(order.id));
        }
      });
    });
    const items = Object.values(map).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );
    setPickItems(items);
    setGenerated(true);
  };

  const toggleCheck = (idx: number) => {
    setPickItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const checkedCount = pickItems.filter((i) => i.checked).length;
  const totalCount = pickItems.length;
  const allDone = totalCount > 0 && checkedCount === totalCount;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Generador de Pick List
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Lista de productos a recoger para pedidos confirmados
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-gray-50 disabled:opacity-50 dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualizar
          </button>
          {generated && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark print:hidden"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 print:hidden">
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-2xl font-bold text-primary">
            {loading ? "—" : orders.length}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Pedidos confirmados
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-2xl font-bold text-primary">{totalCount}</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Productos a recoger
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-2xl font-bold text-[var(--data-success-500)]">
            {checkedCount}/{totalCount}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">Recogidos</p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 dark:border-[var(--data-error-500)]/30 dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        </div>
      ) : !generated ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--rule-base)] bg-white p-8 text-center dark:border-[var(--rule-base)] dark:bg-gray-900">
          <Package className="h-12 w-12 text-[var(--text-tertiary)] dark:text-[var(--text-primary)]" />
          <div>
            <p className="font-medium text-[var(--text-secondary)]">
              {orders.length} pedidos confirmados listos
            </p>
            <p className="text-sm text-[var(--text-tertiary)]">
              Genera la pick list para ver que productos recoger
            </p>
          </div>
          <button
            onClick={generatePickList}
            disabled={orders.length === 0}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            Generar Pick List
          </button>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900 print:hidden">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--text-secondary)]">
                Progreso de recogida
              </span>
              <span
                className={cn(
                  "font-semibold",
                  allDone ? "text-[var(--data-success-500)]" : "text-primary"
                )}
              >
                {checkedCount}/{totalCount}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={cn(
                  "h-full transition-all duration-[var(--dur-base)]",
                  allDone ? "bg-primary/10" : "bg-primary"
                )}
                style={{
                  width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%`,
                }}
              />
            </div>
            {allDone && (
              <p className="mt-2 text-center text-sm font-semibold text-[var(--data-success-500)]">
                Lista completa — todos los productos recogidos
              </p>
            )}
          </div>

          {/* Pick list */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
            {/* Print header */}
            <div className="hidden border-b border-[var(--rule-soft)] p-4 print:block">
              <p className="text-lg font-bold">Buleje — Pick List</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {new Date().toLocaleString("es-PE")} · {orders.length} pedidos
                · {totalCount} productos
              </p>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {pickItems.map((item, idx) => (
                <div
                  key={item.productName}
                  className={cn(
                    "flex items-start gap-3 p-4 transition",
                    item.checked && "bg-primary/10/50 dark:bg-primary/15"
                  )}
                >
                  <button
                    onClick={() => toggleCheck(idx)}
                    className="mt-0.5 shrink-0 print:hidden"
                  >
                    {item.checked ? (
                      <CheckSquare className="h-5 w-5 text-[var(--data-success-500)]" />
                    ) : (
                      <Square className="h-5 w-5 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
                    )}
                  </button>
                  {/* Print checkbox */}
                  <div className="mt-0.5 hidden h-5 w-5 shrink-0 rounded border-2 border-gray-400 print:block" />

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "font-medium text-[var(--text-primary)]",
                        item.checked && "line-through text-[var(--text-tertiary)]"
                      )}
                    >
                      {item.productName}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Pedidos: {item.orderRefs.join(", ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-lg font-bold text-primary">
                      {item.totalQty}
                    </span>
                    <span className="ml-1 text-sm text-[var(--text-secondary)]">
                      {item.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          [class*="print:hidden"] { display: none !important; }
        }
      `}</style>
    </div>
  );
}
