"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useMemo } from "react";
import {
  Truck, Wrench, Fuel, AlertTriangle, ChevronDown, ChevronUp,
  Plus, Pencil, X, Check, User, BarChart3, Route,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type VehicleStatus = "activo" | "en-ruta" | "mantenimiento" | "inactivo";

type Vehicle = {
  id: string;
  name: string;
  type: "moto" | "mototaxi" | "camioneta";
  plate: string;
  driver: string;
  status: VehicleStatus;
  kmTotal: number;
  kmMonth: number;
  lastMaintenance: string;
  nextMaintenance: string;
  fuelLevel: number;
  deliveriesToday: number;
  deliveriesMonth: number;
};

type MaintenanceLog = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  type: string;
  date: string;
  cost: number;
  notes: string;
};

const STATUS_CONFIG: Record<VehicleStatus, { label: string; color: string; dot: string }> = {
  activo:        { label: "Disponible",  color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]", dot: "bg-[var(--accent-soft)]" },
  "en-ruta":     { label: "En ruta",     color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",             dot: "bg-[var(--accent-soft)]" },
  mantenimiento: { label: "En taller",   color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",         dot: "bg-[var(--data-warning-500)]" },
  inactivo:      { label: "Inactivo",    color: "bg-gray-100 text-[var(--text-secondary)] dark:bg-surface dark:text-muted",                    dot: "bg-gray-400" },
};

const TYPE_LABEL: Record<string, string> = { moto: "Moto", mototaxi: "Mototaxi", camioneta: "Camioneta" };

const MAINTENANCE_THRESHOLD = new Date(Date.now() + 7 * 86_400_000);

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

const EMPTY_MAINT: Omit<MaintenanceLog, "id"> = {
  vehicleId: "", vehicleName: "", type: "", date: new Date().toISOString().slice(0, 10), cost: 0, notes: "",
};

export default function FleetManagementTab() {
  const [vehicles, setVehicles]       = useState<Vehicle[]>([]);
  const [maintLog, setMaintLog]       = useState<MaintenanceLog[]>([]);
  const [loading, setLoading]         = useState(true);
  const [view, setView]               = useState<"fleet" | "maintenance">("fleet");
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [maintForm, setMaintForm]     = useState(EMPTY_MAINT);
  const [showStatusModal, setShowStatusModal] = useState<Vehicle | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/fleet").then(r => r.ok ? r.json() : []),
      fetch("/api/fleet/maintenance").then(r => r.ok ? r.json() : []),
    ]).then(([vData, mData]) => {
      if (!active) return;
      setVehicles(vData);
      setMaintLog(mData);
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(
    () => filterStatus === "all" ? vehicles : vehicles.filter(v => v.status === filterStatus),
    [vehicles, filterStatus]
  );

  const kpis = useMemo(() => {
    const active   = vehicles.filter(v => v.status === "activo" || v.status === "en-ruta").length;
    const enRuta   = vehicles.filter(v => v.status === "en-ruta").length;
    const totalDel = vehicles.reduce((s, v) => s + v.deliveriesToday, 0);
    const maintCost = maintLog.reduce((s, m) => s + m.cost, 0);
    return { active, enRuta, totalDel, maintCost };
  }, [vehicles, maintLog]);

  const changeStatus = async (vehicleId: string, status: VehicleStatus) => {
    await fetch(`/api/fleet/${vehicleId}`, { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status }) });
    setVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, status } : v));
    setShowStatusModal(null);
  };

  const saveMaintenance = async () => {
    if (!maintForm.vehicleId || !maintForm.type) return;
    const res = await fetch("/api/fleet/maintenance", {
      method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(maintForm),
    });
    if (res.ok) {
      const created: MaintenanceLog = await res.json();
      setMaintLog(prev => [created, ...prev]);
    }
    setShowMaintModal(false);
    setMaintForm(EMPTY_MAINT);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Gestión de Flota
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Vehículos, combustible y mantenimiento</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["fleet", "maintenance"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
              )}>
              {v === "fleet" ? "Flota" : "Mantenimiento"}
            </button>
          ))}
          {view === "maintenance" && (
            <button onClick={() => setShowMaintModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> Registrar
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Disponibles",       value: `${kpis.active}/${vehicles.length}`, color: "text-[var(--data-success-500)]", icon: Truck },
          { label: "En ruta ahora",     value: kpis.enRuta,                          color: "text-[var(--data-success-500)]",    icon: Route },
          { label: "Entregas hoy",      value: kpis.totalDel,                        color: "text-primary",     icon: BarChart3 },
          { label: "Gasto mantenimiento", value: fmt(kpis.maintCost),                color: "text-[var(--data-warning-500)]",   icon: Wrench },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 flex items-start gap-3">
            <div className={cn("p-2 rounded-lg bg-gray-50 dark:bg-surface", color)}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted leading-tight">{label}</p>
              <p className={cn("text-xl font-extrabold mt-0.5", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Fleet view */}
      {view === "fleet" && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {(["all", "activo", "en-ruta", "mantenimiento", "inactivo"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted"
                )}>
                {s === "all" ? "Todos" : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>

          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-card border border-dashed border-[var(--rule-base)] dark:border-card-border rounded-xl">
              <Truck className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Sin vehículos en esta categoría</p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(v => (
              <div key={v.id} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                  className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-secondary)] shrink-0">{TYPE_LABEL[v.type]?.slice(0, 2) ?? "V"}</span>
                    <div className="text-left">
                      <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{v.name}</h4>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{v.plate} · <span className="flex-inline items-center gap-0.5"><User className="h-3 w-3 inline" /> {v.driver}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("w-2 h-2 rounded-full", STATUS_CONFIG[v.status].dot)} />
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2.5 py-1 rounded-full", STATUS_CONFIG[v.status].color)}>
                        {STATUS_CONFIG[v.status].label}
                      </span>
                    </div>
                    <span className="text-xs text-primary font-bold">{v.deliveriesToday} entregas hoy</span>
                    {expandedId === v.id ? <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />}
                  </div>
                </button>

                {expandedId === v.id && (
                  <div className="px-4 pb-4 border-t border-[var(--rule-soft)] dark:border-card-border pt-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Km totales</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{v.kmTotal.toLocaleString()} km</p>
                      </div>
                      <div>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Km este mes</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{v.kmMonth.toLocaleString()} km</p>
                      </div>
                      <div>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Entregas mes</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{v.deliveriesMonth}</p>
                      </div>
                      <div>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Próx. mantenimiento</p>
                        <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{fmtDate(v.nextMaintenance)}</p>
                      </div>
                    </div>

                    {/* Fuel bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[var(--text-secondary)] dark:text-muted flex items-center gap-1">
                          <Fuel className="h-3 w-3" /> Combustible
                        </span>
                        <span className={cn("font-bold",
                          v.fuelLevel > 50 ? "text-[var(--data-success-500)]" : v.fuelLevel > 20 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]"
                        )}>
                          {v.fuelLevel}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all",
                            v.fuelLevel > 50 ? "bg-[var(--accent-soft)]" : v.fuelLevel > 20 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"
                          )}
                          style={{ width: `${v.fuelLevel}%` }}
                        />
                      </div>
                    </div>

                    {/* Maintenance warning */}
                    {new Date(v.nextMaintenance) <= MAINTENANCE_THRESHOLD && (
                      <div className="flex items-center gap-2 text-xs bg-[var(--data-warning-50)] dark:bg-amber-950/10 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] px-3 py-2 rounded-xl">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Mantenimiento próximo: {fmtDate(v.nextMaintenance)}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => setShowStatusModal(v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--rule-base)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition"
                      >
                        <Pencil className="h-3 w-3" /> Cambiar estado
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Maintenance view */}
      {view === "maintenance" && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-surface text-left text-xs font-bold text-[var(--text-tertiary)]">
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Tipo de trabajo</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3">Notas</th>
                </tr>
              </thead>
              <tbody>
                {maintLog.map(m => (
                  <tr key={m.id} className="border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/10">
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)] dark:text-foreground">{m.vehicleName}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted flex items-center gap-1">
                      <Wrench className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0" /> {m.type}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted">{fmtDate(m.date)}</td>
                    <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(m.cost)}</td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-muted max-w-48 truncate">{m.notes || "—"}</td>
                  </tr>
                ))}
                {maintLog.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">Sin registros de mantenimiento</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Change status modal */}
      {showStatusModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowStatusModal(null)}>
          <div className="bg-white dark:bg-card rounded-xl p-4 sm:p-6 w-full max-w-sm border border-[var(--rule-base)] dark:border-card-border space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Estado — {showStatusModal.name}</CardTitle>
              <button onClick={() => setShowStatusModal(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-2">
              {(Object.keys(STATUS_CONFIG) as VehicleStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(showStatusModal.id, s)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold border transition",
                    showStatusModal.status === s
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-[var(--rule-base)] dark:border-card-border hover:border-primary/30 hover:bg-gray-50 dark:hover:bg-surface"
                  )}
                >
                  <span className={cn("w-2.5 h-2.5 rounded-full", STATUS_CONFIG[s].dot)} />
                  {STATUS_CONFIG[s].label}
                  {showStatusModal.status === s && <Check className="h-4 w-4 ml-auto text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Register maintenance modal */}
      {showMaintModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowMaintModal(false)}>
          <div className="bg-white dark:bg-card rounded-xl p-4 sm:p-6 w-full max-w-md border border-[var(--rule-base)] dark:border-card-border space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Registrar mantenimiento</CardTitle>
              <button onClick={() => setShowMaintModal(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Vehículo</label>
                <select
                  value={maintForm.vehicleId}
                  onChange={e => {
                    const v = vehicles.find(x => x.id === e.target.value);
                    setMaintForm(f => ({ ...f, vehicleId: e.target.value, vehicleName: v?.name ?? "" }));
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm"
                >
                  <option value="">Seleccionar vehículo...</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Tipo de trabajo</label>
                <input value={maintForm.type} onChange={e => setMaintForm(f => ({ ...f, type: e.target.value }))}
                  placeholder="Ej: Cambio de aceite, frenos..." className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</label>
                  <input type="date" value={maintForm.date} onChange={e => setMaintForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Costo (S/)</label>
                  <input type="number" min="0" step="0.5" value={maintForm.cost} onChange={e => setMaintForm(f => ({ ...f, cost: +e.target.value }))}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Notas</label>
                <textarea value={maintForm.notes} onChange={e => setMaintForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowMaintModal(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={saveMaintenance} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5">
                <Check className="h-4 w-4" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
