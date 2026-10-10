import { Clock, Star, CheckCircle, XCircle, Truck, MessageCircle, Bell, ShoppingBag } from "@buleje/design-system/icons";
import { formatCurrency, formatDate } from "@/lib/format";

/** Tipos, ayudas y configuración de la ficha 360 del cliente (antes arriba de Customer360Tab). */
// ── Types ──────────────────────────────────────────────────────────────────

export type HealthScore = "activo" | "en_riesgo" | "perdido";

export type CustomerData = {
  name: string;
  phone: string;
  location?: string;
  reference?: string;
  birthday?: string | null;
  /** Un solo cumpleaños "AAAA-MM-DD" (birthday o fechaNacimiento, la que tenga dato). */
  cumple?: string | null;
  notifOrderUpdates?: boolean;
  notifPromotions?: boolean;
  notifRestock?: boolean;
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
  /** Notas del vendedor: el GET las trae; antes la caja salía vacía y guardar pisaba la anterior. */
  privateNotes?: string | null;
};

export type OrderItem = { name: string; quantity: number; unit: string; price: number };

export type Order = {
  id: string;
  status: string;
  total: number;
  paymentMethod: string;
  items: OrderItem[];
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  type: "order" | "notification" | "review" | "sale" | "in-app";
  icon: string;
  title: string;
  detail: string;
  date: string;
  meta?: Record<string, unknown>;
};

export type Segment = "frecuente" | "ocasional" | "nuevo" | "perdido";

// ── Helpers ────────────────────────────────────────────────────────────────

export function fmt(n: number) {
  return `${formatCurrency(n)}`;
}

export function fmtDate(iso: string) {
  return formatDate(iso);
}

export function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

export function getSegment(orders: Order[]): Segment {
  if (orders.length === 0) return "nuevo";
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastDays = Math.floor((Date.now() - new Date(sorted[0].createdAt).getTime()) / 86400000);
  if (lastDays > 90) return "perdido";
  if (orders.length >= 5) return "frecuente";
  if (orders.length >= 2) return "ocasional";
  return "nuevo";
}

export function getTopProducts(orders: Order[]): { name: string; count: number }[] {
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

export function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]?.toUpperCase() ?? "").join("");
}

// ── Mejora 9: Avatar color auto-generado ─────────────────────────────────────
export function getAvatarColor(name: string): string {
  const colors = ["var(--accent)", "#ff6b5b", "#e63946", "#457b9d", "#6b705c", "#9b5de5"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── Config ─────────────────────────────────────────────────────────────────

export const SEGMENT_CONFIG: Record<Segment, { label: string; color: string; bg: string; border: string }> = {
  frecuente: { label: "Frecuente",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" },
  ocasional: { label: "Ocasional",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",     bg: "bg-primary/10 dark:bg-primary/15",     border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30" },
  nuevo:     { label: "Nuevo",      color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", border: "border-[var(--rule-base)] dark:border-[var(--rule-base)]" },
  perdido:   { label: "Perdido",    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",       bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",       border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" },
};

export const HEALTH_CONFIG: Record<HealthScore | "desconocido", { label: string; color: string; bg: string; border: string; tooltip: string }> = {
  activo:      { label: "Activo",     color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", border: "border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", tooltip: "Compra en últimos 30 días" },
  en_riesgo:   { label: "En riesgo",  color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",     bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",     border: "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]",   tooltip: "Sin compras hace 31-90 días" },
  perdido:     { label: "Perdido",    color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",         bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",         border: "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]",       tooltip: "Sin compras hace +90 días" },
  desconocido: { label: "Desconocido", color: "text-[var(--text-tertiary)]",      bg: "bg-[var(--surface-sunken)]/30",      border: "border-[var(--rule-base)] ",     tooltip: "Activo: compra en últimos 30 días | En riesgo: 31-90 días | Perdido: +90 días" },
};

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pendiente:  { label: "Pendiente",  color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",   Icon: Clock },
  confirmado: { label: "Confirmado", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",     bg: "bg-primary/10 dark:bg-primary/15",     Icon: CheckCircle },
  en_camino:  { label: "En camino",  color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]", Icon: Truck },
  entregado:  { label: "Entregado",  color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", Icon: CheckCircle },
  cancelado:  { label: "Cancelado",  color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",       bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",       Icon: XCircle },
};

export const TIMELINE_ICON: Record<string, React.ElementType> = {
  "shopping-bag": ShoppingBag,
  "check": CheckCircle,
  "x": XCircle,
  "message-circle": MessageCircle,
  "bell": Bell,
  "star": Star,
};

/** Lo que la ficha calcula de los pedidos una vez cargada (se pasa entero a cada bloque). */
export type Resumen360 = {
  segment: Segment;
  segCfg: (typeof SEGMENT_CONFIG)[Segment];
  topProducts: { name: string; count: number }[];
  totalSpent: number;
  avgTicket: number;
  lastOrder: Order | null;
  firstOrder: Order | null;
};
