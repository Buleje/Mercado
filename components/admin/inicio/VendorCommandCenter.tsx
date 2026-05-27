"use client";

/**
 * VendorCommandCenter — "Inicio / Principal" del panel del vendedor.
 *
 * Brandon 2026-05-27: un apartado de inicio donde está lo más importante de
 * un vistazo — mini-resúmenes financieros (ingresos, gastos, ganancia) con
 * sparkline + accesos directos a los módulos clave (punto de venta, compras,
 * clientes, inventario, productos, pedidos).
 *
 * Estética: marco de computadora (browser chrome) inspirado en el mockup de
 * celular de /negocios, adaptado a desktop. Datos reales vía useDashboardData
 * (/api/admin/dashboard) — sin cifras inventadas.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Coins,
  ShoppingCart,
  Truck,
  Users,
  Package,
  ClipboardCheck,
  Store,
  ArrowUpRight,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { resolveActiveTenantSlug } from "@/lib/tenant-fetch";
import { formatSoles } from "@/lib/chart-helpers";
import { BulejeLoader } from "@/components/admin/inicio/_shared";

// ── Accesos directos a módulos (URL ?tab=X — patrón del admin) ──────────────
const SHORTCUTS: { label: string; tab: string; icon: LucideIcon; tint: string }[] = [
  { label: "Punto de venta", tab: "ventas-caja", icon: ShoppingCart, tint: "text-[var(--accent)] bg-[var(--accent-soft)]" },
  { label: "Pedidos", tab: "pedidos", icon: ClipboardCheck, tint: "text-[var(--data-warning-600,#b45309)] bg-[var(--data-warning-50,#fffbeb)]" },
  { label: "Compras", tab: "compras", icon: Truck, tint: "text-[var(--data-info-600,#2563eb)] bg-[var(--data-info-50,#eff6ff)]" },
  { label: "Clientes", tab: "clientes", icon: Users, tint: "text-[var(--data-purple-600,#7c3aed)] bg-[var(--data-purple-50,#f5f3ff)]" },
  { label: "Inventario", tab: "inventario", icon: Package, tint: "text-[var(--data-success-600,#16a34a)] bg-[var(--data-success-50,#f0fdf4)]" },
  { label: "Productos", tab: "productos", icon: Store, tint: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]" },
];

// Sparkline SVG minimalista — sin dependencias de chart lib.
function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const W = 100;
  const H = 32;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <polygon points={area} fill="var(--accent)" opacity="0.12" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type DailyRev = { date: string; total: number; count: number };

export default function VendorCommandCenter() {
  const { data, loading } = useDashboardData();
  const [slug, setSlug] = useState("mi-negocio");

  useEffect(() => {
    let active = true;
    void resolveActiveTenantSlug().then((s) => {
      if (active && s && s !== "main") setSlug(s);
    });
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const daily = (data?.dailyRevenue ?? []) as DailyRev[];
    const purchases = (data?.purchases ?? []) as { total?: number }[];
    const ingresos = daily.reduce((s, d) => s + (d.total || 0), 0);
    const gastos = purchases.reduce((s, p) => s + (p.total || 0), 0);
    const ganancia = ingresos - gastos;
    const margen = ingresos > 0 ? (ganancia / ingresos) * 100 : 0;
    const pedidos = daily.reduce((s, d) => s + (d.count || 0), 0);
    const sparkline = daily.map((d) => d.total || 0);
    // Tendencia ingresos: último día vs día anterior
    const lastTwo = sparkline.slice(-2);
    const trend = lastTwo.length === 2 && lastTwo[0] > 0 ? ((lastTwo[1] - lastTwo[0]) / lastTwo[0]) * 100 : 0;
    return { ingresos, gastos, ganancia, margen, pedidos, sparkline, trend, days: daily.length };
  }, [data]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Buenos días";
    if (h < 19) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  return (
    <section aria-label="Inicio del panel" className="mb-2">
      {/* ── Marco de computadora (browser frame) ─────────────────────── */}
      <div className="overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]">
        {/* Chrome bar */}
        <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="mx-auto flex max-w-xs flex-1 items-center justify-center gap-2 rounded-full bg-[var(--surface-raised)] px-3 py-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] ring-1 ring-[var(--rule-soft)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
            panel.buleje.pe/{slug}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            En vivo
          </span>
        </div>

        {/* Pantalla */}
        <div className="bg-linear-to-br from-[var(--accent)]/[0.06] via-transparent to-transparent p-4 sm:p-6">
          {/* Saludo */}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                {greeting}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
                Tu negocio de un vistazo
              </h2>
            </div>
            <p className="text-sm text-[var(--text-tertiary)]">
              Resumen de {stats.days > 0 ? `los últimos ${stats.days} días` : "tu actividad"}
            </p>
          </div>

          {loading && !data ? (
            <div className="py-10"><BulejeLoader variant="card" size={40} label="Cargando tu resumen…" /></div>
          ) : (
            <>
              {/* ── Mini-resúmenes financieros ───────────────────────── */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Ingresos — con sparkline */}
                <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                      <Wallet className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.25} /> Ingresos
                    </span>
                    {stats.trend !== 0 && (
                      <span className={`inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold ${stats.trend > 0 ? "text-[var(--data-success-600,#16a34a)]" : "text-[var(--data-danger-600,#dc2626)]"}`}>
                        {stats.trend > 0 ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} /> : <TrendingDown className="h-3 w-3" strokeWidth={2.5} />}
                        {Math.abs(stats.trend).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-[-0.02em] text-[var(--text-primary)]">
                    {formatSoles(stats.ingresos)}
                  </p>
                  <div className="mt-2 h-8">
                    <Sparkline values={stats.sparkline} className="h-full w-full" />
                  </div>
                </div>

                {/* Gastos */}
                <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
                  <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <Receipt className="h-3.5 w-3.5 text-[var(--data-warning-600,#b45309)]" strokeWidth={2.25} /> Gastos (compras)
                  </span>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-[-0.02em] text-[var(--text-primary)]">
                    {formatSoles(stats.gastos)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">Órdenes de compra registradas</p>
                </div>

                {/* Ganancia */}
                <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                      <Coins className="h-3.5 w-3.5" strokeWidth={2.25} /> Ganancia
                    </span>
                    {stats.ingresos > 0 && (
                      <span className="rounded-full bg-[var(--accent-600,var(--accent))] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold text-white tabular-nums">
                        {Number(stats.margen).toFixed(0)}% margen
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-2xl font-extrabold tabular-nums tracking-[-0.02em] ${stats.ganancia >= 0 ? "text-[var(--text-primary)]" : "text-[var(--data-danger-600,#dc2626)]"}`}>
                    {formatSoles(stats.ganancia)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {stats.pedidos} pedido{stats.pedidos === 1 ? "" : "s"} en el período
                  </p>
                </div>
              </div>

              {/* ── Accesos directos a módulos ───────────────────────── */}
              <div className="mt-5">
                <p className="mb-2.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Accesos rápidos
                </p>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                  {SHORTCUTS.map(({ label, tab, icon: Icon, tint }) => (
                    <Link
                      key={tab}
                      href={`/admin?tab=${tab}`}
                      className="group flex flex-col items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)]"
                    >
                      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${tint} transition-transform group-hover:scale-105`}>
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span className="text-xs font-bold leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                        {label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* CTA ver tienda pública */}
              <div className="mt-4 flex justify-end">
                <Link
                  href={`/t/${slug}/tienda`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)] hover:gap-2.5 transition-all"
                >
                  Ver mi tienda online
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
