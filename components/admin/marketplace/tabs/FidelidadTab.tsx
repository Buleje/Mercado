"use client";

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  Gift,
  Star,
  TrendingUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// Extraído de MarketplaceModule.tsx (refactor 2026-05-25) — sin cambios de comportamiento.
// TODO(follow-up): los emojis 🥉🥈🥇 violan la regla "no emojis genéricos en UI" — reemplazar por iconos/SVG.

interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  description: string;
  createdAt: string;
}

interface LoyaltyData {
  name: string;
  phone: string;
  points: number;
  tier: string;
  totalSpent: number;
  transactions: LoyaltyTransaction[];
}

export function MarketplaceFidelidadTab() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [earnPoints, setEarnPoints] = useState("");
  const [saving, setSaving] = useState(false);

  const searchCustomer = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(phone.trim())}`);
      if (res.ok) {
        const d = await res.json();
        setData(d.data);
      } else {
        setData(null);
      }
    } catch {}
    setLoading(false);
  };

  const handleEarn = async () => {
    if (!data || !earnPoints) return;
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/loyalty", {
        method: "POST",
        // Brandon 2026-05-17 (audit csrf): mutating fetch debe incluir CSRF token.
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action: "earn",
          phone: data.phone,
          points: Number(earnPoints),
          description: "Puntos asignados manualmente",
        }),
      });
      if (res.ok) {
        setEarnPoints("");
        searchCustomer();
      }
    } catch {}
    setSaving(false);
  };

  // Datos visuales por tier (rediseño 2026-05-09)
  const tierVisuals: Record<string, { label: string; emoji: string; gradient: string; ring: string; benefit: string; minPts: number; maxPts: number | null }> = {
    bronce: { label: "Bronce", emoji: "🥉", gradient: "from-orange-100 to-orange-50",  ring: "ring-orange-300/40", benefit: "Acumula puntos en cada compra", minPts: 0, maxPts: 499 },
    plata:  { label: "Plata",  emoji: "🥈", gradient: "from-slate-100 to-slate-50",    ring: "ring-slate-300/50",  benefit: "5% de descuento en pedidos",      minPts: 500, maxPts: 999 },
    oro:    { label: "Oro",    emoji: "🥇", gradient: "from-amber-100 to-yellow-50",   ring: "ring-amber-300/50",  benefit: "10% de descuento + envío prioritario", minPts: 1000, maxPts: null },
  };

  // Cliente actual: barra de progreso al siguiente tier
  const currentTier = data ? (tierVisuals[data.tier] ?? tierVisuals.bronce) : null;
  const nextTierKey = data?.tier === "bronce" ? "plata" : data?.tier === "plata" ? "oro" : null;
  const nextTier = nextTierKey ? tierVisuals[nextTierKey] : null;
  const pointsToNext = nextTier ? Math.max(0, nextTier.minPts - (data?.points ?? 0)) : 0;
  const tierProgress = data && currentTier
    ? currentTier.maxPts
      ? Math.min(100, ((data.points - currentTier.minPts) / (currentTier.maxPts - currentTier.minPts + 1)) * 100)
      : 100
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Hero: tarjetas de tier ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(tierVisuals).map(([key, tv]) => {
          const isCurrent = data?.tier === key;
          return (
            <div
              key={key}
              className={cn(
                "relative overflow-hidden rounded-2xl border-2 p-4 transition-all bg-linear-to-br",
                tv.gradient,
                isCurrent ? `ring-4 ${tv.ring} border-[var(--data-warning)]` : "border-[var(--rule-base)]"
              )}
            >
              {isCurrent && (
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider bg-[var(--data-warning)] text-white">
                  Actual
                </span>
              )}
              <div className="flex items-center gap-3">
                <span className="text-3xl">{tv.emoji}</span>
                <div className="min-w-0">
                  <p className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">{tv.label}</p>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
                    {tv.minPts}{tv.maxPts ? ` - ${tv.maxPts}` : "+"} pts
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold text-[var(--text-secondary)] leading-snug">{tv.benefit}</p>
            </div>
          );
        })}
      </div>

      {/* ── Buscador ── */}
      <div className="bg-white border border-[var(--rule-base)] rounded-2xl p-5">
        <header className="flex items-center gap-2 mb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gift className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-sm font-extrabold text-[var(--text-primary)]">Buscar cliente</CardTitle>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Por número de WhatsApp para ver y gestionar puntos</p>
          </div>
        </header>
        <div className="flex items-stretch gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
          <span className="inline-flex items-center px-3 text-xs font-bold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border-r-2 border-[var(--rule-base)] whitespace-nowrap">
            +51
          </span>
          <input
            type="text"
            placeholder="961 234 567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchCustomer()}
            className="flex-1 min-w-0 px-3 py-3 bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none tabular-nums tracking-wide"
          />
          <button
            onClick={searchCustomer}
            disabled={loading || !phone.trim()}
            className="inline-flex items-center gap-2 px-5 bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </div>

      {/* ── Cliente encontrado ── */}
      {data && currentTier && (
        <div className="space-y-4">
          {/* Hero del cliente */}
          <div className={cn(
            "relative overflow-hidden rounded-2xl border-2 p-5 sm:p-6 bg-linear-to-br",
            currentTier.gradient
          )}>
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg text-4xl shrink-0">
                  {currentTier.emoji}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-base text-[var(--text-primary)] truncate">{data.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider bg-white border border-[var(--data-warning)]/30 text-[var(--data-warning)]">
                      {currentTier.label}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] tabular-nums mt-0.5">{data.phone}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                    Gasto total · <span className="font-bold text-[var(--text-secondary)] tabular-nums">S/ {data.totalSpent.toFixed(2)}</span>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Puntos disponibles</p>
                <p className="text-4xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">{data.points}</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 tabular-nums">≈ S/ {(data.points / 100).toFixed(2)} canjeable</p>
              </div>
            </div>

            {/* Progreso al siguiente tier */}
            {nextTier && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    Progreso a <span className="font-extrabold text-[var(--text-primary)]">{nextTier.label}</span>
                  </span>
                  <span className="tabular-nums font-bold text-[var(--text-tertiary)]">
                    {pointsToNext > 0 ? `Faltan ${pointsToNext} pts` : "¡Lo lograste!"}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/60 overflow-hidden border border-white">
                  <div
                    className="h-full bg-[var(--data-warning)] rounded-full transition-all"
                    style={{ width: `${tierProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Asignar puntos manualmente */}
          <div className="bg-white border border-[var(--rule-base)] rounded-2xl p-5">
            <header className="flex items-center gap-2 mb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--data-success)]/10 text-[var(--data-success)]">
                <CheckCircle className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-sm font-extrabold text-[var(--text-primary)]">Asignar puntos manualmente</CardTitle>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Para premios fuera de compra (eventos, referidos, fidelidad)</p>
              </div>
            </header>
            <div className="flex items-stretch gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
              <input
                type="number"
                placeholder="100"
                value={earnPoints}
                onChange={(e) => setEarnPoints(e.target.value)}
                min={1}
                className="flex-1 min-w-0 px-4 py-3 bg-transparent text-base font-extrabold text-[var(--text-primary)] outline-none tabular-nums"
              />
              <span className="inline-flex items-center px-3 text-xs font-bold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border-l-2 border-[var(--rule-base)]">
                pts
              </span>
              <button
                onClick={handleEarn}
                disabled={saving || !earnPoints}
                className="inline-flex items-center gap-2 px-5 bg-[var(--data-success)] text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Gift className="h-4 w-4" />
                )}
                {saving ? "Asignando…" : "Dar puntos"}
              </button>
            </div>
          </div>

          {/* Historial de transacciones */}
          {data.transactions.length > 0 && (
            <div className="bg-white border border-[var(--rule-base)] rounded-2xl overflow-hidden">
              <header className="flex items-center gap-2 px-5 py-3 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                <CardTitle className="text-sm font-extrabold text-[var(--text-primary)]">Historial reciente</CardTitle>
                <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">{data.transactions.length} movs</span>
              </header>
              <ul className="divide-y divide-[var(--rule-soft)] max-h-80 overflow-y-auto">
                {data.transactions.map((tx) => {
                  const isEarn = tx.type === "earn" || tx.points > 0;
                  return (
                    <li key={tx.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                        isEarn ? "bg-[var(--data-success)]/10 text-[var(--data-success)]" : "bg-[var(--data-error)]/10 text-[var(--data-error)]"
                      )}>
                        {isEarn ? <Gift className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{tx.description}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                          {new Date(tx.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <span className={cn(
                        "text-sm font-extrabold tabular-nums shrink-0",
                        isEarn ? "text-[var(--data-success)]" : "text-[var(--data-error)]"
                      )}>
                        {isEarn ? "+" : ""}{tx.points} pts
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state: sin búsqueda ── */}
      {!data && !loading && (
        <div className="bg-white border-2 border-dashed border-[var(--rule-base)] rounded-2xl p-8 sm:p-10">
          <div className="text-center max-w-md mx-auto">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-primary mb-4">
              <Gift className="h-6 w-6" />
            </div>
            <p className="text-base font-extrabold text-[var(--text-primary)]">Programa de fidelidad</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1.5">
              Busca un cliente por teléfono para ver sus puntos, asignar bonus o consultar el historial.
            </p>
          </div>

          {/* Reglas en 4 cards */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {[
              { icon: Gift,        title: "Acumular",        desc: "1 punto por cada S/ 1 gastado en compras" },
              { icon: TrendingUp,  title: "Subir de nivel",  desc: "500 pts → Plata · 1000 pts → Oro" },
              { icon: DollarSign,  title: "Canjear",         desc: "100 pts equivalen a S/ 1 de descuento" },
              { icon: Star,        title: "Beneficios extra",desc: "Plata 5% off · Oro 10% off + envío prioritario" },
            ].map((rule, i) => {
              const Icon = rule.icon;
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-[var(--rule-base)] text-primary shrink-0">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[var(--text-primary)]">{rule.title}</p>
                    <p className="text-xs text-[var(--text-secondary)] leading-snug mt-0.5">{rule.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
