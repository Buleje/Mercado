"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  TrendingUp,
  Package,
  Users,
  AlertTriangle,
  Clock,
  DollarSign,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Sun,
  Moon,
  Sunset,
  BarChart3,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  ShoppingCart,
  Check,
  Plus,
  X,
  FileText,
  PieChart as PieChartIcon,
  LayoutDashboard,
  Settings,
  CreditCard,
  Lightbulb,
  Target,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { Product, Sale } from "@/types/erp";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  Legend,
} from "recharts";

const WeeklyGoalCard = dynamic(() => import("@/components/admin/WeeklyGoalCard"), { ssr: false });
const ActivityFeed = dynamic(() => import("@/components/admin/ActivityFeed"), { ssr: false });
const WebVitalsWidget = dynamic(() => import("@/components/admin/WebVitalsWidget"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image?: string;
}

interface Order {
  id: string;
  customer: { name: string; phone?: string; location?: string; reference?: string };
  items: OrderItem[];
  total: number;
  status: "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
  paymentMethod?: string;
  createdAt: string;
  updatedAt?: string;
}

interface Payable {
  id: string;
  supplierId?: string;
  supplierName?: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate?: string;
}

interface DashboardAlerts {
  lowStock: number;
  pendingOrders: number;
  overduePayables: number;
}

interface DashboardPayload {
  products: Product[];
  orders: Order[];
  sales: Sale[];
  payables: Payable[];
  alerts: DashboardAlerts;
}

interface TopProduct {
  id: number | string;
  name: string;
  qty: number;
  revenue: number;
}

interface TopCustomer {
  name: string;
  phone?: string;
  total: number;
  orderCount: number;
}

interface HourBucket {
  hour: number;
  label: string;
  amount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtShort(n: number): string {
  if (n >= 1000) return `S/${(n / 1000).toFixed(1)}k`;
  return `S/${n.toFixed(0)}`;
}

function isToday(iso: string): boolean {
  try {
    return new Date(iso).toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
}

function isThisMonth(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } catch {
    return false;
  }
}

function isLastMonth(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  } catch {
    return false;
  }
}

function isThisWeek(iso: string): boolean {
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return d.getTime() >= startOfWeek.getTime();
  } catch {
    return false;
  }
}

function getGreeting(): { text: string; Icon: typeof Sun } {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return { text: "Buenos dias", Icon: Sun };
  if (h >= 12 && h < 19) return { text: "Buenas tardes", Icon: Sunset };
  return { text: "Buenas noches", Icon: Moon };
}

function formatDateLong(): string {
  return new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Regional Config ──────────────────────────────────────────────────────────

interface RegionalConfig {
  currency: "PEN" | "USD";
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY";
}

const DEFAULT_REGIONAL: RegionalConfig = { currency: "PEN", dateFormat: "DD/MM/YYYY" };

function getRegionalConfig(): RegionalConfig {
  try {
    const raw = localStorage.getItem("regional-config");
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_REGIONAL, ...parsed };
    }
  } catch { /* ignore */ }
  return DEFAULT_REGIONAL;
}

function formatCurrency(n: number, config: RegionalConfig): string {
  if (config.currency === "USD") {
    return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyShort(n: number, config: RegionalConfig): string {
  const symbol = config.currency === "USD" ? "$" : "S/";
  if (n >= 1000) return `${symbol}${(n / 1000).toFixed(1)}k`;
  return `${symbol}${n.toFixed(0)}`;
}

function _formatRegionalDate(iso: string, config: RegionalConfig): string {
  try {
    const locale = config.dateFormat === "MM/DD/YYYY" ? "en-US" : "es-PE";
    return new Date(iso).toLocaleDateString(locale);
  } catch {
    return iso;
  }
}

// ── Dashboard Sub-Tabs ──────────────────────────────────────────────────────

type DashTabId = "resumen" | "ventas" | "inventario" | "clientes" | "finanzas";

const DASHBOARD_TABS: { id: DashTabId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "resumen", label: "Resumen", Icon: LayoutDashboard },
  { id: "ventas", label: "Ventas", Icon: TrendingUp },
  { id: "inventario", label: "Inventario", Icon: Package },
  { id: "clientes", label: "Clientes", Icon: Users },
  { id: "finanzas", label: "Finanzas", Icon: CreditCard },
];

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 animate-pulse",
        className
      )}
    >
      <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-zinc-700 mb-3" />
      <div className="h-7 w-1/2 rounded bg-gray-200 dark:bg-zinc-700 mb-2" />
      <div className="h-1 w-full rounded bg-gray-200 dark:bg-zinc-700 mt-3" />
    </div>
  );
}

function SkeletonBar({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-28 rounded bg-gray-200 dark:bg-zinc-700 shrink-0" />
          <div
            className="h-5 rounded bg-gray-200 dark:bg-zinc-700"
            style={{ width: `${30 + (i % 4) * 15}%` }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Period selector type ─────────────────────────────────────────────────────

type Period = "hoy" | "semana" | "mes";

// ── KPI Card (new Alegra style) ──────────────────────────────────────────────

interface KpiCardNewProps {
  label: string;
  value: string;
  subtext?: string;
  subtextColorClass?: string;
  colorClass: string;
  isEmpty?: boolean;
  emptyLabel?: string;
}

function KpiCardNew({ label, value, subtext, subtextColorClass, colorClass, isEmpty, emptyLabel }: KpiCardNewProps) {
  return (
    <div className={cn(
      "bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm transition-all hover:shadow-md",
      isEmpty && "opacity-60"
    )}>
      <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">{label}</p>
      {isEmpty && emptyLabel ? (
        <p className="text-lg font-mono font-bold text-gray-400 dark:text-zinc-500 mt-1">{emptyLabel}</p>
      ) : (
        <p className="text-2xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">{value}</p>
      )}
      {subtext && <p className={cn("text-[10px] mt-1", subtextColorClass ?? "text-gray-400 dark:text-zinc-500")}>{subtext}</p>}
      <div className={cn("h-1 rounded-full mt-2", colorClass)} />
    </div>
  );
}

// ── Alert Badge ───────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

interface AlertBadgeProps {
  Icon: IconComponent;
  label: string;
  count: number;
  colorClass: string;
}

function AlertBadge({ Icon, label, count, colorClass }: AlertBadgeProps) {
  if (count === 0) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        colorClass
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto font-bold tabular-nums">{count}</span>
    </div>
  );
}

// ── Inactive Customers Card ──────────────────────────────────────────────────

function InactiveCustomersCard({ orders, sales, loading }: { orders: Order[]; sales: Sale[]; loading: boolean }) {
  const [now] = useState(() => Date.now());
  const inactiveCustomers = useMemo(() => {
    const customerMap = new Map<string, { name: string; lastDate: string; totalSpent: number; orderCount: number; phone?: string }>();

    for (const o of orders) {
      if (o.status === "cancelado") continue;
      const key = o.customer?.phone ?? o.customer?.name ?? "?";
      const existing = customerMap.get(key);
      const date = o.createdAt ?? "";
      if (existing) {
        existing.orderCount++;
        existing.totalSpent += o.total ?? 0;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        customerMap.set(key, {
          name: o.customer?.name ?? "Cliente",
          lastDate: date,
          totalSpent: o.total ?? 0,
          orderCount: 1,
          phone: o.customer?.phone,
        });
      }
    }
    for (const s of sales) {
      const key = (s as unknown as { customerPhone?: string }).customerPhone ?? "?";
      if (key === "?") continue;
      const existing = customerMap.get(key);
      const date = s.createdAt ?? "";
      if (existing) {
        existing.orderCount++;
        existing.totalSpent += s.total ?? 0;
        if (date > existing.lastDate) existing.lastDate = date;
      }
    }

    const fifteenDaysAgo = new Date(now - 15 * 86_400_000).toISOString().slice(0, 10);

    return Array.from(customerMap.values())
      .filter(c => c.orderCount >= 2 && c.lastDate.slice(0, 10) < fifteenDaysAgo)
      .map(c => {
        const daysSince = Math.floor((now - new Date(c.lastDate).getTime()) / 86_400_000);
        return { ...c, daysSince };
      })
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 5);
  }, [orders, sales, now]);

  if (loading) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Clientes que no vuelven</span>
      </div>
      {inactiveCustomers.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
          <Check className="w-4 h-4" /> Tus clientes frecuentes siguen activos
        </div>
      ) : (
        <div className="space-y-2">
          {inactiveCustomers.map((c, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 truncate">{c.name}</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500">
                  Ultima compra: hace {c.daysSince} dias &middot; Gasto total S/{c.totalSpent.toFixed(0)}
                </p>
              </div>
              {c.phone && (
                <a
                  href={`https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${c.name}! Te extrañamos en Buleje. Tenemos productos nuevos esperandote!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  Contactar
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Birthday Card ─────────────────────────────────────────────────────────────

function BirthdayCard() {
  const [birthdays, setBirthdays] = useState<{ name: string; phone?: string; isToday: boolean }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/customers?limit=500", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const customers: Array<{ name?: string; phone?: string; birthday?: string; fechaNacimiento?: string }> = Array.isArray(data) ? data : data.customers ?? [];
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const matches: { name: string; phone?: string; isToday: boolean }[] = [];
        for (const c of customers) {
          const bd = c.birthday || c.fechaNacimiento;
          if (!bd) continue;
          const d = new Date(bd);
          if (isNaN(d.getTime())) continue;
          const isTodayMatch = d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
          const isTomorrowMatch = d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
          if (isTodayMatch || isTomorrowMatch) matches.push({ name: c.name ?? "Cliente", phone: c.phone, isToday: isTodayMatch });
        }
        setBirthdays(matches.slice(0, 3));
      } catch { /* silent */ }
    })();
  }, []);

  if (birthdays.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Cumpleanos</span>
      </div>
      <div className="space-y-2">
        {birthdays.map((b, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200">
              {b.isToday ? "Hoy cumple" : "Manana cumple"}: {b.name}
            </p>
            {b.phone && b.isToday && (
              <a
                href={`https://wa.me/${b.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Feliz cumpleanos ${b.name}! De parte de Buleje.`)}`}
                target="_blank" rel="noopener noreferrer"
                className="shrink-0 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold hover:bg-emerald-100 transition-colors"
              >
                Felicitar
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recent Documents Feed ────────────────────────────────────────────────────

type DocEntry = { type: string; number: string; status: string; createdAt: string };
const DOC_ICONS: Record<string, string> = { GRR: "GRR", COT: "COT", NC: "NC", CONTRATO: "CTR" };

function RecentDocumentsFeed() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [now] = useState(() => Date.now());
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/activity-log?limit=20");
        if (!res.ok) return;
        const data = await res.json();
        const items: Array<{ action?: string; entityType?: string; entityId?: string; createdAt?: string; details?: string }> = Array.isArray(data) ? data : data.entries ?? [];
        const docEntries: DocEntry[] = [];
        for (const item of items) {
          const et = (item.entityType ?? "").toUpperCase();
          if (["GRR", "GUIA", "COT", "COTIZACION", "NC", "NOTA_CREDITO", "CONTRATO"].some(t => et.includes(t))) {
            const type = et.includes("GRR") || et.includes("GUIA") ? "GRR" : et.includes("COT") ? "COT" : et.includes("NC") || et.includes("NOTA") ? "NC" : "CONTRATO";
            docEntries.push({ type, number: item.entityId ?? "—", status: item.action ?? "creado", createdAt: item.createdAt ?? "" });
          }
          if (docEntries.length >= 5) break;
        }
        setDocs(docEntries);
      } catch { /* silent */ }
    })();
  }, []);

  if (docs.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Ultimos documentos</span>
      </div>
      <div className="space-y-2 max-h-[150px] overflow-auto">
        {docs.map((d, i) => {
          const daysAgo = Math.floor((now - new Date(d.createdAt).getTime()) / 86400000);
          const timeLabel = daysAgo === 0 ? "hoy" : daysAgo === 1 ? "ayer" : `hace ${daysAgo}d`;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 shrink-0">{DOC_ICONS[d.type] ?? d.type}</span>
              <span className="text-gray-700 dark:text-zinc-200 font-medium truncate">{d.number}</span>
              <span className="text-[10px] text-gray-400 dark:text-zinc-500 capitalize">{d.status}</span>
              <span className="text-[10px] text-gray-400 dark:text-zinc-500 ml-auto shrink-0">{timeLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Delivery Zones Config ────────────────────────────────────────────────────

function DeliveryZonesConfig() {
  type DeliveryZone = { zona: string; tarifa: number };
  const ZONES_KEY = "delivery-zones";
  const [zones, setZonesState] = useState<DeliveryZone[]>(() => {
    try {
      const raw = localStorage.getItem(ZONES_KEY);
      return raw ? JSON.parse(raw) : [
        { zona: "Centro", tarifa: 0 },
        { zona: "Manantay", tarifa: 5 },
        { zona: "San Juan", tarifa: 3 },
        { zona: "Yarinacocha", tarifa: 8 },
      ];
    } catch { return []; }
  });
  const [addingZone, setAddingZone] = useState(false);
  const [newZone, setNewZone] = useState({ zona: "", tarifa: 0 });

  const saveZones = (z: DeliveryZone[]) => {
    setZonesState(z);
    localStorage.setItem(ZONES_KEY, JSON.stringify(z));
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Tarifas de Delivery por Zona</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {zones.map((z, i) => (
          <div key={z.zona + i} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg px-3 py-2">
            <span className="flex-1 text-xs font-bold text-gray-700 dark:text-zinc-200">{z.zona}</span>
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              z.tarifa === 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
              {z.tarifa === 0 ? "GRATIS" : `S/${z.tarifa.toFixed(0)}`}
            </span>
            <button
              onClick={() => saveZones(zones.filter((_, idx) => idx !== i))}
              className="text-gray-300 hover:text-red-500 transition-colors text-xs"
            >&times;</button>
          </div>
        ))}
      </div>
      {addingZone ? (
        <div className="mt-2 flex items-center gap-2">
          <input type="text" placeholder="Nombre zona" value={newZone.zona} onChange={e => setNewZone({...newZone, zona: e.target.value})} className="flex-1 text-xs border border-gray-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100" />
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">S/</span>
            <input type="number" min={0} value={newZone.tarifa} onChange={e => setNewZone({...newZone, tarifa: Number(e.target.value) || 0})} className="w-16 text-xs border border-gray-200 dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100" />
          </div>
          <button onClick={() => { if (newZone.zona.trim()) { saveZones([...zones, { zona: newZone.zona.trim(), tarifa: newZone.tarifa }]); setNewZone({ zona: "", tarifa: 0 }); setAddingZone(false); } }} className="px-2 py-1.5 rounded-lg bg-[#00B4A6] text-white text-xs font-bold">OK</button>
          <button onClick={() => setAddingZone(false)} className="text-xs text-gray-400">&times;</button>
        </div>
      ) : (
        <button onClick={() => setAddingZone(true)} className="mt-2 w-full py-1.5 rounded-lg border border-dashed border-gray-200 dark:border-zinc-600 text-xs font-bold text-gray-400 hover:text-[#00B4A6] hover:border-[#00B4A6]/40 transition-colors">
          + Agregar zona
        </button>
      )}
      <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">Estas tarifas se aplican automaticamente al checkout segun la zona del cliente.</p>
    </div>
  );
}

// ── Custom Recharts Tooltip ──────────────────────────────────────────────────

function CustomAreaTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300">{label}</p>
      <p className="text-sm font-bold font-mono text-[#00B4A6]">{fmt(payload[0].value)}</p>
    </div>
  );
}

// ── Chart type definitions ───────────────────────────────────────────────────

type ChartType = "ventas-categoria" | "metodo-pago" | "top-10" | "ventas-hora" | "tendencia-semanal" | "flujo-caja";

const CHART_OPTIONS: { id: ChartType; label: string }[] = [
  { id: "ventas-categoria", label: "Ventas por categoria (PieChart)" },
  { id: "metodo-pago", label: "Ventas por metodo de pago (PieChart)" },
  { id: "top-10", label: "Top 10 productos (BarChart)" },
  { id: "ventas-hora", label: "Ventas por hora (BarChart)" },
  { id: "tendencia-semanal", label: "Tendencia semanal (LineChart)" },
  { id: "flujo-caja", label: "Flujo de caja (ComposedChart)" },
];

const PIE_COLORS = ["#00B4A6", "#f97316", "#264653", "#e76f51", "#2a9d8f", "#e9c46a", "#606c38", "#bc6c25"];
const PAYMENT_COLORS: Record<string, string> = {
  efectivo: "#00B4A6",
  yape: "#6d28d9",
  plin: "#33C4B8",
  tarjeta: "#2563eb",
  transferencia: "#f59e0b",
};

// ── Main Component ─────────────────────────────────────────────────────────────

interface SmartDashboardTabProps {
  adminName?: string;
}

export default function SmartDashboardTab({
  adminName = "Administrador",
}: SmartDashboardTabProps) {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [period, setPeriod] = useState<Period>("hoy");

  // ── Dashboard sub-tab & regional config ───────────────────────────────────
  const [dashTab, setDashTab] = useState<DashTabId>(() => {
    try {
      const stored = localStorage.getItem("dashboard-subtab") as DashTabId | null;
      if (stored && DASHBOARD_TABS.some(t => t.id === stored)) return stored;
    } catch { /* ignore */ }
    return "resumen";
  });
  const [regionalConfig, setRegionalConfig] = useState<RegionalConfig>(getRegionalConfig);
  const [showRegionalConfig, setShowRegionalConfig] = useState(false);

  const handleDashTabChange = (tab: DashTabId) => {
    setDashTab(tab);
    localStorage.setItem("dashboard-subtab", tab);
  };

  const updateRegionalConfig = (updates: Partial<RegionalConfig>) => {
    const next = { ...regionalConfig, ...updates };
    setRegionalConfig(next);
    localStorage.setItem("regional-config", JSON.stringify(next));
  };

  // Regional-aware formatters
  const fmtR = useCallback((n: number) => formatCurrency(n, regionalConfig), [regionalConfig]);
  const fmtShortR = useCallback((n: number) => formatCurrencyShort(n, regionalConfig), [regionalConfig]);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [abandonedCartCount, setAbandonedCartCount] = useState(0);
  const [abandonedCartValue, setAbandonedCartValue] = useState(0);
  const [alerts, setAlerts] = useState<DashboardAlerts>({
    lowStock: 0,
    pendingOrders: 0,
    overduePayables: 0,
  });

  // Combo state
  const [_comboActivated, _setComboActivated] = useState(false);
  const [comboSeed, _setComboSeed] = useState(() => new Date().getDate());

  // Active charts state
  const [activeCharts, setActiveCharts] = useState<ChartType[]>(() => {
    try {
      const stored = localStorage.getItem("dashboard-active-charts");
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
  });
  const [showChartPicker, setShowChartPicker] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Widget order ──────────────────────────────────────────────────────────────

  type SectionId = "kpis" | "margen-comparador" | "top-productos" | "horario-pico" | "clientes-alertas";
  const DEFAULT_ORDER: SectionId[] = ["kpis", "margen-comparador", "top-productos", "horario-pico", "clientes-alertas"];

  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(DEFAULT_ORDER);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dashboard-widget-order");
      if (stored) {
        const parsed = JSON.parse(stored) as SectionId[];
        if (parsed.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every(id => parsed.includes(id))) {
          setSectionOrder(parsed);
        }
      }
    } catch { /* use default */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveSection = (index: number, direction: "up" | "down") => {
    const newOrder = [...sectionOrder];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setSectionOrder(newOrder);
    localStorage.setItem("dashboard-widget-order", JSON.stringify(newOrder));
  };

  const resetOrder = () => {
    setSectionOrder(DEFAULT_ORDER);
    localStorage.removeItem("dashboard-widget-order");
  };

  const isDefaultOrder = sectionOrder.every((id, i) => id === DEFAULT_ORDER[i]);

  // ── Drag and drop handlers ────────────────────────────────────────────────
  const handleDragStart = (idx: number) => { setDragIdx(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragLeave = () => { setDragOverIdx(null); };
  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const newOrder = [...sectionOrder];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    setSectionOrder(newOrder);
    localStorage.setItem("dashboard-widget-order", JSON.stringify(newOrder));
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setFetchError(null);
    try {
      const [dashRes, prodRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/products?limit=200"),
      ]);

      if (dashRes.ok) {
        const data: DashboardPayload = await dashRes.json();
        setOrders(data.orders ?? []);
        setSales(data.sales ?? []);
        setPayables(data.payables ?? []);
        setAlerts(data.alerts ?? { lowStock: 0, pendingOrders: 0, overduePayables: 0 });
      } else {
        setFetchError("No se pudo conectar con el servidor.");
      }

      if (prodRes.ok) {
        const prods: Product[] = await prodRes.json();
        setProducts(prods);
      }

      // Fetch abandoned cart stats (silent — non-critical)
      try {
        const cartRes = await fetch("/api/abandoned-cart/stats");
        if (cartRes.ok) {
          const cartData = await cartRes.json();
          setAbandonedCartCount(cartData.count ?? 0);
          setAbandonedCartValue(cartData.estimatedValue ?? 0);
        }
      } catch { /* ignore */ }

      setLastUpdated(new Date());
    } catch {
      setFetchError("Error de red al cargar el dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  // ── Derived: filtered sales by period ─────────────────────────────────────

  const filteredSales = useMemo(() => {
    if (period === "hoy") return sales.filter(s => isToday(s.createdAt));
    if (period === "semana") return sales.filter(s => isThisWeek(s.createdAt));
    return sales.filter(s => isThisMonth(s.createdAt));
  }, [sales, period]);

  const salesToday = useMemo(
    () => sales.filter((s) => isToday(s.createdAt)),
    [sales]
  );

  const revenueFiltered = useMemo(
    () => filteredSales.reduce((acc, s) => acc + (s.total ?? 0), 0),
    [filteredSales]
  );

  const revenueToday = useMemo(
    () => salesToday.reduce((acc, s) => acc + (s.total ?? 0), 0),
    [salesToday]
  );

  // ── Derived: pedidos activos ────────────────────────────────────────────────

  const _activeOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "pendiente" || o.status === "confirmado" || o.status === "en_camino"
      ).length,
    [orders]
  );

  // ── Derived: fiados pendientes (cuentas por cobrar) ────────────────────────

  const _pendingFiados = useMemo(
    () => payables.filter((p) => p.status !== "pagado").length,
    [payables]
  );

  // ── Derived: stock bajo ─────────────────────────────────────────────────────

  const _lowStockCount = useMemo(() => alerts.lowStock, [alerts]);

  // ── Derived: margen promedio ────────────────────────────────────────────────

  const marginFiltered = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    for (const sale of filteredSales) {
      revenue += sale.total ?? 0;
      const items: Array<{ price?: number; costPrice?: number; quantity: number }> =
        sale.items ?? [];
      for (const item of items) {
        const cost = item.costPrice ?? (item.price ?? 0) * 0.7;
        cogs += cost * item.quantity;
      }
    }
    if (revenue === 0) return 0;
    return ((revenue - cogs) / revenue) * 100;
  }, [filteredSales]);

  const marginToday = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    for (const sale of salesToday) {
      revenue += sale.total ?? 0;
      const items: Array<{ price?: number; costPrice?: number; quantity: number }> =
        sale.items ?? [];
      for (const item of items) {
        const cost = item.costPrice ?? (item.price ?? 0) * 0.7;
        cogs += cost * item.quantity;
      }
    }
    if (revenue === 0) return 0;
    return ((revenue - cogs) / revenue) * 100;
  }, [salesToday]);

  // ── Derived: mes actual vs anterior ────────────────────────────────────────

  const { revenueThisMonth, revenuePrevMonth, monthDelta } = useMemo(() => {
    const thisM = sales
      .filter((s) => isThisMonth(s.createdAt))
      .reduce((acc, s) => acc + (s.total ?? 0), 0);
    const prevM = sales
      .filter((s) => isLastMonth(s.createdAt))
      .reduce((acc, s) => acc + (s.total ?? 0), 0);
    const delta = prevM === 0 ? 0 : ((thisM - prevM) / prevM) * 100;
    return { revenueThisMonth: thisM, revenuePrevMonth: prevM, monthDelta: delta };
  }, [sales]);

  // ── Derived: ventas hoy vs ayer ──────────────────────────────────────────

  const { revenueYesterday, salesYesterdayCount, hoyVsAyerPct } = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toDateString();
    const salesYesterday = sales.filter(s => {
      try { return new Date(s.createdAt).toDateString() === yStr; } catch { return false; }
    });
    const revYesterday = salesYesterday.reduce((acc, s) => acc + (s.total ?? 0), 0);
    const pct = revYesterday === 0 ? (revenueToday > 0 ? 100 : 0) : ((revenueToday - revYesterday) / revYesterday) * 100;
    return { revenueYesterday: revYesterday, salesYesterdayCount: salesYesterday.length, hoyVsAyerPct: pct };
  }, [sales, revenueToday]);

  // ── Derived: clientes period ──────────────────────────────────────────────

  const clientesFiltered = useMemo(() => {
    const phones = new Set<string>();
    for (const s of filteredSales) {
      const phone = (s as unknown as { customerPhone?: string }).customerPhone || "anon";
      phones.add(phone);
    }
    return phones.size;
  }, [filteredSales]);

  const clientesHoy = useMemo(() => {
    const phones = new Set<string>();
    for (const s of salesToday) {
      const phone = (s as unknown as { customerPhone?: string }).customerPhone || "anon";
      phones.add(phone);
    }
    return phones.size;
  }, [salesToday]);

  // ── Derived: productos vendidos period ────────────────────────────────────

  const _productosVendidosFiltered = useMemo(() => {
    let count = 0;
    for (const s of filteredSales) {
      const items: Array<{ quantity: number }> = s.items ?? [];
      for (const item of items) {
        count += item.quantity;
      }
    }
    return count;
  }, [filteredSales]);

  // ── Derived: ticket promedio ──────────────────────────────────────────────

  const ticketPromedio = useMemo(() => {
    if (filteredSales.length === 0) return 0;
    return revenueFiltered / filteredSales.length;
  }, [revenueFiltered, filteredSales]);

  // ── Derived: top 10 productos más vendidos ─────────────────────────────────

  const topProducts = useMemo<TopProduct[]>(() => {
    const map = new Map<string, TopProduct>();
    for (const sale of sales) {
      const items: Array<{ productId?: number | string; name?: string; price?: number; quantity: number }> =
        sale.items ?? [];
      for (const item of items) {
        const key = String(item.productId ?? item.name ?? "?");
        const existing = map.get(key);
        if (existing) {
          existing.qty += item.quantity;
          existing.revenue += (item.price ?? 0) * item.quantity;
        } else {
          map.set(key, {
            id: item.productId ?? key,
            name: item.name ?? "Producto",
            qty: item.quantity,
            revenue: (item.price ?? 0) * item.quantity,
          });
        }
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [sales]);

  const maxProductQty = useMemo(
    () => (topProducts.length > 0 ? topProducts[0].qty : 1),
    [topProducts]
  );

  // ── Derived: top 5 clientes del mes ────────────────────────────────────────

  const topCustomers = useMemo<TopCustomer[]>(() => {
    const map = new Map<string, TopCustomer>();
    const monthOrders = orders.filter(
      (o) => isThisMonth(o.createdAt) && o.status !== "cancelado"
    );
    for (const order of monthOrders) {
      const key = order.customer?.phone ?? order.customer?.name ?? "?";
      const existing = map.get(key);
      if (existing) {
        existing.total += order.total ?? 0;
        existing.orderCount += 1;
      } else {
        map.set(key, {
          name: order.customer?.name ?? "Cliente",
          phone: order.customer?.phone,
          total: order.total ?? 0,
          orderCount: 1,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [orders]);

  // ── Derived: horario pico ────────────────────────────────────────────────

  const hourBuckets = useMemo<HourBucket[]>(() => {
    const buckets: number[] = new Array(24).fill(0);
    for (const sale of salesToday) {
      try {
        const h = new Date(sale.createdAt).getHours();
        buckets[h] += sale.total ?? 0;
      } catch { /* ignore */ }
    }
    return Array.from({ length: 17 }, (_, i) => {
      const hour = i + 6;
      return { hour, label: `${String(hour).padStart(2, "0")}h`, amount: buckets[hour] ?? 0 };
    });
  }, [salesToday]);

  const maxHourAmount = useMemo(
    () => Math.max(1, ...hourBuckets.map((b) => b.amount)),
    [hourBuckets]
  );

  // ── Derived: lotes por vencer ───────────────────────────────────────────────

  const expiringBatchCount = useMemo(() => {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + 7);
    return products.filter((p) => {
      if (!p.expiryDate) return false;
      try {
        const exp = new Date(p.expiryDate);
        return exp >= now && exp <= threshold;
      } catch { return false; }
    }).length;
  }, [products]);

  // ── Derived: Ventas diarias del mes (para el AreaChart) ────────────────────

  const monthlyDailyData = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDate();
    const monthNames = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const monthLabel = monthNames[now.getMonth()];
    const dailyMap = new Map<number, number>();

    for (let d = 1; d <= currentDay; d++) {
      dailyMap.set(d, 0);
    }

    for (const s of sales) {
      if (!isThisMonth(s.createdAt)) continue;
      try {
        const d = new Date(s.createdAt).getDate();
        dailyMap.set(d, (dailyMap.get(d) ?? 0) + (s.total ?? 0));
      } catch { /* ignore */ }
    }

    return Array.from(dailyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, total]) => ({
        name: `${day} ${monthLabel}.`,
        ventas: total,
      }));
  }, [sales]);

  // ── Derived: Cuentas por cobrar (fiados) ──────────────────────────────────

  const cuentasPorCobrar = useMemo(() => {
    const pending = payables.filter(p => p.status !== "pagado");
    const now = new Date();
    let vigentes = 0;
    let vencidas = 0;
    let vigentesCount = 0;
    let vencidasCount = 0;
    for (const p of pending) {
      const balance = p.amount - p.paidAmount;
      if (p.dueDate && new Date(p.dueDate) < now) {
        vencidas += balance;
        vencidasCount++;
      } else {
        vigentes += balance;
        vigentesCount++;
      }
    }
    return { total: vigentes + vencidas, vigentes, vencidas, count: pending.length, vigentesCount, vencidasCount };
  }, [payables]);

  // ── Derived: Cuentas por pagar (proveedores) ─────────────────────────────

  const cuentasPorPagar = useMemo(() => {
    // Use payables that are supplier-related
    const pending = payables.filter(p => p.status !== "pagado" && p.supplierId);
    const now = new Date();
    let vigentes = 0;
    let vencidas = 0;
    for (const p of pending) {
      const balance = p.amount - p.paidAmount;
      if (p.dueDate && new Date(p.dueDate) < now) {
        vencidas += balance;
      } else {
        vigentes += balance;
      }
    }
    return { total: vigentes + vencidas, vigentes, vencidas, count: pending.length };
  }, [payables]);

  // ── Derived: IGV ventas del mes ─────────────────────────────────────────

  const igvVentasMes = useMemo(() => {
    return revenueThisMonth * 18 / 118;
  }, [revenueThisMonth]);

  // ── Derived: Devoluciones ────────────────────────────────────────────────

  const devoluciones = useMemo(() => {
    return sales
      .filter(s => isThisMonth(s.createdAt) && (s.status === "devuelto" || s.status === "anulado"))
      .reduce((acc, s) => acc + (s.total ?? 0), 0);
  }, [sales]);

  // ── Derived: Clientes con ventas del mes ────────────────────────────────

  const _clientesConVentasMes = useMemo(() => {
    const phones = new Set<string>();
    for (const s of sales) {
      if (!isThisMonth(s.createdAt)) continue;
      const phone = (s as unknown as { customerPhone?: string }).customerPhone || "anon";
      if (phone !== "anon") phones.add(phone);
    }
    return phones.size;
  }, [sales]);

  // ── Derived: semana anterior comparison ────────────────────────────────────

  const semanaAnterior = useMemo(() => {
    const hoy = new Date();
    const hace7 = new Date(hoy);
    hace7.setDate(hace7.getDate() - 7);
    const hace7Str = hace7.toDateString();
    const diaLabel = hace7.toLocaleDateString("es-PE", { weekday: "long" });
    const ventasSemPasada = sales
      .filter(s => { try { return new Date(s.createdAt).toDateString() === hace7Str; } catch { return false; } })
      .reduce((acc, s) => acc + (s.total ?? 0), 0);
    if (ventasSemPasada === 0) return null;
    const pct = ((revenueToday - ventasSemPasada) / ventasSemPasada) * 100;
    return { diaLabel, monto: ventasSemPasada, pct };
  }, [sales, revenueToday]);

  // ── Derived: Hito motivacional ───────────────────────────────────────────

  const hitoProximo = useMemo(() => {
    const hitosVentas = [
      { meta: 500, label: "S/500 en ventas" },
      { meta: 1000, label: "S/1,000 en ventas" },
      { meta: 2000, label: "S/2,000 en ventas" },
      { meta: 5000, label: "S/5,000 en ventas" },
    ];
    const hitosCount = [
      { meta: 20, label: "20 ventas" },
      { meta: 50, label: "50 ventas" },
    ];
    for (const h of hitosVentas) {
      const falta = h.meta - revenueToday;
      if (falta > 0 && falta < h.meta * 0.5) return { falta: `S/${falta.toFixed(0)}`, label: h.label };
    }
    for (const h of hitosCount) {
      const falta = h.meta - salesToday.length;
      if (falta > 0 && falta < h.meta * 0.5) return { falta: String(falta), label: h.label };
    }
    if (revenueToday >= 5000) return { falta: null, label: "Dia excepcional" };
    return null;
  }, [revenueToday, salesToday.length]);

  // ── Derived: clima negocio ───────────────────────────────────────────────

  const _climaNegocio = useMemo(() => {
    const promedioVentas = revenueThisMonth / Math.max(1, new Date().getDate());
    const ventasBien = revenueToday >= promedioVentas * 0.8 ? 1 : 0;
    const stockCritico = products.filter(p => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin).length;
    const stockOK = products.length > 0 ? (stockCritico / products.length < 0.1 ? 1 : 0) : 1;
    const fiadosVencidos = payables.filter(p => p.status === "VENCIDO" || (p.dueDate && new Date(p.dueDate) < new Date() && p.status !== "pagado")).length;
    const fiadosTotal = payables.filter(p => p.status !== "pagado").length;
    const fiadosOK = fiadosTotal === 0 || (fiadosVencidos / fiadosTotal < 0.3) ? 1 : 0;
    const score = ventasBien + stockOK + fiadosOK;
    const map: Record<number, { texto: string }> = {
      3: { texto: "Todo excelente" },
      2: { texto: "Bien, con detalles" },
      1: { texto: "Necesita atencion" },
      0: { texto: "Dia dificil" },
    };
    return map[score] ?? map[0];
  }, [revenueToday, revenueThisMonth, products, payables]);

  // ── Derived: proyeccion mensual ───────────────────────────────────────────

  const monthProjection = useMemo(() => {
    const now = new Date();
    const diasTranscurridos = now.getDate();
    const diasTotales = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (diasTranscurridos === 0 || revenueThisMonth === 0) return null;
    const proyeccion = (revenueThisMonth / diasTranscurridos) * diasTotales;
    const porcentaje = Math.round((revenueThisMonth / proyeccion) * 100);
    return { ventasMes: revenueThisMonth, proyeccion, porcentaje, diasTranscurridos, diasTotales };
  }, [revenueThisMonth]);

  // ── Derived: Proximos pagos ───────────────────────────────────────────────

  const upcomingPayables = useMemo(() => {
    const now = new Date();
    const weekLater = new Date(now);
    weekLater.setDate(weekLater.getDate() + 7);
    const pending = payables.filter(p => p.status !== "pagado" && p.dueDate);
    const overdue = pending.filter(p => {
      try { return new Date(p.dueDate!).getTime() < now.getTime(); } catch { return false; }
    });
    const upcoming = pending
      .filter(p => {
        try {
          const d = new Date(p.dueDate!).getTime();
          return d >= now.getTime() && d <= weekLater.getTime();
        } catch { return false; }
      })
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
      .slice(0, 3);
    return { overdue: overdue.length, upcoming };
  }, [payables]);

  // ── Derived: clientes promedio ────────────────────────────────────────────

  const { clientesAyer, clientesPromedio } = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toDateString();
    const yesterdayPhones = new Set<string>();
    const last7Days = new Map<string, Set<string>>();
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt);
        const dStr = d.toDateString();
        const phone = (s as unknown as { customerPhone?: string }).customerPhone || "anon";
        if (dStr === yStr) yesterdayPhones.add(phone);
        if (Date.now() - d.getTime() < 7 * 86400000) {
          if (!last7Days.has(dStr)) last7Days.set(dStr, new Set());
          last7Days.get(dStr)!.add(phone);
        }
      } catch { /* ignore */ }
    }
    const dailyCounts = Array.from(last7Days.values()).map(s => s.size);
    const avg = dailyCounts.length > 0 ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : 0;
    return { clientesAyer: yesterdayPhones.size, clientesPromedio: Math.round(avg) };
  }, [sales]);

  // ── Derived: productos que se agotan ──────────────────────────────────────

  const productsRunningOut = useMemo(() => {
    const salesByProduct = new Map<number | string, number>();
    const now = Date.now();
    let daysSpan = 0;
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt).getTime();
        if (now - d < 14 * 86400000) {
          daysSpan = Math.max(daysSpan, (now - d) / 86400000);
          const items: Array<{ productId?: number | string; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; quantity: number }> }).items ?? [];
          for (const item of items) {
            const key = item.productId ?? "?";
            salesByProduct.set(key, (salesByProduct.get(key) ?? 0) + item.quantity);
          }
        }
      } catch { /* ignore */ }
    }
    if (daysSpan < 1) daysSpan = 1;
    return products
      .filter(p => p.stock != null && p.stock > 0 && (p.stockMin ?? 0) > 0)
      .map(p => {
        const totalSold = salesByProduct.get(p.id) ?? 0;
        const dailyAvg = totalSold / daysSpan;
        const daysLeft = dailyAvg > 0 ? p.stock! / dailyAvg : 999;
        return { id: p.id, name: p.name, stock: p.stock!, daysLeft: Math.round(daysLeft) };
      })
      .filter(p => p.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  }, [products, sales]);

  // ── Derived: producto en declive ──────────────────────────────────────────

  const decliningProduct = useMemo(() => {
    const now = Date.now();
    const thisWeekMap: Record<string, number> = {};
    const lastWeekMap: Record<string, number> = {};
    const nameMap: Record<string, string> = {};
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt).getTime();
        const items: Array<{ productId?: number | string; name?: string; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; name?: string; quantity: number }> }).items ?? [];
        for (const item of items) {
          const pid = String(item.productId ?? item.name ?? "?");
          nameMap[pid] = item.name ?? "Producto";
          if (now - d < 7 * 86400000) thisWeekMap[pid] = (thisWeekMap[pid] ?? 0) + item.quantity;
          else if (now - d < 14 * 86400000) lastWeekMap[pid] = (lastWeekMap[pid] ?? 0) + item.quantity;
        }
      } catch { /* ignore */ }
    }
    let worst: { name: string; pct: number } | null = null;
    for (const [pid, qtyLast] of Object.entries(lastWeekMap)) {
      if (qtyLast <= 3) continue;
      const qtyThis = thisWeekMap[pid] ?? 0;
      if (qtyThis < qtyLast * 0.7) {
        const pct = Math.round(((qtyLast - qtyThis) / qtyLast) * 100);
        if (!worst || pct > worst.pct) worst = { name: nameMap[pid], pct };
      }
    }
    return worst;
  }, [sales]);

  // ── Derived: dia mas rentable ─────────────────────────────────────────────

  const bestDay = useMemo(() => {
    const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    const dayTotals: Record<number, number[]> = {};
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt);
        const dow = d.getDay();
        if (!dayTotals[dow]) dayTotals[dow] = [];
        dayTotals[dow].push(s.total ?? 0);
      } catch { /* ignore */ }
    }
    if (Object.keys(dayTotals).length < 3) return null;
    const dayAvgs = Object.entries(dayTotals).map(([dow, vals]) => ({
      dow: Number(dow),
      name: dayNames[Number(dow)],
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    }));
    dayAvgs.sort((a, b) => b.avg - a.avg);
    const best = dayAvgs[0];
    const worst = dayAvgs[dayAvgs.length - 1];
    const othersAvg = dayAvgs.slice(1).reduce((s, d) => s + d.avg, 0) / Math.max(1, dayAvgs.length - 1);
    const pctVsOthers = othersAvg > 0 ? Math.round(((best.avg - othersAvg) / othersAvg) * 100) : 0;
    return { best, worst, pctVsOthers };
  }, [sales]);

  // ── Derived: categoria que crece ──────────────────────────────────────────

  const growingCategory = useMemo(() => {
    const now = Date.now();
    const thisWeekMap: Record<string, number> = {};
    const lastWeekMap: Record<string, number> = {};
    for (const s of sales) {
      try {
        const d = new Date(s.createdAt).getTime();
        const items: Array<{ productId?: number | string; price?: number; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; price?: number; quantity: number }> }).items ?? [];
        for (const item of items) {
          const prod = products.find(p => String(p.id) === String(item.productId));
          const cat = prod?.category ?? "General";
          const rev = (item.price ?? 0) * item.quantity;
          if (now - d < 7 * 86400000) thisWeekMap[cat] = (thisWeekMap[cat] ?? 0) + rev;
          else if (now - d < 14 * 86400000) lastWeekMap[cat] = (lastWeekMap[cat] ?? 0) + rev;
        }
      } catch { /* ignore */ }
    }
    const cats = Object.keys({ ...thisWeekMap, ...lastWeekMap });
    if (cats.length === 0) return null;
    const growth = cats.map(cat => {
      const tw = thisWeekMap[cat] ?? 0;
      const lw = lastWeekMap[cat] ?? 0;
      const pct = lw > 0 ? ((tw - lw) / lw) * 100 : tw > 0 ? 100 : 0;
      return { cat, thisWeek: tw, lastWeek: lw, pct };
    }).filter(c => c.thisWeek > 0 || c.lastWeek > 0);
    growth.sort((a, b) => b.pct - a.pct);
    const top = growth[0] ?? null;
    const bottom = growth[growth.length - 1] ?? null;
    return { top, bottom: bottom && bottom.pct < -5 ? bottom : null };
  }, [sales, products]);

  // ── Derived: cliente del mes ──────────────────────────────────────────────

  const topClientMonth = useMemo(() => {
    if (topCustomers.length === 0) return null;
    const c = topCustomers[0];
    const monthName = new Date().toLocaleString("es-PE", { month: "long" });
    return { ...c, monthName, avg: c.orderCount > 0 ? c.total / c.orderCount : 0 };
  }, [topCustomers]);

  // ── Derived: ventas 7 dias ────────────────────────────────────────────────

  const last7DaysData = useMemo(() => {
    const initials = ["D", "L", "M", "M", "J", "V", "S"];
    const days: { label: string; initial: string; total: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toDateString();
      const dayTotal = sales
        .filter(s => { try { return new Date(s.createdAt).toDateString() === dStr; } catch { return false; } })
        .reduce((acc, s) => acc + (s.total ?? 0), 0);
      days.push({ label: d.toLocaleDateString("es-PE", { weekday: "short" }), initial: initials[d.getDay()], total: dayTotal, isToday: i === 0 });
    }
    return days;
  }, [sales]);

  const _max7Day = useMemo(() => Math.max(1, ...last7DaysData.map(d => d.total)), [last7DaysData]);

  // ── Derived: rentabilidad ─────────────────────────────────────────────────

  const rentabilidadHoy = useMemo(() => {
    const margen = marginToday > 0 ? marginToday / 100 : 0.25;
    return revenueToday * margen;
  }, [revenueToday, marginToday]);

  // ── Derived: cierre de ayer ───────────────────────────────────────────────

  const [noClosedYesterday, setNoClosedYesterday] = useState(false);
  const [ignoredClose, setIgnoredClose] = useState(false);

  useEffect(() => {
    try {
      const lastClose = localStorage.getItem("last-daily-close");
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      if (!lastClose || lastClose < yStr) setNoClosedYesterday(true);
    } catch { /* ignore */ }
  }, []);

  // ── Derived: productos sin vender hoy ─────────────────────────────────────

  const productosSinVenderHoy = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toDateString();
    const todayStr = new Date().toDateString();
    const productIdsAyer = new Set<string>();
    const productIdsHoy = new Set<string>();
    const productNamesAyer = new Map<string, { name: string; qty: number }>();
    for (const s of sales) {
      try {
        const dStr = new Date(s.createdAt).toDateString();
        const items: Array<{ productId?: number | string; name?: string; quantity: number }> = (s as unknown as { items?: Array<{ productId?: number | string; name?: string; quantity: number }> }).items ?? [];
        for (const item of items) {
          const key = String(item.productId ?? item.name ?? "?");
          if (dStr === yStr) {
            productIdsAyer.add(key);
            const ex = productNamesAyer.get(key);
            if (ex) ex.qty += item.quantity;
            else productNamesAyer.set(key, { name: item.name ?? "Producto", qty: item.quantity });
          }
          if (dStr === todayStr) productIdsHoy.add(key);
        }
      } catch { /* ignore */ }
    }
    if (productIdsAyer.size === 0) return [];
    const missing: { name: string; qty: number }[] = [];
    for (const [key, val] of productNamesAyer) {
      if (!productIdsHoy.has(key)) missing.push(val);
    }
    return missing.sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [sales]);

  // ── Derived: mejor hora hoy ───────────────────────────────────────────────

  const bestHourToday = useMemo(() => {
    if (salesToday.length === 0) return null;
    const hourMap = new Map<number, { total: number; count: number }>();
    for (const s of salesToday) {
      try {
        const h = new Date(s.createdAt).getHours();
        const ex = hourMap.get(h) || { total: 0, count: 0 };
        ex.total += s.total ?? 0;
        ex.count++;
        hourMap.set(h, ex);
      } catch { /* ignore */ }
    }
    let best: { hour: number; total: number; count: number } | null = null;
    for (const [hour, data] of hourMap) {
      if (!best || data.total > best.total) best = { hour, ...data };
    }
    return best;
  }, [salesToday]);

  // ── Derived: dias sin cierre ──────────────────────────────────────────────

  const [diasSinCierre, setDiasSinCierre] = useState<number | null>(null);
  useEffect(() => {
    try {
      const lastClose = localStorage.getItem("last-daily-close");
      if (!lastClose) { setDiasSinCierre(7); return; }
      const d = Math.floor((Date.now() - new Date(lastClose).getTime()) / 86400000);
      setDiasSinCierre(d);
    } catch { setDiasSinCierre(null); }
  }, []);

  // ── Meta del dia ──────────────────────────────────────────────────────────

  const [dailyGoal, setDailyGoal] = useState<number>(800);
  const [_editingGoal, setEditingGoal] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("daily-goal");
      if (stored) setDailyGoal(Number(stored) || 800);
    } catch { /* ignore */ }
  }, []);
  const _saveDailyGoal = (val: number) => {
    const safe = Math.max(100, Math.min(99999, val));
    setDailyGoal(safe);
    localStorage.setItem("daily-goal", String(safe));
    setEditingGoal(false);
  };

  // ── Derived: dato curioso ─────────────────────────────────────────────────

  const _datoCurioso = useMemo(() => {
    const datos: string[] = [];
    if (revenueToday > 0) datos.push(`Has vendido ${salesToday.length} productos hoy`);
    if (topProducts[0]) datos.push(`${topProducts[0].name} se vendio ${topProducts[0].qty} veces esta semana`);
    if (topCustomers.length > 0) datos.push(`${topCustomers.length} clientes confiaron en tu bodega este mes`);
    if (datos.length === 0) return "Tu bodega esta creciendo";
    return datos[Math.floor(Math.random() * datos.length)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueToday, salesToday.length, topProducts.length, marginToday]);

  // ── Derived: logro desbloqueado ───────────────────────────────────────────

  const [showLogro, setShowLogro] = useState(false);
  const logro = useMemo(() => {
    const promedioVentas = revenueThisMonth / Math.max(1, new Date().getDate());
    const logros = [
      revenueToday >= 1000 && { emoji: "trophy", texto: "S/1,000 en un dia!" },
      salesToday.length >= 50 && { emoji: "fire", texto: "50 ventas en un dia!" },
      promedioVentas > 0 && revenueToday > promedioVentas * 1.5 && { emoji: "chart", texto: "Mejor dia del mes!" },
      clientesHoy >= 20 && { emoji: "people", texto: "20 clientes en un dia!" },
    ].filter(Boolean) as { emoji: string; texto: string }[];
    return logros[0] ?? null;
  }, [revenueToday, salesToday.length, revenueThisMonth, clientesHoy]);

  useEffect(() => {
    if (!logro) return;
    const todayKey = `achievements-${new Date().toISOString().slice(0, 10)}`;
    try {
      const seen = JSON.parse(localStorage.getItem(todayKey) || "[]") as string[];
      if (seen.includes(logro.texto)) return;
      seen.push(logro.texto);
      localStorage.setItem(todayKey, JSON.stringify(seen));
      setShowLogro(true);
      const t = setTimeout(() => setShowLogro(false), 10000);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, [logro]);

  // ── Insights generation ───────────────────────────────────────────────────

  const insights = useMemo(() => {
    const list: { type: "positive" | "negative" | "neutral"; text: string }[] = [];

    const fiadosVencidos = payables.filter(p => p.dueDate && new Date(p.dueDate) < new Date() && p.status !== "pagado").length;
    if (fiadosVencidos > 0) {
      list.push({ type: "negative", text: `${fiadosVencidos} fiado${fiadosVencidos > 1 ? "s" : ""} vencido${fiadosVencidos > 1 ? "s" : ""} pendiente${fiadosVencidos > 1 ? "s" : ""} de cobro` });
    }

    const dow = new Date().getDay();
    if (dow === 6) {
      list.push({ type: "neutral", text: "Hoy es sabado — prepara stock de bebidas y productos de fin de semana" });
    } else if (dow === 0) {
      list.push({ type: "neutral", text: "Hoy es domingo — dia ideal para revisar inventario y planificar la semana" });
    }

    if (hoyVsAyerPct > 20 && revenueToday > 0) {
      list.push({ type: "positive", text: `Ventas +${hoyVsAyerPct.toFixed(0)}% vs ayer — buen ritmo` });
    } else if (hoyVsAyerPct < -30 && revenueYesterday > 0) {
      list.push({ type: "negative", text: `Ventas ${hoyVsAyerPct.toFixed(0)}% vs ayer — considera una promocion` });
    }

    if (alerts.lowStock > 5) {
      list.push({ type: "negative", text: `${alerts.lowStock} productos con stock bajo — programa reposicion` });
    }

    if (list.length === 0) {
      // Fallback especifico con datos reales
      const stockOk = products.length > 0 ? products.filter(p => p.stock != null && p.stockMin != null && p.stock > p.stockMin).length : 0;
      const pctStockOk = products.length > 0 ? Math.round((stockOk / products.length) * 100) : 100;
      list.push({ type: "positive", text: `${pctStockOk}% de tu inventario con stock saludable — ${alerts.lowStock === 0 ? "sin alertas" : `${alerts.lowStock} con stock bajo`}` });
    }

    return list.slice(0, 3);
  }, [marginToday, payables, hoyVsAyerPct, revenueToday, revenueYesterday, alerts.lowStock, products]);

  // ── Chart data computations ───────────────────────────────────────────────

  const chartVentasCategoria = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const s of sales) {
      if (!isThisMonth(s.createdAt)) continue;
      const items: Array<{ productId?: number | string; price?: number; quantity: number }> = s.items ?? [];
      for (const item of items) {
        const prod = products.find(p => String(p.id) === String(item.productId));
        const cat = prod?.category ?? "General";
        catMap.set(cat, (catMap.get(cat) ?? 0) + (item.price ?? 0) * item.quantity);
      }
    }
    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [sales, products]);

  const chartMetodoPago = useMemo(() => {
    const payMap = new Map<string, number>();
    for (const s of sales) {
      if (!isThisMonth(s.createdAt)) continue;
      const pay = (s as unknown as { payment?: string }).payment ?? (s as unknown as { paymentMethod?: string }).paymentMethod ?? "efectivo";
      payMap.set(pay, (payMap.get(pay) ?? 0) + (s.total ?? 0));
    }
    return Array.from(payMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sales]);

  const chartTop10 = useMemo(() => {
    return topProducts.map(p => ({ name: p.name.length > 20 ? p.name.slice(0, 20) + "..." : p.name, qty: p.qty, revenue: p.revenue }));
  }, [topProducts]);

  const chartVentasHora = useMemo(() => {
    return hourBuckets.map(b => ({ name: b.label, ventas: b.amount }));
  }, [hourBuckets]);

  const chartTendenciaSemanal = useMemo(() => {
    return last7DaysData.map(d => ({ name: d.initial, ventas: d.total }));
  }, [last7DaysData]);

  const chartFlujoCaja = useMemo(() => {
    const days: { name: string; ingresos: number; egresos: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toDateString();
      const initials = ["D", "L", "M", "M", "J", "V", "S"];
      const ingresos = sales
        .filter(s => { try { return new Date(s.createdAt).toDateString() === dStr; } catch { return false; } })
        .reduce((acc, s) => acc + (s.total ?? 0), 0);
      // Approximate egresos as cost (70% of sales)
      days.push({ name: initials[d.getDay()], ingresos, egresos: ingresos * 0.7 });
    }
    return days;
  }, [sales]);

  // ── Chart management ──────────────────────────────────────────────────────

  const addChart = (chartId: ChartType) => {
    if (activeCharts.length >= 6 || activeCharts.includes(chartId)) return;
    const next = [...activeCharts, chartId];
    setActiveCharts(next);
    localStorage.setItem("dashboard-active-charts", JSON.stringify(next));
    setShowChartPicker(false);
  };

  const removeChart = (chartId: ChartType) => {
    const next = activeCharts.filter(c => c !== chartId);
    setActiveCharts(next);
    localStorage.setItem("dashboard-active-charts", JSON.stringify(next));
  };

  const moveChart = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeCharts.length) return;
    const next = [...activeCharts];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setActiveCharts(next);
    localStorage.setItem("dashboard-active-charts", JSON.stringify(next));
  };

  // ── Combo generation ──────────────────────────────────────────────────────

  const comboData = useMemo(() => {
    const combosPredefinidos = [
      { nombre: "Combo Desayuno", items: ["pan", "leche", "huevo"], descuento: 8 },
      { nombre: "Combo Almuerzo", items: ["arroz", "aceite", "fideos"], descuento: 10 },
      { nombre: "Combo Fiesta", items: ["cerveza", "gaseosa", "galleta"], descuento: 12 },
      { nombre: "Combo Limpieza", items: ["detergente", "lejia", "jabon"], descuento: 7 },
      { nombre: "Combo Bebe", items: ["panal", "leche", "colonia"], descuento: 9 },
    ];
    const comboIndex = comboSeed % combosPredefinidos.length;
    const comboPredefinido = combosPredefinidos[comboIndex];

    const comboProducts: { product: Product; found: boolean }[] = [];
    for (const searchTerm of comboPredefinido.items) {
      const found = products.find(p => p.name.toLowerCase().includes(searchTerm) && p.active !== false && (p.stock ?? 1) > 0);
      comboProducts.push({ product: found || { id: 0, name: searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1), price: 0, active: true } as Product, found: !!found });
    }

    const allFound = comboProducts.every(c => c.found);
    const totalNormal = comboProducts.filter(c => c.found).reduce((s, c) => s + c.product.price, 0);
    const totalCombo = totalNormal * (1 - comboPredefinido.descuento / 100);
    const ahorro = totalNormal - totalCombo;

    // If no match, try top 3 products
    if (!allFound && topProducts.length >= 3) {
      const top3Products = topProducts.slice(0, 3).map(tp => products.find(p => String(p.id) === String(tp.id))).filter(Boolean) as Product[];
      if (top3Products.length >= 2) {
        const total = top3Products.reduce((s, p) => s + p.price, 0);
        const comboPrice = total * 0.9;
        return {
          nombre: "Combo Top Ventas",
          products: top3Products.map(p => ({ name: p.name, price: p.price, image: p.image, found: true })),
          totalNormal: total,
          totalCombo: comboPrice,
          ahorro: total - comboPrice,
        };
      }
    }

    return {
      nombre: comboPredefinido.nombre,
      products: comboProducts.map(cp => ({ name: cp.product.name, price: cp.product.price, image: cp.found ? cp.product.image : undefined, found: cp.found })),
      totalNormal,
      totalCombo: allFound ? totalCombo : 0,
      ahorro: allFound ? ahorro : 0,
    };
  }, [products, topProducts, comboSeed]);

  // ── Greeting ──────────────────────────────────────────────────────────────

  const { text: _greetingText, Icon: GreetingIcon } = getGreeting();

  // ── hasAnyAlert ───────────────────────────────────────────────────────────

  const hasAnyAlert =
    alerts.lowStock > 0 || alerts.overduePayables > 0 || expiringBatchCount > 0;

  // ── Render chart by type ──────────────────────────────────────────────────

  const renderChart = (chartId: ChartType) => {
    switch (chartId) {
      case "ventas-categoria":
        return chartVentasCategoria.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Pie data={chartVentasCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(({ name, percent }: any) => `${name} ${(Number(percent) * 100).toFixed(0)}%`) as any} labelLine={false} fontSize={10}>
                {chartVentasCategoria.map((_, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className="text-xs text-gray-400 text-center py-8">Sin datos de categorias</p>;

      case "metodo-pago":
        return chartMetodoPago.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Pie data={chartMetodoPago} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(({ name, percent }: any) => `${name} ${(Number(percent) * 100).toFixed(0)}%`) as any} labelLine={false} fontSize={10}>
                {chartMetodoPago.map((entry, index) => (
                  <Cell key={index} fill={PAYMENT_COLORS[entry.name] ?? PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className="text-xs text-gray-400 text-center py-8">Sin datos de pago</p>;

      case "top-10":
        return chartTop10.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartTop10} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" fontSize={10} />
              <YAxis type="category" dataKey="name" fontSize={9} width={55} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={((value: any, name: any) => String(name) === "qty" ? `${value} uds` : fmt(Number(value))) as any} />
              <Bar dataKey="qty" fill="#00B4A6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-xs text-gray-400 text-center py-8">Sin datos de productos</p>;

      case "ventas-hora":
        return (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartVentasHora} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" fontSize={9} />
              <YAxis fontSize={10} tickFormatter={(v: number) => fmtShort(v)} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
              <Bar dataKey="ventas" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      case "tendencia-semanal":
        return (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartTendenciaSemanal} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} tickFormatter={(v: number) => fmtShort(v)} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
              <Line type="monotone" dataKey="ventas" stroke="#00B4A6" strokeWidth={2} dot={{ r: 4, fill: "#00B4A6" }} />
            </LineChart>
          </ResponsiveContainer>
        );

      case "flujo-caja":
        return (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartFlujoCaja} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} tickFormatter={(v: number) => fmtShort(v)} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip formatter={((value: any) => fmt(Number(value))) as any} />
              <Legend fontSize={10} />
              <Bar dataKey="ingresos" fill="#00B4A6" radius={[4, 4, 0, 0]} name="Ingresos" />
              <Bar dataKey="egresos" fill="#e76f51" radius={[4, 4, 0, 0]} name="Egresos" />
              <Line type="monotone" dataKey="ingresos" stroke="#00B4A6" strokeWidth={2} dot={false} name="Tendencia" />
            </ComposedChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  const chartLabel = (id: ChartType) => CHART_OPTIONS.find(o => o.id === id)?.label ?? id;

  // ══════════════════════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto">

      {/* ════════════════════════════════════════════════════════════════════
          SECCION 1: HEADER + PERIOD SELECTOR + KPIs
          ════════════════════════════════════════════════════════════════════ */}

      {/* Header: Resumen + period selector + refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20">
            <GreetingIcon className="w-5 h-5 text-[#00B4A6]" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100 leading-tight">
              Resumen &mdash; {adminName}
            </h1>
            <p className="text-xs text-gray-400 dark:text-zinc-500 capitalize">
              {formatDateLong()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center bg-gray-100 dark:bg-zinc-700 rounded-lg p-0.5">
            {([
              { id: "hoy" as Period, label: "Hoy" },
              { id: "semana" as Period, label: "Semana" },
              { id: "mes" as Period, label: "Mes actual" },
            ]).map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all",
                  period === p.id
                    ? "bg-white dark:bg-zinc-800 text-[#00B4A6] shadow-sm"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 dark:text-zinc-500 hidden sm:inline">
              {lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => { setLoading(true); load(); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {/* Regional config button */}
          <div className="relative">
            <button
              onClick={() => setShowRegionalConfig(!showRegionalConfig)}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
              title="Configuracion regional"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            {showRegionalConfig && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl p-4 w-72">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Configuracion Regional</span>
                  <button onClick={() => setShowRegionalConfig(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200"><X className="w-4 h-4" /></button>
                </div>
                {/* Moneda */}
                <div className="mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 block mb-1.5">Moneda</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateRegionalConfig({ currency: "PEN" })}
                      className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.currency === "PEN" ? "bg-[#00B4A6]/10 border-[#00B4A6] text-[#00B4A6]" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}
                    >
                      S/ Soles {regionalConfig.currency === "PEN" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                    <button
                      onClick={() => updateRegionalConfig({ currency: "USD" })}
                      className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.currency === "USD" ? "bg-[#00B4A6]/10 border-[#00B4A6] text-[#00B4A6]" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}
                    >
                      $ Dolar {regionalConfig.currency === "USD" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                  </div>
                </div>
                {/* Formato de fecha */}
                <div className="mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 block mb-1.5">Formato de fecha</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateRegionalConfig({ dateFormat: "DD/MM/YYYY" })}
                      className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.dateFormat === "DD/MM/YYYY" ? "bg-[#00B4A6]/10 border-[#00B4A6] text-[#00B4A6]" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}
                    >
                      DD/MM/YYYY {regionalConfig.dateFormat === "DD/MM/YYYY" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                    <button
                      onClick={() => updateRegionalConfig({ dateFormat: "MM/DD/YYYY" })}
                      className={cn("flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-colors", regionalConfig.dateFormat === "MM/DD/YYYY" ? "bg-[#00B4A6]/10 border-[#00B4A6] text-[#00B4A6]" : "border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-zinc-400 hover:border-gray-300")}
                    >
                      MM/DD/YYYY {regionalConfig.dateFormat === "MM/DD/YYYY" && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                  </div>
                </div>
                {/* Zona horaria */}
                <div className="pt-2 border-t border-gray-100 dark:border-zinc-700">
                  <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 block mb-1">Zona horaria</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">America/Lima (UTC-5)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dashboard sub-tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-zinc-700 overflow-x-auto pb-0">
        {DASHBOARD_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleDashTabChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px]",
              dashTab === tab.id
                ? "border-[#00B4A6] text-[#00B4A6] font-semibold"
                : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300 hover:border-gray-300 dark:hover:border-zinc-500"
            )}
          >
            <tab.Icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {fetchError}
        </div>
      )}

      {/* KPIs Row — 5 principales con subtexto (visible en Resumen y Ventas) */}
      {(dashTab === "resumen" || dashTab === "ventas") && (
        loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCardNew
              label={`Ventas ${period === "hoy" ? "hoy" : period === "semana" ? "semana" : "mes"}`}
              value={fmtR(revenueFiltered)}
              subtext={`${filteredSales.length} transacciones`}
              colorClass="bg-[#00B4A6]"
              isEmpty={revenueFiltered === 0}
              emptyLabel="Sin ventas"
            />
            <KpiCardNew
              label="Clientes"
              value={String(clientesFiltered)}
              subtext={`${clientesHoy} nuevos hoy`}
              colorClass="bg-blue-500"
              isEmpty={clientesFiltered === 0}
              emptyLabel="Sin clientes"
            />
            <KpiCardNew
              label="Margen"
              value={`${marginFiltered.toFixed(0)}%`}
              subtext={
                marginFiltered >= 25
                  ? "Saludable"
                  : marginFiltered >= 15
                  ? "Puede mejorar"
                  : marginFiltered > 0
                  ? "Revisar costos"
                  : `${fmtR(rentabilidadHoy)} ganancia`
              }
              subtextColorClass={
                marginFiltered >= 25
                  ? "text-emerald-600 dark:text-emerald-400"
                  : marginFiltered >= 15
                  ? "text-amber-500 dark:text-amber-400"
                  : marginFiltered > 0
                  ? "text-red-500 dark:text-red-400"
                  : undefined
              }
              colorClass="bg-[#f97316]"
              isEmpty={marginFiltered === 0}
            />
            <KpiCardNew
              label="vs Ayer"
              value={`${hoyVsAyerPct > 0 ? "+" : ""}${hoyVsAyerPct.toFixed(0)}%`}
              subtext={revenueYesterday > 0 ? `${fmtR(revenueYesterday)} ayer` : "Sin datos ayer"}
              colorClass={hoyVsAyerPct >= 0 ? "bg-emerald-500" : "bg-red-500"}
              isEmpty={revenueToday === 0 && revenueYesterday === 0}
              emptyLabel="Sin datos"
            />
            <KpiCardNew
              label="Ticket promedio"
              value={fmtR(ticketPromedio)}
              subtext={salesToday.length > 0 ? `Max: ${fmtR(Math.max(...salesToday.map(s => s.total ?? 0)))}` : "Sin ventas"}
              colorClass="bg-purple-500"
              isEmpty={ticketPromedio === 0}
              emptyLabel="Sin ventas"
            />
          </div>
        )
      )}

      {/* Banner motivacional — tienda nueva sin datos */}
      {!loading && dashTab === "resumen" && products.length === 0 && orders.length === 0 && sales.length === 0 && (
        <div className="rounded-xl border border-[#00B4A6]/20 bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-xl bg-[#00B4A6] flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-[#00B4A6] dark:text-emerald-400 text-sm">Tu tienda está lista.</p>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Agrega productos y empieza a vender. Los datos aparecerán aquí automáticamente.</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECCION 2: GRAFICO DE VENTAS DEL MES (tipo Alegra)
          ════════════════════════════════════════════════════════════════════ */}

      {!loading && (dashTab === "resumen" || dashTab === "ventas") && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-bold text-gray-800 dark:text-zinc-200">Total de ventas</h2>
              <p className="text-xs text-gray-400 dark:text-zinc-500">
                La grafica muestra el valor de tus ventas con impuestos incluidos
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-mono font-bold text-gray-900 dark:text-zinc-100">
                {fmtR(revenueThisMonth)}
              </p>
              {monthDelta !== 0 && (
                <span className={cn(
                  "text-xs font-bold",
                  monthDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                )}>
                  {monthDelta >= 0 ? "+" : ""}{monthDelta.toFixed(1)}% vs mes anterior
                </span>
              )}
            </div>
          </div>
          {monthlyDailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyDailyData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00B4A6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00B4A6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtShort(v)}
                  width={50}
                />
                <Tooltip content={<CustomAreaTooltip />} />
                <Area
                  type="monotone"
                  dataKey="ventas"
                  stroke="#00B4A6"
                  strokeWidth={2}
                  fill="url(#colorVentas)"
                  dot={{ r: 3, fill: "#00B4A6", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#00B4A6", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px]">
              <p className="text-sm text-gray-400 dark:text-zinc-500">Sin ventas registradas este mes</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECCION 3: CARDS FINANCIERAS (sin duplicados de KPIs)
          ════════════════════════════════════════════════════════════════════ */}

      {!loading && (dashTab === "resumen" || dashTab === "finanzas") && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Cuentas por cobrar (Fiados) */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <a href="/admin?module=fiados" className="text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:text-[#00B4A6] transition-colors cursor-pointer">
              Cuentas por cobrar
            </a>
            <p className="text-xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">
              {fmtR(cuentasPorCobrar.total)}
            </p>
            <div className="flex items-center gap-2 mt-2 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vigentes {fmtShortR(cuentasPorCobrar.vigentes)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vencidas {fmtShortR(cuentasPorCobrar.vencidas)}</span>
              </span>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">{cuentasPorCobrar.count} documentos</p>
          </div>

          {/* Card 2: Cuentas por pagar */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <a href="/admin?module=compras" className="text-xs font-semibold text-gray-700 dark:text-zinc-300 hover:text-[#00B4A6] transition-colors cursor-pointer">
              Cuentas por pagar
            </a>
            <p className="text-xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">
              {fmtR(cuentasPorPagar.total)}
            </p>
            <div className="flex items-center gap-2 mt-2 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vigentes {fmtShortR(cuentasPorPagar.vigentes)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                <span className="text-gray-500 dark:text-zinc-400">Vencidas {fmtShortR(cuentasPorPagar.vencidas)}</span>
              </span>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">{cuentasPorPagar.count} documentos</p>
          </div>

          {/* Card 3: Impuestos en venta */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Impuestos en venta</span>
            <p className="text-xl font-mono font-bold text-gray-900 dark:text-zinc-100 mt-1">
              {fmtR(igvVentasMes)}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">IGV estimado del mes</p>
          </div>

          {/* Card 4: Devoluciones de clientes */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Devoluciones</span>
            <p className={cn("text-xl font-mono font-bold mt-1", devoluciones > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-zinc-100")}>
              {fmtR(devoluciones)}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-2">Incluye impuestos</p>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECCION 5: INSIGHTS / NOTAS (cards coloreadas) — Tab Resumen
          ════════════════════════════════════════════════════════════════════ */}

      {!loading && dashTab === "resumen" && insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={cn(
                "border-l-4 p-3 rounded-r-xl text-sm",
                insight.type === "positive" && "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-800 dark:text-emerald-300",
                insight.type === "negative" && "bg-red-50 dark:bg-red-950/20 border-red-500 text-red-800 dark:text-red-300",
                insight.type === "neutral" && "bg-blue-50 dark:bg-blue-950/20 border-blue-500 text-blue-800 dark:text-blue-300",
              )}
            >
              <span className="font-medium">{insight.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECCION 4: COMBO DEL DIA MEJORADO
          ════════════════════════════════════════════════════════════════════ */}

      {!loading && dashTab === "resumen" && comboData.products.some(p => p.found) && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Lightbulb className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Combo del día disponible</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">La IA tiene sugerencias de combos para ti</p>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECCION 6: MIS GRAFICOS (agregables/movibles) — Tab Ventas
          ════════════════════════════════════════════════════════════════════ */}

      {!loading && dashTab === "ventas" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-500 dark:text-zinc-400" />
              <h2 className="text-sm font-bold text-gray-800 dark:text-zinc-200">Mis Graficos</h2>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowChartPicker(!showChartPicker)}
                disabled={activeCharts.length >= 6}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  activeCharts.length >= 6
                    ? "bg-gray-100 dark:bg-zinc-700 text-gray-400 cursor-not-allowed"
                    : "bg-[#00B4A6] text-white hover:bg-[#009690]"
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar grafico
              </button>
              {showChartPicker && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl p-2 w-64">
                  {CHART_OPTIONS.filter(o => !activeCharts.includes(o.id)).map(option => (
                    <button
                      key={option.id}
                      onClick={() => addChart(option.id)}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                    >
                      {option.label}
                    </button>
                  ))}
                  {CHART_OPTIONS.filter(o => !activeCharts.includes(o.id)).length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-2">Todos los graficos ya estan activos</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {activeCharts.length === 0 ? (
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-dashed border-gray-300 dark:border-zinc-600 p-8 text-center">
              <PieChartIcon className="w-8 h-8 text-gray-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-zinc-500">
                Agrega graficos para visualizar tus datos
              </p>
              <p className="text-xs text-gray-300 dark:text-zinc-600 mt-1">
                Haz click en &quot;+ Agregar grafico&quot; arriba
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeCharts.map((chartId, index) => (
                <div key={chartId} className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-gray-700 dark:text-zinc-300 truncate">{chartLabel(chartId)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveChart(index, "up")}
                        disabled={index === 0}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-30 transition-colors"
                      >
                        <ChevronUp className="w-3 h-3 text-gray-400" />
                      </button>
                      <button
                        onClick={() => moveChart(index, "down")}
                        disabled={index === activeCharts.length - 1}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="w-3 h-3 text-gray-400" />
                      </button>
                      <button
                        onClick={() => removeChart(chartId)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {renderChart(chartId)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECCIONES EXISTENTES REORGANIZADAS
          ════════════════════════════════════════════════════════════════════ */}

      {/* Logro desbloqueado — visible siempre (notificacion temporal) */}
      {showLogro && logro && (
        <div className="relative border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-xl p-4 flex items-center gap-3 animate-[scaleIn_0.3s_ease-out]">
          <TrendingUp className="w-8 h-8 text-yellow-500" />
          <div className="flex-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-yellow-700 dark:text-yellow-400">Logro desbloqueado!</p>
            <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{logro.texto}</p>
          </div>
          <button onClick={() => setShowLogro(false)} className="text-gray-400 hover:text-gray-600 p-1 shrink-0"><span className="text-lg">&times;</span></button>
        </div>
      )}

      {/* Weekly Goal — Tab Ventas */}
      {dashTab === "ventas" && <WeeklyGoalCard sales={sales} />}

      {/* Quick context badges — Tab Resumen */}
      {!loading && dashTab === "resumen" && (
        <div className="flex flex-wrap items-center gap-2">
          {semanaAnterior && (
            <span className={cn("inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border", semanaAnterior.pct >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400")}>
              Hace 1 sem ({semanaAnterior.diaLabel}): {fmtR(semanaAnterior.monto)} {semanaAnterior.pct >= 0 ? "+" : ""}{semanaAnterior.pct.toFixed(0)}%
            </span>
          )}
          {hitoProximo && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">
              {hitoProximo.falta ? `Te faltan ${hitoProximo.falta} para ${hitoProximo.label}` : hitoProximo.label}
            </span>
          )}
          {bestHourToday && (
            <span className="inline-flex items-center gap-1 text-xs bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2">
              <Clock className="h-3.5 w-3.5 text-[#00B4A6]" />
              <span className="text-gray-600 dark:text-zinc-300">Mejor hora: <span className="font-bold">{bestHourToday.hour}:00</span> (S/{bestHourToday.total.toFixed(0)})</span>
            </span>
          )}
          {diasSinCierre != null && diasSinCierre >= 1 && (
            <span className={cn(
              "inline-flex items-center gap-1 text-xs font-bold rounded-lg px-3 py-2",
              diasSinCierre >= 2
                ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/30"
                : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30"
            )}>
              <AlertTriangle className="h-3.5 w-3.5" />
              {diasSinCierre >= 2 ? `${diasSinCierre} dias sin cerrar caja` : "Ayer no cerraste caja"}
            </span>
          )}
        </div>
      )}

      {/* Quincena Mode — Tab Resumen + Inventario */}
      {!loading && (dashTab === "resumen" || dashTab === "inventario") && (() => {
        const now = new Date();
        const day = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        let diasHasta = -1;
        if (day >= 28) diasHasta = daysInMonth - day + 1;
        else if (day >= 12 && day <= 14) diasHasta = 15 - day;
        else if (day >= 1 && day <= 3) diasHasta = 0;
        else if (day === 15 || day === 16 || day === 17) diasHasta = 0;
        if (diasHasta < 0 || diasHasta > 3) return null;
        const topProds = topProducts.slice(0, 5);
        const estimadoMultiplier = 1.5;
        const lsKey = `quincena-prep-${now.getFullYear()}-${now.getMonth()}-${day <= 15 ? '15' : '01'}`;
        let checks: Record<string, boolean> = {};
        try { const raw = localStorage.getItem(lsKey); if (raw) checks = JSON.parse(raw); } catch {}
        const toggleCheck = (key: string) => {
          const next = { ...checks, [key]: !checks[key] };
          localStorage.setItem(lsKey, JSON.stringify(next));
        };
        return (
          <div className="rounded-2xl border-2 border-amber-400 dark:border-amber-600 shadow-lg overflow-hidden" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-lg font-extrabold text-amber-900">
                  {diasHasta === 0 ? "QUINCENA HOY" : `QUINCENA EN ${diasHasta} DIA${diasHasta > 1 ? "S" : ""}`}
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-800 text-amber-50">Ventas +100%</span>
              </div>
              <p className="text-xs text-amber-800 mb-3 font-medium">
                {diasHasta === 0 ? "Las ventas se duplican hoy. Asegurate de tener todo listo." : "Prepara stock y efectivo para el pico de ventas."}
              </p>
              <div className="space-y-2">
                {topProds.map((prod) => {
                  const product = products.find(p => String(p.id) === String(prod.id));
                  const stock = product?.stock ?? 0;
                  const estimado = Math.ceil(prod.qty * estimadoMultiplier / 4);
                  const ok = stock >= estimado;
                  return (
                    <label key={prod.id} className="flex items-center gap-2 text-sm cursor-pointer select-none" onClick={() => toggleCheck(String(prod.id))}>
                      <span className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors", checks[String(prod.id)] ? "bg-emerald-500 border-emerald-500 text-white" : "border-amber-600 bg-white")}>
                        {checks[String(prod.id)] && <Check className="h-3 w-3" />}
                      </span>
                      <span className="text-amber-900 font-medium flex-1 truncate">{prod.name}</span>
                      <span className={cn("text-xs font-bold", ok ? "text-emerald-700" : "text-red-700")}>
                        {stock} uds {!ok && `(necesitas ~${estimado})`}
                      </span>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none" onClick={() => toggleCheck("efectivo")}>
                  <span className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors", checks["efectivo"] ? "bg-emerald-500 border-emerald-500 text-white" : "border-amber-600 bg-white")}>
                    {checks["efectivo"] && <Check className="h-3 w-3" />}
                  </span>
                  <span className="text-amber-900 font-medium">Efectivo en caja para cambio</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none" onClick={() => toggleCheck("fiados")}>
                  <span className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors", checks["fiados"] ? "bg-emerald-500 border-emerald-500 text-white" : "border-amber-600 bg-white")}>
                    {checks["fiados"] && <Check className="h-3 w-3" />}
                  </span>
                  <span className="text-amber-900 font-medium">Cobrar fiados pendientes antes de dar mas credito</span>
                </label>
              </div>
            </div>
          </div>
        );
      })()}

      {/* High-impact cards row — Tab Resumen muestra todos, otros tabs muestran parcial */}
      {!loading && (dashTab === "resumen" || dashTab === "finanzas" || dashTab === "clientes" || dashTab === "inventario") && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Proximos pagos */}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <DollarSign className="w-3.5 h-3.5 text-amber-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Pagos esta semana</span>
            </div>
            {upcomingPayables.overdue > 0 && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-3 h-3 text-red-500" />
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{upcomingPayables.overdue} vencido{upcomingPayables.overdue !== 1 ? "s" : ""}</span>
              </div>
            )}
            {upcomingPayables.upcoming.length > 0 ? (
              <ul className="space-y-1.5">
                {upcomingPayables.upcoming.map(p => {
                  const daysLeft = p.dueDate ? Math.max(0, Math.ceil((new Date(p.dueDate).getTime() - Date.now()) / 86400000)) : 0;
                  return (
                    <li key={p.id} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-600 dark:text-zinc-300 flex-1">{p.supplierName || "Proveedor"}</span>
                      <span className="font-bold text-gray-900 dark:text-zinc-100 ml-2">{fmtR(p.amount - p.paidAmount)}</span>
                      <span className="text-[10px] text-gray-400 ml-1.5">{daysLeft}d</span>
                    </li>
                  );
                })}
              </ul>
            ) : upcomingPayables.overdue === 0 ? (
              <p className="text-xs text-emerald-500 font-medium">Sin pagos pendientes esta semana</p>
            ) : null}
            <a href="/admin?module=compras" className="text-[10px] font-bold text-[#00B4A6] hover:underline mt-2 block">
              Ver todos &rarr;
            </a>
          </div>

          {/* Clientes del dia */}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Users className="w-3.5 h-3.5 text-blue-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Clientes hoy</span>
            </div>
            <p className="text-2xl font-extrabold font-mono text-gray-900 dark:text-zinc-100">{clientesHoy}</p>
            <p className="text-xs text-gray-400 mt-0.5">Promedio: {clientesPromedio}/dia</p>
            <div className="flex items-center gap-1.5 mt-2">
              {clientesHoy > clientesAyer ? (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                  +{clientesHoy - clientesAyer} vs ayer
                </span>
              ) : clientesHoy < clientesAyer ? (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
                  {clientesHoy - clientesAyer} vs ayer
                </span>
              ) : (
                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-zinc-700 px-1.5 py-0.5 rounded-full">Igual que ayer</span>
              )}
            </div>
          </div>

          {/* Productos que se agotan */}
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20">
                <Package className="w-3.5 h-3.5 text-red-500" />
              </span>
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Se agotan esta semana</span>
            </div>
            {productsRunningOut.length > 0 ? (
              <ul className="space-y-1.5">
                {productsRunningOut.map(p => (
                  <li key={p.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-gray-600 dark:text-zinc-300 flex-1">{p.name}</span>
                    <span className="text-gray-400 ml-1">quedan {p.stock}</span>
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1.5",
                      p.daysLeft < 3 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                      p.daysLeft <= 5 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                      "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                    )}>
                      {p.daysLeft}d
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-500 font-medium">Stock estable para esta semana</p>
            )}
            {productsRunningOut.length > 0 && (
              <a href="/admin?module=compras" className="text-[10px] font-bold text-[#00B4A6] hover:underline mt-2 block">
                Crear OC &rarr;
              </a>
            )}
          </div>
        </div>
      )}

      {/* Cajeros ranking — Tab Ventas */}
      {!loading && dashTab === "ventas" && salesToday.length > 0 && (() => {
        const cajeros = new Map<string, { ventas: number; count: number }>();
        for (const s of salesToday) {
          const cashier = (s as unknown as { cashierName?: string }).cashierName || "Cajero principal";
          const prev = cajeros.get(cashier) || { ventas: 0, count: 0 };
          prev.ventas += s.total ?? 0;
          prev.count += 1;
          cajeros.set(cashier, prev);
        }
        if (cajeros.size < 1) return null;
        const ranking = Array.from(cajeros.entries())
          .map(([name, d]) => ({ name, rate: d.count > 0 ? d.ventas / Math.max(1, d.count) : 0, ventas: d.ventas, count: d.count }))
          .sort((a, b) => b.ventas - a.ventas)
          .slice(0, 3);
        return (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Rendimiento cajeros hoy</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {ranking.map((c, i) => (
                <span key={c.name} className="text-xs text-gray-700 dark:text-zinc-300">
                  <span className={cn("font-bold", i === 0 && "text-amber-600")}>{i + 1}.</span>{" "}
                  {c.name}: <strong>{fmtR(c.ventas)}</strong> ({c.count} ventas)
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Meta del dia — Tab Resumen + Ventas */}
      {!loading && (dashTab === "resumen" || dashTab === "ventas") && (() => {
        const dailyGoalPct = dailyGoal > 0 ? (revenueToday / dailyGoal) * 100 : 0;
        return (
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Target className="h-4 w-4 text-[#00B4A6]" /> Meta del día
              </p>
              <span className="text-xs font-bold text-[#00B4A6]">{dailyGoalPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-[#00B4A6] rounded-full transition-all" style={{ width: `${Math.min(100, dailyGoalPct)}%` }} />
            </div>
          </div>
        );
      })()}

      {/* Widget order controls — only show when sections are visible */}
      {!isDefaultOrder && (dashTab === "resumen" || dashTab === "ventas" || dashTab === "clientes") && (
        <div className="flex items-center justify-end">
          <button
            onClick={resetOrder}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer orden
          </button>
        </div>
      )}

      {/* Reorderable sections — filtered by active tab */}
      {sectionOrder
        .filter(sid => {
          const tabMap: Record<string, DashTabId[]> = {
            "kpis": ["resumen", "ventas"],
            "margen-comparador": ["resumen", "finanzas"],
            "top-productos": ["ventas", "resumen"],
            "horario-pico": ["ventas", "resumen"],
            "clientes-alertas": ["clientes", "resumen"],
          };
          return (tabMap[sid] ?? ["resumen"]).includes(dashTab);
        })
        .map((sectionId, sectionIdx) => (
        <div
          key={sectionId}
          className={cn(
            "relative group/section transition-all duration-200",
            dragIdx === sectionIdx && "opacity-50 scale-[0.98]",
            dragOverIdx === sectionIdx && dragIdx !== sectionIdx && "ring-2 ring-[#00B4A6]/40 ring-offset-2 rounded-xl",
          )}
          draggable
          onDragStart={() => handleDragStart(sectionIdx)}
          onDragOver={(e) => handleDragOver(e, sectionIdx)}
          onDragLeave={handleDragLeave}
          onDrop={() => handleDrop(sectionIdx)}
          onDragEnd={handleDragEnd}
        >
          {/* Reorder buttons */}
          <div className="absolute -left-1 sm:-left-8 top-1 flex flex-col gap-0.5 opacity-0 group-hover/section:opacity-100 transition-opacity z-10">
            <button
              onClick={() => moveSection(sectionIdx, "up")}
              disabled={sectionIdx === 0}
              className="p-1 rounded bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 shadow-sm hover:bg-gray-50 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Mover arriba"
            >
              <ChevronUp className="w-3 h-3 text-gray-500 dark:text-zinc-400" />
            </button>
            <button
              onClick={() => moveSection(sectionIdx, "down")}
              disabled={sectionIdx === sectionOrder.length - 1}
              className="p-1 rounded bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 shadow-sm hover:bg-gray-50 dark:hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Mover abajo"
            >
              <ChevronDown className="w-3 h-3 text-gray-500 dark:text-zinc-400" />
            </button>
          </div>

          {/* Top 10 productos section */}
          {sectionId === "top-productos" && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4" style={{ color: "#00B4A6" }} />
                <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">
                  Top 10 productos mas vendidos
                </span>
              </div>
              {loading ? (
                <SkeletonBar rows={10} />
              ) : topProducts.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500">No hay datos de ventas aun.</p>
              ) : (
                <div className="space-y-2">
                  {topProducts.map((prod, idx) => {
                    const pct = Math.max(4, (prod.qty / maxProductQty) * 100);
                    return (
                      <div key={String(prod.id)} className="flex items-center gap-2 text-sm">
                        <span className="w-5 text-right text-xs text-gray-400 dark:text-zinc-500 font-mono shrink-0">{idx + 1}</span>
                        <span className="w-36 sm:w-44 truncate text-gray-700 dark:text-zinc-300 shrink-0 text-xs" title={prod.name}>{prod.name}</span>
                        <div className="flex-1 h-5 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 rounded transition-all"
                            style={{ width: `${pct}%`, backgroundColor: idx === 0 ? "#00B4A6" : "#00B4A660" }}
                          />
                          <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-white z-10">{prod.qty} uds</span>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0 w-20 text-right tabular-nums">{fmtR(prod.revenue)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Horario pico section */}
          {sectionId === "horario-pico" && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4" style={{ color: "#f97316" }} />
                <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Ventas por hora (hoy)</span>
              </div>
              {loading ? (
                <SkeletonBar rows={4} />
              ) : salesToday.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-zinc-500">Sin ventas registradas hoy.</p>
              ) : (
                <div className="space-y-1">
                  {hourBuckets.map((bucket) => {
                    const pct = Math.max(0, (bucket.amount / maxHourAmount) * 100);
                    const isActive = bucket.hour === new Date().getHours();
                    return (
                      <div key={bucket.hour} className="flex items-center gap-2 text-xs">
                        <span className={cn("w-8 text-right shrink-0 font-mono", isActive ? "text-amber-500 font-bold" : "text-gray-400 dark:text-zinc-500")}>{bucket.label}</span>
                        <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-zinc-700 relative overflow-hidden">
                          {pct > 0 && (
                            <div className="absolute inset-y-0 left-0 rounded transition-all" style={{ width: `${pct}%`, backgroundColor: isActive ? "#f97316" : "#00B4A680" }} />
                          )}
                          {pct > 10 && (
                            <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-semibold text-white z-10">{fmtR(bucket.amount)}</span>
                          )}
                        </div>
                        {pct === 0 && <span className="text-gray-300 dark:text-zinc-600 text-[10px]">—</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Comparador mes actual vs anterior (margen ya esta en KPI) */}
          {sectionId === "margen-comparador" && (loading ? (
            <SkeletonCard />
          ) : (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4" style={{ color: "#f97316" }} />
                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Este mes vs anterior</span>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-2xl font-bold font-mono text-gray-900 dark:text-zinc-100">{fmtR(revenueThisMonth)}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">mes actual</p>
                </div>
                <div className={cn("flex items-center gap-1 text-sm font-semibold pb-1", monthDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                  {monthDelta >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {Math.abs(monthDelta).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
                Mes anterior: <span className="font-medium text-gray-600 dark:text-zinc-400">{fmtR(revenuePrevMonth)}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: "Este mes", value: revenueThisMonth, color: "#00B4A6", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                  { label: "Anterior", value: revenuePrevMonth, color: "#94a3b8", max: Math.max(revenueThisMonth, revenuePrevMonth, 1) },
                ].map((bar) => (
                  <div key={bar.label}>
                    <div className="flex justify-between text-[10px] text-gray-400 dark:text-zinc-500 mb-1">
                      <span>{bar.label}</span>
                      <span>{fmtR(bar.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (bar.value / bar.max) * 100)}%`, backgroundColor: bar.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* KPIs extra section (quick-win cards) — sin duplicados */}
          {sectionId === "kpis" && !loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Proyeccion mensual */}
              {monthProjection && (
                <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
                  <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Proyeccion mensual</span>
                  <p className="text-lg font-bold font-mono text-gray-900 dark:text-zinc-100 mt-1">
                    {fmtR(monthProjection.ventasMes)} <span className="text-xs font-normal text-gray-400">de {fmtR(monthProjection.proyeccion)}</span>
                  </p>
                  <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 mt-2">
                    <div
                      className={cn("h-2 rounded-full transition-all", monthProjection.porcentaje >= 80 ? "bg-emerald-500" : monthProjection.porcentaje >= 50 ? "bg-amber-500" : "bg-red-500")}
                      style={{ width: `${Math.min(100, monthProjection.porcentaje)}%` }}
                    />
                  </div>
                  <p className="text-xs mt-1 text-gray-400">
                    {monthProjection.porcentaje > 100 ? "Superando proyeccion!" : `${monthProjection.porcentaje}% — dia ${monthProjection.diasTranscurridos}/${monthProjection.diasTotales}`}
                  </p>
                </div>
              )}

              {/* No cerraste ayer */}
              {noClosedYesterday && !ignoredClose && revenueYesterday > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/30 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">No cerraste ayer</span>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Ventas: <span className="font-bold">{fmtR(revenueYesterday)}</span> &middot; {salesYesterdayCount} transacciones
                  </p>
                  <button
                    onClick={() => { localStorage.setItem("last-daily-close", new Date().toISOString().slice(0, 10)); setIgnoredClose(true); }}
                    className="mt-2 text-xs font-bold text-amber-600 hover:underline"
                  >
                    Ignorar
                  </button>
                </div>
              )}

              {/* Sin vender hoy */}
              {productosSinVenderHoy.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
                  <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Sin vender hoy</span>
                  <div className="mt-2 space-y-1">
                    {productosSinVenderHoy.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 dark:text-zinc-300 truncate">{p.name}</span>
                        <span className="text-gray-400 dark:text-zinc-500 shrink-0 ml-2">Ayer: {p.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Producto en declive */}
              {decliningProduct && (
                <div className="rounded-xl border border-orange-200 dark:border-orange-800/30 bg-orange-50 dark:bg-orange-900/20 p-4">
                  <span className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wide">En declive</span>
                  <p className="text-sm text-orange-800 dark:text-orange-300 mt-1 font-medium">
                    {decliningProduct.name} (-{decliningProduct.pct}% vs semana pasada)
                  </p>
                  <p className="text-xs text-orange-500 mt-0.5">Revisa stock, precio o visibilidad</p>
                </div>
              )}
            </div>
          )}

          {/* Clientes + Alertas section */}
          {sectionId === "clientes-alertas" && (
            <div className="space-y-4">
              {/* Carritos abandonados */}
              {abandonedCartCount > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                      <ShoppingCart className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
                        {abandonedCartCount} carrito{abandonedCartCount !== 1 ? "s" : ""} abandonado{abandonedCartCount !== 1 ? "s" : ""} hoy
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">{fmtR(abandonedCartValue)} en ventas potenciales</p>
                    </div>
                    <a href="/admin?module=notificaciones" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-200/60 dark:bg-amber-800/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 transition-colors">
                      Ver y contactar
                    </a>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Top 5 clientes */}
                <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4" style={{ color: "#00B4A6" }} />
                    <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Top 5 clientes del mes</span>
                  </div>
                  {loading ? (
                    <div className="space-y-3 animate-pulse">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-zinc-700 shrink-0" />
                          <div className="flex-1 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                          <div className="w-14 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                        </div>
                      ))}
                    </div>
                  ) : topCustomers.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-zinc-500">Sin pedidos este mes.</p>
                  ) : (
                    <ol className="space-y-2">
                      {topCustomers.map((c, idx) => (
                        <li key={c.phone ?? c.name} className="flex items-center gap-2 text-sm">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 text-white" style={{ backgroundColor: idx === 0 ? "#00B4A6" : "#94a3b8" }}>
                            {idx + 1}
                          </span>
                          <span className="flex-1 truncate text-gray-700 dark:text-zinc-300 text-xs" title={c.name}>{c.name}</span>
                          <span className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0">{c.orderCount} ped.</span>
                          <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "#00B4A6" }}>{fmtR(c.total)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Alertas activas */}
                <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Alertas activas</span>
                  </div>
                  {loading ? (
                    <div className="space-y-2 animate-pulse">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-9 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                      ))}
                    </div>
                  ) : !hasAnyAlert ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                      <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm font-medium text-gray-600 dark:text-zinc-400">Todo bajo control</p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500">No hay alertas pendientes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AlertBadge Icon={Package} label="Productos con stock bajo" count={alerts.lowStock} colorClass="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800" />
                      <AlertBadge Icon={AlertTriangle} label="Lotes por vencer (7 dias)" count={expiringBatchCount} colorClass="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800" />
                      <AlertBadge Icon={DollarSign} label="Fiados vencidos" count={alerts.overduePayables} colorClass="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Stock muerto — Tab Inventario */}
      {!loading && dashTab === "inventario" && (() => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const deadStock = products.filter(p => {
          if (p.stock == null || p.stock <= 0) return false;
          const soldRecently = sales.some(s => {
            const items: Array<{ productId?: number | string }> = (s as unknown as { items: Array<{ productId?: number | string }> }).items ?? [];
            return items.some(i => String(i.productId) === String(p.id)) && s.createdAt >= thirtyDaysAgo;
          });
          return !soldRecently;
        });
        if (deadStock.length === 0) return null;
        const deadValue = deadStock.reduce((s, p) => s + (p.stock ?? 0) * (p.costPrice ?? p.price * 0.7), 0);
        return (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Stock muerto</span>
              {deadValue > 500 ? (
                <span className="text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full">Capital atrapado</span>
              ) : (
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">Poco stock muerto</span>
              )}
            </div>
            <p className="text-lg font-bold font-mono text-gray-900 dark:text-zinc-100">{fmtR(deadValue)} <span className="text-xs font-normal text-gray-400">en {deadStock.length} productos sin vender 30+ dias</span></p>
            <a href="/admin?module=inventario&sub=sin-movimiento" className="text-[10px] font-bold text-[#00B4A6] hover:underline mt-1.5 block">Ver productos &rarr;</a>
          </div>
        );
      })()}

      {/* Cumpleanos — Tab Clientes */}
      {dashTab === "clientes" && <BirthdayCard />}

      {/* Insights avanzados (cards) — Tab Ventas + Clientes */}
      {!loading && (dashTab === "ventas" || dashTab === "clientes") && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {bestDay && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Mejor dia de la semana</span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                Tu mejor dia es el {bestDay.best.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Promedio: {fmtR(bestDay.best.avg)} {bestDay.pctVsOthers > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold">(+{bestDay.pctVsOthers}% vs otros dias)</span>}
              </p>
              {bestDay.worst && (
                <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1.5">
                  Peor dia: {bestDay.worst.name} — {fmtR(bestDay.worst.avg)}
                </p>
              )}
            </div>
          )}
          {growingCategory?.top && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Categoria en crecimiento</span>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">
                {growingCategory.top.cat} crecio {growingCategory.top.pct.toFixed(0)}% esta semana
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                De {fmtR(growingCategory.top.lastWeek)} a {fmtR(growingCategory.top.thisWeek)}
              </p>
              {growingCategory.bottom && (
                <p className="text-[10px] text-orange-500 dark:text-orange-400 mt-1.5 font-medium">
                  {growingCategory.bottom.cat} bajo {Math.abs(growingCategory.bottom.pct).toFixed(0)}%
                </p>
              )}
            </div>
          )}
          {topClientMonth && (
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-[#00B4A6]" />
                <span className="text-xs font-bold text-gray-600 dark:text-zinc-300">Cliente del mes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold text-white" style={{ backgroundColor: "#00B4A6" }}>
                  {topClientMonth.name.charAt(0).toUpperCase()}
                </span>
                <p className="text-sm font-bold text-gray-900 dark:text-zinc-100">{topClientMonth.name}</p>
              </div>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                {topClientMonth.orderCount} compras &middot; {fmtR(topClientMonth.total)} &middot; Ticket: {fmtR(topClientMonth.avg)}
              </p>
              <span className="inline-block text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full mt-1.5 capitalize">
                Cliente mas fiel de {topClientMonth.monthName}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Clientes que no vuelven — Tab Clientes */}
      {dashTab === "clientes" && <InactiveCustomersCard orders={orders} sales={sales} loading={loading} />}

      {/* Ultimos documentos — Tab Finanzas */}
      {dashTab === "finanzas" && <RecentDocumentsFeed />}

      {/* Logros y Streaks — Tab Resumen */}
      {!loading && dashTab === "resumen" && (() => {
        type Achievement = { id: string; titulo: string; desc: string; condicion: boolean; progreso?: number; meta?: number };
        const ventasCount = sales.length;
        const fiadosActivos = payables.filter(p => p.status !== "pagado").length;
        const clientesTotal = new Set(sales.map(s => (s as unknown as { customerPhone?: string }).customerPhone ?? "anon").filter(p => p !== "anon")).size;
        const salesDays = new Set<string>();
        for (const s of sales) {
          try { salesDays.add(new Date(s.createdAt).toISOString().slice(0, 10)); } catch { /* ignore */ }
        }
        let streak = 0;
        const todayDate = new Date();
        for (let i = 0; i < 365; i++) {
          const d = new Date(todayDate);
          d.setDate(d.getDate() - i);
          if (salesDays.has(d.toISOString().slice(0, 10))) streak++;
          else break;
        }
        const recordKey = "business-record-daily";
        let recordDiario = 0;
        try { recordDiario = Number(localStorage.getItem(recordKey)) || 0; } catch { /* ignore */ }
        if (revenueToday > recordDiario) {
          try { localStorage.setItem(recordKey, String(revenueToday)); recordDiario = revenueToday; } catch { /* ignore */ }
        }
        const cobradoMes = payables.filter(p => p.status === "pagado").reduce((s, p) => s + p.paidAmount, 0);
        const LOGROS: Achievement[] = [
          { id: "first-sale", titulo: "Primera venta", desc: "Registraste tu primera venta", condicion: ventasCount > 0 },
          { id: "100-sales", titulo: "100 ventas", desc: "Has registrado 100 ventas", condicion: ventasCount >= 100, progreso: Math.min(ventasCount, 100), meta: 100 },
          { id: "1000-sales", titulo: "1,000 ventas", desc: "Mil ventas!", condicion: ventasCount >= 1000, progreso: Math.min(ventasCount, 1000), meta: 1000 },
          { id: "best-day", titulo: "Mejor dia", desc: "Superaste tu record diario", condicion: revenueToday >= recordDiario && revenueToday > 0 },
          { id: "streak-7", titulo: "7 dias seguidos", desc: "Vendiste 7 dias consecutivos", condicion: streak >= 7, progreso: Math.min(streak, 7), meta: 7 },
          { id: "streak-30", titulo: "Mes completo", desc: "30 dias vendiendo sin parar", condicion: streak >= 30, progreso: Math.min(streak, 30), meta: 30 },
          { id: "all-paid", titulo: "Sin deudas", desc: "Todos los fiados pagados", condicion: fiadosActivos === 0 },
          { id: "collector", titulo: "Cobrador estrella", desc: "Cobraste S/1,000+ en un mes", condicion: cobradoMes >= 1000, progreso: Math.min(cobradoMes, 1000), meta: 1000 },
          { id: "50-clients", titulo: "50 clientes", desc: "Tu bodega tiene 50+ clientes", condicion: clientesTotal >= 50, progreso: Math.min(clientesTotal, 50), meta: 50 },
        ];
        const unlocked = LOGROS.filter(l => l.condicion);
        return (
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-lg">🏆</div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {unlocked.length}/{LOGROS.length} logros desbloqueados
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {streak > 0 ? `🔥 Racha: ${streak} días` : "Empieza tu racha vendiendo hoy"}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delivery Zones — Tab Finanzas */}
      {dashTab === "finanzas" && <DeliveryZonesConfig />}

      {/* Compartir resumen — Tab Resumen */}
      {!loading && dashTab === "resumen" && (
        <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-700 dark:text-zinc-300">Compartir Resumen del Dia</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">Envia un resumen rapido a tu esposa, socio o contador por WhatsApp.</p>
          {(() => {
            const fecha = new Date().toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
            const ventasHoyVal = revenueToday;
            const txCount = salesToday.length;
            const ticket = txCount > 0 ? ventasHoyVal / txCount : 0;
            const efectivo = salesToday.filter(s => {
              const pay = (s as unknown as { payment?: string }).payment ?? (s as unknown as { paymentMethod?: string }).paymentMethod ?? "";
              return pay === "efectivo";
            }).reduce((a, s) => a + s.total, 0);
            const yape = salesToday.filter(s => {
              const pay = (s as unknown as { payment?: string }).payment ?? (s as unknown as { paymentMethod?: string }).paymentMethod ?? "";
              return pay === "yape";
            }).reduce((a, s) => a + s.total, 0);
            const stockBajo = products.filter(p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin).length;
            const fiadosPendientes = payables.filter(p => p.status !== "pagado").reduce((a, p) => a + (p.amount - p.paidAmount), 0);
            const comparacion = ventasHoyVal > revenueYesterday ? "Mejor que ayer!" : ventasHoyVal < revenueYesterday ? "Menos que ayer" : "Igual que ayer";
            const msg = `*Resumen Buleje — ${fecha}*\n\nVentas hoy: S/ ${ventasHoyVal.toFixed(0)}\nTransacciones: ${txCount}\nTicket promedio: S/ ${ticket.toFixed(0)}\n\nEfectivo: S/ ${efectivo.toFixed(0)} | Yape: S/ ${yape.toFixed(0)}\nStock bajo: ${stockBajo} productos\nFiados pendientes: S/ ${fiadosPendientes.toFixed(0)}\n\n${comparacion}\n\nBuen dia!\nBuleje`;
            return (
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366] text-white text-xs font-bold hover:bg-[#1da851] transition-colors min-w-[140px]"
                >
                  Enviar por WhatsApp
                </a>
                <button
                  onClick={() => { navigator.clipboard.writeText(msg).catch(() => {}); }}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-600 text-xs font-bold text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                >
                  Copiar
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Activity Feed + Web Vitals — Tab Resumen */}
      {dashTab === "resumen" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ActivityFeed />
          <WebVitalsWidget />
        </div>
      )}
    </div>
  );
}
