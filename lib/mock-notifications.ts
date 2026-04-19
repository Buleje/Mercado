/**
 * Mock data para Notifications Center MVP.
 * ADR: temporal, reemplazar con API real + SSE/WebSocket cuando exista backend.
 */

export type NotifType = "pedido" | "oferta" | "tienda" | "sistema";

export type Notification = {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  actionUrl: string;
  actionLabel: string;
};

const now = Date.now();
const min = 60 * 1000;
const hr = 60 * min;
const day = 24 * hr;

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "n_001",
    type: "pedido",
    title: "Tu pedido está en camino",
    body: "Carlos Ríos ya salió con tu pedido de Bodega Doña Elena. Llega en 15–30 min.",
    timestamp: now - 5 * min,
    read: false,
    actionUrl: "/mis-pedidos",
    actionLabel: "Rastrear pedido",
  },
  {
    id: "n_002",
    type: "oferta",
    title: "Oferta del día — Arroz al 15% dcto",
    body: "Buleje tiene Arroz Costeño 1 kg a S/3.80 solo hasta las 6 PM.",
    timestamp: now - 2 * hr,
    read: false,
    actionUrl: "/tienda",
    actionLabel: "Ver oferta",
  },
  {
    id: "n_003",
    type: "tienda",
    title: "Bodega Doña Elena abrió",
    body: "Tu bodega favorita ya está atendiendo. Horario: 7 AM – 9 PM.",
    timestamp: now - 3 * hr,
    read: false,
    actionUrl: "/tienda/bodega-dona-elena",
    actionLabel: "Visitar bodega",
  },
  {
    id: "n_004",
    type: "pedido",
    title: "Pedido #ABC002 entregado",
    body: "Tu pedido de Pan de molde Bimbo y Leche Gloria fue entregado con éxito.",
    timestamp: now - 1 * day,
    read: true,
    actionUrl: "/mis-pedidos",
    actionLabel: "Ver detalle",
  },
  {
    id: "n_005",
    type: "sistema",
    title: "Bienvenido a Buleje",
    body: "Tu cuenta está lista. Completá tu perfil para recibir mejores recomendaciones.",
    timestamp: now - 1 * day - 4 * hr,
    read: true,
    actionUrl: "/cuenta/preferencias",
    actionLabel: "Completar perfil",
  },
  {
    id: "n_006",
    type: "oferta",
    title: "Cupón disponible: -10% en limpieza",
    body: "Usá el código LIMPIO10 en tu próximo pedido de productos de limpieza. Vence en 3 días.",
    timestamp: now - 2 * day,
    read: true,
    actionUrl: "/cuenta/cupones",
    actionLabel: "Ver cupón",
  },
  {
    id: "n_007",
    type: "tienda",
    title: "Nueva bodega cerca de vos",
    body: "Bodega Los Andes abrió en Jr. Loreto 215, a 1.1 km de tu dirección principal.",
    timestamp: now - 3 * day,
    read: true,
    actionUrl: "/tienda",
    actionLabel: "Explorar bodegas",
  },
  {
    id: "n_008",
    type: "pedido",
    title: "Pedido #ABC003 entregado",
    body: "Fideos, Detergente y Jabón Bolívar llegaron. Esperamos que todo esté perfecto.",
    timestamp: now - 7 * day,
    read: true,
    actionUrl: "/mis-pedidos",
    actionLabel: "Ver detalle",
  },
  {
    id: "n_009",
    type: "oferta",
    title: "Puntos dobles este fin de semana",
    body: "Cada compra acumula el doble de puntos hasta el domingo. Aprovechá para canjear premios.",
    timestamp: now - 8 * day,
    read: true,
    actionUrl: "/mi-puntos",
    actionLabel: "Ver mis puntos",
  },
  {
    id: "n_010",
    type: "sistema",
    title: "Actualizamos los términos de servicio",
    body: "Revisá los cambios en nuestra política de privacidad antes del 30 de abril.",
    timestamp: now - 10 * day,
    read: true,
    actionUrl: "/ayuda",
    actionLabel: "Leer términos",
  },
  {
    id: "n_011",
    type: "tienda",
    title: "Buleje tiene nuevos productos",
    body: "Abrieron su sección de frutas y verduras frescas. Producto del día: plátanos de Pucallpa.",
    timestamp: now - 12 * day,
    read: true,
    actionUrl: "/tienda/bodega-san-martin",
    actionLabel: "Ver novedades",
  },
  {
    id: "n_012",
    type: "pedido",
    title: "Pedido #ABC004 cancelado",
    body: "Tu pedido de Gaseosa Inca Kola fue cancelado. No se realizó ningún cobro.",
    timestamp: now - 14 * day,
    read: true,
    actionUrl: "/mis-pedidos",
    actionLabel: "Ver historial",
  },
];

/** Unread count helper */
export function getUnreadCount(notifications: Notification[]): number {
  return notifications.filter((n) => !n.read).length;
}

/** Filter por tipo */
export function filterByType(
  notifications: Notification[],
  type: NotifType
): Notification[] {
  return notifications.filter((n) => n.type === type);
}

/** Formato de tiempo relativo (sin librería externa) */
export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / (60 * 1000));
  const hrs = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  if (hrs < 24) return `hace ${hrs}h`;
  if (days === 1) return "ayer";
  if (days < 7) {
    const fecha = new Date(timestamp);
    return fecha.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
  }
  return new Date(timestamp).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    year: days > 365 ? "numeric" : undefined,
  });
}
