"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Ticket, Plus, Trash2, Check, X, Loader2, Copy, Gift, Sparkles, Zap, UserPlus, PartyPopper, Settings, Calendar, MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useUndoToast } from "@/components/admin/shared/UndoToast";
import { csrfHeaders } from "@/lib/csrf-client";

type Coupon = {
  id: string; code: string; description: string;
  discountType: "percent" | "fixed" | "giftcard"; discountValue: number;
  balance?: number;
  minPurchase?: number; maxUses?: number; usedCount: number;
  active: boolean; expiresAt?: string; createdAt: string;
  storeId?: string | null;
};

type AutoRule = {
  id: string;
  type: "birthday" | "first-purchase" | "inactive" | "min-spend" | "referral";
  enabled: boolean;
  config: {
    discountType?: "percent" | "fixed";
    discountValue?: number;
    validityDays?: number;
    inactiveDays?: number;
    minSpend?: number;
    autoSend?: boolean;
  };
};

type GeneratedCouponLog = {
  id: string;
  date: string;
  customer: string;
  ruleType: string;
  couponCode: string;
  status: "sent" | "pending" | "used";
};

/** Reads the active store ID from sessionStorage or cookie for vendor context. */
function getActiveStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const ss = sessionStorage.getItem("active-tenant-id");
    if (ss) return ss;
  } catch { /* ignore */ }
  const match = document.cookie.match(/(?:^|;\s*)active-tenant-id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function CouponsTab() {
  const { confirm } = useConfirm();
  const { showUndo } = useUndoToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [couponScope, setCouponScope] = useState<"tienda" | "plataforma">("plataforma");
  const [form, setForm] = useState({ code: "", description: "", discountType: "percent" as "percent" | "fixed" | "giftcard", discountValue: 10, balance: 0, minPurchase: 0, maxUses: 0, expiresAt: "" });

  // Auto-rules state
  const [autoRules, setAutoRules] = useState<AutoRule[]>(() => {
    try {
      const stored = localStorage.getItem("coupon-auto-rules");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [
      { id: "birthday", type: "birthday", enabled: false, config: { discountType: "percent", discountValue: 10, validityDays: 7, autoSend: false } },
      { id: "first-purchase", type: "first-purchase", enabled: false, config: { discountType: "percent", discountValue: 15, validityDays: 30, autoSend: false } },
      { id: "inactive", type: "inactive", enabled: false, config: { discountType: "percent", discountValue: 20, inactiveDays: 30, validityDays: 14, autoSend: false } },
      { id: "min-spend", type: "min-spend", enabled: false, config: { discountType: "fixed", discountValue: 10, minSpend: 100, autoSend: false } },
      { id: "referral", type: "referral", enabled: false, config: { discountType: "percent", discountValue: 10, validityDays: 30, autoSend: false } },
    ];
  });
  const [editingRule, setEditingRule] = useState<AutoRule | null>(null);
  const [showRuleConfig, setShowRuleConfig] = useState(false);
  const [generatedLogs, _setGeneratedLogs] = useState<GeneratedCouponLog[]>(() => {
    try {
      const stored = localStorage.getItem("coupon-generated-logs");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [templatePattern, setTemplatePattern] = useState("BDAY{MMDD}{RND3}");
  const [whatsappCoupon, setWhatsappCoupon] = useState<Coupon | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const load = useCallback(() => {
    fetch("/api/coupons").then(r => r.ok ? r.json() : []).then(d => setCoupons(Array.isArray(d) ? d : d?.coupons ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Save auto-rules to localStorage
  useEffect(() => {
    if (autoRules.length > 0) {
      localStorage.setItem("coupon-auto-rules", JSON.stringify(autoRules));
    }
  }, [autoRules]);

  // Save logs to localStorage
  useEffect(() => {
    if (generatedLogs.length >= 0) {
      localStorage.setItem("coupon-generated-logs", JSON.stringify(generatedLogs));
    }
  }, [generatedLogs]);

  const handleCreate = async () => {
    if (!form.code.trim() || !form.discountValue) return;
    const storeId = couponScope === "tienda" ? getActiveStoreId() : null;
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...form,
          minPurchase: form.minPurchase || undefined,
          maxUses: form.maxUses || undefined,
          expiresAt: form.expiresAt || undefined,
          storeId: storeId || undefined,
        }),
      });
      if (res.ok) {
        load();
        setShowForm(false);
        setCouponScope("plataforma");
        setForm({ code: "", description: "", discountType: "percent", discountValue: 10, balance: 0, minPurchase: 0, maxUses: 0, expiresAt: "" });
      } else {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error || `No se pudo crear el cupón (HTTP ${res.status})`;
        showUndo({ message: "Error", detail: msg });
      }
    } catch (e) {
      console.error("[CouponsTab] handleCreate error", e);
      showUndo({ message: "Error de conexión", detail: "No se pudo crear el cupón. Reintentá." });
    }
  };

  const toggleActive = async (c: Coupon) => {
    await fetch(`/api/coupons/${c.id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ active: !c.active }) });
    load();
  };

  const handleDelete = async (id: string) => {
    const c = coupons.find((x) => x.id === id);
    const code = c?.code ?? "cupón";
    const ok = await confirm({
      title: "¿Eliminar cupón?",
      description: `El cupón "${code}" dejará de estar disponible para nuevas compras.`,
      intent: "danger",
      confirmLabel: "Eliminar",
    });
    if (!ok) return;
    await fetch(`/api/coupons/${id}`, { method: "DELETE" });
    showUndo({ message: `Cupón "${code}" eliminado`, duration: 5000 });
    load();
  };

  // Auto-rules management
  const toggleRule = (id: string) => {
    setAutoRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const openRuleConfig = (rule: AutoRule) => {
    setEditingRule(rule);
    setShowRuleConfig(true);
  };

  const saveRuleConfig = () => {
    if (!editingRule) return;
    setAutoRules(prev => prev.map(r => r.id === editingRule.id ? editingRule : r));
    setShowRuleConfig(false);
    setEditingRule(null);
  };

  const generateTestCoupon = () => {
    const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
    const mmdd = new Date().toISOString().slice(5, 10).replace("-", "");
    const code = templatePattern.replace("{MMDD}", mmdd).replace("{RND3}", rnd);
    alert(`Código generado: ${code}`);
    return code;
  };

  const buildWhatsappMsg = (c: Coupon) => {
    const descuento = c.discountType === "percent" ? `${c.discountValue}%` : c.discountType === "giftcard" ? `Gift Card S/${c.discountValue}` : `S/${c.discountValue}`;
    const expira = c.expiresAt ? `\nValido hasta: ${new Date(c.expiresAt).toLocaleDateString("es-PE")}` : "";
    return `¡Cupon especial de Buleje!\nUsa el codigo: ${c.code}\nDescuento: ${descuento}${expira}\n¡No te lo pierdas!`;
  };

  const sendWhatsapp = (phone: string, msg: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const fullPhone = cleanPhone.startsWith("51") ? cleanPhone : `51${cleanPhone}`;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const copyWhatsappMsg = (c: Coupon) => {
    navigator.clipboard.writeText(buildWhatsappMsg(c));
  };

  if (loading) return <LoadingState />;

  const ruleConfigs = {
    birthday: { label: "Cumpleaños", icon: PartyPopper, desc: "Cupón automático en cumpleaños del cliente" },
    "first-purchase": { label: "Primera compra", icon: UserPlus, desc: "Bienvenida para nuevos clientes" },
    inactive: { label: "Cliente inactivo", icon: Zap, desc: "Reactivar clientes sin compras recientes" },
    "min-spend": { label: "Gasto mínimo", icon: Gift, desc: "Recompensa por alcanzar monto acumulado" },
    referral: { label: "Referidos", icon: Sparkles, desc: "Cupón para referidor y referido" },
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ── Reglas Automáticas ────────────────────────────────────────────── */}
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[var(--text-primary)] flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[var(--surface-canvas)]" />
            </div>
            <div>
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Reglas Automáticas</CardTitle>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Genera cupones automáticamente</p>
            </div>
          </div>
          <button
            onClick={() => setShowTemplateBuilder(true)}
            className="flex flex-wrap items-center gap-2 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--accent)]/20 transition"
          >
            <Calendar className="h-4 w-4" /> Plantilla
          </button>
        </div>

        <div className="space-y-2">
          {autoRules.map(rule => {
            const config = ruleConfigs[rule.type];
            const Icon = config.icon;
            return (
              <div key={rule.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[var(--text-primary)] flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-[var(--surface-canvas)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{config.label}</span>
                      {rule.enabled && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--data-success-500)]">
                          <Check className="h-3 w-3" /> Activa
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{config.desc}</p>
                    {rule.enabled && (
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">
                        {rule.config.discountType === "percent" ? `${rule.config.discountValue}%` : `S/${rule.config.discountValue}`} descuento
                        {rule.config.validityDays && ` · ${rule.config.validityDays} días validez`}
                        {rule.config.autoSend && " · Auto-envío"}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => openRuleConfig(rule)}
                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] transition-colors"
                      title="Configurar"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={rule.enabled} onChange={() => toggleRule(rule.id)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-[var(--color-card)] after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Cupones Generados Automáticamente ─────────────────────────────── */}
      {generatedLogs.length > 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6">
          <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground mb-4 flex flex-wrap items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Historial de cupones auto-generados
          </CardTitle>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {generatedLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-surface rounded-xl text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--text-primary)] dark:text-foreground">{log.customer}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                    {log.ruleType} · {new Date(log.date).toLocaleDateString()} · <span className="font-mono font-bold text-primary">{log.couponCode}</span>
                  </p>
                </div>
                <span className={cn("inline-flex px-2 py-1 rounded-full text-xs font-bold",
                  log.status === "sent" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" :
                  log.status === "used" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                )}>
                  {log.status === "sent" ? "Enviado" : log.status === "used" ? "Usado" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cupones Manuales ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Ticket className="h-6 w-6 text-primary" />Cupones</SectionTitle>
        <button onClick={() => setShowForm(v => !v)} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition">
          <Plus className="h-4 w-4" />Nuevo Cupón
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 space-y-4">
          {/* Scope toggle: Tienda vs Plataforma */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2 block">Alcance del cupon</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCouponScope("tienda")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors min-h-[44px]",
                  couponScope === "tienda"
                    ? "bg-[var(--accent-soft)] text-white "
                    : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
                )}
              >
                <Ticket className="h-4 w-4" />
                Cupon de mi tienda
              </button>
              <button
                type="button"
                onClick={() => setCouponScope("plataforma")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors min-h-[44px]",
                  couponScope === "plataforma"
                    ? "bg-[var(--accent)] text-white "
                    : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
                )}
              >
                <Sparkles className="h-4 w-4" />
                Cupon de plataforma
              </button>
            </div>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-1">
              {couponScope === "tienda"
                ? "Este cupon sera valido solo para tu tienda"
                : "Este cupon sera valido en toda la plataforma"}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Código *</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="DESCUENTO10" className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Descripción</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="10% de descuento" className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Tipo</label>
              <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percent" | "fixed" | "giftcard" }))} className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm">
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Monto fijo (S/)</option>
                <option value="giftcard">Gift Card (saldo)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">{form.discountType === "giftcard" ? "Saldo inicial (S/) *" : "Valor *"}</label>
              <input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))} className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Compra mínima (S/)</label>
              <input type="number" value={form.minPurchase} onChange={e => setForm(f => ({ ...f, minPurchase: Number(e.target.value) }))} className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Usos máximos (0 = ilimitado)</label>
              <input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))} className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Fecha expiración</label>
              <input type="date" value={form.expiresAt ? form.expiresAt.slice(0, 10) : ""} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" }))} className="w-full mt-1 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-sm" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={handleCreate} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-primary/90 transition"><Check className="h-4 w-4" />Crear</button>
            <button onClick={() => setShowForm(false)} className="flex flex-wrap items-center gap-2 bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition"><X className="h-4 w-4" />Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {coupons.length === 0 && <p className="text-center text-[var(--text-tertiary)] dark:text-muted py-8">No hay cupones creados</p>}
        {coupons.map(c => (
          <div key={c.id} className={cn("bg-white dark:bg-card border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3", c.active ? "border-[var(--rule-base)] dark:border-card-border" : "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 opacity-60")}>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-extrabold text-primary text-lg">{c.code}</span>
                <button onClick={() => navigator.clipboard.writeText(c.code)} className="text-[var(--text-tertiary)] hover:text-primary"><Copy className="h-3.5 w-3.5" /></button>
                {c.storeId ? (
                  <span className="text-[length:var(--ts-2xs)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] px-2 py-0.5 rounded-full font-bold">Tienda</span>
                ) : (
                  <span className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] px-2 py-0.5 rounded-full font-bold">Plataforma</span>
                )}
                {!c.active && <span className="text-xs bg-[var(--data-error-100)] text-[var(--data-error-500)] px-2 py-0.5 rounded-full font-bold">Inactivo</span>}
              </div>
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{c.description || "Sin descripción"}</p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-[var(--text-tertiary)] dark:text-muted">
                <span className="font-bold text-[var(--data-success-500)]">{c.discountType === "percent" ? `${c.discountValue}%` : c.discountType === "giftcard" ? `GC S/${(c.balance ?? c.discountValue).toFixed(2)}` : `S/${c.discountValue}`}</span>
                {c.minPurchase ? <span>Min: S/{c.minPurchase}</span> : null}
                {c.maxUses ? <span>Usos: {c.usedCount}/{c.maxUses}</span> : <span>Usos: {c.usedCount}/∞</span>}
                {c.expiresAt && <span>Exp: {new Date(c.expiresAt).toLocaleDateString()}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => { setWhatsappCoupon(c); setWhatsappPhone(""); }}
                className="p-1.5 rounded-lg text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition"
                title="Enviar por WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                onClick={() => copyWhatsappMsg(c)}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]/20 transition"
                title="Copiar mensaje"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button onClick={() => toggleActive(c)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition", c.active ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]" : "bg-[var(--accent-soft)] text-[var(--data-success-500)] hover:bg-[var(--accent-soft)]")}>
                {c.active ? "Desactivar" : "Activar"}
              </button>
              <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Rule Configuration Modal ──────────────────────────────────────── */}
      {showRuleConfig && editingRule && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={() => setShowRuleConfig(false)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-lg">Configurar Regla</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{ruleConfigs[editingRule.type].label}</p>
              </div>
              <button onClick={() => setShowRuleConfig(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Tipo de descuento</label>
                <select value={editingRule.config.discountType} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, discountType: e.target.value as "percent" | "fixed" } })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary bg-white dark:bg-surface">
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed">Monto fijo (S/)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Valor del descuento</label>
                <input type="number" value={editingRule.config.discountValue} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, discountValue: Number(e.target.value) } })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary" />
              </div>
              {editingRule.type !== "min-spend" && (
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Días de validez</label>
                  <input type="number" value={editingRule.config.validityDays} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, validityDays: Number(e.target.value) } })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary" />
                </div>
              )}
              {editingRule.type === "inactive" && (
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Días de inactividad antes de activar</label>
                  <input type="number" value={editingRule.config.inactiveDays} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, inactiveDays: Number(e.target.value) } })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary" />
                </div>
              )}
              {editingRule.type === "min-spend" && (
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Gasto mínimo acumulado (S/)</label>
                  <input type="number" value={editingRule.config.minSpend} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, minSpend: Number(e.target.value) } })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 dark:bg-surface rounded-xl">
                <input type="checkbox" id="ruleAutoSend" checked={editingRule.config.autoSend} onChange={e => setEditingRule({ ...editingRule, config: { ...editingRule.config, autoSend: e.target.checked } })}
                  className="rounded border-[var(--rule-base)] text-primary focus:ring-primary" />
                <label htmlFor="ruleAutoSend" className="text-sm font-medium text-[var(--text-primary)] dark:text-foreground cursor-pointer flex-1">
                  Enviar automáticamente por WhatsApp
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-card-border flex flex-wrap gap-3">
              <button onClick={() => setShowRuleConfig(false)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cancelar</button>
              <button onClick={saveRuleConfig} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp Send Modal ──────────────────────────────────────────── */}
      {whatsappCoupon && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={() => setWhatsappCoupon(null)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-lg">Enviar cupon por WhatsApp</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Codigo: <span className="font-mono font-bold text-primary">{whatsappCoupon.code}</span></p>
              </div>
              <button onClick={() => setWhatsappCoupon(null)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-gray-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Preview del mensaje */}
              <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
                <p className="text-xs text-[var(--text-primary)] dark:text-foreground whitespace-pre-line">{buildWhatsappMsg(whatsappCoupon)}</p>
              </div>
              {/* Enviar a un cliente */}
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Enviar a un cliente</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="tel"
                    value={whatsappPhone}
                    onChange={e => setWhatsappPhone(e.target.value)}
                    placeholder="Ej: 916409675"
                    className="flex-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary bg-white dark:bg-surface"
                  />
                  <button
                    onClick={() => { if (whatsappPhone.trim()) { sendWhatsapp(whatsappPhone, buildWhatsappMsg(whatsappCoupon)); } }}
                    disabled={!whatsappPhone.trim()}
                    className="px-4 py-2 rounded-lg bg-[var(--accent-soft)] text-white text-sm font-bold hover:bg-[var(--accent-soft)] disabled:opacity-50 transition-colors inline-flex items-center gap-1"
                  >
                    <MessageCircle className="h-4 w-4" /> Enviar
                  </button>
                </div>
              </div>
              {/* Copiar mensaje */}
              <button
                onClick={() => { copyWhatsappMsg(whatsappCoupon); }}
                className="w-full py-2.5 rounded-lg text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors inline-flex items-center justify-center gap-2"
              >
                <Copy className="h-4 w-4" /> Copiar mensaje al portapapeles
              </button>
            </div>
            <div className="px-5 py-3 border-t border-[var(--rule-soft)] dark:border-card-border">
              <button onClick={() => setWhatsappCoupon(null)} className="w-full py-2.5 rounded-lg text-sm font-semibold text-[var(--text-primary)] dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Template Builder Modal ────────────────────────────────────────── */}
      {showTemplateBuilder && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 100 }} onClick={() => setShowTemplateBuilder(false)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-lg">Constructor de Plantilla</CardTitle>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Define el patrón de códigos automáticos</p>
              </div>
              <button onClick={() => setShowTemplateBuilder(false)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Patrón</label>
                <input type="text" value={templatePattern} onChange={e => setTemplatePattern(e.target.value.toUpperCase())}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border outline-none focus:border-primary font-mono" placeholder="BDAY{MMDD}{RND3}" />
                <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-2">
                  Variables: <span className="font-mono">{"{MMDD}"}</span> (mes/día), <span className="font-mono">{"{RND3}"}</span> (3 dígitos random)
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-surface p-4 rounded-xl">
                <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2">Plantillas sugeridas:</p>
                <div className="space-y-1">
                  {["BDAY{MMDD}{RND3}", "NEW{RND3}", "REACT{MMDD}", "GIFT{RND3}", "VIP{MMDD}{RND3}"].map(p => (
                    <button key={p} onClick={() => setTemplatePattern(p)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm font-mono bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border hover:border-primary transition-colors">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={generateTestCoupon}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors">
                Generar código de prueba
              </button>
            </div>
            <div className="px-5 py-4 border-t border-[var(--rule-soft)] dark:border-card-border">
              <button onClick={() => setShowTemplateBuilder(false)} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

