/**
 * Tipos y rótulos de lo que ya mandaste desde Crecimiento › Mandar mensaje
 * (alineados con /api/campaigns y `CampaignsDB`). «Para quién» vive en
 * `lib/admin/grupos-mensaje.ts`: un solo selector para «Uno por uno» y
 * «Automático» (19-10; antes Campañas tenía sus 5 audiencias acá y Clientes ›
 * Mensajes masivos sus 9 segmentos aparte).
 */
import { Bell, MessageCircle, Send, Smartphone, type LucideIcon } from "@buleje/design-system/icons";
import type { AudienciaServidor } from "@/lib/admin/grupos-mensaje";

export type Segment = AudienciaServidor;
/** `manual` = lo abriste tú, uno por uno, en tu WhatsApp (el cron no lo despacha). */
export type Channel = "whatsapp" | "inapp" | "ambos" | "manual";
export type ChannelAutomatico = Exclude<Channel, "manual">;
export type Status = "borrador" | "programada" | "activa" | "completada" | "cancelada";

export type Campaign = {
  id: string;
  name: string;
  message: string;
  /** Un id de `GRUPOS_MENSAJE` (los de «sólo uno por uno» sólo con canal `manual`). */
  segment: string;
  channel: Channel;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  totalAudience: number;
  /** En `manual`: a cuántos les abriste el chat. */
  delivered: number;
  opened: number;
  conversions: number;
  revenue: number;
  createdAt: string;
};

export const CHANNEL_META: Record<Channel, { label: string; icon: LucideIcon }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  inapp: { label: "App", icon: Bell },
  ambos: { label: "WhatsApp y app", icon: Send },
  manual: { label: "Tu WhatsApp, uno por uno", icon: Smartphone },
};

/** Los que puede despachar el servidor (el modo «Automático»). */
export const CANALES_AUTOMATICOS: readonly ChannelAutomatico[] = ["whatsapp", "inapp", "ambos"];

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
