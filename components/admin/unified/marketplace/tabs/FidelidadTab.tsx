"use client";

import { useState, useEffect } from "react";
import { Gift, Zap, Star, CheckCircle, Eye, EyeOff, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Tipos locales ────────────────────────────────────────────────────────────

interface LoyaltyData {
  phone: string;
  name: string;
  points: number;
  tier: string;
  totalSpent: number;
  transactions: { id: string; type: string; points: number; description: string; createdAt: string }[];
}

interface LoyaltyRules {
  pointsPerSol: number;
  minOrder: number;
  weekendMultiplier: number;
  freshCategoryMultiplier: number;
}

interface LoyaltyReward {
  id: string;
  label: string;
  costPoints: number;
  description: string;
  active: boolean;
}

interface TopCustomer {
  phone: string;
  name: string;
  points: number;
  tier: string;
  totalSpent: number;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { label: string; className: string; minPoints: string }> = {
  bronce: { label: "Bronce", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", minPoints: "0 - 499" },
  plata:  { label: "Plata",  className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",                minPoints: "500 - 999" },
  oro:    { label: "Oro",    className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]", minPoints: "1000+" },
};

const DEFAULT_LOYALTY_RULES: LoyaltyRules = {
  pointsPerSol: 1, minOrder: 5, weekendMultiplier: 1, freshCategoryMultiplier: 2,
};

const DEFAULT_REWARDS: LoyaltyReward[] = [
  { id: "r1", label: "S/ 5 de descuento",  costPoints: 500,  description: "Aplicable en tu próxima compra mín S/ 30", active: true },
  { id: "r2", label: "Producto gratis",    costPoints: 1000, description: "1 producto a elegir hasta S/ 12",            active: true },
  { id: "r3", label: "Envío gratis",       costPoints: 200,  description: "Delivery sin costo en tu pedido",            active: true },
];

const RULES_KEY   = "marketplace:loyalty:rules";
const REWARDS_KEY = "marketplace:loyalty:rewards";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}

function writeLocal<T>(key: string, value: T) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

// ─────────────────────────────────────────────
// FidelidadTab
// ─────────────────────────────────────────────
export default function FidelidadTab() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [earnPoints, setEarnPoints] = useState("");
  const [saving, setSaving] = useState(false);
  const [rules, setRulesState] = useState<LoyaltyRules>(DEFAULT_LOYALTY_RULES);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [rewards, setRewards] = useState<LoyaltyReward[]>(DEFAULT_REWARDS);
  const [newReward, setNewReward] = useState({ label: "", costPoints: "", description: "" });

  useEffect(() => {
    let cancelled = false;
    const savedTimer: ReturnType<typeof setTimeout> | null = null;
    // FIX 2026-05-06 (audit team H022): cargar reglas desde DB primero,
    // fallback a localStorage si endpoint falla (continuidad).
    (async () => {
      try {
        const r = await fetch("/api/marketplace/loyalty/rules");
        if (cancelled) return;
        if (r.ok) {
          const json = await r.json();
          if (cancelled) return;
          if (json.rules)   setRulesState({ ...DEFAULT_LOYALTY_RULES, ...json.rules });
          else              setRulesState(readLocal<LoyaltyRules>(RULES_KEY, DEFAULT_LOYALTY_RULES));
          if (json.rewards) setRewards(json.rewards as LoyaltyReward[]);
          else              setRewards(readLocal<LoyaltyReward[]>(REWARDS_KEY, DEFAULT_REWARDS));
          return;
        }
      } catch (err) {
        console.warn("[FidelidadTab] rules fetch failed, using localStorage", err);
      }
      if (cancelled) return;
      setRulesState(readLocal<LoyaltyRules>(RULES_KEY, DEFAULT_LOYALTY_RULES));
      setRewards(readLocal<LoyaltyReward[]>(REWARDS_KEY, DEFAULT_REWARDS));
    })();

    fetch("/api/loyalty/metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d?.topCustomers)) setTopCustomers(d.topCustomers as TopCustomer[]);
      })
      .catch((err) => { console.warn("[FidelidadTab] metrics fetch failed", err); })
      .finally(() => { if (!cancelled) setTopLoading(false); });

    return () => {
      cancelled = true;
      if (savedTimer) clearTimeout(savedTimer);
    };
  }, []);

  // Persistir en DB (con fallback a localStorage si endpoint falla)
  const persistRulesAPI = async (next: LoyaltyRules, nextRewards?: LoyaltyReward[]) => {
    try {
      const body: Record<string, unknown> = { rules: next };
      if (nextRewards) body.rewards = nextRewards;
      const r = await fetch("/api/marketplace/loyalty/rules", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (err) {
      console.warn("[FidelidadTab] rules PUT failed, persisting to localStorage as fallback", err);
      writeLocal(RULES_KEY, next);
      if (nextRewards) writeLocal(REWARDS_KEY, nextRewards);
    }
  };

  const persistRules = (next: LoyaltyRules) => {
    setRulesState(next);
    void persistRulesAPI(next);
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
  };

  const persistRewards = (next: LoyaltyReward[]) => {
    setRewards(next);
    void persistRulesAPI(rules, next);
  };

  const addReward = () => {
    const cost = Number(newReward.costPoints);
    if (!newReward.label.trim() || !cost || cost <= 0) return;
    persistRewards([...rewards, { id: `r-${Date.now()}`, label: newReward.label.trim(), costPoints: cost, description: newReward.description.trim(), active: true }]);
    setNewReward({ label: "", costPoints: "", description: "" });
  };

  const searchCustomer = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(phone.trim())}`);
      if (res.ok) { const d = await res.json(); setData(d.data); }
      else setData(null);
    } catch {}
    setLoading(false);
  };

  const handleEarn = async () => {
    if (!data || !earnPoints) return;
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "earn", phone: data.phone, points: Number(earnPoints), description: "Puntos asignados manualmente" }),
      });
      if (res.ok) { setEarnPoints(""); searchCustomer(); }
    } catch {}
    setSaving(false);
  };

  const inputCls = "w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary";

  return (
    <div className="space-y-6">
      {/* Tiers info */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
          <div key={key} className={cn("rounded-xl p-2 text-xs font-semibold", cfg.className)}>
            <p className="text-sm">{cfg.label}</p>
            <p className="text-xs font-normal mt-0.5">{cfg.minPoints} pts</p>
          </div>
        ))}
      </div>

      {/* Reglas de puntos */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Reglas de puntos</CardTitle>
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">tu tienda</span>
          </div>
          {rulesSaved && (
            <span className="text-xs text-[var(--data-success-500)] font-semibold flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Guardado
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "pointsPerSol" as keyof LoyaltyRules, label: "Puntos por sol", hint: "1 = 1pt por S/ 1", min: 0, step: 0.5 },
            { key: "minOrder" as keyof LoyaltyRules,     label: "Mín orden (S/)",  hint: "Para ganar puntos", min: 0, step: 1 },
            { key: "weekendMultiplier" as keyof LoyaltyRules, label: "Multiplicador finde", hint: "Sáb/Dom × N", min: 1, step: 0.5 },
            { key: "freshCategoryMultiplier" as keyof LoyaltyRules, label: "Multiplicador frescos", hint: "Frutas/Verduras × N", min: 1, step: 0.5 },
          ].map(({ key, label, hint, min, step }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-bold text-[var(--text-secondary)]">{label}</label>
              <input type="number" min={min} step={step} value={rules[key]}
                onChange={(e) => persistRules({ ...rules, [key]: parseFloat(e.target.value) || 0 })}
                className={inputCls} />
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-3">Estas reglas controlan cuántos puntos asigna automáticamente cada compra de tu tienda.</p>
      </div>

      {/* Top clientes */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4 text-[var(--data-warning-500)]" />
          <CardTitle className="text-sm">Top 10 clientes frecuentes</CardTitle>
        </div>
        {topLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-[var(--surface-sunken)] rounded-lg animate-pulse" />)}
          </div>
        ) : topCustomers.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] text-center py-6">Aún no hay clientes con puntos en tu tienda.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule-base)]">
            {topCustomers.slice(0, 10).map((c, i) => {
              const initial = (c.name || "C").trim().charAt(0).toUpperCase();
              const tierCfg = TIER_CONFIG[c.tier] ?? null;
              return (
                <li key={`${c.phone}-${i}`} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-extrabold shrink-0">{i + 1}</span>
                  <span className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-primary flex items-center justify-center text-sm font-extrabold shrink-0">{initial}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">{c.name || "Sin nombre"}</p>
                    <p className="text-xs text-[var(--text-tertiary)] font-mono">{c.phone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-[var(--data-success-500)]">S/ {c.totalSpent.toFixed(2)}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{c.points} pts</p>
                  </div>
                  {tierCfg && (
                    <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold shrink-0", tierCfg.className)}>
                      {tierCfg.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Recompensas */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="h-4 w-4 text-[var(--data-warning-500)]" />
          <CardTitle className="text-sm">Recompensas canjeables</CardTitle>
          <span className="text-xs text-[var(--text-secondary)]">· {rewards.filter((r) => r.active).length} activa(s)</span>
        </div>
        <div className="space-y-2 mb-3">
          {rewards.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] text-center py-4">Sin recompensas todavía. Crea una abajo.</p>
          ) : (
            rewards.map((r) => (
              <div key={r.id} className={cn("flex items-center gap-3 px-3 py-2 rounded-xl border",
                r.active ? "border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)]" : "border-[var(--rule-base)] bg-[var(--surface-sunken)] opacity-60")}>
                <span className="h-9 w-9 rounded-lg bg-[var(--data-warning-50)] text-[var(--data-warning-500)] flex items-center justify-center shrink-0">
                  <Gift className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{r.label}</p>
                  {r.description && <p className="text-xs text-[var(--text-secondary)]">{r.description}</p>}
                </div>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold whitespace-nowrap">{r.costPoints} pts</span>
                <button onClick={() => persistRewards(rewards.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)))}
                  title={r.active ? "Desactivar" : "Activar"} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition shrink-0">
                  {r.active ? <Eye className="h-4 w-4 text-[var(--data-success-500)]" /> : <EyeOff className="h-4 w-4 text-[var(--text-tertiary)]" />}
                </button>
                <button onClick={() => persistRewards(rewards.filter((x) => x.id !== r.id))} title="Eliminar"
                  className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] transition shrink-0">
                  <X className="h-4 w-4 text-[var(--data-error-500)]" />
                </button>
              </div>
            ))
          )}
        </div>
        {/* Form nueva recompensa */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2 items-end pt-3 border-t border-[var(--rule-base)]">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Recompensa</label>
            <input type="text" placeholder="Ej: S/ 10 off" value={newReward.label}
              onChange={(e) => setNewReward({ ...newReward, label: e.target.value })} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Costo pts</label>
            <input type="number" min={1} placeholder="500" value={newReward.costPoints}
              onChange={(e) => setNewReward({ ...newReward, costPoints: e.target.value })} className={inputCls} />
          </div>
          <button onClick={addReward} disabled={!newReward.label.trim() || !newReward.costPoints}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition disabled:opacity-50">
            + Añadir
          </button>
          <div className="sm:col-span-3 space-y-1">
            <input type="text" placeholder="Descripción (opcional, ej: aplica con compra mín S/ 30)"
              value={newReward.description} onChange={(e) => setNewReward({ ...newReward, description: e.target.value })}
              className={cn(inputCls, "text-xs")} />
          </div>
        </div>
      </div>

      {/* Buscador cliente */}
      <div className="flex gap-2">
        <input type="text" placeholder="Teléfono del cliente (ej: 961234567)" value={phone}
          onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchCustomer()}
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent" />
        <button onClick={searchCustomer} disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:opacity-90 transition disabled:opacity-50">
          {loading ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {data && (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{data.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{data.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-primary">{data.points}</p>
              <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", TIER_CONFIG[data.tier]?.className ?? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
                {TIER_CONFIG[data.tier]?.label ?? data.tier}
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">Gasto total: S/{data.totalSpent.toFixed(2)}</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Asignar puntos</label>
              <input type="number" placeholder="100" value={earnPoints} onChange={(e) => setEarnPoints(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] text-sm focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <button onClick={handleEarn} disabled={saving || !earnPoints}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--accent-soft)] text-white hover:opacity-90 transition disabled:opacity-50">
              {saving ? "…" : "+ Dar puntos"}
            </button>
          </div>
          {data.transactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Historial reciente</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {data.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--rule-soft)] last:border-0">
                    <div>
                      <span className={tx.type === "earn" ? "text-[var(--data-success-500)] font-semibold" : "text-[var(--data-error-500)] font-semibold"}>
                        {tx.points > 0 ? "+" : ""}{tx.points} pts
                      </span>
                      <span className="text-[var(--text-tertiary)] ml-2">{tx.description}</span>
                    </div>
                    <span className="text-[var(--text-tertiary)] text-xs">{new Date(tx.createdAt).toLocaleDateString("es-PE")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <Gift className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Programa de Fidelidad</p>
          <p className="text-xs mt-1">Busca un cliente por teléfono para ver y gestionar sus puntos.</p>
          <div className="mt-4 bg-[var(--surface-alt)] rounded-xl p-3 text-left max-w-xs mx-auto">
            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Reglas de puntos:</p>
            <p className="text-xs text-[var(--text-secondary)]">• 1 punto por cada S/1 de compra</p>
            <p className="text-xs text-[var(--text-secondary)]">• 500 pts = Nivel Plata (5% descuento)</p>
            <p className="text-xs text-[var(--text-secondary)]">• 1000 pts = Nivel Oro (10% descuento)</p>
            <p className="text-xs text-[var(--text-secondary)]">• 100 pts = S/1 de descuento al canjear</p>
          </div>
        </div>
      )}
    </div>
  );
}
