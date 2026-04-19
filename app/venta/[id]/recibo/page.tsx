"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, ArrowLeft, Loader2 } from "@buleje/design-system/icons";
import Link from "next/link";

type Item = { name: string; price: number; quantity: number; unit: string };
type Sale = {
  id: string;
  items: Item[];
  total: number;
  payment: string;
  amountPaid: number;
  change: number;
  createdAt: string;
};
type Settings = {
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
};

const PAY_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
};

export default function ReciboPOSPage() {
  const { id } = useParams<{ id: string }>();
  const [sale, setSale] = useState<Sale | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/sales/${encodeURIComponent(id)}`).then((r) =>
        r.ok ? r.json() : Promise.reject("Venta no encontrada")
      ),
      fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ])
      .then(([s, cfg]) => {
        setSale(s);
        setSettings(cfg);
      })
      .catch((e) => setError(typeof e === "string" ? e : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-3">
        <p className="text-gray-500 text-sm">{error || "No encontrada"}</p>
        <Link href="/admin" className="text-sm text-primary underline">
          Volver al admin
        </Link>
      </div>
    );
  }

  const date = new Date(sale.createdAt);
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
      {/* Barra de acciones — oculta al imprimir */}
      <div className="print:hidden sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
        <Link
          href="/admin"
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al POS
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Printer className="h-4 w-4" /> Imprimir ticket
        </button>
      </div>

      {/* Ticket */}
      <div className="max-w-sm mx-auto bg-white my-6 print:my-0 print:shadow-none shadow-lg rounded-lg print:rounded-none overflow-hidden">
        <div className="p-5 print:p-3">
          {/* Encabezado */}
          <div className="text-center border-b border-dashed border-gray-300 pb-3 mb-3">
            <h1 className="text-base font-bold text-gray-900">{biz}</h1>
            {settings.businessAddress && (
              <p className="text-[length:var(--ts-2xs)] text-gray-500 mt-0.5">
                {settings.businessAddress}
              </p>
            )}
            {settings.businessPhone && (
              <p className="text-[length:var(--ts-2xs)] text-gray-500">
                Tel: {settings.businessPhone}
              </p>
            )}
            <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-1.5">
              TICKET DE VENTA
            </p>
          </div>

          {/* Info de la venta */}
          <div className="grid grid-cols-2 gap-y-0.5 text-[length:var(--ts-2xs)] text-gray-600 mb-3">
            <span>Ticket:</span>
            <span className="text-right font-mono">
              #{sale.id.slice(0, 12).toUpperCase()}
            </span>
            <span>Fecha:</span>
            <span className="text-right">{dateStr}</span>
            <span>Hora:</span>
            <span className="text-right">{timeStr}</span>
            <span>Pago:</span>
            <span className="text-right capitalize">
              {PAY_LABELS[sale.payment] ?? sale.payment}
            </span>
          </div>

          {/* Tabla de items */}
          <table className="w-full text-[length:var(--ts-2xs)] mb-3">
            <thead>
              <tr className="border-t border-b border-gray-200 text-gray-500">
                <th className="text-left py-1 font-medium">Producto</th>
                <th className="text-center py-1 font-medium w-8">Cant</th>
                <th className="text-right py-1 font-medium w-14">P.U.</th>
                <th className="text-right py-1 font-medium w-14">Subt.</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 text-gray-700">{item.name}</td>
                  <td className="py-1 text-center text-gray-600">
                    {item.quantity}
                  </td>
                  <td className="py-1 text-right text-gray-600">
                    {item.price.toFixed(2)}
                  </td>
                  <td className="py-1 text-right font-medium text-gray-800">
                    {(item.price * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales */}
          <div className="border-t border-dashed border-gray-300 pt-2 space-y-0.5 text-xs">
            <div className="flex justify-between font-bold text-gray-900">
              <span>TOTAL</span>
              <span>S/{sale.total.toFixed(2)}</span>
            </div>
            {sale.payment === "efectivo" && (
              <>
                <div className="flex justify-between text-gray-600">
                  <span>Pagó con</span>
                  <span>S/{sale.amountPaid.toFixed(2)}</span>
                </div>
                {sale.change > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Vuelto</span>
                    <span>S/{sale.change.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pie */}
          <div className="mt-4 text-center border-t border-dashed border-gray-300 pt-3">
            <p className="text-[length:var(--ts-2xs)] text-gray-400">
              ¡Gracias por su compra!
            </p>
            <p className="text-[length:var(--ts-2xs)] text-gray-400 mt-0.5">
              {biz} — Pucallpa, Perú
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
