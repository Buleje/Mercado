"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Printer,
  Package,
  CheckSquare,
  Square,
} from "lucide-react";
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Generador de Pick List
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Lista de productos a recoger para pedidos confirmados
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualizar
          </button>
          {generated && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-lg bg-[#00B4A6] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#009690] print:hidden"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 print:hidden">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-2xl font-bold text-[#00B4A6]">
            {loading ? "—" : orders.length}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Pedidos confirmados
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-2xl font-bold text-[#00B4A6]">{totalCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Productos a recoger
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-2xl font-bold text-emerald-600">
            {checkedCount}/{totalCount}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Recogidos</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#00B4A6]" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/30 dark:bg-red-900/10">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : !generated ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
          <Package className="h-12 w-12 text-gray-300 dark:text-gray-700" />
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {orders.length} pedidos confirmados listos
            </p>
            <p className="text-sm text-gray-400">
              Genera la pick list para ver que productos recoger
            </p>
          </div>
          <button
            onClick={generatePickList}
            disabled={orders.length === 0}
            className="rounded-lg bg-[#00B4A6] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#009690] disabled:opacity-50"
          >
            Generar Pick List
          </button>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 print:hidden">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Progreso de recogida
              </span>
              <span
                className={cn(
                  "font-semibold",
                  allDone ? "text-emerald-600" : "text-[#00B4A6]"
                )}
              >
                {checkedCount}/{totalCount}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  allDone ? "bg-emerald-500" : "bg-[#00B4A6]"
                )}
                style={{
                  width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%`,
                }}
              />
            </div>
            {allDone && (
              <p className="mt-2 text-center text-sm font-semibold text-emerald-600">
                Lista completa — todos los productos recogidos
              </p>
            )}
          </div>

          {/* Pick list */}
          <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            {/* Print header */}
            <div className="hidden border-b border-gray-100 p-4 print:block">
              <p className="text-lg font-bold">Buleje — Pick List</p>
              <p className="text-sm text-gray-500">
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
                    item.checked && "bg-emerald-50/50 dark:bg-emerald-900/5"
                  )}
                >
                  <button
                    onClick={() => toggleCheck(idx)}
                    className="mt-0.5 shrink-0 print:hidden"
                  >
                    {item.checked ? (
                      <CheckSquare className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                    )}
                  </button>
                  {/* Print checkbox */}
                  <div className="mt-0.5 hidden h-5 w-5 shrink-0 rounded border-2 border-gray-400 print:block" />

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "font-medium text-gray-900 dark:text-white",
                        item.checked && "line-through text-gray-400"
                      )}
                    >
                      {item.productName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Pedidos: {item.orderRefs.join(", ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-lg font-bold text-[#00B4A6]">
                      {item.totalQty}
                    </span>
                    <span className="ml-1 text-sm text-gray-500">
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
