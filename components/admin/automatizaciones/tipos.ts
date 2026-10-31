/**
 * Lo que devuelven los cuatro endpoints de Automatizaciones (sólo lectura acá:
 * los contratos viven en `app/api/admin/{ia-salud,whatsapp-anotar,telegram,n8n}`).
 * Se leen UNA vez en `AutomatizacionesModule` y se reparten: la cabecera, los
 * indicadores y cada canal hablan del mismo dato, no de tres pedidos distintos.
 */

export const API_SALUD = "/api/admin/ia-salud";
export const API_WHATSAPP = "/api/admin/whatsapp-anotar";
export const API_TELEGRAM = "/api/admin/telegram";
export const API_N8N = "/api/admin/n8n/flows";

/* ── Estado de la IA ─────────────────────────────────────────────────────── */

export type EstadoSalud = "ok" | "roto" | "sin-verificar";

export interface ModeloRevisado {
  para: string;
  modelo: string;
  estado: EstadoSalud;
  detalle?: string;
}

export interface HuecoCableado {
  tipo: string;
  donde: string;
  sintoma: string;
}

export interface Diagnostico {
  generadoEn: string;
  proveedor: { nombre: string; configurado: boolean; modelosDisponibles: number | null; error?: string };
  modelos: ModeloRevisado[];
  vision: { disponible: boolean; modelo: string; nota: string };
  agentes: { tools: number; huecos: HuecoCableado[] };
  resumen: string;
  estado: EstadoSalud;
}

/* ── Canales ─────────────────────────────────────────────────────────────── */

/** El código de vinculación: dura 15 minutos y se quema al usarse. */
export interface CodigoVinculo {
  codigo: string;
  quedanSegundos: number;
}

export interface DuenoWhatsApp {
  telefono: string;
  nombre: string;
  vinculadoEn: string;
  ultimoUso?: string | null;
}

export interface EstadoWhatsApp {
  activo: boolean;
  comoSeLlama: string | null;
  duenos: DuenoWhatsApp[];
  codigo: CodigoVinculo | null;
  comoVincular: string;
}

export interface ChatTelegram {
  chatId: number;
  nombre: string;
  vinculadoEn: string;
  ultimoUso?: string | null;
}

export interface EstadoTelegram {
  configurado: boolean;
  bot: { username?: string; first_name?: string } | null;
  webhook: { url?: string; pending_update_count?: number; last_error_message?: string } | null;
  chats: ChatTelegram[];
  codigo: CodigoVinculo | null;
  urlWebhookSugerida: string;
}

export interface FlujoN8n {
  id: string;
  nombre: string;
  descripcion: string;
  url: string;
  activo: boolean;
  createdAt: string;
  ultimoDisparo?: { fecha: string; ok: boolean; detalle: string } | null;
}

export interface ConfigN8n {
  flujos: FlujoN8n[];
  token: string | null;
  tokenVersion: number;
  urlEntrante: string;
  redLocalHabilitada: boolean;
}
