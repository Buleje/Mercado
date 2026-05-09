"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Filter, Save, Trash2, Play, Plus, X, Copy, Check, Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { csrfHeaders } from "@/lib/csrf-client";

/* ── types ──────────────────────────────────────────────────── */
type FilterCondition = {
  field: string;
  operator: string;
  value: string;
};

type SavedFilter = {
  id: string;
  name: string;
  description: string;
  module: string;
  conditions: FilterCondition[];
  isDefault: boolean;
  createdAt: string;
  usageCount: number;
};

/* ── constants ──────────────────────────────────────────────── */
const MODULES = ["Inventario", "Ventas", "Clientes", "Productos", "Pedidos", "Proveedores", "Finanzas"];
const FIELDS: Record<string, string[]> = {
  Inventario: ["Stock actual", "Categoría", "Proveedor", "Precio costo", "Última entrada", "Estado"],
  Ventas: ["Fecha", "Monto total", "Método pago", "Vendedor", "Estado", "Canal"],
  Clientes: ["Nombre", "Distrito", "Última compra", "Total acumulado", "Tipo", "Estado"],
  Productos: ["Nombre", "Categoría", "Precio venta", "Margen", "Stock", "Estado"],
  Pedidos: ["Fecha", "Estado", "Monto", "Cliente", "Tipo entrega", "Prioridad"],
  Proveedores: ["Nombre", "Rubro", "Deuda pendiente", "Último pedido", "Calificación", "Estado"],
  Finanzas: ["Tipo", "Monto", "Categoría", "Fecha", "Estado", "Cuenta"],
};
const OPERATORS = ["es igual a", "contiene", "mayor que", "menor que", "entre", "no es", "está vacío", "no está vacío"];

/* ── seed data ──────────────────────────────────────────────── */
const INITIAL_FILTERS: SavedFilter[] = [];

/* ── component ──────────────────────────────────────────────── */
export default function SavedFiltersTab() {
  const [filters, setFilters] = useState<SavedFilter[]>(INITIAL_FILTERS);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newModule, setNewModule] = useState("Inventario");
  const [newConditions, setNewConditions] = useState<FilterCondition[]>([{ field: "", operator: "es igual a", value: "" }]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/saved-filters")
      .then(r => r.json())
      .then(d => setFilters(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filters.filter(f => {
    if (moduleFilter !== "all" && f.module !== moduleFilter) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !f.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => b.usageCount - a.usageCount);

  const handleSave = async () => {
    if (!newName.trim() || !newConditions.some(c => c.field && c.value)) return;
    const res = await fetch("/api/saved-filters", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc.trim(),
        module: newModule,
        conditions: newConditions.filter(c => c.field),
        isDefault: false,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setFilters(prev => [...prev, created]);
      toast.success("Filtro guardado");
    } else { toast.error("Error al guardar el filtro"); }
    setNewName(""); setNewDesc(""); setNewConditions([{ field: "", operator: "es igual a", value: "" }]); setShowNew(false);
  };

  const handleDelete = async (id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id));
    try {
      await fetch(`/api/saved-filters?id=${id}`, { method: "DELETE" });
      toast.success("Filtro eliminado");
    } catch { toast.error("Error al eliminar el filtro"); }
  };

  const handleToggleDefault = async (id: string) => {
    const f = filters.find(x => x.id === id);
    if (!f) return;
    setFilters(prev => prev.map(x => x.id === id ? { ...x, isDefault: !x.isDefault } : x));
    try {
      await fetch(`/api/saved-filters?id=${id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ isDefault: !f.isDefault }) });
    } catch { toast.error("Error al actualizar el filtro"); }
  };

  const handleCopy = async (f: SavedFilter) => {
    try {
      const res = await fetch("/api/saved-filters", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: f.name + " (copia)",
          description: f.description,
          module: f.module,
          conditions: f.conditions,
          isDefault: false,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setFilters(prev => [...prev, created]);
        toast.success("Filtro duplicado");
      } else { toast.error("Error al duplicar el filtro"); }
    } catch { toast.error("Error al duplicar el filtro"); }
    setCopiedId(f.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const addCondition = () => setNewConditions(prev => [...prev, { field: "", operator: "es igual a", value: "" }]);
  const removeCondition = (idx: number) => setNewConditions(prev => prev.filter((_, i) => i !== idx));
  const updateCondition = (idx: number, key: keyof FilterCondition, val: string) => {
    setNewConditions(prev => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">Filtros Guardados</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Guarda y reutiliza combinaciones de filtros complejos</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowNew(true)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nuevo filtro
          </button>
          {filters.length > 0 && (
            <button onClick={() => setFilters([])} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] text-sm font-bold hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="h-4 w-4" /> Borrar todo
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">Total filtros</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground mt-1">{filters.length}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">Predeterminados</p>
          <p className="text-xl sm:text-2xl font-extrabold text-primary mt-1">{filters.filter(f => f.isDefault).length}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">Módulos cubiertos</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground mt-1">{new Set(filters.map(f => f.module)).size}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 ">
          <p className="text-xs text-[var(--text-secondary)] dark:text-muted font-semibold">Usos totales</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] mt-1">{filters.reduce((s, f) => s + f.usageCount, 0)}</p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar filtros..." className="pl-9 pr-4 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground text-sm outline-none focus:border-primary w-56" />
        </div>
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
          <option value="all">Todos los módulos</option>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Filter cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5 animate-pulse">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="h-4 w-4 rounded bg-gray-200 dark:bg-surface" />
                <div className="h-4 bg-gray-200 dark:bg-surface rounded-full w-2/3" />
              </div>
              <div className="space-y-2 mb-4">
                <div className="h-3 bg-gray-100 dark:bg-surface/60 rounded-full w-full" />
                <div className="h-3 bg-gray-100 dark:bg-surface/60 rounded-full w-4/5" />
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="h-6 w-16 bg-gray-100 dark:bg-surface/60 rounded-full" />
                <div className="h-6 w-12 bg-gray-100 dark:bg-surface/60 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {filtered.map(f => (
          <div key={f.id} className={cn("bg-white dark:bg-card rounded-xl border p-3 sm:p-5 transition-shadow hover:shadow-[var(--shadow-sm)]", f.isDefault ? "border-primary/50 dark:border-primary/50" : "border-[var(--rule-base)] dark:border-card-border")}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-primary shrink-0" />
                <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">{f.name}</CardTitle>
              </div>
              {f.isDefault && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">Default</span>}
            </div>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3 line-clamp-2">{f.description}</p>

            {/* Conditions preview */}
            <div className="space-y-1.5 mb-3">
              {f.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{c.field}</span>
                  <span className="text-[var(--text-tertiary)] dark:text-muted">{c.operator}</span>
                  <span className="font-bold text-primary">{c.value}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--rule-soft)] dark:border-card-border">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)] dark:text-muted">
                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-surface font-semibold">{f.module}</span>
                <span>{f.usageCount} usos</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleToggleDefault(f.id)} className={cn("p-1.5 rounded-lg transition-colors", f.isDefault ? "text-primary hover:bg-primary/10" : "text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent")} title={f.isDefault ? "Quitar default" : "Marcar default"}>
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleCopy(f)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors">
                  {copiedId === f.id ? <Check className="h-3.5 w-3.5 text-[var(--data-success-500)]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12"><Filter className="h-12 w-12 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-3" /><p className="text-[var(--text-tertiary)] dark:text-muted font-semibold">No se encontraron filtros</p></div>
      )}

      {/* New filter modal */}
      {showNew && (
        <div className="modal-backdrop p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Nuevo filtro guardado</CardTitle>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] dark:text-foreground mb-1">Nombre</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Stock bajo en bebidas" className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground text-sm outline-none focus:border-primary" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] dark:text-foreground mb-1">Descripción</label>
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Breve descripción..." className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] dark:text-foreground mb-1">Módulo</label>
                <select value={newModule} onChange={e => setNewModule(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
                  {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-primary)] dark:text-foreground mb-2">Condiciones</label>
                <div className="space-y-2">
                  {newConditions.map((cond, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select value={cond.field} onChange={e => updateCondition(i, "field", e.target.value)} className="flex-1 px-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs outline-none focus:border-primary">
                        <option value="">Campo...</option>
                        {(FIELDS[newModule] || []).map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select value={cond.operator} onChange={e => updateCondition(i, "operator", e.target.value)} className="w-28 px-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs outline-none focus:border-primary">
                        {OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <input type="text" value={cond.value} onChange={e => updateCondition(i, "value", e.target.value)} placeholder="Valor" className="flex-1 px-2 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs outline-none focus:border-primary" />
                      {newConditions.length > 1 && (
                        <button onClick={() => removeCondition(i)} className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><X className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={addCondition} className="mt-2 text-xs text-primary font-semibold hover:underline">+ Agregar condición</button>
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button onClick={() => setShowNew(false)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
                <button onClick={handleSave} disabled={!newName.trim()} className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50"><Save className="h-4 w-4 inline mr-1" /> Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
