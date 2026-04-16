'use client';

import { useState, useEffect } from "react";
import { X, Sun, TrendingUp, ShoppingCart, Package, AlertTriangle, Loader2 } from "lucide-react";

type SummaryData = {
  ventasAyer: number;
  pedidosPendientes: number;
  stockBajo: number;
  fiadosVencidos: number;
  sugerencia: string;
};

const DIAS = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const SUGERENCIAS: Record<number, string> = {
  0: "Domingo — revisa stock para la semana",
  1: "Lunes — planifica las compras de la semana",
  2: "Martes — revisa pagos pendientes de fiados",
  3: "Miercoles — verifica productos por vencer",
  4: "Jueves — actualiza precios si hay cambios del proveedor",
  5: "Viernes — prepara ofertas de fin de semana",
  6: "Sabado — revisa el desempeno de la semana",
};

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

export default function MorningSummaryModal() {
  const [show, setShow] = useState(false);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Don't show to SuperAdmin when impersonating a tenant — it blocks the UI unexpectedly
    try { if (localStorage.getItem("superadmin-impersonate-tenant")) return; } catch { /* silent */ }

    const now = new Date();
    const hour = now.getHours();

    // Only show before 12pm (extended from 9am for more flexibility)
    if (hour >= 12) return;

    const dateKey = `morning-summary-${now.toISOString().slice(0, 10)}`;
    try {
      if (localStorage.getItem(dateKey) === "shown") return;
    } catch { return; }

    // Fetch summary data
    setLoading(true);
    Promise.all([
      fetch("/api/admin/stats").then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([stats]) => {
        const dayOfWeek = now.getDay();
        setData({
          ventasAyer: stats?.salesYesterday ?? stats?.totalRevenue ?? 0,
          pedidosPendientes: stats?.pendingOrders ?? 0,
          stockBajo: stats?.lowStockCount ?? 0,
          fiadosVencidos: stats?.overdueDebts ?? 0,
          sugerencia: SUGERENCIAS[dayOfWeek] ?? "Revisa tu negocio",
        });
        setShow(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleClose = () => {
    setShow(false);
    try {
      const dateKey = `morning-summary-${new Date().toISOString().slice(0, 10)}`;
      localStorage.setItem(dateKey, "shown");
    } catch { /* silent */ }
  };

  if (!show || !data) return null;

  const now = new Date();
  const dayName = DIAS[now.getDay()];

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-white dark:bg-card rounded-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-amber-400 via-orange-400 to-yellow-300 p-6 text-white">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3">
            <Sun className="h-10 w-10 drop-shadow-md" />
            <div>
              <h2 className="text-xl font-black">Buenos dias!</h2>
              <p className="text-white/80 text-sm font-medium">{dayName} — Resumen de ayer</p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="p-6 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Ventas ayer</span>
                  </div>
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(data.ventasAyer)}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Pedidos pendientes</span>
                  </div>
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{data.pedidosPendientes}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Stock bajo</span>
                  </div>
                  <p className="text-lg font-black text-amber-700 dark:text-amber-300">{data.stockBajo} productos</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">Fiados vencidos</span>
                  </div>
                  <p className="text-lg font-black text-red-700 dark:text-red-300">{data.fiadosVencidos}</p>
                </div>
              </div>

              {/* Suggestion */}
              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/10">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Tarea sugerida</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Hoy es {dayName.toLowerCase()} — {data.sugerencia.split(" — ")[1] || data.sugerencia}
                </p>
              </div>

              <button
                onClick={handleClose}
                className="w-full flex items-center justify-center gap-2 bg-[#00B4A6] text-white rounded-lg px-5 py-3 font-bold hover:bg-[#009690] transition-all"
              >
                <Sun className="h-4 w-4" />
                Comenzar el dia
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
