"use client";
import { LoadingState, SectionTitle } from "@buleje/design-system";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  AlertCircle,
  Phone,
  Tag,
  RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Customer = {
  phone: string;
  name: string;
  totalSpent?: number;
};

type Order = {
  id: string;
  customerPhone?: string;
  createdAt: string;
};

type RiskLevel = "alto" | "medio" | "bajo";

type ChurnRecord = {
  phone: string;
  name: string;
  lastOrder: string | null;
  avgFrequency: number; // days between orders
  daysSinceLast: number;
  risk: RiskLevel;
  action: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date) {
  return Math.abs((a.getTime() - b.getTime()) / 86400000);
}

function inferRisk(daysSince: number, avgFreq: number): RiskLevel {
  const ratio = avgFreq > 0 ? daysSince / avgFreq : daysSince / 14;
  if (ratio >= 2) return "alto";
  if (ratio >= 1.5) return "medio";
  return "bajo";
}

function suggestAction(risk: RiskLevel): string {
  if (risk === "alto") return "Enviar cupon de retorno por WhatsApp";
  if (risk === "medio") return "Llamar por WhatsApp y recordarle";
  return "Mantener seguimiento normal";
}

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bg: string; bar: string }
> = {
  alto: {
    label: "Alto",
    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",
    bar: "bg-red-400",
  },
  medio: {
    label: "Medio",
    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",
    bar: "bg-amber-400",
  },
  bajo: {
    label: "Bajo",
    color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
    bar: "bg-[var(--accent-soft)]",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ChurnPrediction() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterRisk, setFilterRisk] = useState<RiskLevel | "todos">("todos");

  const fetchData = () => {
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/customers?limit=300").then((r) => r.ok ? r.json() : []),
      fetch("/api/orders?limit=2000").then((r) => r.ok ? r.json() : []),
    ])
      .then(([custData, orderData]) => {
        const cList: Customer[] = Array.isArray(custData)
          ? custData
          : (custData.customers ?? custData.data ?? []);
        const oList: Order[] = Array.isArray(orderData)
          ? orderData
          : (orderData.orders ?? orderData.data ?? []);
        setCustomers(cList);
        setOrders(oList);
      })
      .catch(() => setError("Error al cargar datos."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const churnRecords = useMemo<ChurnRecord[]>(() => {
    const now = new Date();
    return customers
      .map((c) => {
        const cOrders = orders
          .filter((o) => o.customerPhone === c.phone)
          .map((o) => new Date(o.createdAt))
          .sort((a, b) => a.getTime() - b.getTime());

        if (cOrders.length === 0) {
          const daysSinceLast = 999;
          return {
            phone: c.phone,
            name: c.name,
            lastOrder: null,
            avgFrequency: 0,
            daysSinceLast,
            risk: "alto" as RiskLevel,
            action: suggestAction("alto"),
          };
        }

        const lastDate = cOrders[cOrders.length - 1];
        const daysSinceLast = Math.floor(daysBetween(now, lastDate));

        let avgFrequency = 14; // default 2 weeks
        if (cOrders.length >= 2) {
          const gaps: number[] = [];
          for (let i = 1; i < cOrders.length; i++) {
            gaps.push(daysBetween(cOrders[i], cOrders[i - 1]));
          }
          avgFrequency = Math.round(
            gaps.reduce((a, b) => a + b, 0) / gaps.length
          );
        }

        const risk = inferRisk(daysSinceLast, avgFrequency);
        return {
          phone: c.phone,
          name: c.name,
          lastOrder: lastDate.toISOString().split("T")[0],
          avgFrequency,
          daysSinceLast,
          risk,
          action: suggestAction(risk),
        };
      })
      .sort((a, b) => {
        const order = { alto: 0, medio: 1, bajo: 2 };
        return order[a.risk] - order[b.risk];
      });
  }, [customers, orders]);

  const filtered =
    filterRisk === "todos"
      ? churnRecords
      : churnRecords.filter((r) => r.risk === filterRisk);

  const counts = {
    alto: churnRecords.filter((r) => r.risk === "alto").length,
    medio: churnRecords.filter((r) => r.risk === "medio").length,
    bajo: churnRecords.filter((r) => r.risk === "bajo").length,
  };

  const waLink = (phone: string, name: string) => {
    const text = encodeURIComponent(
      `Hola ${name}! Te extrañamos en Buleje. Tenemos una oferta especial para ti.`
    );
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Prediccion de Abandono
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Clientes que podrian dejar de comprar segun su frecuencia habitual
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-alt)] disabled:opacity-50 dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(["alto", "medio", "bajo"] as RiskLevel[]).map((r) => (
          <button
            key={r}
            onClick={() => setFilterRisk(filterRisk === r ? "todos" : r)}
            className={cn(
              "rounded-xl border p-4 text-left transition",
              filterRisk === r
                ? "border-primary bg-primary/5 dark:bg-primary/10"
                : "border-[var(--rule-base)] bg-white hover:border-[var(--rule-base)] dark:bg-gray-900"
            )}
          >
            <p className={cn("text-2xl font-bold", RISK_CONFIG[r].color)}>
              {counts[r]}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Riesgo {RISK_CONFIG[r].label}
            </p>
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 dark:border-[var(--data-error-500)]/30 dark:bg-[var(--data-error-500)]/10">
          <AlertCircle className="h-5 w-5 text-[var(--data-error-500)]" />
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
          {/* Filter bar */}
          <div className="flex gap-2 border-b border-[var(--rule-soft)] p-4 dark:border-[var(--rule-base)]">
            {["todos", "alto", "medio", "bajo"].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRisk(r as RiskLevel | "todos")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  filterRisk === r
                    ? "bg-primary text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] dark:bg-gray-800 dark:text-[var(--text-tertiary)] dark:hover:bg-gray-700"
                )}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
                {r !== "todos" && (
                  <span className="ml-1 opacity-70">
                    ({counts[r as RiskLevel]})
                  </span>
                )}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">
              No hay clientes en esta categoria.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((r) => (
                <div
                  key={r.phone}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4"
                >
                  {/* Name & risk */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)]">
                        {r.name}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          RISK_CONFIG[r.risk].bg,
                          RISK_CONFIG[r.risk].color
                        )}
                      >
                        Riesgo {RISK_CONFIG[r.risk].label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--text-tertiary)]">
                      <span>
                        Última compra:{" "}
                        {r.lastOrder
                          ? r.lastOrder
                          : "Nunca ha comprado"}
                      </span>
                      <span>
                        Sin comprar: {r.daysSinceLast === 999 ? "—" : `${r.daysSinceLast}d`}
                      </span>
                      <span>
                        Frecuencia normal:{" "}
                        {r.avgFrequency > 0 ? `cada ${r.avgFrequency}d` : "—"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Tag className="h-3 w-3 text-[var(--text-tertiary)]" />
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {r.action}
                      </span>
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <a
                    href={waLink(r.phone, r.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 self-start rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--accent-soft)] sm:self-auto"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    Contactar
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
