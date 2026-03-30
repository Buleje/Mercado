"use client";

import { useState } from "react";
import {
  ShoppingCart, Package, BarChart3,
  Truck, Brain,
  ChevronRight, Play, Sparkles, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Datos de las demos ───────────────────────────────────────────────────────

type DemoTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
  features: string[];
  stats: { label: string; value: string }[];
  gradient: string;
  mockUI: React.ReactNode;
};

const DEMO_TABS: DemoTab[] = [
  {
    id: "pos",
    label: "Punto de Venta",
    icon: <ShoppingCart className="h-4 w-4" />,
    color: "text-teal-600",
    title: "POS inteligente para tu bodega",
    description: "Cobra rapido con Yape, efectivo o Plin. Escanea productos, aplica descuentos y genera boletas al instante.",
    features: ["Cobro con Yape/Plin/efectivo", "Escaner de codigo de barras", "Descuentos y promociones automaticas", "Modo kiosk y movil"],
    stats: [{ label: "Tiempo promedio", value: "15s" }, { label: "Metodos de pago", value: "4" }, { label: "Ventas/dia", value: "200+" }],
    gradient: "from-teal-500 to-emerald-600",
    mockUI: <POSMock />,
  },
  {
    id: "inventory",
    label: "Inventario",
    icon: <Package className="h-4 w-4" />,
    color: "text-blue-600",
    title: "Control total de tu stock",
    description: "FEFO automatico, alertas de vencimiento, lotes, mermas y reposicion inteligente con IA.",
    features: ["FEFO automatico por lotes", "Alertas de vencimiento", "Import masivo CSV/Excel", "Prediccion de demanda con IA"],
    stats: [{ label: "Productos", value: "5,000+" }, { label: "Merma reducida", value: "-40%" }, { label: "Alertas activas", value: "24/7" }],
    gradient: "from-blue-500 to-indigo-600",
    mockUI: <InventoryMock />,
  },
  {
    id: "analytics",
    label: "Reportes",
    icon: <BarChart3 className="h-4 w-4" />,
    color: "text-violet-600",
    title: "Datos que impulsan decisiones",
    description: "Dashboard ejecutivo con KPIs en tiempo real. Ventas, margenes, productos estrella y tendencias.",
    features: ["KPIs en tiempo real", "Graficos de ventas por periodo", "Productos mas vendidos", "Margen por categoria"],
    stats: [{ label: "Metricas", value: "50+" }, { label: "Actualizacion", value: "Real-time" }, { label: "Export", value: "PDF/Excel" }],
    gradient: "from-violet-500 to-purple-600",
    mockUI: <AnalyticsMock />,
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: <Truck className="h-4 w-4" />,
    color: "text-orange-600",
    title: "Delivery con tracking en vivo",
    description: "Tus clientes compran online y reciben en su puerta. Zonas configurables, mapa de cobertura y notificaciones.",
    features: ["Tracking en tiempo real", "Zonas y tarifas configurables", "Notificacion WhatsApp automatica", "App para repartidores"],
    stats: [{ label: "Zonas", value: "Ilimitadas" }, { label: "Notificacion", value: "Automatica" }, { label: "Mapa", value: "Interactivo" }],
    gradient: "from-orange-500 to-red-500",
    mockUI: <DeliveryMock />,
  },
  {
    id: "ai",
    label: "IA",
    icon: <Brain className="h-4 w-4" />,
    color: "text-pink-600",
    title: "Inteligencia artificial para tu negocio",
    description: "Prediccion de demanda, reposicion automatica, analisis de rentabilidad y sugerencias de precios.",
    features: ["Prediccion de demanda", "Reposicion automatica", "Analisis de rentabilidad", "Sugerencias de precios"],
    stats: [{ label: "Precision", value: "92%" }, { label: "Ahorro", value: "30%" }, { label: "Automatizacion", value: "24/7" }],
    gradient: "from-pink-500 to-rose-600",
    mockUI: <AIMock />,
  },
];

// ── Mock UIs ─────────────────────────────────────────────────────────────────

function POSMock() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-900 dark:text-white">Venta #1847</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">En progreso</span>
      </div>
      {[
        { name: "Arroz Costeño 5kg", price: "S/ 22.50", qty: "2" },
        { name: "Aceite Primor 1L", price: "S/ 8.90", qty: "1" },
        { name: "Azucar Rubia 1kg", price: "S/ 4.50", qty: "3" },
      ].map((item) => (
        <div key={item.name} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{item.name}</p>
            <p className="text-[10px] text-gray-400">x{item.qty}</p>
          </div>
          <p className="text-xs font-bold text-teal-600">{item.price}</p>
        </div>
      ))}
      <div className="flex justify-between pt-2 border-t-2 border-teal-500">
        <span className="text-sm font-extrabold text-gray-900 dark:text-white">Total</span>
        <span className="text-sm font-extrabold text-teal-600">S/ 67.40</span>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1">
        {["Yape", "Efectivo", "Plin"].map((m) => (
          <button key={m} className={cn("py-2 rounded-lg text-[10px] font-bold transition-all", m === "Yape" ? "bg-purple-600 text-white shadow-md scale-105" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400")}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function InventoryMock() {
  const items = [
    { name: "Leche Gloria 1L", stock: 45, min: 20, status: "ok" },
    { name: "Fideos Don Vittorio", stock: 8, min: 15, status: "warn" },
    { name: "Atun A1 170g", stock: 2, min: 10, status: "critical" },
  ];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-900 dark:text-white">Stock en tiempo real</span>
        <span className="text-[10px] text-gray-400">Actualizado hace 2 min</span>
      </div>
      {items.map((item) => (
        <div key={item.name} className="space-y-1">
          <div className="flex justify-between">
            <span className="text-xs text-gray-700 dark:text-gray-300">{item.name}</span>
            <span className={cn("text-xs font-bold", item.status === "ok" ? "text-emerald-600" : item.status === "warn" ? "text-amber-600" : "text-red-600")}>
              {item.stock}/{item.min}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", item.status === "ok" ? "bg-emerald-500" : item.status === "warn" ? "bg-amber-500" : "bg-red-500")}
              style={{ width: `${Math.min(100, (item.stock / item.min) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 text-[10px] font-bold">3 por vencer</span>
        <span className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 text-[10px] font-bold">5 stock bajo</span>
      </div>
    </div>
  );
}

function AnalyticsMock() {
  const bars = [65, 80, 45, 90, 70, 85, 95];
  const days = ["L", "M", "X", "J", "V", "S", "D"];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-900 dark:text-white">Ventas de la semana</span>
        <span className="text-xs font-bold text-emerald-600">+23%</span>
      </div>
      <div className="flex items-end gap-1.5 h-20">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t bg-gradient-to-t from-violet-500 to-violet-400 transition-all" style={{ height: `${h}%` }} />
            <span className="text-[9px] text-gray-400">{days[i]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[{ label: "Ventas", value: "S/ 12,450" }, { label: "Ticket prom.", value: "S/ 35" }, { label: "Clientes", value: "356" }].map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-xs font-extrabold text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-[9px] text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveryMock() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-900 dark:text-white">Pedidos activos</span>
        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold">3 en camino</span>
      </div>
      {[
        { id: "#1845", client: "Maria Lopez", status: "En camino", time: "12 min", color: "text-orange-600" },
        { id: "#1844", client: "Juan Perez", status: "Preparando", time: "5 min", color: "text-blue-600" },
        { id: "#1843", client: "Rosa Torres", status: "Entregado", time: "Hace 20 min", color: "text-emerald-600" },
      ].map((o) => (
        <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{o.client}</p>
            <p className="text-[10px] text-gray-400">{o.id}</p>
          </div>
          <div className="text-right">
            <p className={cn("text-[10px] font-bold", o.color)}>{o.status}</p>
            <p className="text-[9px] text-gray-400">{o.time}</p>
          </div>
        </div>
      ))}
      <div className="h-16 rounded-lg bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 flex items-center justify-center">
        <p className="text-[10px] text-teal-600 font-bold flex items-center gap-1"><Truck className="h-3 w-3" /> Mapa de cobertura interactivo</p>
      </div>
    </div>
  );
}

function AIMock() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3 shadow-inner">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-bold text-gray-900 dark:text-white">Asistente IA</span>
      </div>
      <div className="space-y-2">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
          <p className="text-[11px] text-gray-700 dark:text-gray-300">Detecte que el <strong>Arroz Costeño 5kg</strong> se agotara en 3 dias segun tu ritmo de ventas.</p>
        </div>
        <div className="bg-pink-50 dark:bg-pink-950/30 rounded-lg p-2.5 border border-pink-200 dark:border-pink-800/40">
          <p className="text-[10px] font-bold text-pink-600 mb-1">Recomendacion:</p>
          <p className="text-[11px] text-gray-700 dark:text-gray-300">Pedir 50 unidades al proveedor &ldquo;Distribuidora Lima&rdquo; — precio sugerido S/ 18.50/ud.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 py-1.5 rounded-lg bg-pink-600 text-white text-[10px] font-bold">Crear orden</button>
          <button className="flex-1 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] font-bold">Ignorar</button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function SaasInteractiveDemo() {
  const [activeTab, setActiveTab] = useState("pos");
  const active = DEMO_TABS.find((t) => t.id === activeTab)!;

  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-background overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Play className="h-3 w-3" /> Demo interactiva
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white">
            Conoce el sistema por dentro
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
            Explora cada modulo. Esto es lo que tendras desde el dia uno, gratis.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-x-auto">
            {DEMO_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Demo content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: info */}
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {active.title}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm sm:text-base">
                {active.description}
              </p>
            </div>

            {/* Features list */}
            <div className="space-y-2.5">
              {active.features.map((f) => (
                <div key={f} className="flex items-center gap-2.5">
                  <div className={cn("h-5 w-5 rounded-full flex items-center justify-center bg-gradient-to-br", active.gradient)}>
                    <Check className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{f}</span>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="flex gap-6">
              {active.stats.map((s) => (
                <div key={s.label}>
                  <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <a
              href="/registro"
              className={cn("inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg bg-gradient-to-r", active.gradient)}
            >
              Probar gratis <ChevronRight className="h-4 w-4" />
            </a>
          </div>

          {/* Right: mock UI */}
          <div className="relative">
            {/* Phone/tablet frame */}
            <div className="relative mx-auto max-w-sm">
              <div className={cn("absolute -inset-4 rounded-3xl opacity-20 blur-2xl bg-gradient-to-br", active.gradient)} />
              <div className="relative bg-gray-50 dark:bg-gray-800 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 shadow-2xl">
                {/* Status bar */}
                <div className="flex items-center justify-between px-3 py-1.5 mb-2">
                  <span className="text-[10px] font-semibold text-gray-500">9:41</span>
                  <div className="flex gap-1">
                    <div className="w-3 h-1.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
                    <div className="w-3 h-1.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
                    <div className="w-3 h-1.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
                  </div>
                </div>
                {/* Content */}
                {active.mockUI}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
