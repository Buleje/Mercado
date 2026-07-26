"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, Search, Clock, Check, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { Field } from '@/components/admin/shared/Field';

// ── Types ─────────────────────────────────────────────────────────────────────

type ScheduleStatus = "programado" | "activo" | "expirado";

type PriceSchedule = {
  id:           string;
  productId:    number;
  productName:  string;
  currentPrice: number;
  newPrice:     number;
  startDate:    string;   // ISO date string
  endDate:      string;   // ISO date string | ""
  createdAt:    string;
};

type ProductSearchResult = {
  id:    number;
  name:  string;
  price: number;
};

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "buleje_price_schedules";

function loadSchedules(): PriceSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PriceSchedule[]) : [];
  } catch { return []; }
}

function saveSchedules(schedules: PriceSchedule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatus(schedule: PriceSchedule): ScheduleStatus {
  const now   = new Date();
  const start = new Date(schedule.startDate);
  const end   = schedule.endDate ? new Date(schedule.endDate) : null;
  if (now < start) return "programado";
  if (end && now > end) return "expirado";
  return "activo";
}

const STATUS_UI: Record<ScheduleStatus, { label: string; color: string; dot: string }> = {
  programado: { label: "Programado", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",    dot: "bg-primary/10" },
  activo:     { label: "Activo",     color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", dot: "bg-primary/10" },
  expirado:   { label: "Expirado",   color: "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]",    dot: "bg-gray-400" },
};

function fmt(n: number) { return "S/ " + n.toFixed(2); }

function _toInputDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function fromInputDate(s: string): string {
  return s ? new Date(s).toISOString() : "";
}

// ── Product search input ──────────────────────────────────────────────────────

function ProductSearchInput({
  onSelect,
}: {
  onSelect: (product: ProductSearchResult) => void;
}) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<ProductSearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/product-search?q=${encodeURIComponent(q)}&limit=6`);
      if (res.ok) {
        const data = await res.json() as { products?: ProductSearchResult[] };
        setResults(data.products ?? []);
        setOpen(true);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  const handleSelect = (p: ProductSearchResult) => {
    onSelect(p);
    setQuery(p.name);
    setOpen(false);
    setResults([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Buscar producto..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 w-full bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <span className="text-[var(--text-primary)] truncate">{p.name}</span>
              <span className="text-[var(--text-tertiary)] shrink-0 ml-2">{fmt(p.price)}</span>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute z-20 top-full mt-1 w-full bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl px-4 py-3 text-sm text-[var(--text-tertiary)]">
          Sin resultados para &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

type FormState = {
  product:      ProductSearchResult | null;
  newPrice:     string;
  startDate:    string;
  endDate:      string;
};

function AddForm({ onSave, onCancel }: { onSave: (s: PriceSchedule) => void; onCancel: () => void }) {
  const [form, setForm]     = useState<FormState>({ product: null, newPrice: "", startDate: "", endDate: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.product)                    e.product    = "Selecciona un producto";
    if (!form.newPrice || isNaN(Number(form.newPrice)) || Number(form.newPrice) <= 0)
                                          e.newPrice   = "Ingresa un precio valido mayor a 0";
    if (!form.startDate)                  e.startDate  = "Selecciona la fecha de inicio";
    if (form.endDate && form.startDate && form.endDate <= form.startDate)
                                          e.endDate    = "La fecha fin debe ser posterior a la de inicio";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate() || !form.product) return;
    const schedule: PriceSchedule = {
      id:           `ps_${Date.now()}`,
      productId:    form.product.id,
      productName:  form.product.name,
      currentPrice: form.product.price,
      newPrice:     Number(form.newPrice),
      startDate:    fromInputDate(form.startDate),
      endDate:      fromInputDate(form.endDate),
      createdAt:    new Date().toISOString(),
    };
    onSave(schedule);
  };

  const priceDiff = form.product && form.newPrice
    ? ((Number(form.newPrice) - form.product.price) / form.product.price * 100).toFixed(1)
    : null;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5  space-y-4">
      <p className="text-sm font-semibold text-[var(--text-secondary)]">Nuevo cambio programado</p>

      {/* Product search */}
      <Field label="Producto" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
        {() => (
          <>
            <ProductSearchInput onSelect={p => { setForm(f => ({ ...f, product: p })); }} />
            {errors.product && <p className="text-xs text-[var(--data-error-500)]">{errors.product}</p>}
          </>
        )}
      </Field>

      {/* Current vs new price */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Precio actual" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
          {() => (
            <div className="px-3 py-2 rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50 bg-[var(--surface-canvas)]/50 text-sm text-[var(--text-tertiary)]">
              {form.product ? fmt(form.product.price) : "—"}
            </div>
          )}
        </Field>
        <Field label="Precio nuevo (S/)" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
          {(id) => (
            <>
              <input
                id={id}
                type="number"
                min="0.01"
                step="0.01"
                value={form.newPrice}
                onChange={e => setForm(f => ({ ...f, newPrice: e.target.value }))}
                placeholder="0.00"
                className={cn(
                  "w-full px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
                  errors.newPrice ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                )}
              />
              {errors.newPrice && <p className="text-xs text-[var(--data-error-500)]">{errors.newPrice}</p>}
            </>
          )}
        </Field>
      </div>

      {/* Price diff indicator */}
      {priceDiff !== null && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium",
          Number(priceDiff) > 0
            ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
            : "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
        )}>
          {Number(priceDiff) > 0 ? "Aumento" : "Descuento"} de {Math.abs(Number(priceDiff))}% ({Number(priceDiff) > 0 ? "+" : ""}{(Number(form.newPrice) - (form.product?.price ?? 0)).toFixed(2)})
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de inicio" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
          {(id) => (
            <>
              <input
                id={id}
                type="datetime-local"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
                  errors.startDate ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                )}
              />
              {errors.startDate && <p className="text-xs text-[var(--data-error-500)]">{errors.startDate}</p>}
            </>
          )}
        </Field>
        <Field label="Fecha de fin (opcional)" labelClassName="text-xs font-medium text-[var(--text-tertiary)]" className="space-y-1">
          {(id) => (
            <>
              <input
                id={id}
                type="datetime-local"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
                  errors.endDate ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                )}
              />
              {errors.endDate && <p className="text-xs text-[var(--data-error-500)]">{errors.endDate}</p>}
            </>
          )}
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark transition-colors"
        >
          Programar cambio
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PriceScheduler() {
  const [schedules, setSchedules] = useState<PriceSchedule[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [filter, setFilter]       = useState<ScheduleStatus | "todos">("todos");

  useEffect(() => {
    setSchedules(loadSchedules());
  }, []);

  const persist = (next: PriceSchedule[]) => {
    setSchedules(next);
    saveSchedules(next);
  };

  const handleSave = (s: PriceSchedule) => {
    persist([...schedules, s]);
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    persist(schedules.filter(s => s.id !== id));
  };

  const filtered = schedules.filter(s => filter === "todos" || getStatus(s) === filter);

  const counts: Record<ScheduleStatus, number> = {
    programado: schedules.filter(s => getStatus(s) === "programado").length,
    activo:     schedules.filter(s => getStatus(s) === "activo").length,
    expirado:   schedules.filter(s => getStatus(s) === "expirado").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">Programador de Precios</SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Programa cambios de precio automaticos con fecha de inicio y fin
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
            showForm
              ? "bg-gray-100 text-[var(--text-tertiary)] dark:bg-gray-800 cursor-not-allowed"
              : "bg-primary text-white hover:bg-primary-dark"
          )}
        >
          <Plus className="w-4 h-4" />
          Nuevo cambio
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(["programado", "activo", "expirado"] as ScheduleStatus[]).map(st => {
          const ui = STATUS_UI[st];
          return (
            <button
              key={st}
              onClick={() => setFilter(filter === st ? "todos" : st)}
              className={cn(
                "bg-[var(--surface-raised)] border rounded-xl p-3 text-left transition-colors",
                filter === st
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-gray-300 dark:hover:border-gray-600"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div className={cn("w-2 h-2 rounded-full", ui.dot)} />
                <span className="text-xs text-[var(--text-tertiary)]">{ui.label}</span>
              </div>
              <p className="text-xl font-bold text-[var(--text-primary)]">{counts[st]}</p>
            </button>
          );
        })}
      </div>

      {showForm && (
        <AddForm onSave={handleSave} onCancel={() => setShowForm(false)} />
      )}

      {/* List */}
      {filtered.length === 0 && !showForm && (
        <div className="text-center py-12 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
          <Clock className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">Sin cambios {filter !== "todos" ? `en estado "${STATUS_UI[filter as ScheduleStatus].label}"` : "programados"}.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(schedule => {
          const status = getStatus(schedule);
          const ui     = STATUS_UI[status];
          const diff   = ((schedule.newPrice - schedule.currentPrice) / schedule.currentPrice * 100).toFixed(1);
          const isUp   = schedule.newPrice > schedule.currentPrice;

          return (
            <div
              key={schedule.id}
              className={cn(
                "bg-[var(--surface-raised)] border rounded-xl p-4  transition-opacity",
                status === "expirado" ? "border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50 opacity-70" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                {/* Status dot */}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", ui.dot)} />
                  <span className={cn("text-xs font-medium shrink-0", ui.color)}>{ui.label}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{schedule.productName}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    <span className="text-xs text-[var(--text-tertiary)] line-through">{fmt(schedule.currentPrice)}</span>
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{fmt(schedule.newPrice)}</span>
                    <span className={cn(
                      "text-xs font-medium px-1.5 py-0.5 rounded-md",
                      isUp
                        ? "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]"
                        : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]"
                    )}>
                      {isUp ? "+" : ""}{diff}%
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Inicio: {new Date(schedule.startDate).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {schedule.endDate && (
                      <span className="flex items-center gap-1">
                        <X className="w-3 h-3" />
                        Fin: {new Date(schedule.endDate).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {!schedule.endDate && <span className="text-[var(--text-tertiary)] dark:text-[var(--text-primary)]">Sin fecha de fin</span>}
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(schedule.id)}
                  title="Eliminar"
                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] dark:hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
