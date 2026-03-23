"use client";

import { useState, useMemo, useEffect } from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type Priority = "urgente" | "importante" | "recomendado";

type PlanTask = {
  id: string;
  priority: Priority;
  action: string;
  impact: string;
  done: boolean;
};

// ── Task generation ────────────────────────────────────────────────────────────

function generatePlan(data: BusinessData | null): PlanTask[] {
  if (!data) return [];

  const { products, orders, sales, customers } = data;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  const tasks: PlanTask[] = [];
  const activeProducts = products.filter((p) => p.active !== false);
  const validOrders = orders.filter((o) => o.status !== "cancelado");

  // ── URGENTES ──────────────────────────────────────────────────────────

  // Out-of-stock products
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  outOfStock.slice(0, 2).forEach((p) => {
    tasks.push({
      id: `oos-${p.id}`,
      priority: "urgente",
      action: `Reabastecer "${p.name}" — stock agotado`,
      impact: "Evita perdida de ventas directas en este producto",
      done: false,
    });
  });

  // Pending orders > 2h
  const pendingOrders = orders.filter((o) => o.status === "pendiente");
  if (pendingOrders.length > 0) {
    tasks.push({
      id: "pending-orders",
      priority: "urgente",
      action: `Atender ${pendingOrders.length} pedido${pendingOrders.length > 1 ? "s" : ""} pendiente${pendingOrders.length > 1 ? "s" : ""}`,
      impact: `${pendingOrders.length > 1 ? "Pedidos que" : "Pedido que"} genera insatisfaccion si se demora mas`,
      done: false,
    });
  }

  // Overdue payables
  const overduePayables = data.alerts?.overduePayables ?? 0;
  if (overduePayables > 0) {
    tasks.push({
      id: "overdue-payables",
      priority: "urgente",
      action: `Pagar ${overduePayables} factura${overduePayables > 1 ? "s" : ""} vencida${overduePayables > 1 ? "s" : ""} a proveedores`,
      impact: "Evita corte de credito con proveedores y cargos por mora",
      done: false,
    });
  }

  // ── IMPORTANTES ──────────────────────────────────────────────────────

  // Low stock products
  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );
  if (lowStock.length > 0) {
    tasks.push({
      id: "low-stock",
      priority: "importante",
      action: `Pedir a proveedor: ${lowStock.slice(0, 3).map((p) => p.name).join(", ")}${lowStock.length > 3 ? ` y ${lowStock.length - 3} mas` : ""}`,
      impact: `Stock bajo en ${lowStock.length} producto${lowStock.length > 1 ? "s" : ""} — riesgo de quiebre en 2-3 dias`,
      done: false,
    });
  }

  // Inactive customers
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= monthAgo)) {
    if (o.customer?.phone) recentBuyers.add(o.customer.phone);
  }
  const inactiveCustomers = customers.filter((c) => c.phone && !recentBuyers.has(c.phone));
  if (inactiveCustomers.length > 3) {
    tasks.push({
      id: "inactive-customers",
      priority: "importante",
      action: `Contactar a ${inactiveCustomers.length} clientes inactivos por 30+ dias`,
      impact: "Reactivar incluso el 20% puede sumar S/500+ en ventas extra",
      done: false,
    });
  }

  // ── RECOMENDADOS ──────────────────────────────────────────────────────

  // Products not selling for 20+ days
  const soldProductIds = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) soldProductIds.add(String(i.productId));
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of o.items) soldProductIds.add(String(i.id));
  }
  const stagnant = activeProducts
    .filter((p) => p.stock != null && p.stock > 0 && !soldProductIds.has(String(p.id)))
    .slice(0, 2);
  stagnant.forEach((p) => {
    tasks.push({
      id: `stagnant-${p.id}`,
      priority: "recomendado",
      action: `Crear oferta o combo con "${p.name}" — sin ventas esta semana`,
      impact: "Rotar inventario estancado y liberar capital en efectivo",
      done: false,
    });
  });

  // Review top sellers pricing
  const weekSalesQty: Record<string, { name: string; qty: number; rev: number }> = {};
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) {
      const pid = String(i.productId);
      if (!weekSalesQty[pid]) weekSalesQty[pid] = { name: i.name, qty: 0, rev: 0 };
      weekSalesQty[pid].qty += i.quantity;
      weekSalesQty[pid].rev += i.price * i.quantity;
    }
  }
  const topSeller = Object.values(weekSalesQty).sort((a, b) => b.qty - a.qty)[0];
  if (topSeller) {
    tasks.push({
      id: "top-seller-review",
      priority: "recomendado",
      action: `Revisar precio de "${topSeller.name}" — tu producto mas vendido esta semana`,
      impact: "Subir precio 5% en el top seller puede mejorar margen sin afectar demanda",
      done: false,
    });
  }

  tasks.push({
    id: "daily-cash-review",
    priority: "recomendado",
    action: "Verificar cuadre de caja del dia y conciliar con ventas en sistema",
    impact: "Previene diferencias acumuladas y detecta errores a tiempo",
    done: false,
  });

  return tasks.slice(0, 7);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getWeekKey(): string {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  return `ai-plan-${start.toISOString().slice(0, 10)}`;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  urgente: {
    label: "Urgente",
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40",
    icon: AlertCircle,
  },
  importante: {
    label: "Importante",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40",
    icon: AlertTriangle,
  },
  recomendado: {
    label: "Recomendado",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40",
    icon: Info,
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIActionPlan({ data }: Props) {
  const generated = useMemo(() => generatePlan(data), [data]);
  const [tasks, setTasks] = useState<PlanTask[]>([]);

  useEffect(() => {
    const key = getWeekKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed: PlanTask[] = JSON.parse(saved);
        const merged = generated.map((t) => {
          const s = parsed.find((p) => p.id === t.id);
          return s ? { ...t, done: s.done } : t;
        });
        setTasks(merged);
        return;
      } catch { /* ignore */ }
    }
    setTasks(generated);
  }, [generated]);

  const saveTasks = (updated: PlanTask[]) => {
    const key = getWeekKey();
    localStorage.setItem(key, JSON.stringify(updated));
    setTasks(updated);
  };

  const toggleDone = (id: string) => {
    const updated = tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    saveTasks(updated);
  };

  const resetAll = () => {
    const updated = tasks.map((t) => ({ ...t, done: false }));
    saveTasks(updated);
  };

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0;

  const byPriority = (p: Priority) => tasks.filter((t) => t.priority === p);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Plan de Accion Semanal
        </h2>
        <button
          onClick={resetAll}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Reiniciar
        </button>
      </div>

      {/* Progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {doneCount} de {tasks.length} tareas completadas esta semana
          </span>
          <span className="text-xs font-semibold text-[#2d6a4f] dark:text-[#52b788]">
            {pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2d6a4f] rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Tasks by priority */}
      {(["urgente", "importante", "recomendado"] as Priority[]).map((priority) => {
        const group = byPriority(priority);
        if (group.length === 0) return null;
        const cfg = PRIORITY_CONFIG[priority];
        const Icon = cfg.icon;
        return (
          <div key={priority} className="mb-4">
            <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold w-fit mb-2", cfg.color, cfg.bg)}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </div>
            <div className="flex flex-col gap-2">
              {group.map((task) => (
                <TaskRow key={task.id} task={task} cfg={cfg} onToggle={toggleDone} />
              ))}
            </div>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          Cargando plan de accion...
        </p>
      )}
    </div>
  );
}

function TaskRow({
  task,
  cfg,
  onToggle,
}: {
  task: PlanTask;
  cfg: (typeof PRIORITY_CONFIG)[Priority];
  onToggle: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-all",
        task.done
          ? "bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800 opacity-60"
          : cn("border", cfg.bg)
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        className="mt-0.5 shrink-0 transition-transform active:scale-90"
        title={task.done ? "Marcar como pendiente" : "Marcar como hecho"}
      >
        {task.done ? (
          <CheckCircle2 className="w-5 h-5 text-[#2d6a4f] dark:text-[#52b788]" />
        ) : (
          <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium text-gray-800 dark:text-gray-200", task.done && "line-through text-gray-400")}>
          {task.action}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{task.impact}</p>
      </div>
    </div>
  );
}
