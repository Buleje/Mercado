/**
 * Comandos del buscador del panel (⌘K, M04 de la noche 17-10).
 *
 * Hasta hoy el buscador sólo navegaba: «nueva venta» llevaba a Ventas & Caja y
 * ahí había que encontrar el POS. Un comando lleva al LUGAR EXACTO con los
 * parámetros que esa pantalla ya lee (`?vista=`, `?sub=`, `?cerrar=1`, `?q=`):
 * ninguno inventa una pantalla nueva.
 *
 * Cada comando dice tres cosas (pedido del PDF): la acción («Cobrar una
 * deuda»), la entidad sobre la que actúa («Fiado») y el destino («Ventas &
 * Caja › Me deben › Quién me debe»). Y respeta el permiso: sólo se ofrece si la
 * pestaña Y la vista pasan las mismas capas que la barra (plan, plantilla,
 * rubro, rol), con `comandoPermitido`.
 *
 * Puro (sin React): el buscador pone los íconos y el permiso del contexto.
 */

import type { Tab } from "@/app/admin/_lib/tabs.types";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import {
  origenesDeVista,
  pestanaPermitida,
  vistaPermitida,
  type ContextoPermiso,
} from "@/lib/admin/permiso-vista";
import { ANIDADAS_POR_MODULO, vistasDelModulo } from "@/lib/admin/subvistas-modulos";

/** Ícono de cada comando (el buscador lo traduce a un componente). */
export type IconoComando =
  | "venta"
  | "cobro"
  | "comprobante"
  | "cotizacion"
  | "caja"
  | "abrir-caja"
  | "turno"
  | "compra"
  | "orden"
  | "recepcion"
  | "pago"
  | "reponer"
  | "gasto"
  | "perdida"
  | "producto"
  | "conteo"
  | "oferta"
  | "cliente"
  | "pedido"
  | "respaldo";

export interface ComandoPanel {
  id: string;
  /** Lo que se hace: «Nueva venta», «Cobrar una deuda». */
  accion: string;
  /** Sobre qué actúa, en una palabra: «Venta», «Fiado». */
  entidad: string;
  tab: Tab;
  vista?: string;
  sub?: string;
  /** Parámetros extra que la pantalla destino ya lee al montar (`cerrar=1`). */
  params?: Readonly<Record<string, string>>;
  /** Evento que la pantalla escucha si YA estaba montada (no relee la URL). */
  evento?: string;
  /** Con qué otras palabras se busca (minúsculas, sin tildes). */
  palabras: readonly string[];
  icono: IconoComando;
}

/**
 * El catálogo. El orden es el de la lista cuando empatan: lo que más se hace
 * en una bodega primero. Cada destino existe en `subvistas-modulos.ts` (lo
 * vigila `__tests__/comandos-panel.test.ts`).
 */
export const COMANDOS_PANEL: readonly ComandoPanel[] = [
  { id: "nueva-venta", accion: "Nueva venta", entidad: "Venta", tab: "ventas-caja", vista: "pos", icono: "venta",
    palabras: ["vender", "venta", "pos", "punto de venta", "nuevo pedido", "nueva orden", "cobrar venta"] },
  { id: "cobrar-deuda", accion: "Cobrar una deuda", entidad: "Fiado", tab: "ventas-caja", vista: "cuentas-cobrar", sub: "cobranza", icono: "cobro",
    palabras: ["cobrar", "cobro", "cobranza", "deuda", "fiado", "me deben", "debe"] },
  { id: "emitir-comprobante", accion: "Emitir boleta o factura", entidad: "Comprobante", tab: "facturacion", vista: "facturas", icono: "comprobante",
    palabras: ["emitir", "boleta", "factura", "comprobante", "sunat", "electronica"] },
  { id: "nueva-cotizacion", accion: "Nueva cotización", entidad: "Cotización", tab: "facturacion", vista: "cotizaciones", sub: "nueva", icono: "cotizacion",
    palabras: ["cotizar", "cotizacion", "presupuesto", "proforma"] },
  { id: "cuadrar-caja", accion: "Cuadrar la caja", entidad: "Caja", tab: "ventas-caja", vista: "caja-registradora", sub: "cuadrar", icono: "caja",
    palabras: ["cuadrar", "cuadre", "arqueo", "contar caja", "caja"] },
  { id: "abrir-caja", accion: "Abrir la caja", entidad: "Caja", tab: "ventas-caja", vista: "caja-registradora", sub: "hoy", icono: "abrir-caja",
    palabras: ["abrir", "apertura", "caja de hoy", "caja", "efectivo"] },
  { id: "cerrar-turno", accion: "Cerrar el turno", entidad: "Turno", tab: "ventas-caja", vista: "turnos", params: { cerrar: "1" },
    evento: "buleje:cerrar-turno", icono: "turno",
    palabras: ["cerrar", "cierre", "turno", "cerrar caja", "fin del turno"] },
  { id: "nueva-compra", accion: "Nueva compra", entidad: "Compra", tab: "compras", vista: "punto-compra", icono: "compra",
    palabras: ["comprar", "compra", "canasta", "proveedor", "factura del proveedor"] },
  { id: "nueva-orden-compra", accion: "Nueva orden de compra", entidad: "Orden de compra", tab: "compras", vista: "ordenes-compra", sub: "ordenes", icono: "orden",
    palabras: ["orden de compra", "oc", "pedir al proveedor", "pedido al proveedor"] },
  { id: "recibir-mercaderia", accion: "Recibir mercadería", entidad: "Recepción", tab: "compras", vista: "ordenes-compra", sub: "recibir", icono: "recepcion",
    palabras: ["recibir", "recepcion", "llego", "llegada", "mercaderia", "ingreso"] },
  { id: "pagar-proveedor", accion: "Pagar a un proveedor", entidad: "Pago", tab: "compras", vista: "cuentas-por-pagar", icono: "pago",
    palabras: ["pagar", "pago", "debo", "proveedor", "por pagar", "cuentas por pagar"] },
  { id: "que-reponer", accion: "Ver qué reponer", entidad: "Producto", tab: "compras", vista: "sugerencias", icono: "reponer",
    palabras: ["reponer", "reposicion", "falta", "se acaba", "sugerencias", "pedir"] },
  { id: "registrar-gasto", accion: "Registrar un gasto", entidad: "Gasto", tab: "plata", vista: "gastos", sub: "anotados", icono: "gasto",
    palabras: ["gasto", "gastos", "anotar gasto", "egreso", "pague", "registrar"] },
  { id: "registrar-perdida", accion: "Registrar una pérdida", entidad: "Pérdida", tab: "inventario", vista: "kardex", sub: "perdidas", icono: "perdida",
    palabras: ["perdida", "merma", "vencido", "roto", "robo", "registrar"] },
  { id: "nuevo-producto", accion: "Nuevo producto", entidad: "Producto", tab: "inventario", vista: "stock", icono: "producto",
    palabras: ["producto", "crear producto", "agregar producto", "articulo", "stock"] },
  { id: "contar-stock", accion: "Contar el stock", entidad: "Conteo", tab: "inventario", vista: "conteo", icono: "conteo",
    palabras: ["contar", "conteo", "inventario fisico", "anaquel"] },
  { id: "nueva-oferta", accion: "Nueva oferta", entidad: "Oferta", tab: "inventario", vista: "ofertas", sub: "ofertas", icono: "oferta",
    palabras: ["oferta", "descuento", "promocion", "promo"] },
  { id: "nuevo-cupon", accion: "Nuevo cupón", entidad: "Cupón", tab: "inventario", vista: "ofertas", sub: "cupones", icono: "oferta",
    palabras: ["cupon", "codigo de descuento", "descuento"] },
  { id: "nuevo-cliente", accion: "Nuevo cliente", entidad: "Cliente", tab: "clientes", vista: "crm", params: { nuevo: "1" }, icono: "cliente",
    palabras: ["cliente", "agregar cliente", "crear cliente", "contacto"] },
  { id: "atender-pedidos", accion: "Atender los pedidos", entidad: "Pedido", tab: "pedidos", vista: "tablero", icono: "pedido",
    palabras: ["pedidos", "delivery", "despachar", "preparar", "enviar"] },
  { id: "hacer-respaldo", accion: "Hacer un respaldo", entidad: "Respaldo", tab: "auditoria", icono: "respaldo",
    palabras: ["backup", "respaldo", "copia de seguridad"] },
];

/** «Análisis» → «analisis». */
export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Palabras que no deciden nada al buscar un comando. */
const RELLENO = new Set(["a", "al", "la", "el", "lo", "los", "las", "de", "del", "un", "una", "uno", "le", "y", "para", "mi", "mis", "que"]);

/** Verbos con que empieza una búsqueda que pide HACER algo: las acciones van primero. */
const VERBOS = new Set([
  "vender", "venta", "cobrar", "cobrarle", "emitir", "nueva", "nuevo", "registrar", "anotar", "recibir",
  "cuadrar", "cerrar", "abrir", "pagar", "pagarle", "contar", "reponer", "crear", "agregar", "hacer", "cotizar",
]);

/** ¿La búsqueda empieza con un verbo de acción? («cobrar a Juan», «nueva cotización»). */
export function esConsultaDeAccion(q: string): boolean {
  const primera = normalizar(q).split(/\s+/)[0] ?? "";
  return VERBOS.has(primera);
}

/**
 * «cobrar a Juan» / «cobrarle a Juan» / «pagar al Molino»: el comando y a quién.
 * `null` si la búsqueda no nombra a nadie. El nombre conserva lo que se
 * escribió (tildes y mayúsculas) porque viaja como `?q=` a la pantalla.
 */
export function comandoConPersona(q: string): { comando: ComandoPanel; persona: string } | null {
  /* El verbo con «le» («cobrarle Juan») o con «a / al / a la» («cobrar a Juan»):
     «cobrar deuda» o «cobrar alberto» no nombran a nadie con certeza. */
  const m = q.trim().match(/^(cobrar|pagar)(le)?\s+(a\s+la\s+|al\s+|a\s+)?(.+)$/i);
  if (!m || (!m[2] && !m[3])) return null;
  const persona = m[4].trim();
  if (persona.length < 2) return null;
  const id = normalizar(m[1]) === "cobrar" ? "cobrar-deuda" : "pagar-proveedor";
  const comando = COMANDOS_PANEL.find((c) => c.id === id);
  if (!comando) return null;
  /* «cobrarle una deuda», «pagar al proveedor»: el resto es relleno o una
     palabra del propio comando, no una persona. */
  const primera = normalizar(persona).split(/\s+/)[0] ?? "";
  if (RELLENO.has(primera) || comando.palabras.some((p) => p.startsWith(primera))) return null;
  return { comando, persona };
}

/** Lo que el buscador manda a `/api/search`: el nombre de «cobrar a Juan» o la búsqueda entera. */
export function consultaRemota(q: string): string {
  return comandoConPersona(q)?.persona ?? q.trim();
}

function palabrasDe(t: string): string[] {
  return normalizar(t).split(/[^a-z0-9ñ]+/).filter(Boolean);
}

/** Puntaje de un comando para la búsqueda: 0 = no coincide. */
function puntaje(c: ComandoPanel, q: string): number {
  const consulta = palabrasDe(q).filter((p) => !RELLENO.has(p));
  if (consulta.length === 0) return 0;
  const deLaAccion = palabrasDe(c.accion);
  const todas = [...deLaAccion, ...palabrasDe(c.entidad), ...c.palabras.flatMap(palabrasDe)];
  const cada = (lista: string[]) => consulta.every((p) => lista.some((w) => w.startsWith(p)));
  if (!cada(todas)) return 0;
  if (normalizar(c.accion).startsWith(normalizar(q))) return 3;
  return cada(deLaAccion) ? 2 : 1;
}

/** Los comandos que coinciden, mejor puntaje primero (empate: el orden del catálogo). */
export function buscarComandos(
  q: string,
  permitido: (c: ComandoPanel) => boolean,
  tope = 6,
): ComandoPanel[] {
  return COMANDOS_PANEL.map((c, i) => ({ c, i, p: puntaje(c, q) }))
    .filter((x) => x.p > 0 && permitido(x.c))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, tope)
    .map((x) => x.c);
}

/**
 * ¿Lo ve este rol? La pestaña como en la barra y, si el comando abre una
 * vista (o una sección de adentro), esa vista por su origen. Sin contexto
 * (rol sin confirmar) no pasa ninguno: nada que dependa del rol se ofrece
 * antes de saberlo.
 */
export function comandoPermitido(ctx: ContextoPermiso | null, c: ComandoPanel): boolean {
  return ctx !== null && destinoPermitido(ctx, c.tab, c.vista, c.sub);
}

/** La misma regla para cualquier destino del buscador (módulo, vista, sección). */
export function destinoPermitido(ctx: ContextoPermiso, tab: string, vista?: string, sub?: string): boolean {
  if (!pestanaPermitida(ctx, tab)) return false;
  if (!vista) return true;
  const def = vistasDelModulo(tab).find((v) => v.key === vista);
  if (def && !vistaPermitida(ctx, origenesDeVista(tab, def))) return false;
  if (sub) {
    const anidada = ANIDADAS_POR_MODULO[tab]?.find((a) => a.vista === vista && a.key === sub);
    if (anidada?.origen?.length && !vistaPermitida(ctx, anidada.origen)) return false;
  }
  return true;
}

/** «Ventas & Caja › Me deben › Quién me debe». `etiquetaTab` = el rótulo de la barra. */
export function destinoDeComando(c: ComandoPanel, etiquetaTab: (tab: string) => string | null): string {
  const partes = [etiquetaTab(c.tab) ?? c.tab];
  if (c.vista) {
    const vista = vistasDelModulo(c.tab).find((v) => v.key === c.vista);
    if (vista) partes.push(vista.label);
  }
  if (c.sub && c.vista) {
    const anidada = ANIDADAS_POR_MODULO[c.tab]?.find((a) => a.vista === c.vista && a.key === c.sub);
    if (anidada) partes.push(anidada.label);
  }
  return partes.join(" › ");
}

/** Ruta del panel del comando. `persona` viaja como `?q=` (la pantalla filtra por ese nombre). */
export function hrefDeComando(c: ComandoPanel, persona?: string): string {
  const params: Record<string, string> = { ...(c.params ?? {}) };
  if (c.vista) params.vista = c.vista;
  if (c.sub) params.sub = c.sub;
  if (persona) params.q = persona;
  return hrefDeDestino({ tab: c.tab, params });
}
