/**
 * Las incoherencias de una planta para el superadmin (17-10), traducidas de lo
 * que el libro YA detecta. Puro: no lee ni recalcula, sólo pone en una lista
 * común lo que dicen cuatro lectores del libro.
 *
 *  · saldo          → `excepcionesDeSaldo` («Qué revisar» de Saldos), mismo tono.
 *  · cuadre_ingreso → `cuadreDeIngreso`/`descuadra` por guía (el barrido de
 *                     «Descuadres» del libro: todas las guías, todos los estados).
 *  · rendimiento    → `alertasRendimiento` (Radar): imposible = error; bajo/alto = aviso.
 *  · pendiente      → `pendientesDelLibro` vía el reporte diario: lo que traba el
 *                     cierre = error; lo atrasado = aviso. Los dos pendientes que
 *                     repiten un aviso de saldo (saldos en negativo, corridas sin
 *                     materia prima) y las deudas con proveedores (no son volumen)
 *                     quedan fuera.
 *  · inspeccion     → los hallazgos error/aviso de la ÚLTIMA inspección CERRADA
 *                     (no anulada) de la planta: lo que el inspector vio en el
 *                     patio vale como lo que el libro detecta solo.
 *
 * `m3EnJuego` es `null` cuando el aviso no se mide en m³ (stock de productos en
 * otras unidades, lotes vencidos, pendientes): nunca 0.
 */
import { cuadreDeIngreso, descuadra } from "@/lib/forestal/cuadre-trozas";
import type { RendimientoCorrida } from "@/lib/forestal/ctp-radar-rendimiento";
import { nombresVisibles, type Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";
import type { GravedadIncoherencia, HallazgoInspeccion, IncoherenciaPlanta, PendientePlanta } from "./tipos";

export interface PlantaRef {
  tenantId: string;
  nombre: string;
}

const TAB_LIBRO = "ctp-libro-operaciones";

/** Query del panel de la planta que abre el libro en esa vista. */
export function enlaceLibro(vista: string, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ tab: TAB_LIBRO, vista, ...extra }).toString();
}

const m3 = (n: number): string => `${n.toLocaleString("es-PE", { maximumFractionDigits: 3 })} m³`;

/* ── Saldo ──────────────────────────────────────────────────────────────── */

/**
 * Claves cuya `magnitud` no es madera en juego HOY: el stock de productos va
 * en sus unidades, los lotes vencidos no tienen magnitud y el valle es un punto
 * del pasado («el patio ESTUVO en −78 m³») — en Blas repetía los 78,671 m³ de
 * las especies sin ingreso y los m³ en juego salían 157 (17-10).
 */
const SIN_M3 = new Set<Excepcion["clave"]>(["stock-negativo", "lotes-vencidos", "valle-negativo"]);

function enlaceDeExcepcion(e: Excepcion): string {
  if (!e.ir) return enlaceLibro("saldos");
  /* Un aviso con filtro («las que esperan recepción») va a la bandeja, como
     hace el libro (`irA`): Ingresos › Por recepcionar. Las vistas que se
     mudaron (rentabilidad → Tablero › Margen) las redirige el propio libro. */
  if (e.ir === "ingresos" && e.filtro) return enlaceLibro("ingresos", { sub: "por-recepcionar" });
  return enlaceLibro(e.ir);
}

export function incoherenciasDeSaldo(p: PlantaRef, excepciones: readonly Excepcion[]): IncoherenciaPlanta[] {
  return excepciones.map((e) => {
    const { visibles, resto } = nombresVisibles(e.items);
    const nombres = visibles.length ? ` (${visibles.join(", ")}${resto ? ` y ${resto} más` : ""})` : "";
    return {
      id: `${p.tenantId}:saldo:${e.clave}`,
      tenantId: p.tenantId,
      plantaNombre: p.nombre,
      origen: "saldo",
      clave: e.clave,
      gravedad: e.tono,
      titulo: e.titulo,
      detalle: `${e.detalle}${nombres}`,
      m3EnJuego: SIN_M3.has(e.clave) || e.magnitud == null ? null : e.magnitud,
      referencia: null,
      enlaceLibro: enlaceDeExcepcion(e),
    };
  });
}

/* ── Cuadre por guía ────────────────────────────────────────────────────── */

/** Lo que el barrido de ingresos trae de cada guía (fila de `WoodEntriesDB.list`). */
export interface IngresoParaCuadre {
  id: string;
  gtfNumber: string | null;
  speciesCommonName?: string | null;
  status?: string | null;
  volumeM3: unknown;
  trozasM3: number | null;
  trozasCount: number | null;
}

/**
 * Una incoherencia por guía descuadrada, la peor primero. Si el barrido no
 * llegó a todas las guías (`truncado`), un aviso informativo lo dice: «sin
 * descuadres» sobre una parte no es «sin descuadres».
 */
export function incoherenciasDeCuadre(
  p: PlantaRef,
  ingresos: readonly IngresoParaCuadre[],
  truncado: { leidos: number; total: number } | null,
): IncoherenciaPlanta[] {
  const fuera: IncoherenciaPlanta[] = [];
  for (const e of ingresos) {
    const declarado = Number(e.volumeM3);
    const c = cuadreDeIngreso(declarado, e.trozasM3, e.trozasCount ?? 0);
    if (!descuadra(c)) continue;
    const guia = e.gtfNumber?.trim() || "sin número";
    fuera.push({
      id: `${p.tenantId}:cuadre_ingreso:${e.id}`,
      tenantId: p.tenantId,
      plantaNombre: p.nombre,
      origen: "cuadre_ingreso",
      clave: c.estado,
      gravedad: "warning",
      titulo: `Guía ${guia}: ${c.aviso}`,
      detalle: `Declara ${m3(declarado)} y sus ${e.trozasCount ?? 0} piezas suman ${m3(Number(e.trozasM3 ?? 0))}${
        e.speciesCommonName ? ` · ${e.speciesCommonName}` : ""
      }${e.status ? ` · ${e.status}` : ""}.`,
      m3EnJuego: Math.abs(c.brecha),
      referencia: e.gtfNumber?.trim() ? { tipo: "guia", valor: e.gtfNumber.trim() } : null,
      enlaceLibro: enlaceLibro("ingresos", { ingreso: e.id }),
    });
  }
  fuera.sort((a, b) => (b.m3EnJuego ?? 0) - (a.m3EnJuego ?? 0));
  if (truncado && truncado.leidos < truncado.total) {
    fuera.push({
      id: `${p.tenantId}:cuadre_ingreso:truncado`,
      tenantId: p.tenantId,
      plantaNombre: p.nombre,
      origen: "cuadre_ingreso",
      clave: "truncado",
      gravedad: "info",
      titulo: `El cuadre por guía revisó ${truncado.leidos} de ${truncado.total} ingresos`,
      detalle: "Las guías más viejas no se revisaron: ábrelas en «Descuadres» del libro de la planta.",
      m3EnJuego: null,
      referencia: null,
      enlaceLibro: enlaceLibro("ingresos"),
    });
  }
  return fuera;
}

/* ── Rendimiento ────────────────────────────────────────────────────────── */

export function incoherenciasDeRendimiento(
  p: PlantaRef,
  alertas: readonly RendimientoCorrida[],
): IncoherenciaPlanta[] {
  return alertas.map((r) => ({
    id: `${p.tenantId}:rendimiento:${r.id}`,
    tenantId: p.tenantId,
    plantaNombre: p.nombre,
    origen: "rendimiento",
    clave: r.flag,
    gravedad: r.flag === "imposible" ? "error" : "warning",
    titulo:
      r.flag === "imposible"
        ? `${r.etiqueta}: produjo más de lo que entró`
        : `${r.etiqueta}: rinde ${r.flag === "bajo" ? "menos" : "más"} que sus pares`,
    detalle: r.motivo ?? "",
    m3EnJuego: r.entradaM3 > 0 ? r.entradaM3 : null,
    referencia: { tipo: "corrida", valor: r.etiqueta },
    enlaceLibro: enlaceLibro("tablero", { sub: "rendimiento" }),
  }));
}

/* ── Pendientes del libro ───────────────────────────────────────────────── */

/** Los pendientes que repiten un aviso de saldo: contarlos dos veces infla la lista. */
export const PENDIENTES_DUPLICADOS = new Set(["Saldos en negativo", "Corridas sin materia prima atribuida"]);

/** Deudas con proveedores («N guías sin pagar a X · S/ …»): plata, no volumen. */
export const ES_DEUDA = / sin pagar a /;

/**
 * La vista del libro de cada pendiente. El reporte diario sólo pasa el título
 * (no la `vista` de `pendientesDelLibro`): se reconoce por sus palabras, en el
 * orden de `ctp-pendientes.ts` («fuera de plazo» antes que «ingresos»).
 */
export function vistaDePendiente(titulo: string): string {
  if (/fuera de plazo/i.test(titulo)) return "cumplimiento";
  if (/permiso/i.test(titulo)) return "contratos";
  if (/despacho/i.test(titulo)) return "despacho";
  if (/troza/i.test(titulo)) return "trozas";
  if (/ingres|guía/i.test(titulo)) return "ingresos";
  return "tablero";
}

export function incoherenciasDePendientes(
  p: PlantaRef,
  pendientes: readonly (PendientePlanta & { detalle?: string })[],
): IncoherenciaPlanta[] {
  const fuera: IncoherenciaPlanta[] = [];
  for (const x of pendientes) {
    if (x.urgencia === "pendiente" || PENDIENTES_DUPLICADOS.has(x.titulo) || ES_DEUDA.test(x.titulo)) continue;
    const gravedad: GravedadIncoherencia = x.urgencia === "bloquea" ? "error" : "warning";
    fuera.push({
      id: `${p.tenantId}:pendiente:${x.titulo}`,
      tenantId: p.tenantId,
      plantaNombre: p.nombre,
      origen: "pendiente",
      clave: x.urgencia,
      gravedad,
      titulo: `${x.titulo} (${x.cantidad})`,
      detalle: x.detalle ?? "",
      m3EnJuego: null,
      referencia: null,
      enlaceLibro: enlaceLibro(vistaDePendiente(x.titulo)),
    });
  }
  return fuera;
}

const URGENCIA_PESO: Record<PendientePlanta["urgencia"], number> = { bloquea: 0, atrasado: 1, pendiente: 2 };

/**
 * Los pendientes que viajan en la ficha del superadmin (security 17-10, Ley
 * 29733): las deudas con proveedores traen el NOMBRE del proveedor y la plata
 * («2 guías sin pagar a Nelly · S/ 800.00»). El superadmin controla volumen,
 * no a quién le debe la planta: se juntan en una línea sin nombres ni montos
 * («3 guías sin pagar (2 proveedores)») con la urgencia más alta. Idempotente.
 */
export function pendientesParaFicha(pendientes: readonly PendientePlanta[]): PendientePlanta[] {
  const fuera: PendientePlanta[] = [];
  let guias = 0;
  let proveedores = 0;
  let urgencia: PendientePlanta["urgencia"] = "pendiente";
  for (const x of pendientes) {
    if (!ES_DEUDA.test(x.titulo)) {
      fuera.push({ titulo: x.titulo, urgencia: x.urgencia, cantidad: x.cantidad });
      continue;
    }
    guias += x.cantidad;
    proveedores += 1;
    if (URGENCIA_PESO[x.urgencia] < URGENCIA_PESO[urgencia]) urgencia = x.urgencia;
  }
  if (proveedores > 0) {
    fuera.push({
      titulo: `${guias === 1 ? "1 guía" : `${guias} guías`} sin pagar (${proveedores === 1 ? "1 proveedor" : `${proveedores} proveedores`})`,
      urgencia,
      cantidad: guias,
    });
  }
  return fuera.sort((a, b) => URGENCIA_PESO[a.urgencia] - URGENCIA_PESO[b.urgencia] || b.cantidad - a.cantidad);
}

/* ── Inspección ─────────────────────────────────────────────────────────── */

/** Lo que hace falta de la última inspección cerrada para volverla incoherencias. */
export interface InspeccionCerrada {
  id: string;
  /** AAAA-MM-DD (día de la inspección). */
  fecha: string;
  inspector: string;
  hallazgos: readonly HallazgoInspeccion[];
}

const VISTA_DE_CATEGORIA: Record<HallazgoInspeccion["categoria"], string> = {
  volumen: "saldos",
  documentos: "ingresos",
  trazabilidad: "trozas",
  seguridad: "tablero",
  otro: "tablero",
};

const VISTA_DE_REFERENCIA: Partial<Record<NonNullable<HallazgoInspeccion["referencia"]>["tipo"], string>> = {
  guia: "ingresos",
  troza: "trozas",
  especie: "saldos",
};

/** «17/10/2026» de un AAAA-MM-DD sin pasar por `Date` (un día de Lima no se corre). */
export function diaLegible(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return a && m && d ? `${d}/${m}/${a}` : fecha;
}

/** Primera línea del texto, cortada: el título de la lista no es el párrafo entero. */
function titular(texto: string, max = 110): string {
  const linea = texto.trim().split(/\r?\n/)[0] ?? "";
  return linea.length > max ? `${linea.slice(0, max - 1).trimEnd()}…` : linea;
}

/**
 * Los hallazgos error/aviso de la última inspección CERRADA → incoherencias de
 * origen `inspeccion`. Los `info` no entran (son notas, no problemas). El id
 * lleva el de la inspección: la siguiente inspección cerrada los reemplaza.
 */
export function incoherenciasDeInspeccion(p: PlantaRef, i: InspeccionCerrada | null): IncoherenciaPlanta[] {
  if (!i) return [];
  const fuera: IncoherenciaPlanta[] = [];
  for (const h of i.hallazgos) {
    if (h.gravedad === "info") continue;
    const vista = (h.referencia && VISTA_DE_REFERENCIA[h.referencia.tipo]) || VISTA_DE_CATEGORIA[h.categoria];
    fuera.push({
      id: `${p.tenantId}:inspeccion:${i.id}:${h.id}`,
      tenantId: p.tenantId,
      plantaNombre: p.nombre,
      origen: "inspeccion",
      clave: h.categoria,
      gravedad: h.gravedad,
      titulo: `Inspección del ${diaLegible(i.fecha)}: ${titular(h.texto)}`,
      detalle: `${h.texto.trim()} (inspeccionó ${i.inspector})`,
      m3EnJuego: h.m3,
      referencia: h.referencia,
      enlaceLibro: enlaceLibro(vista),
    });
  }
  return fuera;
}

/**
 * La última inspección cerrada no se pudo leer: se dice (info) en vez de callar
 * sus hallazgos. No es una `FuenteLectura` (el semáforo no se pone gris por esto),
 * pero el cálculo no se cachea y el próximo pedido la reintenta.
 */
export function inspeccionIlegible(p: PlantaRef): IncoherenciaPlanta {
  return {
    id: `${p.tenantId}:inspeccion:ilegible`,
    tenantId: p.tenantId,
    plantaNombre: p.nombre,
    origen: "inspeccion",
    clave: "ilegible",
    gravedad: "info",
    titulo: "No se pudo leer la última inspección cerrada",
    detalle: "Sus hallazgos no entran en esta cuenta ni en el semáforo; se reintenta en el próximo pedido.",
    m3EnJuego: null,
    referencia: null,
    enlaceLibro: enlaceLibro("tablero"),
  };
}

/* ── Conteo ─────────────────────────────────────────────────────────────── */

/** Cuántas hay de cada gravedad y los m³ en juego de las que importan (error + aviso). */
export function contarIncoherencias(
  items: readonly IncoherenciaPlanta[],
): Record<GravedadIncoherencia, number> & { m3EnJuego: number } {
  const c = { error: 0, warning: 0, info: 0, m3EnJuego: 0 };
  for (const i of items) {
    c[i.gravedad] += 1;
    if (i.gravedad !== "info" && i.m3EnJuego != null) c.m3EnJuego += i.m3EnJuego;
  }
  c.m3EnJuego = Math.round(c.m3EnJuego * 10_000) / 10_000;
  return c;
}

const PESO: Record<GravedadIncoherencia, number> = { error: 0, warning: 1, info: 2 };

/** Lo grave primero; dentro de cada gravedad, lo que más m³ pone en juego. */
export function ordenarIncoherencias(items: readonly IncoherenciaPlanta[]): IncoherenciaPlanta[] {
  return [...items].sort(
    (a, b) => PESO[a.gravedad] - PESO[b.gravedad] || (b.m3EnJuego ?? -1) - (a.m3EnJuego ?? -1),
  );
}
