"use client";

import { useState } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  MessageCircle,
  Brain,
} from "@buleje/design-system/icons";
import type { LucideIcon } from "lucide-react";

/* ─── Tab definitions ─── */
interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  bullets: string[];
}

const tabs: Tab[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    bullets: [
      "Ventas del día en tiempo real",
      "Alertas de stock bajo en rojo",
      "Comparativa semana anterior",
    ],
  },
  {
    id: "pos",
    label: "Punto de Venta",
    icon: ShoppingCart,
    bullets: [
      "Búsqueda por nombre o código de barras",
      "Carrito con descuentos y cupones",
      "Cobro en efectivo, yape o transferencia",
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    bullets: [
      "Stock en tiempo real por producto",
      "Alertas automáticas de reposición",
      "Control de vencimientos (FEFO)",
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    bullets: [
      "Bot responde pedidos automáticamente",
      "Envía promos a clientes frecuentes",
      "Confirma entrega con foto",
    ],
  },
  {
    id: "analytics",
    label: "Analytics IA",
    icon: Brain,
    bullets: [
      "Score de salud del negocio",
      "Predicción de quiebre de stock",
      "Clientes en riesgo de irse",
    ],
  },
];

/* ─── Dirección del slide según navegación ─── */
const TAB_ORDER = tabs.map((t) => t.id);

function slideDirection(from: string, to: string): number {
  return TAB_ORDER.indexOf(to) > TAB_ORDER.indexOf(from) ? 1 : -1;
}

/* ─── Mock: Dashboard ─── */
const BAR_HEIGHTS = [45, 62, 38, 80, 55, 91, 70];
const BAR_DAYS = ["L", "M", "X", "J", "V", "S", "D"];

function MockDashboard() {
  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Ventas hoy", value: "S/ 1,240", up: true },
          { label: "Pedidos", value: "38", up: true },
          { label: "Ticket promedio", value: "S/ 32.6", up: false },
          { label: "Stock crítico", value: "3 items", up: false },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl p-3 border border-gray-100 dark:border-[rgba(15,118,110,0.18)] bg-white dark:bg-[#152019]"
          >
            <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-[rgba(240,244,241,0.4)] mb-1">
              {kpi.label}
            </p>
            <p className="text-base font-bold text-gray-900 dark:text-[#f0f4f1]">
              {kpi.value}
            </p>
            <span
              className="text-[length:var(--ts-2xs)] font-semibold"
              style={{ color: kpi.up ? "#00B4A6" : "#ef4444" }}
            >
              {kpi.up ? "▲ 12%" : "▼ 4%"}
            </span>
          </div>
        ))}
      </div>

      {/* Mini bar chart CSS — 7 barras de diferentes alturas */}
      <div className="rounded-xl border border-gray-100 dark:border-[rgba(15,118,110,0.18)] bg-white dark:bg-[#152019] p-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-[rgba(240,244,241,0.5)] mb-3">
          Ventas últimos 7 días
        </p>
        <div className="flex items-end gap-1.5 h-20">
          {BAR_HEIGHTS.map((h, i) => {
            const isToday = i === 5;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md transition-all duration-300"
                  style={{
                    height: `${h}%`,
                    background: isToday
                      ? "linear-gradient(180deg, #00B4A6 0%, #2dd4bf 100%)"
                      : "rgba(15,118,110,0.22)",
                    boxShadow: isToday
                      ? "0 -2px 8px rgba(15,118,110,0.4)"
                      : undefined,
                  }}
                />
                <span
                  className="text-[length:var(--ts-2xs)] font-semibold"
                  style={{
                    color: isToday ? "#00B4A6" : "rgba(156,163,175,0.7)",
                  }}
                >
                  {BAR_DAYS[i]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Últimas ventas */}
      <div className="rounded-xl border border-gray-100 dark:border-[rgba(15,118,110,0.18)] bg-white dark:bg-[#152019] p-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-[rgba(240,244,241,0.5)] mb-2">
          Últimas ventas
        </p>
        <div className="space-y-2">
          {["Arroz 5kg · S/ 28", "Aceite 1L · S/ 12", "Azúcar 2kg · S/ 9"].map(
            (row) => (
              <div
                key={row}
                className="flex justify-between items-center text-xs text-gray-700 dark:text-[rgba(240,244,241,0.7)]"
              >
                <span>{row}</span>
                <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-[rgba(240,244,241,0.35)]">
                  hace 2 min
                </span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Mock: POS — grid 3x3 con product cards ─── */
const POS_PRODUCTS = [
  { name: "Arroz 5kg", price: "S/ 28" },
  { name: "Aceite 1L", price: "S/ 12" },
  { name: "Azúcar 2kg", price: "S/ 9" },
  { name: "Fideos", price: "S/ 4" },
  { name: "Leche evap.", price: "S/ 5.50" },
  { name: "Jabón", price: "S/ 3" },
  { name: "Detergente", price: "S/ 7" },
  { name: "Sal 1kg", price: "S/ 1.50" },
  { name: "Galletas", price: "S/ 2" },
];

function MockPOS() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 h-full">
      {/* Products grid 3×3 */}
      <div className="sm:col-span-2 grid grid-cols-3 gap-2">
        {POS_PRODUCTS.map((p) => (
          <div
            key={p.name}
            className="rounded-xl border border-gray-100 dark:border-[rgba(15,118,110,0.18)] bg-white dark:bg-[#152019] p-2 flex flex-col items-center gap-1 hover:border-[#00B4A6]/40 transition-colors duration-150"
          >
            {/* Placeholder imagen producto */}
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(15,118,110,0.15) 0%, rgba(20,184,166,0.1) 100%)",
              }}
              aria-hidden="true"
            >
              <ShoppingCart className="w-3.5 h-3.5" style={{ color: "#00B4A6" }} />
            </div>
            <span className="text-[length:var(--ts-2xs)] font-medium text-gray-700 dark:text-[rgba(240,244,241,0.8)] text-center leading-tight">
              {p.name}
            </span>
            <span
              className="text-[length:var(--ts-2xs)] font-bold"
              style={{ color: "#00B4A6" }}
            >
              {p.price}
            </span>
          </div>
        ))}
      </div>

      {/* Carrito */}
      <div className="rounded-xl border border-gray-100 dark:border-[rgba(15,118,110,0.18)] bg-white dark:bg-[#152019] p-3 flex flex-col gap-2">
        <p className="text-xs font-bold text-gray-700 dark:text-[rgba(240,244,241,0.85)]">
          Carrito
        </p>
        <div className="space-y-1 flex-1">
          {[
            { item: "Arroz 5kg", price: "S/ 28" },
            { item: "Aceite 1L", price: "S/ 12" },
          ].map(({ item, price }) => (
            <div
              key={item}
              className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-[rgba(240,244,241,0.5)] flex justify-between"
            >
              <span>{item}</span>
              <span className="font-semibold">{price}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 dark:border-[rgba(15,118,110,0.15)] pt-2">
          <div className="flex justify-between text-[length:var(--ts-2xs)] font-bold text-gray-700 dark:text-[rgba(240,244,241,0.85)] mb-2">
            <span>Total</span>
            <span>S/ 40</span>
          </div>
          <div
            className="rounded-lg text-center text-[length:var(--ts-2xs)] font-bold text-white py-2"
            style={{
              background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)",
              boxShadow: "0 4px 12px -2px rgba(15,118,110,0.4)",
            }}
          >
            Cobrar S/ 40
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mock: Inventario ─── */
function MockInventario() {
  const rows = [
    { name: "Arroz 5kg", stock: 48, min: 10, ok: true },
    { name: "Aceite 1L", stock: 3, min: 5, ok: false },
    { name: "Azúcar 2kg", stock: 22, min: 8, ok: true },
    { name: "Leche evap.", stock: 2, min: 6, ok: false },
    { name: "Fideos 500g", stock: 15, min: 10, ok: true },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 dark:border-[rgba(15,118,110,0.18)]">
            {["Producto", "Stock", "Mínimo", "Estado"].map((h) => (
              <th
                key={h}
                className="text-left py-2 px-3 text-gray-400 dark:text-[rgba(240,244,241,0.4)] font-semibold text-[length:var(--ts-2xs)] uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.name}
              className="border-b border-gray-50 dark:border-[rgba(15,118,110,0.09)]"
            >
              <td className="py-2 px-3 text-gray-700 dark:text-[rgba(240,244,241,0.8)]">
                {r.name}
              </td>
              <td
                className="py-2 px-3 font-bold"
                style={{ color: r.ok ? "#00B4A6" : "#ef4444" }}
              >
                {r.stock}
              </td>
              <td className="py-2 px-3 text-gray-400 dark:text-[rgba(240,244,241,0.4)]">
                {r.min}
              </td>
              <td className="py-2 px-3">
                <span
                  className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-semibold"
                  style={{
                    background: r.ok
                      ? "rgba(15,118,110,0.12)"
                      : "rgba(239,68,68,0.12)",
                    color: r.ok ? "#00B4A6" : "#ef4444",
                  }}
                >
                  {r.ok ? "OK" : "Reponer"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Mock: WhatsApp — 4 burbujas alternando bot/cliente ─── */
const WA_MESSAGES = [
  { from: "client" as const, text: "Hola! quiero 2 arroces y 1 aceite" },
  {
    from: "bot" as const,
    text: "Claro! 2x Arroz 5kg + 1x Aceite 1L = S/ 68. ¿Confirmas?",
  },
  { from: "client" as const, text: "Sí, con delivery por favor" },
  {
    from: "bot" as const,
    text: "Pedido confirmado. Entrega en 30 min. Paga con Yape al 999-888-777",
  },
];

function MockWhatsApp() {
  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-xl min-h-[200px]"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(15,118,110,0.06) 0%, transparent 70%)",
      }}
    >
      {/* Header tipo WhatsApp */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-[rgba(15,118,110,0.15)] mb-1">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)" }}
          aria-hidden="true"
        >
          <MessageCircle className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold text-gray-700 dark:text-[rgba(240,244,241,0.85)]">
            Bot Buleje
          </p>
          <p className="text-[length:var(--ts-2xs)] text-green-500">en línea</p>
        </div>
      </div>

      {/* Burbujas */}
      {WA_MESSAGES.map((m, i) => (
        <div
          key={i}
          className={`flex ${m.from === "client" ? "justify-start" : "justify-end"}`}
        >
          <div
            className="max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed"
            style={
              m.from === "bot"
                ? {
                    background:
                      "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(15,118,110,0.25)",
                  }
                : {
                    background: "rgba(0,0,0,0.06)",
                    color: "inherit",
                    border: "1px solid rgba(0,0,0,0.06)",
                  }
            }
          >
            {m.text}
            <span
              className="block text-right mt-0.5"
              style={{
                fontSize: "9px",
                opacity: 0.6,
              }}
            >
              {["09:12", "09:12", "09:13", "09:13"][i]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Mock: Analytics ─── */
function MockAnalytics() {
  const insights = [
    { label: "Arroz 5kg se acaba en 3 días", color: "#ef4444" },
    { label: "José Quispe no compra hace 14 días", color: "#f97316" },
    { label: "Aceite 1L: margen subió 8%", color: "#00B4A6" },
    { label: "Sábados venden 2x más que lunes", color: "#00B4A6" },
  ];
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      {/* Score circle */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div
          className="w-24 h-24 rounded-full flex flex-col items-center justify-center border-4"
          style={{
            borderColor: "#00B4A6",
            boxShadow: "0 0 20px rgba(15,118,110,0.25)",
          }}
        >
          <span className="text-2xl font-black" style={{ color: "#00B4A6" }}>
            87
          </span>
          <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-[rgba(240,244,241,0.4)]">
            / 100
          </span>
        </div>
        <p className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-[rgba(240,244,241,0.5)] text-center">
          Salud del negocio
        </p>
      </div>
      {/* Insights */}
      <div className="flex-1 space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-[rgba(240,244,241,0.5)] mb-1">
          Insights IA
        </p>
        {insights.map((ins) => (
          <div
            key={ins.label}
            className="flex items-center gap-2 text-xs text-gray-700 dark:text-[rgba(240,244,241,0.75)]"
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: ins.color }}
              aria-hidden="true"
            />
            {ins.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Variantes de slide horizontal ─── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slideVariants: Record<string, any> = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -48 }),
};

/* ─── Mapa de contenido ─── */
const MOCK_CONTENT: Record<string, React.ReactNode> = {
  dashboard: <MockDashboard />,
  pos: <MockPOS />,
  inventario: <MockInventario />,
  whatsapp: <MockWhatsApp />,
  analytics: <MockAnalytics />,
};

/* ─── Componente principal ─── */
export default function SaasScreenshots() {
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [prevTab, setPrevTab] = useState<string>("dashboard");

  const activeData = tabs.find((t) => t.id === activeTab)!;
  const direction = slideDirection(prevTab, activeTab);

  function handleTabChange(id: string) {
    if (id === activeTab) return;
    setPrevTab(activeTab);
    setActiveTab(id);
  }

  return (
    <section
      id="screenshots"
      className="py-20 md:py-28 bg-white dark:bg-[#0a0f0d]"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        {/* Header */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
        >
          <h2
            className="font-extrabold text-gray-900 dark:text-[#f0f4f1] mb-3"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.2rem)", letterSpacing: "-0.02em" }}
          >
            Mira el sistema por dentro
          </h2>
          <p className="text-gray-500 dark:text-[rgba(240,244,241,0.6)] text-base sm:text-lg">
            Sin descargar nada, sin tarjeta
          </p>
        </motion.div>

        {/* Tab pills — indicador activo mejorado */}
        <div
          className="flex gap-2 overflow-x-auto scrollbar-none pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:justify-center mb-6"
          role="tablist"
          aria-label="Secciones del sistema"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(tab.id)}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] whitespace-nowrap"
                style={
                  isActive
                    ? {
                        background:
                          "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)",
                        color: "#fff",
                        boxShadow: "0 4px 18px -4px rgba(15,118,110,0.55)",
                      }
                    : {
                        background: "transparent",
                        color: "inherit",
                        border: "1px solid rgba(15,118,110,0.22)",
                      }
                }
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  aria-hidden="true"
                />
                {tab.label}
                {isActive && (
                  <span
                    className="ml-0.5 w-1.5 h-1.5 rounded-full bg-white/60 shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Mockup window */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, ease: [0.175, 0.885, 0.32, 1.275] }}
          className="rounded-2xl border border-gray-200 dark:border-[rgba(15,118,110,0.22)] overflow-hidden shadow-xl dark:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)]"
        >
          {/* Barra de título tipo browser */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-[#152019] border-b border-gray-200 dark:border-[rgba(15,118,110,0.18)]">
            <div className="w-3 h-3 rounded-full bg-[#ef4444]" aria-hidden="true" />
            <div className="w-3 h-3 rounded-full bg-[#f97316]" aria-hidden="true" />
            <div className="w-3 h-3 rounded-full bg-[#00B4A6]" aria-hidden="true" />
            {/* URL bar */}
            <div className="ml-3 flex-1 max-w-xs flex items-center gap-2 bg-white/50 dark:bg-[#0a0f0d]/40 rounded-md px-3 py-1">
              <span
                className="text-[length:var(--ts-2xs)] font-semibold"
                style={{ color: "#00B4A6" }}
              >
                https://
              </span>
              <span className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-[rgba(240,244,241,0.4)] truncate">
                bodega.app/{activeData.id}
              </span>
            </div>
            <span className="ml-auto text-[length:var(--ts-2xs)] text-gray-400 dark:text-[rgba(240,244,241,0.3)] hidden sm:block">
              {activeData.label}
            </span>
          </div>

          {/* Área de contenido con slide horizontal */}
          <div
            className="bg-gray-50 dark:bg-[#121f17] p-5 min-h-[300px] overflow-hidden"
            role="tabpanel"
            aria-label={`Vista de ${activeData.label}`}
          >
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeTab}
                custom={direction}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                variants={slideVariants as any}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                {MOCK_CONTENT[activeTab]}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Bullets animados */}
        <AnimatePresence mode="wait">
          <motion.ul
            key={activeTab + "-bullets"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-6 justify-center"
          >
            {activeData.bullets.map((b) => (
              <li
                key={b}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-[rgba(240,244,241,0.65)]"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "#00B4A6" }}
                  aria-hidden="true"
                />
                {b}
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>
    </section>
  );
}
