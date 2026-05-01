"use client";

import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { m, AnimatePresence } from "framer-motion";
import NumberFlow from "@number-flow/react";
import {
  ShoppingCart,
  Package,
  Truck,
  BarChart3,
  Check,
  TrendingUp,
  AlertCircle,
  Clock,
  Users,
  Wallet,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface TabFeature {
  id: string;
  icon: React.ElementType;
  title: string;
  shortDesc: string;
  bullets: string[];
  mockup: React.ReactNode;
}

// Mock data que rota — crea sensación de "vivo"
function POSMockup() {
  const [sales, setSales] = useState(1247);
  const [orders, setOrders] = useState(23);
  return (
    <div className="h-full bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
            <ShoppingCart className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <span className="text-xs font-extrabold text-gray-900 dark:text-white">
            Punto de Venta
          </span>
        </div>
        <span className="text-[length:var(--ts-2xs)] font-bold text-emerald-600 inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-dot" />
          En vivo
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
          <p className="text-[length:var(--ts-2xs)] text-gray-500 uppercase font-bold">Ventas hoy</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums mt-1">
            S/
            <NumberFlow value={sales} format={{ maximumFractionDigits: 0 }} />
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
          <p className="text-[length:var(--ts-2xs)] text-gray-500 uppercase font-bold">Pedidos</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-white tabular-nums mt-1">
            <NumberFlow value={orders} />
          </p>
        </div>
      </div>

      {/* Fake product list */}
      <div className="px-4 pb-4 space-y-2">
        {[
          { name: "Arroz costeño 5kg", qty: 12, price: 38 },
          { name: "Aceite primor 1L", qty: 8, price: 9.5 },
          { name: "Coca Cola 3L", qty: 15, price: 11 },
        ].map((p, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-900"
          >
            <div>
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                {p.name}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-gray-500">{p.qty} vendidos</p>
            </div>
            <span className="text-xs font-extrabold text-emerald-600 tabular-nums">
              S/{p.price.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setSales((s) => s + Math.floor(Math.random() * 50) + 10);
          setOrders((o) => o + 1);
        }}
        className="m-4 w-[calc(100%-2rem)] py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
      >
        + Registrar venta (demo)
      </button>
    </div>
  );
}

function InventoryMockup() {
  return (
    <div className="h-full bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
            <Package className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <span className="text-xs font-extrabold text-gray-900 dark:text-white">
            Inventario
          </span>
        </div>
        <span className="text-[length:var(--ts-2xs)] font-bold text-amber-600 inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />3 alertas
        </span>
      </div>

      <div className="p-4 space-y-2">
        {[
          { name: "Leche Gloria 1L", stock: 3, min: 10, status: "low" },
          { name: "Papel higiénico 4pk", stock: 28, min: 5, status: "ok" },
          { name: "Detergente Ace 2kg", stock: 1, min: 6, status: "critical" },
          { name: "Galletas oreo", stock: 45, min: 10, status: "ok" },
          { name: "Pan integral 500g", stock: 2, min: 8, status: "low" },
        ].map((p, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                {p.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      p.status === "critical"
                        ? "bg-red-500"
                        : p.status === "low"
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                    )}
                    style={{ width: `${Math.min(100, (p.stock / Math.max(p.min * 2, 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-[length:var(--ts-2xs)] text-gray-500 tabular-nums shrink-0">
                  {p.stock}/{p.min * 2}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveryMockup() {
  return (
    <div className="h-full bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
            <Truck className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <span className="text-xs font-extrabold text-gray-900 dark:text-white">
            Delivery en curso
          </span>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {[
          { name: "María Vásquez", dist: "Yarinacocha", eta: "8 min", status: "En camino" },
          { name: "Pedro López", dist: "Callería", eta: "15 min", status: "Preparando" },
          { name: "Ana Tello", dist: "Centro", eta: "Entregado", status: "Completado" },
        ].map((d, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900"
          >
            <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-extrabold shrink-0">
              {d.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                {d.name}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-gray-500 truncate">
                {d.dist} · {d.status}
              </p>
            </div>
            <span className="text-[length:var(--ts-2xs)] font-extrabold text-blue-600 shrink-0 inline-flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {d.eta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsMockup() {
  const bars = [42, 67, 58, 81, 74, 92, 85];
  const days = ["L", "M", "M", "J", "V", "S", "D"];
  return (
    <div className="h-full bg-white dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <span className="text-xs font-extrabold text-gray-900 dark:text-white">
            Analytics
          </span>
        </div>
        <span className="text-[length:var(--ts-2xs)] font-bold text-emerald-600 inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          +32%
        </span>
      </div>

      <div className="p-4">
        <p className="text-[length:var(--ts-2xs)] text-gray-500 uppercase font-bold mb-1">
          Ventas esta semana
        </p>
        <p className="text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums">
          S/<NumberFlow value={8472} format={{ maximumFractionDigits: 0 }} />
        </p>

        {/* Mini bar chart */}
        <div className="mt-5 flex items-end gap-1.5 h-24">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full relative" style={{ height: "72px" }}>
                <div
                  className="absolute bottom-0 w-full rounded-t-md bg-linear-to-t from-primary to-primary/60 transition-all duration-700"
                  style={{ height: `${h}%` }}
                />
              </div>
              <span className="text-[length:var(--ts-2xs)] text-gray-400 font-bold">{days[i]}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[length:var(--ts-2xs)] text-gray-500">Ticket promedio</p>
            <p className="text-sm font-extrabold text-gray-900 dark:text-white tabular-nums">
              S/34
            </p>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] text-gray-500">Clientes</p>
            <p className="text-sm font-extrabold text-gray-900 dark:text-white tabular-nums">
              248
            </p>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] text-gray-500">Margen</p>
            <p className="text-sm font-extrabold text-emerald-600 tabular-nums">
              28%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURES: TabFeature[] = [
  {
    id: "pos",
    icon: ShoppingCart,
    title: "Punto de Venta",
    shortDesc: "Vende rápido desde el mostrador",
    bullets: [
      "Escaneás código y cobrás en segundos",
      "Genera boleta/factura automática",
      "Acepta Yape, Plin, efectivo y tarjeta",
      "Funciona offline — sincroniza cuando vuelve internet",
    ],
    mockup: <POSMockup />,
  },
  {
    id: "inventario",
    icon: Package,
    title: "Inventario",
    shortDesc: "Stock en tiempo real, alertas y vencimientos",
    bullets: [
      "Sabes qué producto te está por faltar",
      "Alertas de vencimiento automáticas",
      "Control de mermas y pérdidas",
      "Conteo físico vs sistema con 1 click",
    ],
    mockup: <InventoryMockup />,
  },
  {
    id: "delivery",
    icon: Truck,
    title: "Delivery",
    shortDesc: "Pedidos online con tracking en vivo",
    bullets: [
      "Tus clientes piden desde el celular",
      "Asignás repartidor con un tap",
      "Cliente ve en vivo dónde está su pedido",
      "Rutas optimizadas para ahorrar tiempo",
    ],
    mockup: <DeliveryMockup />,
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics",
    shortDesc: "Dashboard con tus números reales",
    bullets: [
      "Ventas diarias, semanales y mensuales",
      "Qué producto se vende más (y cuál menos)",
      "Margen real de cada venta",
      "Reportes para SUNAT listos para descargar",
    ],
    mockup: <AnalyticsMockup />,
  },
];

export default function BusinessTabsShowcase() {
  const [active, setActive] = useState(FEATURES[0].id);

  return (
    <Tabs.Root
      value={active}
      onValueChange={setActive}
      className="mt-8"
    >
      <Tabs.List
        className="flex flex-wrap gap-2 justify-center mb-8"
        aria-label="Features"
      >
        {FEATURES.map((f) => {
          const Icon = f.icon;
          const isActive = active === f.id;
          return (
            <Tabs.Trigger
              key={f.id}
              value={f.id}
              className={cn(
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-bold transition-all",
                isActive
                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-primary/40 hover:text-primary",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {f.title}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      <div className="relative grid lg:grid-cols-2 gap-8 items-center">
        <AnimatePresence mode="wait">
          {FEATURES.map(
            (f) =>
              active === f.id && (
                <m.div
                  key={f.id + "-desc"}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="order-2 lg:order-1"
                >
                  <h3 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white leading-tight">
                    {f.title}
                  </h3>
                  <p className="mt-3 text-lg text-gray-500 dark:text-gray-400">
                    {f.shortDesc}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {f.bullets.map((b, i) => (
                      <m.li
                        key={b}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        className="flex items-start gap-3"
                      >
                        <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {b}
                        </span>
                      </m.li>
                    ))}
                  </ul>
                </m.div>
              ),
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {FEATURES.map(
            (f) =>
              active === f.id && (
                <m.div
                  key={f.id + "-mockup"}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.35 }}
                  className="order-1 lg:order-2 h-[460px]"
                >
                  <Tabs.Content value={f.id} forceMount className="h-full">
                    {f.mockup}
                  </Tabs.Content>
                </m.div>
              ),
          )}
        </AnimatePresence>
      </div>
    </Tabs.Root>
  );
}
