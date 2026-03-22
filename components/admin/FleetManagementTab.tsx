"use client";

import { useState, useMemo } from "react";
import { Truck, Wrench, Fuel, CheckCircle, AlertTriangle, Calendar, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Vehicle = {
  id: string; name: string; type: "moto" | "mototaxi" | "camioneta"; plate: string; driver: string;
  status: "activo" | "mantenimiento" | "inactivo"; kmTotal: number; lastMaintenance: string;
  nextMaintenance: string; fuelLevel: number; deliveriesToday: number;
};

const SEED: Vehicle[] = [];

type MaintenanceLog = { id: string; vehicle: string; type: string; date: string; cost: number; notes: string };
const MAINT_LOG: MaintenanceLog[] = [];

const STATUS_CONFIG = {
  activo: { label: "Activo", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  mantenimiento: { label: "En taller", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  inactivo: { label: "Inactivo", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const TYPE_ICONS: Record<string, string> = { moto: "🏍️", mototaxi: "🛺", camioneta: "🚐" };

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

export default function FleetManagementTab() {
  const [vehicles] = useState(SEED);
  const [view, setView] = useState<"fleet" | "maintenance">("fleet");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = useMemo(() => filterStatus === "all" ? vehicles : vehicles.filter(v => v.status === filterStatus), [vehicles, filterStatus]);
  const activeCount = vehicles.filter(v => v.status === "activo").length;
  const totalDeliveries = vehicles.reduce((s, v) => s + v.deliveriesToday, 0);
  const avgFuel = Math.round(vehicles.filter(v => v.status === "activo").reduce((s, v) => s + v.fuelLevel, 0) / activeCount);
  const maintCost = MAINT_LOG.reduce((s, m) => s + m.cost, 0);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Truck className="h-6 w-6 text-primary" /> Gestión de Flota</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Control de vehículos, combustible y mantenimiento</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setView("fleet")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "fleet" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Flota</button>
          <button onClick={() => setView("maintenance")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "maintenance" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Mantenimiento</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Vehículos activos", value: `${activeCount}/${vehicles.length}`, color: "text-emerald-500" },
          { label: "Entregas hoy", value: totalDeliveries, color: "text-blue-500" },
          { label: "Combustible prom.", value: `${avgFuel}%`, color: "text-amber-500" },
          { label: "Gasto mantenimiento", value: fmt(maintCost), color: "text-red-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {view === "fleet" ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {["all", "activo", "mantenimiento", "inactivo"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{s === "all" ? "Todos" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}</button>
            ))}
          </div>
          <div className="space-y-3">
            {filtered.map(v => (
              <div key={v.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
                <button onClick={() => setExpandedId(expandedId === v.id ? null : v.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xl sm:text-2xl">{TYPE_ICONS[v.type]}</span>
                    <div className="text-left">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{v.name}</h4>
                      <p className="text-xs text-gray-500 dark:text-muted">{v.plate} · {v.driver}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full", STATUS_CONFIG[v.status].color)}>{STATUS_CONFIG[v.status].label}</span>
                    {expandedId === v.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </button>
                {expandedId === v.id && (
                  <div className="px-5 pb-5 border-t border-gray-100 dark:border-card-border pt-4 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div><p className="text-[10px] text-gray-400 dark:text-muted">Km totales</p><p className="text-sm font-bold text-gray-900 dark:text-foreground">{v.kmTotal.toLocaleString()}</p></div>
                      <div><p className="text-[10px] text-gray-400 dark:text-muted">Entregas hoy</p><p className="text-sm font-bold text-gray-900 dark:text-foreground">{v.deliveriesToday}</p></div>
                      <div><p className="text-[10px] text-gray-400 dark:text-muted">Últ. mantenimiento</p><p className="text-sm font-bold text-gray-900 dark:text-foreground">{fmtDate(v.lastMaintenance)}</p></div>
                      <div><p className="text-[10px] text-gray-400 dark:text-muted">Próx. mantenimiento</p><p className="text-sm font-bold text-gray-900 dark:text-foreground">{fmtDate(v.nextMaintenance)}</p></div>
                    </div>
                    {/* Fuel bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500 dark:text-muted flex items-center gap-1"><Fuel className="h-3 w-3" /> Combustible</span>
                        <span className={cn("font-bold", v.fuelLevel > 50 ? "text-emerald-600" : v.fuelLevel > 20 ? "text-amber-600" : "text-red-600")}>{v.fuelLevel}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", v.fuelLevel > 50 ? "bg-emerald-500" : v.fuelLevel > 20 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${v.fuelLevel}%` }} />
                      </div>
                    </div>
                    {/* Maintenance warning */}
                    {new Date(v.nextMaintenance) <= new Date(Date.now() + 7 * 86400000) && (
                      <div className="flex flex-wrap items-center gap-2 text-xs bg-amber-50 dark:bg-amber-950/10 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-xl">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Mantenimiento próximo: {fmtDate(v.nextMaintenance)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-y-hidden overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="bg-gray-50 dark:bg-surface text-left">
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Vehículo</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Tipo</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Fecha</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Costo</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Notas</th>
            </tr></thead>
            <tbody>
              {MAINT_LOG.map(m => (
                <tr key={m.id} className="border-t border-gray-100 dark:border-card-border">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-gray-900 dark:text-foreground">{m.vehicle}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-600 dark:text-muted flex items-center gap-1"><Wrench className="h-3 w-3" /> {m.type}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500 dark:text-muted">{fmtDate(m.date)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-900 dark:text-foreground">{fmt(m.cost)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 dark:text-muted max-w-48 truncate">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
