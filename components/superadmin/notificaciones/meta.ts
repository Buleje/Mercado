/**
 * Cómo se ve cada nivel y cada categoría del centro de notificaciones.
 *
 * El nivel lo decide el servidor (`lib/superadmin/nivel-aviso.ts`); acá sólo
 * su color, su ícono y su texto. La etiqueta lleva SIEMPRE texto e ícono además
 * del color: el rojo solo no le dice nada a quien no distingue colores.
 */
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownCircle,
  CreditCard,
  FileWarning,
  HeartHandshake,
  Info,
  ReceiptText,
  ShieldAlert,
  ShoppingBag,
  Store,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { NIVEL_ETIQUETA, type CategoriaAviso, type Nivel } from "@/lib/superadmin/nivel-aviso";

interface MetaNivel {
  etiqueta: string;
  icon: LucideIcon;
  /** Fondo + texto + anillo de la etiqueta (claro y oscuro). */
  tag: string;
  /** El punto de color del chip de filtro. */
  punto: string;
  /** Cuándo hay que actuar, para el ⓘ. */
  cuando: string;
}

export const NIVEL_META: Record<Nivel, MetaNivel> = {
  urgente: {
    etiqueta: NIVEL_ETIQUETA.urgente,
    icon: AlertOctagon,
    // Lleno (no tinte): el «warning» del DS es coral y, en tinte, se confundía con este rojo. Blanco sobre 600 = 4,8:1.
    tag: "bg-[var(--data-error-600)] text-white ring-[var(--data-error-600)] dark:bg-[var(--data-error-700)] dark:ring-[var(--data-error-700)]",
    punto: "bg-[var(--data-error-500)]",
    cuando: "hoy",
  },
  importante: {
    etiqueta: NIVEL_ETIQUETA.importante,
    icon: AlertTriangle,
    tag: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] ring-[var(--data-warning-100)] dark:text-[var(--data-warning-500)]",
    punto: "bg-[var(--data-warning-500)]",
    cuando: "esta semana",
  },
  leve: {
    etiqueta: NIVEL_ETIQUETA.leve,
    icon: ArrowDownCircle,
    tag: "bg-[var(--data-info-50)] text-[var(--data-info-700)] ring-[var(--data-info-100)] dark:text-[var(--data-info-500)]",
    punto: "bg-[var(--data-info-500)]",
    cuando: "cuando tengas tiempo",
  },
  informativo: {
    etiqueta: NIVEL_ETIQUETA.informativo,
    icon: Info,
    tag: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-[var(--rule-base)]",
    punto: "bg-[var(--text-tertiary)]",
    cuando: "para que lo sepas",
  },
};

interface MetaCategoria {
  etiqueta: string;
  /** Para la etiqueta de la fila y los chips a 400 px. */
  corta: string;
  descripcion: string;
  icon: LucideIcon;
}

export const CATEGORIA_META: Record<CategoriaAviso, MetaCategoria> = {
  atRisk: {
    etiqueta: "Negocios en riesgo",
    corta: "En riesgo",
    descripcion: "Tiendas con riesgo alto o crítico de irse: necesitan rescate.",
    icon: HeartHandshake,
  },
  panelErrors: {
    etiqueta: "Errores en paneles",
    corta: "Error de panel",
    descripcion: "Errores en el panel de los negocios: ayúdalos a resolverlos.",
    icon: ShieldAlert,
  },
  paymentProofs: {
    etiqueta: "Yape de apertura",
    corta: "Apertura",
    descripcion: "Comprobantes que esperan verificación para crear la tienda.",
    icon: ReceiptText,
  },
  paymentApprovals: {
    etiqueta: "Aprobaciones Yape",
    corta: "Yape",
    descripcion: "Pagos detectados por Yape Vision que esperan revisión.",
    icon: CreditCard,
  },
  vendorApplications: {
    etiqueta: "Solicitudes de tienda",
    corta: "Solicitud",
    descripcion: "Pedidos para sumarse al marketplace.",
    icon: Store,
  },
  pendingOrders: {
    etiqueta: "Pedidos sin atender",
    corta: "Pedido",
    descripcion: "Pedidos de cualquier tienda en pendiente o confirmado.",
    icon: ShoppingBag,
  },
  supportCorrections: {
    etiqueta: "Soporte / correcciones",
    corta: "Corrección",
    descripcion: "Negocios que piden corregir una guía emitida.",
    // FileWarning y no FilePen: FilePen no está en el barril de íconos del DS (el mismo de la bandeja).
    icon: FileWarning,
  },
};

/** «ahora», «12 min», «5 h», «3 d». */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const m = Math.floor((ahora - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export const METODO_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};
