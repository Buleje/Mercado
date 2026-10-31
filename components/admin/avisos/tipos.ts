/**
 * Avisos por pedido — tipos y cómo se dice cada cosa.
 *
 * El historial (`GET /api/notifications`, tabla NotificationLog) mezcla dos
 * cosas: los avisos a CLIENTES (estado de su pedido, entrega, promoción) y las
 * alertas que el sistema te manda A TI (stock bajo, productos sin venta, reporte
 * diario, plazos del CTP). Antes salían juntas y con el tipo crudo
 * («reporte_diario:cmuit…:whatsapp»); acá se separan y se nombran.
 */
import { orderStatusMeta } from "@/lib/chat/order-context";

export type Aviso = {
  id: string;
  type: string;
  recipient: string;
  message: string;
  status: string;
  orderId: string | null;
  createdAt: string;
};

/** Un pedido para elegir a quién avisar (de `/api/orders`, que trae `customer: { name, phone }`). */
export type PedidoParaAviso = {
  id: string;
  nombre: string;
  celular: string | null;
  total: number;
  status: string;
};

export type FiltroAvisos = "todos" | "clientes" | "alertas" | "error";

const A_CLIENTES = new Set(["order_confirmation", "order_status", "delivery", "promotion"]);

/** ¿Es un aviso a un cliente (y no una alerta para el dueño)? */
export function esAClientes(type: string): boolean {
  return type.startsWith("order_") || A_CLIENTES.has(type);
}

export function pasaFiltro(a: Aviso, filtro: FiltroAvisos): boolean {
  if (filtro === "todos") return true;
  if (filtro === "error") return a.status === "failed";
  return filtro === "clientes" ? esAClientes(a.type) : !esAClientes(a.type);
}

const POR_CANAL = (canal: string | undefined) => (canal === "email" ? " por correo" : canal === "whatsapp" ? " por WhatsApp" : "");

/** Qué fue, en palabras: «Pedido cancelado», «Stock bajo», «Reporte diario por correo». */
export function rotuloTipo(type: string): string {
  if (type === "order_confirmation") return "Confirmación de pedido";
  if (type === "order_status") return "Estado del pedido";
  if (type.startsWith("order_")) return `Pedido ${orderStatusMeta(type.slice(6)).label.toLowerCase()}`;
  if (type === "delivery") return "Entrega";
  if (type === "promotion") return "Promoción";
  if (type.startsWith("low_stock")) return "Stock bajo";
  if (type === "dead_stock_weekly") return "Productos sin venta";
  if (type.startsWith("reporte_diario_manual")) return "Reporte diario (a mano)";
  if (type.startsWith("reporte_diario")) return `Reporte diario${POR_CANAL(type.split(":")[2])}`;
  if (type.startsWith("ctp_plazos")) return `Plazos del libro CTP${POR_CANAL(type.split("_")[2])}`;
  const t = type.replace(/[_:]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Aviso";
}

/** El estado del envío: texto + color (con su par oscuro). */
export const ESTADO_AVISO: Record<string, { rotulo: string; clase: string }> = {
  sent: { rotulo: "Enviado", clase: "text-[var(--data-success-ink)]" },
  link: { rotulo: "Link listo", clase: "text-[var(--text-secondary)]" },
  pending: { rotulo: "Pendiente", clase: "text-[var(--data-warning-ink)]" },
  pendiente: { rotulo: "Pendiente", clase: "text-[var(--data-warning-ink)]" },
  failed: { rotulo: "Falló", clase: "text-[var(--data-error-ink)]" },
  skipped: { rotulo: "No se mandó", clase: "text-[var(--text-tertiary)]" },
};

export function estadoAviso(status: string) {
  return ESTADO_AVISO[status] ?? { rotulo: status || "—", clase: "text-[var(--text-secondary)]" };
}

/** «916 409 675», «+51 916 409 675»; lo que no es un celular («admin») se dice como dueño. */
export function paraQuien(recipient: string): string {
  const d = recipient.replace(/\D/g, "");
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("51")) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (recipient === "admin" || recipient === "owner") return "Tú";
  return recipient || "—";
}

/** El link de WhatsApp para volver a mandar ese mismo texto (no escribe nada en el servidor). */
export function linkWhatsApp(recipient: string, texto: string): string | null {
  const d = recipient.replace(/\D/g, "");
  if (d.length < 8) return null;
  return `https://wa.me/${d.startsWith("51") ? d : `51${d}`}?text=${encodeURIComponent(texto)}`;
}

/** El N° corto del pedido: el MISMO que lleva el mensaje al cliente (`id.slice(-6)`). */
export const numeroCorto = (orderId: string) => `#${orderId.slice(-6)}`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const dd = (n: number) => String(n).padStart(2, "0");

/** «hoy 14:20», «ayer 22:01», «jueves 08/10 22:01» (hora del equipo). */
export function cuando(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const hora = `${dd(d.getHours())}:${dd(d.getMinutes())}`;
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dif = Math.round((dia(ahora) - dia(d)) / 86_400_000);
  if (dif === 0) return `hoy ${hora}`;
  if (dif === 1) return `ayer ${hora}`;
  return `${DIAS[d.getDay()]} ${dd(d.getDate())}/${dd(d.getMonth() + 1)} ${hora}`;
}

/**
 * `/api/orders` dice el cliente de DOS maneras según la rama: sin `limit`
 * (mapOrder) lo anida en `customer.name/phone`; con `limit&page`
 * (OrdersPaginatedDB) lo deja plano en `customerName/customerPhone`. Antes se
 * pedía sin `limit` y se leía plano: todos salían «Sin nombre» y sin celular.
 */
export function pedidoDesdeApi(o: unknown): PedidoParaAviso | null {
  if (!o || typeof o !== "object") return null;
  const r = o as { id?: unknown; total?: unknown; status?: unknown; customerName?: unknown; customerPhone?: unknown; customer?: { name?: unknown; phone?: unknown } };
  if (typeof r.id !== "string") return null;
  const texto = (...v: unknown[]) => v.find((x): x is string => typeof x === "string" && x.trim() !== "")?.trim() ?? null;
  return {
    id: r.id,
    nombre: texto(r.customerName, r.customer?.name) ?? "Sin nombre",
    celular: texto(r.customerPhone, r.customer?.phone),
    total: Number(r.total) || 0,
    status: typeof r.status === "string" ? r.status : "",
  };
}
