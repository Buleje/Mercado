"use client";

/**
 * SalesFlowHero — Hero del Resumen del marketplace que visualiza el flujo
 * completo de venta del negocio. Aparece arriba de QuickActions y refuerza
 * el concepto:
 *
 *   La venta NO se concreta cuando el cliente paga.
 *   La venta se concreta cuando el motorizado ENTREGA y el cliente lo recibe.
 *
 * Estados del flujo:
 *   PENDIENTE → CONFIRMADO → EN CAMINO → ENTREGADO (venta concluida)
 *
 * Cuenta cada bucket en vivo desde /api/marketplace/orders y muestra:
 *   - Total de "ingresos potenciales" (pendientes + confirmados + en_camino)
 *   - Total de "ventas concretadas" (solo entregados del rango)
 *   - Pipeline visual con counts y CTA por bucket
 */

import { useEffect, useState } from "react";
import {
  Clock,
  CheckCircle2,
  Truck,
  PackageCheck,
  Receipt,
  TrendingUp,
  Wallet,
  ArrowRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type OrderStatus =
  | "pendiente"
  | "confirmado"
  | "en_camino"
  | "entregado"
  | "cancelado";

interface OrderLite {
  id: string;
  status: OrderStatus;
  total?: number;
  createdAt: string;
}

interface FlowState {
  loading: boolean;
  pendiente: number;
  confirmado: number;
  en_camino: number;
  entregado: number;
  pipelineRevenue: number; // suma de pending+confirmado+en_camino
  closedRevenueToday: number; // suma de entregado de HOY
  closedRevenueMonth: number; // suma de entregado del MES en curso
  ordersToday: number;
}

const STEP_META: Array<{
  key: "pendiente" | "confirmado" | "en_camino" | "entregado";
  label: string;
  sublabel: string;
  Icon: typeof Clock;
  color: string;
  bg: string;
}> = [
  {
    key: "pendiente",
    label: "Pendiente",
    sublabel: "Recién recibido",
    Icon: Clock,
    color: "var(--data-warning-500)",
    bg: "color-mix(in oklch, var(--data-warning-500) 12%, transparent)",
  },
  {
    key: "confirmado",
    label: "Preparando",
    sublabel: "Confirmaste el pedido",
    Icon: CheckCircle2,
    color: "var(--accent)",
    bg: "color-mix(in oklch, var(--accent) 12%, transparent)",
  },
  {
    key: "en_camino",
    label: "En camino",
    sublabel: "Motorizado salió",
    Icon: Truck,
    color: "var(--color-primary, #00B4A6)",
    bg: "color-mix(in oklch, var(--color-primary, #00B4A6) 12%, transparent)",
  },
  {
    key: "entregado",
    label: "Entregado",
    sublabel: "Venta concretada",
    Icon: PackageCheck,
    color: "var(--data-success-500)",
    bg: "color-mix(in oklch, var(--data-success-500) 14%, transparent)",
  },
];

function fmtSoles(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export default function SalesFlowHero({
  onNavigate,
}: {
  onNavigate: (subtab: string) => void;
}) {
  const [state, setState] = useState<FlowState>({
    loading: true,
    pendiente: 0,
    confirmado: 0,
    en_camino: 0,
    entregado: 0,
    pipelineRevenue: 0,
    closedRevenueToday: 0,
    closedRevenueMonth: 0,
    ordersToday: 0,
  });

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/api/marketplace/orders");
        if (!res.ok) {
          if (!cancel) setState((s) => ({ ...s, loading: false }));
          return;
        }
        const orders: OrderLite[] = await res.json();
        if (cancel || !Array.isArray(orders)) return;

        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let pendiente = 0,
          confirmado = 0,
          en_camino = 0,
          entregado = 0;
        let pipelineRevenue = 0,
          closedRevenueToday = 0,
          closedRevenueMonth = 0,
          ordersToday = 0;

        for (const o of orders) {
          const created = new Date(o.createdAt);
          const total = Number(o.total ?? 0);
          if (o.status === "pendiente") {
            pendiente++;
            pipelineRevenue += total;
          } else if (o.status === "confirmado") {
            confirmado++;
            pipelineRevenue += total;
          } else if (o.status === "en_camino") {
            en_camino++;
            pipelineRevenue += total;
          } else if (o.status === "entregado") {
            entregado++;
            if (created >= startOfDay) closedRevenueToday += total;
            if (created >= startOfMonth) closedRevenueMonth += total;
          }
          if (created >= startOfDay && o.status !== "cancelado") ordersToday++;
        }

        if (!cancel) {
          setState({
            loading: false,
            pendiente,
            confirmado,
            en_camino,
            entregado,
            pipelineRevenue,
            closedRevenueToday,
            closedRevenueMonth,
            ordersToday,
          });
        }
      } catch (err) {
        console.warn("[SalesFlowHero] fetch failed", err);
        if (!cancel) setState((s) => ({ ...s, loading: false }));
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const totalActive =
    state.pendiente + state.confirmado + state.en_camino;

  return (
    <div className="space-y-4 mb-5">
      {/* ── Hero gradient con KPIs principales ────────────────────── */}
      <div
        className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00B4A6) 100%)",
        }}
      >
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.08)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-16 -left-12 w-48 h-48 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.05)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-start">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-white/85 mb-2">
              <Receipt className="h-3.5 w-3.5" strokeWidth={2.5} />
              Flujo de venta del marketplace
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
              {state.loading
                ? "Cargando..."
                : totalActive > 0
                  ? `${totalActive} ${totalActive === 1 ? "pedido" : "pedidos"} en proceso`
                  : "Sin pedidos en proceso"}
            </h2>
            <p className="text-sm text-white/85 mt-2 leading-relaxed max-w-xl">
              La venta solo se concreta cuando el motorizado{" "}
              <span className="font-extrabold text-white">entrega</span> el
              pedido. Mientras esté en el flujo, son ingresos potenciales.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5">
            <div
              className="px-5 py-3 rounded-2xl backdrop-blur-sm flex items-center gap-3 min-w-[200px]"
              style={{
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.32)",
              }}
            >
              <Wallet
                className="h-5 w-5 text-white shrink-0"
                strokeWidth={2.5}
              />
              <div>
                <p className="text-xs text-white/85 font-bold uppercase tracking-wider leading-none">
                  Pipeline
                </p>
                <p className="text-lg font-extrabold text-white tabular-nums leading-tight mt-1">
                  {fmtSoles(state.pipelineRevenue)}
                </p>
                <p className="text-xs text-white/75 mt-0.5">
                  Aún por concretar
                </p>
              </div>
            </div>
            <div
              className="px-5 py-3 rounded-2xl backdrop-blur-sm flex items-center gap-3"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
            >
              <TrendingUp
                className="h-5 w-5 text-white shrink-0"
                strokeWidth={2.5}
              />
              <div>
                <p className="text-xs text-white/85 font-bold uppercase tracking-wider leading-none">
                  Concretado hoy
                </p>
                <p className="text-lg font-extrabold text-white tabular-nums leading-tight mt-1">
                  {fmtSoles(state.closedRevenueToday)}
                </p>
                <p className="text-xs text-white/75 mt-0.5">
                  {state.entregado} {state.entregado === 1 ? "entrega" : "entregas"}{" "}
                  · mes: {fmtSoles(state.closedRevenueMonth)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pipeline de 4 pasos ──────────────────────────────────── */}
      <div
        className="rounded-3xl p-5 sm:p-6"
        style={{
          background: "var(--color-card)",
          border: "1px solid var(--color-card-border)",
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-muted">
              PIPELINE DEL PEDIDO
            </p>
            <p className="text-base font-extrabold text-foreground leading-tight mt-0.5">
              Cada pedido pasa por estos 4 estados
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("ordenes")}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-extrabold transition-all hover:-translate-y-0.5"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
              color: "white",
              boxShadow:
                "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent)",
            }}
          >
            Ver pedidos
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Pipeline visual con conector */}
        <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STEP_META.map((step, i) => {
            const count = state[step.key];
            const isLast = i === STEP_META.length - 1;
            const Icon = step.Icon;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => onNavigate("ordenes")}
                className="relative text-left rounded-2xl p-4 transition-all hover:-translate-y-0.5"
                style={{
                  background: isLast
                    ? `linear-gradient(135deg, ${step.bg} 0%, var(--color-card) 100%)`
                    : "var(--color-card)",
                  border: isLast
                    ? `2px solid color-mix(in oklch, ${step.color} 35%, transparent)`
                    : `1px solid var(--color-card-border)`,
                  boxShadow: isLast
                    ? `0 4px 12px -4px color-mix(in oklch, ${step.color} 25%, transparent)`
                    : undefined,
                }}
              >
                {/* Step number + arrow connector */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 relative"
                    style={{ background: step.bg }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: step.color }}
                      strokeWidth={2.25}
                    />
                    {count > 0 && !isLast && (
                      <span
                        className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full animate-pulse ring-2"
                        style={{
                          background: step.color,
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ["--tw-ring-color" as any]: "var(--color-card)",
                        }}
                      />
                    )}
                  </div>
                  <span
                    className="text-xs font-extrabold uppercase tracking-wider tabular-nums px-2 py-0.5 rounded-full"
                    style={{
                      background: `color-mix(in oklch, ${step.color} 12%, transparent)`,
                      color: step.color,
                    }}
                  >
                    {i + 1}/4
                  </span>
                </div>

                <p
                  className="text-base font-extrabold leading-tight"
                  style={{ color: isLast ? step.color : "var(--text-primary)" }}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted mt-0.5">{step.sublabel}</p>

                <div className="mt-3 pt-3 border-t flex items-baseline justify-between gap-2"
                  style={{ borderColor: "var(--color-card-border)" }}
                >
                  <span
                    className="text-2xl font-extrabold tabular-nums leading-none"
                    style={{ color: step.color }}
                  >
                    {state.loading ? "—" : count}
                  </span>
                  <span className="text-xs text-muted font-bold">
                    {count === 1 ? "pedido" : "pedidos"}
                  </span>
                </div>

                {isLast && (
                  <span
                    className="inline-block mt-2 text-xs font-extrabold uppercase tracking-wider"
                    style={{ color: step.color }}
                  >
                    ← Acá la venta cuenta
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom hint */}
        <div
          className="mt-4 pt-4 border-t flex items-start gap-3"
          style={{ borderColor: "var(--color-card-border)" }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background:
                "color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
            }}
          >
            <Receipt
              className="h-4 w-4 text-primary"
              strokeWidth={2.25}
            />
          </div>
          <div className="text-sm text-muted leading-relaxed">
            <span className="font-extrabold text-foreground">
              Hasta no entregar, no es venta concretada.
            </span>{" "}
            Solo los pedidos con status <span className="font-bold">Entregado</span>{" "}
            registran ticket, descuentan stock real y suman a tus métricas
            cerradas. El pipeline (
            <span className="font-bold">{fmtSoles(state.pipelineRevenue)}</span>) son
            ingresos potenciales en proceso.
          </div>
        </div>
      </div>
    </div>
  );
}
