"use client";

/**
 * AdminKPIBanner — Banner de 3 KPIs visibles al entrar a /admin.
 *
 * Qué muestra (Feynman): "al entrar al admin, el dueño debería ver 3 cosas
 * sin tener que buscar: cuánto vendió hoy, cuántos pedidos debe atender
 * ahora mismo, y qué productos están por agotarse."
 *
 * Fuente de datos: /api/admin/dashboard (cached 15s, payload reutilizable).
 *   - Ventas hoy: sum(sale.total) donde createdAt >= hoy 00:00
 *   - Pedidos pendientes: alerts.pendingOrders (calculado server-side)
 *   - Stock crítico: alerts.lowStock (calculado server-side)
 *
 * Estilo: Holded minimalista. Sin colores vibrantes — solo iconos grises
 * con texto grande tabular-nums. Clickeable: cada KPI navega a su tab
 * correspondiente del admin.
 *
 * Integración (una línea):
 *   import { AdminKPIBanner } from "@/components/admin/AdminKPIBanner";
 *   <AdminKPIBanner onNavigate={(tab) => setActiveTab(tab)} />
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Clock, AlertTriangle } from "@buleje/design-system/icons";

interface KPISnapshot {
  salesToday: number;
  pendingOrders: number;
  lowStock: number;
}

interface Props {
  /** Callback opcional cuando el user clickea un KPI (para cambiar de tab). */
  onNavigate?: (tab: "sales" | "orders" | "inventory") => void;
  className?: string;
}

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);
}

export function AdminKPIBanner({ onNavigate, className }: Props) {
  const [kpi, setKpi] = useState<KPISnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          sales?: Array<{ total: number; createdAt: string }>;
          alerts?: { pendingOrders?: number; lowStock?: number };
        };
        if (cancelled) return;

        const startOfDay = todayStart();
        const salesToday = (data.sales ?? [])
          .filter((s) => new Date(s.createdAt).getTime() >= startOfDay)
          .reduce((sum, s) => sum + (s.total ?? 0), 0);

        setKpi({
          salesToday,
          pendingOrders: data.alerts?.pendingOrders ?? 0,
          lowStock: data.alerts?.lowStock ?? 0,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      }
    };
    load();
    // Perf 2026-05-26 (P1-8): no pollear con la pestaña en background (ahorra
    // red/CPU en móvil). El load de mount/acción manual no se ve afectado.
    const id = setInterval(() => { if (!document.hidden) load(); }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Si hay error, no mostramos banner (degradado silencioso — no rompemos el admin).
  if (error || !kpi) {
    return null;
  }

  const items: Array<{
    key: "sales" | "orders" | "inventory";
    label: string;
    value: string;
    Icon: typeof ShoppingBag;
    href?: string;
    urgent?: boolean;
  }> = [
    {
      key: "sales",
      label: "Ventas hoy",
      value: formatCurrency(kpi.salesToday),
      Icon: ShoppingBag,
    },
    {
      key: "orders",
      label: kpi.pendingOrders === 1 ? "Pedido pendiente" : "Pedidos pendientes",
      value: String(kpi.pendingOrders),
      Icon: Clock,
      urgent: kpi.pendingOrders > 0,
    },
    {
      key: "inventory",
      label: kpi.lowStock === 1 ? "Producto por agotarse" : "Productos por agotarse",
      value: String(kpi.lowStock),
      Icon: AlertTriangle,
      urgent: kpi.lowStock > 0,
    },
  ];

  return (
    <div
      className={
        "mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 " + (className ?? "")
      }
      aria-label="Resumen del negocio hoy"
    >
      {items.map(({ key, label, value, Icon, urgent }) => {
        const content = (
          <>
            <div className="flex items-start justify-between">
              <Icon
                className={
                  "h-4 w-4 " +
                  (urgent
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-tertiary)]")
                }
                aria-hidden
              />
              {urgent && (
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Revisar
                </span>
              )}
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {value}
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">{label}</p>
          </>
        );

        const cls =
          "group rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 text-left transition-colors hover:border-[var(--rule-strong)]";

        if (onNavigate) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              className={cls + " w-full"}
            >
              {content}
            </button>
          );
        }

        return (
          <Link key={key} href="/admin" className={cls}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}

export default AdminKPIBanner;
