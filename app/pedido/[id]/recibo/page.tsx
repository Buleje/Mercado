"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

type Item = { name: string; price: number; quantity: number; unit: string };
type Order = {
  id: string;
  status: string;
  customerName: string;
  items: Item[];
  total: number;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: string;
};
type Settings = {
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

/**
 * HOTFIX-003: the public endpoint now requires ?phone=<customerPhone>. Try the
 * URL searchParams first, then fall back to bsm-last-order in localStorage.
 */
function resolveCustomerPhone(urlPhone: string | null): string | null {
  if (urlPhone) return urlPhone;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("bsm-last-order");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { customerPhone?: string };
    return parsed.customerPhone ?? null;
  } catch {
    return null;
  }
}

export default function ReciboPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const phone = resolveCustomerPhone(searchParams.get("phone"));
    const orderUrl = phone
      ? `/api/orders/${encodeURIComponent(id)}/public?phone=${encodeURIComponent(phone)}`
      : `/api/orders/${encodeURIComponent(id)}/public`;
    Promise.all([
      fetch(orderUrl).then((r) =>
        r.ok ? r.json() : Promise.reject("Pedido no encontrado")
      ),
      fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ])
      .then(([o, s]) => {
        setOrder(o);
        setSettings(s);
      })
      .catch((e) => setError(typeof e === "string" ? e : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [id, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3">
        <p className="text-gray-500 text-sm">{error || "No encontrado"}</p>
        <Link href="/" className="text-sm text-primary underline">
          Volver
        </Link>
      </div>
    );
  }

  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const biz = settings.businessName || "Buleje";

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Print controls — hidden on print */}
      <div className="print:hidden sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
        <Link
          href={`/pedido/${id}`}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al pedido
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </button>
      </div>

      {/* Receipt */}
      <div className="max-w-md mx-auto bg-white my-6 print:my-0 print:shadow-none shadow-lg rounded-lg print:rounded-none overflow-hidden">
        <div className="p-6 print:p-4">
          {/* Header */}
          <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
            <h1 className="text-lg font-bold text-gray-900">{biz}</h1>
            {settings.businessAddress && (
              <p className="text-xs text-gray-500 mt-0.5">
                {settings.businessAddress}
              </p>
            )}
            {settings.businessPhone && (
              <p className="text-xs text-gray-500">
                Tel: {settings.businessPhone}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2">COMPROBANTE DE PEDIDO</p>
          </div>

          {/* Order info */}
          <div className="grid grid-cols-2 gap-y-1 text-xs text-gray-600 mb-4">
            <span className="font-medium">Pedido:</span>
            <span className="text-right font-mono">
              #{order.id.slice(0, 8).toUpperCase()}
            </span>
            <span className="font-medium">Fecha:</span>
            <span className="text-right">{dateStr}</span>
            <span className="font-medium">Hora:</span>
            <span className="text-right">{timeStr}</span>
            <span className="font-medium">Cliente:</span>
            <span className="text-right">{order.customerName}</span>
            <span className="font-medium">Estado:</span>
            <span className="text-right">
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
            {order.paymentMethod && (
              <>
                <span className="font-medium">Pago:</span>
                <span className="text-right capitalize">
                  {order.paymentMethod}
                </span>
              </>
            )}
          </div>

          {/* Items table */}
          <table className="w-full text-xs mb-4">
            <thead>
              <tr className="border-t border-b border-gray-200 text-gray-500">
                <th className="text-left py-1.5 font-medium">Producto</th>
                <th className="text-center py-1.5 font-medium w-12">Cant.</th>
                <th className="text-right py-1.5 font-medium w-16">P.U.</th>
                <th className="text-right py-1.5 font-medium w-16">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5 text-gray-700">{item.name}</td>
                  <td className="py-1.5 text-center text-gray-600">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-1.5 text-right text-gray-600">
                    S/{item.price.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right font-medium text-gray-800">
                    S/{(item.price * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div className="border-t border-dashed border-gray-300 pt-3 flex justify-between items-center">
            <span className="text-sm font-bold text-gray-900">TOTAL</span>
            <span className="text-lg font-bold text-gray-900">
              S/{order.total.toFixed(2)}
            </span>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-600">
              <span className="font-medium">Nota:</span> {order.notes}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center border-t border-dashed border-gray-300 pt-4">
            <p className="text-xs text-gray-400">¡Gracias por tu compra!</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {biz} — Pucallpa, Perú
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
