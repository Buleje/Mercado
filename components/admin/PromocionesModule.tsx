"use client";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useCallback, useEffect } from "react";
import {
  Tag, Plus, Trash2, ToggleLeft, ToggleRight, X, Loader2, RefreshCw,
  Gift, Package, ShoppingCart, DollarSign,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

// ── Types ──────────────────────────────────────────────────────────────────────

type PromoType = "porcentaje" | "2x1" | "3x2" | "combo" | "monto_fijo";

interface Promocion {
  id: string;
  nombre: string;
  tipo: PromoType;
  valor: number;
  categorias: string[];
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
  condicion?: string | null;
}

type PromoFilter = "todas" | "hoy" | "futuras" | "pasadas";

// ── Constants ──────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<PromoType, string> = {
  porcentaje: "% Descuento",
  "2x1": "2×1",
  "3x2": "3×2",
  combo: "Combo",
  monto_fijo: "Monto fijo",
};

const TIPO_BADGE: Record<PromoType, string> = {
  porcentaje: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
  "2x1": "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
  "3x2": "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
  combo: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
  monto_fijo: "bg-teal-100 dark:bg-teal-900/30 text-[var(--accent-dark)] dark:text-teal-400",
};

const EMPTY_FORM = {
  nombre: "",
  tipo: "porcentaje" as PromoType,
  valor: "",
  categorias: "",
  fechaInicio: new Date().toISOString().slice(0, 10),
  fechaFin: "",
  condicion: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function promoBadgeText(promo: Promocion): string {
  switch (promo.tipo) {
    case "porcentaje": return `${promo.valor}% OFF`;
    case "2x1": return "2×1";
    case "3x2": return "3×2";
    case "combo": return `Combo S/ ${promo.valor}`;
    case "monto_fijo": return `S/ ${promo.valor} OFF`;
  }
}

// Render literal de cada icon para evitar react-hooks/static-components
// (no se permite resolver componente dinamico con `const Icon = fn(); <Icon ...>`).
function PromoIcon({ tipo, className, strokeWidth }: { tipo: PromoType; className?: string; strokeWidth?: number }) {
  switch (tipo) {
    case "porcentaje": return <Tag className={className} strokeWidth={strokeWidth} />;
    case "2x1": return <Gift className={className} strokeWidth={strokeWidth} />;
    case "3x2": return <Package className={className} strokeWidth={strokeWidth} />;
    case "combo": return <ShoppingCart className={className} strokeWidth={strokeWidth} />;
    case "monto_fijo": return <DollarSign className={className} strokeWidth={strokeWidth} />;
  }
}

function promoStatus(promo: Promocion): "hoy" | "futura" | "pasada" {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(promo.fechaInicio);
  const end = new Date(promo.fechaFin);
  end.setHours(23, 59, 59, 999);
  if (now > end) return "pasada";
  if (now < start) return "futura";
  return "hoy";
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// ── PromoCard ──────────────────────────────────────────────────────────────────

function PromoCard({ promo, onToggle, onDelete, loading }: {
  promo: Promocion;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  const status = promoStatus(promo);
  const statusColor = status === "hoy"
    ? "border-l-[var(--accent)]"
    : status === "futura"
    ? "border-l-[#f97316]"
    : "border-l-gray-300 dark:border-l-gray-600";

  return (
    <div className={cn(
      "bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] border-l-4 p-4 ",
      "transition-all hover:shadow-[var(--shadow-sm)]",
      statusColor,
      !promo.activa && "opacity-60",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", TIPO_BADGE[promo.tipo])}>
              {TIPO_LABELS[promo.tipo]}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
              <PromoIcon tipo={promo.tipo} className="h-3.5 w-3.5" strokeWidth={1.75} />
              {promoBadgeText(promo)}
            </span>
          </div>
          <p className="text-sm font-semibold text-[var(--text-secondary)] mt-1 truncate">{promo.nombre}</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {fmtDate(promo.fechaInicio)} → {fmtDate(promo.fechaFin)}
          </p>
          {promo.condicion && (
            <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5">Cond: {promo.condicion}</p>
          )}
          {promo.categorias.length > 0 && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
              Cats: {promo.categorias.join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(promo.id)}
            disabled={loading}
            aria-label={promo.activa ? "Desactivar promoción" : "Activar promoción"}
            className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {promo.activa
              ? <ToggleRight className="h-5 w-5 text-primary" />
              : <ToggleLeft className="h-5 w-5 text-[var(--text-tertiary)]" />
            }
          </button>
          <button
            onClick={() => onDelete(promo.id)}
            disabled={loading}
            aria-label="Eliminar promoción"
            className="h-11 w-11 flex items-center justify-center rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          >
            <Trash2 className="h-4 w-4 text-[var(--data-error-500)]" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PromocionesModule() {
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<PromoFilter>("todas");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto-clear success messages
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discount-rules");
      if (res.ok) {
        const data = await res.json();
        setPromos(data);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  const filteredPromos = promos.filter(p => {
    if (filter === "todas") return true;
    const s = promoStatus(p);
    if (filter === "hoy") return s === "hoy";
    if (filter === "futuras") return s === "futura";
    return s === "pasada";
  });

  const handleToggle = useCallback(async (id: string) => {
    const promo = promos.find(p => p.id === id);
    if (!promo) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/discount-rules/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ activa: !promo.activa }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPromos(prev => prev.map(p => p.id === id ? updated : p));
      }
    } catch {
      // silencioso
    } finally {
      setSaving(false);
    }
  }, [promos]);

  const handleDelete = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/discount-rules/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPromos(prev => prev.filter(p => p.id !== id));
        setSuccessMsg("Promoción eliminada");
      }
    } catch {
      // silencioso
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    setFormError(null);

    if (!form.nombre.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (!form.fechaInicio || !form.fechaFin) { setFormError("Las fechas de inicio y fin son obligatorias."); return; }
    if (new Date(form.fechaFin) < new Date(form.fechaInicio)) { setFormError("La fecha de fin no puede ser anterior a la de inicio."); return; }
    if ((form.tipo === "porcentaje" || form.tipo === "monto_fijo" || form.tipo === "combo") && !form.valor) {
      setFormError("El valor es obligatorio para este tipo de promoción.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/discount-rules", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          nombre:      form.nombre.trim(),
          tipo:        form.tipo,
          valor:       form.valor ? parseFloat(form.valor) : 0,
          categorias:  form.categorias ? form.categorias.split(",").map(s => s.trim()).filter(Boolean) : [],
          condicion:   form.condicion.trim() || undefined,
          fechaInicio: form.fechaInicio,
          fechaFin:    form.fechaFin,
          activa:      true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error ? JSON.stringify(err.error) : "Error al guardar");
        return;
      }

      const newPromo = await res.json();
      setPromos(prev => [newPromo, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      setSuccessMsg("Promoción creada correctamente");
    } catch {
      setFormError("Error de conexión. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }, [form]);

  const activeToday = promos.filter(p => p.activa && promoStatus(p) === "hoy").length;

  return (
    <div className="space-y-5 pb-8">
      <AdminModuleHeader
        title="Promociones"
        description="Gestión de descuentos y ofertas activas"
        icon={Tag}
        iconColor="#f97316"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPromos}
            disabled={loading}
            aria-label="Recargar promociones"
            className="h-11 w-11 flex items-center justify-center rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4 text-[var(--text-secondary)]", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setFormError(null); }}
            aria-label="Nueva promoción"
            className={cn(
              "flex items-center gap-1.5 px-3 h-11 rounded-xl text-xs font-semibold transition-all",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              showForm
                ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                : "text-white",
            )}
            style={showForm ? {} : {
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
              boxShadow: "0 4px 12px -2px rgba(45,106,79,0.4)",
            }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancelar" : "Nueva promo"}
          </button>
        </div>
      </AdminModuleHeader>

      {/* Mensaje de éxito */}
      {successMsg && (
        <div className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl px-4 py-2.5 border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
          ✓ {successMsg}
        </div>
      )}

      {/* Stats rápido */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium">
          {activeToday} activas hoy
        </span>
        <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">
          {promos.filter(p => promoStatus(p) === "futura").length} futuras
        </span>
        <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-medium">
          {promos.filter(p => promoStatus(p) === "pasada").length} pasadas
        </span>
      </div>

      {/* Formulario nueva promo */}
      {showForm && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-5  space-y-4">
          <SectionTitle className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Tag className="h-4 w-4 text-[var(--data-warning-500)]" />
            Nueva promoción
          </SectionTitle>

          {formError && (
            <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Nombre *</label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Descuento fin de semana"
                className="w-full text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 h-12 text-[var(--text-primary)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Tipo *</label>
              <select
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as PromoType }))}
                className="w-full text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 h-12 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              >
                {(Object.keys(TIPO_LABELS) as PromoType[]).map(t => (
                  <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {(form.tipo === "porcentaje" || form.tipo === "monto_fijo" || form.tipo === "combo") && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">
                  {form.tipo === "porcentaje" ? "Porcentaje (%)" : "Monto (S/)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder={form.tipo === "porcentaje" ? "20" : "5.00"}
                  className="w-full text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 h-12 text-[var(--text-primary)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Categorías (separadas por coma)</label>
              <input
                type="text"
                value={form.categorias}
                onChange={e => setForm(f => ({ ...f, categorias: e.target.value }))}
                placeholder="Lácteos, Bebidas"
                className="w-full text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 h-12 text-[var(--text-primary)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Inicio *</label>
              <input
                type="date"
                value={form.fechaInicio}
                onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
                className="w-full text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 h-12 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Fin *</label>
              <input
                type="date"
                value={form.fechaFin}
                onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))}
                className="w-full text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 h-12 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Condición (opcional)
              </label>
              <input
                type="text"
                value={form.condicion}
                onChange={e => setForm(f => ({ ...f, condicion: e.target.value }))}
                placeholder='Ej: "min_cantidad:3" o "min_monto:50"'
                className="w-full text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 h-12 text-[var(--text-primary)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
          </div>

          {/* Preview badge */}
          {form.nombre && (
            <div className="flex items-center gap-2 p-3 bg-[var(--surface-sunken)] rounded-xl">
              <span className="text-xs text-[var(--text-tertiary)]">Vista previa:</span>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                <PromoIcon tipo={form.tipo} className="h-3.5 w-3.5" strokeWidth={1.75} />{" "}
                {form.tipo === "porcentaje" && form.valor ? `${form.valor}% OFF` :
                  form.tipo === "monto_fijo" && form.valor ? `S/ ${form.valor} OFF` :
                  form.tipo === "combo" && form.valor ? `Combo S/ ${form.valor}` :
                  TIPO_LABELS[form.tipo]}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">— {form.nombre}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-12 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
              boxShadow: "0 4px 12px -2px rgba(45,106,79,0.4)",
            }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Guardando..." : "Guardar promoción"}
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {(["todas", "hoy", "futuras", "pasadas"] as PromoFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 min-h-11 rounded-full text-sm font-medium transition-all capitalize",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              filter === f
                ? "text-white"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700",
            )}
            style={filter === f ? {
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
            } : {}}
          >
            {f === "todas" ? "Todas" : f === "hoy" ? "Activas hoy" : f === "futuras" ? "Futuras" : "Pasadas"}
            <span className="ml-1.5 opacity-70">
              ({promos.filter(p => {
                if (f === "todas") return true;
                const s = promoStatus(p);
                if (f === "hoy") return s === "hoy";
                if (f === "futuras") return s === "futura";
                return s === "pasada";
              }).length})
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <LoadingState />
      ) : filteredPromos.length === 0 ? (
        <div className="text-center py-12">
          <Tag className="h-10 w-10 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">No hay promociones</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Crea una nueva promoción con el botón de arriba</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredPromos.map(promo => (
            <PromoCard key={promo.id} promo={promo} onToggle={handleToggle} onDelete={handleDelete} loading={saving} />
          ))}
        </div>
      )}
    </div>
  );
}
