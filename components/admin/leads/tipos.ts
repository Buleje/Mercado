/**
 * Interesados (antes «Funnel de Leads»): los negocios que dejaron su WhatsApp
 * en el formulario de Buleje (`/api/lead/capture`) y todavía no pagan.
 * Rótulos en castellano de lo que la base guarda en inglés (`source`,
 * `status`, `businessType`): en la pantalla no se ve ni una clave.
 */
import { limaDateKey } from "@/lib/utils";
import { diaConNombre } from "@/components/admin/comisiones/formato";

export interface FunnelStats {
  total: number;
  last7d: number;
  last30d: number;
  conversionRate: number;
  bySource: Record<string, number>;
  byBusinessType: Record<string, number>;
  byCity: Record<string, number>;
  byStatus: Record<string, number>;
  oldestLeadAt?: string;
  newestLeadAt?: string;
}

export interface LeadRow {
  id: string;
  entityId: string;
  whatsappLast4: string;
  name: string;
  businessType: string;
  businessName?: string;
  city: string;
  monthlyRevenue?: string;
  painPoint?: string;
  preferredDemoTime?: string;
  source: string;
  ref?: string;
  status: string;
  createdAt: string;
}

export type EstadoLead = "new" | "contacted" | "demo_done" | "signed_up" | "won" | "lost";

/** Rótulo, plural para los chips y color del punto (texto siempre en tinta legible). */
export const ESTADOS: Record<EstadoLead, { rotulo: string; plural: string; punto: string }> = {
  new: { rotulo: "Nuevo", plural: "Nuevos", punto: "bg-[var(--text-tertiary)]" },
  contacted: { rotulo: "Contactado", plural: "Contactados", punto: "bg-[var(--data-warning-500)]" },
  demo_done: { rotulo: "Demo hecha", plural: "Demo hecha", punto: "bg-[var(--data-8)]" },
  signed_up: { rotulo: "Registrado", plural: "Registrados", punto: "bg-[var(--data-success-500)]" },
  won: { rotulo: "Ganado", plural: "Ganados", punto: "bg-[var(--data-success-500)]" },
  lost: { rotulo: "Perdido", plural: "Perdidos", punto: "bg-[var(--data-error-500)]" },
};

export const ORDEN_ESTADOS = Object.keys(ESTADOS) as EstadoLead[];

/** El paso que sigue (el botón de la fila). Ganado y Perdido cierran. */
export const SIGUIENTE: Partial<Record<EstadoLead, EstadoLead>> = {
  new: "contacted",
  contacted: "demo_done",
  demo_done: "signed_up",
  signed_up: "won",
};

export const esEstado = (s: string): s is EstadoLead => s in ESTADOS;
export const estadoDe = (s: string): EstadoLead => (esEstado(s) ? s : "new");

/** Por dónde llegó: las claves que manda la página (`source`), dichas como las dice el dueño. */
const CANALES: Record<string, string> = {
  direct: "Directo",
  "wa-outbound": "Les escribimos",
  whatsapp: "WhatsApp",
  "fb-ads": "Anuncio de Facebook",
  facebook: "Facebook",
  tiktok: "TikTok",
  referral: "Recomendado",
  referido: "Recomendado",
  google: "Google",
  instagram: "Instagram",
};

export function rotuloCanal(source: string): string {
  if (!source) return CANALES.direct!;
  return CANALES[source.toLowerCase()] ?? source.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const TIPOS: Record<string, string> = {
  bodega: "Bodega",
  pizzeria: "Pizzería",
  ferreteria: "Ferretería",
  minimarket: "Minimarket",
  otro: "Otro",
};

export const rotuloTipo = (t: string): string => TIPOS[t] ?? (t ? t.replace(/^\w/, (c) => c.toUpperCase()) : "—");

/** «jueves 08/10» en hora de Lima (a las 20:00 de Pucallpa el UTC ya es mañana). */
export const llegoEl = (iso: string): string => diaConNombre(limaDateKey(iso));
