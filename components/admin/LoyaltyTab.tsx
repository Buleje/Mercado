"use client";

import { useState, useEffect } from "react";
import { Heart, Loader2, Search, Gift, Award, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Customer = { phone: string; name: string; loyaltyPoints: number; loyaltyTier: string; totalSpent: number };
type Tier = { name: string; minSpent: number; pointsMultiplier: number; color: string };

const TIER_COLORS: Record<string, string> = {
  bronce: "bg-amber-700 text-white",
  plata: "bg-gray-400 text-white",
  oro: "bg-yellow-400 text-yellow-900",
  diamante: "bg-cyan-400 text-cyan-900",
};

export default function LoyaltyTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [redeemPts, setRedeemPts] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/customers")
      .then(r => r.ok ? r.json() : [])
      .then((data: Customer[]) => { if (active) { setCustomers(data.sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0))); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadLoyalty = async (phone: string) => {
    const res = await fetch(`/api/loyalty/${encodeURIComponent(phone)}`);
    if (res.ok) {
      const data = await res.json();
      setSelected({ phone: data.phone, name: data.name, loyaltyPoints: data.loyaltyPoints ?? 0, loyaltyTier: data.loyaltyTier ?? 'bronce', totalSpent: data.totalSpent ?? 0 });
      if (data.tiers) setTiers(data.tiers);
    }
  };

  const redeem = async () => {
    if (!selected || !redeemPts) return;
    const pts = Number(redeemPts);
    if (pts <= 0 || pts > selected.loyaltyPoints) return;
    const res = await fetch(`/api/loyalty/${encodeURIComponent(selected.phone)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem", points: pts }),
    });
    if (res.ok) {
      setRedeemPts("");
      loadLoyalty(selected.phone);
      setCustomers(prev => prev.map(c => c.phone === selected.phone ? { ...c, loyaltyPoints: c.loyaltyPoints - pts } : c));
    }
  };

  const filtered = search
    ? customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
    : customers;

  const totalPoints = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);
  const avgSpent = customers.length > 0 ? customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0) / customers.length : 0;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Heart className="h-6 w-6 text-primary" />Programa de Fidelización</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9 pr-4 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm w-56" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Clientes", value: customers.length, icon: "👥" },
          { label: "Puntos Totales", value: totalPoints.toLocaleString(), icon: "⭐" },
          { label: "Gasto Promedio", value: `S/${avgSpent.toFixed(0)}`, icon: "💰" },
          { label: "Diamante", value: customers.filter(c => c.loyaltyTier === "diamante").length, icon: "💎" },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 text-center">
            <span className="text-2xl">{s.icon}</span>
            <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-2 space-y-2 max-h-125 overflow-y-auto">
          {filtered.length === 0 && <p className="text-center text-gray-400 py-8">No se encontraron clientes</p>}
          {filtered.map(c => (
            <button key={c.phone} onClick={() => loadLoyalty(c.phone)} className={cn("w-full text-left flex items-center gap-3 p-3 rounded-xl border transition", selected?.phone === c.phone ? "border-primary bg-primary/5" : "border-gray-200 dark:border-card-border bg-white dark:bg-card hover:bg-gray-50 dark:hover:bg-surface")}>
              <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0", TIER_COLORS[c.loyaltyTier] ?? "bg-gray-200 text-gray-600")}>{c.loyaltyTier}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 dark:text-foreground truncate">{c.name}</p>
                <p className="text-xs text-gray-400">{c.phone}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold text-sm text-primary">{c.loyaltyPoints} pts</p>
                <p className="text-xs text-gray-400">S/{(c.totalSpent ?? 0).toFixed(0)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {!selected ? (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-8 text-center">
              <Award className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Selecciona un cliente para ver detalles</p>
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 text-center">
                <div className={cn("inline-block px-4 py-1 rounded-full text-sm font-extrabold uppercase mb-3", TIER_COLORS[selected.loyaltyTier] ?? "bg-gray-200 text-gray-600")}>{selected.loyaltyTier}</div>
                <p className="font-extrabold text-lg text-gray-900 dark:text-foreground">{selected.name}</p>
                <p className="text-sm text-gray-400">{selected.phone}</p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-2xl font-extrabold text-primary">{selected.loyaltyPoints}</p>
                    <p className="text-xs text-gray-400">Puntos</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">S/{(selected.totalSpent ?? 0).toFixed(0)}</p>
                    <p className="text-xs text-gray-400">Gastado total</p>
                  </div>
                </div>
              </div>

              {/* Redeem */}
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
                <h4 className="font-bold text-sm flex items-center gap-2"><Gift className="h-4 w-4 text-primary" />Canjear Puntos</h4>
                <p className="text-xs text-gray-400">1 punto = S/0.10 de descuento</p>
                <div className="flex gap-2">
                  <input type="number" value={redeemPts} onChange={e => setRedeemPts(e.target.value)} placeholder="Puntos a canjear" className="flex-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
                  <button onClick={redeem} disabled={!redeemPts || Number(redeemPts) <= 0 || Number(redeemPts) > selected.loyaltyPoints} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50">
                    Canjear
                  </button>
                </div>
                {redeemPts && Number(redeemPts) > 0 && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Descuento: S/{(Number(redeemPts) * 0.1).toFixed(2)}</p>
                )}
              </div>

              {/* Tiers */}
              {tiers.length > 0 && (
                <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-2">
                  <h4 className="font-bold text-sm">Niveles</h4>
                  {tiers.map(t => (
                    <div key={t.name} className={cn("flex items-center justify-between text-xs px-3 py-2 rounded-lg", selected.loyaltyTier === t.name ? "bg-primary/10 border border-primary" : "bg-gray-50 dark:bg-surface")}>
                      <span className="font-bold capitalize">{t.name}</span>
                      <span>S/{t.minSpent}+ gastado</span>
                      <span className="font-bold">{t.pointsMultiplier}x puntos</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
