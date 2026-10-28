/**
 * Lo que el buscador del panel (⌘K) trae del SERVIDOR (`GET /api/search`):
 * qué grupos ve cada rol y cómo se arma cada fila. Puro (sin Prisma, React ni
 * fetch): lo usan la ruta, el buscador y los tests.
 *
 * Hasta el 28-10 el servidor sólo buscaba productos, clientes, pedidos y
 * proveedores —leyendo TODOS los del negocio en memoria en cada tecla— y nada
 * del aserradero ni del personal: en Blas encontraba 12 registros y no sus 13
 * trabajadores, 71 trozas, 7 permisos, 8 lotes ni las guías. Ahora cada grupo
 * filtra y limita en la base (`lib/db/buscador-panel.db.ts`).
 *
 * SEGURIDAD (24-10, memoria `permisos-matriz-vs-ruta`): cada grupo usa los
 * roles de la RUTA de donde salen sus datos, no la matriz `checkPermission`
 * (más amplia). La gestión (admin, owner, manager) pasa siempre, como en
 * `requireAdmin`. Ninguna fila lleva plata del personal (sueldo, tarifa, lo
 * ganado) ni el documento de un trabajador.
 */

import type { AdminRole } from "@/lib/session";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { RRHH_MARCAR, nivelDeRol } from "@/lib/rrhh/roles";
import { hrefDe, hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { formatCurrency, formatDateNumeric, formatNumber } from "@/lib/format";
import type { AnexoEmitido } from "@/lib/forestal/anexo04-registro";

// ── Grupos, tipos y roles ─────────────────────────────────────────────────────

export type TipoRemoto =
  | "producto" | "cliente" | "pedido" | "proveedor"
  | "guia" | "anexo" | "troza" | "permiso" | "lote" | "parte" | "trabajador";

export type GrupoRemoto =
  | "productos" | "clientes" | "pedidos" | "proveedores"
  | "guias" | "anexos" | "trozas" | "permisos" | "lotes" | "partes" | "trabajadores";

export const GRUPO_DEL_TIPO: Readonly<Record<TipoRemoto, GrupoRemoto>> = {
  producto: "productos", cliente: "clientes", pedido: "pedidos", proveedor: "proveedores",
  guia: "guias", anexo: "anexos", troza: "trozas", permiso: "permisos", lote: "lotes", parte: "partes", trabajador: "trabajadores",
};

/** Cuántas filas por grupo. */
export const LIMITE_POR_GRUPO = 5;
/** Cuántas se piden a la base: sobra para ordenar por parecido y quedarse con 5. */
export const LIMITE_PEDIDO = 10;

/** Espejo de `managementTier` en `lib/require-admin.ts`. */
const GESTION: readonly AdminRole[] = ["admin", "owner", "manager"];

/**
 * Quien abre el panel y busca. `/api/orders` (GET) no recorta roles y el
 * catálogo de productos es público: pedidos y productos los ve cualquiera de
 * estos. Repartidor y proveedor no usan el panel (tienen el suyo).
 */
export const ROLES_BUSCADOR: readonly AdminRole[] = ["admin", "owner", "manager", "cajero", "almacenero", "analista", "tienda_owner"];

/**
 * El GET de las rutas del aserradero: `app/api/admin/forestal/{trozas,
 * contratos,directorio,anexos,gtf,wood-entries,lotes-aserrio}`. El test
 * `__tests__/api/search-buscador.test.ts` lee esas rutas y falla si se despegan.
 */
export const ROLES_FORESTAL_LECTURA: readonly AdminRole[] = ["admin", "almacenero", "owner"];

/** `/api/suppliers` (GET). */
const ROLES_PROVEEDORES: readonly AdminRole[] = ["admin", "almacenero"];

export const ROLES_DEL_GRUPO: Readonly<Record<GrupoRemoto, readonly AdminRole[]>> = {
  productos: ROLES_BUSCADOR,
  pedidos: ROLES_BUSCADOR,
  clientes: RUTAS_PANEL["/api/customers"],
  proveedores: ROLES_PROVEEDORES,
  guias: ROLES_FORESTAL_LECTURA,
  anexos: ROLES_FORESTAL_LECTURA,
  trozas: ROLES_FORESTAL_LECTURA,
  permisos: ROLES_FORESTAL_LECTURA,
  lotes: ROLES_FORESTAL_LECTURA,
  partes: ROLES_FORESTAL_LECTURA,
  /* `/api/rrhh/colaboradores`: el nivel `marcar` (almacenero, cajero) sólo nombre, puesto y estado. */
  trabajadores: RRHH_MARCAR,
};

export function veGrupo(role: AdminRole, grupo: GrupoRemoto): boolean {
  return GESTION.includes(role) || ROLES_DEL_GRUPO[grupo].includes(role);
}

/** Los grupos del aserradero (además del rol, piden el Libro CTP o el LO-TH encendido). */
export const GRUPOS_FORESTALES: readonly GrupoRemoto[] = ["guias", "anexos", "trozas", "permisos", "lotes", "partes"];

// ── La consulta ───────────────────────────────────────────────────────────────

/** Lo escrito, sin espacios de más y con tope (nadie busca 80 letras). */
export function normalizarConsulta(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Las formas de un N° de guía que se buscan: lo escrito y su primer tramo con
 * y sin ceros a la izquierda («019-001-0000071» ⇄ «19-001-0000071»). Sólo el
 * primer tramo antes de un guion: «0000071» sin ceros sería «71», que está en
 * media lista.
 */
export function variantesDeNumero(q: string): string[] {
  const sinCeros = q.replace(/^0+(?=\d+-)/, "");
  /* Y al revés: Blas anota sus ingresos «019-001-…» y la guía dice «19-001-…». */
  const conCeros = sinCeros.replace(/^\d{1,2}(?=-)/, (d) => d.padStart(3, "0"));
  return [...new Set([q, sinCeros, conCeros])];
}

/** Sin mayúsculas ni tildes. */
function plano(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** 3 = igual · 2 = empieza o termina con lo escrito · 1 = lo contiene · 0 = no. */
export function nivelDeCoincidencia(valor: string | null | undefined, q: string): number {
  if (!valor) return 0;
  const v = plano(valor);
  return Math.max(...variantesDeNumero(plano(q)).map((p) => (v === p ? 3 : v.startsWith(p) || v.endsWith(p) ? 2 : v.includes(p) ? 1 : 0)));
}

/** Las filas que más se parecen primero (estable: a igual parecido, el orden de la base). */
export function porParecido<T>(filas: readonly T[], q: string, claves: (f: T) => (string | null | undefined)[]): T[] {
  return filas
    .map((f, i) => ({ f, i, n: Math.max(0, ...claves(f).map((c) => nivelDeCoincidencia(c, q))) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ f }) => f);
}

// ── Lo que devuelve la base ───────────────────────────────────────────────────

export interface ProductoFila { id: number; name: string; category: string; price: number; stock: number | null; stockBajo: boolean }
export interface ClienteFila { phone: string; name: string; location: string }
export interface PedidoFila { id: string; customerName: string; total: number; createdAt: Date; status: string }
export interface ProveedorFila { id: string; name: string; phone: string | null; ruc: string | null }
export interface GuiaFila {
  id: string;
  /** ingreso = llegó al CTP (WoodEntry) · loth = emitida en el LO-TH · salida = despacho del Libro CTP. */
  origen: "ingreso" | "loth" | "salida";
  gtfNumber: string;
  quien: string | null;
  fecha: Date | null;
  volumenM3: number | null;
  anulada: boolean;
  /** El permiso con que entró (sólo los ingresos lo guardan). */
  contratoId?: string | null;
}
export interface TrozaFila {
  id: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  especie: string | null;
  gtfNumber: string | null;
  loteCodigo: string | null;
  estado: "patio" | "lote" | "consumida" | "despachada";
}
export interface PermisoFila { id: string; codigo: string; alias: string | null; titularNombre: string; tipo: string | null; vigenciaHasta: Date | null; estado: string }
export interface LoteFila { id: string; code: string; especie: string; status: string; permiso: string | null; fechaApertura: Date }
export interface ParteFila { id: string; nombre: string; roles: string[]; docTipo: string | null; docNumero: string | null }
export interface TrabajadorFila { id: string; nombre: string; apodo: string | null; puesto: string | null; estado: string }

// ── Lo que recibe el buscador ─────────────────────────────────────────────────

export interface ResultadoRemoto {
  /** `<tipo>-<id>`: los de la bodega arman su ficha con ese id (`lib/admin/destino-busqueda.ts`). */
  id: string;
  type: TipoRemoto;
  title: string;
  subtitle: string;
  /** Módulo (los de la bodega: el buscador arma la ficha con `tab` + id). */
  tab?: string;
  /** Destino exacto (los del aserradero y el personal). */
  href?: string;
  badge?: string;
  badgeColor?: string;
  /** Chip a la derecha («GTF de ingreso», «Anexo 04»). */
  entidad?: string;
  /** Fila de apoyo: no es un resultado, no cuenta en la cabecera del grupo. */
  sinContar?: boolean;
}

const CTP = "ctp-libro-operaciones";
const LOTH = "loth-libro-operaciones";
const unir = (...partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(" · ");
const m3 = (v: number | null) => (v != null && v > 0 ? `${formatNumber(v, { max: 3 })} m³` : null);
/** Columnas date-only (a 00:00Z o 12:00Z): se leen en UTC para no correr el día. */
const dia = (d: Date | null) => (d ? formatDateNumeric(d, { soloFecha: true }) : null);

const COLOR_ESTADO_PEDIDO: Record<string, string> = {
  pendiente: "var(--data-warning-500)",
  confirmado: "var(--data-info-500)",
  en_camino: "var(--data-info-700)",
  entregado: "var(--data-success-500)",
  cancelado: "var(--data-error-500)",
};

export function deProducto(p: ProductoFila): ResultadoRemoto {
  return {
    id: `producto-${p.id}`, type: "producto", title: p.name, tab: "inventario",
    subtitle: unir(p.category, formatCurrency(p.price), p.stock != null && `Stock: ${p.stock}`),
    ...(p.stockBajo ? { badge: "Stock bajo", badgeColor: "var(--data-error-500)" } : {}),
  };
}

export function deCliente(c: ClienteFila): ResultadoRemoto {
  return { id: `cliente-${c.phone}`, type: "cliente", title: c.name, tab: "clientes", subtitle: unir(`Tel: ${c.phone}`, c.location.slice(0, 40)) };
}

export function dePedido(o: PedidoFila): ResultadoRemoto {
  return {
    id: `pedido-${o.id}`, type: "pedido", tab: "pedidos",
    title: `Pedido #${o.id} – ${o.customerName || "Sin nombre"}`,
    subtitle: unir(formatCurrency(o.total), formatDateNumeric(o.createdAt)),
    badge: o.status, badgeColor: COLOR_ESTADO_PEDIDO[o.status] ?? "var(--rule-strong)",
  };
}

export function deProveedor(s: ProveedorFila): ResultadoRemoto {
  return { id: `proveedor-${s.id}`, type: "proveedor", title: s.name, tab: "proveedores", subtitle: unir(s.ruc && `RUC ${s.ruc}`, s.phone && `Tel: ${s.phone}`) || "Proveedor" };
}

const ORIGEN_GUIA: Record<GuiaFila["origen"], string> = { ingreso: "GTF de ingreso", loth: "GTF del LO-TH", salida: "GTF de salida" };

/**
 * Una guía del LO-TH se abre en su libro; si el negocio sólo tiene el Libro
 * CTP, esas guías esperan en la bandeja de Ingresos (`CtpGuiasBandeja`).
 */
export function deGuia(g: GuiaFila, lothActivo = true): ResultadoRemoto {
  const href =
    g.origen === "ingreso" ? hrefDe("ingreso", g.id)
    : g.origen === "loth" && lothActivo ? hrefDeDestino({ tab: LOTH, params: { vista: "gtf", sub: g.anulada ? "bajas" : "guias" } })
    : g.origen === "loth" ? hrefDeDestino({ tab: CTP, params: { vista: "ingresos" } })
    : hrefDeDestino({ tab: CTP, params: { vista: "despacho", sub: "guias" } });
  return {
    id: `guia-${g.origen}-${g.id}`, type: "guia", title: `GTF ${g.gtfNumber}`, entidad: ORIGEN_GUIA[g.origen],
    subtitle: unir(g.quien, dia(g.fecha), m3(g.volumenM3)) || ORIGEN_GUIA[g.origen],
    href: href ?? undefined,
    ...(g.anulada ? { badge: "Anulada", badgeColor: "var(--data-error-500)" } : {}),
  };
}

/** Los Anexos 04 viven en un KV (una lista por negocio): se filtran acá, por N°, GTF o permiso. */
export function anexosQueCoinciden(anexos: readonly AnexoEmitido[], q: string): AnexoEmitido[] {
  const vivos = anexos.filter((a) => a.numero || a.gtf);
  const conParecido = vivos.filter((a) => [a.numero, a.gtf, a.permiso].some((c) => nivelDeCoincidencia(c, q) > 0));
  return porParecido(conParecido, q, (a) => [a.gtf, a.numero, a.permiso]).slice(0, LIMITE_POR_GRUPO);
}

export function deAnexo(a: AnexoEmitido): ResultadoRemoto {
  const registrado = (a.despachoIds?.length ?? 0) > 0;
  return {
    id: `anexo-${a.id}`, type: "anexo", entidad: "Anexo 04",
    title: a.numero ? `Anexo 04 N° ${a.numero}` : `Anexo 04 de la GTF ${a.gtf}`,
    subtitle: unir(a.gtf && `GTF ${a.gtf}`, a.permiso && `permiso ${a.permiso}`, a.fecha && formatDateNumeric(a.fecha, { soloFecha: true }), m3(a.totalM3)),
    /* Sin registrar, la salida espera en Despacho; registrada, está en Guías emitidas. */
    href: hrefDeDestino({ tab: CTP, params: registrado ? { vista: "despacho", sub: "guias" } : { vista: "despacho" } }),
    ...(registrado ? {} : { badge: "Sin registrar", badgeColor: "var(--data-warning-500)" }),
  };
}

const ESTADO_TROZA: Record<TrozaFila["estado"], string> = { patio: "En el patio", lote: "En lote", consumida: "Aserrada", despachada: "Despachada" };

export function deTroza(t: TrozaFila): ResultadoRemoto {
  const codigo = t.codificacion ?? t.codigoPlanta ?? "Sin código";
  return {
    id: `troza-${t.id}`, type: "troza",
    title: t.codificacion && t.codigoPlanta ? `${t.codificacion} · planta ${t.codigoPlanta}` : codigo,
    subtitle: unir(t.especie, t.gtfNumber && `GTF ${t.gtfNumber}`, t.loteCodigo ? `lote ${t.loteCodigo}` : null, ESTADO_TROZA[t.estado]),
    href: hrefDe("troza", t.id) ?? undefined,
  };
}

/**
 * Los permisos que coinciden con lo escrito y, detrás, los de las guías y
 * anexos encontrados (con el chip «De la guía»), sin repetir.
 */
export function permisosConRelacionados(directos: readonly PermisoFila[], relacionados: readonly PermisoFila[], q: string): ResultadoRemoto[] {
  const propios = porParecido(directos, q, (p) => [p.codigo, p.alias]).slice(0, LIMITE_POR_GRUPO);
  const ya = new Set(propios.map((p) => p.id));
  const extra = relacionados.filter((p) => !ya.has(p.id)).slice(0, Math.max(0, LIMITE_POR_GRUPO - propios.length));
  return [...propios.map(dePermiso), ...extra.map((p) => ({ ...dePermiso(p), entidad: "De la guía" }))];
}

export function dePermiso(p: PermisoFila): ResultadoRemoto {
  const vencido = p.vigenciaHasta != null && p.vigenciaHasta.getTime() < Date.now();
  return {
    id: `permiso-${p.id}`, type: "permiso", title: p.alias ? `${p.codigo} (${p.alias})` : p.codigo,
    subtitle: unir(p.titularNombre, p.tipo, p.vigenciaHasta && `${vencido ? "venció" : "vence"} ${dia(p.vigenciaHasta)}`),
    href: hrefDe("permiso", p.id) ?? undefined,
    ...(p.estado !== "vigente" ? { badge: p.estado, badgeColor: "var(--rule-strong)" } : {}),
  };
}

export function deLote(l: LoteFila): ResultadoRemoto {
  return {
    id: `lote-${l.id}`, type: "lote", title: `Lote ${l.code}`,
    subtitle: unir(l.especie, l.status, l.permiso && `permiso ${l.permiso}`, dia(l.fechaApertura)),
    /* Lotes de aserrío todavía no abre uno por URL: lleva a la lista. */
    href: hrefDeDestino({ tab: CTP, params: { vista: "lotes" } }),
  };
}

const ROL_PARTE: Record<string, string> = {
  proveedor: "Proveedor", comprador: "Comprador", transportista: "Transportista", conductor: "Conductor", titular: "Titular", destinatario: "Destinatario",
};

export function deParte(p: ParteFila): ResultadoRemoto {
  return {
    id: `parte-${p.id}`, type: "parte", title: p.nombre,
    subtitle: unir(p.roles.map((r) => ROL_PARTE[r] ?? r).join(", "), p.docNumero && `${p.docTipo ?? "Doc."} ${p.docNumero}`) || "Directorio",
    href: hrefDe("parte", p.id) ?? undefined,
  };
}

const ESTADO_TRABAJADOR: Record<string, string> = { ACTIVO: "Activo", VACACIONES: "Vacaciones", LICENCIA: "Licencia", SUSPENDIDO: "Suspendido", CESADO: "Retirado" };
const HREF_ASISTENCIA = hrefDeDestino({ tab: "rrhh", params: { vista: "asistencia" } });

/**
 * El nivel `marcar` (almacenero, cajero) no abre fichas: su RRHH es sólo
 * Asistencia. Gestión y completo abren la ficha; al final, una fila a la
 * asistencia del equipo.
 */
export function deTrabajadores(filas: readonly TrabajadorFila[], role: AdminRole): ResultadoRemoto[] {
  const conFicha = nivelDeRol(role) !== "marcar";
  const res: ResultadoRemoto[] = filas.map((t) => ({
    id: `trabajador-${t.id}`, type: "trabajador",
    title: t.apodo ? `${t.nombre} («${t.apodo}»)` : t.nombre,
    subtitle: unir(t.puesto, ESTADO_TRABAJADOR[t.estado] ?? t.estado),
    href: conFicha ? hrefDe("colaborador", t.id) ?? HREF_ASISTENCIA : HREF_ASISTENCIA,
  }));
  if (res.length > 0) {
    res.push({ id: "trabajador-asistencia", type: "trabajador", title: "Ver la asistencia", subtitle: "Quién vino y a qué hora marcó", href: HREF_ASISTENCIA, sinContar: true });
  }
  return res;
}
