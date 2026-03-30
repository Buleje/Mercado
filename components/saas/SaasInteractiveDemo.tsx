"use client";

import { useState, useCallback } from "react";
import {
  ShoppingCart, Package, BarChart3,
  Truck, Brain, Plus, Minus, Trash2,
  ChevronRight, Play, Sparkles, Check, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Mini-App: POS Simulador ─────────────────────────────────────────────────

const CATALOG = [
  { id: "arroz", name: "Arroz Costeno 5kg", price: 22.5, emoji: "🍚" },
  { id: "aceite", name: "Aceite Primor 1L", price: 8.9, emoji: "🫒" },
  { id: "azucar", name: "Azucar Rubia 1kg", price: 4.5, emoji: "🍬" },
  { id: "leche", name: "Leche Gloria 1L", price: 5.2, emoji: "🥛" },
  { id: "fideos", name: "Fideos Don Vittorio", price: 3.8, emoji: "🍝" },
  { id: "atun", name: "Atun A1 170g", price: 6.5, emoji: "🐟" },
];

type CartItem = { id: string; name: string; price: number; qty: number; emoji: string };

function POSMiniApp() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payMethod, setPayMethod] = useState<string | null>(null);
  const [sold, setSold] = useState(false);

  const addToCart = useCallback((product: typeof CATALOG[number]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
    setSold(false);
    setPayMethod(null);
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQty = useCallback((id: string, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const newQty = i.qty + delta;
      return newQty > 0 ? { ...i, qty: newQty } : i;
    }));
  }, []);

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  const handlePay = (method: string) => {
    setPayMethod(method);
    setSold(true);
    setTimeout(() => {
      setCart([]);
      setSold(false);
      setPayMethod(null);
    }, 2500);
  };

  return (
    <div className="space-y-3">
      {/* Catalogo */}
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Toca para agregar</p>
      <div className="grid grid-cols-3 gap-1.5">
        {CATALOG.map((p) => (
          <button
            key={p.id}
            onClick={() => addToCart(p)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-all active:scale-95"
          >
            <span className="text-lg">{p.emoji}</span>
            <span className="text-[9px] font-medium text-gray-600 dark:text-gray-400 truncate w-full text-center">{p.name.split(" ")[0]}</span>
            <span className="text-[10px] font-bold text-teal-600">S/{p.price}</span>
          </button>
        ))}
      </div>

      {/* Carrito */}
      {cart.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-700 space-y-2">
          {cart.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span>{item.emoji}</span>
                <span className="truncate text-gray-700 dark:text-gray-300">{item.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => updateQty(item.id, -1)} className="h-5 w-5 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-4 text-center font-bold text-gray-900 dark:text-white">{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} className="h-5 w-5 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
                <span className="w-14 text-right font-bold text-teal-600">S/{(item.price * item.qty).toFixed(2)}</span>
                <button onClick={() => removeFromCart(item.id)} className="h-5 w-5 rounded flex items-center justify-center text-red-400 hover:text-red-600 transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-sm font-extrabold text-gray-900 dark:text-white">Total</span>
            <span className="text-sm font-extrabold text-teal-600">S/ {total.toFixed(2)}</span>
          </div>

          {/* Metodos de pago */}
          {!sold ? (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {["Yape", "Efectivo", "Plin"].map((m) => (
                <button
                  key={m}
                  onClick={() => handlePay(m)}
                  className="py-2 rounded-lg text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-teal-600 hover:text-white transition-all active:scale-95"
                >
                  {m}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
              <Check className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Venta registrada con {payMethod}!</span>
            </div>
          )}
        </div>
      )}

      {cart.length === 0 && !sold && (
        <p className="text-center text-[10px] text-gray-400 py-4">Agrega productos tocando arriba</p>
      )}
    </div>
  );
}

// ── Mini-App: Inventario con alertas ─────────────────────────────────────────

function InventoryMiniApp() {
  const [items, setItems] = useState([
    { id: "leche", name: "Leche Gloria 1L", stock: 45, min: 20, status: "ok" as const, emoji: "🥛" },
    { id: "fideos", name: "Fideos Don Vittorio", stock: 8, min: 15, status: "warn" as const, emoji: "🍝" },
    { id: "atun", name: "Atun A1 170g", stock: 2, min: 10, status: "critical" as const, emoji: "🐟" },
    { id: "arroz", name: "Arroz Costeno 5kg", stock: 30, min: 10, status: "ok" as const, emoji: "🍚" },
  ]);

  const restock = (id: string) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, stock: i.min * 3, status: "ok" as const } : i));
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Stock en tiempo real</p>
      {items.map((item) => (
        <div key={item.id} className="bg-white dark:bg-gray-900 rounded-lg p-2.5 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">{item.emoji}</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-bold", item.status === "ok" ? "text-emerald-600" : item.status === "warn" ? "text-amber-600" : "text-red-600")}>
                {item.stock}/{item.min}
              </span>
              {item.status !== "ok" && (
                <button
                  onClick={() => restock(item.id)}
                  className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors active:scale-95"
                >
                  Reponer
                </button>
              )}
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", item.status === "ok" ? "bg-emerald-500" : item.status === "warn" ? "bg-amber-500" : "bg-red-500 animate-pulse")}
              style={{ width: `${Math.min(100, (item.stock / item.min) * 50)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mini-App: Reportes con graficos interactivos ────────────────────────────

function ReportsMiniApp() {
  const [period, setPeriod] = useState<"semana" | "mes">("semana");
  const weekData = [35, 42, 38, 55, 48, 62, 58];
  const monthData = [180, 220, 195, 240, 210, 260, 245, 280, 250, 290, 270, 310];
  const data = period === "semana" ? weekData : monthData;
  const labels = period === "semana" ? ["L", "M", "X", "J", "V", "S", "D"] : ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const maxVal = Math.max(...data);
  const totalSales = data.reduce((a, b) => a + b * 15, 0);
  const avgTicket = Math.round(totalSales / data.reduce((a, b) => a + b, 0));

  return (
    <div className="space-y-3">
      {/* Toggle periodo */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        {(["semana", "mes"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn("flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all", period === p ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-400")}
          >
            {p === "semana" ? "Semana" : "Mes"}
          </button>
        ))}
      </div>

      {/* Grafico */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
        <div className="flex items-end gap-1 h-24">
          {data.map((val, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full rounded-t bg-gradient-to-t from-violet-500 to-violet-400 transition-all duration-500 hover:from-violet-600 hover:to-violet-500 cursor-pointer relative group" style={{ height: `${(val / maxVal) * 100}%` }}>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-violet-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  {val}
                </span>
              </div>
              <span className="text-[8px] text-gray-400">{labels[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Ventas", value: `S/ ${totalSales.toLocaleString()}` },
          { label: "Ticket prom.", value: `S/ ${avgTicket}` },
          { label: "Transacciones", value: `${data.reduce((a, b) => a + b, 0)}` },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white dark:bg-gray-900 rounded-lg p-2 border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-xs font-extrabold text-gray-900 dark:text-white">{kpi.value}</p>
            <p className="text-[9px] text-gray-400">{kpi.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini-App: Delivery con tracking ──────────────────────────────────────────

function DeliveryMiniApp() {
  const [orders, setOrders] = useState([
    { id: "#1845", client: "Maria Lopez", status: "preparando" as const, color: "text-blue-600" },
    { id: "#1844", client: "Juan Perez", status: "en_camino" as const, color: "text-orange-600" },
    { id: "#1843", client: "Rosa Torres", status: "preparando" as const, color: "text-blue-600" },
  ]);

  const advance = (id: string) => {
    setOrders((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      if (o.status === "preparando") return { ...o, status: "en_camino" as const, color: "text-orange-600" };
      if (o.status === "en_camino") return { ...o, status: "entregado" as const, color: "text-emerald-600" };
      return o;
    }));
  };

  const statusLabel = { preparando: "Preparando", en_camino: "En camino", entregado: "Entregado" };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Toca para avanzar estado</p>
      {orders.map((o) => (
        <button
          key={o.id}
          onClick={() => advance(o.id)}
          disabled={o.status === "entregado"}
          className="w-full flex items-center justify-between p-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 hover:border-teal-400 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-default text-left"
        >
          <div>
            <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{o.client}</p>
            <p className="text-[10px] text-gray-400">{o.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-bold", o.color)}>{statusLabel[o.status]}</span>
            {o.status !== "entregado" && <ChevronRight className="h-3 w-3 text-gray-300" />}
            {o.status === "entregado" && <Check className="h-3 w-3 text-emerald-500" />}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Mini-App: IA Asistente ───────────────────────────────────────────────────

function AIMiniApp() {
  const [accepted, setAccepted] = useState<Record<number, boolean>>({});
  const suggestions = [
    { id: 0, text: "Arroz Costeno se agota en 3 dias. Pedir 50 unidades.", action: "Crear orden de compra", saving: "S/ 150" },
    { id: 1, text: "Subir precio de Leche Gloria a S/ 5.50 (+6%). El mercado lo soporta.", action: "Aplicar precio", saving: "S/ 90/mes" },
    { id: 2, text: "Combo: Arroz + Aceite + Azucar a S/ 33 (ahorra S/ 2.90). Vende 12 combos/semana.", action: "Crear combo", saving: "+S/ 396/mes" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-bold text-gray-900 dark:text-white">Sugerencias de IA</span>
      </div>
      {suggestions.map((s) => (
        <div key={s.id} className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-100 dark:border-gray-700 space-y-2">
          <p className="text-[11px] text-gray-700 dark:text-gray-300">{s.text}</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-600">{s.saving} ahorro</span>
            {accepted[s.id] ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                <Check className="h-3 w-3" /> Aplicado
              </span>
            ) : (
              <button
                onClick={() => setAccepted((p) => ({ ...p, [s.id]: true }))}
                className="px-3 py-1 rounded-md text-[10px] font-bold bg-pink-600 text-white hover:bg-pink-700 transition-colors active:scale-95"
              >
                {s.action}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Datos de tabs ────────────────────────────────────────────────────────────

type DemoTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  miniApp: React.ReactNode;
  links: { label: string; href: string }[];
};

const DEMO_TABS: DemoTab[] = [
  {
    id: "pos",
    label: "Punto de Venta",
    icon: <ShoppingCart className="h-4 w-4" />,
    title: "Prueba el POS ahora mismo",
    description: "Agrega productos, cambia cantidades, elige como pagar. Asi de rapido es vender con Buleje.",
    gradient: "from-teal-500 to-emerald-600",
    miniApp: <POSMiniApp />,
    links: [
      { label: "Ver POS completo", href: "/admin/kiosk" },
      { label: "POS movil", href: "/admin/pos-mobile" },
    ],
  },
  {
    id: "inventory",
    label: "Inventario",
    icon: <Package className="h-4 w-4" />,
    title: "Controla tu stock en tiempo real",
    description: "Ve niveles de stock, alertas y repone con un click. FEFO automatico incluido.",
    gradient: "from-blue-500 to-indigo-600",
    miniApp: <InventoryMiniApp />,
    links: [
      { label: "Ver inventario completo", href: "/admin" },
    ],
  },
  {
    id: "reports",
    label: "Reportes",
    icon: <BarChart3 className="h-4 w-4" />,
    title: "Graficos que cuentan historias",
    description: "Cambia entre semana y mes. Pasa el mouse por las barras. Los numeros se actualizan solos.",
    gradient: "from-violet-500 to-purple-600",
    miniApp: <ReportsMiniApp />,
    links: [
      { label: "Dashboard completo", href: "/admin" },
      { label: "API Docs", href: "/api-docs" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    icon: <Truck className="h-4 w-4" />,
    title: "Gestiona pedidos con un toque",
    description: "Toca cada pedido para avanzar su estado: Preparando > En camino > Entregado.",
    gradient: "from-orange-500 to-red-500",
    miniApp: <DeliveryMiniApp />,
    links: [
      { label: "App repartidor", href: "/delivery-app" },
      { label: "Mapa de delivery", href: "/delivery" },
    ],
  },
  {
    id: "ai",
    label: "IA",
    icon: <Brain className="h-4 w-4" />,
    title: "Tu asistente inteligente",
    description: "La IA analiza tu negocio y sugiere acciones. Acepta las que quieras con un click.",
    gradient: "from-pink-500 to-rose-600",
    miniApp: <AIMiniApp />,
    links: [
      { label: "Centro de IA", href: "/admin" },
    ],
  },
];

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
            <Play className="h-3 w-3" /> Prueba sin registrarte
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 dark:text-white">
            Toca, prueba, decide
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
            Estas son mini-versiones funcionales de cada modulo. Todo lo que ves aqui, lo tendras completo en tu tienda.
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Left: info + links */}
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
                {active.title}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm sm:text-base">
                {active.description}
              </p>
            </div>

            {/* Links de navegacion */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ver version completa</p>
              {active.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-all group"
                >
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 group-hover:text-teal-700 dark:group-hover:text-teal-400">{link.label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-teal-500" />
                </a>
              ))}
            </div>

            {/* CTA */}
            <a
              href="/registro"
              className={cn("inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-lg bg-gradient-to-r", active.gradient)}
            >
              Crear mi tienda gratis <ChevronRight className="h-4 w-4" />
            </a>
          </div>

          {/* Right: mini-app */}
          <div className="relative">
            <div className={cn("absolute -inset-4 rounded-3xl opacity-15 blur-2xl bg-gradient-to-br", active.gradient)} />
            <div className="relative bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-2xl">
              {/* Status bar */}
              <div className="flex items-center justify-between px-3 py-1.5 mb-3">
                <span className="text-[10px] font-semibold text-gray-500">9:41</span>
                <span className="text-[10px] font-bold text-teal-600">Buleje ERP</span>
                <div className="flex gap-1">
                  <div className="w-3 h-1.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
                  <div className="w-3 h-1.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
                </div>
              </div>
              {active.miniApp}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
