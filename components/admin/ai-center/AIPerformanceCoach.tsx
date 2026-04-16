"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, MessageCircle, Send, Trash2, Target, Plus, Calendar, FileText, Copy, X, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { escapeHtml } from "@/lib/safe-html";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type MetricComparison = {
  id: string;
  label: string;
  current: number;
  previous: number;
  unit: string;
  format: "currency" | "number" | "percent";
  advice?: string;
  tone: "positive" | "negative" | "neutral";
  emoji: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

type Goal = {
  id: string;
  type: "semanal" | "mensual";
  category: "ventas" | "clientes" | "margen";
  target: number;
  description: string;
  current: number;
};

type BusinessEvent = {
  icon: string;
  name: string;
  date: string;
  daysUntil: number;
  tip: string;
};

// ── Coach engine ───────────────────────────────────────────────────────────────

function buildComparisons(data: BusinessData | null): MetricComparison[] {
  if (!data) return [];

  const { orders, sales, customers } = data;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const prevMonthAgo = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const revAndTxns = (from: string, to: string) => {
    const ord = validOrders.filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    });
    const sal = sales.filter((s) => {
      const d = s.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    });
    const rev = ord.reduce((s, o) => s + o.total, 0) + sal.reduce((s, sl) => s + sl.total, 0);
    const txns = ord.length + sal.length;
    return { rev, txns };
  };

  const thisWeek = revAndTxns(weekAgo, now.toISOString().slice(0, 10));
  const lastWeek = revAndTxns(twoWeekAgo, weekAgo);

  const avgTicket = (txns: number, rev: number) => (txns > 0 ? rev / txns : 0);
  const thisAvgTicket = avgTicket(thisWeek.txns, thisWeek.rev);
  const lastAvgTicket = avgTicket(lastWeek.txns, lastWeek.rev);

  const thisSalesPerDay = thisWeek.txns / 7;
  const lastSalesPerDay = lastWeek.txns / 7;

  const cancelThis = orders.filter(
    (o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= weekAgo
  ).length;
  const cancelLast = orders.filter((o) => {
    const d = o.createdAt?.slice(0, 10) ?? "";
    return o.status === "cancelado" && d >= twoWeekAgo && d < weekAgo;
  }).length;
  const totalThis = orders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
  const totalLast = orders.filter((o) => {
    const d = o.createdAt?.slice(0, 10) ?? "";
    return d >= twoWeekAgo && d < weekAgo;
  }).length;
  const cancelRateThis = totalThis > 0 ? (cancelThis / totalThis) * 100 : 0;
  const cancelRateLast = totalLast > 0 ? (cancelLast / totalLast) * 100 : 0;

  const newThisWeek = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
  const newLastWeek = customers.filter((c) => {
    const d = c.createdAt?.slice(0, 10) ?? "";
    return d >= twoWeekAgo && d < weekAgo;
  }).length;

  const thisMonth = revAndTxns(monthAgo, now.toISOString().slice(0, 10));
  const lastMonth = revAndTxns(prevMonthAgo, monthAgo);

  const results: MetricComparison[] = [];

  const addMetric = (
    id: string,
    label: string,
    current: number,
    previous: number,
    unit: string,
    format: "currency" | "number" | "percent",
    emoji: string,
    advicePos: string,
    adviceNeg: string
  ): MetricComparison => {
    const delta = previous > 0 ? ((current - previous) / previous) * 100 : 0;
    const significant = Math.abs(delta) >= 10;
    const tone: MetricComparison["tone"] = !significant ? "neutral" : delta >= 0 ? "positive" : "negative";
    return {
      id, label, current, previous, unit, format, emoji,
      advice: significant ? (delta >= 0 ? advicePos : adviceNeg) : undefined,
      tone,
    };
  };

  results.push(
    addMetric(
      "revenue-week", "Ingresos semanales",
      thisWeek.rev, lastWeek.rev, "S/", "currency", "",
      "Las ventas semanales crecen — mantene el ritmo y cuida el stock de los productos que mas rotan.",
      "Las ventas bajaron esta semana. Revisa si hay productos sin stock o si perdiste horarios de atencion."
    ),
    addMetric(
      "avg-ticket", "Ticket promedio",
      thisAvgTicket, lastAvgTicket, "S/", "currency", "",
      "El ticket promedio sube — la estrategia de combos o precios esta funcionando bien.",
      "El ticket promedio bajo. Activa venta cruzada: sugiere combos en el punto de venta."
    ),
    addMetric(
      "sales-per-day", "Ventas por dia",
      thisSalesPerDay, lastSalesPerDay, "txn", "number", "",
      "Mas transacciones diarias — tu capacidad de atencion esta mejorando.",
      "Menos transacciones por dia. Verifica si hay horas de baja demanda que puedas potenciar con promos."
    ),
    addMetric(
      "cancel-rate", "Tasa de cancelacion",
      cancelRateThis, cancelRateLast, "%", "percent", "",
      cancelRateThis < 5 ? "Cancelaciones bajo control — excelente gestion de pedidos." : "Las cancelaciones bajaron, buena senal. Sigue monitoreando las causas mas comunes.",
      "Las cancelaciones subieron. Identifica las causas: stock, tiempo de espera o precios erroneos."
    ),
    addMetric(
      "new-customers", "Clientes nuevos",
      newThisWeek, newLastWeek, "", "number", "",
      "Mas clientes nuevos esta semana — las acciones de captacion estan funcionando.",
      "Menos clientes nuevos. Considera una promocion de referidos o mayor visibilidad en redes."
    ),
    addMetric(
      "monthly-revenue", "Ingresos del mes",
      thisMonth.rev, lastMonth.rev, "S/", "currency", "",
      "El mes va mejor que el anterior. Enfocate en mantener el servicio y el stock.",
      "El mes va por debajo del anterior. Identifica que cambio: precios, competencia, temporada."
    )
  );

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatValue(value: number, format: "currency" | "number" | "percent", unit: string): string {
  if (format === "currency") {
    return `S/${value.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (format === "percent") {
    return `${value.toFixed(1)}%`;
  }
  return `${value.toFixed(1)} ${unit}`.trim();
}

function calcDelta(current: number, previous: number): { pct: number; label: string } {
  if (previous === 0) return { pct: 0, label: "N/D" };
  const pct = ((current - previous) / previous) * 100;
  return { pct, label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` };
}

function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.*)/gm, "&bull; $1")
    .replace(/^# (.*)/gm, "<h3 class='text-sm font-bold mt-2 mb-1'>$1</h3>")
    .replace(/^## (.*)/gm, "<h4 class='text-xs font-semibold mt-2 mb-1'>$1</h4>")
    .replace(/\n/g, "<br/>");
}

// ── Coach mood based on metrics ────────────────────────────────────────────────

function getCoachMood(metrics: MetricComparison[]): { emoji: string; label: string; color: string } {
  const positives = metrics.filter((m) => m.tone === "positive").length;
  const negatives = metrics.filter((m) => m.tone === "negative").length;
  if (negatives >= 3) return { emoji: "", label: "Preocupado", color: "text-red-500" };
  if (negatives >= 2) return { emoji: "", label: "Atento", color: "text-amber-500" };
  if (positives >= 4) return { emoji: "", label: "Celebrando", color: "text-emerald-500" };
  if (positives >= 2) return { emoji: "", label: "Contento", color: "text-green-500" };
  return { emoji: "", label: "Tranquilo", color: "text-gray-500" };
}

// ── Peruvian Business Calendar ─────────────────────────────────────────────────

function getPeruvianBusinessEvents(): BusinessEvent[] {
  const now = new Date();
  const year = now.getFullYear();

  const events: { month: number; day: number; icon: string; name: string; tip: string }[] = [
    { month: 1, day: 1, icon: "", name: "Ano Nuevo", tip: "Promociones de inicio de ano, liquidacion de stock viejo" },
    { month: 2, day: 14, icon: "", name: "San Valentin", tip: "Stoquea chocolates, vinos, regalos y tarjetas" },
    { month: 3, day: 8, icon: "", name: "Dia de la Mujer", tip: "Ofertas especiales en productos de cuidado personal y regalos" },
    { month: 3, day: 22, icon: "", name: "Dia del Agua", tip: "Promocion en bebidas y productos de higiene" },
    { month: 4, day: 17, icon: "", name: "Semana Santa", tip: "Stoquea pescado enlatado, conservas y dulces" },
    { month: 5, day: 1, icon: "", name: "Dia del Trabajo", tip: "Promociones para el hogar, comida para reuniones" },
    { month: 5, day: 11, icon: "", name: "Dia de la Madre", tip: "Stoquea regalos, chocolates, flores y tarjetas" },
    { month: 6, day: 15, icon: "", name: "Dia del Padre", tip: "Ofertas en licores, snacks y productos de barbacoa" },
    { month: 6, day: 24, icon: "", name: "San Juan (Selva)", tip: "Mayor demanda de juanes, arroz, platano — fecha clave en Pucallpa" },
    { month: 7, day: 28, icon: "", name: "Fiestas Patrias", tip: "Alta demanda general, stoquea todo: carnes, bebidas, decoracion" },
    { month: 7, day: 29, icon: "", name: "Fiestas Patrias (2do dia)", tip: "Continua la alta demanda, asegura stock de bebidas y snacks" },
    { month: 8, day: 30, icon: "", name: "Santa Rosa de Lima", tip: "Dia feriado, demanda moderada de alimentos para reunion" },
    { month: 10, day: 8, icon: "", name: "Combate de Angamos", tip: "Feriado — demanda tipo fin de semana" },
    { month: 10, day: 31, icon: "", name: "Halloween", tip: "Stoquea dulces, golosinas y decoracion tematica" },
    { month: 11, day: 1, icon: "", name: "Dia de Todos los Santos", tip: "Demanda de flores, velas y dulces tradicionales" },
    { month: 12, day: 8, icon: "", name: "Inmaculada Concepcion", tip: "Inicio de temporada navidena fuerte" },
    { month: 12, day: 24, icon: "", name: "Nochebuena", tip: "Maxima demanda: paneton, chocolate, pollo, sidra" },
    { month: 12, day: 25, icon: "", name: "Navidad", tip: "Regalos y alimentos para reunion familiar" },
    { month: 12, day: 31, icon: "", name: "Ano Nuevo (vispera)", tip: "Licores, espumantes, uvas, ropa interior amarilla" },
  ];

  const upcoming: BusinessEvent[] = [];

  for (const evt of events) {
    let evtDate = new Date(year, evt.month - 1, evt.day);
    if (evtDate < now) {
      evtDate = new Date(year + 1, evt.month - 1, evt.day);
    }
    const daysUntil = Math.ceil((evtDate.getTime() - now.getTime()) / 86_400_000);
    upcoming.push({
      icon: evt.icon,
      name: evt.name,
      date: evtDate.toLocaleDateString("es-PE", { day: "numeric", month: "short" }),
      daysUntil,
      tip: evt.tip,
    });
  }

  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  return upcoming.slice(0, 5);
}

function getCurrentSeason(): { icon: string; label: string } {
  const month = new Date().getMonth() + 1;
  if (month >= 4 && month <= 9) return { icon: "", label: "Temporada seca" };
  return { icon: "", label: "Temporada de lluvias" };
}

// ── Goals helpers ──────────────────────────────────────────────────────────────

function computeGoalCurrent(
  category: Goal["category"],
  type: Goal["type"],
  data: BusinessData
): number {
  const now = new Date();
  const periodStart = type === "semanal"
    ? new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
    : new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

  const { orders, sales, customers, expenses } = data;
  const validOrders = orders.filter((o) => o.status !== "cancelado");

  if (category === "ventas") {
    const ordRev = validOrders
      .filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= periodStart)
      .reduce((s, o) => s + o.total, 0);
    const salRev = sales
      .filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= periodStart)
      .reduce((s, sl) => s + sl.total, 0);
    return ordRev + salRev;
  }

  if (category === "clientes") {
    return customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= periodStart).length;
  }

  // margen
  const ordRev = validOrders
    .filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= periodStart)
    .reduce((s, o) => s + o.total, 0);
  const salRev = sales
    .filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= periodStart)
    .reduce((s, sl) => s + sl.total, 0);
  const totalRev = ordRev + salRev;
  const expTotal = type === "semanal" ? (expenses.totalWeek ?? 0) : (expenses.totalMonth ?? 0);
  return totalRev > 0 ? Math.round(((totalRev - expTotal) / totalRev) * 100) : 0;
}

function getGoalDeadlineLabel(type: Goal["type"]): string {
  const now = new Date();
  if (type === "semanal") {
    const dayOfWeek = now.getDay();
    const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    return daysLeft === 0 ? "Hoy termina" : `${daysLeft}d restantes`;
  }
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  return daysLeft === 0 ? "Hoy termina" : `${daysLeft}d restantes`;
}

// ── Quick chat suggestions ─────────────────────────────────────────────────────

const CHAT_SUGGESTIONS = [
  "¿Que producto debo promocionar esta semana?",
  "¿Como aumento mis ventas los lunes?",
  "¿Deberia subir precios este mes?",
  "¿Que clientes debo contactar primero?",
  "¿Cual es mi producto mas rentable?",
  "Dame 3 ideas para vender mas hoy",
];

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

type SavedConversation = {
  id: string;
  date: string;
  messages: ChatMessage[];
  preview: string;
};

const COACH_HISTORY_KEY = "coach-chat-history";
const MAX_CONVERSATIONS = 20;
const CALENDAR_PREP_KEY = "calendar-prep-status";

function loadConversations(): SavedConversation[] {
  try {
    const stored = localStorage.getItem(COACH_HISTORY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveConversations(convos: SavedConversation[]) {
  localStorage.setItem(COACH_HISTORY_KEY, JSON.stringify(convos.slice(0, MAX_CONVERSATIONS)));
}

export default function AIPerformanceCoach({ data }: Props) {
  const metrics = useMemo(() => buildComparisons(data), [data]);
  const coachMood = useMemo(() => getCoachMood(metrics), [metrics]);

  // Identify best and worst metric
  const { bestMetric, worstMetric } = useMemo(() => {
    let best: MetricComparison | null = null;
    let worst: MetricComparison | null = null;
    let bestDelta = -Infinity;
    let worstDelta = Infinity;
    for (const m of metrics) {
      const { pct } = calcDelta(m.current, m.previous);
      const effective = m.id === "cancel-rate" ? -pct : pct;
      if (effective > bestDelta) { bestDelta = effective; best = m; }
      if (effective < worstDelta) { worstDelta = effective; worst = m; }
    }
    return { bestMetric: bestDelta > 5 ? best : null, worstMetric: worstDelta < -5 ? worst : null };
  }, [metrics]);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── History state ───────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);

  useEffect(() => { setConversations(loadConversations()); }, []);

  const saveCurrentConversation = useCallback(() => {
    if (chatMessages.length < 2) return;
    const firstUserMsg = chatMessages.find(m => m.role === "user");
    if (!firstUserMsg) return;
    const convo: SavedConversation = {
      id: `conv_${Date.now()}`,
      date: new Date().toISOString(),
      messages: [...chatMessages],
      preview: firstUserMsg.content.slice(0, 50),
    };
    const updated = [convo, ...conversations].slice(0, MAX_CONVERSATIONS);
    setConversations(updated);
    saveConversations(updated);
  }, [chatMessages, conversations]);

  const startNewConversation = useCallback(() => {
    saveCurrentConversation();
    setChatMessages([]);
    setViewingHistoryId(null);
  }, [saveCurrentConversation]);

  const loadConversation = useCallback((convo: SavedConversation) => {
    saveCurrentConversation();
    setChatMessages(convo.messages);
    setViewingHistoryId(convo.id);
    setShowHistory(false);
  }, [saveCurrentConversation]);

  const deleteConversation = useCallback((id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    saveConversations(updated);
    if (viewingHistoryId === id) {
      setChatMessages([]);
      setViewingHistoryId(null);
    }
  }, [conversations, viewingHistoryId]);

  const clearAllHistory = useCallback(() => {
    setConversations([]);
    saveConversations([]);
    setShowHistory(false);
  }, []);

  // ── Goals state ────────────────────────────────────────────────────────────
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ type: "semanal" as Goal["type"], category: "ventas" as Goal["category"], target: "", description: "" });

  // ── Report modal state ─────────────────────────────────────────────────────
  const [reportContent, setReportContent] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // ── Calendar ───────────────────────────────────────────────────────────────
  const [calendarEvents, setCalendarEvents] = useState<BusinessEvent[]>([]);
  const season = useMemo(() => getCurrentSeason(), []);
  const [calendarPrep, setCalendarPrep] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CALENDAR_PREP_KEY);
      if (stored) setCalendarPrep(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const toggleCalendarPrep = useCallback((eventName: string) => {
    const updated = { ...calendarPrep, [eventName]: !calendarPrep[eventName] };
    setCalendarPrep(updated);
    try { localStorage.setItem(CALENDAR_PREP_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  }, [calendarPrep]);

  useEffect(() => {
    let cancelled = false;
    async function fetchCalendar() {
      try {
        const res = await fetch("/api/ai-assistant/business-calendar");
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        if (cancelled) return;
        if (json.eventos && Array.isArray(json.eventos)) {
          setCalendarEvents(
            json.eventos.slice(0, 5).map((e: { nombre: string; fecha: string; diasHasta: number; impactoNegocio?: string }) => ({
              icon: "",
              name: e.nombre,
              date: new Date(e.fecha).toLocaleDateString("es-PE", { day: "numeric", month: "short" }),
              daysUntil: e.diasHasta,
              tip: e.impactoNegocio ?? "",
            }))
          );
        } else {
          throw new Error("no eventos");
        }
      } catch {
        if (!cancelled) setCalendarEvents(getPeruvianBusinessEvents());
      }
    }
    fetchCalendar();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchGoals() {
      try {
        const res = await fetch("/api/ai-assistant/goals");
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        if (cancelled) return;
        if (json.goals && Array.isArray(json.goals)) {
          setGoals(
            json.goals
              .filter((g: { activa?: boolean }) => g.activa !== false)
              .map((g: { id: string; tipo: string; meta: number; actual?: number; categoria: string; descripcion?: string }) => ({
                id: g.id,
                type: (g.tipo === "semanal" ? "semanal" : "mensual") as Goal["type"],
                category: (["ventas", "clientes", "margen"].includes(g.categoria) ? g.categoria : "ventas") as Goal["category"],
                target: g.meta,
                description: g.descripcion ?? "",
                current: g.actual ?? 0,
              }))
          );
        }
      } catch { /* No backend goals */ }
    }
    fetchGoals();
    return () => { cancelled = true; };
  }, []);

  // ── Chat handler ───────────────────────────────────────────────────────────
  const sendChatMessage = useCallback(async (messageOverride?: string) => {
    const msg = messageOverride ?? chatInput.trim();
    if (!msg || chatLoading) return;
    if (!messageOverride) setChatInput("");

    const userMsg: ChatMessage = { role: "user", content: msg, timestamp: Date.now() };
    setChatMessages((prev) => [...prev.slice(-9), userMsg]);
    setChatLoading(true);

    let fullResponse = "";

    try {
      let res = await fetch("/api/ai-assistant/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, context: "coach", stream: true }),
      });

      if (!res.ok && (res.status === 404 || res.status === 503)) {
        res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, stream: true }),
        });
      }

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") break;
            try {
              const json = JSON.parse(payload);
              if (json.content) {
                fullResponse += json.content;
                setChatMessages((prev) => {
                  const filtered = prev.filter((m) => !(m.role === "assistant" && m.timestamp === userMsg.timestamp + 1));
                  return [...filtered, { role: "assistant", content: fullResponse, timestamp: userMsg.timestamp + 1 }];
                });
              }
            } catch { /* skip malformed chunk */ }
          }
        }

        if (!fullResponse) throw new Error("Stream vacio");
      } else {
        const json = await res.json();
        fullResponse = json.response ?? "Sin respuesta del coach.";
        setChatMessages((prev) => [...prev, { role: "assistant", content: fullResponse, timestamp: Date.now() }]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "No pude conectar con el coach. Intenta de nuevo en unos segundos.", timestamp: Date.now() },
      ]);
    } finally {
      setChatLoading(false);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatInput, chatLoading]);

  // ── Goal handlers ──────────────────────────────────────────────────────────
  const addGoal = useCallback(async () => {
    const target = parseFloat(goalForm.target);
    if (!target || target <= 0 || !goalForm.description.trim()) return;

    const current = data ? computeGoalCurrent(goalForm.category, goalForm.type, data) : 0;

    const newGoal: Goal = {
      id: crypto.randomUUID(),
      type: goalForm.type,
      category: goalForm.category,
      target,
      description: goalForm.description.trim(),
      current,
    };

    setGoals((prev) => [...prev, newGoal]);
    setGoalForm({ type: "semanal", category: "ventas", target: "", description: "" });
    setShowGoalForm(false);

    fetch("/api/ai-assistant/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: newGoal.type,
        meta: newGoal.target,
        actual: newGoal.current,
        categoria: newGoal.category,
        descripcion: newGoal.description,
      }),
    }).then(async (res) => {
      if (res.ok) {
        const json = await res.json();
        if (json.id) {
          setGoals((prev) => prev.map((g) => g.id === newGoal.id ? { ...g, id: json.id } : g));
        }
      }
    }).catch(() => {});
  }, [goalForm, data]);

  const goalsWithCurrent = useMemo(() => {
    if (!data) return goals;
    return goals.map((g) => ({
      ...g,
      current: computeGoalCurrent(g.category, g.type, data),
    }));
  }, [goals, data]);

  // ── Report handler ─────────────────────────────────────────────────────────
  const generateReport = useCallback(async () => {
    setReportLoading(true);
    setReportOpen(true);
    setReportContent("");

    const msg = "Genera un reporte ejecutivo completo de mi negocio esta semana. Incluye: ventas, inventario, fiados, clientes, y 3 recomendaciones concretas con numeros.";
    let full = "";

    try {
      let res = await fetch("/api/ai-assistant/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, context: "coach", stream: true }),
      });

      if (!res.ok && (res.status === 404 || res.status === 503)) {
        res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, stream: true }),
        });
      }

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") break;
            try {
              const json = JSON.parse(payload);
              if (json.content) {
                full += json.content;
                setReportContent(full);
              }
            } catch { /* skip */ }
          }
        }
      } else {
        const json = await res.json();
        full = json.response ?? "No se pudo generar el reporte.";
        setReportContent(full);
      }
    } catch {
      setReportContent("Error al generar el reporte. Intenta de nuevo.");
    } finally {
      setReportLoading(false);
    }
  }, []);

  const copyReport = useCallback(() => {
    navigator.clipboard.writeText(reportContent).catch(() => {});
  }, [reportContent]);

  const shareReportWhatsApp = useCallback(() => {
    const encoded = encodeURIComponent(reportContent.slice(0, 2000));
    window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
  }, [reportContent]);

  // ── WhatsApp share metrics ─────────────────────────────────────────────────
  const shareMetricsWhatsApp = useCallback(() => {
    const lines = [
      `*Resumen semanal del Coach*`,
      "",
      ...metrics.map((m) => {
        const { label } = calcDelta(m.current, m.previous);
        return `${m.label}: ${formatValue(m.current, m.format, m.unit)} (${label})`;
      }),
    ];
    if (bestMetric) {
      const { label } = calcDelta(bestMetric.current, bestMetric.previous);
      lines.push("", `Mejor: ${bestMetric.label} ${label}`);
    }
    if (worstMetric) {
      const { label } = calcDelta(worstMetric.current, worstMetric.previous);
      lines.push(`A mejorar: ${worstMetric.label} ${label}`);
    }
    lines.push("", `${new Date().toLocaleDateString("es-PE")}`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  }, [metrics, bestMetric, worstMetric]);

  // ── Proactive Alerts ───────────────────────────────────────────────────────
  const ALERT_DISMISS_KEY = "coach-alerts-dismissed";
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ALERT_DISMISS_KEY);
      if (stored) setDismissedAlerts(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    const updated = { ...dismissedAlerts, [alertId]: Date.now() };
    setDismissedAlerts(updated);
    try { localStorage.setItem(ALERT_DISMISS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  }, [dismissedAlerts]);

  const askCoachAboutAlert = useCallback((alertText: string) => {
    const question = `El sistema detecto esto: "${alertText}". ¿Que me recomiendas hacer?`;
    sendChatMessage(question);
  }, [sendChatMessage]);

  const proactiveAlerts = useMemo(() => {
    if (!data) return [];
    const { orders, sales, products, customers } = data;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
    const validOrders = orders.filter(o => o.status !== "cancelado");
    const alerts: Array<{ id: string; icon: string; text: string; action?: string }> = [];

    // 1. Ventas bajas un dia especifico
    const dayRevMap: Record<string, number> = {};
    for (const o of validOrders) {
      if (!o.createdAt) continue;
      const d = new Date(o.createdAt);
      const dayName = d.toLocaleDateString("es-PE", { weekday: "long" });
      dayRevMap[dayName] = (dayRevMap[dayName] ?? 0) + o.total;
    }
    for (const s of sales) {
      if (!s.createdAt) continue;
      const d = new Date(s.createdAt);
      const dayName = d.toLocaleDateString("es-PE", { weekday: "long" });
      dayRevMap[dayName] = (dayRevMap[dayName] ?? 0) + s.total;
    }
    const dayValues = Object.values(dayRevMap);
    const avgDay = dayValues.length > 0 ? dayValues.reduce((a, b) => a + b, 0) / dayValues.length : 0;
    for (const [day, rev] of Object.entries(dayRevMap)) {
      if (avgDay > 0 && rev < avgDay * 0.5) {
        alerts.push({ id: "low-day", icon: "", text: `Tus ventas caen los ${day} — ¿Promocion especial?`, action: "Crear promo" });
        break;
      }
    }

    // 2. Producto vendiendo 3x mas
    const prodQtyThis: Record<string, number> = {};
    const prodQtyLast: Record<string, number> = {};
    const prodNamesMap: Record<string, string> = {};
    for (const s of sales) {
      const d = s.createdAt?.slice(0, 10) ?? "";
      for (const i of s.items) {
        const pid = String(i.productId);
        prodNamesMap[pid] = i.name;
        if (d >= weekAgo) prodQtyThis[pid] = (prodQtyThis[pid] ?? 0) + i.quantity;
        else if (d >= twoWeekAgo) prodQtyLast[pid] = (prodQtyLast[pid] ?? 0) + i.quantity;
      }
    }
    for (const [pid, qty] of Object.entries(prodQtyThis)) {
      const lastQty = prodQtyLast[pid] ?? 0;
      if (lastQty > 0 && qty > lastQty * 3) {
        alerts.push({ id: `hot-${pid}`, icon: "", text: `${prodNamesMap[pid]} se vende 3x mas esta semana — asegura stock`, action: "Ver stock" });
        break;
      }
    }

    // 3. Clientes VIP inactivos
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 86_400_000).toISOString().slice(0, 10);
    const inactiveVIP = customers.filter(c => {
      const totalSpent = (c as unknown as { totalSpent?: number }).totalSpent ?? 0;
      const lastPurchase = (c as unknown as { lastPurchaseAt?: string }).lastPurchaseAt ?? c.createdAt ?? "";
      return totalSpent > 200 && lastPurchase.slice(0, 10) < fifteenDaysAgo;
    });
    if (inactiveVIP.length > 0) {
      alerts.push({ id: "inactive-vip", icon: "", text: `${inactiveVIP.length} clientes VIP no compran hace 15+ dias`, action: "Ver clientes" });
    }

    // 4. Productos sin rotar
    const activeProds = products.filter(p => p.active !== false && (p.stock ?? 0) > 0);
    const soldProductIds = new Set<string>();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    for (const s of sales.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= thirtyDaysAgo)) {
      for (const i of s.items) soldProductIds.add(String(i.productId));
    }
    const deadStock = activeProds.filter(p => !soldProductIds.has(String(p.id)));
    if (deadStock.length > 3) {
      alerts.push({ id: "dead-stock", icon: "", text: `${deadStock.length} productos sin rotar hace 30+ dias — valora liquidar`, action: "Ver inventario" });
    }

    // 5. Productos con margen <10% pero buenas ventas
    let priceSuggestCount = 0;
    for (const p of products) {
      if (priceSuggestCount >= 2) break;
      const cost = (p as unknown as { costPrice?: number }).costPrice ?? 0;
      const price = p.price ?? 0;
      if (cost <= 0 || price <= 0) continue;
      const margen = ((price - cost) / price) * 100;
      if (margen >= 10) continue;
      const weekQty = prodQtyThis[String(p.id)] ?? 0;
      if (weekQty <= 5) continue;
      const sugerencia = cost / 0.8;
      const incremento = sugerencia - price;
      if (incremento > 0) {
        alerts.push({
          id: `price-${p.id}`,
          icon: "",
          text: `${p.name}: margen solo ${margen.toFixed(0)}%. Sube S/${incremento.toFixed(2)} para ganar 20%`,
          action: "Ajustar precio",
        });
        priceSuggestCount++;
      }
    }

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return alerts
      .filter(a => {
        const dismissedAt = dismissedAlerts[a.id];
        return !dismissedAt || (Date.now() - dismissedAt > sevenDaysMs);
      })
      .slice(0, 4);
  }, [data, dismissedAlerts]);

  // ── Daily Question ─────────────────────────────────────────────────────────
  const QUESTION_KEY = "coach-question-";
  const [questionAnswer, setQuestionAnswer] = useState<string | null>(null);
  const [questionDismissed, setQuestionDismissed] = useState(false);

  const dailyQuestion = useMemo(() => {
    if (!data) return null;
    const { orders, sales, products, customers } = data;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

    const validOrders = orders.filter(o => o.status !== "cancelado");
    const weekRevByDay: Record<string, number> = {};
    for (const o of validOrders) {
      if (!o.createdAt || o.createdAt.slice(0, 10) < weekAgo) continue;
      const dayName = new Date(o.createdAt).toLocaleDateString("es-PE", { weekday: "long" });
      weekRevByDay[dayName] = (weekRevByDay[dayName] ?? 0) + o.total;
    }
    const dayValues2 = Object.values(weekRevByDay);
    const avgDay2 = dayValues2.length > 0 ? dayValues2.reduce((a, b) => a + b, 0) / dayValues2.length : 0;

    const activeProds = products.filter(p => p.active !== false && (p.stock ?? 0) > 0);
    const soldProductIds = new Set<string>();
    for (const s of sales.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= thirtyDaysAgo)) {
      for (const i of s.items) soldProductIds.add(String(i.productId));
    }
    const deadStock = activeProds.filter(p => !soldProductIds.has(String(p.id)));

    const questions = [
      {
        condicion: () => {
          for (const [day, rev] of Object.entries(weekRevByDay)) {
            if (avgDay2 > 0 && rev < avgDay2 * 0.7) return day;
          }
          return null;
        },
        build: (day: string) => ({
          id: "low-day",
          pregunta: `Tus ${day} venden 30% menos que el promedio. Crearias una promocion especial?`,
          opciones: ["Si, buena idea", "No por ahora", "Ya lo intente"],
        }),
      },
      {
        condicion: () => deadStock.length > 10 ? deadStock.length : null,
        build: (count: number) => ({
          id: "dead-stock",
          pregunta: `Tienes ${count} productos sin vender en 30 dias. Harias una liquidacion?`,
          opciones: ["Si, con descuento", "Los devuelvo al proveedor", "Los regalo como promocion"],
        }),
      },
      {
        condicion: () => customers.length > 5 ? true : null,
        build: () => ({
          id: "general",
          pregunta: "Como mejorarias tu negocio esta semana?",
          opciones: ["Mas promociones", "Mejor atencion", "Nuevos productos"],
        }),
      },
    ];

    const todayStr = now.toISOString().slice(0, 10);

    for (const q of questions) {
      const result = q.condicion();
      if (result !== null) {
        const question = q.build(result as never);
        try {
          const stored = localStorage.getItem(QUESTION_KEY + question.id);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.date && new Date(parsed.date).getTime() > Date.now() - 7 * 86_400_000) continue;
          }
        } catch { /* ignore */ }
        try {
          const dismissed = localStorage.getItem(QUESTION_KEY + "dismissed-" + todayStr);
          if (dismissed) return null;
        } catch { /* ignore */ }
        return question;
      }
    }
    return null;
  }, [data]);

  const handleQuestionAnswer = (answer: string) => {
    if (!dailyQuestion) return;
    setQuestionAnswer(answer);
    try {
      localStorage.setItem(QUESTION_KEY + dailyQuestion.id, JSON.stringify({ answer, date: new Date().toISOString() }));
    } catch { /* ignore */ }
    setTimeout(() => setQuestionDismissed(true), 2000);
  };

  return (
    <div className="space-y-5">
      {/* ── Daily Question ──────────────────────────────────────────────────── */}
      {dailyQuestion && !questionDismissed && (
        <div className="bg-gradient-to-br from-[#f97316]/10 to-[#f97316]/5 dark:from-[#f97316]/15 dark:to-[#f97316]/5 rounded-xl border border-[#f97316]/20 p-4 ">
          <p className="text-xs font-bold text-[#f97316] mb-2 flex items-center gap-1.5">
            Pregunta del dia
          </p>
          <p className="text-sm font-semibold text-gray-800 dark:text-foreground mb-3">{dailyQuestion.pregunta}</p>
          {questionAnswer ? (
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Gracias por tu respuesta</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dailyQuestion.opciones.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleQuestionAnswer(opt)}
                  className="px-3 py-1.5 rounded-lg border border-[#f97316]/30 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-[#f97316]/10 hover:border-[#f97316]/50 transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Proactive Alerts ─────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 ">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
          El Coach detecto esto
        </p>
        {proactiveAlerts.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
            Todo se ve bien — ¡Sigue asi!
          </div>
        ) : (
          <div className="space-y-2">
            {proactiveAlerts.map(alert => (
              <div key={alert.id} className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl px-3 py-2.5">
                <span className="text-lg leading-none mt-0.5 shrink-0">{alert.icon}</span>
                <p className="flex-1 text-sm text-gray-800 dark:text-foreground font-medium">{alert.text}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => askCoachAboutAlert(alert.text)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#00B4A6]/10 text-[#00B4A6] dark:text-emerald-400 hover:bg-[#00B4A6]/20 transition-colors"
                    title="Preguntar al coach"
                  >
                    <MessageCircle className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Descartar por 7 dias"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Hourly Analysis ──────────────────────────────────────────────────── */}
      {data && (() => {
        const { sales: salesData } = data;
        if (salesData.length < 10) return null;

        const now = Date.now();
        const thirtyDaysMs = 30 * 86_400_000;
        const hourBuckets: Record<number, { total: number; count: number }> = {};
        let firstSaleHour = 23;
        let lastSaleHour = 0;
        let totalDays = 0;

        const daySet = new Set<string>();
        for (const s of salesData) {
          try {
            const d = new Date(s.createdAt ?? "");
            if (now - d.getTime() > thirtyDaysMs) continue;
            const h = d.getHours();
            daySet.add(d.toDateString());
            if (!hourBuckets[h]) hourBuckets[h] = { total: 0, count: 0 };
            hourBuckets[h].total += s.total;
            hourBuckets[h].count++;
            if (h < firstSaleHour) firstSaleHour = h;
            if (h > lastSaleHour) lastSaleHour = h;
          } catch { /* ignore */ }
        }
        totalDays = Math.max(daySet.size, 1);

        if (Object.keys(hourBuckets).length < 3) return null;

        const maxHourly = Math.max(...Object.values(hourBuckets).map(b => b.total / totalDays));
        const deadHours: number[] = [];
        for (let h = firstSaleHour; h <= lastSaleHour; h++) {
          const bucket = hourBuckets[h];
          if (!bucket || (bucket.total / totalDays) < maxHourly * 0.05) deadHours.push(h);
        }

        const firstHourSales = hourBuckets[firstSaleHour]?.total ?? 0;
        const lastHourSales = hourBuckets[lastSaleHour]?.total ?? 0;
        const firstHourDaily = firstHourSales / totalDays;
        const lastHourDaily = lastHourSales / totalDays;

        const suggestedOpen = Math.max(5, firstSaleHour - 1);
        const suggestedClose = Math.min(23, lastSaleHour + 1);

        return (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 ">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
              &#9200; Analisis de Horario
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0">Primera venta</span>
                <span className="text-sm font-bold text-gray-800 dark:text-foreground">{firstSaleHour}:00</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0">Ultima venta</span>
                <span className="text-sm font-bold text-gray-800 dark:text-foreground">{lastSaleHour}:00</span>
              </div>
              {deadHours.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-32 shrink-0">Horas muertas</span>
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{deadHours.map(h => `${h}:00`).join(", ")}</span>
                </div>
              )}
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 mt-2">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">Sugerencia</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-300">
                  Podrias abrir a las {suggestedOpen}:00 y cerrar a las {suggestedClose}:00.
                </p>
                <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                  <span>Cerrar 1h antes: -S/{lastHourDaily.toFixed(0)}/dia</span>
                  <span>Abrir 1h despues: -S/{firstHourDaily.toFixed(0)}/dia</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Weekly 30-Second Summary ──────────────────────────────────────── */}
      {data && (() => {
        const { orders, sales: salesData, customers } = data;
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
        const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
        const valid = orders.filter(o => o.status !== "cancelado");
        const thisRev = valid.filter(o => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo).reduce((s, o) => s + o.total, 0)
          + salesData.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo).reduce((s, sl) => s + sl.total, 0);
        const lastRev = valid.filter(o => { const d = o.createdAt?.slice(0, 10) ?? ""; return d >= twoWeekAgo && d < weekAgo; }).reduce((s, o) => s + o.total, 0)
          + salesData.filter(s => { const d = s.createdAt?.slice(0, 10) ?? ""; return d >= twoWeekAgo && d < weekAgo; }).reduce((s, sl) => s + sl.total, 0);
        const cambio = lastRev > 0 ? Math.round(((thisRev - lastRev) / lastRev) * 100) : 0;
        const dayRevMap: Record<string, number> = {};
        for (const s of salesData.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
          if (!s.createdAt) continue;
          const dayName = new Date(s.createdAt).toLocaleDateString("es-PE", { weekday: "long" });
          dayRevMap[dayName] = (dayRevMap[dayName] ?? 0) + s.total;
        }
        const bestDay = Object.entries(dayRevMap).sort((a, b) => b[1] - a[1])[0];
        const clientesNuevos = customers.filter(c => (c.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
        const lowStock = (data.products ?? []).filter((p: { stock?: number; stockMin?: number }) => p.stock != null && p.stockMin != null && p.stock! <= p.stockMin!).length;
        if (thisRev === 0) return null;
        return (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              Tu semana en 30 segundos
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              Esta semana vendiste <strong>S/{thisRev.toFixed(0)}</strong> ({cambio >= 0 ? "+" : ""}{cambio}% vs anterior).
              {bestDay ? ` Tu mejor dia fue el ${bestDay[0]} con S/${bestDay[1].toFixed(0)}.` : ""}
              {clientesNuevos > 0 ? ` ${clientesNuevos} clientes nuevos.` : ""}
              {lowStock > 0 ? ` ${lowStock} productos necesitan reabastecimiento.` : ""}
            </p>
          </div>
        );
      })()}

      {/* ── Metric Cards ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Coach de Rendimiento
              </h2>
              <span className={cn("text-sm", coachMood.color)} title={coachMood.label}>
                {coachMood.emoji}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Comparativa semanal. Consejos cuando la variacion supera el 10%.
            </p>
          </div>
          <button
            onClick={shareMetricsWhatsApp}
            className="text-xs px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors flex items-center gap-1"
          >
            <Share2 className="w-3 h-3" />
            WhatsApp
          </button>
        </div>

        {/* Best/Worst highlight */}
        {(bestMetric || worstMetric) && (
          <div className="flex flex-wrap gap-2 mb-4">
            {bestMetric && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-medium">
                Mejor: {bestMetric.label} ({calcDelta(bestMetric.current, bestMetric.previous).label})
              </span>
            )}
            {worstMetric && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-medium">
                A mejorar: {worstMetric.label} ({calcDelta(worstMetric.current, worstMetric.previous).label})
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          {metrics.map((m) => {
            const { pct, label } = calcDelta(m.current, m.previous);
            const isPositive = pct > 0;
            const isNeutral = Math.abs(pct) < 10 || m.previous === 0;
            const isCancelMetric = m.id === "cancel-rate";
            const effectivelyGood = isCancelMetric ? !isPositive : isPositive;
            const TrendIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
            const trendColor = isNeutral
              ? "text-gray-400"
              : effectivelyGood
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-500 dark:text-red-400";
            const isBest = bestMetric?.id === m.id;
            const isWorst = worstMetric?.id === m.id;

            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl p-3.5 border transition-colors relative",
                  isNeutral
                    ? "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                    : effectivelyGood
                    ? "border-emerald-100 dark:border-emerald-800/30 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-red-100 dark:border-red-800/30 bg-red-50/50 dark:bg-red-950/20",
                  isBest && "ring-1 ring-emerald-300 dark:ring-emerald-600",
                  isWorst && "ring-1 ring-red-300 dark:ring-red-600"
                )}
              >
                {(isBest || isWorst) && (
                  <span className="absolute -top-2 right-2 text-xs">{isBest ? "+" : "−"}</span>
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{m.emoji}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-50">
                    {formatValue(m.current, m.format, m.unit)}
                  </span>
                  <div className={cn("flex items-center gap-0.5 text-xs font-semibold", trendColor)}>
                    <TrendIcon className="w-3.5 h-3.5" />
                    {label}
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Antes: {formatValue(m.previous, m.format, m.unit)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Advice section */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">
            Consejos del coach
          </h3>
          <div className="flex flex-col gap-2">
            {metrics.filter((m) => m.advice).map((m) => {
              const isCancelMetric = m.id === "cancel-rate";
              const { pct } = calcDelta(m.current, m.previous);
              const effectivelyGood = isCancelMetric ? pct < 0 : pct > 0;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-start gap-2.5 p-3 rounded-lg border text-sm",
                    effectivelyGood
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-800/30"
                      : "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-800/30"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 w-1.5 h-1.5 rounded-full shrink-0",
                    effectivelyGood ? "bg-emerald-500" : "bg-amber-500"
                  )} />
                  <div>
                    <span className={cn(
                      "text-xs font-semibold block mb-0.5",
                      effectivelyGood ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                    )}>
                      {m.label}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 text-xs">{m.advice}</span>
                  </div>
                </div>
              );
            })}
            {metrics.filter((m) => m.advice).length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Todas las metricas estan estables esta semana. Sin variaciones significativas.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Chat: Preguntale al Coach ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[#00B4A6]" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Preguntale al Coach
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#00B4A6] transition-colors"
            >
              <FileText className="w-3 h-3" />
              Historial
            </button>
            {viewingHistoryId && (
              <button
                onClick={startNewConversation}
                className="flex items-center gap-1 text-xs font-bold text-[#00B4A6] hover:text-[#00B4A6]/80 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Nueva
              </button>
            )}
            {chatMessages.length > 0 && !viewingHistoryId && (
              <button
                onClick={() => { saveCurrentConversation(); setChatMessages([]); }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="mb-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Anteriores</span>
              {conversations.length > 0 && (
                <button onClick={clearAllHistory} className="text-[10px] text-red-500 hover:text-red-600 font-semibold">Limpiar</button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">Sin conversaciones guardadas</p>
              ) : (
                conversations.map(convo => (
                  <div
                    key={convo.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors",
                      viewingHistoryId === convo.id && "bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10"
                    )}
                  >
                    <button onClick={() => loadConversation(convo)} className="flex-1 text-left min-w-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{convo.preview}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {new Date(convo.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {" - "}{convo.messages.length} mensajes
                      </p>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(convo.id); }}
                      className="shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors ml-2"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {viewingHistoryId && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Revisando anterior</span>
            <button onClick={startNewConversation} className="text-xs font-bold text-[#00B4A6] hover:underline ml-auto">Nueva</button>
          </div>
        )}

        {/* Chat messages */}
        {chatMessages.length > 0 && (
          <div className="max-h-80 overflow-y-auto mb-3 space-y-3 pr-1">
            {chatMessages.slice(-10).map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg p-3 text-sm",
                  msg.role === "user"
                    ? "bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 ml-8"
                    : "bg-gray-50 dark:bg-gray-800/70 mr-4"
                )}
              >
                <span className="text-xs font-semibold block mb-1 text-gray-500 dark:text-gray-400">
                  {msg.role === "user" ? "Tu" : "Coach"}
                </span>
                {msg.role === "assistant" ? (
                  <div
                    className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  <p className="text-gray-700 dark:text-gray-300 text-xs">{msg.content}</p>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Quick suggestions */}
        {chatMessages.length === 0 && !viewingHistoryId && (
          <div className="mb-3">
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">Sugerencias</p>
            <div className="flex flex-wrap gap-1.5">
              {CHAT_SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendChatMessage(q)}
                  disabled={chatLoading}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-[#00B4A6]/10 hover:border-[#00B4A6]/30 hover:text-[#00B4A6] dark:hover:text-emerald-400 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
            placeholder="¿Debo comprar mas arroz esta semana?"
            disabled={chatLoading || !!viewingHistoryId}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 disabled:opacity-50"
          />
          <button
            onClick={() => sendChatMessage()}
            disabled={chatLoading || !chatInput.trim() || !!viewingHistoryId}
            className="flex items-center gap-1.5 rounded-lg bg-[#00B4A6] hover:bg-[#00B4A6]/90 text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
            {chatLoading ? "..." : "Preguntar"}
          </button>
        </div>
      </div>

      {/* ── Goals ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#f97316]" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Mis Metas
            </h3>
          </div>
          <button
            onClick={() => setShowGoalForm((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-[#00B4A6] hover:text-[#00B4A6]/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva Meta
          </button>
        </div>

        {showGoalForm && (
          <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={goalForm.type}
                onChange={(e) => setGoalForm((f) => ({ ...f, type: e.target.value as Goal["type"] }))}
                className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
              >
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
              <select
                value={goalForm.category}
                onChange={(e) => setGoalForm((f) => ({ ...f, category: e.target.value as Goal["category"] }))}
                className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
              >
                <option value="ventas">Ventas (S/)</option>
                <option value="clientes">Clientes nuevos</option>
                <option value="margen">Margen (%)</option>
              </select>
            </div>
            <input
              type="number"
              placeholder={goalForm.category === "ventas" ? "Meta (ej: 5000)" : goalForm.category === "clientes" ? "Meta (ej: 20)" : "Meta (ej: 25)"}
              value={goalForm.target}
              onChange={(e) => setGoalForm((f) => ({ ...f, target: e.target.value }))}
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
            />
            <input
              type="text"
              placeholder="Descripcion (ej: Vender S/5000 esta semana)"
              value={goalForm.description}
              onChange={(e) => setGoalForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
            />
            <div className="flex gap-2">
              <button
                onClick={addGoal}
                className="rounded-md bg-[#00B4A6] text-white px-3 py-1.5 text-xs font-medium hover:bg-[#00B4A6]/90 transition-colors"
              >
                Guardar
              </button>
              <button
                onClick={() => setShowGoalForm(false)}
                className="rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {goalsWithCurrent.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
            Sin metas definidas. Crea tu primera meta para trackear tu progreso.
          </p>
        ) : (
          <div className="space-y-3">
            {goalsWithCurrent.map((g) => {
              const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
              const unitLabel = g.category === "ventas" ? "S/" : g.category === "margen" ? "%" : "";
              const deadline = getGoalDeadlineLabel(g.type);
              return (
                <div key={g.id} className="p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{g.description}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">{deadline}</span>
                      <span className={cn(
                        "text-xs font-bold",
                        pct >= 100 ? "text-emerald-600 dark:text-emerald-400" : pct >= 50 ? "text-[#f97316]" : "text-red-500"
                      )}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-[#f97316]" : "bg-red-400"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span>Actual: {unitLabel}{g.current.toLocaleString("es-PE")}{g.category === "margen" ? "%" : ""}</span>
                    <span>Meta: {unitLabel}{g.target.toLocaleString("es-PE")}{g.category === "margen" ? "%" : ""}</span>
                    <span className="capitalize">{g.type}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Business Calendar ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#00B4A6]" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Calendario Comercial
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            {season.icon} {season.label}
          </span>
        </div>

        <div className="space-y-2">
          {calendarEvents.map((evt, i) => {
            const isPrepped = calendarPrep[evt.name] ?? false;
            return (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <span className="text-lg shrink-0">{evt.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-sm font-medium",
                      isPrepped ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-800 dark:text-gray-200"
                    )}>
                      {evt.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{evt.date}</span>
                      <span className={cn(
                        "text-xs font-semibold px-1.5 py-0.5 rounded",
                        evt.daysUntil <= 7
                          ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                          : evt.daysUntil <= 30
                          ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                      )}>
                        en {evt.daysUntil}d
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{evt.tip}</p>
                  <button
                    onClick={() => toggleCalendarPrep(evt.name)}
                    className={cn(
                      "mt-1 text-[10px] px-2 py-0.5 rounded-full transition-colors",
                      isPrepped
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    )}
                  >
                    {isPrepped ? "Preparado" : "Marcar preparado"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Narrative Report Button ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#f97316]" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Reporte Narrativo
            </h3>
          </div>
          <button
            onClick={generateReport}
            disabled={reportLoading}
            className="flex items-center gap-1.5 rounded-lg bg-[#f97316] hover:bg-[#f97316]/90 text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            {reportLoading ? "Generando..." : "Generar"}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Reporte ejecutivo con ventas, inventario, clientes y recomendaciones.
        </p>
      </div>

      {/* ── Report Modal ──────────────────────────────────────────────────── */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Reporte Ejecutivo</h3>
              <button onClick={() => setReportOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {reportLoading && !reportContent ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#00B4A6] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div
                  className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(reportContent) }}
                />
              )}
            </div>
            <div className="flex items-center gap-2 p-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={copyReport}
                disabled={!reportContent}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Copy className="w-3 h-3" />
                Copiar
              </button>
              <button
                onClick={shareReportWhatsApp}
                disabled={!reportContent}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              >
                WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}