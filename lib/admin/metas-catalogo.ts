/**
 * lib/admin/metas-catalogo.ts — a qué área pertenece cada meta, en qué se mide
 * y de dónde sale su avance (ADR-488).
 *
 * UNA sola tabla para la pantalla y el servidor (sin `server-only`): el badge
 * del área, la unidad, el ⓘ «Sale de: …», el enlace «Ver en …» y las
 * plantillas salen de acá. Los ids son los valores del CHECK
 * `AdminGoal_category_chk` (`prisma/migrations/adr-488-metas-por-area.sql`) y
 * de `CATEGORIAS_META`: una categoría nueva cambia los tres lados, y el
 * `Record<CategoriaMeta, …>` de abajo no compila si falta una.
 *
 * Colores: tokens del tema (`--data-*`, `--brand-*`), definidos en claro y en
 * oscuro; nunca hex. Son decorativos (distinguen un área de otra), no de estado.
 */
import {
  Factory,
  ListChecks,
  PencilLine,
  ShoppingCart,
  Store,
  TreePine,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { hrefDeDestino, type DestinoPanel } from "./enlaces-panel";
import type { CategoriaMeta, PeriodoMeta } from "./metas-tareas";
import type { EstadoMeta, SentidoMeta } from "./metas-periodo";

export type AreaMeta = "ventas" | "clientes" | "caja" | "compras" | "marketplace" | "forestal" | "bosque" | "equipo" | "manual";

export interface AreaDef {
  id: AreaMeta;
  nombre: string;
  icono: LucideIcon;
  /** `var(--…)` listo para `style={{ color }}` o `color-mix(...)`. */
  color: string;
}

/** En el orden en que se muestran los grupos de la pantalla. */
export const AREAS_META: readonly AreaDef[] = [
  { id: "ventas", nombre: "Ventas", icono: ShoppingCart, color: "var(--data-6)" },
  { id: "clientes", nombre: "Clientes", icono: Users, color: "var(--data-8)" },
  { id: "caja", nombre: "Caja y cobranza", icono: Wallet, color: "var(--data-5)" },
  { id: "compras", nombre: "Compras y gastos", icono: Truck, color: "var(--data-7)" },
  { id: "marketplace", nombre: "Marketplace", icono: Store, color: "var(--data-warning)" },
  { id: "forestal", nombre: "Aserradero (CTP)", icono: Factory, color: "var(--data-success)" },
  { id: "bosque", nombre: "Bosque (LO-TH)", icono: TreePine, color: "var(--data-info)" },
  { id: "equipo", nombre: "Equipo", icono: ListChecks, color: "var(--data-3)" },
  { id: "manual", nombre: "A mano", icono: PencilLine, color: "var(--data-2)" },
];

const AREA_POR_ID = new Map(AREAS_META.map((a) => [a.id, a]));

export interface CategoriaDef {
  id: CategoriaMeta;
  area: AreaMeta;
  /** Cómo se llama lo que se mide («Compras recibidas»). */
  nombre: string;
  /** Unidades permitidas; la primera es la de siempre. Vacío = libre (sólo `manual`). */
  unidades: readonly string[];
  /** «sube» = llegar al objetivo; «baja» = no pasarse del tope (gastos). */
  sentido: SentidoMeta;
  /** Una línea, en tuteo: qué cuenta el avance. */
  queMide: string;
  /** El módulo del que sale el dato, como lo lee el dueño («Plata › Gastos»). */
  fuente: string;
  /** A dónde lleva «Ver en …». `null` = no tiene módulo de origen. */
  destino: DestinoPanel | null;
  /** La meta que se propone con un clic. `name` es también el texto del chip. */
  plantilla: { period: PeriodoMeta; target: number; name: string };
}

const CTP = "ctp-libro-operaciones";
const LOTH = "loth-libro-operaciones";
const a = (tab: string, params: Record<string, string> = {}): DestinoPanel => ({ tab, params });
const M3_PT = ["m³", "PT"] as const;

export const CATALOGO_METAS: Readonly<Record<CategoriaMeta, CategoriaDef>> = {
  // ── Ventas ────────────────────────────────────────────────────────────────
  ventas: {
    id: "ventas", area: "ventas", nombre: "Ventas cobradas", unidades: ["S/"], sentido: "sube",
    queMide: "Lo que cobraste en caja más los pedidos que entraron.",
    fuente: "Caja (ventas) y Pedidos", destino: a("ventas-caja"),
    plantilla: { period: "mensual", target: 30000, name: "Vender S/ 30 000 al mes" },
  },
  ticket_promedio: {
    id: "ticket_promedio", area: "ventas", nombre: "Ticket promedio", unidades: ["S/"], sentido: "sube",
    queMide: "Lo que deja cada venta o pedido, en promedio.",
    fuente: "Caja (ventas) y Pedidos", destino: a("ventas-caja"),
    plantilla: { period: "mensual", target: 25, name: "Ticket promedio de S/ 25" },
  },
  pedidos: {
    id: "pedidos", area: "ventas", nombre: "Ventas y pedidos", unidades: ["ventas"], sentido: "sube",
    queMide: "Cuántas ventas de caja y pedidos hiciste.",
    fuente: "Caja (ventas) y Pedidos", destino: a("pedidos"),
    plantilla: { period: "semanal", target: 80, name: "80 ventas a la semana" },
  },
  productos: {
    id: "productos", area: "ventas", nombre: "Unidades vendidas", unidades: ["unid."], sentido: "sube",
    queMide: "Cuántas unidades salieron entre ventas y pedidos.",
    fuente: "Caja (ventas) y Pedidos, por producto", destino: a("productos"),
    plantilla: { period: "mensual", target: 500, name: "500 unidades al mes" },
  },
  // ── Clientes ──────────────────────────────────────────────────────────────
  clientes: {
    id: "clientes", area: "clientes", nombre: "Clientes nuevos", unidades: ["clientes"], sentido: "sube",
    queMide: "Clientes que registraste por primera vez.",
    fuente: "Clientes", destino: a("clientes"),
    plantilla: { period: "mensual", target: 20, name: "20 clientes nuevos al mes" },
  },
  retencion: {
    id: "retencion", area: "clientes", nombre: "Clientes que volvieron", unidades: ["%"], sentido: "sube",
    queMide: "De los clientes que compraron, cuántos de cada 100 compraron dos veces o más.",
    fuente: "Caja (ventas con cliente)", destino: a("clientes"),
    plantilla: { period: "mensual", target: 40, name: "40 % de clientes que vuelven" },
  },
  // ── Caja y cobranza ───────────────────────────────────────────────────────
  caja: {
    id: "caja", area: "caja", nombre: "Cierres de caja cuadrados", unidades: ["cierres"], sentido: "sube",
    queMide: "Turnos que cerraste contando la plata y cuadraron (los cierres automáticos no cuentan).",
    fuente: "Ventas y Caja › Turnos", destino: a("ventas-caja", { vista: "turnos" }),
    plantilla: { period: "mensual", target: 25, name: "25 cierres cuadrados al mes" },
  },
  fiados_cobrados: {
    id: "fiados_cobrados", area: "caja", nombre: "Fiados cobrados", unidades: ["S/"], sentido: "sube",
    queMide: "Lo que te pagaron de fiados.",
    fuente: "Plata › Fiados", destino: a("plata", { vista: "fiados" }),
    plantilla: { period: "mensual", target: 2000, name: "Cobrar S/ 2000 de fiados al mes" },
  },
  // ── Compras y gastos ──────────────────────────────────────────────────────
  compras: {
    id: "compras", area: "compras", nombre: "Compras recibidas", unidades: ["S/"], sentido: "sube",
    queMide: "Lo que recibiste de tus proveedores (órdenes recibidas o en parte).",
    fuente: "Compras", destino: a("compras"),
    plantilla: { period: "mensual", target: 10000, name: "Comprar S/ 10 000 al mes" },
  },
  gastos: {
    id: "gastos", area: "compras", nombre: "Tope de gastos", unidades: ["S/"], sentido: "baja",
    queMide: "Lo que gastaste. La meta es no pasarte del tope.",
    fuente: "Plata › Gastos", destino: a("plata", { vista: "gastos" }),
    plantilla: { period: "mensual", target: 5000, name: "No gastar más de S/ 5000 al mes" },
  },
  // ── Marketplace ───────────────────────────────────────────────────────────
  marketplace_ventas: {
    id: "marketplace_ventas", area: "marketplace", nombre: "Ventas del marketplace", unidades: ["S/"], sentido: "sube",
    queMide: "Lo que entró por pedidos de tu tienda en el marketplace.",
    fuente: "Marketplace (pedidos)", destino: a("marketplace"),
    plantilla: { period: "mensual", target: 5000, name: "Vender S/ 5000 en el marketplace al mes" },
  },
  marketplace_pedidos: {
    id: "marketplace_pedidos", area: "marketplace", nombre: "Pedidos del marketplace", unidades: ["pedidos"], sentido: "sube",
    queMide: "Cuántos pedidos te llegaron por el marketplace.",
    fuente: "Marketplace (pedidos)", destino: a("marketplace"),
    plantilla: { period: "mensual", target: 20, name: "20 pedidos del marketplace al mes" },
  },
  // ── Aserradero (Libro CTP y cubicación) ───────────────────────────────────
  madera_ingresada: {
    id: "madera_ingresada", area: "forestal", nombre: "Madera que entró", unidades: ["m³"], sentido: "sube",
    queMide: "Madera rolliza que entró al aserradero con su guía.",
    fuente: "Libro CTP › Ingresos", destino: a(CTP, { vista: "gtf-ingresadas" }),
    plantilla: { period: "mensual", target: 100, name: "Ingresar 100 m³ al mes" },
  },
  produccion: {
    id: "produccion", area: "forestal", nombre: "Madera aserrada producida", unidades: M3_PT, sentido: "sube",
    queMide: "Lo que salió aserrado de las corridas.",
    fuente: "Libro CTP › Producción", destino: a(CTP, { vista: "produccion" }),
    plantilla: { period: "mensual", target: 50, name: "Producir 50 m³ al mes" },
  },
  despacho: {
    id: "despacho", area: "forestal", nombre: "Madera despachada", unidades: M3_PT, sentido: "sube",
    queMide: "Lo que salió del aserradero con su guía de despacho.",
    fuente: "Libro CTP › Despacho", destino: a(CTP, { vista: "despacho" }),
    plantilla: { period: "mensual", target: 50, name: "Despachar 50 m³ al mes" },
  },
  venta_madera: {
    id: "venta_madera", area: "forestal", nombre: "Venta de madera despachada", unidades: ["S/"], sentido: "sube",
    queMide: "Lo que vendiste en los despachos que tienen precio.",
    fuente: "Libro CTP › Despacho", destino: a(CTP, { vista: "despacho" }),
    plantilla: { period: "mensual", target: 20000, name: "Vender S/ 20 000 de madera al mes" },
  },
  // Herramientas abre en «Cubicador de madera»: todavía no lee `?vista=` para ir directo a trozas.
  cubicacion: {
    id: "cubicacion", area: "forestal", nombre: "Lotes cubicados", unidades: M3_PT, sentido: "sube",
    queMide: "Volumen de los lotes de trozas que aplicaste.",
    fuente: "Herramientas › Cubicador de trozas", destino: a("forestal-herramientas"),
    plantilla: { period: "mensual", target: 50, name: "Cubicar 50 m³ al mes" },
  },
  cubicador: {
    id: "cubicador", area: "forestal", nombre: "Madera aserrada cubicada", unidades: M3_PT, sentido: "sube",
    queMide: "Volumen de las cubicaciones de madera aserrada que guardaste.",
    fuente: "Herramientas › Cubicador de madera", destino: a("forestal-herramientas"),
    plantilla: { period: "mensual", target: 50, name: "Cubicar 50 m³ de aserrada al mes" },
  },
  // ── Bosque (Libro TH) ─────────────────────────────────────────────────────
  loth_tala: {
    id: "loth_tala", area: "bosque", nombre: "Tala registrada", unidades: ["m³"], sentido: "sube",
    queMide: "Volumen de los árboles talados que anotaste en el Libro TH.",
    fuente: "Libro TH › Secciones", destino: a(LOTH, { vista: "secciones" }),
    plantilla: { period: "anual", target: 500, name: "Registrar 500 m³ de tala al año" },
  },
  loth_trozado: {
    id: "loth_trozado", area: "bosque", nombre: "Trozado registrado", unidades: ["m³"], sentido: "sube",
    queMide: "Volumen de las trozas que anotaste en el Libro TH.",
    fuente: "Libro TH › Secciones", destino: a(LOTH, { vista: "secciones" }),
    plantilla: { period: "anual", target: 500, name: "Registrar 500 m³ de trozado al año" },
  },
  // ── Equipo y a mano ───────────────────────────────────────────────────────
  tareas: {
    id: "tareas", area: "equipo", nombre: "Tareas terminadas", unidades: ["tareas"], sentido: "sube",
    queMide: "Tareas del equipo que se marcaron como completadas.",
    fuente: "Equipo › Tareas", destino: a("tareas"),
    plantilla: { period: "semanal", target: 10, name: "Terminar 10 tareas a la semana" },
  },
  manual: {
    id: "manual", area: "manual", nombre: "Meta a mano", unidades: [], sentido: "sube",
    queMide: "Lo que tú anotes: el avance lo escribes tú.",
    fuente: "Lo escribes tú", destino: null,
    plantilla: { period: "mensual", target: 10, name: "Meta a mano" },
  },
};

/** La definición de una categoría, o `null` si el texto no es una (dato viejo o ajeno). */
export function categoriaDe(id: string): CategoriaDef | null {
  return Object.hasOwn(CATALOGO_METAS, id) ? CATALOGO_METAS[id as CategoriaMeta] : null;
}

/** El área de una categoría; una desconocida cae en «A mano». */
export function areaDe(category: string): AreaDef {
  return AREA_POR_ID.get(categoriaDe(category)?.area ?? "manual") ?? AREAS_META[AREAS_META.length - 1]!;
}

/** Las categorías de un área, en el orden del catálogo. */
export function categoriasDelArea(area: AreaMeta): CategoriaDef[] {
  return Object.values(CATALOGO_METAS).filter((c) => c.area === area);
}

/** `/admin?tab=…` del módulo de donde sale el avance, o `null` (meta a mano). */
export function hrefDeMeta(category: string): string | null {
  const destino = categoriaDe(category)?.destino;
  return destino ? hrefDeDestino(destino) : null;
}

/** ¿Esa unidad va con la categoría? En `manual` cualquiera; en las demás, una de su lista. */
export function unidadPermitida(category: CategoriaMeta, unit: string): boolean {
  const { unidades } = CATALOGO_METAS[category];
  return unidades.length === 0 || unidades.includes(unit.trim());
}

/**
 * La unidad que se guarda: la que llega si el catálogo la permite; si no, la de
 * siempre de esa categoría. En `manual` es libre (vacía → «unid.»).
 */
export function normalizarUnidad(category: CategoriaMeta, unit?: string | null): string {
  const limpia = unit?.trim() ?? "";
  const { unidades } = CATALOGO_METAS[category];
  if (unidades.length === 0) return limpia || "unid.";
  return unidades.includes(limpia) ? limpia : unidades[0]!;
}

// ── Lo que devuelve GET /api/goals/avance ───────────────────────────────────

export interface AvanceMetaDTO {
  /** id de la meta (`AdminGoal.id`). */
  id: string;
  desde: string;
  hasta: string;
  etiqueta: string;
  /** Lo que lleva en la ventana, en la unidad de la meta. `null` = no se pudo medir. */
  avance: number | null;
  /** La marca del ritmo (`ritmoEsperado`); `null` en metas de un día. */
  esperado: number | null;
  pct: number | null;
  estado: EstadoMeta;
  /** El dato está incompleto y por qué («2 despachos sin precio»). */
  parcial?: string;
  /** Una línea extra para el ⓘ («12 ventas y 3 pedidos»). */
  detalle?: string;
}

export interface RespuestaAvance {
  /** El día de Lima con que se midió. */
  hoy: string;
  avances: AvanceMetaDTO[];
}
