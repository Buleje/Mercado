"use client";

/**
 * PanelClient — Hub del cliente para tienda individual (v4 wide+pro).
 *
 * Layout profesional 2-col en lg+:
 *   - LEFT (col-span-2): hero + stats + pedidos recientes + accesos
 *   - RIGHT (col-span-1, sticky): tier card detallado + tip motivación
 *
 * En mobile colapsa a 1-col stacked. Brand-first, max-w-7xl matching
 * del storefront /tienda. Más profesional, más denso visualmente sin
 * perder respiro.
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
  Settings,
  TrendingUp,
  Award,
  Package,
  Sparkles,
  Heart,
  Gift,
  Zap,
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
const TIER_META: Record<
  Tier,
  { label: string; medal: string; description: string }
> = {
  bronce:   { label: "Bronce",   medal: "🥉", description: "Estás empezando — cada compra suma" },
  plata:    { label: "Plata",    medal: "🥈", description: "5% de descuento permanente" },
  oro:      { label: "Oro",      medal: "🥇", description: "10% off + delivery prioritario" },
  diamante: { label: "Diamante", medal: "💎", description: "VIP — beneficios exclusivos" },
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
  pendiente:  { label: "Pendiente",  bgVar: "var(--data-warning-500)",          fgVar: "var(--data-warning-700)",          Icon: Clock },
  confirmado: { label: "Preparando", bgVar: "var(--color-primary, #00A0A0)",    fgVar: "var(--color-primary-dark, #009690)", Icon: CheckCircle2 },
  en_camino:  { label: "En camino",  bgVar: "var(--color-primary, #00A0A0)",    fgVar: "var(--color-primary-dark, #009690)", Icon: Truck },
  entregado:  { label: "Entregado",  bgVar: "var(--data-success-500)",          fgVar: "var(--data-success-700)",          Icon: CheckCircle2 },
  cancelado:  { label: "Cancelado",  bgVar: "var(--data-error-500)",            fgVar: "var(--data-error-700)",            Icon: Clock },
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

const TILES: Array<{
  href: string;
  label: string;
  hint: string;
  Icon: typeof MapPin;
}> = [
  { href: "/favoritos",             label: "Favoritos",      hint: "Productos guardados",   Icon: Heart },
  { href: "/mis-pedidos",           label: "Historial",      hint: "Todos tus pedidos",     Icon: ClipboardList },
  { href: "/puntos",                label: "Mis puntos",     hint: "Canjea por descuentos", Icon: Trophy },
  { href: "/mi-credito",            label: "Mi crédito",     hint: "Saldo disponible",      Icon: CreditCard },
  { href: "/cuenta/direcciones",    label: "Direcciones",    hint: "Puntos de entrega",     Icon: MapPin },
  { href: "/cuenta/notificaciones", label: "Notificaciones", hint: "Avisos del negocio",    Icon: Bell },
  { href: "/cuenta/preferencias",   label: "Preferencias",   hint: "Idioma, tema, alertas", Icon: Settings },
  { href: "/cuenta/cupones",        label: "Cupones",        hint: "Códigos disponibles",   Icon: Gift },
];

// ── Reusable card frame ───────────────────────────────────────────────
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl ${className}`}
      style={{
        background: "var(--color-card)",
        border:
          "1px solid var(--color-card-border)",
        boxShadow:
          "0 1px 2px color-mix(in oklch, var(--color-primary, #00A0A0) 10%, transparent)",
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
    style?: React.CSSProperties;
  }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00A0A0) 5%, transparent)",
        borderBottom:
          "1px solid var(--color-card-border)",
      }}
    >
      <div className="inline-flex items-center gap-2">
        <Icon
          className="h-4 w-4"
          strokeWidth={2.25}
          style={{ color: "var(--color-primary-dark, #009690)" }}
        />
        <h2
          className="text-sm font-extrabold uppercase tracking-wider"
          style={{ color: "var(--color-primary-dark, #009690)" }}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export default function PanelClient() {
  const { customer } = useCustomer();
  const { data: intelligence } = useCustomerIntelligence();
  const tenantPath = useTenantPath();

  const firstName =
    customer?.name?.split(" ")[0] ||
    intelligence.name?.split(" ")[0] ||
    "Cliente";
  const isAuth = Boolean(customer);

  const tier: Tier = intelligence.loyaltyTier ?? "bronce";
  const points = intelligence.loyaltyPoints;
  const tierMeta = TIER_META[tier];
  const { nextTier, pointsToNext, progress } = nextTierInfo(tier, points);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    if (!customer?.phone) {
      setLoadingOrders(false);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/orders?phone=${encodeURIComponent(customer.phone)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.orders) ? (data.orders as Order[]) : [];
        setOrders(list);
      })
      .catch(() => {})
      .finally(() => setLoadingOrders(false));
    return () => ctrl.abort();
  }, [customer?.phone]);

  const stats = useMemo(() => {
    const total = orders.reduce((acc, o) => acc + (o.total ?? 0), 0);
    const completed = orders.filter((o) => o.status === "entregado").length;
    const active = orders.filter((o) =>
      ["pendiente", "confirmado", "en_camino"].includes(o.status),
    ).length;
    const lastOrder = orders[0];
    return {
      total,
      completed,
      active,
      count: orders.length,
      lastDate: lastOrder?.createdAt,
    };
  }, [orders]);

  const recentOrders = orders.slice(0, 5);
  const activeOrders = orders.filter((o) =>
    ["pendiente", "confirmado", "en_camino"].includes(o.status),
  );

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════════════════
          HERO — full width
      ═══════════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden rounded-3xl px-6 sm:px-10 py-8 sm:py-10 text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00A0A0) 100%)",
          boxShadow:
            "0 24px 56px -18px color-mix(in oklch, var(--color-primary, #00A0A0) 50%, transparent)",
        }}
      >
        <div
          className="absolute -top-20 -right-20 h-72 w-72 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.10)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-14 -left-14 h-56 w-56 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.07)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
          aria-hidden="true"
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-end">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold uppercase tracking-[var(--tracking-kicker)] text-white/85">
              Mi panel · Tienda
            </p>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05] mt-1.5">
              ¡Hola, {firstName}!
            </h1>
            <p className="text-base text-white/85 mt-2 max-w-xl leading-relaxed">
              {isAuth
                ? `Acá está tu actividad, tus pedidos y todo lo que ganaste como cliente ${tierMeta.label}.`
                : "Identifícate desde el menú de usuario para desbloquear tu historial."}
            </p>
            {isAuth && (
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1.5 border border-white/25 text-sm font-extrabold">
                  <span className="text-base">{tierMeta.medal}</span>
                  Cliente {tierMeta.label}
                </span>
                {activeOrders.length > 0 && (
                  <Link
                    href={tenantPath("/mis-pedidos")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white text-sm font-extrabold px-3 py-1.5 active:scale-95 transition-transform"
                    style={{ color: "var(--color-primary-dark, #009690)" }}
                  >
                    <Truck className="h-4 w-4" strokeWidth={2.5} />
                    {activeOrders.length} pedido
                    {activeOrders.length === 1 ? "" : "s"} activo
                    {activeOrders.length === 1 ? "" : "s"}
                  </Link>
                )}
              </div>
            )}
          </div>

          {isAuth && (
            <div className="text-left lg:text-right shrink-0">
              <p className="text-xs font-bold uppercase tracking-wider text-white/75">
                Tus puntos
              </p>
              <p className="text-5xl sm:text-6xl font-extrabold tabular-nums leading-none mt-1">
                {points.toLocaleString()}
              </p>
              <p className="text-sm text-white/85 mt-1">
                {nextTier
                  ? `Faltan ${pointsToNext.toLocaleString()} para ${TIER_META[nextTier].label}`
                  : "Tier máximo alcanzado"}
              </p>
            </div>
          )}
        </div>

        {isAuth && nextTier && (
          <div className="relative mt-6">
            <div className="relative h-2.5 rounded-full overflow-hidden bg-white/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white"
                style={{
                  width: `${progress}%`,
                  transition: "width 0.6s ease-out",
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-white/85 font-bold">
              <span>
                {TIER_META[tier].medal} {tierMeta.label}
              </span>
              <span className="text-white/95">{Math.round(progress)}%</span>
              <span>
                {TIER_META[nextTier].medal} {TIER_META[nextTier].label}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          STATS ROW — 4 KPIs
      ═══════════════════════════════════════════════════════════════ */}
      {isAuth && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              label: "Pedidos totales",
              value: stats.count.toString(),
              sub: stats.lastDate
                ? `Último ${formatDate(stats.lastDate)}`
                : "Sin pedidos",
              Icon: ShoppingBag,
            },
            {
              label: "Invertido",
              value: fmt(stats.total),
              sub: "En tu tienda favorita",
              Icon: TrendingUp,
            },
            {
              label: "Completados",
              value: stats.completed.toString(),
              sub: `de ${stats.count} totales`,
              Icon: CheckCircle2,
            },
            {
              label: "En curso",
              value: stats.active.toString(),
              sub: stats.active > 0 ? "Sigue en vivo" : "Sin pedidos activos",
              Icon: Truck,
              accent: stats.active > 0,
            },
          ].map((s) => (
            <Card key={s.label} className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start justify-between">
                <div
                  className="h-10 w-10 rounded-2xl flex items-center justify-center"
                  style={
                    s.accent
                      ? {
                          background:
                            "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                        }
                      : {
                          background:
                            "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)",
                        }
                  }
                >
                  <s.Icon
                    className="h-5 w-5"
                    strokeWidth={2.25}
                    style={{
                      color: s.accent
                        ? "white"
                        : "var(--color-primary-dark, #009690)",
                    }}
                  />
                </div>
                {s.accent && (
                  <span
                    className="h-2 w-2 rounded-full animate-pulse mt-2"
                    style={{ background: "var(--color-primary, #00A0A0)" }}
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted mt-3">
                {s.label}
              </p>
              <p
                className="text-2xl sm:text-3xl font-extrabold tabular-nums leading-tight mt-0.5"
                style={{
                  color: s.accent
                    ? "var(--color-primary-dark, #009690)"
                    : "var(--color-foreground)",
                }}
              >
                {s.value}
              </p>
              <p className="text-xs text-muted mt-1 leading-tight truncate">
                {s.sub}
              </p>
            </Card>
          ))}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MAIN GRID — left main + right sidebar (sticky en lg+)
      ═══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── LEFT (col-span-2 en lg+) ─── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pedidos recientes */}
          <Card className="overflow-hidden">
            <CardHeader
              icon={ClipboardList}
              title="Pedidos recientes"
              action={
                <Link
                  href={tenantPath("/mis-pedidos")}
                  className="inline-flex items-center gap-1 text-xs font-bold hover:underline underline-offset-2"
                  style={{ color: "var(--color-primary-dark, #009690)" }}
                >
                  Ver todo
                  <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
                </Link>
              }
            />

            {loadingOrders ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-2xl animate-pulse"
                    style={{
                      background:
                        "color-mix(in oklch, var(--color-primary, #00A0A0) 6%, var(--surface-sunken))",
                    }}
                  />
                ))}
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="p-10 text-center">
                <div
                  className="w-16 h-16 mx-auto rounded-3xl flex items-center justify-center mb-3"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                  }}
                >
                  <Package className="h-8 w-8 text-white" strokeWidth={2} />
                </div>
                <p
                  className="text-lg font-extrabold"
                  style={{ color: "var(--color-primary-dark, #009690)" }}
                >
                  {isAuth ? "Aún no tienes pedidos" : "Identifícate primero"}
                </p>
                <p className="text-sm text-muted mt-1 max-w-xs mx-auto">
                  {isAuth
                    ? "Cuando hagas tu primera compra aparecerá aquí en tiempo real"
                    : "Tus pedidos se sincronizan con tu cuenta"}
                </p>
                <Link
                  href={tenantPath("/tienda")}
                  className="inline-flex items-center gap-2 mt-5 h-12 px-6 rounded-2xl text-sm font-extrabold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                    boxShadow:
                      "0 8px 20px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)",
                  }}
                >
                  <ShoppingBag className="h-4 w-4" strokeWidth={2.25} />
                  Ir a comprar
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--rule-soft)]">
                {recentOrders.map((order) => {
                  const pill = STATUS_PILL[order.status];
                  const itemCount =
                    order.items?.reduce(
                      (acc, i) => acc + (i.quantity ?? i.qty ?? 0),
                      0,
                    ) ?? 0;
                  const items = order.items ?? [];
                  const previewItems = items.slice(0, 3);
                  return (
                    <Link
                      key={order.id}
                      href={tenantPath(`/mis-pedidos?order=${order.id}`)}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--surface-sunken)]/40 transition-colors group"
                    >
                      {/* Stack de thumbnails */}
                      <div className="flex -space-x-3 shrink-0">
                        {previewItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="relative h-14 w-14 rounded-2xl overflow-hidden ring-2 ring-[var(--color-card)]"
                            style={{
                              background:
                                "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--surface-sunken))",
                              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                              zIndex: previewItems.length - idx,
                            }}
                          >
                            {item.image ? (
                              <Image
                                src={item.image}
                                alt=""
                                fill
                                sizes="56px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <ShoppingBag
                                  className="h-5 w-5"
                                  style={{
                                    color:
                                      "var(--color-primary-dark, #009690)",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                        {items.length > 3 && (
                          <div
                            className="relative h-14 w-14 rounded-2xl flex items-center justify-center text-xs font-extrabold ring-2 ring-[var(--color-card)]"
                            style={{
                              background:
                                "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                              color: "white",
                              zIndex: 0,
                            }}
                          >
                            +{items.length - 3}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
                            Pedido #{order.id.slice(-6).toUpperCase()}
                          </p>
                          <span
                            className="inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-0.5 rounded-full shrink-0"
                            style={{
                              background: `color-mix(in oklch, ${pill.bgVar} 14%, transparent)`,
                              color: pill.fgVar,
                            }}
                          >
                            <pill.Icon className="h-3 w-3" strokeWidth={2.5} />
                            {pill.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted mt-0.5 leading-snug truncate">
                          {itemCount}{" "}
                          {itemCount === 1 ? "producto" : "productos"}
                          {items[0]?.name &&
                            ` · ${items[0].name}${items.length > 1 ? ` y ${items.length - 1} más` : ""}`}
                        </p>
                        <p className="text-xs text-muted mt-1 tabular-nums">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className="text-lg font-extrabold tabular-nums"
                          style={{
                            color: "var(--color-primary-dark, #009690)",
                          }}
                        >
                          {fmt(order.total ?? 0)}
                        </p>
                        <ChevronRight
                          className="h-5 w-5 inline-block mt-1 group-hover:translate-x-0.5 transition-transform"
                          style={{ color: "var(--color-primary, #00A0A0)" }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Accesos rápidos — grid 4 columnas en desktop */}
          <Card className="overflow-hidden">
            <CardHeader icon={Award} title="Accesos rápidos" />
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {TILES.map((tile, idx) => {
                const totalCols = 4;
                const isLastRow =
                  idx >= TILES.length - (TILES.length % totalCols || totalCols);
                const isRightCol = (idx + 1) % totalCols === 0;
                return (
                  <Link
                    key={tile.href}
                    href={tenantPath(tile.href)}
                    className="group flex flex-col items-start gap-2 p-4 sm:p-5 hover:bg-[var(--surface-sunken)]/40 transition-colors"
                    style={{
                      borderRight: isRightCol
                        ? "none"
                        : "1px solid var(--rule-soft)",
                      borderBottom: isLastRow
                        ? "none"
                        : "1px solid var(--rule-soft)",
                    }}
                  >
                    <div
                      className="h-11 w-11 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform"
                      style={{
                        background:
                          "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)",
                      }}
                    >
                      <tile.Icon
                        className="h-5 w-5"
                        strokeWidth={2.25}
                        style={{ color: "var(--color-primary-dark, #009690)" }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-extrabold leading-tight"
                        style={{ color: "var(--color-primary-dark, #009690)" }}
                      >
                        {tile.label}
                      </p>
                      <p className="text-xs text-muted leading-tight mt-0.5">
                        {tile.hint}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ─── RIGHT (col-span-1 en lg+, sticky) ─── */}
        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          {/* Tier card detallado */}
          {isAuth && (
            <Card className="overflow-hidden">
              <div
                className="px-5 py-5"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary-dark, #009690) 0%, var(--color-primary, #00A0A0) 100%)",
                }}
              >
                <div className="flex items-center gap-3 text-white">
                  <span className="text-3xl">{tierMeta.medal}</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/80">
                      Mi nivel
                    </p>
                    <p className="text-xl font-extrabold leading-tight">
                      Cliente {tierMeta.label}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-white/85 mt-2 leading-snug">
                  {tierMeta.description}
                </p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">
                    Puntos
                  </span>
                  <span
                    className="text-2xl font-extrabold tabular-nums"
                    style={{ color: "var(--color-primary-dark, #009690)" }}
                  >
                    {points.toLocaleString()}
                  </span>
                </div>
                {nextTier && (
                  <>
                    <div className="relative h-2 rounded-full overflow-hidden bg-[var(--surface-sunken)]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${progress}%`,
                          background:
                            "linear-gradient(90deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                          transition: "width 0.6s ease-out",
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted leading-snug">
                      <span
                        className="font-extrabold tabular-nums"
                        style={{
                          color: "var(--color-primary-dark, #009690)",
                        }}
                      >
                        {pointsToNext.toLocaleString()} pts
                      </span>{" "}
                      para subir a{" "}
                      <span className="font-bold">
                        {TIER_META[nextTier].medal} {TIER_META[nextTier].label}
                      </span>
                    </p>
                  </>
                )}
                <Link
                  href={tenantPath("/puntos")}
                  className="flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-extrabold text-white active:scale-[0.98] transition-transform"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                    boxShadow:
                      "0 6px 16px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
                  }}
                >
                  <Trophy className="h-4 w-4" strokeWidth={2.25} />
                  Ver mis puntos
                </Link>
              </div>
            </Card>
          )}

          {/* Tip / motivación */}
          <Card className="px-5 py-5">
            <div
              className="h-10 w-10 rounded-2xl flex items-center justify-center mb-3"
              style={{
                background:
                  "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)",
              }}
            >
              <Sparkles
                className="h-5 w-5"
                strokeWidth={2.25}
                style={{ color: "var(--color-primary-dark, #009690)" }}
              />
            </div>
            <p
              className="text-sm font-extrabold leading-tight"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              ¿Sabías?
            </p>
            <p className="text-sm text-[var(--text-primary)] mt-1 leading-snug">
              Por cada S/10 que gastas, ganas <strong>5 puntos</strong>.
              Acumúlalos y aplícalos como descuento en tu próximo pedido.
            </p>
            <Link
              href={tenantPath("/tienda")}
              className="inline-flex items-center gap-1 text-xs font-bold mt-3 hover:underline underline-offset-2"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              <Zap className="h-3 w-3" strokeWidth={2.5} />
              Empezá a sumar
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
