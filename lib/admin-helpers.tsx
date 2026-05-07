import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import {
  Clock,
  CheckCircle,
  Truck,
  PackageCheck,
  XCircle,
} from "lucide-react";

// ── Data helpers ──────────────────────────────────────────────────────────────

/**
 * Fetches all orders from the API using cursor-based pagination.
 * Replaces the old ?limit=1000 calls — each round-trip is bounded at 200 rows,
 * all filtering is pushed to Postgres, and we stop as soon as the last page.
 */
export async function fetchAllOrders(): Promise<DbOrder[]> {
  const all: DbOrder[] = [];
  let cursor: string | undefined;
  while (true) {
    const url = cursor
      ? `/api/orders?limit=200&cursor=${encodeURIComponent(cursor)}`
      : "/api/orders?limit=200";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al cargar pedidos");
    const batch = (await res.json()) as DbOrder[];
    all.push(...batch);
    const next = res.headers.get("X-Next-Cursor") ?? "";
    if (!next) break;
    cursor = next;
  }
  return all;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function Stars({ rating }: { rating: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "text-amber-400" : "text-gray-200"}>★</span>
      ))}
    </span>
  );
}

export function parseGps(loc: string): { lat: number; lon: number } | null {
  const m = loc.match(/GPS:\s*([\d.-]+),\s*([\d.-]+)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

export function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function avatarColor(name: string): string {
  const colors = ["#ef4444","#f97316","#f59e0b","#65a30d","#16a34a","#2dd4bf","#0891b2","#0ea5e9","#3b82f6","#00B4A6","#8b5cf6","#a855f7","#ec4899","#f43f5e"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

export type TimelineStep = {
  status: OrderStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  completed: boolean;
  current: boolean;
  timestamp?: string;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  preparando: "Preparando",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function getOrderTimeline(order: DbOrder): TimelineStep[] {
  const statusFlow: OrderStatus[] = ["pendiente", "confirmado", "preparando", "en_camino", "entregado"];
  const isCanceled = order.status === "cancelado";

  // Find current status index
  const currentIndex = statusFlow.indexOf(order.status);

  // Build timeline for normal flow
  const timeline: TimelineStep[] = statusFlow.map((status, idx) => {
    const isCompleted = isCanceled ? false : idx < currentIndex;
    const isCurrent = !isCanceled && idx === currentIndex;

    // Estimate timestamps
    let timestamp: string | undefined;
    if (idx === 0) {
      // First status uses createdAt
      timestamp = formatDate(order.createdAt);
    } else if (isCurrent && idx === currentIndex) {
      // Current status uses updatedAt
      timestamp = order.updatedAt ? formatDate(order.updatedAt) : undefined;
    }

    return {
      status,
      label: STATUS_LABELS[status],
      icon: status === "pendiente" ? Clock : status === "confirmado" ? CheckCircle : status === "en_camino" ? Truck : PackageCheck,
      completed: isCompleted,
      current: isCurrent,
      timestamp,
    };
  });

  // If canceled, add canceled step as alternate path
  if (isCanceled) {
    timeline.push({
      status: "cancelado",
      label: STATUS_LABELS.cancelado,
      icon: XCircle,
      completed: false,
      current: true,
      timestamp: order.updatedAt ? formatDate(order.updatedAt) : undefined,
    });
  }

  return timeline;
}

export function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const safe = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rich = safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-foreground">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em class="italic text-gray-600 dark:text-muted">$1</em>');
    const isList = /^[-*] /.test(line) || /^\d+\. /.test(line);
    if (!isList && inList) { out.push("</ul>"); inList = false; }
    if (line.startsWith("#### ")) {
      out.push(`<div class="mt-4 mb-1.5 flex items-center gap-2"><span class="w-1 h-4 rounded-full bg-violet-400 shrink-0 inline-block"></span><h4 class="text-xs font-bold text-violet-700 uppercase tracking-wider">${rich.slice(5)}</h4></div>`);
    } else if (line.startsWith("### ")) {
      out.push(`<div class="mt-3 mb-1 flex items-center gap-2"><span class="w-1 h-4 rounded-full bg-indigo-400 shrink-0 inline-block"></span><h3 class="text-xs font-bold text-indigo-700 uppercase tracking-wider">${rich.slice(4)}</h3></div>`);
    } else if (line.startsWith("## ")) {
      out.push(`<h2 class="text-sm font-bold text-gray-900 dark:text-foreground mt-5 mb-2 pb-1 border-b-2 border-violet-200">${rich.slice(3)}</h2>`);
    } else if (line.startsWith("# ")) {
      out.push(`<h1 class="text-base font-extrabold text-gray-900 dark:text-foreground mt-4 mb-2">${rich.slice(2)}</h1>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { out.push(`<ul class="space-y-1 my-1.5">`); inList = true; }
      out.push(`<li class="flex items-start gap-2 text-sm text-gray-700 dark:text-foreground leading-relaxed"><span class="text-violet-400 shrink-0 mt-0.5">▸</span><span>${rich.slice(2)}</span></li>`);
    } else if (/^\d+\. /.test(line)) {
      if (!inList) { out.push(`<ul class="space-y-1 my-1.5">`); inList = true; }
      const num = line.match(/^(\d+)\./)?.[1] ?? "•";
      out.push(`<li class="flex items-start gap-2 text-sm text-gray-700 dark:text-foreground leading-relaxed"><span class="text-violet-500 font-bold shrink-0 text-xs mt-0.5">${num}.</span><span>${rich.replace(/^\d+\.\s/, "")}</span></li>`);
    } else if (line === "") {
      out.push('<div class="h-1.5"></div>');
    } else {
      out.push(`<p class="text-sm text-gray-700 dark:text-foreground leading-relaxed">${rich}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}
