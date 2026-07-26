"use client";

/**
 * PorCobrarDashboard — tablero consolidado de cuentas por cobrar.
 *
 * Auditoría 2026-06: "la plata que me deben" estaba repartida en Fiados,
 * Préstamos y Adelantos sin una vista única. Este tablero (solo lectura) suma
 * los saldos pendientes de los tres y deja entrar a cada módulo para el detalle.
 * NO fusiona los módulos — cada uno conserva su pantalla y semántica.
 */

import { useState, useEffect, useCallback } from "react";
import { Wallet, CreditCard, Landmark, DollarSign, ArrowRight, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { tenantFetch } from "@/lib/tenant-fetch";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

interface Bucket { total: number; count: number; }
interface Summary {
  fiados: Bucket;
  prestamos: Bucket;
  adelantos: Bucket;
  totalGeneral: number;
}

const EMPTY: Summary = {
  fiados: { total: 0, count: 0 },
  prestamos: { total: 0, count: 0 },
  adelantos: { total: 0, count: 0 },
  totalGeneral: 0,
};

const CARDS = [
  { key: "fiados" as const, tab: "fiados", label: "Fiados", desc: "Ventas al crédito sin pagar", icon: CreditCard, color: "var(--accent)" },
  { key: "prestamos" as const, tab: "prestamos", label: "Préstamos", desc: "Cuotas pendientes de cobro", icon: Landmark, color: "#3b82f6" },
  { key: "adelantos" as const, tab: "adelantos", label: "Adelantos", desc: "Saldo de adelantos abiertos", icon: DollarSign, color: "#ff6b5b" },
];

function goTab(tab: string) {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab } }));
}

export default function PorCobrarDashboard() {
  const [data, setData] = useState<Summary>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    tenantFetch("/api/admin/por-cobrar")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.totalGeneral === "number") setData(d as Summary); })
      .catch((err) => console.warn("[PorCobrarDashboard] fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <AdminModuleHeader title="Por cobrar" description="Todo lo que te deben, en un solo lugar" icon={Wallet}>
        <button
          onClick={load}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </AdminModuleHeader>

      {/* Total general */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-primary/10 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">Total por cobrar</p>
        <p className="mt-1 text-3xl font-extrabold text-white">{formatCurrency(data.totalGeneral)}</p>
        <p className="mt-1 text-xs text-white/80">
          {data.fiados.count + data.prestamos.count + data.adelantos.count} cuenta(s) con saldo pendiente
        </p>
      </div>

      {/* Desglose por tipo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CARDS.map((c) => {
          const b = data[c.key];
          const Icon = c.icon;
          return (
            <div key={c.key} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 flex flex-col">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{c.label}</p>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">{c.desc}</p>
                </div>
              </div>
              <p className="mt-3 text-2xl font-extrabold text-[var(--text-primary)]">{formatCurrency(b.total)}</p>
              <p className="text-xs text-[var(--text-tertiary)]">{b.count} {c.key === "prestamos" ? "préstamo(s)" : "cuenta(s)"}</p>
              <button
                onClick={() => goTab(c.tab)}
                className="mt-3 inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:border-primary/50 hover:text-primary transition-colors"
              >
                Ver {c.label.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Resumen de solo lectura. Para registrar cobros o nuevos créditos, entrá a cada módulo.
      </p>
    </div>
  );
}
