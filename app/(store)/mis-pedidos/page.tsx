"use client";

import { useState, useEffect, useCallback, useMemo, startTransition } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import {
  Package, Clock, CheckCircle2, Truck, XCircle,
  ClipboardList, Search, RotateCcw,
  ArrowLeft, ShoppingCart, Share2, MapPin, Phone,
  X, ChevronRight, Download, Sparkles, TrendingUp,
  Award, Filter, Zap,
} from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import {
  CanastaVacia,
  LupaConfundida,
  IllustrationCard,
} from "@/components/ui-system/illustrations";
import type { MockOrderItem } from "@/lib/customer-orders.mock";
const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const QuickReorderModal = dynamic(() => import("@/components/QuickReorderModal"));

// ── Types (mantiene compatibilidad con API real) ────────────────────
type Order = {
  id: string;
  items?: MockOrderItem[];
  total?: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: "yape" | "efectivo";
  createdAt: string;
  updatedAt: string;
  notes?: string;
  storeName?: string;
  storeDistance?: string;
  deliveryAddress?: string;
  deliveryWindow?: string;
  courierName?: string;
  courierPhone?: string;
};

// ── Config ─────────────────────────────────────────────────────────
const STATUS_CFG = {
  pendiente: {
    label: "Pendiente",
    cls: "bg-amber-50 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-400",
    Icon: Clock,
  },
  confirmado: {
    label: "Confirmado",
    cls: "bg-teal-50 text-[var(--accent-dark)] dark:bg-teal-900/30 dark:text-teal-300",
    dot: "bg-teal-400",
    Icon: CheckCircle2,
  },
  en_camino: {
    label: "En camino",
    cls: "bg-amber-50 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-400",
    Icon: Truck,
  },
  entregado: {
    label: "Entregado",
    cls: "bg-teal-50 text-[var(--accent-dark)] dark:bg-teal-900/30 dark:text-teal-300",
    dot: "bg-teal-400",
    Icon: CheckCircle2,
  },
  cancelado: {
    label: "Cancelado",
    cls: "bg-red-50 text-[var(--data-error-600)] dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-400",
    Icon: XCircle,
  },
} as const;

const ACTIVE_STATUSES = ["pendiente", "confirmado", "en_camino"] as const;
type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

const FILTERS = [
  { key: "todos", label: "Todos", Icon: ClipboardList },
  { key: "en_curso", label: "En curso", Icon: Truck },
  { key: "entregado", label: "Entregados", Icon: CheckCircle2 },
  { key: "cancelado", label: "Cancelados", Icon: XCircle },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const TIMELINE_STEPS = [
  { status: "pendiente" as const, label: "Recibido", Icon: Clock },
  { status: "confirmado" as const, label: "Preparando", Icon: CheckCircle2 },
  { status: "en_camino" as const, label: "En camino", Icon: Truck },
  { status: "entregado" as const, label: "Entregado", Icon: Package },
] as const;

// ── Loyalty tiers (mismo cálculo que el sistema de fidelidad) ─────────
const TIERS = [
  { key: "bronce",   label: "Bronce",   min: 0,  max: 5,   color: "var(--data-warning-700)" },
  { key: "plata",    label: "Plata",    min: 5,  max: 20,  color: "var(--text-secondary)" },
  { key: "oro",      label: "Oro",      min: 20, max: 50,  color: "var(--data-warning-600)" },
  { key: "diamante", label: "Diamante", min: 50, max: 200, color: "var(--accent)" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────
function fmt(n?: number | null) {
  return `S/${(n ?? 0).toFixed(2)}`;
}
function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Compacta el id del orden para mostrar como #ABC123 */
function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

/**
 * Agrupa items de TODOS los pedidos completados y devuelve los TOP N
 * productos más comprados (suma de quantities). Smart reorder.
 */
function computeTopProducts(orders: Order[], limit = 3): MockOrderItem[] {
  const map = new Map<string, MockOrderItem & { totalQty: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    for (const it of o.items ?? []) {
      const key = `${it.productId ?? it.name}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += it.quantity ?? 0;
      } else {
        map.set(key, { ...it, totalQty: it.quantity ?? 0 });
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, limit);
}

/**
 * Convierte fechas ISO en matriz 4×7 (4 semanas × 7 días) de actividad.
 * Cada celda tiene cantidad de pedidos hechos ese día.
 */
function computeActivityHeat(orders: Order[]): number[][] {
  const matrix: number[][] = Array.from({ length: 4 }, () => Array(7).fill(0));
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const startMs = now.getTime() - 27 * 24 * 60 * 60 * 1000;
  for (const o of orders) {
    const d = new Date(o.createdAt);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((d.getTime() - startMs) / (24 * 60 * 60 * 1000));
    if (diffDays < 0 || diffDays > 27) continue;
    const week = Math.floor(diffDays / 7);
    const day = diffDays % 7;
    matrix[week][day] = (matrix[week][day] ?? 0) + 1;
  }
  return matrix;
}

// ── Tier Ring (SVG) ────────────────────────────────────────────────
function TierRing({ orderCount }: { orderCount: number }) {
  const tier = TIERS.find((t) => orderCount < t.max) ?? TIERS[TIERS.length - 1];
  const next = TIERS[TIERS.indexOf(tier) + 1];
  const progress = Math.min(
    1,
    (orderCount - tier.min) / (tier.max - tier.min || 1),
  );
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r={radius}
              fill="none"
              stroke="var(--color-card-border)"
              strokeWidth="6"
            />
            <circle
              cx="40" cy="40" r={radius}
              fill="none"
              stroke={tier.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 800ms ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Award className="h-7 w-7" style={{ color: tier.color }} strokeWidth={2.25} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Tu nivel
          </p>
          <p className="text-xl font-extrabold leading-tight" style={{ color: tier.color }}>
            {tier.label}
          </p>
          <p className="text-xs text-muted mt-1">
            {next ? (
              <>
                {next.min - orderCount} pedido{next.min - orderCount === 1 ? "" : "s"} para{" "}
                <span style={{ color: next.color }} className="font-bold">
                  {next.label}
                </span>
              </>
            ) : (
              <span className="font-bold" style={{ color: tier.color }}>
                Nivel máximo alcanzado
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Heat Map ───────────────────────────────────────────────────────
function HeatMap({ orders }: { orders: Order[] }) {
  const matrix = useMemo(() => computeActivityHeat(orders), [orders]);
  const max = Math.max(1, ...matrix.flat());

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">
          Tu actividad
        </p>
        <span className="text-xs text-muted">28 días</span>
      </div>
      <div className="flex flex-col gap-1">
        {matrix.map((week, wIdx) => (
          <div key={wIdx} className="flex gap-1">
            {week.map((count, dIdx) => {
              const intensity = count / max;
              return (
                <div
                  key={dIdx}
                  className="flex-1 aspect-square rounded-md"
                  style={{
                    background:
                      count === 0
                        ? "var(--color-card-border)"
                        : `color-mix(in oklch, var(--color-primary, #00B4A6) ${Math.round(intensity * 80) + 20}%, transparent)`,
                  }}
                  title={`${count} pedido${count === 1 ? "" : "s"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-muted">
        <span>Menos</span>
        <div className="flex gap-1">
          {[0.2, 0.4, 0.6, 0.8, 1].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-sm"
              style={{
                background: `color-mix(in oklch, var(--color-primary, #00B4A6) ${Math.round(i * 80) + 20}%, transparent)`,
              }}
            />
          ))}
        </div>
        <span>Más</span>
      </div>
    </div>
  );
}

// ── Smart Reorder ──────────────────────────────────────────────────
function SmartReorder({
  topItems,
  onReorder,
}: {
  topItems: MockOrderItem[];
  onReorder: (items: MockOrderItem[]) => void;
}) {
  if (topItems.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-4 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklch, var(--color-primary, #00B4A6) 12%, var(--color-card)) 0%, var(--color-card) 100%)",
        border:
          "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 28%, transparent)",
      }}
    >
      <div
        className="absolute -top-6 -right-6 w-20 h-20 rounded-full pointer-events-none"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent)",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" strokeWidth={2.25} />
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Tus favoritos
          </p>
        </div>
        <div className="space-y-2 mb-4">
          {topItems.map((item, i) => (
            <div key={`top-${i}`} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-extrabold"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                  color: "white",
                }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {item.name}
                </p>
                <p className="text-xs text-muted">
                  Pedido {item.quantity ?? 0}× en total
                </p>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onReorder(topItems)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-extrabold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
            color: "white",
            boxShadow:
              "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent)",
          }}
        >
          <Zap className="h-4 w-4" strokeWidth={2.5} />
          Pedir mismo combo
        </button>
      </div>
    </div>
  );
}

// ── Filter Pills ───────────────────────────────────────────────────
function FilterPills({
  current,
  counts,
  onSelect,
}: {
  current: FilterKey;
  counts: Record<FilterKey, number>;
  onSelect: (k: FilterKey) => void;
}) {
  return (
    <div
      className="rounded-2xl p-2"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-muted px-3 pt-2 pb-3 flex items-center gap-2">
        <Filter className="h-3.5 w-3.5" strokeWidth={2.25} />
        Filtrar
      </p>
      <div className="flex flex-col gap-1">
        {FILTERS.map(({ key, label, Icon }) => {
          const count = counts[key];
          const active = current === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-3 rounded-xl text-sm font-bold transition-all w-full",
                !active && "text-muted hover:text-foreground hover:bg-gray-50 dark:hover:bg-surface",
              )}
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                      color: "white",
                      boxShadow:
                        "0 4px 10px -2px color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
                    }
                  : undefined
              }
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" strokeWidth={2.25} />
                {label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-extrabold",
                  active
                    ? "bg-white/25 text-white"
                    : "bg-gray-100 dark:bg-surface text-muted",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline (full vertical en modal detalle) ──────────────────────
function OrderTimeline({ status }: { status: Order["status"] }) {
  if (status === "cancelado") {
    return (
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30">
        <XCircle className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
        <span className="text-sm font-semibold text-[var(--data-error-600)] dark:text-red-400">
          Pedido cancelado
        </span>
      </div>
    );
  }

  const currentIdx = TIMELINE_STEPS.findIndex((s) => s.status === status);

  return (
    <div className="relative">
      <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-100 dark:bg-surface" />
      <div
        className="absolute top-4 left-4 h-0.5 bg-primary/40 transition-all duration-500"
        style={{
          width:
            currentIdx <= 0
              ? "0%"
              : `${(currentIdx / (TIMELINE_STEPS.length - 1)) * 100}%`,
        }}
      />
      <div className="relative flex justify-between">
        {TIMELINE_STEPS.map((step, i) => {
          const isCompleted = i < currentIdx;
          const isCurrent = i === currentIdx;
          const Icon = step.Icon;
          return (
            <div key={step.status} className="flex flex-col items-center gap-1.5 w-16">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 relative",
                  isCurrent
                    ? "bg-primary text-white shadow-md shadow-primary/30 scale-110"
                    : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-gray-100 dark:bg-surface text-gray-300",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={cn(
                  "text-xs font-medium text-center leading-tight",
                  isCurrent
                    ? "text-primary font-bold"
                    : isCompleted
                      ? "text-muted"
                      : "text-gray-300 dark:text-muted/40",
                )}
              >
                {step.label}
              </span>
              {isCurrent && (
                <span className="text-[10px] text-primary/70 font-bold uppercase tracking-wider">
                  Ahora
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Order Detail Modal — modernizado con map preview ──────────────
function OrderDetailModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const st = STATUS_CFG[order.status] ?? STATUS_CFG.pendiente;
  const items = order.items ?? [];
  const isActive = ACTIVE_STATUSES.includes(order.status as ActiveStatus);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-7400 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del pedido #${shortId(order.id)}`}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full sm:max-w-2xl bg-white dark:bg-card rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Hero gradiente con status */}
        <div
          className="relative px-6 pt-6 pb-5 text-white overflow-hidden"
          style={{
            background: isActive
              ? "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)"
              : order.status === "entregado"
                ? "linear-gradient(135deg, var(--data-success-500) 0%, var(--accent-dark) 100%)"
                : "linear-gradient(135deg, var(--data-error-500) 0%, var(--data-error-600) 100%)",
          }}
        >
          <div
            className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: "rgba(255,255,255,0.12)" }}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                Pedido
              </span>
              <h2 className="text-2xl font-extrabold leading-tight tracking-tight">
                #{shortId(order.id)}
              </h2>
              <p className="text-sm text-white/85 mt-1">
                {fmtDateTime(order.createdAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors flex items-center justify-center shrink-0 border border-white/20"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
          <div className="relative mt-4 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-extrabold px-3 py-1.5 rounded-full bg-white text-foreground">
              <span className={cn("h-2 w-2 rounded-full", st.dot, isActive && "animate-pulse")} />
              {st.label}
            </span>
            {order.total != null && (
              <span className="inline-flex items-center gap-1.5 text-base font-extrabold tabular-nums text-white">
                {fmt(order.total)}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Map preview para activos */}
          {isActive && (
            <div
              className="relative h-40 rounded-2xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklch, var(--color-primary, #00B4A6) 18%, transparent) 0%, color-mix(in oklch, var(--color-primary, #00B4A6) 6%, var(--color-card)) 100%)",
                border:
                  "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 22%, transparent)",
              }}
            >
              <div
                className="absolute inset-0 opacity-40 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(var(--color-primary, #00B4A6) 1px, transparent 1px)",
                  backgroundSize: "16px 16px",
                }}
              />
              <div className="relative h-full p-5 flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-white dark:bg-card flex items-center justify-center shadow-md">
                    <Truck className="h-5 w-5 text-primary animate-pulse" strokeWidth={2.25} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">
                      Tu pedido va en camino
                    </p>
                    <p className="text-base font-extrabold text-foreground">
                      ETA aprox. 25 min
                    </p>
                  </div>
                </div>
                <Link
                  href={`/pedido/${order.id}`}
                  className="self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 transition-colors"
                >
                  <MapPin className="h-4 w-4" strokeWidth={2.25} />
                  Ver mapa en vivo
                </Link>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted mb-3">
              SEGUIMIENTO
            </p>
            <OrderTimeline status={order.status} />
          </div>

          {/* Productos */}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted mb-3">
              PRODUCTOS ({items.length})
            </p>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={`${order.id}-${item.productId ?? item.name}-${idx}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                >
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-surface shrink-0">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="48px"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-muted">
                      {item.quantity} {item.unit}
                    </p>
                  </div>
                  <p className="text-base font-extrabold text-foreground shrink-0 tabular-nums">
                    {fmt((item.price ?? 0) * (item.quantity ?? 0))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen */}
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{
              background:
                "color-mix(in oklch, var(--color-primary, #00B4A6) 4%, var(--color-card))",
              border: "1px solid var(--color-card-border)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted mb-2">
              RESUMEN
            </p>
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmt(order.total)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted">
              <span>Delivery</span>
              <span className="text-[var(--accent-dark)] dark:text-teal-400 font-extrabold">
                Gratis
              </span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-foreground border-t border-gray-100 dark:border-card-border pt-2">
              <span>Total</span>
              <span className="tabular-nums">{fmt(order.total)}</span>
            </div>
          </div>

          {order.deliveryAddress && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted mb-2">
                ENTREGA
              </p>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-primary" strokeWidth={2.25} />
                <div>
                  <p className="text-foreground font-bold">{order.deliveryAddress}</p>
                  {order.deliveryWindow && (
                    <p className="text-xs text-muted mt-0.5">
                      Ventana: {order.deliveryWindow}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {order.status === "en_camino" && order.courierName && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted mb-2">
                REPARTIDOR
              </p>
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3 border border-amber-100 dark:border-amber-800/30">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-800/30 flex items-center justify-center shrink-0">
                  <Truck className="h-6 w-6 text-[var(--data-warning-600)] dark:text-amber-400" strokeWidth={2.25} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-foreground">
                    {order.courierName}
                  </p>
                  {order.courierPhone && (
                    <p className="text-xs text-muted">{order.courierPhone}</p>
                  )}
                </div>
                {order.courierPhone && (
                  <a
                    href={`https://wa.me/51${order.courierPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent-dark)] text-white text-sm font-extrabold hover:opacity-90 transition-opacity"
                  >
                    <Phone className="h-4 w-4" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-muted space-y-1">
            {order.paymentMethod && (
              <p>
                Pago con{" "}
                <span className="font-bold text-foreground">
                  {order.paymentMethod === "yape" ? "Yape" : "Efectivo"}
                </span>
              </p>
            )}
            {order.storeName && (
              <p>
                Bodega:{" "}
                <span className="font-bold text-foreground">{order.storeName}</span>
                {order.storeDistance ? ` · ${order.storeDistance}` : ""}
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1 pb-2">
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border-2 border-gray-200 dark:border-card-border text-sm font-extrabold text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
            >
              <Download className="h-4 w-4" />
              Boleta
            </button>
            {isActive && (
              <Link
                href={`/pedido/${order.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
              >
                <Truck className="h-4 w-4" strokeWidth={2.25} />
                Rastrear en vivo
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Active Order Card (timeline horizontal + ETA destacado) ───────
function ActiveOrderCard({
  order,
  onViewDetail,
  onCancel,
}: {
  order: Order;
  onViewDetail: (o: Order) => void;
  onCancel?: (id: string) => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const items = order.items ?? [];
  const currentIdx = TIMELINE_STEPS.findIndex((s) => s.status === order.status);
  const progress = currentIdx <= 0 ? 0 : currentIdx / (TIMELINE_STEPS.length - 1);
  const itemCount = items.reduce((s, i) => s + (i.quantity ?? 0), 0);

  return (
    <div
      className="rounded-3xl p-5 transition-all hover:-translate-y-0.5 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklch, var(--data-warning-500) 8%, var(--color-card)) 0%, var(--color-card) 100%)",
        border:
          "2px solid color-mix(in oklch, var(--data-warning-500) 30%, transparent)",
        boxShadow:
          "0 8px 24px -8px color-mix(in oklch, var(--data-warning-500) 28%, transparent)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background:
            "linear-gradient(90deg, var(--data-warning-500) 0%, var(--color-primary, #00B4A6) 100%)",
        }}
      />

      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background:
                "linear-gradient(135deg, var(--data-warning-500) 0%, var(--color-primary, #00B4A6) 100%)",
              boxShadow:
                "0 6px 14px -4px color-mix(in oklch, var(--data-warning-500) 40%, transparent)",
            }}
          >
            <Truck className="h-5 w-5 text-white animate-pulse" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-foreground leading-tight">
              #{shortId(order.id)}
            </p>
            <p className="text-xs text-muted">{fmtDate(order.createdAt)}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-extrabold tabular-nums text-foreground">
            {fmt(order.total)}
          </p>
          <p className="text-xs text-muted">
            {itemCount} {itemCount === 1 ? "ítem" : "ítems"}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full transition-all duration-700"
            style={{
              width: `${progress * 100}%`,
              background:
                "linear-gradient(90deg, var(--data-warning-500) 0%, var(--color-primary, #00B4A6) 100%)",
            }}
          />
        </div>
        <div className="flex justify-between mt-2">
          {TIMELINE_STEPS.map((step, i) => {
            const isCurrent = i === currentIdx;
            const isDone = i < currentIdx;
            return (
              <span
                key={step.status}
                className={cn(
                  "text-xs font-bold",
                  isCurrent
                    ? "text-primary"
                    : isDone
                      ? "text-muted"
                      : "text-gray-300 dark:text-muted/40",
                )}
              >
                {step.label}
              </span>
            );
          })}
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-sm text-muted">
          <Package className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} />
          <span className="truncate">
            {items[0].name}
            {items.length > 1 ? ` · y ${items.length - 1} más` : ""}
          </span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => onViewDetail(order)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-extrabold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
            boxShadow:
              "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent)",
          }}
        >
          <Truck className="h-4 w-4" strokeWidth={2.5} />
          Rastrear
        </button>
        <button
          type="button"
          onClick={() => onViewDetail(order)}
          className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl border-2 text-sm font-extrabold text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          style={{ borderColor: "var(--color-card-border)" }}
        >
          Detalle
        </button>
        {order.status === "pendiente" && onCancel && (
          confirmingCancel ? (
            <div className="flex items-center gap-1.5 w-full mt-2">
              <button
                type="button"
                onClick={() => {
                  onCancel(order.id);
                  setConfirmingCancel(false);
                }}
                className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl bg-[var(--data-error-500)] text-white text-sm font-extrabold hover:bg-[var(--data-error-600)] transition-colors"
              >
                <XCircle className="h-4 w-4" /> Sí, cancelar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                className="py-3 px-4 rounded-xl bg-gray-100 dark:bg-surface text-muted text-sm font-extrabold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-[var(--data-error-600)] dark:text-red-400 text-sm font-extrabold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              title="Cancelar pedido"
              aria-label="Cancelar pedido"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ── Completed Order Card ──────────────────────────────────────────
function CompletedOrderCard({
  order,
  onViewDetail,
  onReorder,
}: {
  order: Order;
  onViewDetail: (o: Order) => void;
  onReorder?: (items: MockOrderItem[], orderId?: string, orderDate?: string) => void;
}) {
  const st = STATUS_CFG[order.status] ?? STATUS_CFG.entregado;
  const items = order.items ?? [];
  const itemCount = items.reduce((s, i) => s + (i.quantity ?? 0), 0);
  const isCancelled = order.status === "cancelado";

  return (
    <div
      className="rounded-3xl p-5 transition-all hover:-translate-y-0.5 bg-white dark:bg-card"
      style={{
        border: isCancelled
          ? "1px solid color-mix(in oklch, var(--data-error-500) 22%, transparent)"
          : "1px solid var(--color-card-border)",
        boxShadow: isCancelled
          ? "0 4px 12px -4px color-mix(in oklch, var(--data-error-500) 14%, transparent)"
          : "0 4px 12px -4px color-mix(in oklch, var(--accent-dark) 12%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: isCancelled
                ? "color-mix(in oklch, var(--data-error-500) 14%, transparent)"
                : "color-mix(in oklch, var(--data-success-500) 14%, transparent)",
            }}
          >
            <st.Icon
              className="h-5 w-5"
              style={{
                color: isCancelled
                  ? "var(--data-error-500)"
                  : "var(--data-success-500)",
              }}
              strokeWidth={2.25}
            />
          </div>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-foreground leading-tight">
              #{shortId(order.id)}
            </p>
            <p className="text-xs text-muted">
              {fmtDate(order.createdAt)}
              {order.paymentMethod &&
                ` · ${order.paymentMethod === "yape" ? "Yape" : "Efectivo"}`}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-extrabold tabular-nums text-foreground">
            {fmt(order.total)}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-extrabold px-2 py-0.5 rounded-full mt-1",
              st.cls,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
            {st.label}
          </span>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex -space-x-2">
            {items.slice(0, 3).map((item, idx) => (
              <div
                key={`thumb-${idx}`}
                className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-surface ring-2 ring-white dark:ring-card flex items-center justify-center"
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    width={32}
                    height={32}
                    className="object-cover"
                  />
                ) : (
                  <Package className="h-3.5 w-3.5 text-gray-300" />
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted truncate flex-1 min-w-0">
            {itemCount} {itemCount === 1 ? "producto" : "productos"}
            {items.length > 0 && ` · ${items[0].name}`}
            {items.length > 1 ? ` y ${items.length - 1} más` : ""}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onViewDetail(order)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-extrabold text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors"
          style={{ borderColor: "var(--color-card-border)" }}
        >
          Ver detalle
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
        {order.status === "entregado" && onReorder && (
          <button
            type="button"
            onClick={() => onReorder(items, order.id, order.createdAt)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-extrabold text-white transition-all hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
              boxShadow:
                "0 4px 10px -2px color-mix(in oklch, var(--color-primary, #00B4A6) 35%, transparent)",
            }}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2.5} />
            Repetir
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const lines = [
              `Pedido #${shortId(order.id)}`,
              fmtDate(order.createdAt),
              "",
              ...items.map((i) => `- ${i.quantity}${i.unit} ${i.name}`),
              "",
              `Total: ${fmt(order.total)}`,
            ];
            const text = lines.join("\n");
            if (navigator.share) {
              navigator.share({ text }).catch(() => {});
            } else {
              navigator.clipboard.writeText(text).catch(() => {});
            }
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gray-100 dark:bg-surface text-muted text-sm font-extrabold hover:bg-gray-200 dark:hover:bg-card-hover transition-colors"
          title="Compartir pedido"
          aria-label="Compartir pedido"
        >
          <Share2 className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────
function OrderSkeleton() {
  return (
    <div
      className="rounded-3xl p-5 animate-pulse"
      style={{
        background: "var(--color-card)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-gray-100 dark:bg-surface" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-gray-100 dark:bg-surface rounded-full" />
          <div className="h-3 w-32 bg-gray-100 dark:bg-surface rounded-full" />
        </div>
        <div className="h-5 w-16 bg-gray-100 dark:bg-surface rounded-full" />
      </div>
      <div className="h-2 w-full bg-gray-100 dark:bg-surface rounded-full mb-4" />
      <div className="flex gap-2">
        <div className="flex-1 h-11 bg-gray-100 dark:bg-surface rounded-xl" />
        <div className="h-11 w-24 bg-gray-100 dark:bg-surface rounded-xl" />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function MisPedidosPage() {
  const { customer, openModal: openCustomerModal } = useCustomer();
  const { addMultiple } = useCart();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identified, setIdentified] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [reorderModal, setReorderModal] = useState<{
    items: MockOrderItem[];
    orderId: string;
    orderDate: string;
  } | null>(null);

  const loadOrders = useCallback(async (phoneNum: string) => {
    const clean = phoneNum.replace(/\D/g, "");
    if (clean.length < 6) {
      setError("Ingresa tu número completo (mínimo 6 dígitos)");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/customers/${encodeURIComponent(clean)}/orders`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Order[] = await res.json();
      startTransition(() => {
        setOrders(data);
        setIdentified(true);
      });
    } catch (err) {
      startTransition(() => {
        setOrders([]);
        setIdentified(true);
        setError(
          err instanceof Error && err.message.startsWith("HTTP")
            ? "No pudimos cargar tus pedidos. Intentá de nuevo en un momento."
            : "",
        );
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customer?.phone && !identified) {
      loadOrders(customer.phone);
    }
  }, [customer, identified, loadOrders]);

  useEffect(() => {
    if (!customer?.phone && !identified && !loading) {
      const t = setTimeout(() => openCustomerModal("profile"), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReorder = useCallback(
    (items: MockOrderItem[], orderId?: string, orderDate?: string) => {
      setReorderModal({
        items,
        orderId: orderId ?? "favoritos",
        orderDate: orderDate ? fmtDate(orderDate) : "Tus favoritos",
      });
    },
    [],
  );

  const handleSmartReorder = useCallback(
    (items: MockOrderItem[]) => {
      handleReorder(items);
    },
    [handleReorder],
  );

  const handleCancel = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "cancelado" }),
      });
      if (!res.ok) return;
      setOrders(
        (prev) =>
          prev?.map((o) =>
            o.id === id
              ? {
                  ...o,
                  status: "cancelado" as const,
                  updatedAt: new Date().toISOString(),
                }
              : o,
          ) ?? null,
      );
    } catch {
      /* silent */
    }
  }, []);

  const safeOrders = orders ?? [];
  const activeOrders = safeOrders.filter((o) =>
    ACTIVE_STATUSES.includes(o.status as ActiveStatus),
  );
  const completedOrders = safeOrders.filter((o) => o.status !== "cancelado");
  const totalSpent = completedOrders.reduce((s, o) => s + (o.total ?? 0), 0);

  const filterCounts: Record<FilterKey, number> = {
    todos: safeOrders.length,
    en_curso: activeOrders.length,
    entregado: safeOrders.filter((o) => o.status === "entregado").length,
    cancelado: safeOrders.filter((o) => o.status === "cancelado").length,
  };

  const filtered = safeOrders.filter((o) => {
    if (filter === "en_curso") {
      if (!ACTIVE_STATUSES.includes(o.status as ActiveStatus)) return false;
    } else if (filter !== "todos" && o.status !== filter) {
      return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const idMatch = o.id.toLowerCase().includes(q);
      const nameMatch = (o.items ?? []).some((i) =>
        i.name.toLowerCase().includes(q),
      );
      if (!idMatch && !nameMatch) return false;
    }
    return true;
  });

  const filteredActive = filtered.filter((o) =>
    ACTIVE_STATUSES.includes(o.status as ActiveStatus),
  );
  const filteredCompleted = filtered.filter(
    (o) => !ACTIVE_STATUSES.includes(o.status as ActiveStatus),
  );

  const topProducts = useMemo(
    () => computeTopProducts(safeOrders, 3),
    [safeOrders],
  );

  return (
    <div
      className="min-h-screen dark:bg-background"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00B4A6) 4%, var(--surface-base, #f9fafb))",
      }}
    >
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Mis pedidos", url: "https://www.buleje.pe/mis-pedidos" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      {/* ── Hero compacto ─────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden pt-28 sm:pt-32 pb-8"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00B4A6) 100%)",
        }}
      >
        <div
          className="absolute -top-20 -right-20 h-80 w-80 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.06)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-24 -left-12 h-56 w-56 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.04)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end gap-4 flex-wrap">
            <Link
              href="/mi-panel"
              className="h-12 w-12 inline-flex items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm hover:bg-white/25 transition-colors text-white shrink-0 border border-white/20"
              aria-label="Volver a mi cuenta"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
            </Link>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.18em] text-white/85 mb-1">
                <ClipboardList className="h-3.5 w-3.5" strokeWidth={2.5} />
                Pedidos
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
                Todo tu historial
              </h1>
            </div>

            {identified && safeOrders.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={2.5} />
                  <div>
                    <p className="text-base font-extrabold text-white tabular-nums leading-none">
                      {completedOrders.length}
                    </p>
                    <p className="text-xs text-white/75 font-bold">Realizados</p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}
                >
                  <TrendingUp className="h-4 w-4 text-white" strokeWidth={2.5} />
                  <div>
                    <p className="text-base font-extrabold text-white tabular-nums leading-none">
                      {fmt(totalSpent)}
                    </p>
                    <p className="text-xs text-white/75 font-bold">Invertido</p>
                  </div>
                </div>
                {activeOrders.length > 0 && (
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-sm"
                    style={{
                      background: "rgba(255,255,255,0.18)",
                      border: "1px solid rgba(255,255,255,0.32)",
                    }}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                    <div>
                      <p className="text-base font-extrabold text-white tabular-nums leading-none">
                        {activeOrders.length}
                      </p>
                      <p className="text-xs text-white/85 font-bold">En curso</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <main
        id="main-content"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 pb-28"
      >
        {!identified && !loading && (
          <div
            className="rounded-3xl p-8 text-center space-y-5 max-w-md mx-auto"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-card-border)",
            }}
          >
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
              <ClipboardList className="h-10 w-10 text-primary/60" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-foreground">
                Consultá tu historial
              </h2>
              <p className="text-base text-muted mt-2 leading-relaxed">
                Identificate desde la barra de navegación para ver todos tus pedidos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCustomerModal("profile")}
              className="w-full h-12 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20 flex items-center justify-center gap-2"
            >
              <Search className="h-4 w-4" strokeWidth={2.25} />
              Ver mis pedidos
            </button>
            {error && (
              <p className="text-sm text-[var(--data-error-500)] font-bold">{error}</p>
            )}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 mt-6">
            <div className="space-y-4">
              <div
                className="rounded-2xl p-4 animate-pulse h-32"
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-card-border)",
                }}
              />
              <div
                className="rounded-2xl p-4 animate-pulse h-48"
                style={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-card-border)",
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <OrderSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {identified && orders !== null && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 mt-6">
            {/* ─── SIDEBAR ───────────────────────────────────── */}
            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted"
                  strokeWidth={2.25}
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por #ID o producto"
                  className="w-full h-12 pl-12 pr-4 rounded-2xl border-2 text-base font-medium text-foreground placeholder:text-muted/70 transition-colors focus:outline-none focus:border-primary"
                  style={{
                    background: "var(--color-card)",
                    borderColor: "var(--color-card-border)",
                  }}
                />
              </div>

              <FilterPills
                current={filter}
                counts={filterCounts}
                onSelect={setFilter}
              />

              {completedOrders.length > 0 && (
                <TierRing orderCount={completedOrders.length} />
              )}

              {topProducts.length > 0 && (
                <SmartReorder
                  topItems={topProducts}
                  onReorder={handleSmartReorder}
                />
              )}

              {safeOrders.length > 0 && <HeatMap orders={safeOrders} />}
            </aside>

            {/* ─── MAIN ─────────────────────────────────────── */}
            <div className="space-y-6 min-w-0">
              {filteredActive.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--data-warning-500)] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--data-warning-500)]" />
                      </span>
                      En curso
                    </h2>
                    <span className="text-sm text-muted font-bold">
                      {filteredActive.length} pedido{filteredActive.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {filteredActive.map((o) => (
                      <ActiveOrderCard
                        key={o.id}
                        order={o}
                        onViewDetail={setSelectedOrder}
                        onCancel={handleCancel}
                      />
                    ))}
                  </div>
                </section>
              )}

              {filteredCompleted.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-extrabold text-foreground">
                      Historial
                    </h2>
                    <span className="text-sm text-muted font-bold">
                      {filteredCompleted.length} pedido{filteredCompleted.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredCompleted.map((o) => (
                      <CompletedOrderCard
                        key={o.id}
                        order={o}
                        onViewDetail={setSelectedOrder}
                        onReorder={handleReorder}
                      />
                    ))}
                  </div>
                </section>
              )}

              {filtered.length === 0 && (
                <IllustrationCard
                  size="md"
                  illustration={
                    filter !== "todos" || search ? (
                      <LupaConfundida size={140} />
                    ) : (
                      <CanastaVacia size={150} />
                    )
                  }
                  kicker={
                    filter !== "todos" || search ? "Sin resultados" : "Mis pedidos"
                  }
                  title={
                    search
                      ? "Nada coincide con tu búsqueda"
                      : filter !== "todos"
                        ? "Nada coincide con este filtro"
                        : "Hacé tu primer pedido"
                  }
                  description={
                    search
                      ? "Probá con otro término o limpiá la búsqueda."
                      : filter !== "todos"
                        ? "Probá cambiando el filtro para ver otros pedidos."
                        : "Realizá tu primer pedido y verás acá el historial con estado y tiempo de entrega."
                  }
                  primaryAction={
                    filter === "todos" && !search ? (
                      <Link
                        href="/tienda"
                        className="inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-6 py-3 text-base font-extrabold hover:opacity-90 transition-opacity"
                      >
                        <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
                        Explorar tienda
                      </Link>
                    ) : undefined
                  }
                />
              )}

              {filtered.length > 0 && (
                <div
                  className="rounded-3xl p-6 text-center space-y-3 relative overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in oklch, var(--color-primary, #00B4A6) 8%, var(--color-card)) 0%, var(--color-card) 100%)",
                    border:
                      "1px solid color-mix(in oklch, var(--color-primary, #00B4A6) 20%, transparent)",
                  }}
                >
                  <div
                    className="absolute -top-8 -right-8 w-28 h-28 rounded-full pointer-events-none"
                    style={{
                      background:
                        "color-mix(in oklch, var(--color-primary, #00B4A6) 14%, transparent)",
                    }}
                  />
                  <div className="relative">
                    <p className="text-base font-extrabold text-foreground">
                      ¿Necesitás algo más?
                    </p>
                    <p className="text-sm text-muted mt-1 mb-4">
                      Delivery rápido · Paga con Yape o efectivo
                    </p>
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Link
                        href="/tienda"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-extrabold transition-all hover:-translate-y-0.5"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                          boxShadow:
                            "0 6px 14px -4px color-mix(in oklch, var(--color-primary, #00B4A6) 40%, transparent)",
                        }}
                      >
                        <ShoppingCart className="h-4 w-4" strokeWidth={2.5} />
                        Hacer otro pedido
                      </Link>
                      <Link
                        href="/mi-panel"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-foreground text-sm font-extrabold border-2 transition-colors hover:bg-gray-50 dark:hover:bg-surface"
                        style={{
                          background: "var(--color-card)",
                          borderColor: "var(--color-card-border)",
                        }}
                      >
                        Mi cuenta
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <CartSidebar />
      <MobileBottomNav />

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {reorderModal && (
        <QuickReorderModal
          items={reorderModal.items}
          orderId={reorderModal.orderId}
          orderDate={reorderModal.orderDate}
          onClose={() => setReorderModal(null)}
          onConfirm={(selected) => {
            if (selected.length) addMultiple(selected);
          }}
        />
      )}
    </div>
  );
}
