"use client";
import { useState, useCallback, useEffect } from "react";
import { Tag, Plus, Trash2, ToggleLeft, ToggleRight, X, Loader2, RefreshCw } from "lucide-react";
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
  porcentaje: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  "2x1": "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  "3x2": "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  combo: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
  monto_fijo: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400",
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

function promoIcon(tipo: PromoType): string {
  switch (tipo) {
    case "porcentaje": return "🏷️";
    case "2x1": return "🎁";
    case "3x2": return "📦";
    case "combo": return "🛒";
    case "monto_fijo": return "💰";
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
    ? "border-l-[#00B4A6]"
    : status === "futura"
    ? "border-l-[#f97316]"
    : "border-l-gray-300 dark:border-l-gray-600";

  return (
    <div className={cn(
      "bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 border-l-4 p-4 shadow-sm",
      "transition-all hover:shadow-md",
      statusColor,
      !promo.activa && "opacity-60",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", TIPO_BADGE[promo.tipo])}>
              {TIPO_LABELS[promo.tipo]}
            </span>
            <span className="text-sm font-bold text-gray-800 dark:text-white">
              {promoIcon(promo.tipo)} {promoBadgeText(promo)}
            </span>
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-1 truncate">{promo.nombre}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(promo.fechaInicio)} → {fmtDate(promo.fechaFin)}
          </p>
          {promo.condicion && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Cond: {promo.condicion}</p>
          )}
          {promo.categorias.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              Cats: {promo.categorias.join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggle(promo.id)}
            disabled={loading}
            aria-label={promo.activa ? "Desactivar promoción" : "Activar promoción"}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
          >
            {promo.activa
              ? <ToggleRight className="h-5 w-5 text-[#00B4A6]" />
              : <ToggleLeft className="h-5 w-5 text-gray-400" />
            }
          </button>
          <button
            onClick={() => onDelete(promo.id)}
            disabled={loading}
            aria-label="Eliminar promoción"
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4 text-gray-500", loading && "animate-spin")} />
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setFormError(null); }}
            aria-label="Nueva promoción"
            className={cn(
              "flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold transition-all",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
              showForm
                ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                : "text-white",
            )}
            style={showForm ? {} : {
              background: "linear-gradient(135deg, #00B4A6 0%, #009690 100%)",
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
        <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-2.5 border border-emerald-200 dark:border-emerald-800">
          ✓ {successMsg}
        </div>
      )}

      {/* Stats rápido */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">
          {activeToday} activas hoy
        </span>
        <span className="text-xs px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
          {promos.filter(p => promoStatus(p) === "futura").length} futuras
        </span>
        <span className="text-xs px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
          {promos.filter(p => promoStatus(p) === "pasada").length} pasadas
        </span>
      </div>

      {/* Formulario nueva promo */}
      {showForm && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <Tag className="h-4 w-4 text-[#f97316]" />
            Nueva promoción
          </h2>

          {formError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Nombre *</label>
              <input
                type="text"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Descuento fin de semana"
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Tipo *</label>
              <select
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as PromoType }))}
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
              >
                {(Object.keys(TIPO_LABELS) as PromoType[]).map(t => (
                  <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {(form.tipo === "porcentaje" || form.tipo === "monto_fijo" || form.tipo === "combo") && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  {form.tipo === "porcentaje" ? "Porcentaje (%)" : "Monto (S/)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor}
                  onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder={form.tipo === "porcentaje" ? "20" : "5.00"}
                  className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Categorías (separadas por coma)</label>
              <input
                type="text"
                value={form.categorias}
                onChange={e => setForm(f => ({ ...f, categorias: e.target.value }))}
                placeholder="Lácteos, Bebidas"
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Inicio *</label>
              <input
                type="date"
                value={form.fechaInicio}
                onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))}
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Fin *</label>
              <input
                type="date"
                value={form.fechaFin}
                onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))}
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Condición (opcional)
              </label>
              <input
                type="text"
                value={form.condicion}
                onChange={e => setForm(f => ({ ...f, condicion: e.target.value }))}
                placeholder='Ej: "min_cantidad:3" o "min_monto:50"'
                className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
              />
            </div>
          </div>

          {/* Preview badge */}
          {form.nombre && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <span className="text-xs text-gray-500 dark:text-gray-400">Vista previa:</span>
              <span className="text-sm font-bold">
                {promoIcon(form.tipo)}{" "}
                {form.tipo === "porcentaje" && form.valor ? `${form.valor}% OFF` :
                  form.tipo === "monto_fijo" && form.valor ? `S/ ${form.valor} OFF` :
                  form.tipo === "combo" && form.valor ? `Combo S/ ${form.valor}` :
                  TIPO_LABELS[form.tipo]}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-300">— {form.nombre}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-10 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #00B4A6 0%, #009690 100%)",
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
              "px-3 h-8 rounded-full text-xs font-medium transition-all capitalize",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
              filter === f
                ? "text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
            )}
            style={filter === f ? {
              background: "linear-gradient(135deg, #00B4A6 0%, #009690 100%)",
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#00B4A6]" />
        </div>
      ) : filteredPromos.length === 0 ? (
        <div className="text-center py-12">
          <Tag className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No hay promociones</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Crea una nueva promoción con el botón de arriba</p>
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
