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
} from "@buleje/design-system/icons";
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
    dotClass: "bg-[var(--data-error-500)]",
    labelClass: "text-[var(--data-error-600)] dark:text-red-400",
    icon: AlertCircle,
  },
  importante: {
    label: "Importante",
    dotClass: "bg-[var(--data-warning-500)]",
    labelClass: "text-[var(--data-warning-600)] dark:text-amber-400",
    icon: Clock,
  },
  recomendado: {
    label: "Recomendado",
    dotClass: "bg-gray-400",
    labelClass: "text-[var(--text-tertiary)]",
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
  const pct = Math.round((completedCount / total) * 100);

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900 overflow-hidden">
      <div className="border-b border-[var(--rule-soft)] px-5 py-4 dark:border-[var(--rule-base)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/15">
              <CheckSquare className="h-5 w-5 text-[var(--data-success-500)]" />
            </span>
            <div>
              <p className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
                Checklist del día
              </p>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mt-0.5">
                Hábitos diarios para no olvidarte de nada
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
              {completedCount}
              <span className="text-base font-bold text-[var(--text-tertiary)]">/{total}</span>
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {pct}% hecho
            </p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct === 100 ? "bg-[var(--data-success-500)]" : "bg-[var(--text-primary)]",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="divide-y divide-[var(--rule-soft)] dark:divide-[var(--rule-base)]">
        {CHECKLIST_ITEMS.map((item) => {
          const done = !!checked[item.id];
          return (
            <button
              key={item.id}
              onClick={() => onToggle(item.id)}
              className={cn(
                "flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors",
                "hover:bg-[var(--surface-sunken)]/60",
                done && "bg-[var(--surface-sunken)]/40",
              )}
            >
              {done ? (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--data-success-500)]">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                </span>
              ) : (
                <span className="inline-flex h-5 w-5 shrink-0 rounded-md border-2 border-[var(--rule-base)] hover:border-[var(--text-primary)]/40 transition-colors" />
              )}
              <span
                className={cn(
                  "text-sm font-semibold transition-colors",
                  done
                    ? "text-[var(--text-tertiary)] line-through"
                    : "text-[var(--text-primary)]",
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {completedCount === total && (
        <div className="flex items-center justify-center gap-2 bg-primary/10 dark:bg-primary/15 px-5 py-3">
          <Check className="h-4 w-4 text-[var(--data-success-500)]" />
          <span className="text-sm font-extrabold text-[var(--data-success-500)]">
            ¡Día completo! Buen trabajo.
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

  // Color del borde lateral segun prioridad — feedback visual rapido.
  const borderColor =
    task.priority === "urgente"
      ? "var(--data-error)"
      : task.priority === "importante"
        ? "var(--data-warning)"
        : "var(--text-tertiary)";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-white px-5 py-4",
        "dark:border-[var(--rule-base)] dark:bg-gray-900",
        "border-l-4 transition-all hover:shadow-sm",
      )}
      style={{ borderLeftColor: borderColor }}
    >
      {/* Dot */}
      <span className={cn("mt-2 h-2.5 w-2.5 rounded-full shrink-0", config.dotClass)} />

      {/* Icon + Content */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)]">
          <Icon className="h-4 w-4 text-[var(--text-secondary)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">
            {task.description}
          </p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)] leading-relaxed">
            {task.impact}
          </p>
        </div>
      </div>

      {/* Action */}
      <button
        onClick={() => onMarkDone(task.id)}
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]",
          "transition-colors hover:border-[var(--data-success-500)] hover:bg-[var(--data-success-500)] hover:text-white",
        )}
      >
        <Check className="h-3.5 w-3.5" />
        <span>Hecho</span>
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
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md",
            priority === "urgente"
              ? "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)]"
              : priority === "importante"
                ? "bg-[var(--data-warning-50)] dark:bg-amber-950/30 text-[var(--data-warning-500)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
          )}
        >
          {config.label}
        </span>
        <span className="text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
          {visible.length} {visible.length === 1 ? "tarea" : "tareas"}
        </span>
      </div>
      <div className="space-y-2.5">
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
            <Check className="mx-auto mb-2 h-5 w-5 text-[var(--data-success-500)]" />
            <p className="text-sm text-[var(--text-tertiary)]">
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
