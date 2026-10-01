"use client";

/**
 * CuentaDashboardClient — Hub unificado del cliente.
 *
 * Rediseño 2026-06-26 v4 — BENTO MODULAR (Brandon): mosaico de tiles de distinto
 * tamaño en una grilla 2/4-col. Tile grande de "pedido reciente", tile de puntos
 * con progreso de tier, stats compactas y una tira de accesos rápidos. Reemplaza
 * el stack vertical hero+cards anterior por un layout tipo app.
 *
 * Datos 100% reales: useCustomer (contexto) + useCustomerIntelligence
 * (/api/customer/intelligence) + /api/orders. Estados authed/invitado, loading,
 * error con retry y vacío honesto.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCustomer } from "@/contexts/customer-context";
import { useCustomerIntelligence } from "@/hooks/use-customer-intelligence";
import { useTenantPath } from "@/hooks/use-tenant-path";
import {
  Trophy,
  ShoppingBag,
  ClipboardList,
  Truck,
  CheckCircle2,
  Clock,
  ChevronRight,
  MapPin,
  CreditCard,
  Bell,
  Gift,
  Settings,
  TrendingUp,
  Sparkles,
  Package,
  AlertTriangle,
  Medal,
  Award,
  Crown,
} from "@buleje/design-system/icons";

// ── Tier helpers ──────────────────────────────────────────────────────
type Tier = "bronce" | "plata" | "oro" | "diamante";

const TIER_THRESHOLDS: Record<Tier, number> = {
  bronce: 0,
  plata: 500,
  oro: 2000,
  diamante: 5000,
};
const TIER_ORDER: Tier[] = ["bronce", "plata", "oro", "diamante"];
// Iconos Lucide por tier (audit 2026-06-26: antes eran emojis 🥉🥈🥇💎 en UI).
const TIER_META: Record<Tier, { label: string; color: string; Icon: typeof Medal }> = {
  bronce:   { label: "Bronce",   color: "#cd7f32", Icon: Medal },
  plata:    { label: "Plata",    color: "#c0c0c0", Icon: Award },
  oro:      { label: "Oro",      color: "#ffd700", Icon: Trophy },
  diamante: { label: "Diamante", color: "#b9f2ff", Icon: Crown },
};

function nextTierInfo(currentTier: Tier, points: number) {
  const idx = TIER_ORDER.indexOf(currentTier);
  const next = TIER_ORDER[idx + 1];
  if (!next) return { nextTier: null, pointsToNext: 0, progress: 100 };
  const currentThreshold = TIER_THRESHOLDS[currentTier];
  const nextThreshold = TIER_THRESHOLDS[next];
  const pointsToNext = Math.max(0, nextThreshold - points);
  const range = nextThreshold - currentThreshold;
  const earned = points - currentThreshold;
  const progress = Math.min(100, Math.max(0, (earned / range) * 100));
  return { nextTier: next, pointsToNext, progress };
}

// ── Order types ───────────────────────────────────────────────────────
type OrderItem = {
  id: number;
  name: string;
  price: number;
  quantity?: number;
  qty?: number;
  image?: string;
};
type Order = {
  id: string;
  items?: OrderItem[];
  total?: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  createdAt: string;
};

const STATUS_PILL: Record<
  Order["status"],
  { label: string; bgVar: string; fgVar: string; Icon: typeof CheckCircle2 }
> = {
  pendiente:  { label: "Pendiente", bgVar: "var(--data-warning-500)", fgVar: "var(--data-warning-700)", Icon: Clock },
  confirmado: { label: "Preparando", bgVar: "var(--color-primary, #00A0A0)", fgVar: "var(--color-primary-dark, #009690)", Icon: CheckCircle2 },
  en_camino:  { label: "En camino", bgVar: "var(--color-primary, #00A0A0)", fgVar: "var(--color-primary-dark, #009690)", Icon: Truck },
  entregado:  { label: "Entregado", bgVar: "var(--data-success-500)", fgVar: "var(--data-success-700)", Icon: CheckCircle2 },
  cancelado:  { label: "Cancelado", bgVar: "var(--data-error-500)", fgVar: "var(--data-error-700)", Icon: Clock },
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

// ── Quick link tiles ──────────────────────────────────────────────────
type Tile = {
  href: string;
  label: string;
  hint: string;
  Icon: typeof MapPin;
};

const TILES: Tile[] = [
  { href: "/cuenta/direcciones",    label: "Direcciones",   hint: "Tus puntos de entrega",   Icon: MapPin },
  { href: "/cuenta/pagos",          label: "Pagos",          hint: "Métodos guardados",       Icon: CreditCard },
  { href: "/cuenta/cupones",        label: "Cupones",        hint: "Descuentos disponibles",  Icon: Gift },
  { href: "/cuenta/notificaciones", label: "Notificaciones", hint: "Avisos del negocio",      Icon: Bell },
  { href: "/cuenta/preferencias",   label: "Preferencias",   hint: "Idioma, tema, alertas",   Icon: Settings },
];

// Estilos compartidos de tile bento.
const CARD_STYLE = {
  background: "var(--color-card)",
  border: "1px solid var(--color-card-border)",
} as const;

export function CuentaDashboardClient() {
  const { customer } = useCustomer();
  const { data: intelligence } = useCustomerIntelligence();
  const tenantPath = useTenantPath();

  const firstName = customer?.name?.split(" ")[0] || intelligence.name?.split(" ")[0] || "Cliente";
  const isAuth = Boolean(customer);

  // Loyalty
  const tier: Tier = intelligence.loyaltyTier ?? "bronce";
  const points = intelligence.loyaltyPoints;
  const tierMeta = TIER_META[tier];
  const { nextTier, pointsToNext, progress } = nextTierInfo(tier, points);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  // Estado de error del fetch (audit 2026-06-26): antes el catch era vacío y un
  // error de red mostraba "sin pedidos" en vez de un aviso. reloadKey re-dispara.
  const [ordersError, setOrdersError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!customer?.phone) {
      setLoadingOrders(false);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/orders?phone=${encodeURIComponent(customer.phone)}`, {
      signal: ctrl.signal,
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        const list = Array.isArray(data?.orders) ? (data.orders as Order[]) : [];
        setOrders(list);
        setOrdersError(false);
      })
      .catch((err: unknown) => { if ((err as { name?: string })?.name !== "AbortError") setOrdersError(true); })
      .finally(() => setLoadingOrders(false));
    return () => ctrl.abort();
  }, [customer?.phone, reloadKey]);

  const stats = useMemo(() => {
    const total = orders.reduce((acc, o) => acc + (o.total ?? 0), 0);
    const completed = orders.filter((o) => o.status === "entregado").length;
    const active = orders.filter((o) =>
      ["pendiente", "confirmado", "en_camino"].includes(o.status),
    ).length;
    return { total, completed, active, count: orders.length };
  }, [orders]);

  const recentOrders = orders.slice(0, 4);

  const STAT_TILES = [
    { label: "Pedidos",     value: stats.count.toString(),     Icon: ShoppingBag,  accent: false },
    { label: "Activos",     value: stats.active.toString(),    Icon: Truck,        accent: stats.active > 0 },
    { label: "Completados", value: stats.completed.toString(), Icon: CheckCircle2, accent: false },
    { label: "Invertido",   value: fmt(stats.total),           Icon: TrendingUp,   accent: false },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* ═══ GREETING — gradient ═══ */}
      <section
        className="col-span-2 relative overflow-hidden rounded-3xl px-5 sm:px-6 py-6 text-white flex flex-col justify-center min-h-[150px]"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00A0A0) 100%)",
          boxShadow:
            "0 20px 40px -16px color-mix(in oklch, var(--color-primary, #00A0A0) 42%, transparent)",
        }}
      >
        <div
          className="absolute -top-14 -right-14 h-52 w-52 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.10)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/85">Mi panel</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mt-1">
            ¡Hola, {firstName}!
          </h1>
          {isAuth ? (
            <div className="inline-flex items-center gap-2 mt-3 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1.5 border border-white/20">
              <tierMeta.Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              <span className="text-sm font-extrabold">Cliente {tierMeta.label}</span>
            </div>
          ) : (
            <p className="text-sm text-white/85 mt-2 max-w-xs">
              Identifícate para ver tus pedidos, puntos y recompensas.
            </p>
          )}
        </div>
      </section>

      {/* ═══ PUNTOS — tile con progreso ═══ */}
      <Link
        href={tenantPath("/puntos")}
        className="col-span-2 rounded-3xl p-5 sm:p-6 flex flex-col justify-center min-h-[150px] transition-transform hover:scale-[1.005] active:scale-[0.99]"
        style={{
          background: "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--color-card))",
          border: "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2.5">
            <div
              className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                boxShadow: "0 8px 18px -6px color-mix(in oklch, var(--color-primary, #00A0A0) 45%, transparent)",
              }}
            >
              <Trophy className="h-5 w-5 text-white" strokeWidth={2.25} aria-hidden />
            </div>
            <p className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--color-primary-dark, #009690)" }}>
              {isAuth ? "Mis puntos" : "Centro de puntos"}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0" style={{ color: "var(--color-primary, #00A0A0)" }} />
        </div>

        {isAuth ? (
          <>
            <p
              className="text-4xl sm:text-5xl font-extrabold tabular-nums leading-none mt-3"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              {points.toLocaleString()}
            </p>
            {nextTier ? (
              <>
                <div
                  className="relative mt-3 h-2 rounded-full overflow-hidden"
                  style={{ background: "color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${progress}%`, background: "var(--color-primary, #00A0A0)", transition: "width 0.6s ease-out" }}
                  />
                </div>
                <p className="text-xs font-semibold text-muted mt-1.5">
                  {pointsToNext} pts para {TIER_META[nextTier].label}
                </p>
              </>
            ) : (
              <p className="text-xs font-semibold text-muted mt-2">Alcanzaste el tier máximo. ¡Crack!</p>
            )}
          </>
        ) : (
          <>
            <p className="text-base font-extrabold leading-tight mt-3" style={{ color: "var(--color-primary-dark, #009690)" }}>
              Gana puntos con cada compra
            </p>
            <p className="text-sm text-muted leading-snug mt-1">50 pts = S/1 de descuento en tu próximo pedido.</p>
          </>
        )}
      </Link>

      {/* ═══ PEDIDO RECIENTE — tile grande ═══ */}
      <section
        className={`col-span-2 ${isAuth ? "lg:row-span-2" : "lg:col-span-4"} rounded-3xl overflow-hidden flex flex-col`}
        style={CARD_STYLE}
      >
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3.5"
          style={{
            background: "color-mix(in oklch, var(--color-primary, #00A0A0) 6%, transparent)",
            borderBottom: "1px solid var(--color-card-border)",
          }}
        >
          <div className="inline-flex items-center gap-2">
            <ClipboardList className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--color-primary-dark, #009690)" }} />
            <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--color-primary-dark, #009690)" }}>
              Pedidos recientes
            </h2>
          </div>
          <Link
            href={tenantPath("/mis-pedidos")}
            className="inline-flex items-center gap-1 text-xs font-bold hover:underline underline-offset-2"
            style={{ color: "var(--color-primary-dark, #009690)" }}
          >
            Ver todo <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
          </Link>
        </div>

        {loadingOrders ? (
          <div className="p-4 space-y-2.5 flex-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl animate-pulse"
                style={{ background: "color-mix(in oklch, var(--color-primary, #00A0A0) 6%, var(--surface-sunken))" }}
              />
            ))}
          </div>
        ) : ordersError ? (
          <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "color-mix(in oklch, var(--data-error-500, #ef4444) 12%, transparent)" }}
            >
              <AlertTriangle className="h-7 w-7" strokeWidth={2} style={{ color: "var(--data-error-500, #ef4444)" }} />
            </div>
            <p className="text-base font-extrabold text-[var(--text-primary)]">No pudimos cargar tus pedidos</p>
            <p className="text-sm text-muted mt-1">Revisá tu conexión e intentá de nuevo.</p>
            <button
              type="button"
              onClick={() => { setLoadingOrders(true); setReloadKey((k) => k + 1); }}
              className="inline-flex items-center gap-2 mt-4 h-12 px-5 rounded-xl text-sm font-extrabold text-white"
              style={{ background: "var(--color-primary, #00A0A0)" }}
            >
              Reintentar
            </button>
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="p-8 text-center flex-1 flex flex-col items-center justify-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: "color-mix(in oklch, var(--color-primary, #00A0A0) 10%, transparent)" }}
            >
              <Package className="h-7 w-7" strokeWidth={2} style={{ color: "var(--color-primary-dark, #009690)" }} />
            </div>
            <p className="text-base font-extrabold" style={{ color: "var(--color-primary-dark, #009690)" }}>
              {isAuth ? "Aún no tienes pedidos" : "Identifícate para ver tus pedidos"}
            </p>
            <p className="text-sm text-muted mt-1">
              {isAuth ? "Cuando hagas tu primera compra aparecerá aquí" : "Tus pedidos viven sincronizados con tu cuenta"}
            </p>
            <Link
              href={tenantPath("/tienda")}
              className="inline-flex items-center gap-2 mt-4 h-12 px-5 rounded-xl text-sm font-extrabold text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                boxShadow: "0 8px 20px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)",
              }}
            >
              <ShoppingBag className="h-4 w-4" strokeWidth={2.25} />
              Ir a comprar
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--rule-soft)] flex-1">
            {recentOrders.map((order) => {
              const pill = STATUS_PILL[order.status];
              const itemCount = order.items?.reduce((acc, i) => acc + (i.quantity ?? i.qty ?? 0), 0) ?? 0;
              const firstItem = order.items?.[0];
              return (
                <Link
                  key={order.id}
                  href={tenantPath(`/mis-pedidos?order=${order.id}`)}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-[var(--surface-sunken)]/40 transition-colors"
                >
                  <div
                    className="relative h-14 w-14 rounded-xl overflow-hidden shrink-0"
                    style={{
                      background: "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--surface-sunken))",
                      border: "1px solid var(--color-card-border)",
                    }}
                  >
                    {firstItem?.image ? (
                      <Image src={firstItem.image} alt="" fill sizes="56px" className="object-cover" unoptimized />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <ShoppingBag className="h-5 w-5" style={{ color: "var(--color-primary-dark, #009690)" }} />
                      </div>
                    )}
                    {itemCount > 1 && (
                      <span
                        className="absolute -top-1 -right-1 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-white"
                        style={{ background: "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)" }}
                      >
                        {itemCount}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                        Pedido #{order.id.slice(-6).toUpperCase()}
                      </p>
                      <span
                        className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: `color-mix(in oklch, ${pill.bgVar} 14%, transparent)`, color: pill.fgVar }}
                      >
                        <pill.Icon className="h-3 w-3" strokeWidth={2.5} />
                        {pill.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 tabular-nums">
                      {formatDate(order.createdAt)} ·{" "}
                      {firstItem?.name && itemCount > 0
                        ? `${firstItem.name}${itemCount > 1 ? ` +${itemCount - 1}` : ""}`
                        : "Sin productos"}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-base font-extrabold tabular-nums" style={{ color: "var(--color-primary-dark, #009690)" }}>
                      {fmt(order.total ?? 0)}
                    </p>
                    <ChevronRight className="h-4 w-4 inline-block" style={{ color: "var(--color-primary, #00A0A0)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══ STAT TILES (authed) — 2×2 junto al pedido en lg ═══ */}
      {isAuth &&
        STAT_TILES.map((s) => (
          <div key={s.label} className="rounded-3xl p-4 flex flex-col justify-center min-h-[104px]" style={CARD_STYLE}>
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center mb-2"
              style={{ background: "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)" }}
            >
              <s.Icon className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--color-primary-dark, #009690)" }} />
            </div>
            <p
              className="text-xl sm:text-2xl font-extrabold tabular-nums leading-tight"
              style={{ color: s.accent ? "var(--color-primary-dark, #009690)" : "var(--color-foreground)" }}
            >
              {s.value}
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-muted mt-0.5">{s.label}</p>
          </div>
        ))}

      {/* ═══ ACCESOS RÁPIDOS — tira full-width ═══ */}
      <div className="col-span-2 lg:col-span-4 mt-1">
        <div className="inline-flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4" strokeWidth={2.25} style={{ color: "var(--color-primary-dark, #009690)" }} />
          <h2 className="text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--color-primary-dark, #009690)" }}>
            Accesos rápidos
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tenantPath(tile.href)}
              className="rounded-3xl p-4 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
              style={CARD_STYLE}
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center mb-2.5"
                style={{ background: "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)" }}
              >
                <tile.Icon className="h-5 w-5" strokeWidth={2.25} style={{ color: "var(--color-primary-dark, #009690)" }} />
              </div>
              <p className="text-sm font-extrabold leading-tight" style={{ color: "var(--color-primary-dark, #009690)" }}>
                {tile.label}
              </p>
              <p className="text-xs text-muted leading-tight mt-0.5">{tile.hint}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CuentaDashboardClient;
