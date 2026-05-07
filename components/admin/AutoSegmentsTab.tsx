"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Users, Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight, Loader2, AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { SegmentsResponse, SegmentedCustomer } from "@/app/api/analytics/segments/route";

type SegmentRule = { field: string; operator: string; value: string };
type Segment = {
  id: string; name: string; description: string; rules: SegmentRule[];
  customerCount: number; avgTicket: number; avgFrequency: number;
  lastUpdated: string; color: string; active: boolean;
  matchedCustomers: SegmentedCustomer[];
};

const FIELDS = [
  { id: "dias_sin_compra",     label: "Días sin comprar" },
  { id: "total_comprado",      label: "Total gastado (S/)" },
  { id: "frecuencia_pedidos",  label: "Cantidad de pedidos" },
  { id: "tier",                label: "Nivel de fidelidad" },
  { id: "puntos",              label: "Puntos de fidelidad" },
];
const OPERATORS = ["<", ">", "=", ">=", "<="];
const COLORS = ["bg-[var(--accent-soft)]","bg-[var(--accent-soft)]","bg-[var(--data-warning-500)]","bg-[var(--data-error-500)]","bg-[var(--text-primary)]","bg-[var(--text-primary)]","bg-cyan-500"];

const DEFAULT_SEGMENTS: Omit<Segment, "customerCount" | "avgTicket" | "avgFrequency" | "matchedCustomers">[] = [
  { id: "sg-perdido",   name: "Clientes perdidos",    description: "Sin comprar en 60+ días",              rules: [{ field: "dias_sin_compra",    operator: ">",  value: "60"  }], lastUpdated: new Date().toISOString().split("T")[0], color: "bg-[var(--data-error-500)]",     active: true },
  { id: "sg-riesgo",   name: "En riesgo",             description: "Sin comprar entre 30 y 60 días",       rules: [{ field: "dias_sin_compra",    operator: ">",  value: "30"  }, { field: "dias_sin_compra", operator: "<=", value: "60" }], lastUpdated: new Date().toISOString().split("T")[0], color: "bg-[var(--data-warning-500)]",   active: true },
  { id: "sg-vip",      name: "VIP potencial",         description: "Gastaron más de S/500",                rules: [{ field: "total_comprado",     operator: ">=", value: "500" }], lastUpdated: new Date().toISOString().split("T")[0], color: "bg-[var(--data-warning-500)]",  active: true },
  { id: "sg-frecuente",name: "Clientes frecuentes",   description: "Más de 5 pedidos",                     rules: [{ field: "frecuencia_pedidos", operator: ">",  value: "5"   }], lastUpdated: new Date().toISOString().split("T")[0], color: "bg-[var(--accent-soft)]", active: true },
];

/** Evalúa si un cliente cumple una regla */
function matchesRule(c: SegmentedCustomer, rule: SegmentRule): boolean {
  let customerVal: number;
  switch (rule.field) {
    case "dias_sin_compra":    customerVal = c.daysSinceLast ?? 999; break;
    case "total_comprado":     customerVal = c.totalSpent; break;
    case "frecuencia_pedidos": customerVal = c.orderCount; break;
    case "puntos":             customerVal = c.loyaltyPoints; break;
    default: return true; // campos de texto no se evalúan
  }
  const ruleVal = parseFloat(rule.value);
  if (isNaN(ruleVal)) return true;
  switch (rule.operator) {
    case "<":  return customerVal < ruleVal;
    case ">":  return customerVal > ruleVal;
    case "=":  return customerVal === ruleVal;
    case ">=": return customerVal >= ruleVal;
    case "<=": return customerVal <= ruleVal;
    default:   return false;
  }
}

function matchesAllRules(c: SegmentedCustomer, rules: SegmentRule[]): boolean {
  return rules.every(r => matchesRule(c, r));
}

function buildSegments(defs: typeof DEFAULT_SEGMENTS, allCustomers: SegmentedCustomer[]): Segment[] {
  return defs.map(def => {
    const matched = allCustomers.filter(c => matchesAllRules(c, def.rules));
    const avgTicket = matched.length > 0 ? matched.reduce((s, c) => s + c.totalSpent, 0) / matched.length : 0;
    const avgFrequency = matched.length > 0 ? matched.reduce((s, c) => s + c.orderCount, 0) / matched.length : 0;
    return { ...def, customerCount: matched.length, avgTicket, avgFrequency, matchedCustomers: matched };
  });
}

function fmt(n: number) { return `S/ ${n.toFixed(0)}`; }

export default function AutoSegmentsTab() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [allCustomers, setAllCustomers] = useState<SegmentedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editSegment, setEditSegment] = useState<Segment | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formRules, setFormRules] = useState<SegmentRule[]>([{ field: FIELDS[0].id, operator: ">", value: "" }]);
  const [formColor, setFormColor] = useState(COLORS[0]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/analytics/segments")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: SegmentsResponse) => {
        setAllCustomers(data.customers);
        setSegments(prev => {
          const defs = prev.length > 0
            ? prev.map(s => ({ id: s.id, name: s.name, description: s.description, rules: s.rules, lastUpdated: s.lastUpdated, color: s.color, active: s.active }))
            : DEFAULT_SEGMENTS;
          return buildSegments(defs, data.customers);
        });
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const totalSegmented = segments.filter(s => s.active).reduce((sum, s) => sum + s.customerCount, 0);
  const activeCount = segments.filter(s => s.active).length;

  const openCreate = () => {
    setEditSegment(null);
    setFormName(""); setFormDesc(""); setFormColor(COLORS[0]);
    setFormRules([{ field: FIELDS[0].id, operator: ">", value: "" }]);
    setShowModal(true);
  };

  const openEdit = (sg: Segment) => {
    setEditSegment(sg);
    setFormName(sg.name); setFormDesc(sg.description); setFormColor(sg.color);
    setFormRules([...sg.rules]);
    setShowModal(true);
  };

  const save = () => {
    if (!formName.trim()) return;
    if (editSegment) {
      setSegments(prev => buildSegments(prev.map(s => s.id === editSegment.id
        ? { id: s.id, name: formName, description: formDesc, rules: formRules, lastUpdated: new Date().toISOString().split("T")[0], color: formColor, active: s.active }
        : { id: s.id, name: s.name, description: s.description, rules: s.rules, lastUpdated: s.lastUpdated, color: s.color, active: s.active }
      ), allCustomers));
    } else {
      const newSeg = { id: `sg${Date.now()}`, name: formName, description: formDesc, rules: formRules, lastUpdated: new Date().toISOString().split("T")[0], color: formColor, active: true };
      setSegments(prev => buildSegments([...prev.map(s => ({ id: s.id, name: s.name, description: s.description, rules: s.rules, lastUpdated: s.lastUpdated, color: s.color, active: s.active })), newSeg], allCustomers));
    }
    setShowModal(false);
  };

  const toggleActive = (id: string) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const deleteSegment = (id: string) => {
    setSegments(prev => prev.filter(s => s.id !== id));
  };

  if (loading) return (
    <LoadingState message="Calculando segmentos automáticos..." />
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
      <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">Error al cargar datos</p>
      <button onClick={reload} className="text-xs text-primary font-bold flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" />Reintentar</button>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Users className="h-6 w-6 text-primary" /> Segmentación Automática</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Reglas dinámicas que se actualizan con datos reales</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={reload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] dark:text-muted bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-card">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nuevo segmento
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Segmentos creados",    value: segments.length,      color: "text-[var(--data-success-500)]" },
          { label: "Segmentos activos",    value: activeCount,          color: "text-[var(--data-success-500)]" },
          { label: "Clientes segmentados", value: totalSegmented,       color: "text-[var(--text-secondary)]" },
          { label: "Total en base",        value: allCustomers.length,  color: "text-[var(--text-secondary)]" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold mt-1", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Cards de segmentos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {segments.map(sg => {
          const isExpanded = expandedId === sg.id;
          return (
            <div key={sg.id} className={cn("bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden transition-opacity", !sg.active && "opacity-50")}>
              {/* Card header */}
              <div className="p-3 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("h-3 w-3 rounded-full shrink-0", sg.color)} />
                    <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground truncate">{sg.name}</CardTitle>
                    {!sg.active && <span className="text-[length:var(--ts-2xs)] font-bold bg-gray-100 dark:bg-surface text-[var(--text-tertiary)] px-1.5 py-0.5 rounded">Inactivo</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleActive(sg.id)} className={cn("text-[var(--text-tertiary)] hover:text-primary transition-colors")} title={sg.active ? "Desactivar" : "Activar"}>
                      {sg.active ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => openEdit(sg)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-[var(--text-tertiary)] hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => deleteSegment(sg.id)} className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-1 mb-3">{sg.description}</p>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center bg-gray-50 dark:bg-surface rounded-lg py-2">
                    <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">{sg.customerCount}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">clientes</p>
                  </div>
                  <div className="text-center bg-gray-50 dark:bg-surface rounded-lg py-2">
                    <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">{fmt(sg.avgTicket)}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">ticket prom.</p>
                  </div>
                  <div className="text-center bg-gray-50 dark:bg-surface rounded-lg py-2">
                    <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">{sg.avgFrequency.toFixed(1)}x</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">pedidos prom.</p>
                  </div>
                </div>

                {/* Reglas */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {sg.rules.map((r, i) => {
                    const field = FIELDS.find(f => f.id === r.field);
                    return (
                      <span key={i} className="text-[length:var(--ts-2xs)] bg-gray-100 dark:bg-surface px-2 py-1 rounded-lg text-[var(--text-secondary)] dark:text-muted font-mono">
                        {field?.label ?? r.field} {r.operator} {r.value}
                      </span>
                    );
                  })}
                </div>

                {/* Preview toggle */}
                {sg.customerCount > 0 && (
                  <button onClick={() => setExpandedId(isExpanded ? null : sg.id)} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                    {isExpanded ? "Ocultar clientes" : `Ver ${Math.min(sg.customerCount, 5)} clientes`}
                  </button>
                )}
              </div>

              {/* Preview de clientes */}
              {isExpanded && sg.matchedCustomers.length > 0 && (
                <div className="border-t border-[var(--rule-soft)] dark:border-card-border px-3 sm:px-5 py-3 bg-gray-50/50 dark:bg-surface/30">
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-2">Clientes en este segmento</p>
                  <div className="space-y-1.5">
                    {sg.matchedCustomers.slice(0, 5).map(c => (
                      <div key={c.phone} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{c.name}</span>
                          <span className="text-[var(--text-tertiary)] ml-1.5">{c.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[var(--text-secondary)] dark:text-muted">
                          <span>{c.orderCount} pedidos</span>
                          <span className="font-semibold">S/{c.totalSpent.toFixed(0)}</span>
                          {c.daysSinceLast !== null && (
                            <span className={cn("text-[length:var(--ts-2xs)] font-bold", c.daysSinceLast > 60 ? "text-[var(--data-error-500)]" : c.daysSinceLast > 30 ? "text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]")}>
                              {c.daysSinceLast}d
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {sg.customerCount > 5 && (
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center pt-1">...y {sg.customerCount - 5} más</p>
                    )}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between px-3 sm:px-5 pb-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                <span>{sg.active ? "Activo · " : "Inactivo · "}Act: {sg.lastUpdated}</span>
                <span>{allCustomers.length > 0 ? ((sg.customerCount / allCustomers.length) * 100).toFixed(0) : 0}% de la base</span>
              </div>
            </div>
          );
        })}

        {segments.length === 0 && (
          <div className="col-span-2 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl flex flex-col items-center py-12 gap-3 text-[var(--text-tertiary)] dark:text-muted">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm">No hay segmentos definidos</p>
            <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90">
              <Plus className="h-4 w-4" />Crear primer segmento
            </button>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-xl p-4 sm:p-6 max-w-lg w-full border border-[var(--rule-base)] dark:border-card-border max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground mb-4">{editSegment ? "Editar segmento" : "Nuevo segmento"}</CardTitle>
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Nombre</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="ej. Clientes inactivos" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Descripción</label>
                <input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="ej. Sin comprar en más de 30 días" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1.5">Color</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setFormColor(c)} className={cn("w-7 h-7 rounded-full border-2 transition-all", c, formColor === c ? "border-gray-900 dark:border-white scale-110" : "border-transparent")} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2 block">Reglas (se aplican todas)</label>
                {formRules.map((r, i) => (
                  <div key={i} className="flex gap-2 mb-2 flex-wrap">
                    <select value={r.field} onChange={e => { const nr = [...formRules]; nr[i] = { ...nr[i], field: e.target.value }; setFormRules(nr); }} className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs min-w-[120px]">
                      {FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <select value={r.operator} onChange={e => { const nr = [...formRules]; nr[i] = { ...nr[i], operator: e.target.value }; setFormRules(nr); }} className="w-14 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs">
                      {OPERATORS.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <input value={r.value} onChange={e => { const nr = [...formRules]; nr[i] = { ...nr[i], value: e.target.value }; setFormRules(nr); }} className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs" placeholder="valor" />
                    {formRules.length > 1 && <button onClick={() => setFormRules(formRules.filter((_, j) => j !== i))} className="text-[var(--data-error-500)] hover:text-[var(--data-error-500)]"><X className="h-4 w-4" /></button>}
                  </div>
                ))}
                <button onClick={() => setFormRules([...formRules, { field: FIELDS[0].id, operator: ">", value: "" }])} className="text-xs text-primary font-bold">+ Agregar regla</button>

                {/* Preview en tiempo real */}
                {allCustomers.length > 0 && formRules.some(r => r.value) && (
                  <div className="mt-3 p-2.5 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-xs font-bold text-primary mb-1">
                      Preview: {allCustomers.filter(c => matchesAllRules(c, formRules.filter(r => r.value))).length} clientes coinciden
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} disabled={!formName.trim()} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                <Check className="h-4 w-4" />Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
