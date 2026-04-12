"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Brain, MessageSquare, Send, RefreshCw, Zap,
  TrendingUp, Users, ShoppingBag, Calendar,
  ChevronDown, ChevronUp, DollarSign, Package, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const STRATEGIC_PROMPTS = [
  { icon: TrendingUp, text: "¿Qué combos debo crear esta semana?", color: "text-primary" },
  { icon: Users, text: "¿Cómo recupero clientes que no vuelven?", color: "text-violet-500" },
  { icon: ShoppingBag, text: "¿Qué productos me conviene agregar?", color: "text-blue-500" },
  { icon: Calendar, text: "Dame un plan de ventas para esta semana", color: "text-amber-500" },
  { icon: Zap, text: "¿Qué precio debería subir o bajar?", color: "text-red-500" },
  { icon: Brain, text: "Analiza mi negocio y dame 5 mejoras urgentes", color: "text-emerald-500" },
];

export default function AIStrategicAdvisor({ data }: { data: BusinessData }) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [showPrompts, setShowPrompts] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // ── Load conversation history from DB on mount ────────────────────────────
  React.useEffect(() => {
    if (historyLoaded) return;
    fetch("/api/ai-assistant/conversation")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.messages?.length > 0) {
          setMessages(d.messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(),
          })));
          setShowPrompts(false);
        }
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [historyLoaded]);

  // ── Live metrics computed from data ───────────────────────────────────────
  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const salesToday = data.sales.filter(s => (s.createdAt ?? "").slice(0, 10) === today);
    const ventasHoy = salesToday.reduce((s, sl) => s + sl.total, 0);
    const ticketPromedio = salesToday.length > 0 ? ventasHoy / salesToday.length : 0;
    const activeProducts = data.products.filter(p => p.active !== false);
    const lowStock = activeProducts.filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin);
    const pendingOrders = data.orders.filter(o => o.status === "pendiente").length;

    return {
      ventasHoy,
      transacciones: salesToday.length,
      ticketPromedio,
      productosActivos: activeProducts.length,
      stockBajo: lowStock.length,
      pedidosPendientes: pendingOrders,
      totalClientes: data.customers.length,
    };
  }, [data]);

  React.useEffect(() => {
    fetch("/api/ai/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => setAiAvailable(d?.hasAI ?? false))
      .catch(() => setAiAvailable(false));
  }, []);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildContext = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const salesToday = data.sales.filter(s => (s.createdAt ?? "").slice(0, 10) === today);
    const ventasHoy = salesToday.reduce((s, sl) => s + sl.total, 0);

    const topProducts: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const sale of data.sales) {
      for (const item of sale.items) {
        const pid = String(item.productId);
        if (!topProducts[pid]) topProducts[pid] = { name: item.name, qty: 0, revenue: 0 };
        topProducts[pid].qty += item.quantity;
        topProducts[pid].revenue += item.price * item.quantity;
      }
    }
    const top5 = Object.values(topProducts).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const lowStock = data.products.filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin && p.active !== false);

    return `DATOS DE MI BODEGA HOY:
- Ventas hoy: S/${ventasHoy.toFixed(0)} en ${salesToday.length} transacciones
- Total clientes registrados: ${data.customers.length}
- Productos activos: ${data.products.filter(p => p.active !== false).length}
- Productos con stock bajo: ${lowStock.length} (${lowStock.slice(0, 5).map(p => p.name).join(", ")})
- Top 5 productos por ingreso: ${top5.map(p => `${p.name} (${p.qty} uds, S/${p.revenue.toFixed(0)})`).join("; ")}
- Pedidos pendientes: ${data.orders.filter(o => o.status === "pendiente").length}
- Ubicación: Pucallpa, Ucayali, Perú (zona tropical, calurosa)`;
  }, [data]);

  const sendMessage = useCallback(async (overrideMsg?: string) => {
    const msg = overrideMsg ?? input.trim();
    if (!msg || loading) return;

    const userMsg: ConversationMessage = { role: "user", content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowPrompts(false);

    // Save user message to DB (fire-and-forget)
    fetch("/api/ai-assistant/conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: msg }),
    }).catch(() => {});

    try {
      const context = buildContext();
      const res = await fetch("/api/ai-assistant/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          context,
          mode: "coach",
        }),
      });

      let reply = "No pude obtener una respuesta. Verifica tu conexión o API key.";
      if (res.ok) {
        const result = await res.json();
        reply = result.response ?? result.data?.response ?? reply;
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      }]);

      // Save assistant reply to DB (fire-and-forget)
      fetch("/api/ai-assistant/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: reply }),
      }).catch(() => {});
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Error al conectar con la IA. Revisa la conexión a internet.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, buildContext]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col" style={{ height: "calc(100vh - 280px)", minHeight: 500 }}>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Asesor Estratégico IA</h2>
            <p className="text-[10px] text-gray-500">
              {aiAvailable
                ? "IA conectada — pregunta cualquier cosa sobre tu negocio"
                : "Sin IA — configura una API key para consultas inteligentes"}
            </p>
          </div>
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className="px-2 py-1 rounded-lg text-[10px] font-medium text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {showMetrics ? "Ocultar métricas" : "Métricas"}
          </button>
          <div className={cn(
            "px-2.5 py-1 rounded-full text-[10px] font-bold",
            aiAvailable ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          )}>
            {aiAvailable ? "IA Activa" : "Sin IA"}
          </div>
        </div>
      </div>

      {/* Live Metrics Panel */}
      {showMetrics && (
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <DollarSign className="w-3 h-3 text-emerald-500" />
                <span className="text-xs font-bold text-gray-900 dark:text-white">S/{metrics.ventasHoy.toFixed(0)}</span>
              </div>
              <p className="text-[9px] text-gray-500">Ventas hoy</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <ShoppingBag className="w-3 h-3 text-blue-500" />
                <span className="text-xs font-bold text-gray-900 dark:text-white">{metrics.transacciones}</span>
              </div>
              <p className="text-[9px] text-gray-500">Pedidos</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <TrendingUp className="w-3 h-3 text-primary" />
                <span className="text-xs font-bold text-gray-900 dark:text-white">S/{metrics.ticketPromedio.toFixed(0)}</span>
              </div>
              <p className="text-[9px] text-gray-500">Ticket prom.</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <AlertTriangle className={cn("w-3 h-3", metrics.stockBajo > 0 ? "text-red-500" : "text-gray-300")} />
                <span className={cn("text-xs font-bold", metrics.stockBajo > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white")}>{metrics.stockBajo}</span>
              </div>
              <p className="text-[9px] text-gray-500">Stock bajo</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[9px] text-gray-400">
              <Users className="w-3 h-3 inline mr-0.5" />{metrics.totalClientes} clientes
            </span>
            <span className="text-[9px] text-gray-400">
              <Package className="w-3 h-3 inline mr-0.5" />{metrics.productosActivos} productos
            </span>
            <span className="text-[9px] text-gray-400">
              <Package className="w-3 h-3 inline mr-0.5" />{metrics.pedidosPendientes} pendientes
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollbarWidth: "thin" }}>
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Brain className="w-16 h-16 mx-auto text-primary/20 mb-4" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Tu consultor de negocios personal</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
              Pregúntame sobre estrategias, precios, combos, cómo recuperar clientes, qué productos agregar, o pide un plan de acción para la semana.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mt-1">
                <Brain className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className={cn(
              "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
              m.role === "user"
                ? "bg-primary text-white rounded-br-md"
                : "bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-700"
            )}>
              <p className="whitespace-pre-line">{m.content}</p>
              <p className={cn("text-[10px] mt-2", m.role === "user" ? "text-white/50" : "text-gray-400")}>
                {m.timestamp.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            {m.role === "user" && (
              <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center mt-1">
                <MessageSquare className="w-4 h-4 text-gray-500" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mt-1">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div className="flex gap-1.5 items-center">
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested prompts */}
      <div className="shrink-0 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setShowPrompts(!showPrompts)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          {showPrompts ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          {showPrompts ? "Ocultar sugerencias" : "Ver sugerencias"}
        </button>
        {showPrompts && (
          <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
            {STRATEGIC_PROMPTS.map(p => (
              <button
                key={p.text}
                onClick={() => sendMessage(p.text)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-primary/5 border border-gray-100 dark:border-gray-700 transition-colors text-left disabled:opacity-50"
              >
                <p.icon className={cn("w-3.5 h-3.5 shrink-0", p.color)} />
                <span className="truncate">{p.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={e => { e.preventDefault(); sendMessage(); }}
        className="shrink-0 flex items-center gap-2 p-3 border-t border-gray-200 dark:border-gray-700"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Pregunta sobre estrategias, precios, combos..."
          maxLength={500}
          disabled={loading}
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm outline-none border border-transparent focus:border-primary/30 focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-gray-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className={cn(
            "p-2.5 rounded-xl transition-all",
            input.trim()
              ? "bg-primary text-white shadow-md shadow-primary/25 hover:bg-primary/90"
              : "bg-gray-200 dark:bg-gray-800 text-gray-400"
          )}
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
