/**
 * lib/agents/domains/ui.agent.ts
 *
 * Que el asistente TE LLEVE, en vez de decirte dónde queda.
 *
 * Antes el chat terminaba sus respuestas con «Acción sugerida: ir al módulo
 * inventario-almacenes» — el nombre interno de un tab, que el dueño de la
 * bodega no tiene por qué conocer, y encima había que buscarlo a mano. Ahora
 * devuelve un destino resoluble y el chat pinta un botón que abre esa pantalla
 * con su filtro puesto.
 *
 * No navega solo: devuelve la intención y el usuario decide. Una pantalla que
 * cambia sola mientras leés una respuesta es una pantalla que perdiste.
 *
 * El catálogo es CURADO, no los 133 tabs del panel: un modelo elige mejor entre
 * 20 destinos claros que entre 133, y cada entrada acá es un lugar donde
 * realmente se resuelve algo.
 */

import type { DomainAgent, AgentTask, AgentResult, AgentContext } from "@/lib/agents/types";
import { scopedLogger } from "@/lib/agents/context";

export interface DestinoAdmin {
  /** Cómo lo pide el LLM. */
  clave: string;
  /** Tab del panel (`?tab=`). */
  tab: string;
  /** Sub-vista dentro del módulo (`?vista=`), si aplica. */
  vista?: string;
  /** Cómo se lee el botón: "Abrir Kardex". */
  label: string;
  /** Para qué sirve — el LLM elige por esto. */
  para: string;
}

/**
 * Los destinos que el asistente puede abrir. Se agregan a medida que se
 * confirman: un destino que no existe manda al usuario a una pantalla en blanco,
 * que es peor que no ofrecer el botón.
 */
export const DESTINOS_ADMIN: DestinoAdmin[] = [
  { clave: "inventario",        tab: "inventario", label: "Inventario",            para: "ver stock, productos y almacenes" },
  { clave: "kardex",            tab: "inventario", vista: "kardex", label: "Kardex", para: "el historial de movimientos de un producto" },
  { clave: "conteo-fisico",     tab: "inventario", vista: "conteo", label: "Conteo físico", para: "contar el stock real y ajustar diferencias" },
  { clave: "ventas",            tab: "ventas", label: "Ventas y Caja",              para: "cobrar, ver ventas del día y el estado de la caja" },
  { clave: "pos",               tab: "ventas", vista: "pos", label: "Punto de venta", para: "registrar una venta" },
  { clave: "caja",              tab: "ventas", vista: "caja", label: "Caja",         para: "abrir, cerrar o arquear la caja" },
  { clave: "pedidos",           tab: "pedidos", label: "Pedidos",                   para: "pedidos de la tienda y del marketplace" },
  { clave: "clientes",          tab: "clientes", label: "Clientes",                 para: "buscar un cliente, su historial y su deuda" },
  { clave: "fiados",            tab: "fiados", label: "Cuentas pendientes",         para: "lo que te deben y los cobros" },
  { clave: "compras",           tab: "compras", label: "Compras",                   para: "órdenes de compra, proveedores y gastos" },
  { clave: "historial-gastos",  tab: "compras", vista: "historial-gastos", label: "Historial de gastos", para: "todo lo que se pagó, con su comprobante" },
  { clave: "sugerencias-compra", tab: "compras", vista: "sugerencias", label: "Qué reponer", para: "qué comprar según lo que se vende" },
  { clave: "plata",             tab: "plata", label: "Mi Plata",                    para: "ingresos, egresos y resultado del negocio" },
  { clave: "adelantos",         tab: "adelantos", label: "Adelantos",               para: "adelantos de sueldo y su cobranza" },
  { clave: "productos",         tab: "productos", label: "Productos",               para: "crear o editar productos y precios" },
  { clave: "promociones",       tab: "promociones", label: "Promociones y ofertas", para: "descuentos y ofertas" },
  { clave: "analytics",         tab: "analytics-pro", label: "Analytics",           para: "tendencias, márgenes y análisis del negocio" },
  { clave: "documentos",        tab: "documentos", label: "Documentos",             para: "el drive: buscar, subir y compartir archivos" },
  // ── Forestal (SERFOR) ──
  { clave: "libro-ctp",         tab: "ctp-libro-operaciones", label: "Libro de Operaciones CTP", para: "el libro forestal: ingresos, producción y despachos" },
  { clave: "ctp-existencias",   tab: "ctp-libro-operaciones", vista: "existencias", label: "Existencias del libro", para: "cuánta madera hay en el patio y en producto" },
  { clave: "ctp-ingresos",      tab: "ctp-libro-operaciones", vista: "ingresos", label: "Ingresos del CTP", para: "las guías GTF que entraron al aserradero" },
  { clave: "ctp-ficha",         tab: "ctp-libro-operaciones", vista: "ficha", label: "Ficha CTP", para: "la identidad legal ante SERFOR y los títulos habilitantes" },
  { clave: "libro-th",          tab: "loth-libro-operaciones", label: "Libro de Títulos Habilitantes", para: "el libro del monte: censo, POA y tala" },
];

const norm = (v: unknown) =>
  (typeof v === "string" ? v : "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Las palabras de un texto, sin separadores ni tildes: "libro ctp" y
 *  "libro-ctp" son lo mismo para el que pregunta. */
const palabras = (v: string) => norm(v).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * El destino que mejor matchea, o null.
 *
 * Exacto primero; después por PALABRAS compartidas, no por substring: con
 * `includes` suelto, un "p" cualquiera caía en "pos" y un destino inventado
 * abría una pantalla que no era. Se exige al menos una palabra de 4+ letras en
 * común — suficiente para "libro ctp" → libro-ctp, y no para "precios-promos".
 */
export function resolverDestino(pedido: string): DestinoAdmin | null {
  const q = norm(pedido);
  if (!q) return null;
  const exacto =
    DESTINOS_ADMIN.find((d) => d.clave === q) ??
    DESTINOS_ADMIN.find((d) => norm(d.label) === q);
  if (exacto) return exacto;

  const pedidas = palabras(pedido).filter((w) => w.length >= 4);
  if (pedidas.length === 0) return null;

  let mejor: { d: DestinoAdmin; puntos: number } | null = null;
  for (const d of DESTINOS_ADMIN) {
    const propias = new Set([...palabras(d.clave), ...palabras(d.label)]);
    const puntos = pedidas.filter((w) => propias.has(w)).length;
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { d, puntos };
  }
  return mejor?.d ?? null;
}

/** La URL del panel para ese destino — el mismo formato que usa la navegación. */
export function urlDeDestino(d: DestinoAdmin, filtro?: string): string {
  const params = new URLSearchParams({ tab: d.tab });
  if (d.vista) params.set("vista", d.vista);
  if (filtro) params.set("q", filtro);
  return `/admin?${params.toString()}#${d.tab}`;
}

async function abrir(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
  const log = scopedLogger(ctx);
  const pedido = typeof task.payload.destino === "string" ? task.payload.destino : "";
  const filtro = typeof task.payload.filtro === "string" ? task.payload.filtro.trim() : "";
  const destino = resolverDestino(pedido);

  if (!destino) {
    log.info("Destino desconocido", { pedido });
    return {
      success: false,
      // Se listan las opciones para que el LLM reintente con una válida en vez
      // de inventar una ruta que no existe.
      error: `No conozco la pantalla "${pedido}". Las que puedo abrir son: ${DESTINOS_ADMIN.map((d) => d.clave).join(", ")}.`,
    };
  }

  log.info("Destino resuelto", { clave: destino.clave, filtro });
  return {
    success: true,
    data: {
      /** El cliente lee esta clave para pintar el botón que navega. */
      navegar: {
        tab: destino.tab,
        vista: destino.vista ?? null,
        filtro: filtro || null,
        label: destino.label,
        url: urlDeDestino(destino, filtro || undefined),
      },
      mensaje: `Listo: el botón abre ${destino.label}${filtro ? ` filtrado por "${filtro}"` : ""}.`,
    },
  };
}

export const uiAgent: DomainAgent = {
  domain: "ui",
  actions: ["abrir"],
  description:
    "Abre la pantalla del panel donde se resuelve lo que el usuario necesita (devuelve el destino; el usuario confirma con un botón).",

  async execute(task: AgentTask, ctx: AgentContext): Promise<AgentResult> {
    if (task.action === "abrir") return abrir(task, ctx);
    return { success: false, error: `Acción desconocida de UI: ${task.action}` };
  },
};
