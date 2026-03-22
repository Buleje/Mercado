"use client";

import { useState, useMemo, useEffect, startTransition } from "react";
import { MapPin, Clock, Navigation, ChevronDown, ChevronUp, Download, RefreshCw, Users } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Zone = { id: string; name: string; color: string; deliveryFee: number; estimatedMin: number; neighborhoods: string[] };
type Route = { id: string; name: string; zone: string; rider: string; stops: number; status: "en-ruta" | "completada" | "pendiente" | "cancelada"; estimatedTime: number; actualTime: number | null; startTime: string | null; customerName?: string; customerPhone?: string; riderName?: string };

const FALLBACK_ZONES: Zone[] = [
  { id: "z-1", name: "Zona Centro", color: "bg-blue-500", deliveryFee: 3, estimatedMin: 20, neighborhoods: ["Jr. Progreso", "Jr. Inmaculada", "Plaza de Armas", "Mercado Central"] },
  { id: "z-2", name: "Zona Norte", color: "bg-emerald-500", deliveryFee: 5, estimatedMin: 35, neighborhoods: ["Yarinacocha", "San Juan", "Manantay", "Nueva Requena"] },
  { id: "z-3", name: "Zona Sur", color: "bg-amber-500", deliveryFee: 4, estimatedMin: 30, neighborhoods: ["Campo Verde", "Puírto Callao", "Masisea", "Iparia"] },
  { id: "z-4", name: "Zona Este", color: "bg-violet-500", deliveryFee: 6, estimatedMin: 45, neighborhoods: ["Contamana", "Padre Abad", "Von Humboldt"] },
];

const STATUS_LABELS: Record<string, string> = { "en-ruta": "En Ruta", completada: "Completada", pendiente: "Pendiente", cancelada: "Cancelada" };
const STATUS_COLORS: Record<string, string> = { "en-ruta": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", completada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", cancelada: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };

function fmtDate(iso: string) { return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }); }
function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

export default function DeliveryRoutesTab() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [zones, setZones] = useState<Zone[]>(FALLBACK_ZONES);
  const [loadingData, setLoadingData] = useState(true);
  const [view, setView] = useState<"routes" | "zones">("routes");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const [riders, setRiders] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [assignedRiders, setAssignedRiders] = useState<Record<string, string>>({});
  const [filterRider, setFilterRider] = useState<string>("all");

  const loadRoutes = () => {
    fetch("/api/admin/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then((data: { orders?: Array<{ id: string; status: string; createdAt: string; updatedAt?: string; riderName?: string; customer?: { name?: string; phone?: string; location?: string } }> } | null) => {
        if (!data?.orders) return;
        // Show the last 7 days of orders
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        const recentOrders = data.orders.filter(o => new Date(o.createdAt) >= cutoff);
        const mapped: Route[] = recentOrders.map(o => ({
          id: o.id,
          name: "Pedido #" + o.id.slice(-4).toUpperCase(),
          zone: o.customer?.location ?? "Sin zona",
          rider: "Repartidor",
          stops: 1,
          status: o.status === "en_camino" ? "en-ruta"
            : o.status === "entregado" ? "completada"
            : o.status === "cancelado" ? "cancelada"
            : "pendiente",
          estimatedTime: 30,
          actualTime: null,
          startTime: o.updatedAt ?? o.createdAt,
          customerName: o.customer?.name,
          customerPhone: o.customer?.phone,
          riderName: o.riderName,
        }));
        startTransition(() => {
          setRoutes(mapped);
          setZones(FALLBACK_ZONES);
          setLoadingData(false);
        });
      })
      .catch(() => startTransition(() => { setZones(FALLBACK_ZONES); setLoadingData(false); }));
  };

  useEffect(() => {
    loadRoutes();
    fetch("/api/admin-users").then(r => r.ok ? r.json() : []).then((users: Array<{ id: string; name: string; role: string; active: boolean }>) => {
      setRiders(users.filter(u => u.active));
    }).catch(() => {});
    fetch("/api/admin/delivery-zones").then(r => r.ok ? r.json() : null).then((data: Zone[] | null) => {
      if (data && data.length > 0) startTransition(() => setZones(data));
    }).catch(() => {});
  }, []);

  const updateRouteStatus = (routeId: string, newStatus: Route["status"]) => {
    // Optimistic update
    startTransition(() => {
      setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, status: newStatus } : r));
    });
    // Map our status to the Order status enum
    const orderStatus = newStatus === "en-ruta" ? "en_camino"
      : newStatus === "completada" ? "entregado"
      : newStatus === "cancelada" ? "cancelado"
      : "confirmado";
    fetch(`/api/orders/${routeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: orderStatus, ...(assignedRiders[routeId] ? { riderName: assignedRiders[routeId] } : {}) }),
    }).catch(() => {});
  };

  const effectiveRider = (r: Route) => assignedRiders[r.id] || r.riderName || null;
  const filtered = useMemo(() => {
    let result = filterStatus === "all" ? routes : routes.filter(r => r.status === filterStatus);
    if (filterRider !== "all") result = result.filter(r => (assignedRiders[r.id] || r.riderName || null) === filterRider);
    return result;
  }, [routes, filterStatus, filterRider, assignedRiders]);
  const activeRoutes = routes.filter(r => r.status === "en-ruta").length;
  const completedToday = routes.filter(r => r.status === "completada").length;
  const totalStops = routes.reduce((s, r) => s + r.stops, 0);
  // Build per-rider KPI: unique assigned riders from current routes
  const riderKpis = useMemo(() => {
    const map = new Map<string, { total: number; completadas: number }>();
    for (const r of routes) {
      const name = assignedRiders[r.id] || r.riderName || null;
      if (!name) continue;
      const entry = map.get(name) ?? { total: 0, completadas: 0 };
      entry.total++;
      if (r.status === "completada") entry.completadas++;
      map.set(name, entry);
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 4);
  }, [routes, assignedRiders]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><MapPin className="h-6 w-6 text-primary" /> Rutas de Delivery</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión de zonas, rutas y asignación de repartidores</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setLoadingData(true); loadRoutes(); }} disabled={loadingData} title="Actualizar rutas" className="p-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-500 hover:text-primary disabled:opacity-40 transition-colors"><RefreshCw className={cn("h-4 w-4", loadingData && "animate-spin")} /></button>
          <button onClick={() => setView("routes")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "routes" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Rutas</button>
          <button onClick={() => setView("zones")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "zones" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Zonas</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Rutas activas", value: activeRoutes, color: "text-blue-500" },
          { label: "Completadas hoy", value: completedToday, color: "text-emerald-500" },
          { label: "Paradas totales", value: totalStops, color: "text-violet-500" },
          { label: "% Entregadas", value: `${routes.length ? Math.round(completedToday / routes.length * 100) : 0}%`, color: "text-emerald-600" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* KPI por repartidor */}
      {riderKpis.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {riderKpis.map(rk => (
            <button key={rk.name} onClick={() => setFilterRider(prev => prev === rk.name ? "all" : rk.name)} className={cn("text-left bg-white dark:bg-card rounded-xl border p-3 transition-all", filterRider === rk.name ? "border-primary ring-1 ring-primary" : "border-gray-200 dark:border-card-border hover:border-primary/50")}>
              <div className="flex items-center gap-1.5 mb-1">
                <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <p className="text-xs font-bold text-gray-800 dark:text-foreground truncate">{rk.name}</p>
              </div>
              <p className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{rk.total} <span className="text-xs font-semibold text-gray-400">pedidos</span></p>
              <p className="text-[10px] text-gray-400 mt-0.5">{rk.completadas} entregados · {rk.total ? Math.round(rk.completadas / rk.total * 100) : 0}%</p>
            </button>
          ))}
        </div>
      )}

      {/* Skeleton */}
      {loadingData && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 animate-pulse">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-surface" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-surface rounded w-28" />
                  <div className="h-3 bg-gray-100 dark:bg-surface/50 rounded w-40" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "routes" && !loadingData && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {["all", "en-ruta", "pendiente", "completada", "cancelada"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{s === "all" ? "Todas" : STATUS_LABELS[s]}</button>
            ))}
            {riderKpis.length > 0 && (
              <select value={filterRider} onChange={e => setFilterRider(e.target.value)} className="text-xs border border-gray-200 dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-surface text-gray-700 dark:text-foreground font-semibold">
                <option value="all">Todos los repartidores</option>
                {riderKpis.map(rk => <option key={rk.name} value={rk.name}>{rk.name}</option>)}
              </select>
            )}
            {filterRider !== "all" && (
              <button onClick={() => setFilterRider("all")} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-400 px-2 py-1 rounded-full flex items-center gap-1">
                <Users className="h-2.5 w-2.5" /> {filterRider} ×
              </button>
            )}
            <button onClick={() => exportToCSV(filtered.map(r => ({ ruta: r.name, zona: r.zone, repartidor: effectiveRider(r) ?? r.rider, paradas: r.stops, estado: STATUS_LABELS[r.status] })), "rutas-delivery")} className="ml-auto text-xs text-primary font-semibold flex items-center gap-1"><Download className="h-3 w-3" /> CSV</button>
          </div>
          <div className="space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Navigation className="h-5 w-5 text-primary" /></div>
                    <div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{r.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-muted">{r.zone} · {assignedRiders[r.id] ?? r.rider}</p>
                      {r.customerName && <p className="text-xs text-primary font-semibold mt-0.5">{r.customerName}{r.customerPhone ? <span className="text-gray-400 font-normal"> · {r.customerPhone}</span> : null}</p>}
                      {(r.status === "completada" || r.status === "cancelada") && (assignedRiders[r.id] || r.riderName) && (assignedRiders[r.id] || r.riderName) !== "Repartidor" && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
                          <Users className="h-2.5 w-2.5" /> {assignedRiders[r.id] ?? r.riderName}
                        </span>
                      )}
                      {riders.length > 0 && r.status !== "completada" && r.status !== "cancelada" && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <Users className="h-3 w-3 text-gray-400 shrink-0" />
                          <select value={assignedRiders[r.id] ?? r.riderName ?? ""} onChange={e => setAssignedRiders(prev => ({ ...prev, [r.id]: e.target.value }))} className="text-xs border border-gray-200 dark:border-card-border rounded-lg px-2 py-0.5 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
                            <option value="">Sin repartidor</option>
                            {riders.map(u => <option key={u.id} value={u.name}>{u.name} · {u.role}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right text-xs">
                      <p className="text-gray-500 dark:text-muted">{r.stops} paradas · ~{r.estimatedTime} min</p>
                      {r.startTime && <p className="text-gray-400">Salida: {fmtDate(r.startTime)}</p>}
                    </div>
                    <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full", STATUS_COLORS[r.status])}>{STATUS_LABELS[r.status]}</span>
                  </div>
                </div>
                {r.status === "en-ruta" && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-card-border">
                    <div className="w-full h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%" }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Estimado: ~{r.estimatedTime - 15} min restantes</p>
                  </div>
                )}
                {r.status === "completada" && r.actualTime && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Clock className="h-3 w-3 text-gray-400" />
                    <span className={cn("font-semibold", r.actualTime <= r.estimatedTime ? "text-emerald-600" : "text-red-600")}>
                      {r.actualTime} min {r.actualTime <= r.estimatedTime ? "(a tiempo ✓)" : `(+${r.actualTime - r.estimatedTime} min tarde)`}
                    </span>
                  </div>
                )}
                {/* Action buttons */}
                {r.status !== "completada" && r.status !== "cancelada" && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-card-border flex items-center gap-2 flex-wrap">
                    {r.status === "pendiente" && (
                      <button onClick={() => updateRouteStatus(r.id, "en-ruta")} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500 text-white hover:bg-blue-600 transition-colors">Enviar a ruta</button>
                    )}
                    {r.status === "en-ruta" && (
                      <button onClick={() => updateRouteStatus(r.id, "completada")} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors">Marcar entregado</button>
                    )}
                    <button onClick={() => updateRouteStatus(r.id, "cancelada")} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-red-50 hover:text-red-600 transition-colors">Cancelar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {view === "zones" && !loadingData && (
        <div className="space-y-3">
          {zones.map(z => (
            <div key={z.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
              <button onClick={() => setExpandedZone(expandedZone === z.id ? null : z.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                <div className="flex flex-wrap items-center gap-3">
                  <div className={cn("h-4 w-4 rounded-full", z.color)} />
                  <div className="text-left">
                    <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{z.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-muted">{z.neighborhoods.length} barrios · ~{z.estimatedMin} min · {fmt(z.deliveryFee)}</p>
                  </div>
                </div>
                {expandedZone === z.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </button>
              {expandedZone === z.id && (
                <div className="px-5 pb-4 border-t border-gray-100 dark:border-card-border pt-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {z.neighborhoods.map(n => (
                      <span key={n} className="px-3 py-1.5 bg-gray-50 dark:bg-surface rounded-lg text-xs font-semibold text-gray-700 dark:text-foreground">{n}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3 text-xs text-gray-500 dark:text-muted">
                    <span>Tarifa: <strong className="text-gray-900 dark:text-foreground">{fmt(z.deliveryFee)}</strong></span>
                    <span>Tiempo est.: <strong className="text-gray-900 dark:text-foreground">{z.estimatedMin} min</strong></span>
                    <span>Rutas hoy: <strong className="text-gray-900 dark:text-foreground">{routes.filter(r => r.zone === z.name).length}</strong></span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
