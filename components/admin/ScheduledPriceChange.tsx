"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Calendar, Search, Plus, Trash2, Clock, ChevronDown, ChevronUp, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PriceChangeEvent {
  id: string;
  productId: string;
  productName: string;
  currentPrice: number;
  newPrice: number;
  startAt: string;   // ISO
  endAt?: string;    // ISO optional
  status: "pending" | "active" | "done" | "cancelled";
}

interface Product {
  id: string;
  name: string;
  price: number;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = "scheduled_price_changes_v1";

function loadEvents(): PriceChangeEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as PriceChangeEvent[] : [];
  } catch { return []; }
}

function saveEvents(events: PriceChangeEvent[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events));
  } catch { /* ignore */ }
}

// ── Status helpers ────────────────────────────────────────────────────────────

function resolveStatus(event: PriceChangeEvent): PriceChangeEvent["status"] {
  const now = Date.now();
  const start = new Date(event.startAt).getTime();
  const end = event.endAt ? new Date(event.endAt).getTime() : null;
  if (event.status === "cancelled") return "cancelled";
  if (now < start) return "pending";
  if (end && now > end) return "done";
  return "active";
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function _fmtDateTimeLocal(iso: string) {
  // Format for datetime-local input
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localNowPlus(hours: number) {
  const d = new Date(Date.now() + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_STYLES: Record<PriceChangeEvent["status"], { label: string; cls: string }> = {
  pending:   { label: "Pendiente", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]" },
  active:    { label: "Activo",    cls: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" },
  done:      { label: "Finalizado", cls: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]" },
  cancelled: { label: "Cancelado", cls: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]" },
};

// ── Add event form ─────────────────────────────────────────────────────────────

interface AddFormProps {
  onAdd: (event: PriceChangeEvent) => void;
  onCancel: () => void;
}

function AddForm({ onAdd, onCancel }: AddFormProps) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [startAt, setStartAt] = useState(localNowPlus(1));
  const [endAt, setEndAt] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setProducts([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/products?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setProducts(Array.isArray(data) ? data : (data.products ?? []));
        setShowDropdown(true);
      }
    } catch {
      setProducts([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(search), 300);
    return () => clearTimeout(t);
  }, [search, searchProducts]);

  const handleSubmit = () => {
    if (!selected || !newPrice || !startAt) return;
    const parsed = parseFloat(newPrice);
    if (isNaN(parsed) || parsed < 0) return;

    const event: PriceChangeEvent = {
      id: `pce-${Date.now()}`,
      productId: selected.id,
      productName: selected.name,
      currentPrice: selected.price,
      newPrice: parsed,
      startAt: new Date(startAt).toISOString(),
      endAt: endAt ? new Date(endAt).toISOString() : undefined,
      status: "pending",
    };
    onAdd(event);
  };

  const priceDiff = selected && newPrice
    ? ((parseFloat(newPrice) - selected.price) / selected.price * 100).toFixed(1)
    : null;

  const isIncrease = priceDiff !== null && parseFloat(priceDiff) > 0;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 dark:border-primary/40 p-5 space-y-4">
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">Nuevo cambio programado</h4>

      {/* Product search */}
      <div className="relative">
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Producto</label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={selected ? selected.name : search}
            onChange={(e) => {
              setSelected(null);
              setSearch(e.target.value);
            }}
            onFocus={() => search.length >= 2 && setShowDropdown(true)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {showDropdown && products.length > 0 && !selected && (
          <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelected(p); setShowDropdown(false); setSearch(""); setNewPrice(String(p.price)); }}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--surface-sunken)] transition-colors text-left"
              >
                <span className="text-sm text-[var(--text-primary)] truncate">{p.name}</span>
                <span className="text-sm text-[var(--text-tertiary)] shrink-0 ml-2">S/ {p.price.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Price inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Precio actual</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-[var(--text-secondary)]">S/</span>
            <input
              readOnly
              value={selected ? selected.price.toFixed(2) : ""}
              placeholder="—"
              className="w-full px-2 py-2 text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Precio nuevo
            {priceDiff !== null && (
              <span className={cn("ml-2 font-semibold", isIncrease ? "text-[var(--data-error)]" : "text-primary")}>
                {isIncrease ? "+" : ""}{priceDiff}%
              </span>
            )}
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-[var(--text-secondary)]">S/</span>
            <input
              type="number"
              min={0}
              step={0.10}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-2 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      </div>

      {/* Date inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Inicia</label>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full px-2 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
            Termina <span className="text-[var(--text-tertiary)]">(opcional)</span>
          </label>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full px-2 py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-gray-200 hover:bg-[var(--surface-sunken)] rounded-lg transition-colors">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selected || !newPrice || !startAt}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-[#235c42] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          Programar cambio
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ScheduledPriceChange() {
  const [events, setEvents] = useState<PriceChangeEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    setEvents(loadEvents());
  }, []);

  // Refresh statuses every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setEvents((prev) => prev.map((e) => ({ ...e, status: resolveStatus(e) })));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleAdd = useCallback((event: PriceChangeEvent) => {
    setEvents((prev) => {
      const next = [event, ...prev];
      saveEvents(next);
      return next;
    });
    setShowForm(false);
  }, []);

  const handleCancel = useCallback((id: string) => {
    setEvents((prev) => {
      const next = prev.map((e) => e.id === id ? { ...e, status: "cancelled" as const } : e);
      saveEvents(next);
      return next;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveEvents(next);
      return next;
    });
  }, []);

  const activeEvents = events.filter((e) => e.status === "pending" || e.status === "active");
  const pastEvents = events.filter((e) => e.status === "done" || e.status === "cancelled");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-[var(--text-primary)]">Cambios de precio programados</CardTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {activeEvents.length} cambio{activeEvents.length !== 1 ? "s" : ""} pendiente{activeEvents.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary hover:bg-[#235c42] text-white transition-colors"
        >
          <Plus size={14} />
          Programar
        </button>
      </div>

      {/* Form */}
      {showForm && <AddForm onAdd={handleAdd} onCancel={() => setShowForm(false)} />}

      {/* Active events */}
      {activeEvents.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] py-10 text-center">
          <Calendar size={28} className="mx-auto text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mb-2" />
          <p className="text-sm text-[var(--text-tertiary)]">No hay cambios programados</p>
        </div>
      )}

      <div className="space-y-2">
        {activeEvents.map((event) => {
          const status = resolveStatus(event);
          const { label, cls } = STATUS_STYLES[status];
          const diff = ((event.newPrice - event.currentPrice) / event.currentPrice * 100).toFixed(1);
          const isIncrease = event.newPrice > event.currentPrice;

          return (
            <div
              key={event.id}
              className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cls)}>
                      {label}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {event.productName}
                    </span>
                    <span className={cn("text-xs font-semibold", isIncrease ? "text-[var(--data-error)]" : "text-primary")}>
                      {isIncrease ? "sube" : "baja"} {Math.abs(parseFloat(diff))}%
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-[var(--text-tertiary)]">
                      <span className="line-through">S/ {event.currentPrice.toFixed(2)}</span>
                      <span className="mx-1 text-[var(--text-tertiary)]">→</span>
                      <span className="font-semibold text-[var(--text-primary)]">S/ {event.newPrice.toFixed(2)}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                      <Clock size={11} />
                      {fmtDateTime(event.startAt)}
                      {event.endAt && ` – ${fmtDateTime(event.endAt)}`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {status === "pending" && (
                    <button
                      onClick={() => handleCancel(event.id)}
                      className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-warning)] px-2 py-1 rounded-lg hover:bg-[var(--data-warning-50)] dark:hover:bg-amber-950/30 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Past events toggle */}
      {pastEvents.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] transition-colors"
          >
            {showDone ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showDone ? "Ocultar" : "Ver"} historial ({pastEvents.length})
          </button>

          {showDone && (
            <div className="mt-2 space-y-2">
              {pastEvents.map((event) => {
                const { label, cls } = STATUS_STYLES[event.status];
                return (
                  <div
                    key={event.id}
                    className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]/50 px-4 py-3 opacity-70"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cls)}>
                        {label}
                      </span>
                      <span className="text-sm text-[var(--text-secondary)] truncate">{event.productName}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        S/ {event.currentPrice.toFixed(2)} → S/ {event.newPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
