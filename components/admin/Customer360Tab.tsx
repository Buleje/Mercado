"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  User, Users, Phone, MapPin, Calendar, ShoppingCart, TrendingUp,
  CreditCard, Clock, Heart, MessageSquare, Package, Star,
  CheckCircle, XCircle, Truck, AlertCircle, Loader2, Save,
  MessageCircle, Bell, ShoppingBag, X, FileText, Award,
} from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import EstadoCuentaModal from "./EstadoCuentaModal";
import ClienteFormModal from "./clientes/ClienteFormModal";
import { LinkedDocumentsSection } from "./documentos/LinkedDocumentsSection";

// ── Types ──────────────────────────────────────────────────────────────────

type HealthScore = "activo" | "en_riesgo" | "perdido";

type CustomerData = {
  name: string;
  phone: string;
  location?: string;
  reference?: string;
  birthday?: string | null;
  healthScore?: HealthScore;
  creditLimit?: number;
  creditBalance?: number;
  tags?: string;
  // New ficha fields
  tipoPersona?: string | null;
  tipoDocumento?: string | null;
  documento?: string | null;
  razonSocial?: string | null;
  estado?: string | null;
  whatsappSecundario?: string | null;
  email?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  direccion?: string | null;
  categoria?: string | null;
  canal?: string | null;
  listaPrecio?: string | null;
  vendedorAsignado?: string | null;
  diasCredito?: number;
  alertasWhatsapp?: boolean;
  fechaNacimiento?: string | null;
  genero?: string | null;
  comoLlego?: string | null;
  observaciones?: string | null;
};

type OrderItem = { name: string; quantity: number; unit: string; price: number };

type Order = {
  id: string;
  status: string;
  total: number;
  paymentMethod: string;
  items: OrderItem[];
  createdAt: string;
};

type TimelineEvent = {
  id: string;
  type: "order" | "notification" | "review" | "sale" | "in-app";
  icon: string;
  title: string;
  detail: string;
  date: string;
  meta?: Record<string, unknown>;
};

type Segment = "frecuente" | "ocasional" | "nuevo" | "perdido";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

function getSegment(orders: Order[]): Segment {
  if (orders.length === 0) return "nuevo";
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastDays = Math.floor((Date.now() - new Date(sorted[0].createdAt).getTime()) / 86400000);
  if (lastDays > 90) return "perdido";
  if (orders.length >= 5) return "frecuente";
  if (orders.length >= 2) return "ocasional";
  return "nuevo";
}

function getTopProducts(orders: Order[]): { name: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const o of orders) {
    for (const item of o.items) {
      map[item.name] = (map[item.name] ?? 0) + item.quantity;
    }
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("");
}

// ── Mejora 9: Avatar color auto-generado ─────────────────────────────────────
function getAvatarColor(name: string): string {
  const colors = ["var(--accent)", "#f97316", "#e63946", "#457b9d", "#6b705c", "#9b5de5"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── Mejora 9: Customer segment badge ─────────────────────────────────────────
function CustomerSegmentBadge({ totalSpent, orderCount }: { totalSpent: number; orderCount: number }) {
  if (orderCount === 0) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] border border-[var(--data-success-500)]/30">Nuevo</span>;
  if (totalSpent > 1000) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-50)] text-[var(--data-warning-500)] border border-[var(--data-warning-500)]">VIP</span>;
  if (totalSpent > 500) return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] border border-[var(--data-success-500)]/30">Premium</span>;
  return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--rule-base)]">Regular</span>;
}

// ── Mejora 11: Productos favoritos del cliente ──────────────────────────────

type FavoriteProduct = {
  productId: number;
  name: string;
  totalQty: number;
  totalSpent: number;
  purchaseCount: number;
  freqPerMonth: number;
};

const MEDAL_ICONS = ["1.", "2.", "3.", "4.", "5."];

function FavoriteProductsSection({ phone }: { phone: string }) {
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${encodeURIComponent(phone)}/favorite-products`)
      .then(r => r.ok ? r.json() : [])
      .then((data: FavoriteProduct[]) => setFavorites(data))
      .catch((err) => console.warn("[Customer360Tab] favorites fetch failed:", err))
      .finally(() => setLoading(false));
  }, [phone]);

  if (loading) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-[var(--data-warning-500)]" /> Productos Favoritos
        </CardTitle>
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-6 bg-[var(--surface-sunken)] rounded" />)}
        </div>
      </div>
    );
  }

  const totalPurchases = favorites.reduce((s, f) => s + f.purchaseCount, 0);

  if (totalPurchases < 3) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-[var(--data-warning-500)]" /> Productos Favoritos
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-2">Aun no hay suficiente historial</p>
      </div>
    );
  }

  const maxQty = favorites[0]?.totalQty ?? 1;

  function formatFreq(freq: number): string {
    if (freq >= 4) return `${(freq / 4).toFixed(1)}x/semana`;
    if (freq >= 1) return `${freq.toFixed(1)}x/mes`;
    return `${(freq * 4).toFixed(1)}x/mes`;
  }

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-[var(--data-warning-500)]" /> Productos Favoritos
      </CardTitle>
      <div className="space-y-2.5">
        {favorites.map((p, i) => (
          <div key={p.productId} className="flex items-center gap-2.5">
            <span className="text-sm w-6 text-center shrink-0">{MEDAL_ICONS[i] ?? `${i + 1}.`}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{p.name}</span>
                <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted shrink-0">
                  {p.totalQty} veces · S/{Number(p.totalSpent).toFixed(0)} · {formatFreq(p.freqPerMonth)}
                </span>
              </div>
              <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-[var(--dur-slow)]"
                  style={{
                    width: `${Math.max(8, (p.totalQty / maxQty) * 100)}%`,
                    backgroundColor: i === 0 ? "var(--accent)" : i === 1 ? "#f97316" : "#457b9d",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Config ─────────────────────────────────────────────────────────────────

const SEGMENT_CONFIG: Record<Segment, { label: string; color: string; bg: string; border: string }> = {
  frecuente: { label: "Frecuente",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" },
  ocasional: { label: "Ocasional",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",     bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",     border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" },
  nuevo:     { label: "Nuevo",      color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", border: "border-[var(--rule-base)] dark:border-[var(--rule-base)]" },
  perdido:   { label: "Perdido",    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",       bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",       border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" },
};

const HEALTH_CONFIG: Record<HealthScore | "desconocido", { label: string; color: string; bg: string; border: string; tooltip: string }> = {
  activo:      { label: "Activo",     color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", tooltip: "Compra en últimos 30 días" },
  en_riesgo:   { label: "En riesgo",  color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",     bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",     border: "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]",   tooltip: "Sin compras hace 31-90 días" },
  perdido:     { label: "Perdido",    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",         bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",         border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]",       tooltip: "Sin compras hace +90 días" },
  desconocido: { label: "Desconocido", color: "text-[var(--text-tertiary)]",      bg: "bg-[var(--surface-sunken)]/30",      border: "border-[var(--rule-base)] dark:border-gray-600",     tooltip: "Activo: compra en últimos 30 días | En riesgo: 31-90 días | Perdido: +90 días" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",   Icon: Clock },
  confirmado: { label: "Confirmado", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",     bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",     Icon: CheckCircle },
  en_camino:  { label: "En camino",  color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", Icon: Truck },
  entregado:  { label: "Entregado",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", Icon: CheckCircle },
  cancelado:  { label: "Cancelado",  color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",       bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",       Icon: XCircle },
};

const TIMELINE_ICON: Record<string, React.ElementType> = {
  "shopping-bag": ShoppingBag,
  "check": CheckCircle,
  "x": XCircle,
  "message-circle": MessageCircle,
  "bell": Bell,
  "star": Star,
};

// ── Health Badge ───────────────────────────────────────────────────────────

function HealthBadge({ score }: { score?: HealthScore }) {
  const key = score ?? "desconocido";
  const cfg = HEALTH_CONFIG[key] ?? HEALTH_CONFIG.desconocido;
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative inline-block">
      <span
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className={cn("text-xs font-extrabold px-2 py-0.5 rounded-full border cursor-help", cfg.bg, cfg.color, cfg.border)}
      >
        {cfg.label}
      </span>
      {showTip && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-gray-900 text-white text-xs leading-relaxed rounded-lg px-3 py-2 pointer-events-none">
          <p className="font-bold mb-1">Salud del cliente</p>
          <p>Activo: compra en últimos 30 días</p>
          <p>En riesgo: 31-90 días sin comprar</p>
          <p>Perdido: +90 días sin comprar</p>
        </div>
      )}
    </div>
  );
}

// ── Mejora 10: Purchase Heatmap ─────────────────────────────────────────────

const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const HOURS_DISPLAY = Array.from({ length: 9 }, (_, i) => {
  const h = i * 2 + 6; // 6, 8, 10, 12, 14, 16, 18, 20, 22
  return h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
});

function PurchaseHeatmap({ orders }: { orders: Order[] }) {
  if (orders.length < 5) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: "var(--accent)" }} /> Cuando compra?
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-4">
          Aun no hay suficientes datos (mínimo 5 compras)
        </p>
      </div>
    );
  }

  // Build heatmap: 7 days x 9 time slots (2-hour blocks from 6am to 10pm)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(9).fill(0));
  let maxVal = 0;
  let peakDay = 0;
  let peakSlot = 0;

  for (const o of orders) {
    const d = new Date(o.createdAt);
    let day = d.getDay() - 1; // 0=Mon ... 6=Sun
    if (day < 0) day = 6; // Sunday
    const hour = d.getHours();
    const slot = Math.floor((hour - 6) / 2);
    if (slot >= 0 && slot < 9) {
      grid[day][slot]++;
      if (grid[day][slot] > maxVal) {
        maxVal = grid[day][slot];
        peakDay = day;
        peakSlot = slot;
      }
    }
  }

  // Color scale: #d8f3dc (lightest) → #007A72 (darkest)
  const getColor = (val: number): string => {
    if (val === 0) return "transparent";
    const intensity = val / Math.max(maxVal, 1);
    // Interpolate between light green and dark green
    const colors = ["#d8f3dc", "#b7e4c7", "#95d5b2", "#74c69d", "#2dd4bf", "color-mix(in oklab, var(--accent) 70%, white)", "var(--accent)", "#007A72"];
    const idx = Math.min(Math.floor(intensity * (colors.length - 1)), colors.length - 1);
    return colors[idx];
  };

  const peakHour = peakSlot * 2 + 6;
  const peakHourStr = peakHour < 12 ? `${peakHour}am` : peakHour === 12 ? "12pm" : `${peakHour - 12}pm`;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4" style={{ color: "var(--accent)" }} /> Cuando compra?
      </CardTitle>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `40px repeat(9, 1fr)`, minWidth: 360 }}>
          {/* Header row */}
          <div />
          {HOURS_DISPLAY.map(h => (
            <div key={h} className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center font-medium pb-1">{h}</div>
          ))}

          {/* Data rows */}
          {DAYS.map((day, dayIdx) => (
            <>
              <div key={`label-${day}`} className="text-xs text-[var(--text-secondary)] dark:text-muted font-bold flex items-center justify-end pr-2">{day}</div>
              {grid[dayIdx].map((val, slotIdx) => (
                <div
                  key={`${dayIdx}-${slotIdx}`}
                  className="rounded-sm cursor-default transition-colors"
                  style={{
                    backgroundColor: val > 0 ? getColor(val) : undefined,
                    width: 28, height: 20,
                    border: val === 0 ? "1px solid rgba(0,0,0,0.06)" : "none",
                  }}
                  title={`${day} ${HOURS_DISPLAY[slotIdx]}: ${val} compra${val !== 1 ? "s" : ""}`}
                />
              ))}
            </>
          ))}
        </div>
      </div>

      {/* Insight */}
      <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-3 pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        Este cliente suele comprar los <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{DAYS[peakDay]}</strong> a las <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{peakHourStr}</strong>
      </p>
    </div>
  );
}

// ── Idea 17: Family Account Component ─────────────────────────────────────

type FamilyMember = { nombre: string; teléfono: string; relacion: string };

function FamilyAccountSection({ phone, customer }: { phone: string; customer: CustomerData }) {
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(() => {
    try {
      const obs = customer?.observaciones ?? "";
      const match = obs.match(/\{"familia":\s*\[.*?\]\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed.familia) ? parsed.familia : [];
      }
    } catch { /* ignore */ }
    return [];
  });
  const [addingMember, setAddingMember] = useState(false);
  const [newMember, setNewMember] = useState({ nombre: "", teléfono: "", relacion: "esposa" });
  const [savingFamily, setSavingFamily] = useState(false);

  const saveFamily = async (members: FamilyMember[]) => {
    setFamilyMembers(members);
    setSavingFamily(true);
    try {
      const currentObs = customer?.observaciones ?? "";
      const familyJson = JSON.stringify({ familia: members });
      const cleanedObs = currentObs.replace(/\{"familia":\s*\[.*?\]\}\s*/g, "").trim();
      const newObs = cleanedObs ? `${cleanedObs}\n${familyJson}` : familyJson;
      await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ observaciones: newObs }),
      });
    } catch { /* ignore */ }
    setSavingFamily(false);
  };

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--data-success-500)]" /> Cuenta Familiar
          {savingFamily && <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />}
        </CardTitle>
        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">{familyMembers.length} miembros</span>
      </div>
      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mb-3">Las compras de toda la familia suman al mismo historial. El fiado y puntos son compartidos.</p>

      <div className="flex items-center gap-2 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg px-3 py-2 mb-2">
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: getAvatarColor(customer.name) }}>
          {getInitials(customer.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{customer.name} <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">(titular)</span></p>
          <p className="text-xs text-[var(--text-tertiary)]">{customer.phone}</p>
        </div>
        <Star className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0" />
      </div>

      {familyMembers.map((m, i) => (
        <div key={i} className="flex items-center gap-2 bg-[var(--surface-alt)] dark:bg-surface rounded-lg px-3 py-2 mb-1.5">
          <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: getAvatarColor(m.nombre) }}>
            {getInitials(m.nombre)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{m.nombre} <span className="text-[var(--text-tertiary)] font-normal">({m.relacion})</span></p>
            <p className="text-xs text-[var(--text-tertiary)]">{m.teléfono}</p>
          </div>
          <button onClick={() => saveFamily(familyMembers.filter((_, idx) => idx !== i))} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {addingMember ? (
        <div className="mt-2 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">Nuevo miembro familiar</p>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Nombre" value={newMember.nombre} onChange={e => setNewMember({...newMember, nombre: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-2 py-1.5 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            <input type="tel" placeholder="Teléfono" value={newMember.teléfono} onChange={e => setNewMember({...newMember, teléfono: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-2 py-1.5 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
          </div>
          <select value={newMember.relacion} onChange={e => setNewMember({...newMember, relacion: e.target.value})} className="text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-2 py-1.5 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] w-full">
            <option value="esposa">Esposa/o</option>
            <option value="hijo">Hijo/a</option>
            <option value="padre">Padre/Madre</option>
            <option value="hermano">Hermano/a</option>
            <option value="otro">Otro</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => { if (newMember.nombre.trim()) { saveFamily([...familyMembers, newMember]); setNewMember({ nombre: "", teléfono: "", relacion: "esposa" }); setAddingMember(false); } }} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90">Agregar</button>
            <button onClick={() => setAddingMember(false)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAddingMember(true)} className="mt-2 w-full py-2 rounded-lg border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-xs font-bold text-[var(--text-tertiary)] hover:text-primary hover:border-primary/40 transition-colors">
          + Agregar miembro familiar
        </button>
      )}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

type Props = {
  phone: string;
  onClose?: () => void;
};

// ── Component ──────────────────────────────────────────────────────────────

export default function Customer360Tab({ phone, onClose }: Props) {
  const [customer, setCustomer]   = useState<CustomerData | null>(null);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [timeline, setTimeline]   = useState<TimelineEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [notes, setNotes]         = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved]   = useState(false);
  const [showEstadoCuenta, setShowEstadoCuenta] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Mejora 10R2: Observaciones con auto-save debounce
  const [observaciones, setObservaciones] = useState("");
  const [obsExpanded, setObsExpanded] = useState(false);
  const [savingObs, setSavingObs] = useState(false);
  const [obsSaved, setObsSaved] = useState(false);
  const obsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tags state
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [savingTags, setSavingTags] = useState(false);

  // Credit limit state
  const [editingCreditLimit, setEditingCreditLimit] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [savingCreditLimit, setSavingCreditLimit] = useState(false);

  const load = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    setError(false);
    try {
      const [custRes, ordersRes, timelineRes] = await Promise.all([
        fetch(`/api/customers/${encodeURIComponent(phone)}`),
        fetch(`/api/customers/${encodeURIComponent(phone)}/orders`),
        fetch(`/api/customers/${encodeURIComponent(phone)}/timeline`),
      ]);
      if (!custRes.ok) throw new Error("customer not found");
      const [custData, ordersData, timelineData] = await Promise.all([
        custRes.json(),
        ordersRes.ok ? ordersRes.json() : [],
        timelineRes.ok ? timelineRes.json() : [],
      ]);
      setCustomer(custData);
      setOrders(ordersData);
      setTimeline(timelineData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => { load(); }, [load]);

  // Populate tags when customer loads
  useEffect(() => {
    if (customer?.tags) {
      try {
        const parsed = JSON.parse(customer.tags);
        if (Array.isArray(parsed)) setTags(parsed);
      } catch {
        setTags([]);
      }
    } else {
      setTags([]);
    }
    if (customer) {
      setCreditLimitInput(String(customer.creditLimit ?? 0));
      // Mejora 10R2: Load observaciones
      setObservaciones(customer.observaciones ?? "");
      if (customer.observaciones) setObsExpanded(true);
    }
  }, [customer]);

  const handleAddTag = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed) || !phone) return;
    const updated = [...tags, trimmed];
    setTags(updated);
    setNewTag("");
    setSavingTags(true);
    try {
      await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tags: JSON.stringify(updated) }),
      });
    } finally {
      setSavingTags(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!phone) return;
    const updated = tags.filter(t => t !== tag);
    setTags(updated);
    setSavingTags(true);
    try {
      await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tags: JSON.stringify(updated) }),
      });
    } finally {
      setSavingTags(false);
    }
  };

  const handleSaveCreditLimit = async () => {
    if (!phone) return;
    const limit = parseFloat(creditLimitInput);
    if (isNaN(limit) || limit < 0) return;
    setSavingCreditLimit(true);
    try {
      await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ creditLimit: limit }),
      });
      setCustomer(prev => prev ? { ...prev, creditLimit: limit } : prev);
      setEditingCreditLimit(false);
    } finally {
      setSavingCreditLimit(false);
    }
  };

  // Mejora 10R2: Auto-save observaciones con debounce 1s
  const handleObservacionesChange = (value: string) => {
    setObservaciones(value);
    setObsSaved(false);
    if (obsTimerRef.current) clearTimeout(obsTimerRef.current);
    obsTimerRef.current = setTimeout(async () => {
      if (!phone) return;
      setSavingObs(true);
      try {
        await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ observaciones: value }),
        });
        setObsSaved(true);
        setTimeout(() => setObsSaved(false), 2500);
      } catch { /* ignore */ }
      finally { setSavingObs(false); }
    }, 1000);
  };

  const handleSaveNotes = async () => {
    if (!phone) return;
    setSavingNotes(true);
    try {
      await fetch(`/api/customers/${encodeURIComponent(phone)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ privateNotes: notes }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } finally {
      setSavingNotes(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState message="Cargando perfil…" />
    );
  }

  if (error || !customer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cliente no encontrado</p>
        <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">No existe el número {phone}</p>
      </div>
    );
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const segment      = getSegment(orders);
  const segCfg       = SEGMENT_CONFIG[segment];
  const topProducts  = getTopProducts(orders);
  const totalSpent   = orders.reduce((s, o) => s + o.total, 0);
  const avgTicket    = orders.length > 0 ? totalSpent / orders.length : 0;
  const lastOrder    = orders.length > 0
    ? [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;
  const firstOrder   = orders.length > 0
    ? [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cliente 360°</SectionTitle>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        )}
      </div>

      {/* Profile card */}
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar with auto-generated color */}
          <div
            className="h-16 w-16 rounded-xl flex items-center justify-center text-2xl font-extrabold text-white shrink-0 select-none "
            style={{ backgroundColor: getAvatarColor(customer.name) }}
          >
            {getInitials(customer.name)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{customer.name}</CardTitle>
              {/* Mejora 16: Dias como cliente */}
              {firstOrder && (() => {
                const dias = Math.floor((Date.now() - new Date(firstOrder.createdAt).getTime()) / 86400000);
                const meses = Math.floor(dias / 30);
                const anos = Math.floor(dias / 365);
                if (dias < 30) return <span className="text-xs text-[var(--text-tertiary)]">Nuevo (hace {dias}d)</span>;
                if (dias < 90) return <span className="text-xs text-[var(--text-tertiary)]">Cliente hace {dias} dias</span>;
                if (dias < 365) return <span className="text-xs text-[var(--text-tertiary)]">Cliente hace {meses} meses</span>;
                return <span className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-medium">Cliente hace {anos}+ ano(s)</span>;
              })()}
              <HealthBadge score={customer.healthScore} />
              <span className={cn("text-xs font-extrabold px-2 py-0.5 rounded-full border", segCfg.bg, segCfg.color, segCfg.border)}>
                {segCfg.label}
              </span>
              <CustomerSegmentBadge totalSpent={totalSpent} orderCount={orders.length} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] dark:text-muted">
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {customer.phone}</span>
              {customer.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {customer.location}</span>}
              {customer.birthday && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {customer.birthday}</span>}
              {lastOrder && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Últ. pedido {fmtRelative(lastOrder.createdAt)}</span>}
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-primary text-primary hover:bg-primary hover:text-white text-sm font-bold transition-colors"
            >
              <FileText className="h-4 w-4" />
              Editar ficha
            </button>
            <button
              onClick={() => setShowEstadoCuenta(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-white text-sm font-bold transition-colors"
            >
              <FileText className="h-4 w-4" />
              Estado de Cuenta
            </button>
            <a
              href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-bold transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        </div>
      </m.div>

      {/* Mejora 10R2: Notas rapidas (observaciones) */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <button
          onClick={() => setObsExpanded(!obsExpanded)}
          className="w-full px-4 sm:px-5 py-3 flex items-center justify-between hover:bg-[var(--surface-alt)] dark:hover:bg-surface transition-colors"
        >
          <span className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--data-warning-500)]" />
            Notas
            {observaciones && <span className="h-2 w-2 rounded-full bg-[var(--data-warning-500)] inline-block" />}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{obsExpanded ? "\u25B2" : "\u25BC"}</span>
        </button>
        {obsExpanded && (
          <div className="px-4 sm:px-5 pb-4 space-y-2">
            <textarea
              value={observaciones}
              onChange={e => handleObservacionesChange(e.target.value)}
              placeholder="Prefiere delivery lunes, Alergico al mani, etc."
              rows={3}
              className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center gap-2 text-xs">
              {savingObs && <span className="text-[var(--text-tertiary)] flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</span>}
              {obsSaved && <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Guardado</span>}
              <span className="text-[var(--text-tertiary)] dark:text-muted ml-auto">Auto-guarda al escribir</span>
            </div>
          </div>
        )}
      </div>

      {/* Mejora 9: Purchase chart mini (last 6 months) */}
      {orders.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" style={{ color: "var(--accent)" }} /> Compras ultimos 6 meses
          </CardTitle>
          <div className="flex items-end gap-1" style={{ height: 80 }}>
            {(() => {
              const months: Record<string, number> = {};
              const now = new Date();
              for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                months[key] = 0;
              }
              for (const o of orders) {
                const d = new Date(o.createdAt);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                if (key in months) months[key] += o.total;
              }
              const values = Object.values(months);
              const maxVal = Math.max(...values, 1);
              const labels = Object.keys(months);
              return labels.map((label, idx) => {
                const val = values[idx];
                const height = Math.max(4, (val / maxVal) * 64);
                const monthName = new Date(label + "-01").toLocaleDateString("es-PE", { month: "short" });
                return (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1" title={`${monthName}: S/${val.toFixed(0)}`}>
                    <div className="w-full max-w-[28px] rounded-t" style={{ height, backgroundColor: "var(--accent)", opacity: val > 0 ? 1 : 0.2 }} />
                    <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">{monthName}</span>
                  </div>
                );
              });
            })()}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-secondary)] dark:text-muted">
            <span>Total: <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(totalSpent)}</strong></span>
            <span>Promedio: <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(avgTicket)}</strong></span>
            <span>Pedidos: <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{orders.length}</strong></span>
          </div>
        </div>
      )}

      {/* Ficha completa del cliente */}
      {(customer.documento || customer.categoria || customer.departamento || customer.email || customer.observaciones) && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3">Datos de la ficha</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {customer.tipoPersona && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Tipo:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] capitalize">{customer.tipoPersona}</span></div>
            )}
            {customer.documento && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">{customer.tipoDocumento ?? 'Doc'}:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] font-mono">{customer.documento}</span></div>
            )}
            {customer.razonSocial && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Razon Social:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.razonSocial}</span></div>
            )}
            {customer.email && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Email:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.email}</span></div>
            )}
            {customer.whatsappSecundario && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">WA 2:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.whatsappSecundario}</span></div>
            )}
            {customer.departamento && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Ubigeo:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{[customer.departamento, customer.provincia, customer.distrito].filter(Boolean).join(', ')}</span></div>
            )}
            {customer.direccion && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Direccion:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.direccion}</span></div>
            )}
            {customer.vendedorAsignado && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Vendedor:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.vendedorAsignado}</span></div>
            )}
            {customer.genero && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Genero:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{customer.genero === 'M' ? 'Masculino' : customer.genero === 'F' ? 'Femenino' : 'Otro'}</span></div>
            )}
            {customer.fechaNacimiento && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Nacimiento:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{new Date(customer.fechaNacimiento).toLocaleDateString('es-PE')}</span></div>
            )}
            {customer.comoLlego && (
              <div className="flex gap-2"><span className="text-[var(--text-tertiary)] dark:text-muted shrink-0">Llego por:</span><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] capitalize">{customer.comoLlego}</span></div>
            )}
          </div>
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {customer.categoria && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 capitalize">{customer.categoria}</span>
            )}
            {customer.canal && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] capitalize">{customer.canal}</span>
            )}
            {customer.listaPrecio && customer.listaPrecio !== 'general' && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--data-warning-50)] dark:bg-amber-950/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] capitalize">Lista: {customer.listaPrecio}</span>
            )}
            {customer.estado && customer.estado !== 'activo' && (
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border",
                customer.estado === 'bloqueado' ? "bg-[var(--data-error-50)] dark:bg-red-950/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : "bg-[var(--surface-sunken)]/30 text-[var(--text-secondary)] border-[var(--rule-base)] dark:border-gray-600"
              )}>
                {customer.estado === 'bloqueado' ? 'BLOQUEADO' : 'INACTIVO'}
              </span>
            )}
          </div>
          {customer.observaciones && (
            <p className="mt-3 text-xs text-[var(--text-secondary)] dark:text-muted italic border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-2">{customer.observaciones}</p>
          )}
        </div>
      )}

      {/* Crédito + Etiquetas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Límite de crédito */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[var(--data-warning-500)]" /> Límite de crédito
          </CardTitle>
          {editingCreditLimit ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-secondary)]">S/</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={creditLimitInput}
                onChange={e => setCreditLimitInput(e.target.value)}
                className="w-32 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-1.5 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="0.00"
              />
              <button
                onClick={handleSaveCreditLimit}
                disabled={savingCreditLimit}
                className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
              >
                {savingCreditLimit ? "..." : "Guardar"}
              </button>
              <button
                onClick={() => setEditingCreditLimit(false)}
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {customer.creditLimit != null && customer.creditLimit > 0 ? (() => {
                const disponible = customer.creditLimit - (customer.creditBalance ?? 0);
                const pct = disponible / customer.creditLimit;
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border",
                      pct <= 0
                        ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-[var(--data-error-500)] border-[var(--data-error-500)] dark:border-[var(--data-error-500)]"
                        : pct < 0.2
                          ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]"
                          : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30"
                    )}>
                      {pct <= 0
                        ? "Sin crédito disponible"
                        : `S/ ${disponible.toFixed(2)} disponible de S/ ${Number(customer.creditLimit).toFixed(2)}`}
                    </span>
                    <button
                      onClick={() => { setEditingCreditLimit(true); setCreditLimitInput(String(customer.creditLimit ?? 0)); }}
                      className="text-xs text-primary hover:underline font-semibold"
                    >
                      Editar
                    </button>
                  </div>
                );
              })() : (
                <button
                  onClick={() => { setEditingCreditLimit(true); setCreditLimitInput("0"); }}
                  className="text-xs text-[var(--text-tertiary)] hover:text-primary transition-colors"
                >
                  + Establecer límite de crédito
                </button>
              )}
            </div>
          )}
        </div>

        {/* Etiquetas */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-[var(--text-secondary)]" /> Etiquetas
            {savingTags && <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)] ml-1" />}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.length === 0 && (
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin etiquetas</p>
            )}
            {tags.map(tag => {
              // Auto-color by hash
              const hash = tag.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
              const colors = [
                "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
                "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
                "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                "bg-amber-100 text-[var(--data-warning-700)] dark:bg-amber-900/30 dark:text-amber-400",
                "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
                "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
              ];
              const colorClass = colors[hash % colors.length];
              return (
                <span key={tag} className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", colorClass)}>
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:opacity-60 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(newTag); } }}
              placeholder="Nueva etiqueta (Enter para agregar)"
              className="flex-1 text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-1.5 bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {["Mayorista", "Restaurante", "Vecino", "Fiado frecuente", "VIP", "Nuevo"]
              .filter(s => !tags.includes(s))
              .map(s => (
                <button
                  key={s}
                  onClick={() => handleAddTag(s)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-primary border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-full px-2 py-0.5 hover:border-primary/40 transition-colors"
                >
                  + {s}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* ── Idea 17: Cuenta Familiar ──────────────────────────────────── */}
      <FamilyAccountSection phone={phone} customer={customer} />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total gastado",  value: fmt(totalSpent),        icon: CreditCard,   color: "text-[var(--data-success-500)]" },
          { label: "Pedidos",        value: String(orders.length),  icon: ShoppingCart, color: "text-[var(--data-success-500)]" },
          { label: "Ticket prom.",   value: fmt(avgTicket),         icon: TrendingUp,   color: "text-[var(--text-secondary)]" },
          { label: "Primera compra", value: firstOrder ? fmtDate(firstOrder.createdAt) : "—", icon: Calendar, color: "text-[var(--data-warning-500)]" },
        ].map(k => (
          <m.div
            key={k.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-4"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <k.icon className={cn("h-3.5 w-3.5", k.color)} />
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            </div>
            <p className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{k.value}</p>
          </m.div>
        ))}
      </div>

      {/* Mejora 11: Productos Favoritos (datos del servidor) */}
      <FavoriteProductsSection phone={phone} />

      {/* ADR-119: Documentos vinculados a este cliente */}
      <LinkedDocumentsSection entity="customer" id={phone} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Productos favoritos (local, basado en pedidos cargados) */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-[var(--text-secondary)]" /> Top productos (pedidos)
          </CardTitle>
          {topProducts.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin compras registradas</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-[var(--text-tertiary)] w-4 text-right">{i + 1}</span>
                  <div className="flex-1 bg-[var(--surface-sunken)] dark:bg-surface rounded-full h-5 overflow-hidden">
                    <div
                      className="h-full bg-primary/20 dark:bg-primary/30 rounded-full transition-all"
                      style={{ width: `${Math.min((p.count / (topProducts[0]?.count ?? 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-[120px]">{p.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)] shrink-0">x{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Actividad reciente
          </CardTitle>
          {timeline.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin actividad registrada</p>
          ) : (
            <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
              {timeline.slice(0, 12).map((ev) => {
                const Icon = TIMELINE_ICON[ev.icon] ?? Bell;
                return (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{ev.title}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate">{ev.detail}</p>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)] shrink-0">{fmtRelative(ev.date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Historial de pedidos */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" /> Historial de pedidos
          <span className="text-xs text-[var(--text-tertiary)] font-normal ml-auto">{orders.length} total</span>
        </CardTitle>
        {orders.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-4 text-center">Sin pedidos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="text-left border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <th className="pb-2 text-xs font-bold text-[var(--text-tertiary)]">Pedido</th>
                  <th className="pb-2 text-xs font-bold text-[var(--text-tertiary)]">Fecha</th>
                  <th className="pb-2 text-xs font-bold text-[var(--text-tertiary)]">Items</th>
                  <th className="pb-2 text-xs font-bold text-[var(--text-tertiary)] text-right">Total</th>
                  <th className="pb-2 text-xs font-bold text-[var(--text-tertiary)]">Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...orders]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 10)
                  .map(o => {
                    const st = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pendiente;
                    const Icon = st.Icon;
                    return (
                      <tr key={o.id} className="border-t border-[var(--rule-base)] hover:bg-[var(--surface-alt)] dark:hover:bg-surface transition-colors">
                        <td className="py-2 font-mono text-xs text-[var(--text-secondary)] dark:text-muted pr-2">#{o.id.slice(-6).toUpperCase()}</td>
                        <td className="py-2 text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDate(o.createdAt)}</td>
                        <td className="py-2 text-xs text-[var(--text-secondary)] dark:text-muted">{o.items.length} prod.</td>
                        <td className="py-2 font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">{fmt(o.total)}</td>
                        <td className="py-2">
                          <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>
                            <Icon className="h-2.5 w-2.5" />{st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mejora 10: Purchase Heatmap */}
      <PurchaseHeatmap orders={orders} />

      {/* Mejora 16: Historial de Puntos de Lealtad */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Star className="h-4 w-4 text-[var(--data-warning-500)]" /> Historial de Puntos
        </CardTitle>
        {(() => {
          // Calcular puntos desde ordenes del cliente
          const TASA_PUNTOS = 0.5; // 0.5 puntos por cada sol gastado
          const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const pointsHistory = sortedOrders.slice(0, 20).map(o => ({
            id: o.id,
            type: "earn" as const,
            points: Math.round(o.total * TASA_PUNTOS),
            description: `Compra S/${Number(o.total).toFixed(0)}`,
            date: o.createdAt,
          }));
          const totalPoints = pointsHistory.reduce((s, p) => s + p.points, 0);

          if (pointsHistory.length === 0) {
            return <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-2">El cliente no tiene movimientos de puntos</p>;
          }

          return (
            <div className="space-y-3">
              {/* Saldo actual */}
              <div className="flex items-center gap-3 p-3 bg-[var(--data-warning-50)] dark:bg-yellow-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-xl">
                <Star className="h-6 w-6 text-[var(--data-warning-500)]" />
                <div>
                  <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{totalPoints} puntos</p>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted">= S/{(totalPoints * 0.05).toFixed(2)} en descuento</p>
                </div>
                {totalPoints >= 100 && (
                  <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                    Canjeable
                  </span>
                )}
              </div>
              {/* Timeline */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {pointsHistory.map(entry => (
                  <div key={entry.id} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      "shrink-0 font-bold",
                      entry.type === "earn" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                    )}>
                      {entry.type === "earn" ? "+" : "-"}{entry.points} pts
                    </span>
                    <span className="text-[var(--text-secondary)] truncate flex-1">
                      {entry.description}
                    </span>
                    <span className="text-[var(--text-tertiary)] dark:text-muted shrink-0 text-xs">
                      {fmtDate(entry.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Notas del vendedor */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" /> Notas del vendedor
        </CardTitle>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Ej: Cliente prefiere pago con Yape. Pide factura."
          rows={3}
          className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center justify-between mt-2">
          <AnimatePresence>
            {notesSaved && (
              <m.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Guardado
              </m.p>
            )}
          </AnimatePresence>
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes || !notes.trim()}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Guardar nota
          </button>
        </div>
      </div>

      {/* Estado de Cuenta Modal */}
      {showEstadoCuenta && (
        <EstadoCuentaModal
          customerPhone={customer.phone}
          customerName={customer.name}
          onClose={() => setShowEstadoCuenta(false)}
        />
      )}

      {/* Editar ficha modal */}
      <ClienteFormModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSaved={() => { setShowEditModal(false); load(); }}
        customer={customer as Record<string, unknown>}
        initialFormat="completo"
      />
    </div>
  );
}
