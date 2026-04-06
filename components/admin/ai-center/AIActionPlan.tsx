"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  MessageCircle,
  RotateCcw,
  Star,
  Target,
  Zap,
  Timer,
  TrendingUp,
  Focus,
  Users,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Flame,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

/* ── Types ── */
type Priority = "urgente" | "importante" | "recomendado";
interface PlanTask {
  id: string;
  action: string;
  impact: string;
  priority: Priority;
  category?: string;
  done: boolean;
  completedAt?: number;
  estimatedMinutes: number;
  roiEstimate?: string;
  delegateTo?: string;
  dependsOn?: string;
  startedAt?: number;
}
interface RecurringTask {
  id: string;
  action: string;
  dayLabel: string;
  done: boolean;
  completedAt?: number;
  estimatedMinutes: number;
}

/* ── Priority Config ── */
const PRIORITY_CONFIG: Record<Priority, { label: string; icon: typeof AlertTriangle; color: string; bg: string; border: string }> = {
  urgente: {
    label: "Urgente",
    icon: AlertTriangle,
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800/40",
  },
  importante: {
    label: "Importante",
    icon: Star,
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800/40",
  },
  recomendado: {
    label: "Recomendado",
    icon: Target,
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800/40",
  },
};

/* ── Time Slots ── */
interface TimeSlot {
  label: string;
  keywords: string[];
  icon: string;
  description: string;
}

function getCurrentTimeSlot(): TimeSlot {
  const h = new Date().getHours();
  if (h < 9)
    return { label: "Apertura", keywords: ["apertura", "stock", "inventario", "caducidad", "vencimiento"], icon: "🌅", description: "Revisar inventario y preparar el día" };
  if (h < 13)
    return { label: "Ventas", keywords: ["venta", "cliente", "pedido", "whatsapp", "promocion"], icon: "🛒", description: "Hora punta de ventas" };
  if (h < 15)
    return { label: "Control", keywords: ["reporte", "control", "merma", "ajuste", "inventario"], icon: "📊", description: "Revisión y ajustes de mediodía" };
  if (h < 18)
    return { label: "Cobros", keywords: ["fiado", "cobro", "deuda", "pago", "transferencia"], icon: "💰", description: "Gestión de cobranzas" };
  return { label: "Cierre", keywords: ["cierre", "caja", "corte", "reporte", "resumen"], icon: "🌙", description: "Cierre del día y planificación" };
}

function matchesTimeSlot(action: string, slot: TimeSlot): boolean {
  const lower = action.toLowerCase();
  return slot.keywords.some((kw) => lower.includes(kw));
}

/* ── Plan Generator ── */
function generatePlan(data: BusinessData): PlanTask[] {
  const tasks: PlanTask[] = [];
  const today = new Date().toLocaleDateString("es-PE");
  let seq = 0;
  const mkId = (prefix: string) => `${prefix}-${today}-${seq++}`;

  // Products with low stock
  const lowStock = data.products.filter((p) => p.stock !== undefined && p.stock <= (p.stockMin ?? 5));
  if (lowStock.length > 0) {
    const critical = lowStock.filter((p) => (p.stock ?? 0) === 0);
    const low = lowStock.filter((p) => (p.stock ?? 0) > 0);

    if (critical.length > 0) {
      tasks.push({
        id: mkId("stock-crit"),
        action: `Reabastecer YA ${critical.length} producto(s) agotados: ${critical.slice(0, 3).map((p) => p.name).join(", ")}${critical.length > 3 ? "..." : ""}`,
        impact: `Cada hora sin stock pierde ~S/${(critical.length * 15).toFixed(0)} en ventas potenciales`,
        priority: "urgente",
        category: "inventario",
        done: false,
        estimatedMinutes: 30,
        roiEstimate: `+S/${(critical.length * 50).toFixed(0)}/día`,
        delegateTo: "Encargado de almacén",
      });
    }
    if (low.length > 0) {
      tasks.push({
        id: mkId("stock-low"),
        action: `Verificar ${low.length} producto(s) con stock bajo y hacer pedido a proveedor`,
        impact: `Evitar desabastecimiento en 1-2 días`,
        priority: "importante",
        category: "inventario",
        done: false,
        estimatedMinutes: 20,
        roiEstimate: `Previene S/${(low.length * 30).toFixed(0)} en ventas perdidas`,
        delegateTo: "Compras",
      });
    }
  }

  // Expired / expiring batches
  const expBatches = data.products.filter((p) => {
    if (!p.expiresAt) return false;
    const exp = new Date(p.expiresAt);
    const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86400000);
    return daysLeft <= 7;
  });

  const alreadyExpired = expBatches.filter((p) => new Date(p.expiresAt!).getTime() < Date.now());
  const expiringSoon = expBatches.filter((p) => new Date(p.expiresAt!).getTime() >= Date.now());

  if (alreadyExpired.length > 0) {
    tasks.push({
      id: mkId("exp-now"),
      action: `Retirar ${alreadyExpired.length} producto(s) vencidos de estante`,
      impact: `Riesgo sanitario y legal — registrar como merma`,
      priority: "urgente",
      category: "inventario",
      done: false,
      estimatedMinutes: 15,
      delegateTo: "Personal de piso",
    });
  }
  if (expiringSoon.length > 0) {
    const potentialLoss = expiringSoon.reduce((sum, p) => sum + (p.price ?? 0) * (p.stock ?? 1), 0);
    tasks.push({
      id: mkId("exp-soon"),
      action: `Aplicar descuento a ${expiringSoon.length} producto(s) por vencer esta semana`,
      impact: `Recuperar hasta S/${potentialLoss.toFixed(0)} antes de que venzan`,
      priority: "urgente",
      category: "ventas",
      done: false,
      estimatedMinutes: 15,
      roiEstimate: `Recupera ~S/${(potentialLoss * 0.6).toFixed(0)}`,
      dependsOn: alreadyExpired.length > 0 ? "Retirar productos vencidos primero" : undefined,
    });
  }

  // Pending orders
  const pending = data.orders.filter((o) => o.status === "PENDING" || o.status === "PROCESSING");
  if (pending.length > 0) {
    const oldPending = pending.filter((o) => {
      const age = Date.now() - new Date(o.createdAt).getTime();
      return age > 24 * 60 * 60 * 1000;
    });
    tasks.push({
      id: mkId("orders-pending"),
      action: `Procesar ${pending.length} pedido(s) pendiente(s)${oldPending.length > 0 ? ` (${oldPending.length} con más de 24h)` : ""}`,
      impact: `Clientes esperando — cada hora de retraso reduce probabilidad de recompra`,
      priority: oldPending.length > 0 ? "urgente" : "importante",
      category: "ventas",
      done: false,
      estimatedMinutes: Math.max(10, pending.length * 5),
      roiEstimate: `Retiene ~${pending.length} cliente(s)`,
      delegateTo: "Despachador",
    });
  }

  // Fiados (debts)
  const fiados = data.orders.filter((o) => o.status === "FIADO" || (o as Record<string, unknown>).paymentMethod === "FIADO");
  if (fiados.length > 0) {
    const totalDebt = fiados.reduce((s, o) => s + (o.total ?? 0), 0);
    const oldFiados = fiados.filter((o) => {
      const age = Date.now() - new Date(o.createdAt).getTime();
      return age > 15 * 24 * 60 * 60 * 1000;
    });
    tasks.push({
      id: mkId("fiados"),
      action: `Cobrar ${fiados.length} fiados pendientes (S/${totalDebt.toFixed(0)})${oldFiados.length > 0 ? ` — ${oldFiados.length} con +15 días` : ""}`,
      impact: `S/${totalDebt.toFixed(0)} en cuentas por cobrar — recuperar al menos 30%`,
      priority: oldFiados.length > 0 ? "urgente" : "importante",
      category: "cobranza",
      done: false,
      estimatedMinutes: Math.max(15, fiados.length * 3),
      roiEstimate: `Recupera ~S/${(totalDebt * 0.3).toFixed(0)}`,
      delegateTo: "Cajero/Cobrador",
    });
  }

  // Low margin products being sold a lot
  const lowMargin = data.products.filter((p) => {
    if (!p.price || !p.cost) return false;
    const margin = ((p.price - p.cost) / p.price) * 100;
    return margin < 15 && margin > 0;
  });
  if (lowMargin.length > 0) {
    tasks.push({
      id: mkId("margin"),
      action: `Revisar precios de ${lowMargin.length} producto(s) con margen menor a 15%`,
      impact: `Ajustar precios puede mejorar la rentabilidad global`,
      priority: "importante",
      category: "precios",
      done: false,
      estimatedMinutes: 20,
      roiEstimate: `+2-5% margen promedio`,
    });
  }

  // Sales decline detection
  if (data.sales.length > 14) {
    const lastWeek = data.sales.filter((s) => {
      const age = Date.now() - new Date(s.date ?? s.createdAt).getTime();
      return age <= 7 * 86400000;
    });
    const prevWeek = data.sales.filter((s) => {
      const age = Date.now() - new Date(s.date ?? s.createdAt).getTime();
      return age > 7 * 86400000 && age <= 14 * 86400000;
    });
    const lastTotal = lastWeek.reduce((s, o) => s + (o.total ?? 0), 0);
    const prevTotal = prevWeek.reduce((s, o) => s + (o.total ?? 0), 0);
    if (prevTotal > 0 && lastTotal < prevTotal * 0.8) {
      const drop = (((prevTotal - lastTotal) / prevTotal) * 100).toFixed(0);
      tasks.push({
        id: mkId("decline"),
        action: `Investigar caída de ventas (-${drop}% vs semana anterior)`,
        impact: `Ventas bajaron de S/${prevTotal.toFixed(0)} a S/${lastTotal.toFixed(0)}`,
        priority: "importante",
        category: "ventas",
        done: false,
        estimatedMinutes: 30,
        roiEstimate: `Identificar causa para revertir caída`,
      });
    }
  }

  // Customer engagement
  const inactiveCustomers = data.customers.filter((c) => {
    const lastOrder = (c as Record<string, unknown>).lastOrderDate ?? (c as Record<string, unknown>).updatedAt;
    if (!lastOrder) return false;
    const days = (Date.now() - new Date(lastOrder as string).getTime()) / 86400000;
    return days > 30;
  });
  if (inactiveCustomers.length >= 3) {
    tasks.push({
      id: mkId("reactivate"),
      action: `Contactar ${inactiveCustomers.length} cliente(s) inactivos (+30 días sin comprar)`,
      impact: `Clientes regulares que dejaron de comprar — oportunidad de reactivación`,
      priority: "recomendado",
      category: "clientes",
      done: false,
      estimatedMinutes: Math.max(15, inactiveCustomers.length * 2),
      roiEstimate: `Recupera ~${Math.min(inactiveCustomers.length, 5)} clientes`,
      delegateTo: "Vendedor",
    });
  }

  // Top product promotion
  const topProducts = [...data.products]
    .filter((p) => (p.stock ?? 0) > 20)
    .sort((a, b) => {
      const marginA = a.price && a.cost ? (a.price - a.cost) / a.price : 0;
      const marginB = b.price && b.cost ? (b.price - b.cost) / b.price : 0;
      return marginB - marginA;
    })
    .slice(0, 3);

  if (topProducts.length > 0) {
    tasks.push({
      id: mkId("promo"),
      action: `Promover productos de alto margen con stock: ${topProducts.map((p) => p.name).join(", ")}`,
      impact: `Estos productos tienen el mejor margen y stock suficiente`,
      priority: "recomendado",
      category: "ventas",
      done: false,
      estimatedMinutes: 15,
      roiEstimate: `+10-20% ventas en estas categorías`,
      delegateTo: "Vendedor de piso",
    });
  }

  // Sort: urgente first, then by estimatedMinutes (quick wins first within same priority)
  const priorityOrder: Record<Priority, number> = { urgente: 0, importante: 1, recomendado: 2 };
  tasks.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.estimatedMinutes - b.estimatedMinutes;
  });

  return tasks;
}

/* ── Recurring Tasks ── */
function getRecurringTasks(): RecurringTask[] {
  const dow = new Date().getDay();
  const tasks: RecurringTask[] = [
    { id: "rec-stock-check", action: "Verificar productos de alta rotación en estantes", dayLabel: "Todos los días", done: false, estimatedMinutes: 10 },
    { id: "rec-expiry-check", action: "Revisar fechas de vencimiento del refrigerador", dayLabel: "Todos los días", done: false, estimatedMinutes: 10 },
    { id: "rec-cash-count", action: "Cuadrar caja y registrar cierre", dayLabel: "Todos los días", done: false, estimatedMinutes: 15 },
  ];
  if (dow === 1) {
    tasks.push({ id: "rec-inventory-full", action: "Inventario completo semanal", dayLabel: "Lunes", done: false, estimatedMinutes: 60 });
    tasks.push({ id: "rec-supplier-orders", action: "Revisar y enviar pedidos a proveedores", dayLabel: "Lunes", done: false, estimatedMinutes: 30 });
  }
  if (dow === 5) {
    tasks.push({ id: "rec-promo-plan", action: "Planificar promociones del fin de semana", dayLabel: "Viernes", done: false, estimatedMinutes: 20 });
  }
  if (dow === 6 || dow === 0) {
    tasks.push({ id: "rec-weekend-stock", action: "Reforzar stock de productos de fin de semana", dayLabel: "Sáb/Dom", done: false, estimatedMinutes: 20 });
  }
  return tasks;
}

/* ── WhatsApp Export ── */
function generateWhatsAppPlan(tasks: PlanTask[], recurring: RecurringTask[], streak: number): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
  let msg = `📋 *Plan del día — ${dateStr}*\n`;
  if (streak > 0) msg += `🔥 Racha: ${streak} día(s) consecutivos\n`;
  msg += "\n";

  const totalTime = tasks.reduce((s, t) => s + t.estimatedMinutes, 0);
  const doneCount = tasks.filter((t) => t.done).length;
  msg += `📊 ${doneCount}/${tasks.length} tareas (⏱ ~${totalTime} min estimados)\n\n`;

  const grouped: Record<Priority, PlanTask[]> = { urgente: [], importante: [], recomendado: [] };
  tasks.forEach((t) => grouped[t.priority].push(t));

  const icons: Record<Priority, string> = { urgente: "🔴", importante: "🟡", recomendado: "🔵" };
  for (const p of ["urgente", "importante", "recomendado"] as Priority[]) {
    const grp = grouped[p];
    if (grp.length === 0) continue;
    msg += `${icons[p]} *${PRIORITY_CONFIG[p].label}*\n`;
    grp.forEach((t) => {
      msg += `${t.done ? "✅" : "⬜"} ${t.action} (⏱${t.estimatedMinutes}min)`;
      if (t.roiEstimate) msg += ` → ${t.roiEstimate}`;
      msg += "\n";
    });
    msg += "\n";
  }

  if (recurring.length > 0) {
    msg += "🔄 *Recurrentes*\n";
    recurring.forEach((t) => {
      msg += `${t.done ? "✅" : "⬜"} ${t.action}\n`;
    });
  }

  return msg;
}

/* ── Helpers ── */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function getDayKey(): string {
  return `ai-plan-${new Date().toISOString().slice(0, 10)}`;
}
function getWeekKey(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `ai-plan-week-${d.getFullYear()}-W${week}`;
}
function getStreakKey(): string {
  return "ai-plan-streak";
}

/* ── Component ── */
export default function AIActionPlan({ data }: { data: BusinessData }) {
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [recurring, setRecurring] = useState<RecurringTask[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [showDelegation, setShowDelegation] = useState(false);
  const [streak, setStreak] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const timeSlot = useMemo(() => getCurrentTimeSlot(), []);

  // Load tasks + restore state from localStorage
  useEffect(() => {
    const dayKey = getDayKey();
    const fresh = generatePlan(data);
    const recTasks = getRecurringTasks();

    try {
      const saved = localStorage.getItem(dayKey);
      if (saved) {
        const parsed: PlanTask[] = JSON.parse(saved);
        const merged = fresh.map((ft) => {
          const existing = parsed.find((p) => p.id === ft.id);
          return existing ? { ...ft, done: existing.done, completedAt: existing.completedAt, startedAt: existing.startedAt } : ft;
        });
        setTasks(merged);
      } else {
        setTasks(fresh);
      }

      const savedRec = localStorage.getItem(`${dayKey}-rec`);
      if (savedRec) {
        const parsedRec: RecurringTask[] = JSON.parse(savedRec);
        const mergedRec = recTasks.map((rt) => {
          const existing = parsedRec.find((p) => p.id === rt.id);
          return existing ? { ...rt, done: existing.done, completedAt: existing.completedAt } : rt;
        });
        setRecurring(mergedRec);
      } else {
        setRecurring(recTasks);
      }

      // Load streak
      const streakData = localStorage.getItem(getStreakKey());
      if (streakData) {
        const { count, lastDate } = JSON.parse(streakData);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);
        if (lastDate === todayStr || lastDate === yesterdayStr) {
          setStreak(count);
        }
      }
    } catch {
      setTasks(fresh);
      setRecurring(recTasks);
    }
  }, [data]);

  // Persist tasks
  useEffect(() => {
    if (tasks.length === 0) return;
    const dayKey = getDayKey();
    try {
      localStorage.setItem(dayKey, JSON.stringify(tasks));
      // Check if all tasks done -> update streak
      const allDone = tasks.every((t) => t.done) && recurring.every((r) => r.done);
      if (allDone && tasks.length > 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const streakData = localStorage.getItem(getStreakKey());
        let newCount = 1;
        if (streakData) {
          const { count, lastDate } = JSON.parse(streakData);
          if (lastDate !== todayStr) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            newCount = lastDate === yesterday.toISOString().slice(0, 10) ? count + 1 : 1;
          } else {
            newCount = count;
          }
        }
        localStorage.setItem(getStreakKey(), JSON.stringify({ count: newCount, lastDate: todayStr }));
        setStreak(newCount);
      }
    } catch { /* quota exceeded */ }
  }, [tasks, recurring]);

  useEffect(() => {
    if (recurring.length === 0) return;
    try {
      localStorage.setItem(`${getDayKey()}-rec`, JSON.stringify(recurring));
    } catch { /* quota exceeded */ }
  }, [recurring]);

  // Toggle task
  const toggleDone = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              done: !t.done,
              completedAt: !t.done ? Date.now() : undefined,
              startedAt: t.startedAt ?? (!t.done ? undefined : t.startedAt),
            }
          : t
      )
    );
  }, []);

  const toggleRecurring = useCallback((id: string) => {
    setRecurring((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined } : t
      )
    );
  }, []);

  const resetAll = useCallback(() => {
    setTasks((prev) => prev.map((t) => ({ ...t, done: false, completedAt: undefined, startedAt: undefined })));
    setRecurring((prev) => prev.map((t) => ({ ...t, done: false, completedAt: undefined })));
  }, []);

  const shareWhatsApp = useCallback(() => {
    const text = generateWhatsAppPlan(tasks, recurring, streak);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
  }, [tasks, recurring, streak]);

  // Derived
  const doneCount = tasks.filter((t) => t.done).length;
  const totalCount = tasks.length;
  const pctDone = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
  const totalEstimatedTime = tasks.filter((t) => !t.done).reduce((s, t) => s + t.estimatedMinutes, 0);
  const recDoneCount = recurring.filter((t) => t.done).length;

  const byPriority = useCallback(
    (p: Priority) => {
      let filtered = tasks.filter((t) => t.priority === p);
      if (focusMode) {
        // In focus mode only show undone tasks, max 2 per priority
        filtered = filtered.filter((t) => !t.done).slice(0, 2);
      }
      return filtered;
    },
    [tasks, focusMode]
  );

  // Category stats for summary
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; done: number }> = {};
    tasks.forEach((t) => {
      const cat = t.category ?? "otro";
      if (!stats[cat]) stats[cat] = { total: 0, done: 0 };
      stats[cat].total++;
      if (t.done) stats[cat].done++;
    });
    return stats;
  }, [tasks]);

  // Weekly progress
  const weeklyProgress = useMemo(() => {
    try {
      const weekKey = getWeekKey();
      const saved = localStorage.getItem(weekKey);
      if (saved) return JSON.parse(saved) as { completed: number; total: number; days: number };
    } catch { /* ignore */ }
    return { completed: 0, total: 0, days: 0 };
  }, []);

  // Save weekly progress
  useEffect(() => {
    if (tasks.length === 0) return;
    try {
      const weekKey = getWeekKey();
      const saved = localStorage.getItem(weekKey);
      const current = saved ? JSON.parse(saved) : { completed: 0, total: 0, days: 0, lastDate: "" };
      const todayStr = new Date().toISOString().slice(0, 10);
      if (current.lastDate !== todayStr) {
        current.completed += doneCount;
        current.total += totalCount;
        current.days++;
        current.lastDate = todayStr;
        localStorage.setItem(weekKey, JSON.stringify(current));
      }
    } catch { /* quota */ }
  }, [tasks, doneCount, totalCount]);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Plan de Acción Diario
          </h3>
          {streak > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded-full">
              <Flame className="w-3 h-3" /> {streak}d
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFocusMode(!focusMode)}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all",
              focusMode
                ? "bg-[#00B4A6] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            title="Modo enfoque: muestra solo las tareas más importantes"
          >
            <Focus className="w-3 h-3" />
            {focusMode ? "Enfoque ON" : "Enfoque"}
          </button>
          <button
            onClick={() => setShowDelegation(!showDelegation)}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all",
              showDelegation
                ? "bg-purple-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            )}
            title="Mostrar sugerencias de delegación"
          >
            <Users className="w-3 h-3" />
          </button>
          <button
            onClick={shareWhatsApp}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </button>
          <button
            onClick={resetAll}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Time slot + time estimate */}
      <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-lg bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 border border-[#00B4A6]/20 dark:border-[#00B4A6]/30">
        <span className="text-sm">{timeSlot.icon}</span>
        <div className="flex-1">
          <span className="text-xs font-medium text-[#00B4A6] dark:text-[#2dd4bf]">
            {timeSlot.label}
          </span>
          <span className="text-[10px] text-[#00B4A6]/70 dark:text-[#2dd4bf]/70 ml-1.5">
            {timeSlot.description}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-[#00B4A6] dark:text-[#2dd4bf]">
          <Timer className="w-3 h-3" />
          ~{totalEstimatedTime}min pendiente
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {doneCount} de {totalCount} tareas · {recDoneCount}/{recurring.length} recurrentes
          </span>
          <span className="text-xs font-semibold text-[#00B4A6] dark:text-[#2dd4bf]">
            {pctDone.toFixed(0)}%
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pctDone === 100 ? "bg-gradient-to-r from-[#00B4A6] to-emerald-400" : "bg-[#00B4A6]"
            )}
            style={{ width: `${pctDone}%` }}
          />
        </div>
        {pctDone === 100 && (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <Award className="w-3.5 h-3.5" />
            ¡Todas las tareas completadas! Excelente día.
          </div>
        )}
      </div>

      {/* Category summary chips */}
      {Object.keys(categoryStats).length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {Object.entries(categoryStats).map(([cat, { total, done }]) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize",
                done === total
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
              )}
            >
              {cat} {done}/{total}
            </button>
          ))}
        </div>
      )}

      {/* Tasks by priority */}
      {(["urgente", "importante", "recomendado"] as Priority[]).map((priority) => {
        const group = byPriority(priority);
        if (group.length === 0) return null;
        const cfg = PRIORITY_CONFIG[priority];
        const Icon = cfg.icon;
        const groupTime = group.filter((t) => !t.done).reduce((s, t) => s + t.estimatedMinutes, 0);
        return (
          <div key={priority} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold w-fit", cfg.color, cfg.bg)}>
                <Icon className="w-3 h-3" />
                {cfg.label}
                <span className="text-[10px] opacity-70 ml-1">({group.length})</span>
              </div>
              {groupTime > 0 && (
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <Timer className="w-2.5 h-2.5" /> ~{groupTime}min
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {group.map((task) => {
                const isPriorityNow =
                  matchesTimeSlot(task.action, timeSlot) ||
                  !!(task.category && timeSlot.keywords.some((kw) => (task.category ?? "").toLowerCase().includes(kw)));
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    cfg={cfg}
                    onToggle={toggleDone}
                    isPriorityNow={isPriorityNow}
                    showDelegation={showDelegation}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Recurring tasks */}
      {recurring.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold w-fit text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40">
              <RotateCcw className="w-3 h-3" />
              Recurrentes
              <span className="text-[10px] opacity-70 ml-1">({recurring.length})</span>
            </div>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Timer className="w-2.5 h-2.5" />
              ~{recurring.filter((t) => !t.done).reduce((s, t) => s + t.estimatedMinutes, 0)}min
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {recurring.map((task) => (
              <RecurringTaskRow key={task.id} task={task} onToggle={toggleRecurring} />
            ))}
          </div>
        </div>
      )}

      {/* Weekly stats */}
      {weeklyProgress.days > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 mb-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Esta semana</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                {weeklyProgress.completed}
              </div>
              <div className="text-[10px] text-gray-400">completadas</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                {weeklyProgress.total > 0 ? ((weeklyProgress.completed / weeklyProgress.total) * 100).toFixed(0) : 0}%
              </div>
              <div className="text-[10px] text-gray-400">cumplimiento</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-800 dark:text-gray-200">
                {weeklyProgress.days}
              </div>
              <div className="text-[10px] text-gray-400">días activos</div>
            </div>
          </div>
        </div>
      )}

      {tasks.length === 0 && recurring.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          Cargando plan de acción...
        </p>
      )}
    </div>
  );
}

/* ── TaskRow ── */
function TaskRow({
  task,
  cfg,
  onToggle,
  isPriorityNow,
  showDelegation,
}: {
  task: PlanTask;
  cfg: (typeof PRIORITY_CONFIG)[Priority];
  onToggle: (id: string) => void;
  isPriorityNow: boolean;
  showDelegation: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-all relative",
        task.done
          ? "bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800 opacity-60"
          : cn("border", cfg.bg)
      )}
    >
      {isPriorityNow && !task.done && (
        <span className="absolute -top-2 -right-1 flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#f97316] text-white shadow-sm animate-pulse">
          <Zap className="w-2.5 h-2.5" />
          Ahora
        </span>
      )}
      <button
        onClick={() => onToggle(task.id)}
        className="mt-0.5 shrink-0 transition-transform active:scale-90"
        title={task.done ? "Marcar como pendiente" : "Marcar como hecho"}
      >
        {task.done ? (
          <CheckCircle2 className="w-5 h-5 text-[#00B4A6] dark:text-[#2dd4bf]" />
        ) : (
          <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600 hover:text-gray-400" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("text-sm font-medium text-gray-800 dark:text-gray-200", task.done && "line-through text-gray-400 dark:text-gray-500")}>
            {task.action}
          </p>
          {task.done && task.completedAt && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
              ✓ {formatTime(task.completedAt)}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{task.impact}</p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Timer className="w-2.5 h-2.5" /> ~{task.estimatedMinutes}min
          </span>
          {task.roiEstimate && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
              <TrendingUp className="w-2.5 h-2.5" /> {task.roiEstimate}
            </span>
          )}
          {showDelegation && task.delegateTo && (
            <span className="text-[10px] text-purple-600 dark:text-purple-400 flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5" /> {task.delegateTo}
            </span>
          )}
          {task.dependsOn && !task.done && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              ⚠ {task.dependsOn}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── RecurringTaskRow ── */
function RecurringTaskRow({
  task,
  onToggle,
}: {
  task: RecurringTask;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-all",
        task.done
          ? "bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800 opacity-60"
          : "bg-purple-50/50 dark:bg-purple-950/10 border-purple-200/50 dark:border-purple-800/30"
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        className="mt-0.5 shrink-0 transition-transform active:scale-90"
        title={task.done ? "Marcar como pendiente" : "Marcar como hecho"}
      >
        {task.done ? (
          <CheckCircle2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        ) : (
          <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600 hover:text-gray-400" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-medium text-gray-800 dark:text-gray-200", task.done && "line-through text-gray-400")}>
            {task.action}
          </p>
          {task.done && task.completedAt && (
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium whitespace-nowrap">
              ✓ {formatTime(task.completedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-purple-500 dark:text-purple-400 flex items-center gap-0.5">
            <RotateCcw className="w-2.5 h-2.5" /> {task.dayLabel}
          </span>
          <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Timer className="w-2.5 h-2.5" /> ~{task.estimatedMinutes}min
          </span>
        </div>
      </div>
    </div>
  );
}