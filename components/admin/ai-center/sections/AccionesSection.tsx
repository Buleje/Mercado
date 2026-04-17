"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  Clock,
  Lightbulb,
  CheckSquare,
  Square,
  Check,
  Package,
  ShoppingCart,
  TrendingDown,
  Users,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "../ai-center.types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "urgente" | "importante" | "recomendado";

interface Task {
  id: string;
  priority: Priority;
  description: string;
  impact: string;
  icon: React.ElementType;
}

interface ChecklistState {
  date: string;
  checked: Record<string, boolean>;
}

interface DoneState {
  date: string;
  ids: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECKLIST_KEY = "ai-checklist-v2";
const DONE_KEY = "ai-tasks-done-v2";

const CHECKLIST_ITEMS = [
  { id: "abrir-caja", label: "Abrir caja" },
  { id: "revisar-stock", label: "Revisar stock" },
  { id: "procesar-pedidos", label: "Procesar pedidos" },
  { id: "revisar-fiados", label: "Revisar fiados" },
  { id: "cerrar-caja", label: "Cerrar caja" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadChecklist(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return {};
    const parsed: ChecklistState = JSON.parse(raw);
    if (parsed.date !== todayStr()) return {};
    return parsed.checked ?? {};
  } catch {
    return {};
  }
}

function saveChecklist(checked: Record<string, boolean>) {
  try {
    const state: ChecklistState = { date: todayStr(), checked };
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadDone(): string[] {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    if (!raw) return [];
    const parsed: DoneState = JSON.parse(raw);
    if (parsed.date !== todayStr()) return [];
    return parsed.ids ?? [];
  } catch {
    return [];
  }
}

function saveDone(ids: string[]) {
  try {
    const state: DoneState = { date: todayStr(), ids };
    localStorage.setItem(DONE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Task generation ──────────────────────────────────────────────────────────

function generateTasks(data: BusinessData): Task[] {
  const tasks: Task[] = [];
  const today = new Date();

  // URGENTE — low stock
  for (const p of data.products) {
    if (p.active === false) continue;
    const stock = p.stock ?? 0;
    const min = p.stockMin ?? 0;
    if (min > 0 && stock <= min) {
      const needed = min - stock;
      const impact = needed * (p.price ?? 0);
      tasks.push({
        id: `restock-${p.id}`,
        priority: "urgente",
        description: `Reabastecer: ${p.name} (stock: ${stock}, min: ${min})`,
        impact: impact > 0 ? `Impacto estimado: ${formatSoles(impact)}` : "Revisar proveedor",
        icon: Package,
      });
    }
  }

  // IMPORTANTE — pending orders
  const pending = data.orders.filter(
    (o) => o.status === "pendiente" || o.status === "en_proceso",
  );
  if (pending.length > 0) {
    const total = pending.reduce((acc, o) => acc + (o.total ?? 0), 0);
    tasks.push({
      id: "pending-orders",
      priority: "importante",
      description: `Procesar ${pending.length} pedido${pending.length > 1 ? "s" : ""} pendiente${pending.length > 1 ? "s" : ""}`,
      impact: `Valor total: ${formatSoles(total)}`,
      icon: ShoppingCart,
    });
  }

  // IMPORTANTE — low margin products
  for (const p of data.products) {
    if (p.active === false) continue;
    if (!p.price || !p.costPrice || p.price <= 0) continue;
    const margin = ((p.price - p.costPrice) / p.price) * 100;
    if (margin < 10) {
      tasks.push({
        id: `low-margin-${p.id}`,
        priority: "importante",
        description: `Revisar precio: ${p.name} (margen: ${margin.toFixed(1)}%)`,
        impact: `Precio actual: ${formatSoles(p.price)} — Costo: ${formatSoles(p.costPrice)}`,
        icon: TrendingDown,
      });
    }
  }

  // RECOMENDADO — inactive customers (no purchase in 30+ days)
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const inactive = data.customers.filter((c) => {
    if (!c.lastPurchase) return false;
    return new Date(c.lastPurchase) < thirtyDaysAgo;
  });
  if (inactive.length > 0) {
    tasks.push({
      id: "inactive-customers",
      priority: "recomendado",
      description: `${inactive.length} cliente${inactive.length > 1 ? "s" : ""} inactivo${inactive.length > 1 ? "s" : ""} — contactar por WhatsApp`,
      impact: `Sin compra en mas de 30 dias`,
      icon: Users,
    });
  }

  // RECOMENDADO — combo suggestion from co-purchase analysis
  const pairCount: Record<string, number> = {};
  for (const sale of data.sales) {
    const ids = sale.items.map((i) => String(i.productId)).sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}||${ids[j]}`;
        pairCount[key] = (pairCount[key] ?? 0) + 1;
      }
    }
  }

  // find top pair with count >= 3
  let topKey: string | null = null;
  let topCount = 2; // minimum threshold
  for (const [key, count] of Object.entries(pairCount)) {
    if (count > topCount) {
      topCount = count;
      topKey = key;
    }
  }

  if (topKey) {
    const [idA, idB] = topKey.split("||");
    const nameA =
      data.sales.flatMap((s) => s.items).find((i) => String(i.productId) === idA)?.name ?? idA;
    const nameB =
      data.sales.flatMap((s) => s.items).find((i) => String(i.productId) === idB)?.name ?? idB;
    tasks.push({
      id: `combo-${topKey}`,
      priority: "recomendado",
      description: `Crear combo: ${nameA} + ${nameB}`,
      impact: `Comprados juntos ${topCount} veces`,
      icon: Layers,
    });
  }

  return tasks;
}

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; dotClass: string; labelClass: string; icon: React.ElementType }
> = {
  urgente: {
    label: "Urgente",
    dotClass: "bg-red-500",
    labelClass: "text-red-600 dark:text-red-400",
    icon: AlertCircle,
  },
  importante: {
    label: "Importante",
    dotClass: "bg-amber-500",
    labelClass: "text-amber-600 dark:text-amber-400",
    icon: Clock,
  },
  recomendado: {
    label: "Recomendado",
    dotClass: "bg-gray-400",
    labelClass: "text-gray-500 dark:text-gray-400",
    icon: Lightbulb,
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DailyChecklistProps {
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
}

function DailyChecklist({ checked, onToggle }: DailyChecklistProps) {
  const completedCount = CHECKLIST_ITEMS.filter((i) => checked[i.id]).length;
  const total = CHECKLIST_ITEMS.length;

  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-4 py-3 dark:border-[var(--rule-base)]">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Checklist del dia
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {completedCount}/{total} completados
        </span>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-800">
        {CHECKLIST_ITEMS.map((item) => {
          const done = !!checked[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onToggle(item.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                "hover:bg-gray-50 dark:hover:bg-gray-800/50",
              )}
            >
              {done ? (
                <CheckSquare className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Square className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
              )}
              <span
                className={cn(
                  "text-sm",
                  done
                    ? "text-gray-400 line-through dark:text-gray-500"
                    : "text-gray-700 dark:text-gray-300",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {completedCount === total && (
        <div className="flex items-center gap-2 border-t border-[var(--rule-soft)] px-4 py-2.5 dark:border-[var(--rule-base)]">
          <Check className="h-4 w-4 text-emerald-500" />
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            Checklist completo
          </span>
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  done: boolean;
  onMarkDone: (id: string) => void;
}

function TaskCard({ task, done, onMarkDone }: TaskCardProps) {
  const config = PRIORITY_CONFIG[task.priority];
  const Icon = task.icon;

  if (done) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-[var(--rule-base)] bg-white px-4 py-3",
        "dark:border-[var(--rule-base)] dark:bg-gray-900",
      )}
    >
      {/* Dot */}
      <div className="mt-1 flex shrink-0 items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", config.dotClass)} />
      </div>

      {/* Icon + Content */}
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-800 dark:text-gray-200">{task.description}</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{task.impact}</p>
        </div>
      </div>

      {/* Action */}
      <button
        onClick={() => onMarkDone(task.id)}
        className={cn(
          "shrink-0 rounded border border-[var(--rule-base)] px-2.5 py-1 text-xs text-gray-500",
          "transition-colors hover:border-emerald-300 hover:text-emerald-600",
          "dark:border-[var(--rule-base)] dark:text-gray-400 dark:hover:border-emerald-600 dark:hover:text-emerald-400",
        )}
      >
        Hecho
      </button>
    </div>
  );
}

interface PriorityGroupProps {
  priority: Priority;
  tasks: Task[];
  doneTasks: string[];
  onMarkDone: (id: string) => void;
}

function PriorityGroup({ priority, tasks, doneTasks, onMarkDone }: PriorityGroupProps) {
  const config = PRIORITY_CONFIG[priority];
  const visible = tasks.filter((t) => !doneTasks.includes(t.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className={cn("text-xs font-medium", config.labelClass)}>{config.label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">({visible.length})</span>
      </div>
      <div className="space-y-2">
        {visible.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            done={doneTasks.includes(task.id)}
            onMarkDone={onMarkDone}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AccionesSectionProps {
  data: BusinessData;
}

export default function AccionesSection({ data }: AccionesSectionProps) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [doneTasks, setDoneTasks] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    setChecklist(loadChecklist());
    setDoneTasks(loadDone());
    setHydrated(true);
  }, []);

  const handleChecklistToggle = useCallback((id: string) => {
    setChecklist((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecklist(next);
      return next;
    });
  }, []);

  const handleMarkDone = useCallback((id: string) => {
    setDoneTasks((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveDone(next);
      return next;
    });
  }, []);

  const tasks = useMemo(() => generateTasks(data), [data]);

  const urgente = tasks.filter((t) => t.priority === "urgente");
  const importante = tasks.filter((t) => t.priority === "importante");
  const recomendado = tasks.filter((t) => t.priority === "recomendado");

  const allDone =
    hydrated &&
    tasks.length > 0 &&
    tasks.every((t) => doneTasks.includes(t.id));

  const noTasks = tasks.length === 0;

  return (
    <div className="space-y-4">
      {/* Checklist diario */}
      <DailyChecklist
        checked={hydrated ? checklist : {}}
        onToggle={handleChecklistToggle}
      />

      {/* Task list */}
      <div className="space-y-4">
        {(noTasks || allDone) ? (
          <div
            className={cn(
              "rounded-lg border border-[var(--rule-base)] bg-white px-4 py-6 text-center",
              "dark:border-[var(--rule-base)] dark:bg-gray-900",
            )}
          >
            <Check className="mx-auto mb-2 h-5 w-5 text-emerald-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Todo en orden — no hay acciones urgentes hoy
            </p>
          </div>
        ) : (
          <>
            <PriorityGroup
              priority="urgente"
              tasks={urgente}
              doneTasks={doneTasks}
              onMarkDone={handleMarkDone}
            />
            <PriorityGroup
              priority="importante"
              tasks={importante}
              doneTasks={doneTasks}
              onMarkDone={handleMarkDone}
            />
            <PriorityGroup
              priority="recomendado"
              tasks={recomendado}
              doneTasks={doneTasks}
              onMarkDone={handleMarkDone}
            />
          </>
        )}
      </div>
    </div>
  );
}
