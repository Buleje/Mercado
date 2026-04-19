"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Package, CheckCircle, Truck, MapPin, Phone,
  Clock, DollarSign, RefreshCw, Navigation, ChevronRight,
  AlertCircle,
} from "@buleje/design-system/icons";

// ── Types ──────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  orderId: string;
  status: string;
  fee: number;
  createdAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string | null;
  orderTotal: number;
  orderStatus: string;
  items: { name: string; quantity: number }[];
}

interface DriverData {
  partner: { id: string; name: string };
  stats: { todayDelivered: number; pending: number; todayEarnings: number };
  assignments: Assignment[];
}

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType; next?: string; nextLabel?: string }> = {
  assigned:   { label: "Asignado",  color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30",    icon: Clock,       next: "picked_up",  nextLabel: "Recogí el pedido" },
  picked_up:  { label: "Recogido",  color: "text-emerald-600",    bg: "bg-emerald-50 dark:bg-emerald-950/30",      icon: Package,     next: "in_transit", nextLabel: "Estoy en camino" },
  in_transit: { label: "En camino", color: "text-teal-600",    bg: "bg-teal-50 dark:bg-teal-950/30",      icon: Navigation,  next: "delivered",  nextLabel: "Entregué el pedido" },
  delivered:  { label: "Entregado", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: CheckCircle },
};

function getStatus(s: string) {
  return STATUS_CFG[s] ?? STATUS_CFG["assigned"];
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `hace ${hrs}h ${mins % 60}m`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DriverDashboardPage() {
  const params = useParams<{ partnerId: string }>();
  const partnerId = params.partnerId;

  const [data, setData] = useState<DriverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/delivery/driver/${partnerId}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Error al cargar datos");
        return;
      }
      const json = await res.json() as DriverData;
      setData(json);
      setError(null);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void fetchData();
    const timer = setInterval(fetchData, 30_000); // Poll every 30s
    return () => clearInterval(timer);
  }, [fetchData]);

  const updateStatus = async (assignmentId: string, newStatus: string) => {
    setUpdatingId(assignmentId);
    try {
      const res = await fetch(`/api/delivery/driver/${partnerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, status: newStatus }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch { /* silent */ }
    setUpdatingId(null);
  };

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 text-teal-500 animate-spin" />
          <p className="text-gray-500 font-medium">Cargando entregas…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
        <div className="max-w-sm w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">¡Ups!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{error ?? "No se encontró el repartidor"}</p>
          <button
            onClick={() => { setLoading(true); setError(null); fetchData(); }}
            className="mt-4 px-4 py-2 bg-teal-500 text-white rounded-xl text-sm font-semibold"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const active = data.assignments.filter((a) => a.status !== "delivered");
  const completed = data.assignments.filter((a) => a.status === "delivered");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="bg-linear-to-r from-teal-600 to-teal-500 text-white px-4 py-5 sticky top-0 z-10 shadow-lg">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Hola, {data.partner.name}</h1>
              <p className="text-teal-100 text-xs">Panel de entregas</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/15 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{data.stats.pending}</p>
              <p className="text-[length:var(--ts-2xs)] text-teal-100 uppercase tracking-wider">Pendientes</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{data.stats.todayDelivered}</p>
              <p className="text-[length:var(--ts-2xs)] text-teal-100 uppercase tracking-wider">Entregados hoy</p>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">S/{data.stats.todayEarnings.toFixed(0)}</p>
              <p className="text-[length:var(--ts-2xs)] text-teal-100 uppercase tracking-wider">Ganado hoy</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* ── Active deliveries ────────────────────────────── */}
        {active.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              Entregas activas ({active.length})
            </h2>
            <div className="space-y-3">
              {active.map((a) => {
                const cfg = getStatus(a.status);
                const Icon = cfg.icon;
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl shadow-sm overflow-hidden border ${
                      a.status === "assigned"
                        ? "border-amber-200 dark:border-amber-800"
                        : "border-gray-200 dark:border-gray-800"
                    } bg-white dark:bg-gray-900`}
                  >
                    {/* Status badge + order info */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </span>
                        <span className="text-[length:var(--ts-2xs)] text-gray-400">{timeAgo(a.createdAt)}</span>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {a.customerName}
                        </p>
                        {a.customerLocation && (
                          <div className="flex items-start gap-1.5 text-xs text-gray-500">
                            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" />
                            <span>{a.customerLocation}</span>
                          </div>
                        )}
                        <p className="text-xs text-gray-400">
                          {a.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-gray-500">
                          <DollarSign className="h-3.5 w-3.5" />
                          Total: S/{a.orderTotal.toFixed(2)}
                        </span>
                        <span className="font-bold text-teal-600">
                          Comisión: S/{a.fee.toFixed(2)}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {a.customerPhone && (
                          <a
                            href={`tel:${a.customerPhone}`}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            Llamar
                          </a>
                        )}
                        {a.customerLocation && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.customerLocation)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 text-xs font-semibold"
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            Mapa
                          </a>
                        )}
                        {cfg.next && (
                          <button
                            onClick={() => updateStatus(a.id, cfg.next!)}
                            disabled={updatingId === a.id}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                          >
                            {updatingId === a.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                {cfg.nextLabel}
                                <ChevronRight className="h-3.5 w-3.5" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {active.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">¡Todo al día!</h3>
            <p className="text-sm text-gray-400 mt-1">No tienes entregas pendientes</p>
          </div>
        )}

        {/* ── Completed deliveries ─────────────────────────── */}
        {completed.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
              Completadas ({completed.length})
            </h2>
            <div className="space-y-2">
              {completed.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3 flex items-center gap-3"
                >
                  <div className="h-8 w-8 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{a.customerName}</p>
                    <p className="text-xs text-gray-400">
                      {a.deliveredAt
                        ? new Date(a.deliveredAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">+S/{a.fee.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="text-center text-xs text-gray-400 pb-6">
          Se actualiza automáticamente cada 30 segundos
        </p>
      </div>
    </div>
  );
}
