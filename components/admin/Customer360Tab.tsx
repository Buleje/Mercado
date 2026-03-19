"use client";

import { useState } from "react";
import { User, ShoppingCart, Package, Heart, Star, MapPin, Phone, Mail, Calendar, TrendingUp, Clock, Download, MessageSquare, CreditCard } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type CustomerProfile = {
  id: string; name: string; email: string; phone: string; address: string; zone: string;
  tier: string; points: number; totalSpent: number; totalOrders: number; avgTicket: number;
  firstPurchase: string; lastPurchase: string; preferredChannel: string; npsScore: number | null;
  favoriteProducts: string[]; recentOrders: { id: string; date: string; total: number; items: number; status: string }[];
  communicationLog: { date: string; channel: string; summary: string }[];
  tags: string[];
};

const PROFILES: CustomerProfile[] = [];

function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

const TIER_COLORS: Record<string, string> = {
  Bronce: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Plata: "bg-gray-200 text-gray-700 dark:bg-gray-700/30 dark:text-gray-300",
  Oro: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Diamante: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
};

export default function Customer360Tab() {
  const [selectedId, setSelectedId] = useState(PROFILES[0].id);
  const profile = PROFILES.find(p => p.id === selectedId)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><User className="h-6 w-6 text-primary" /> Cliente 360°</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Perfil completo del cliente en una sola vista</p>
        </div>
      </div>

      {/* Customer selector */}
      <div className="flex gap-2 flex-wrap">
        {PROFILES.map(p => (
          <button key={p.id} onClick={() => setSelectedId(p.id)} className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-colors border", selectedId === p.id ? "bg-primary text-white border-primary" : "bg-white dark:bg-card text-gray-600 dark:text-muted border-gray-200 dark:border-card-border hover:border-primary")}>{p.name}</button>
        ))}
      </div>

      {/* Profile Header */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-extrabold text-primary">{profile.name.split(" ").map(n => n[0]).join("")}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground">{profile.name}</h3>
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", TIER_COLORS[profile.tier])}>{profile.tier} · {profile.points} pts</span>
              {profile.tags.map(t => (
                <span key={t} className="text-[10px] bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted px-1.5 py-0.5 rounded">{t}</span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-muted flex-wrap">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {profile.phone}</span>
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {profile.email}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {profile.zone}</span>
            </div>
          </div>
          {profile.npsScore !== null && (
            <div className={cn("text-center px-4 py-2 rounded-xl", profile.npsScore >= 9 ? "bg-emerald-50 dark:bg-emerald-950/10" : profile.npsScore >= 7 ? "bg-amber-50 dark:bg-amber-950/10" : "bg-red-50 dark:bg-red-950/10")}>
              <p className="text-[10px] text-gray-500 dark:text-muted">NPS</p>
              <p className={cn("text-2xl font-extrabold", profile.npsScore >= 9 ? "text-emerald-500" : profile.npsScore >= 7 ? "text-amber-500" : "text-red-500")}>{profile.npsScore}</p>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Gasto total", value: fmt(profile.totalSpent), icon: CreditCard, color: "text-emerald-500" },
          { label: "Pedidos", value: profile.totalOrders, icon: ShoppingCart, color: "text-blue-500" },
          { label: "Ticket prom.", value: fmt(profile.avgTicket), icon: TrendingUp, color: "text-violet-500" },
          { label: "Primera compra", value: fmtDate(profile.firstPurchase), icon: Calendar, color: "text-amber-500" },
          { label: "Última compra", value: fmtDate(profile.lastPurchase), icon: Clock, color: "text-gray-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon className={cn("h-3.5 w-3.5", k.color)} />
              <p className="text-[10px] font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            </div>
            <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Favorite Products */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2"><Heart className="h-4 w-4 text-pink-500" /> Productos favoritos</h3>
          <div className="flex flex-wrap gap-2">
            {profile.favoriteProducts.map(p => (
              <span key={p} className="text-xs bg-pink-50 dark:bg-pink-950/10 text-pink-700 dark:text-pink-400 px-3 py-1.5 rounded-xl font-semibold">{p}</span>
            ))}
          </div>
        </div>

        {/* Communication Log */}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Historial de comunicación</h3>
          <div className="space-y-2">
            {profile.communicationLog.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-gray-400 shrink-0 w-16">{fmtDate(c.date)}</span>
                <span className="font-bold text-gray-600 dark:text-muted w-16 shrink-0">{c.channel}</span>
                <span className="text-gray-700 dark:text-foreground">{c.summary}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Pedidos recientes</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 dark:text-muted">
              <th className="pb-2 font-bold">Pedido</th>
              <th className="pb-2 font-bold">Fecha</th>
              <th className="pb-2 font-bold">Productos</th>
              <th className="pb-2 font-bold">Total</th>
              <th className="pb-2 font-bold">Estado</th>
            </tr></thead>
            <tbody>
              {profile.recentOrders.map(o => (
                <tr key={o.id} className="border-t border-gray-100 dark:border-card-border">
                  <td className="py-2 font-semibold text-gray-900 dark:text-foreground">{o.id}</td>
                  <td className="py-2 text-gray-500 dark:text-muted">{fmtDate(o.date)}</td>
                  <td className="py-2 text-gray-600 dark:text-muted">{o.items} items</td>
                  <td className="py-2 font-bold text-gray-900 dark:text-foreground">{fmt(o.total)}</td>
                  <td className="py-2"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", o.status === "entregado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400")}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
