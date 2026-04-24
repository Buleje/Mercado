"use client";

import { useState, useMemo } from "react";
import { Users, Check } from "@buleje/design-system/icons";
import type { Sale } from "@/types/erp";

interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image?: string;
}

interface Order {
  id: string;
  customer: { name: string; phone?: string; location?: string; reference?: string };
  items: OrderItem[];
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: string;
  createdAt: string;
  updatedAt?: string;
}

interface Props {
  orders: Order[];
  sales: Sale[];
  loading: boolean;
}

export function InactiveCustomersCard({ orders, sales, loading }: Props) {
  const [now] = useState(() => Date.now());
  const inactiveCustomers = useMemo(() => {
    const customerMap = new Map<string, { name: string; lastDate: string; totalSpent: number; orderCount: number; phone?: string }>();

    for (const o of orders) {
      if (o.status === "cancelado") continue;
      const key = o.customer?.phone ?? o.customer?.name ?? "?";
      const existing = customerMap.get(key);
      const date = o.createdAt ?? "";
      if (existing) {
        existing.orderCount++;
        existing.totalSpent += o.total ?? 0;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        customerMap.set(key, {
          name: o.customer?.name ?? "Cliente",
          lastDate: date,
          totalSpent: o.total ?? 0,
          orderCount: 1,
          phone: o.customer?.phone,
        });
      }
    }
    for (const s of sales) {
      const key = (s as unknown as { customerPhone?: string }).customerPhone ?? "?";
      if (key === "?") continue;
      const existing = customerMap.get(key);
      const date = s.createdAt ?? "";
      if (existing) {
        existing.orderCount++;
        existing.totalSpent += s.total ?? 0;
        if (date > existing.lastDate) existing.lastDate = date;
      }
    }

    const fifteenDaysAgo = new Date(now - 15 * 86_400_000).toISOString().slice(0, 10);

    return Array.from(customerMap.values())
      .filter(c => c.orderCount >= 2 && c.lastDate.slice(0, 10) < fifteenDaysAgo)
      .map(c => {
        const daysSince = Math.floor((now - new Date(c.lastDate).getTime()) / 86_400_000);
        return { ...c, daysSince };
      })
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 5);
  }, [orders, sales, now]);

  if (loading) return null;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-[var(--text-tertiary)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-zinc-300">Clientes que no vuelven</span>
      </div>
      {inactiveCustomers.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-[var(--data-success)] dark:text-[var(--data-success)] font-semibold">
          <Check className="w-4 h-4" /> Tus clientes frecuentes siguen activos
        </div>
      ) : (
        <div className="space-y-2">
          {inactiveCustomers.map((c, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-zinc-200 truncate">{c.name}</p>
                <p className="text-xs text-[var(--text-tertiary)] dark:text-zinc-500">
                  Última compra: hace {c.daysSince} dias &middot; Gasto total S/{c.totalSpent.toFixed(0)}
                </p>
              </div>
              {c.phone && (
                <a
                  href={`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${c.name}! Te extrañamos en Buleje. Tenemos productos nuevos esperandote!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] text-xs font-bold hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
                >
                  Contactar
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
