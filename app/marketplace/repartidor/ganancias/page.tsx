"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Truck,
  DollarSign,
  Star,
  Package,
  Calendar,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Assignment {
  id: string;
  orderId: string;
  status: string;
  fee: number;
  deliveredAt: string | null;
  createdAt: string;
  order?: { customerName: string; total: number };
}

interface DriverStats {
  partner: { id: string; name: string; rating: number; zone: string; vehicleType: string };
  assignments: Assignment[];
  totals: { earned: number; pending: number; deliveries: number; avgFee: number };
}

export default function GananciasRepartidorPage() {
  const searchParams = useSearchParams();
  const partnerId = searchParams.get("id") ?? "";

  const [data, setData] = useState<DriverStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"hoy" | "semana" | "mes">("semana");

  const fetchData = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/delivery/driver/${partnerId}/earnings?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [partnerId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!partnerId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Truck className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">Enlace inválido.</p>
          <Link href="/marketplace" className="text-primary text-sm hover:underline mt-2 inline-block">
            Ir al marketplace
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Truck className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-500">No se encontraron datos. Verifica tu enlace.</p>
        </div>
      </div>
    );
  }

  const { partner, assignments, totals } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary px-4 pb-10 pt-8 text-white">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{partner.name}</h1>
              <p className="text-sm text-white/80">{partner.zone} · {partner.vehicleType}</p>
            </div>
            <div className="ml-auto flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">
              <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
              <span className="text-sm font-bold">{partner.rating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mx-auto max-w-lg px-4 -mt-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" /> Ganado
            </div>
            <p className="text-xl font-bold text-gray-900">S/ {totals.earned.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Package className="h-3.5 w-3.5" /> Entregas
            </div>
            <p className="text-xl font-bold text-gray-900">{totals.deliveries}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Promedio
            </div>
            <p className="text-xl font-bold text-gray-900">S/ {totals.avgFee.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-amber-500 text-xs mb-1">
              <Calendar className="h-3.5 w-3.5" /> Pendiente
            </div>
            <p className="text-xl font-bold text-amber-600">S/ {totals.pending.toFixed(2)}</p>
          </div>
        </div>

        {/* Period Selector */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {(["hoy", "semana", "mes"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                period === p
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              )}
            >
              {p === "hoy" ? "Hoy" : p === "semana" ? "Esta semana" : "Este mes"}
            </button>
          ))}
        </div>

        {/* Assignments List */}
        <div className="mt-6 space-y-2 pb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Historial de entregas
          </h3>
          {assignments.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">No hay entregas en este período.</p>
          ) : (
            assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white p-4 border border-gray-100 shadow-sm">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  a.status === "delivered" ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
                )}>
                  <Package className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {a.order?.customerName || `Pedido #${a.orderId.slice(-6)}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    {a.deliveredAt
                      ? new Date(a.deliveredAt).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                      : a.status === "assigned" ? "Pendiente" : "En camino"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">S/ {Number(a.fee).toFixed(2)}</p>
                  <p className={cn("text-xs font-medium", a.status === "delivered" ? "text-green-600" : "text-amber-500")}>
                    {a.status === "delivered" ? "Pagado" : "Pendiente"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Back */}
        <div className="pb-8 text-center">
          <Link href="/marketplace" className="text-sm text-primary hover:underline">
            ← Volver al marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
