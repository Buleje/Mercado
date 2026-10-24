/**
 * Las categorías del centro de notificaciones y cómo se lee cada aviso
 * (Brandon 2026-10-10: «un modal central, ordenado y clasificado»).
 *
 * Las categorías salen de los `type` que de verdad se guardan — medido el
 * 10-10 en todos los negocios: FIADO_REMINDER 106, CACAO_BENEFICIO_ATENCION 86,
 * ADELANTO_VENCIDO 76, marketplace_order 60, forecast_daily 30, CLIENTE_NUEVO 12,
 * camaras 9, CTP_PLAZO_SERFOR 5, DOCUMENTO_VENCIMIENTO 4, asistente-aviso 3,
 * DRIVER_APPLICATION 2, CARRITO_ABANDONADO 2, DOCUMENTO_APROBACION 1 — más los
 * que el código crea aunque hoy no haya ninguno (`lib/notification-generators.ts`
 * y los crons). Un tipo que no está acá cae en «Sistema»: nunca se pierde.
 */
import {
  Package,
  Settings2,
  ShoppingBag,
  Trees,
  Wallet,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { limaDateKey } from "@/lib/utils";

export type CategoriaId = "pedidos" | "plata" | "inventario" | "campo" | "sistema";
export type FiltroCategoria = "todas" | CategoriaId;

export interface Categoria {
  id: CategoriaId;
  label: string;
  icon: LucideIcon;
}

/** En este orden se dibujan las pestañas (después de «Todas»). */
export const CATEGORIAS: readonly Categoria[] = [
  { id: "plata", label: "Caja y plata", icon: Wallet },
  { id: "pedidos", label: "Pedidos y clientes", icon: ShoppingBag },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "campo", label: "Forestal y cacao", icon: Trees },
  { id: "sistema", label: "Sistema", icon: Settings2 },
];

const TIPOS_POR_CATEGORIA: Record<CategoriaId, readonly string[]> = {
  pedidos: [
    "marketplace_order",
    "marketplace_payment",
    "CARRITO_ABANDONADO",
    "CLIENTE_NUEVO",
    "CLIENTE_INACTIVO",
    "AGRADECIMIENTO",
    "CUMPLEANOS",
    "DRIVER_APPLICATION",
    "VENDOR_IDENTITY_ALERT",
  ],
  plata: [
    "FIADO_REMINDER",
    "FIADO_VENCIDO",
    "ADELANTO_VENCIDO",
    "DIFERENCIA_CAJA",
    "TURNO_SIN_CERRAR",
    "FLUJO_CAJA_CRITICO",
    "PROVEEDOR_VENCIDO",
    "CUOTA_PROXIMA",
    "VENTA_ALTA",
    "META_ALCANZADA",
    "MARGEN_NEGATIVO",
    "CREDIT_REMINDER",
    "CREDIT_SCORE_CHANGE",
    "CREDIT_WEEKLY_REPORT",
    "CREDIT_INCREASE_REQUEST",
    "arqueo",
    "cash_register_anomaly",
  ],
  inventario: ["STOCK_CRITICO", "PRECIO_BAJO", "forecast_daily", "purchase"],
  campo: [
    "CTP_PLAZO_SERFOR",
    "LOTH_PLAZO_SERFOR",
    "CACAO_BENEFICIO_ATENCION",
    "CACAO_PRECIO_OBJETIVO",
    "CACAO_STOCK_BAJO",
  ],
  sistema: [
    "camaras",
    "DOCUMENTO_VENCIMIENTO",
    "DOCUMENTO_APROBACION",
    "PLAN_LICENCIA",
    "PLAN_OBJETIVO",
    "PLAN_POLITICA",
    "asistente-aviso",
    "ia-salud",
    "whatsapp",
  ],
};

const CATEGORIA_DE_TIPO: ReadonlyMap<string, CategoriaId> = new Map(
  (Object.entries(TIPOS_POR_CATEGORIA) as [CategoriaId, readonly string[]][]).flatMap(
    ([cat, tipos]) => tipos.map((t) => [t, cat] as const),
  ),
);

/** La categoría de un `type` guardado; lo desconocido va a «Sistema». */
export function categoriaDeTipo(tipo: string): CategoriaId {
  return CATEGORIA_DE_TIPO.get(tipo) ?? "sistema";
}

export const etiquetaDeCategoria = (id: CategoriaId): string =>
  CATEGORIAS.find((c) => c.id === id)?.label ?? "Sistema";

// ── Fechas: «hace 5 min», «ayer 14:22», «jueves 08/10» (hora de Lima) ──────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const UN_DIA = 86_400_000;

function diaConNombre(clave: string): string {
  const d = new Date(`${clave}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return clave;
  return `${DIAS[d.getUTCDay()]} ${clave.slice(8, 10)}/${clave.slice(5, 7)}`;
}

const horaLima = (fecha: Date) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);

export type GrupoDelDia = "Hoy" | "Ayer" | "Esta semana" | "Antes";

/** El grupo del aviso, por día de Lima (a las 20:00 de Pucallpa el UTC ya es mañana). */
export function grupoDelDia(iso: string, ahora: number = Date.now()): GrupoDelDia {
  const clave = limaDateKey(iso);
  if (clave === limaDateKey(ahora)) return "Hoy";
  if (clave === limaDateKey(ahora - UN_DIA)) return "Ayer";
  if (clave >= limaDateKey(ahora - 6 * UN_DIA)) return "Esta semana";
  return "Antes";
}

/** Cuándo llegó, dicho corto: hoy en minutos/horas, ayer con hora, antes con el día. */
export function cuandoFue(iso: string, ahora: number = Date.now()): string {
  const fecha = new Date(iso);
  if (!Number.isFinite(fecha.getTime())) return "";
  const grupo = grupoDelDia(iso, ahora);
  if (grupo === "Hoy") {
    const min = Math.max(0, Math.floor((ahora - fecha.getTime()) / 60_000));
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    return `hace ${Math.floor(min / 60)} h`;
  }
  if (grupo === "Ayer") return `ayer ${horaLima(fecha)}`;
  return diaConNombre(limaDateKey(iso));
}

const ORDEN_GRUPOS: readonly GrupoDelDia[] = ["Hoy", "Ayer", "Esta semana", "Antes"];

/** Los avisos del más nuevo al más viejo, en grupos por día (sin grupos vacíos). */
export function agruparPorDia<T extends { createdAt: string }>(
  items: readonly T[],
  ahora: number = Date.now(),
): { grupo: GrupoDelDia; items: T[] }[] {
  const ordenados = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const porGrupo = new Map<GrupoDelDia, T[]>();
  for (const item of ordenados) {
    const g = grupoDelDia(item.createdAt, ahora);
    porGrupo.set(g, [...(porGrupo.get(g) ?? []), item]);
  }
  return ORDEN_GRUPOS.filter((g) => porGrupo.has(g)).map((g) => ({
    grupo: g,
    items: porGrupo.get(g) ?? [],
  }));
}

// ── La acción del aviso ─────────────────────────────────────────────────────

/** ¿Sale del panel (WhatsApp, otra web)? Esos se abren en otra pestaña. */
export function esEnlaceExterno(url: string): boolean {
  if (typeof window === "undefined") return /^https?:/i.test(url);
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Abre la acción del aviso. Antes era `window.location.href = actionUrl`: un
 * enlace del panel recargaba todo (y cortaba el video de las cámaras) y uno de
 * WhatsApp (`wa.me`, 128 avisos medidos) se llevaba el panel entero. Ahora lo
 * del panel va por `irAEnlace` (sin recargar) y lo de afuera, a otra pestaña.
 * Devuelve `true` si navegó dentro del panel (el modal se cierra).
 */
export function abrirAccionDeAviso(url: string): boolean {
  if (esEnlaceExterno(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
    return false;
  }
  irAEnlace(url);
  return true;
}
