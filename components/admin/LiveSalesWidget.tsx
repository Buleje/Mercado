"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, TrendingUp, ShoppingCart, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface SalesToday {
  revenue: number;
  orders: number;
  customers: number;
  goal: number;
}

const fmt = (n: number) => `S/${n.toFixed(2)}`;

export default function LiveSalesWidget() {
  const [data, setData] = useState<SalesToday>({ revenue: 0, orders: 0, customers: 0, goal: 0 });
  const [prevRevenue, setPrevRevenue] = useState(0);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard-data");
      if (!res.ok) return;
      const json = await res.json();
      const orders = (json.orders ?? []).filter((o: { status: string; createdAt: string }) => {
        if (o.status === "cancelado") return false;
        const d = new Date(o.createdAt);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      });
      const revenue = orders.reduce((s: number, o: { total: number }) => s + o.total, 0);
      const phones = new Set(orders.map((o: { customer: { phone: string } }) => o.customer?.phone).filter(Boolean));

      const goal = typeof window !== "undefined" ? Number(localStorage.getItem("daily-sales-goal") ?? 0) : 0;

      if (revenue > data.revenue) {
        setFlash(true);
        setTimeout(() => setFlash(false), 1000);
      }
      setPrevRevenue(data.revenue);
      setData({ revenue, orders: orders.length, customers: phones.size, goal });
    } catch { /* silent */ }
  }, [data.revenue]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goalPct = data.goal > 0 ? Math.min((data.revenue / data.goal) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (goalPct / 100) * circumference;

  return (
    <div className={cn(
      "bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 transition-all",
      flash && "ring-2 ring-emerald-400 ring-offset-2"
    )}>
      <div className="flex items-center gap-4">
        {/* Circular progress */}
        {data.goal > 0 && (
          <div className="relative shrink-0">
            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#E5E7EB" strokeWidth="3" className="dark:stroke-gray-700" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke={goalPct >= 100 ? "#10B981" : "var(--color-primary)"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300">
              {goalPct.toFixed(0)}%
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className={cn(
              "text-xl font-black text-gray-900 dark:text-foreground transition-colors",
              flash && "text-emerald-600"
            )}>
              {fmt(data.revenue)}
            </span>
            {data.revenue > prevRevenue && prevRevenue > 0 && (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Ventas hoy</p>
        </div>

        {/* Mini stats */}
        <div className="flex gap-4 shrink-0">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <ShoppingCart className="h-3 w-3 text-emerald-500" />
              <span className="text-sm font-bold text-gray-900 dark:text-foreground">{data.orders}</span>
            </div>
            <p className="text-[9px] text-gray-400">pedidos</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Users className="h-3 w-3 text-violet-500" />
              <span className="text-sm font-bold text-gray-900 dark:text-foreground">{data.customers}</span>
            </div>
            <p className="text-[9px] text-gray-400">clientes</p>
          </div>
        </div>
      </div>
    </div>
  );
}
