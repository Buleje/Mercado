"use client";

import { useState, useMemo } from "react";
import { Heart, Gift, Star, Trophy, ArrowUp, ArrowDown, Users, Search, Download, Filter, ShoppingCart } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Tier = { id: string; name: string; minPoints: number; multiplier: number; color: string; perks: string[]; members: number };
type Reward = { id: string; name: string; pointsCost: number; category: string; stock: number; redeemed: number; active: boolean };
type PointsHistory = { id: string; customer: string; tier: string; action: "earn" | "redeem"; points: number; description: string; date: string };

const TIERS: Tier[] = [];

const REWARDS: Reward[] = [];

const HISTORY: PointsHistory[] = [];

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function PointsProgramTab() {
  const [view, setView] = useState<"overview" | "rewards" | "history">("overview");
  const totalMembers = TIERS.reduce((s, t) => s + t.members, 0);
  const totalRedeemed = REWARDS.reduce((s, r) => s + r.redeemed, 0);
  const pointsIssued = HISTORY.filter(h => h.action === "earn").reduce((s, h) => s + h.points, 0);
  const pointsUsed = HISTORY.filter(h => h.action === "redeem").reduce((s, h) => s + h.points, 0);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Heart className="h-6 w-6 text-primary" /> Programa de Puntos</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Fidelización con puntos, niveles y recompensas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["overview", "rewards", "history"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{v === "overview" ? "Niveles" : v === "rewards" ? "Premios" : "Historial"}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Miembros totales", value: totalMembers.toLocaleString(), color: "text-blue-500" },
          { label: "Puntos emitidos (semana)", value: pointsIssued.toLocaleString(), color: "text-emerald-500" },
          { label: "Puntos canjeados (semana)", value: pointsUsed.toLocaleString(), color: "text-amber-500" },
          { label: "Premios entregados", value: totalRedeemed, color: "text-violet-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {view === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
          {TIERS.map(t => (
            <div key={t.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5 relative overflow-hidden">
              <div className={cn("absolute top-0 right-0 h-24 w-24 rounded-bl-full opacity-10", t.color)} />
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white", t.color)}>
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-gray-900 dark:text-foreground">{t.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-muted">{t.minPoints.toLocaleString()}+ puntos · {t.multiplier}x multiplicador</p>
                </div>
              </div>
              <ul className="space-y-1 mb-3">
                {t.perks.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-muted flex items-center gap-1.5"><Star className="h-3 w-3 text-primary shrink-0" />{p}</li>
                ))}
              </ul>
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-card-border">
                <span className="text-xs text-gray-500 dark:text-muted"><Users className="h-3 w-3 inline mr-1" />{t.members} miembros</span>
                <span className="text-xs font-bold text-primary">{((t.members / totalMembers) * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "rewards" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REWARDS.map(r => (
            <div key={r.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted px-2 py-0.5 rounded-full">{r.category}</span>
                <span className="text-sm font-extrabold text-primary">{r.pointsCost} pts</span>
              </div>
              <h4 className="font-bold text-gray-900 dark:text-foreground mb-2">{r.name}</h4>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-muted">
                <span>Stock: {r.stock === 999 ? "∞" : r.stock}</span>
                <span>Canjeado: {r.redeemed}</span>
              </div>
              <div className="mt-2 w-full h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${r.stock === 999 ? 30 : Math.min((r.redeemed / r.stock) * 100, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "history" && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
          <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 dark:bg-surface">
            <h3 className="font-bold text-sm text-gray-700 dark:text-foreground">Movimientos recientes</h3>
            <button onClick={() => exportToCSV(HISTORY.map(h => ({ cliente: h.customer, nivel: h.tier, tipo: h.action, puntos: h.points, descripcion: h.description, fecha: fmtDate(h.date) })), "puntos-historial")} className="text-xs text-primary font-semibold flex items-center gap-1"><Download className="h-3 w-3" /> CSV</button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-card-border">
            {HISTORY.map(h => (
              <div key={h.id} className="flex flex-wrap items-center gap-3 px-2 sm:px-4 py-2 sm:py-3">
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", h.action === "earn" ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400")}>
                  {h.action === "earn" ? <ArrowUp className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{h.customer} <span className="text-[10px] text-gray-400">({h.tier})</span></p>
                  <p className="text-xs text-gray-500 dark:text-muted">{h.description}</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-extrabold", h.action === "earn" ? "text-emerald-600" : "text-amber-600")}>{h.action === "earn" ? "+" : "-"}{h.points}</p>
                  <p className="text-[10px] text-gray-400">{fmtDate(h.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
