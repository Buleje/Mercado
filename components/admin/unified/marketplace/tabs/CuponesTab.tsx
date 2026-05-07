"use client";

import { useState, useEffect, useCallback } from "react";
import { Ticket, Zap, Eye, EyeOff, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { TableSkeleton } from "../types";

// ── Tipos locales ────────────────────────────────────────────────────────────

interface CouponItem {
  id: string;
  code: string;
  description: string;
  discountType: string;
  discountValue: number;
  minPurchase: number | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

type CouponFormState = {
  code: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: string;
  minPurchase: string;
  maxUses: string;
  expiresAt: string;
};

// ── Plantillas ───────────────────────────────────────────────────────────────

const COUPON_TEMPLATES: Array<{
  id: string; label: string; emoji: string; hint: string; build: () => CouponFormState;
}> = [
  {
    id: "welcome",
    label: "Bienvenida 10%",
    emoji: "👋",
    hint: "Primera compra · 10% off",
    build: () => ({ code: "BIENVENIDO10", description: "10% en tu primera compra", discountType: "percent", discountValue: "10", minPurchase: "", maxUses: "", expiresAt: "" }),
  },
  {
    id: "repurchase",
    label: "Recompra S/ 5",
    emoji: "🔁",
    hint: "Vuelve · descuento fijo",
    build: () => ({ code: "VUELVE5", description: "S/ 5 de descuento por volver", discountType: "fixed", discountValue: "5", minPurchase: "30", maxUses: "", expiresAt: "" }),
  },
  {
    id: "birthday",
    label: "Cumpleaños 15%",
    emoji: "🎂",
    hint: "Mes de cumpleaños",
    build: () => ({ code: "CUMPLE15", description: "15% en tu mes de cumpleaños", discountType: "percent", discountValue: "15", minPurchase: "", maxUses: "1", expiresAt: "" }),
  },
  {
    id: "abandoned",
    label: "Recuperar carrito 12%",
    emoji: "🛒",
    hint: "Carrito abandonado · 48h",
    build: () => {
      const expires = new Date();
      expires.setDate(expires.getDate() + 2);
      return { code: "VUELVE12", description: "12% para terminar tu compra", discountType: "percent", discountValue: "12", minPurchase: "", maxUses: "1", expiresAt: expires.toISOString() };
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function couponMetrics(c: CouponItem) {
  const avgTicket = c.minPurchase ? Math.max(c.minPurchase, 25) : 25;
  const discountedAmount = c.discountType === "percent"
    ? c.usedCount * avgTicket * (c.discountValue / 100)
    : c.usedCount * c.discountValue;
  const attributedRevenue = c.usedCount * avgTicket;
  const usagePct = c.maxUses ? Math.min(100, (c.usedCount / c.maxUses) * 100) : 0;
  const net = attributedRevenue - discountedAmount;
  const roiPct = discountedAmount > 0 ? (net / discountedAmount) * 100 : null;
  return { usagePct, discountedAmount, attributedRevenue, roiPct };
}

function CouponMiniBar({ pct, max }: { pct: number; max?: number | null }) {
  if (!max) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">ilimitado</span>;
  }
  const tone = pct >= 90 ? "bg-[var(--data-error-500)]" : pct >= 60 ? "bg-[var(--data-warning-500)]" : "bg-primary";
  return (
    <div className="w-full">
      <div className="h-1.5 w-full bg-[var(--surface-sunken)] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CuponesTab
// ─────────────────────────────────────────────
export default function CuponesTab() {
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CouponFormState>({
    code: "", description: "", discountType: "percent", discountValue: "", minPurchase: "", maxUses: "", expiresAt: "",
  });

  const fetchCoupons = useCallback(() => {
    setLoading(true);
    fetch("/api/marketplace/coupons")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.data) setCoupons(d.data); })
      .catch((err) => { console.warn("[MarketplaceModule] fetch failed", err); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/coupons", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          code: form.code,
          description: form.description,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minPurchase: form.minPurchase ? Number(form.minPurchase) : null,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      setForm({ code: "", description: "", discountType: "percent", discountValue: "", minPurchase: "", maxUses: "", expiresAt: "" });
      fetchCoupons();
    } catch (err) {
      setError(`Error al crear cupón: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/marketplace/coupons/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ active: !active }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      fetchCoupons();
    } catch (err) {
      setError(`Error al actualizar cupón: ${err instanceof Error ? err.message : "desconocido"}`);
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("¿Eliminar este cupón?")) return;
    try {
      const res = await fetch(`/api/marketplace/coupons/${id}`, {
        method: "DELETE",
        headers: csrfHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      fetchCoupons();
    } catch (err) {
      setError(`Error al eliminar cupón: ${err instanceof Error ? err.message : "desconocido"}`);
    }
  };

  const applyTemplate = (templateId: string) => {
    const t = COUPON_TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    setForm(t.build());
    setShowForm(true);
  };

  const aggregate = coupons.reduce(
    (acc, c) => { const m = couponMetrics(c); acc.uses += c.usedCount; acc.discounted += m.discountedAmount; acc.revenue += m.attributedRevenue; return acc; },
    { uses: 0, discounted: 0, revenue: 0 },
  );

  if (loading) return <TableSkeleton />;

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent";

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-2xl text-sm text-[var(--data-error-500)]">
          <span className="font-bold flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 rounded hover:bg-[var(--data-error-100)]"
            aria-label="Cerrar error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{coupons.length}</strong> cupón{coupons.length !== 1 ? "es" : ""} · {aggregate.uses} usos totales
        </p>
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition">
          + Nuevo Cupón
        </button>
      </div>

      {/* KPIs */}
      {coupons.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
            <p className="text-xs font-bold text-[var(--text-secondary)]">Usos totales</p>
            <p className="text-xl font-extrabold text-primary mt-1">{aggregate.uses}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{coupons.filter((c) => c.active).length} cupones activos</p>
          </div>
          <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
            <p className="text-xs font-bold text-[var(--text-secondary)]">Descontado total</p>
            <p className="text-xl font-extrabold text-[var(--data-warning-500)] mt-1">S/ {aggregate.discounted.toFixed(2)}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">estimado por usos × valor</p>
          </div>
          <div className="bg-white border border-[var(--rule-base)] rounded-xl p-3">
            <p className="text-xs font-bold text-[var(--text-secondary)]">Ventas atribuidas</p>
            <p className="text-xl font-extrabold text-[var(--data-success-500)] mt-1">S/ {aggregate.revenue.toFixed(2)}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">aprox. ticket promedio</p>
          </div>
        </div>
      )}

      {/* Plantillas */}
      <div className="bg-white border border-[var(--rule-base)] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">Empieza con una plantilla</CardTitle>
          <span className="text-xs text-[var(--text-secondary)]">· pre-llena el formulario en 1 clic</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COUPON_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => applyTemplate(t.id)}
              className="text-left rounded-xl border border-[var(--rule-base)] hover:border-primary/50 hover:bg-primary/5 transition p-3">
              <div className="text-2xl mb-1">{t.emoji}</div>
              <p className="text-sm font-bold text-[var(--text-primary)]">{t.label}</p>
              <p className="text-xs text-[var(--text-secondary)]">{t.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-gray-50 border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Código</label>
              <input type="text" placeholder="BIENVENIDO10" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Tipo</label>
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as "percent" | "fixed" })} className={inputCls}>
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Valor {form.discountType === "percent" ? "(%)" : "(S/)"}</label>
              <input type="number" placeholder="10" value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Compra mínima (S/)</label>
              <input type="number" placeholder="Opcional" value={form.minPurchase}
                onChange={(e) => setForm({ ...form, minPurchase: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Usos máximos</label>
              <input type="number" placeholder="Ilimitado" value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Descripción</label>
              <input type="text" placeholder="Descuento de bienvenida" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Vence el</label>
              <input type="datetime-local" value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-gray-100 transition">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={saving || !form.code || !form.discountValue}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50">
              {saving ? "Guardando…" : "Crear Cupón"}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {coupons.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay cupones todavía</p>
          <p className="text-xs mt-1">Crea un cupón para atraer más clientes al marketplace.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => {
            const m = couponMetrics(c);
            // eslint-disable-next-line react-hooks/purity -- expiry comparison is allowed to drift across renders
            const expired = c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
            return (
              <div key={c.id} className={cn("bg-white border border-[var(--rule-base)] rounded-xl p-4", !c.active && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-sm text-primary">{c.code}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">
                        {c.discountType === "percent" ? `${c.discountValue}%` : `S/ ${c.discountValue.toFixed(2)}`}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold",
                        c.active && !expired ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "bg-gray-200 text-[var(--text-secondary)]")}>
                        {expired ? "Expirado" : c.active ? "Activo" : "Inactivo"}
                      </span>
                      {c.minPurchase && (
                        <span className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-semibold bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                          Mín S/ {c.minPurchase.toFixed(2)}
                        </span>
                      )}
                    </div>
                    {c.description && <p className="text-xs text-[var(--text-secondary)] mt-1">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleActive(c.id, c.active)} title={c.active ? "Desactivar" : "Activar"}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition">
                      {c.active ? <EyeOff className="h-4 w-4 text-[var(--text-tertiary)]" /> : <Eye className="h-4 w-4 text-[var(--data-success-500)]" />}
                    </button>
                    <button onClick={() => deleteCoupon(c.id)} title="Eliminar"
                      className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] transition">
                      <X className="h-4 w-4 text-[var(--data-error-500)]" />
                    </button>
                  </div>
                </div>

                {/* Métricas */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-bold">Usos</p>
                    <p className="text-sm font-extrabold text-[var(--text-primary)]">
                      {c.usedCount}{c.maxUses ? <span className="text-xs text-[var(--text-tertiary)] font-semibold">/{c.maxUses}</span> : ""}
                    </p>
                    <CouponMiniBar pct={m.usagePct} max={c.maxUses} />
                  </div>
                  <div>
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-bold">Descontado</p>
                    <p className="text-sm font-extrabold text-[var(--data-warning-500)]">S/ {m.discountedAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-bold">Ventas atribuidas</p>
                    <p className="text-sm font-extrabold text-[var(--data-success-500)]">S/ {m.attributedRevenue.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-bold">ROI estimado</p>
                    {m.roiPct === null ? (
                      <p className="text-sm font-bold text-[var(--text-tertiary)]">—</p>
                    ) : (
                      <p className={cn("text-sm font-extrabold", m.roiPct >= 100 ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]")}>
                        {m.roiPct >= 0 ? "+" : ""}{m.roiPct.toFixed(0)}%
                      </p>
                    )}
                  </div>
                </div>

                {(c.expiresAt || c.maxUses) && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-2 pt-2 border-t border-[var(--rule-base)]">
                    {c.expiresAt && <>Vence: <strong>{new Date(c.expiresAt).toLocaleDateString("es-PE")}</strong></>}
                    {c.expiresAt && c.maxUses ? " · " : ""}
                    {c.maxUses && <>Cap: <strong>{c.maxUses} usos</strong></>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
