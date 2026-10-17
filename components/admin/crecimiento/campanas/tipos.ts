/**
 * Tipos y rótulos de Crecimiento › Campañas (alineados con /api/campaigns y
 * `CampaignsDB`). Las AUDIENCIAS son las que resuelve el servidor al mandar
 * (`CampaignsDB.resolveAudience`): no son los segmentos de Mis clientes
 * (`inferSegment`: Frecuente / Ocasional / Nuevo / Perdido). Por eso acá se
 * llaman «Para quién» y no «segmentos»: dos «segmentos» con reglas distintas
 * en dos pestañas se leían como el mismo dato con dos cifras.
 */
import { AlertTriangle, Bell, Cake, Clock, Crown, MessageCircle, Send, Users, type LucideIcon } from "@buleje/design-system/icons";

export type Segment = "todos" | "vip" | "inactivos" | "cumpleanos" | "deudores";
export type Channel = "whatsapp" | "inapp" | "ambos";
export type Status = "borrador" | "programada" | "activa" | "completada" | "cancelada";

export type Campaign = {
  id: string;
  name: string;
  message: string;
  segment: Segment;
  channel: Channel;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  totalAudience: number;
  delivered: number;
  opened: number;
  conversions: number;
  revenue: number;
  createdAt: string;
};

export interface Audiencia {
  id: Segment;
  /** El nombre en el modal y en la tabla. */
  rotulo: string;
  /** El nombre en la fila «Para quién» (entra al lado del conteo). */
  corto: string;
  icono: LucideIcon;
  /** Cómo la arma el servidor, dicho en castellano. */
  regla: string;
  /** Lo que ya se le manda solo, sin campaña. */
  auto: string | null;
}

/** En el orden de la fila «Para quién»: primero las que más se pierden. */
export const AUDIENCIAS: readonly Audiencia[] = [
  {
    id: "inactivos",
    rotulo: "Inactivos (30 días)",
    corto: "Inactivos",
    icono: Clock,
    regla: "No compran en el mostrador hace más de 30 días.",
    auto: "Ya reciben un recordatorio de recompra automático a los ~15 días.",
  },
  {
    id: "cumpleanos",
    rotulo: "Cumpleañeros del mes",
    corto: "Cumpleañeros",
    icono: Cake,
    regla: "Cumplen años este mes.",
    auto: "Ya reciben saludo y cupón automático el día de su cumpleaños.",
  },
  {
    id: "deudores",
    rotulo: "Con fiado",
    corto: "Con fiado",
    icono: AlertTriangle,
    regla: "Tienen saldo de fiado pendiente.",
    auto: "Ya reciben un recordatorio de pago automático.",
  },
  {
    id: "vip",
    rotulo: "VIP (oro y diamante)",
    corto: "VIP",
    icono: Crown,
    regla: "Su nivel de puntos es oro o diamante.",
    auto: null,
  },
  {
    id: "todos",
    rotulo: "Todos los clientes",
    corto: "Todos",
    icono: Users,
    regla: "Toda tu base registrada.",
    auto: null,
  },
];

export const SEGMENT_LABELS: Record<Segment, string> = Object.fromEntries(
  AUDIENCIAS.map((a) => [a.id, a.rotulo]),
) as Record<Segment, string>;

export const CHANNEL_META: Record<Channel, { label: string; icon: LucideIcon }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  inapp: { label: "App", icon: Bell },
  ambos: { label: "WhatsApp y app", icon: Send },
};

/** Texto chico en color → tinta `-ink` (la `-500` sobre su tinte no llega a 4,5:1). */
export const STATUS_META: Record<Status, { label: string; clase: string }> = {
  borrador: { label: "Borrador", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  programada: { label: "Programada", clase: "bg-[var(--data-info-50)] text-[var(--data-info-ink)] dark:bg-[var(--data-info-500)]/15" },
  activa: { label: "Activa", clase: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15" },
  completada: { label: "Enviada", clase: "bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15" },
  cancelada: { label: "Cancelada", clase: "bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15" },
};

/** Se puede cancelar mientras no salió. */
export const sePuedeCancelar = (s: Status) => s === "programada" || s === "borrador" || s === "activa";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const dos = (n: number) => String(n).padStart(2, "0");

/** «jueves 10/09 15:30», en la hora del navegador (sin depender del ICU). */
export function cuandoCorto(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${DIAS[d.getDay()]} ${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
