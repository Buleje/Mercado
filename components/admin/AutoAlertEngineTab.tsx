"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";

import { useState, useMemo, useEffect, startTransition } from "react";
import { Bell, Plus, Pencil, Trash2, Check, X, AlertTriangle, Play, Pause, Download, Filter, RefreshCw } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

type AlertRule = {
  id: string;
  name: string;
  module: string;
  condition: string;
  threshold: number;
  operator: ">" | "<" | "=" | ">=" | "<=";
  action: "notification" | "email" | "whatsapp" | "all";
  enabled: boolean;
  triggered: number;
  lastTriggered: string | null;
  severity: "info" | "warning" | "critical";
};

type AlertLog = { id: string; ruleId: string; ruleName: string; message: string; timestamp: string; severity: "info" | "warning" | "critical"; acknowledged: boolean };

const MODULES = ["Inventario", "Ventas", "Caja", "Proveedores", "Pedidos", "RRHH", "Tesorería", "CRM"];
const ACTIONS: Record<string, string> = { notification: "Notificación", email: "Email", whatsapp: "WhatsApp", all: "Todos" };
const OPERATORS: AlertRule["operator"][] = [">", "<", "=", ">=", "<="];

// Default rules pre-configured with meaningful thresholds for a bodega
const DEFAULT_RULES: AlertRule[] = [
  { id: "r-default-1", name: "Stock bajo en producto", module: "Inventario", condition: "stock_actual", threshold: 5, operator: "<=", action: "notification", enabled: true, triggered: 0, lastTriggered: null, severity: "critical" },
  { id: "r-default-2", name: "Pedidos pendientes acumulados", module: "Pedidos", condition: "pedidos_pendientes", threshold: 5, operator: ">", action: "notification", enabled: true, triggered: 0, lastTriggered: null, severity: "warning" },
  { id: "r-default-3", name: "Pagos a proveedor vencidos", module: "Proveedores", condition: "pagos_vencidos", threshold: 0, operator: ">", action: "all", enabled: true, triggered: 0, lastTriggered: null, severity: "critical" },
  { id: "r-default-4", name: "Pedido sin atender +30 min", module: "Pedidos", condition: "minutos_sin_atender", threshold: 30, operator: ">", action: "notification", enabled: true, triggered: 0, lastTriggered: null, severity: "warning" },
  { id: "r-default-5", name: "Ventas del día bajas", module: "Ventas", condition: "ventas_hoy_soles", threshold: 100, operator: "<", action: "notification", enabled: false, triggered: 0, lastTriggered: null, severity: "info" },
];

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function AutoAlertEngineTab() {
  const [rules, setRules] = useState<AlertRule[]>(DEFAULT_RULES);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"rules" | "logs">("rules");
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  // Form state
  const [formName, setFormName] = useState("");
  const [formModule, setFormModule] = useState(MODULES[0]);
  const [formCondition, setFormCondition] = useState("");
  const [formThreshold, setFormThreshold] = useState(0);
  const [formOperator, setFormOperator] = useState<AlertRule["operator"]>(">");
  const [formAction, setFormAction] = useState<AlertRule["action"]>("notification");
  const [formSeverity, setFormSeverity] = useState<AlertRule["severity"]>("warning");

  const openCreate = () => {
    setEditRule(null); setFormName(""); setFormModule(MODULES[0]); setFormCondition(""); setFormThreshold(0); setFormOperator(">"); setFormAction("notification"); setFormSeverity("warning"); setShowModal(true);
  };

  const openEdit = (r: AlertRule) => {
    setEditRule(r); setFormName(r.name); setFormModule(r.module); setFormCondition(r.condition); setFormThreshold(r.threshold); setFormOperator(r.operator); setFormAction(r.action); setFormSeverity(r.severity); setShowModal(true);
  };

  const saveRule = () => {
    if (!formName.trim() || !formCondition.trim()) return;
    if (editRule) {
      setRules(prev => prev.map(r => r.id === editRule.id ? { ...r, name: formName, module: formModule, condition: formCondition, threshold: formThreshold, operator: formOperator, action: formAction, severity: formSeverity } : r));
    } else {
      const newRule: AlertRule = { id: `r${Date.now()}`, name: formName, module: formModule, condition: formCondition, threshold: formThreshold, operator: formOperator, action: formAction, severity: formSeverity, enabled: true, triggered: 0, lastTriggered: null };
      setRules(prev => [...prev, newRule]);
    }
    setShowModal(false);
  };

  const filteredLogs = useMemo(() => filterSeverity === "all" ? logs : logs.filter(l => l.severity === filterSeverity), [logs, filterSeverity]);

  // ── Load real dashboard data and auto-generate alert logs ──
  // setLoading(true) must be called from event handler, never synchronously inside useEffect
  const loadAlerts = () => {
    fetch("/api/admin/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const now = new Date().toISOString();
        const newLogs: AlertLog[] = [];

        // Low stock products → one log entry per product (up to 10)
        const lowStockProducts: Array<{ id: number; name: string; stock: number; stockMin: number }> =
          data.products.filter((p: { stock?: number; stockMin?: number }) =>
            typeof p.stock === "number" && typeof p.stockMin === "number" && p.stock <= p.stockMin
          );
        lowStockProducts.slice(0, 10).forEach(p => {
          newLogs.push({ id: `log-stock-${p.id}`, ruleId: "r-default-1", ruleName: "Stock bajo en producto", message: `${p.name}: stock ${p.stock} ≤ mínimo ${p.stockMin}`, timestamp: now, severity: "critical", acknowledged: false });
        });

        // Excess pending orders
        const pending: Array<{ status: string; createdAt?: string }> =
          data.orders.filter((o: { status: string }) => o.status === "pendiente");
        if (pending.length > 5) {
          newLogs.push({ id: "log-pending-orders", ruleId: "r-default-2", ruleName: "Pedidos pendientes acumulados", message: `${pending.length} pedidos esperando confirmación`, timestamp: now, severity: "warning", acknowledged: false });
        }

        // Overdue payables
        if (data.alerts?.overduePayables > 0) {
          const n = data.alerts.overduePayables;
          newLogs.push({ id: "log-overdue-payables", ruleId: "r-default-3", ruleName: "Pagos a proveedor vencidos", message: `${n} pago${n > 1 ? "s" : ""} vencido${n > 1 ? "s" : ""} sin regularizar`, timestamp: now, severity: "critical", acknowledged: false });
        }

        // Old pending orders (>30 min without attention)
        const oldPending = pending.filter(o => {
          const created = new Date(o.createdAt ?? now);
          return (Date.now() - created.getTime()) > 30 * 60 * 1000;
        });
        if (oldPending.length > 0) {
          newLogs.push({ id: "log-old-pending", ruleId: "r-default-4", ruleName: "Pedido sin atender +30 min", message: `${oldPending.length} pedido${oldPending.length > 1 ? "s" : ""} sin atender por más de 30 minutos`, timestamp: now, severity: "warning", acknowledged: false });
        }

        startTransition(() => {
          setLogs(newLogs);
          setRules(prev => prev.map(r => {
            const hits = newLogs.filter(l => l.ruleId === r.id).length;
            return hits > 0 ? { ...r, triggered: r.triggered + hits, lastTriggered: now } : r;
          }));
          setLoading(false);
        });
      })
      .catch(() => startTransition(() => setLoading(false)));
  };

  useEffect(() => { loadAlerts(); }, []); // intentional: run once on mount

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Bell className="h-6 w-6 text-primary" /> Alertas Automáticas</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Configura umbrales y recibe alertas cuando se disparan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setLoading(true); loadAlerts(); }} disabled={loading} title="Actualizar alertas" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-[var(--text-tertiary)] hover:text-primary disabled:opacity-40 transition-colors"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></button>
          <button onClick={() => setView("rules")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "rules" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Reglas</button>
          <button onClick={() => setView("logs")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "logs" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
            Historial {logs.filter(l => !l.acknowledged).length > 0 && <span className="ml-1 bg-[var(--data-error-500)] text-white rounded-full px-1.5 text-[length:var(--ts-2xs)]">{logs.filter(l => !l.acknowledged).length}</span>}
          </button>
          {view === "rules" && <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"><Plus className="h-3.5 w-3.5" /> Nueva regla</button>}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Reglas activas", value: rules.filter(r => r.enabled).length, total: rules.length, color: "text-[var(--data-success-500)]" },
          { label: "Alertas hoy", value: logs.filter(l => l.timestamp.startsWith(new Date().toISOString().slice(0, 10))).length, color: "text-[var(--data-warning-500)]" },
          { label: "Sin reconocer", value: logs.filter(l => !l.acknowledged).length, color: "text-[var(--data-error-500)]" },
          { label: "Total disparos", value: rules.reduce((s, r) => s + r.triggered, 0), color: "text-[var(--data-success-500)]" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}{k.total !== undefined && <span className="text-sm text-[var(--text-tertiary)]">/{k.total}</span>}</p>
          </div>
        ))}
      </div>

      {view === "rules" ? (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="bg-gray-50 dark:bg-surface text-left">
                <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Regla</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Módulo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Condición</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Disparos</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Acciones</th>
              </tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface/50">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", r.severity === "critical" ? "bg-[var(--data-error-500)]" : r.severity === "warning" ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent-soft)]")} />
                        <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted">{r.module}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><code className="text-xs bg-gray-100 dark:bg-surface px-1.5 py-0.5 rounded">{r.condition} {r.operator} {r.threshold}</code></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{r.triggered}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <button onClick={() => setRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold", r.enabled ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" : "bg-gray-100 text-[var(--text-secondary)] dark:bg-surface dark:text-muted")}>
                        {r.enabled ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                        {r.enabled ? "Activa" : "Pausada"}
                      </button>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-[var(--text-tertiary)] hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-[var(--text-tertiary)]" />
            {["all", "critical", "warning", "info"].map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", filterSeverity === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>{s === "all" ? "Todos" : s}</button>
            ))}
            <button onClick={() => exportToCSV(filteredLogs.map(l => ({ regla: l.ruleName, mensaje: l.message, fecha: fmtDate(l.timestamp), severidad: l.severity })), "alertas-log")} className="ml-auto text-xs text-primary font-semibold flex items-center gap-1"><Download className="h-3 w-3" /> CSV</button>
          </div>
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-8 text-sm text-[var(--text-tertiary)]">Cargando alertas...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-10 w-10 text-gray-200 dark:text-surface mx-auto mb-2" />
                <p className="text-sm font-semibold text-[var(--text-tertiary)]">Sin alertas activas</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Todas las reglas están dentro de sus umbrales</p>
              </div>
            ) : filteredLogs.map(l => (
              <div key={l.id} className={cn("bg-white dark:bg-card rounded-xl border p-4 flex items-start gap-3", l.severity === "critical" ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30" : l.severity === "warning" ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30" : "border-[var(--rule-base)] dark:border-card-border")}>
                <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", l.severity === "critical" ? "text-[var(--data-error-500)]" : l.severity === "warning" ? "text-[var(--data-warning-500)]" : "text-[var(--data-success-500)]")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{l.ruleName}</p>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">{l.message}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-1">{fmtDate(l.timestamp)}</p>
                </div>
                {!l.acknowledged && (
                  <button onClick={() => setLogs(prev => prev.map(x => x.id === l.id ? { ...x, acknowledged: true } : x))} className="px-2 py-1 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1"><Check className="h-3 w-3" /> OK</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-xl p-3 sm:p-6 max-w-md w-full mx-4 border border-[var(--rule-base)] dark:border-card-border" onClick={e => e.stopPropagation()}>
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground mb-4">{editRule ? "Editar regla" : "Nueva regla"}</CardTitle>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Nombre</label><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Nombre de la regla" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Módulo</label><select value={formModule} onChange={e => setFormModule(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm">{MODULES.map(m => <option key={m}>{m}</option>)}</select></div>
                <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Severidad</label><select value={formSeverity} onChange={e => setFormSeverity(e.target.value as AlertRule["severity"])} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm"><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Crítico</option></select></div>
              </div>
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Campo/condición</label><input value={formCondition} onChange={e => setFormCondition(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="ej: stock_actual" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Operador</label><select value={formOperator} onChange={e => setFormOperator(e.target.value as AlertRule["operator"])} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm">{OPERATORS.map(o => <option key={o}>{o}</option>)}</select></div>
                <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Umbral</label><input type="number" value={formThreshold} onChange={e => setFormThreshold(+e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              </div>
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Acción</label><select value={formAction} onChange={e => setFormAction(e.target.value as AlertRule["action"])} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm">{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent"><X className="h-4 w-4 inline mr-1" />Cancelar</button>
              <button onClick={saveRule} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4 inline mr-1" />Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
