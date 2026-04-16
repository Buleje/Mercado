"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Sun, Sunset, Moon, TrendingUp, TrendingDown, Minus,
  CreditCard, DollarSign, AlertTriangle, Calendar,
  ChevronDown, ChevronUp, Share2, Clock3, CloudRain, CloudSun,
  Package, Tags, Users, ReceiptText, Star, BarChart3, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGreeting(): { text: string; icon: React.ElementType; period: "morning" | "afternoon" | "evening" } {
  const h = new Date().getHours();
  if (h < 12) return { text: "Buenos dias", icon: Sun, period: "morning" };
  if (h < 19) return { text: "Buenas tardes", icon: Sunset, period: "afternoon" };
  return { text: "Buenas noches", icon: Moon, period: "evening" };
}

function getDayName(): string {
  const days = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  return days[new Date().getDay()];
}

function fmt(n: number) {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(a: number, b: number): string {
  if (b === 0) return "0";
  return ((a / b - 1) * 100).toFixed(1);
}

// ── Fiados types ───────────────────────────────────────────────────────────────

type FiadoEntry = {
  id: string;
  customerName?: string;
  balance?: number;
  status?: string;
  dueDate?: string;
};

type FiadosData = {
  fiados: FiadoEntry[];
  total: number;
  totalBalance: number;
};

// ── Calendar context helpers ───────────────────────────────────────────────────

type CalendarContext = {
  isQuincena: boolean;
  isWeekend: boolean;
  isMonday: boolean;
  season: string;
  seasonLabel: string;
  dayTip: string;
  nearHoliday: { name: string; date: string } | null;
};

const PERU_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "Ano Nuevo" },
  { month: 5, day: 1, name: "Dia del Trabajo" },
  { month: 6, day: 29, name: "San Pedro y San Pablo" },
  { month: 7, day: 28, name: "Fiestas Patrias" },
  { month: 7, day: 29, name: "Fiestas Patrias" },
  { month: 8, day: 30, name: "Santa Rosa de Lima" },
  { month: 10, day: 8, name: "Combate de Angamos" },
  { month: 11, day: 1, name: "Dia de Todos los Santos" },
  { month: 12, day: 8, name: "Inmaculada Concepcion" },
  { month: 12, day: 25, name: "Navidad" },
];

function getCalendarContext(): CalendarContext {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const dayOfWeek = now.getDay();

  const isQuincena = day === 1 || day === 15;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isMonday = dayOfWeek === 1;

  let season: string;
  let seasonLabel: string;
  if (month >= 12 || month <= 3) {
    season = "lluvias";
    seasonLabel = "Temporada de lluvias — productos impermeables y enlatados con mas demanda";
  } else if (month >= 6 && month <= 9) {
    season = "seca";
    seasonLabel = "Temporada seca — refrescos y bebidas frias con mas demanda";
  } else {
    season = "transicion";
    seasonLabel = "Temporada de transicion — demanda estable";
  }

  let dayTip: string;
  if (isQuincena) {
    dayTip = "Quincena — espera +40% ventas. Stock listo.";
  } else if (isWeekend) {
    dayTip = "Fin de semana — horario extendido recomendado";
  } else if (isMonday) {
    dayTip = "Lunes — revisar stock de la semana";
  } else {
    dayTip = `${getDayName().charAt(0).toUpperCase() + getDayName().slice(1)} — dia regular de operaciones`;
  }

  let nearHoliday: { name: string; date: string } | null = null;
  for (let d = 0; d <= 7; d++) {
    const check = new Date(now.getTime() + d * 86_400_000);
    const cm = check.getMonth() + 1;
    const cd = check.getDate();
    const holiday = PERU_HOLIDAYS.find((h) => h.month === cm && h.day === cd);
    if (holiday) {
      nearHoliday = {
        name: holiday.name,
        date: check.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" }),
      };
      break;
    }
  }

  return { isQuincena, isWeekend, isMonday, season, seasonLabel, dayTip, nearHoliday };
}

// ── Day Score ──────────────────────────────────────────────────────────────────

type DayScoreResult = {
  score: number;
  label: string;
  color: string;
  factors: string[];
};

function computeDayScore(analysis: ReturnType<typeof analyzeBusiness>, fiadosOverdue: boolean): DayScoreResult {
  if (!analysis) return { score: 5, label: "Sin datos", color: "text-gray-500", factors: [] };

  let score = 5;
  const factors: string[] = [];

  // Revenue vs yesterday
  if (analysis.yestRevenue > 0) {
    const revDelta = (analysis.todayRevenue / analysis.yestRevenue - 1) * 100;
    if (revDelta > 20) { score += 1.5; factors.push("Ventas +20% vs ayer"); }
    else if (revDelta > 0) { score += 0.5; factors.push("Ventas subiendo"); }
    else if (revDelta < -20) { score -= 1.5; factors.push("Ventas -20% vs ayer"); }
    else if (revDelta < 0) { score -= 0.5; factors.push("Ventas bajaron"); }
  }

  // Stock issues
  if (analysis.outOfStock.length > 5) { score -= 1.5; factors.push(`${analysis.outOfStock.length} agotados`); }
  else if (analysis.outOfStock.length > 0) { score -= 0.5; factors.push(`${analysis.outOfStock.length} agotado(s)`); }
  else { score += 0.5; factors.push("Stock OK"); }

  // Pending orders
  if (analysis.pendingOrders > 5) { score -= 1; factors.push(`${analysis.pendingOrders} pedidos pendientes`); }
  else if (analysis.pendingOrders === 0) { score += 0.5; factors.push("Sin pedidos pendientes"); }

  // Fiados
  if (fiadosOverdue) { score -= 1; factors.push("Fiados vencidos"); }

  // Day performance
  if (analysis.dayMultiplier >= 1.1) { score += 0.5; factors.push("Dia historicamente fuerte"); }
  else if (analysis.dayMultiplier < 0.8) { score -= 0.5; factors.push("Dia historicamente bajo"); }

  // Cash flow
  const cashAvailable = analysis.cashSales - analysis.expensesToday;
  if (cashAvailable > 0) { score += 0.5; factors.push("Caja positiva"); }
  else if (cashAvailable < 0) { score -= 1; factors.push("Caja negativa"); }

  score = Math.max(1, Math.min(10, Math.round(score)));

  if (score >= 8) return { score, label: "Excelente", color: "text-emerald-600 dark:text-emerald-400", factors };
  if (score >= 6) return { score, label: "Buen dia", color: "text-green-600 dark:text-green-400", factors };
  if (score >= 4) return { score, label: "Regular", color: "text-amber-600 dark:text-amber-400", factors };
  return { score, label: "Atencion", color: "text-red-600 dark:text-red-400", factors };
}

// ── Analysis engine ────────────────────────────────────────────────────────────

function analyzeBusiness(data: BusinessData | null) {
  if (!data) return null;

  const { products, orders, sales, customers } = data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const prev14 = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const revenueFor = (from: string, to: string) => {
    const ord = validOrders
      .filter((o) => { const d = o.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; })
      .reduce((s, o) => s + o.total, 0);
    const sal = sales
      .filter((s) => { const d = s.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; })
      .reduce((s, sl) => s + sl.total, 0);
    return ord + sal;
  };

  const txnCount = (from: string, to: string) => {
    const ord = validOrders.filter((o) => { const d = o.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; }).length;
    const sal = sales.filter((s) => { const d = s.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; }).length;
    return ord + sal;
  };

  const todayRevenue = revenueFor(today, today);
  const yestRevenue = revenueFor(yesterday, yesterday);
  const weekRevenue = revenueFor(weekAgo, today);
  const prevWeekRevenue = revenueFor(prev14, weekAgo);
  const todayTxns = txnCount(today, today);
  const yestTxns = txnCount(yesterday, yesterday);

  const dayOfWeek = now.getDay();

  // Inventory alerts
  const activeProducts = products.filter((p) => p.active !== false);
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );

  const weekSalesQty: Record<string, number> = {};
  const weekSalesArr = sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo);
  const weekOrdersArr = validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo);
  for (const s of weekSalesArr) {
    for (const i of s.items) {
      const pid = String(i.productId);
      weekSalesQty[pid] = (weekSalesQty[pid] ?? 0) + i.quantity;
    }
  }
  for (const o of weekOrdersArr) {
    for (const i of o.items) {
      const pid = String(i.id);
      weekSalesQty[pid] = (weekSalesQty[pid] ?? 0) + i.quantity;
    }
  }

  const criticalProducts = lowStock.slice(0, 3).map((p) => {
    const dailyRate = (weekSalesQty[String(p.id)] ?? 1) / 7;
    const daysLeft = dailyRate > 0 ? Math.floor((p.stock ?? 0) / dailyRate) : 99;
    return { name: p.name, stock: p.stock ?? 0, daysLeft };
  });

  const pendingOrders = orders.filter((o) => o.status === "pendiente");
  const pendingRevenue = pendingOrders.reduce((s, o) => s + o.total, 0);

  const month30 = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= month30)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= month30)) {
    if (o.customer?.phone) recentBuyers.add(o.customer.phone);
  }
  const inactiveLast30 = customers.filter((c) => c.phone && !recentBuyers.has(c.phone)).length;

  const dayPerf: Record<number, number[]> = {};
  for (const s of sales) {
    const d = new Date(s.createdAt ?? "");
    if (!isNaN(d.getTime())) {
      const dow = d.getDay();
      if (!dayPerf[dow]) dayPerf[dow] = [];
      dayPerf[dow].push(s.total);
    }
  }
  const todayDowAvg = dayPerf[dayOfWeek]
    ? dayPerf[dayOfWeek].reduce((a, b) => a + b, 0) / dayPerf[dayOfWeek].length
    : 0;
  const overallDayAvg = Object.values(dayPerf).flat().reduce((a, b) => a + b, 0) / (Object.values(dayPerf).flat().length || 1);
  const dayMultiplier = overallDayAvg > 0 ? todayDowAvg / overallDayAvg : 1;

  const catQty: Record<string, number> = {};
  for (const s of weekSalesArr) {
    for (const i of s.items) {
      const prod = activeProducts.find((p) => String(p.id) === String(i.productId));
      const cat = prod?.category ?? "General";
      catQty[cat] = (catQty[cat] ?? 0) + i.quantity;
    }
  }
  const topCategory = Object.entries(catQty).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "abarrotes";

  const todaySales = sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") === today);
  const cashSales = todaySales
    .filter((s) => s.payment === "efectivo" || s.payment === "cash" || !s.payment)
    .reduce((s, sl) => s + sl.total, 0);
  const todayOrdersRevenue = validOrders
    .filter((o) => (o.createdAt?.slice(0, 10) ?? "") === today)
    .reduce((s, o) => s + o.total, 0);

  const tasks: string[] = [];
  if (outOfStock.length > 0)
    tasks.push(`Reabastecer ${outOfStock.slice(0, 2).map((p) => p.name).join(" y ")} (stock agotado)`);
  if (pendingOrders.length > 0)
    tasks.push(`Atender ${pendingOrders.length} pedido${pendingOrders.length > 1 ? "s" : ""} pendiente${pendingOrders.length > 1 ? "s" : ""}`);
  if (criticalProducts.length > 0)
    tasks.push(`Pedir ${criticalProducts[0].name} — quedan ${criticalProducts[0].daysLeft} dias de stock`);
  if (inactiveLast30 > 5)
    tasks.push(`Contactar a ${inactiveLast30} clientes que no compran hace 30+ dias`);
  if (data.expenses.totalMonth && data.expenses.totalMonth > weekRevenue * 4)
    tasks.push("Revisar gastos del mes — superan el ritmo de ventas");
  tasks.push("Verificar stock de los 5 productos mas vendidos de la semana");
  tasks.push("Revisar el rendimiento de ventas al cierre de hoy");

  return {
    todayRevenue, yestRevenue, weekRevenue, prevWeekRevenue,
    todayTxns, yestTxns,
    outOfStock, lowStock, criticalProducts,
    pendingOrders: pendingOrders.length, pendingRevenue,
    inactiveLast30, dayMultiplier, topCategory,
    dayName: getDayName(), tasks: tasks.slice(0, 5),
    cashSales, todayOrdersRevenue,
    expensesToday: data.expenses.totalWeek ? Math.round(data.expenses.totalWeek / 7) : 0,
    overduePayables: data.alerts?.overduePayables ?? 0,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIDailyBriefing({ data }: Props) {
  const analysis = useMemo(() => analyzeBusiness(data), [data]);
  const { text: greeting, icon: GreetingIcon, period } = getGreeting();
  const calendar = useMemo(() => getCalendarContext(), []);

  // ── Speech ────────────────────────────────────────────────────────────────
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);

  const buildSpeechText = () => {
    if (!analysis) return "";
    const parts: string[] = [];
    parts.push(`${greeting}.`);
    if (analysis.todayRevenue > 0) {
      parts.push(`Hoy llevas ${analysis.todayRevenue.toFixed(0)} soles en ventas con ${analysis.todayTxns} transacciones.`);
      if (analysis.todayTxns > 0) {
        parts.push(`Tu ticket promedio es de ${(analysis.todayRevenue / analysis.todayTxns).toFixed(0)} soles.`);
      }
    } else {
      parts.push("Todavia no hay ventas registradas hoy.");
    }
    if (analysis.lowStock.length > 0) parts.push(`Tienes ${analysis.lowStock.length} productos con stock bajo.`);
    if (analysis.outOfStock.length > 0) parts.push(`${analysis.outOfStock.length} productos estan agotados.`);
    if (analysis.pendingOrders > 0) parts.push(`Hay ${analysis.pendingOrders} pedidos pendientes.`);
    parts.push(calendar.dayTip);
    return parts.join(" ");
  };

  const handleSpeech = () => {
    if (!speechSupported) return;
    if (isSpeaking) { speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const text = buildSpeechText();
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-PE";
    utterance.rate = 0.9;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    speechSynthesis.speak(utterance);
  };

  // ── Fiados state ──────────────────────────────────────────────────────────
  const [fiadosData, setFiadosData] = useState<FiadosData | null>(null);
  const [fiadosLoading, setFiadosLoading] = useState(true);

  const [calendarApi, setCalendarApi] = useState<{
    temporada?: string;
    esQuincena?: boolean;
    proximoFeriado?: { nombre: string; fecha: string; diasHasta: number; impactoNegocio?: string } | null;
    eventos?: { nombre: string; fecha: string; tipo: string; diasHasta: number; impactoNegocio?: string }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/fiados?status=ACTIVO")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: FiadosData) => setFiadosData(d))
      .catch(() => setFiadosData(null))
      .finally(() => setFiadosLoading(false));

    fetch("/api/ai-assistant/business-calendar")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCalendarApi(d))
      .catch(() => setCalendarApi(null));
  }, []);

  // ── Collapsible sections ──────────────────────────────────────────────────
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ── Day Score (hoisted before early-return so hooks order stays stable) ──
  const hasOverdueForScore = fiadosData?.fiados?.some((f) => f.dueDate && new Date(f.dueDate) < new Date()) ?? false;
  const dayScore = useMemo(
    () => (analysis ? computeDayScore(analysis, hasOverdueForScore) : null),
    [analysis, hasOverdueForScore]
  );

  if (!analysis || !dayScore) {
    return <BriefingCard><p className="text-gray-500 dark:text-gray-400 text-sm">Cargando datos del negocio...</p></BriefingCard>;
  }

  const revDelta = analysis.yestRevenue > 0 ? parseFloat(pct(analysis.todayRevenue, analysis.yestRevenue)) : 0;
  const weekDelta = analysis.prevWeekRevenue > 0 ? parseFloat(pct(analysis.weekRevenue, analysis.prevWeekRevenue)) : 0;

  const quincenaCompare = (() => {
    const day = new Date().getDate();
    if (!((day >= 1 && day <= 3) || (day >= 15 && day <= 17))) return null;
    if (!data) return null;
    const { orders, sales } = data;
    const now = new Date();
    const startCurrent = new Date(now);
    startCurrent.setDate(day >= 15 ? 15 : 1);
    const startPrev = new Date(startCurrent);
    startPrev.setDate(startPrev.getDate() - 15);
    const endPrev = new Date(startPrev);
    endPrev.setDate(endPrev.getDate() + 3);
    const rangeSum = (from: Date, to: Date) => {
      const f = from.toISOString().slice(0, 10);
      const t = to.toISOString().slice(0, 10);
      const o = orders.filter(x => x.status !== "cancelado" && (x.createdAt?.slice(0, 10) ?? "") >= f && (x.createdAt?.slice(0, 10) ?? "") <= t).reduce((s, x) => s + x.total, 0);
      const s = sales.filter(x => (x.createdAt?.slice(0, 10) ?? "") >= f && (x.createdAt?.slice(0, 10) ?? "") <= t).reduce((s2, x) => s2 + x.total, 0);
      return o + s;
    };
    const current = rangeSum(startCurrent, now);
    const prev = rangeSum(startPrev, endPrev);
    if (prev === 0 && current === 0) return null;
    const delta = prev > 0 ? ((current / prev - 1) * 100).toFixed(0) : "100";
    return { current, prev, delta: Number(delta), isUp: Number(delta) >= 0 };
  })();

  const TrendIcon = revDelta > 0 ? TrendingUp : revDelta < 0 ? TrendingDown : Minus;
  const trendColor = revDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : revDelta < 0 ? "text-red-500 dark:text-red-400" : "text-gray-500";

  const fiadosActive = fiadosData?.fiados?.length ?? 0;
  const fiadosTotal = fiadosData?.totalBalance ?? fiadosData?.fiados?.reduce((s, f) => s + (f.balance ?? 0), 0) ?? 0;
  const topDeudores = fiadosData?.fiados?.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0)).slice(0, 3) ?? [];
  const hasOverdue = fiadosData?.fiados?.some((f) => f.dueDate && new Date(f.dueDate) < new Date()) ?? false;

  const cashAvailable = analysis.cashSales - analysis.expensesToday;

  // ── Urgent items count ─────────────────────────────────────────────────────
  const urgentCount = analysis.outOfStock.length + (hasOverdue ? 1 : 0) + (analysis.pendingOrders > 5 ? 1 : 0);

  // ── WhatsApp share (plain function; no memoization needed after early return) ──
  const shareBriefingWhatsApp = () => {
    const lines = [
      `*Briefing ${new Date().toLocaleDateString("es-PE")}* — ${dayScore.label} (${dayScore.score}/10)`,
      "",
      `Ventas: ${fmt(analysis.todayRevenue)} (${analysis.todayTxns} txn)`,
      analysis.yestRevenue > 0 ? `  vs ayer: ${revDelta >= 0 ? "+" : ""}${revDelta.toFixed(1)}%` : "",
      `Semana: ${fmt(analysis.weekRevenue)}`,
      "",
    ];
    if (analysis.outOfStock.length > 0) lines.push(`[!] ${analysis.outOfStock.length} agotados`);
    if (analysis.lowStock.length > 0) lines.push(`[!] ${analysis.lowStock.length} stock bajo`);
    if (analysis.pendingOrders > 0) lines.push(`${analysis.pendingOrders} pedidos pendientes`);
    if (fiadosActive > 0) lines.push(`${fiadosActive} fiados: ${fmt(fiadosTotal)}`);
    lines.push("", `Caja: ${fmt(cashAvailable)}`);
    lines.push("", calendar.dayTip);

    const text = lines.filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const isQuincenaToday = calendarApi?.esQuincena ?? calendar.isQuincena;
  const seasonKey = calendarApi?.temporada ?? calendar.season;
  const DayContextIcon = isQuincenaToday ? DollarSign : calendar.isWeekend ? TrendingUp : calendar.isMonday ? CreditCard : Clock3;
  const dayContextLabel = isQuincenaToday ? "Quincena" : calendar.isWeekend ? "Fin de semana" : calendar.isMonday ? "Lunes" : "Hoy";
  const SeasonStatusIcon = seasonKey === "lluvias" ? CloudRain : seasonKey === "seca" ? Sun : CloudSun;
  const seasonBadge = seasonKey === "lluvias" ? "Lluvias" : seasonKey === "seca" ? "Seca" : "Transicion";

  return (
    <BriefingCard>
      {/* ── Day Score Banner ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200 dark:border-gray-700">
        <div className={cn("text-3xl font-black", dayScore.color)}>
          {dayScore.score}<span className="text-sm font-normal text-gray-400">/10</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-sm font-bold", dayScore.color)}>{dayScore.label}</span>
            {urgentCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 font-bold">
                {urgentCount} urgente{urgentCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {dayScore.factors.slice(0, 4).map((f, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                {f}
              </span>
            ))}
          </div>
        </div>
        {/* Score dot bar */}
        <div className="flex gap-0.5 shrink-0">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-4 rounded-full transition-colors",
                i < dayScore.score
                  ? dayScore.score >= 8 ? "bg-emerald-500" : dayScore.score >= 6 ? "bg-green-400" : dayScore.score >= 4 ? "bg-amber-400" : "bg-red-400"
                  : "bg-gray-200 dark:bg-gray-700"
              )}
            />
          ))}
        </div>
      </div>

      {/* ── Greeting + Voice + WhatsApp ──────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <GreetingIcon className="w-5 h-5 text-[#f97316]" />
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 flex-1">
          {greeting}, aqui esta tu resumen del dia
        </h2>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={shareBriefingWhatsApp}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors"
          >
            <Share2 className="w-3 h-3" />WA
          </button>
          {speechSupported && (
            <button
              onClick={handleSpeech}
              className={cn(
                "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors",
                isSpeaking
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                  : "bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 text-[#00B4A6] dark:text-emerald-400 hover:bg-[#00B4A6]/20"
              )}
            >
              {isSpeaking ? (
                <>
                  <span className="flex items-center gap-0.5">
                    <span className="w-1 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="w-1 h-4 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: "0.15s" }} />
                    <span className="w-1 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
                  </span>
                  Parar
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                  Escuchar
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Period-aware hint ─────────────────────────────────────────────── */}
      {period === "morning" && analysis.todayRevenue === 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 text-xs text-emerald-700 dark:text-emerald-300">
          <Sun className="w-3.5 h-3.5 shrink-0" /><span>Checklist de apertura: verifica caja, revisa stock critico, y atiende pedidos pendientes.</span>
        </div>
      )}
      {period === "afternoon" && analysis.todayTxns > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 text-xs text-amber-700 dark:text-amber-300">
          <Sunset className="w-3.5 h-3.5 shrink-0" /><span>Revisa como va el dia: llevas {analysis.todayTxns} transacciones y {fmt(analysis.todayRevenue)}. ¿Es buen ritmo para hoy?</span>
        </div>
      )}
      {period === "evening" && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/30 text-xs text-indigo-700 dark:text-indigo-300">
          <Moon className="w-3.5 h-3.5 shrink-0" /><span>Cierre del dia: cuadra la caja, revisa pedidos pendientes para manana, y registra gastos.</span>
        </div>
      )}

      {/* P1: Ventas */}
      <Section label="Ventas de hoy">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {analysis.todayRevenue > 0 ? (
            <>
              Llevas <strong className="text-gray-900 dark:text-gray-50">{fmt(analysis.todayRevenue)}</strong> en ventas con{" "}
              <strong>{analysis.todayTxns}</strong> transacciones.{" "}
              {analysis.yestRevenue > 0 && (
                <span className={cn("inline-flex items-center gap-0.5 font-medium text-xs", trendColor)}>
                  <TrendIcon className="w-3.5 h-3.5" />
                  {Math.abs(revDelta)}% {revDelta >= 0 ? "mas" : "menos"} que ayer ({fmt(analysis.yestRevenue)})
                </span>
              )}
              {". "}Semana acumulada: <strong>{fmt(analysis.weekRevenue)}</strong>
              {analysis.prevWeekRevenue > 0 && (
                <span className={cn("ml-1 text-xs font-medium", weekDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                  ({weekDelta > 0 ? "+" : ""}{weekDelta}% vs semana anterior)
                </span>
              )}
              .
            </>
          ) : (
            <>
              Todavia no hay ventas registradas hoy.{" "}
              {analysis.yestRevenue > 0 && <>Ayer cerraste con <strong>{fmt(analysis.yestRevenue)}</strong> en {analysis.yestTxns} transacciones.</>}
            </>
          )}
        </p>
      </Section>

      {quincenaCompare && (
        <div className="flex items-center gap-2 -mt-2 mb-3">
          <span className={cn(
            "text-xs font-bold px-2 py-1 rounded-lg",
            quincenaCompare.isUp
              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
          )}>
            vs quincena anterior: {quincenaCompare.isUp ? "↑" : "↓"} {quincenaCompare.isUp ? "+" : ""}{quincenaCompare.delta}%
          </span>
          <span className="text-[10px] text-gray-400">({fmt(quincenaCompare.prev)} → {fmt(quincenaCompare.current)})</span>
        </div>
      )}

      {/* P2: Alertas */}
      <Section label="Alertas">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {analysis.outOfStock.length === 0 && analysis.lowStock.length === 0 && analysis.pendingOrders === 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              Sin alertas criticas por ahora. El inventario y los pedidos estan bajo control.
            </span>
          ) : (
            <>
              {analysis.outOfStock.length > 0 && (
                <>
                  <strong className="text-red-600 dark:text-red-400">
                    {analysis.outOfStock.length} producto{analysis.outOfStock.length > 1 ? "s" : ""} agotado{analysis.outOfStock.length > 1 ? "s" : ""}
                  </strong>
                  {": "}{analysis.outOfStock.slice(0, 3).map((p) => p.name).join(", ")}
                  {analysis.outOfStock.length > 3 && ` y ${analysis.outOfStock.length - 3} mas`}.{" "}
                </>
              )}
              {analysis.criticalProducts.length > 0 && (
                <>
                  {analysis.criticalProducts.map((p) => (
                    <span key={p.name}>
                      <strong>{p.name}</strong> se acaba en aproximadamente{" "}
                      <strong className="text-amber-600 dark:text-amber-400">{p.daysLeft} dia{p.daysLeft !== 1 ? "s" : ""}</strong>.{" "}
                    </span>
                  ))}
                </>
              )}
              {analysis.pendingOrders > 0 && (
                <>
                  Tienes <strong className="text-amber-600 dark:text-amber-400">{analysis.pendingOrders} pedido{analysis.pendingOrders > 1 ? "s" : ""} pendiente{analysis.pendingOrders > 1 ? "s" : ""}</strong>
                  {analysis.pendingRevenue > 0 && <> por un total de <strong>{fmt(analysis.pendingRevenue)}</strong></>}.{" "}
                </>
              )}
            </>
          )}
        </p>
      </Section>

      {/* P3: Oportunidades */}
      <Section label="Oportunidades de hoy">
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {analysis.dayMultiplier >= 1.1 ? (
            <>
              Hoy es <strong>{analysis.dayName}</strong> — historicamente uno de tus mejores dias, con ventas{" "}
              <strong className="text-emerald-600 dark:text-emerald-400">{((analysis.dayMultiplier - 1) * 100).toFixed(0)}% por encima del promedio</strong>.
              Asegurate de tener stock suficiente en <strong>{analysis.topCategory}</strong>.{" "}
            </>
          ) : analysis.dayMultiplier < 0.9 ? (
            <>
              Hoy es <strong>{analysis.dayName}</strong>, tipicamente mas tranquilo que otros dias.
              Buen momento para ordenar inventario, revisar precios o planificar pedidos a proveedores.{" "}
            </>
          ) : (
            <>
              Hoy es <strong>{analysis.dayName}</strong>, con un ritmo de ventas promedio esperado.
              Concentra esfuerzos en <strong>{analysis.topCategory}</strong>, tu categoria mas activa esta semana.{" "}
            </>
          )}
          {analysis.inactiveLast30 > 5 && (
            <>
              Hay <strong>{analysis.inactiveLast30} clientes</strong> que no compran hace 30+ dias — un descuento de fidelidad podria reactivarlos.
            </>
          )}
        </p>
      </Section>

      {/* P4: Tareas */}
      <Section label="Acciones para hoy">
        <ol className="flex flex-col gap-1.5">
          {analysis.tasks.map((task, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 text-[#00B4A6] dark:text-[#2dd4bf] text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              {task}
            </li>
          ))}
        </ol>
      </Section>

      {/* P5: Fiados Pendientes — collapsible */}
      <CollapsibleSection
        id="fiados"
        label="Fiados Pendientes"
        collapsed={collapsedSections["fiados"] ?? false}
        onToggle={toggleSection}
        badge={fiadosActive > 0 ? `${fiadosActive}` : undefined}
        badgeColor={hasOverdue ? "red" : fiadosActive > 0 ? "amber" : "green"}
      >
        <div className={cn(
          "rounded-lg border p-3",
          hasOverdue
            ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40"
            : fiadosActive > 0
              ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
              : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className={cn(
              "w-4 h-4",
              hasOverdue ? "text-red-600 dark:text-red-400" : fiadosActive > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
            )} />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {fiadosLoading ? "Cargando fiados..." : fiadosActive === 0 ? "Sin fiados pendientes" : `${fiadosActive} fiado${fiadosActive > 1 ? "s" : ""} activo${fiadosActive > 1 ? "s" : ""}`}
            </span>
            {hasOverdue && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600 text-white">Vencidos</span>
            )}
          </div>
          {!fiadosLoading && fiadosActive > 0 && (
            <>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1.5">
                {fmt(fiadosTotal)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">por cobrar</span>
              </p>
              {topDeudores.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Top deudores</span>
                  {topDeudores.map((d, i) => (
                    <div key={d.id ?? i} className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
                      <span>{d.customerName ?? "Cliente"}</span>
                      <span className="font-medium">{fmt(d.balance ?? 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {!fiadosLoading && fiadosActive === 0 && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Todos los fiados estan al dia. Excelente gestion de cobranza.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* P6: Flujo de Caja */}
      <Section label="Flujo de Caja">
        <div className="rounded-lg border bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Caja del Dia</span>
          </div>
          <p className={cn("text-2xl font-bold mb-2", cashAvailable >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {fmt(cashAvailable)}
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-1">efectivo disponible</span>
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-md p-1.5">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Efectivo</p>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{fmt(analysis.cashSales)}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-md p-1.5">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Por cobrar</p>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{fmt(fiadosTotal)}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/20 rounded-md p-1.5">
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Gastos</p>
              <p className="text-sm font-bold text-red-700 dark:text-red-300">{fmt(analysis.expensesToday)}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* P7: Deudas con Proveedores */}
      <Section label="Deudas con Proveedores">
        <div className={cn(
          "rounded-lg border p-3 flex items-center gap-3",
          analysis.overduePayables > 0
            ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40"
            : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
        )}>
          <AlertTriangle className={cn("w-5 h-5 shrink-0", analysis.overduePayables > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")} />
          <div>
            {analysis.overduePayables > 0 ? (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-red-600 text-white mb-1">
                  {analysis.overduePayables} factura{analysis.overduePayables > 1 ? "s" : ""} vencida{analysis.overduePayables > 1 ? "s" : ""}
                </span>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">Pagar a tiempo evita corte de credito con proveedores y cargos por mora.</p>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">Al dia con proveedores</span>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">No hay facturas vencidas. Buen historial de pago.</p>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* P8: Contexto del Dia — collapsible */}
      <CollapsibleSection
        id="contexto"
        label="Contexto del Dia"
        collapsed={collapsedSections["contexto"] ?? false}
        onToggle={toggleSection}
      >
        <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <DayContextIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {dayContextLabel}
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">{calendar.dayTip}</span>
            </div>
            <div className="flex items-center gap-2">
              <SeasonStatusIcon className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
              <span className="inline-flex items-center rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {seasonBadge}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{calendar.seasonLabel}</span>
            </div>
            {(calendarApi?.proximoFeriado ?? calendar.nearHoliday) && (
              <div className="flex items-center gap-2 mt-0.5">
                <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {calendarApi?.proximoFeriado
                    ? <>Feriado proximo: {calendarApi.proximoFeriado.nombre} (en {calendarApi.proximoFeriado.diasHasta} dia{calendarApi.proximoFeriado.diasHasta !== 1 ? "s" : ""}){calendarApi.proximoFeriado.impactoNegocio ? ` — ${calendarApi.proximoFeriado.impactoNegocio}` : " — prepara stock extra"}</>
                    : <>Feriado proximo: {calendar.nearHoliday!.name} ({calendar.nearHoliday!.date}) — prepara stock extra</>
                  }
                </span>
              </div>
            )}
            {calendarApi?.eventos && calendarApi.eventos.length > 0 && (
              <div className="flex flex-col gap-1 mt-1 pt-1.5 border-t border-emerald-200/50 dark:border-emerald-800/30">
                <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-semibold">Proximos eventos</span>
                {calendarApi.eventos.slice(0, 3).map((ev, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                      {ev.diasHasta === 0 ? "Hoy" : `${ev.diasHasta}d`}
                    </span>
                    <span>{ev.nombre}</span>
                    {ev.impactoNegocio && <span className="text-emerald-500 dark:text-emerald-400 text-[10px]">({ev.impactoNegocio})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* P9: Prediccion de hoy */}
      <Section label="Prediccion de hoy">
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <p>
            Hoy es <strong>{analysis.dayName}</strong>.{" "}
            {analysis.dayMultiplier >= 1.1 ? (
              <>Normalmente vendes <strong className="text-emerald-600 dark:text-emerald-400">{((analysis.dayMultiplier) * 100).toFixed(0)}%</strong> del promedio diario.{" "}
              <span className="block mt-1 text-xs text-emerald-600 dark:text-emerald-400">Dia fuerte — asegura stock y personal</span></>
            ) : analysis.dayMultiplier < 0.9 ? (
              <>Las ventas suelen ser mas bajas (aprox. <strong>{(analysis.dayMultiplier * 100).toFixed(0)}%</strong> del promedio).{" "}
              <span className="block mt-1 text-xs text-emerald-600 dark:text-emerald-400">Dia tranquilo — buen momento para inventario o limpieza</span></>
            ) : (
              <>Ventas esperadas al ritmo promedio.{" "}</>
            )}
            Prepara stock de: <strong>{analysis.topCategory}</strong>.
          </p>
        </div>
      </Section>

      {/* P10: Clima y Ventas — collapsible */}
      <CollapsibleSection
        id="clima"
        label="Clima y Ventas"
        collapsed={collapsedSections["clima"] ?? false}
        onToggle={toggleSection}
      >
        {(() => {
          const month = new Date().getMonth() + 1;
          const isLluvias = month >= 11 || month <= 3;
          const isSeca = month >= 6 && month <= 9;
          const SeasonPanelIcon = isLluvias ? CloudRain : isSeca ? Sun : CloudSun;
          const prodLluvias = ["sopa", "chocolate", "paraguas", "bota", "imperme", "atun", "conserva", "enlatado"];
          const prodSeca = ["helado", "gaseosa", "refresco", "bebida", "agua", "bloqueador", "cerveza", "jugo"];
          const temporadaProds = isLluvias ? prodLluvias : isSeca ? prodSeca : [...prodLluvias, ...prodSeca];
          const productsArr = data?.products ?? [];
          const lowStockTemporada = productsArr.filter(p => {
            const nameLC = p.name.toLowerCase();
            const isTemporada = temporadaProds.some(t => nameLC.includes(t));
            return isTemporada && p.stock != null && p.stock > 0 && p.stock <= (p.stockMin ?? 5);
          });

          return (
            <div className="rounded-lg border p-3" style={{ background: isLluvias ? "linear-gradient(135deg, #dbeafe, #e0f2fe)" : isSeca ? "linear-gradient(135deg, #fef3c7, #fef9c3)" : "linear-gradient(135deg, #f0f9ff, #fef9c3)" }}>
              <div className="flex items-center gap-2 mb-2">
                <SeasonPanelIcon className="h-5 w-5 text-gray-700" />
                <span className="text-sm font-semibold text-gray-800">{isLluvias ? "Temporada de lluvias" : isSeca ? "Temporada seca" : "Temporada de transicion"}</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-700">
                {isLluvias && (
                  <>
                    <p><span className="font-bold text-emerald-700">Productos que suben:</span> sopas, chocolate, paraguas, botas, enlatados</p>
                    <p><span className="font-bold text-red-600">Productos que bajan:</span> helados, bebidas frias, refrescos</p>
                  </>
                )}
                {isSeca && (
                  <>
                    <p><span className="font-bold text-amber-700">Productos que suben:</span> bebidas frias, helados, bloqueador, cervezas, jugos</p>
                    <p><span className="font-bold text-emerald-600">Productos que bajan:</span> sopas, chocolate caliente</p>
                  </>
                )}
                {!isLluvias && !isSeca && (
                  <p><span className="font-bold text-gray-600">Transicion:</span> prepara stock de ambas temporadas — la demanda es variable</p>
                )}
              </div>
              {lowStockTemporada.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-gray-300/30 space-y-1">
                  {lowStockTemporada.slice(0, 3).map(p => (
                    <p key={p.id} className="text-xs font-bold text-red-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" />{p.name}: solo {p.stock} unidades (temporada alta)
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </CollapsibleSection>

      {/* P11: vs Mes pasado — collapsible */}
      {(() => {
        if (!data) return null;
        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const todayStr = now.toISOString().slice(0, 10);
        const dayOfMonth = now.getDate();
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
        const prevMonthCutoff = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth).toISOString().slice(0, 10);
        const sumRange = (from: string, to: string) => {
          const o = data.orders.filter(x => x.status !== "cancelado" && (x.createdAt?.slice(0, 10) ?? "") >= from && (x.createdAt?.slice(0, 10) ?? "") <= to).reduce((s, x) => s + x.total, 0);
          const s = data.sales.filter(x => (x.createdAt?.slice(0, 10) ?? "") >= from && (x.createdAt?.slice(0, 10) ?? "") <= to).reduce((s2, x) => s2 + x.total, 0);
          return o + s;
        };
        const thisMonth = sumRange(thisMonthStart, todayStr);
        const prevMonth = sumRange(prevMonthStart, prevMonthCutoff);
        if (thisMonth === 0 && prevMonth === 0) return null;
        const delta = prevMonth > 0 ? ((thisMonth / prevMonth - 1) * 100).toFixed(0) : "100";
        const isUp = Number(delta) >= 0;
        return (
          <CollapsibleSection
            id="vs-mes"
            label="vs Mes pasado"
            collapsed={collapsedSections["vs-mes"] ?? false}
            onToggle={toggleSection}
            badge={`${isUp ? "+" : ""}${delta}%`}
            badgeColor={isUp ? "green" : "red"}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 text-center">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Ventas</p>
                <p className="text-sm font-bold text-gray-900 dark:text-gray-50">{fmt(thisMonth)}</p>
                <p className={cn("text-xs font-semibold", isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                  {isUp ? "+" : ""}{delta}% {isUp ? "↑" : "↓"} vs {fmt(prevMonth)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 text-center">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Clientes</p>
                {(() => {
                  const thisC = new Set([...data.orders.filter(o => o.status !== "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= thisMonthStart).map(o => o.customer?.phone).filter(Boolean)]).size;
                  const prevC = new Set([...data.orders.filter(o => o.status !== "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= prevMonthStart && (o.createdAt?.slice(0, 10) ?? "") <= prevMonthCutoff).map(o => o.customer?.phone).filter(Boolean)]).size;
                  const cDelta = prevC > 0 ? ((thisC / prevC - 1) * 100).toFixed(0) : "0";
                  return (<>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-50">{thisC}</p>
                    <p className={cn("text-xs font-semibold", Number(cDelta) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>{Number(cDelta) >= 0 ? "+" : ""}{cDelta}% {Number(cDelta) >= 0 ? "↑" : "↓"}</p>
                  </>);
                })()}
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 text-center">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">Transacciones</p>
                {(() => {
                  const thisT = data.orders.filter(o => o.status !== "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= thisMonthStart).length + data.sales.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= thisMonthStart).length;
                  const prevT = data.orders.filter(o => o.status !== "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= prevMonthStart && (o.createdAt?.slice(0, 10) ?? "") <= prevMonthCutoff).length + data.sales.filter(s => (s.createdAt?.slice(0, 10) ?? "") >= prevMonthStart && (s.createdAt?.slice(0, 10) ?? "") <= prevMonthCutoff).length;
                  const tDelta = prevT > 0 ? ((thisT / prevT - 1) * 100).toFixed(0) : "0";
                  return (<>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-50">{thisT}</p>
                    <p className={cn("text-xs font-semibold", Number(tDelta) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>{Number(tDelta) >= 0 ? "+" : ""}{tDelta}% {Number(tDelta) >= 0 ? "↑" : "↓"}</p>
                  </>);
                })()}
              </div>
            </div>
          </CollapsibleSection>
        );
      })()}

      {/* P12: Tip del dia */}
      <Section label="Tip del dia">
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 p-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {(() => {
              const TIPS_DIA: Record<number, string> = {
                0: "Domingo: revisa el reporte semanal y planifica la proxima semana",
                1: "Lunes: verifica el stock y crea ordenes de compra para la semana",
                2: "Martes: contacta clientes con fiados vencidos — inicio de semana es buen momento",
                3: "Miercoles: revisa los margenes — mitad de semana, buen momento para ajustar precios",
                4: "Jueves: prepara ofertas de fin de semana — los clientes planifican el viernes",
                5: "Viernes: dia fuerte de ventas — asegura stock de los productos top",
                6: "Sabado: dia de mayor venta — toda la atencion al POS y delivery",
              };
              const dow = new Date().getDay();
              const baseTip = TIPS_DIA[dow] ?? "Revisa tus metricas diarias";
              const contextual = analysis.dayMultiplier >= 1.15
                ? ` Tus ${analysis.dayName}s venden ${((analysis.dayMultiplier - 1) * 100).toFixed(0)}% mas del promedio.`
                : "";
              return baseTip + contextual;
            })()}
          </p>
        </div>
      </Section>

      {/* Tarea sugerida del dia */}
      <DailyTaskCard />
    </BriefingCard>
  );
}

// ── Tarea del dia ──────────────────────────────────────────────────────────────

const TAREAS_DIA: Record<number, { tarea: string; detalle: string; icono: React.ElementType }> = {
  1: { tarea: "Revisar stock", detalle: "Lunes: revisa productos bajo stock y crea OC", icono: Package },
  2: { tarea: "Cobrar fiados", detalle: "Martes: contacta deudores con mas de 7 dias", icono: DollarSign },
  3: { tarea: "Revisar precios", detalle: "Miercoles: compara precios con la competencia", icono: Tags },
  4: { tarea: "Contactar clientes", detalle: "Jueves: envia mensaje a clientes inactivos", icono: Users },
  5: { tarea: "Cuadrar la caja", detalle: "Viernes: haz arqueo completo y cierre semanal", icono: ReceiptText },
  6: { tarea: "Preparar ofertas", detalle: "Sabado: crea promociones para el fin de semana", icono: Star },
  0: { tarea: "Revisar la semana", detalle: "Domingo: revisa el reporte semanal y planifica", icono: BarChart3 },
};

function DailyTaskCard() {
  const dow = new Date().getDay();
  const task = TAREAS_DIA[dow];
  const TaskIcon = task?.icono;
  const storageKey = `daily-task-${new Date().toISOString().slice(0, 10)}`;
  const [done, setDone] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });

  const toggleDone = () => {
    const next = !done;
    setDone(next);
    try { next ? localStorage.setItem(storageKey, "1") : localStorage.removeItem(storageKey); } catch { /* silent */ }
  };

  if (!task) return null;
  return (
    <Section label="Tarea sugerida del dia">
      <div className={cn(
        "rounded-lg border p-3 flex items-start gap-3 transition-colors",
        done
          ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
          : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40"
      )}>
        <button
          onClick={toggleDone}
          className={cn(
            "mt-0.5 shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            done
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-white/80 text-amber-700 dark:bg-gray-900/40 dark:text-amber-300"
          )}
          aria-label={done ? "Desmarcar tarea" : "Marcar como hecha"}
        >
          {done ? <CheckCircle2 className="h-5 w-5" /> : TaskIcon ? <TaskIcon className="h-4 w-4" /> : null}
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", done ? "text-emerald-700 dark:text-emerald-400 line-through" : "text-gray-800 dark:text-gray-200")}>
            {task.tarea}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{done ? "Tarea completada" : task.detalle}</p>
        </div>
      </div>
    </Section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BriefingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ">
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-[#00B4A6] dark:text-[#2dd4bf] mb-1.5">{label}</h3>
      {children}
    </div>
  );
}

function CollapsibleSection({
  id, label, children, collapsed, onToggle, badge, badgeColor,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: (id: string) => void;
  badge?: string;
  badgeColor?: "red" | "amber" | "green";
}) {
  const colors = {
    red: "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    amber: "bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
    green: "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
  };
  return (
    <div className="mb-4">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between group mb-1.5"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-[#00B4A6] dark:text-[#2dd4bf]">{label}</h3>
          {badge && (
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", colors[badgeColor ?? "green"])}>
              {badge}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
        )}
      </button>
      {!collapsed && children}
    </div>
  );
}