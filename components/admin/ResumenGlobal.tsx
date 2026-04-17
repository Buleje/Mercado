"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import {
  DollarSign, ShoppingCart, Package, AlertTriangle,
  Users, TrendingUp, Clock, CreditCard,
} from "lucide-react";

interface GlobalSummary {
  ventasHoy: number;
  pedidosPendientes: number;
  productosAgotados: number;
  clientesNuevos: number;
  fiadosPendientes: number;
  alertasStock: number;
  ticketPromedio: number;
  transaccionesHoy: number;
}

const INITIAL: GlobalSummary = {
  ventasHoy: 0, pedidosPendientes: 0, productosAgotados: 0,
  clientesNuevos: 0, fiadosPendientes: 0, alertasStock: 0,
  ticketPromedio: 0, transaccionesHoy: 0,
};

export default function ResumenGlobal({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [data, setData] = useState<GlobalSummary>(INITIAL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const [salesRes, prodRes, custRes] = await Promise.allSettled([
          fetch("/api/orders?status=pendiente").then(r => r.ok ? r.json() : null),
          fetch("/api/products?limit=500").then(r => r.ok ? r.json() : null),
          fetch("/api/customers?limit=500").then(r => r.ok ? r.json() : null),
        ]);

        const orders = salesRes.status === "fulfilled" && salesRes.value?.data ? salesRes.value.data : [];
        const products = prodRes.status === "fulfilled" && prodRes.value?.data ? prodRes.value.data : [];
        const customers = custRes.status === "fulfilled" && custRes.value?.data ? custRes.value.data : [];

        const today = new Date().toISOString().slice(0, 10);
        const todayOrders = orders.filter((o: { createdAt?: string }) => o.createdAt?.startsWith(today));
        const ventasHoy = todayOrders.reduce((s: number, o: { total?: number }) => s + (o.total ?? 0), 0);
        const pendientes = orders.filter((o: { status?: string }) => o.status === "pendiente").length;
        const agotados = products.filter((p: { stock?: number }) => (p.stock ?? 0) <= 0).length;
        const alertas = products.filter((p: { stock?: number; minStock?: number }) => (p.stock ?? 0) <= (p.minStock ?? 5) && (p.stock ?? 0) > 0).length;
        const thisMonth = new Date().toISOString().slice(0, 7);
        const nuevos = customers.filter((c: { createdAt?: string }) => c.createdAt?.startsWith(thisMonth)).length;

        setData({
          ventasHoy,
          pedidosPendientes: pendientes,
          productosAgotados: agotados,
          clientesNuevos: nuevos,
          fiadosPendientes: 0,
          alertasStock: alertas,
          ticketPromedio: todayOrders.length > 0 ? ventasHoy / todayOrders.length : 0,
          transaccionesHoy: todayOrders.length,
        });
      } catch { /* silent */ }
      setLoading(false);
    };
    fetchSummary();
  }, []);

  const cards = [
    { label: "Ventas hoy", value: formatCurrency(data.ventasHoy), icon: DollarSign, color: "#2563EB", alert: false, tab: "analytics-pro" },
    { label: "Transacciones", value: String(data.transaccionesHoy), icon: ShoppingCart, color: "#3b82f6", alert: false, tab: "analytics-pro" },
    { label: "Ticket promedio", value: formatCurrency(data.ticketPromedio), icon: TrendingUp, color: "#8b5cf6", alert: false, tab: "analytics-pro" },
    { label: "Pedidos pendientes", value: String(data.pedidosPendientes), icon: Clock, color: "#f59e0b", alert: data.pedidosPendientes > 3, tab: "pedidos" },
    { label: "Sin stock", value: String(data.productosAgotados), icon: Package, color: "#ef4444", alert: data.productosAgotados > 0, tab: "inventario" },
    { label: "Alertas stock", value: String(data.alertasStock), icon: AlertTriangle, color: "#f97316", alert: data.alertasStock > 5, tab: "inventario" },
    { label: "Clientes nuevos", value: String(data.clientesNuevos), icon: Users, color: "#06b6d4", alert: false, tab: "clientes" },
    { label: "Fiados pendientes", value: formatCurrency(data.fiadosPendientes), icon: CreditCard, color: "#e63946", alert: data.fiadosPendientes > 500, tab: "fiados" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Resumen del día</h2>
        <span className="text-[length:var(--ts-2xs)] text-gray-400 font-medium">
          {new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const isZero = c.value === "0" || c.value === "S/ 0.00";
          return (
            <button
              key={c.label}
              onClick={() => onNavigate?.(c.tab)}
              className={cn(
                "bg-white border rounded-xl p-3 sm:p-4 text-left transition-all hover:shadow-sm hover:scale-[1.01]",
                c.alert ? "border-red-200 bg-red-50/50" : "border-[var(--rule-base)]",
              )}
            >
              {loading ? (
                <div className="h-12 rounded bg-gray-200 animate-pulse" />
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ backgroundColor: `${c.color}15` }}>
                      <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                    </div>
                    {c.alert && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                  </div>
                  <p className={cn(
                    "text-xl font-extrabold font-mono",
                    isZero ? "text-gray-300" : "text-gray-900",
                  )}>
                    {c.value}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-500 font-medium mt-0.5">{c.label}</p>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
