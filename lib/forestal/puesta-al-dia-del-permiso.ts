/**
 * «Para poner al día» — la lista de pasos de la ficha del permiso.
 *
 * Brandon (2026-09-25): «para que el permiso FMP-2026-007 cuadre hay que hacer
 * 4 cosas en orden (corregir la fecha de 8 guías, acomodar 29 trozas, poner
 * precio a 24 ingresos y descontar 30 corridas), y cada una vive en una
 * pantalla distinta». Esto arma esa lista: cada paso con su estado, su cifra en
 * palabras del aserradero y cuál toca ahora.
 *
 * Las cuatro piezas YA existen (ADR-432/433/434/435); acá no se decide nada
 * nuevo, sólo se cuenta con sus mismas reglas:
 *  1. Fecha de llegada: `llegadaSospechosa` (recibida después de corridas de su
 *     permiso y especie). Sin eso, T3 frena el descuento (ADR-433/434).
 *  2. Trozas en su especie: la vista previa de «Acomodar» (ADR-435). Una troza
 *     en la fila de otra especie frena el descuento (I2 es por fila).
 *  3. Precio: filas del permiso sin `costoTotal` — el mismo conteo que
 *     `balance().madera.sinValorizar`. Es aparte: no frena nada.
 *  4. Descontar: el plan con frenos de «Descontar la madera usada»
 *     (`planDescontar`). Dice cuántas se pueden YA y cuántas esperan a 1-2.
 *
 * El orden 1 → 2 → 4 es una cadena (la corrida sólo descuenta troza que ya
 * había llegado ese día y que está en la fila de su especie); el 3 va cuando
 * se quiera. El «n de 4» manda al primer paso que no está hecho.
 *
 * PURO y client-safe: sin DB, sin React. Lo testea
 * `__tests__/forestal-puesta-al-dia-del-permiso.test.ts`.
 */

import type { PlanAcomodo } from "./acomodar-trozas";
import { fmtM3 } from "./cubicacion-formato";
import { corridasAntesDeLaLlegada, ddmm, llegadaSospechosa, type ContextoDeLlegada } from "./fecha-de-llegada";
import type { PlanDescontar } from "./vincular-desde-permiso";
import type { GuiaDelPermiso } from "./volumen-del-permiso";

/* ─────────────────────────── Tipos ─────────────────────────── */

export type ClavePaso = "fecha" | "trozas" | "precio" | "descontar";

/**
 * · `hecho`: no queda nada.
 * · `pendiente`: hay algo que hacer y se puede hacer ya.
 * · `espera`: queda algo, pero nada se puede hasta terminar un paso anterior.
 * · `revisar`: queda algo que esta lista no arregla (se dice por qué).
 * · `cargando` / `error`: todavía no se sabe.
 */
export type EstadoPaso = "hecho" | "pendiente" | "espera" | "revisar" | "cargando" | "error";

/** Lo que se sabe de un paso mientras se piden sus datos. */
export type Dato<T> = { estado: "listo"; valor: T } | { estado: "cargando" } | { estado: "error"; mensaje: string };

export interface PasoPuestaAlDia {
  clave: ClavePaso;
  numero: 1 | 2 | 3 | 4;
  estado: EstadoPaso;
  /** Cuántos faltan, en la unidad del paso (guías, trozas, ingresos, corridas). */
  faltan: number;
  /** Lo que se hace, sin cifra: «Corregir la fecha de llegada». Tachado al terminar. */
  nombre: string;
  /** Con la cifra: «Corrige la fecha de llegada de 8 guías». */
  titulo: string;
  /** Una línea con el detalle en palabras del aserradero, o `null`. */
  detalle: string | null;
  /** El rótulo del botón que abre el arreglo; `null` = sin botón. */
  accion: string | null;
  /** El arreglo lo firma un administrador o el dueño (el servidor lo exige). */
  soloAdmin: boolean;
}

export interface PuestaAlDia {
  pasos: PasoPuestaAlDia[];
  /** El primer paso que no está hecho (el «n de 4»), o `null` si todo está al día. */
  actual: PasoPuestaAlDia | null;
  /** Todos hechos. */
  alDia: boolean;
  /** Pasos que no están hechos (incluye los que todavía cargan). */
  pendientes: number;
}

/* ─────────────────────────── Resúmenes (respuesta del servidor → conteo) ─────────────────────────── */

export interface ResumenFecha {
  /** GTF recibidas después de corridas de su permiso y especie. */
  sospechosas: string[];
  /** GTF del permiso que todavía no se recibieron. */
  sinRecibir: string[];
  /** Días (AAAA-MM-DD) en que figuran recibidas las sospechosas, sin repetir. */
  recibidasEl: string[];
  /** La corrida más vieja que choca con esas recepciones (AAAA-MM-DD). */
  sierraDesde: string | null;
  /** Guías del permiso que no se pudieron revisar (tope del endpoint). */
  sinRevisar: number;
}

/**
 * Paso 1, de los contextos de llegada (`GET wood-entries/recepcion`) de las
 * GTF del permiso. Una GTF sin contexto (más allá del tope) queda en
 * `sinRevisar`, no se da por buena en silencio.
 */
export function resumirFecha(gtfs: readonly string[], contextos: readonly ContextoDeLlegada[]): ResumenFecha {
  const porGtf = new Map(contextos.map((c) => [c.gtfNumber.trim(), c]));
  const unicas = [...new Set(gtfs.map((g) => g.trim()).filter(Boolean))].sort();
  const sospechosas: string[] = [];
  const sinRecibir: string[] = [];
  const recibidasEl = new Set<string>();
  let sierraDesde: string | null = null;
  let sinRevisar = 0;
  for (const gtf of unicas) {
    const ctx = porGtf.get(gtf);
    if (!ctx) {
      sinRevisar += 1;
      continue;
    }
    if (ctx.asientos > 0 && !ctx.recepcion) {
      sinRecibir.push(gtf);
      continue;
    }
    if (!llegadaSospechosa(ctx)) continue;
    sospechosas.push(gtf);
    if (ctx.recepcion) recibidasEl.add(ctx.recepcion);
    const antes = corridasAntesDeLaLlegada(ctx.recepcion ?? "", ctx.especies, ctx.corridas);
    for (const a of antes) if (sierraDesde == null || a.desde < sierraDesde) sierraDesde = a.desde;
  }
  return { sospechosas, sinRecibir, recibidasEl: [...recibidasEl].sort(), sierraDesde, sinRevisar };
}

/** Una guía YA recibida del permiso, con la forma que pide «Corregir la recepción». */
export interface GuiaRecibidaDelPermiso {
  clave: string;
  gtfNumber: string;
  providerName: string;
  /** `AAAA-MM-DD` de la guía (la que declara el papel). */
  gtfDate: string | null;
  /** `AAAA-MM-DD` del asiento más viejo. */
  entryDate: string;
  lineas: { id: string; fechaRecepcion: string | null }[];
}

/**
 * Las guías del permiso que se pueden corregir: las que tienen alguna fila
 * recibida (la misma idea que `yaRecibida`). Las fechas salen del contexto del
 * servidor; las filas y el proveedor, del volumen de la ficha.
 */
export function guiasRecibidasDelPermiso(
  guias: readonly Pick<GuiaDelPermiso, "id" | "gtf" | "proveedor" | "fecha">[],
  contextos: readonly ContextoDeLlegada[],
): GuiaRecibidaDelPermiso[] {
  const porGtf = new Map(contextos.map((c) => [c.gtfNumber.trim(), c]));
  const filas = new Map<string, Pick<GuiaDelPermiso, "id" | "gtf" | "proveedor" | "fecha">[]>();
  for (const g of guias) {
    const k = g.gtf.trim();
    filas.set(k, [...(filas.get(k) ?? []), g]);
  }
  const salida: GuiaRecibidaDelPermiso[] = [];
  for (const [gtf, fs] of [...filas.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ctx = porGtf.get(gtf);
    if (!ctx?.recepcion) continue;
    salida.push({
      clave: gtf,
      gtfNumber: gtf,
      providerName: fs.find((f) => f.proveedor)?.proveedor ?? "",
      gtfDate: ctx.guia,
      entryDate: ctx.asiento ?? fs[0]!.fecha.slice(0, 10),
      lineas: fs.map((f) => ({ id: f.id, fechaRecepcion: ctx.recepcion })),
    });
  }
  return salida;
}

export interface ResumenTrozas {
  /** Trozas (familias de retrozado) que pasan a la fila de su especie. */
  mover: number;
  m3: number;
  /** Guías con algo que mover. */
  guias: number;
  /** Están en otra fila y NO se mueven (ya aserradas, en un lote, mes cerrado…). */
  quietas: number;
  /** Sin una fila de su especie en su guía: se quedan donde están. */
  sinFila: number;
}

/** Paso 2, de la vista previa de «Acomodar» acotada al permiso. */
export function resumirTrozas(plan: Pick<PlanAcomodo, "totales">): ResumenTrozas {
  const t = plan.totales;
  return { mover: t.mover, m3: t.m3Mover, guias: t.guiasConCambios, quietas: t.quietas, sinFila: t.sinFila };
}

/** Paso 2 sin pedir nada: ninguna GTF del permiso tiene dos filas, no hay a dónde mover. */
export const TROZAS_SIN_NADA: ResumenTrozas = { mover: 0, m3: 0, guias: 0, quietas: 0, sinFila: 0 };

/** ¿Alguna GTF del permiso tiene dos o más filas (especies)? Sólo ahí «Acomodar» mueve algo. */
export function hayGuiasDeVariasEspecies(guias: readonly Pick<GuiaDelPermiso, "gtf">[]): boolean {
  const n = new Map<string, number>();
  for (const g of guias) {
    const k = g.gtf.trim();
    const v = (n.get(k) ?? 0) + 1;
    if (v >= 2) return true;
    n.set(k, v);
  }
  return false;
}

export interface ResumenPrecio {
  /** Filas de ingreso (una por especie de cada GTF) sin costo cargado. */
  sinPrecio: number;
  m3SinPrecio: number;
  filas: number;
}

/**
 * Paso 3, del volumen de la ficha: las filas vivas del permiso sin
 * `costoTotal` (sin factura es `null`, nunca 0). Mismo filtro que
 * `balance().madera.sinValorizar`, así la lista y «Plata» dicen lo mismo.
 */
export function resumirPrecio(guias: readonly Pick<GuiaDelPermiso, "m3" | "costo">[]): ResumenPrecio {
  const sin = guias.filter((g) => g.costo == null);
  return {
    sinPrecio: sin.length,
    m3SinPrecio: Math.round(sin.reduce((a, g) => a + (g.m3 ?? 0), 0) * 10_000) / 10_000,
    filas: guias.length,
  };
}

export interface ResumenDescontar {
  /** Corridas sin materia prima del permiso. */
  corridas: number;
  /** Las que la tanda ofrece hoy. */
  ya: number;
  /** Frenadas porque su madera figura recibida después (se arregla con el paso 1). */
  porFecha: number;
  /** Sin troza apta, pero hay trozas de su especie en la fila de otra (se arregla con el paso 2). */
  porFila: number;
  /** Sin madera de su especie en este permiso, o la que hay ya no alcanza. */
  sinMadera: number;
  /** Frenadas por otra regla, o sin volumen/especie que repartir. */
  otras: number;
}

/**
 * Paso 4, del plan de «Descontar la madera usada» (`planDescontar`) sobre las
 * corridas del aviso. Cada corrida cae en UN solo cajón, por su freno.
 */
export function resumirDescontar(plan: Pick<PlanDescontar, "grupos" | "apartadas">): ResumenDescontar {
  const r: ResumenDescontar = { corridas: 0, ya: 0, porFecha: 0, porFila: 0, sinMadera: 0, otras: 0 };
  for (const g of plan.grupos) {
    const hayEnOtraFila = g.fuera.some((t) => t.motivo === "otra-fila");
    for (const c of g.reparto) {
      r.corridas += 1;
      if (c.frena == null) r.ya += 1;
      else if (c.frena === "fecha") r.porFecha += 1;
      else if ((c.frena === "sin-trozas" || c.frena === "se-acabo") && hayEnOtraFila) r.porFila += 1;
      else if (c.frena === "sin-trozas" || c.frena === "se-acabo") r.sinMadera += 1;
      else r.otras += 1;
    }
  }
  r.corridas += plan.apartadas.length;
  r.otras += plan.apartadas.length;
  return r;
}

/* ─────────────────────────── La lista ─────────────────────────── */

export interface EntradaPuestaAlDia {
  fecha: Dato<ResumenFecha>;
  trozas: Dato<ResumenTrozas>;
  precio: ResumenPrecio;
  descontar: Dato<ResumenDescontar>;
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;
const fechas = (dias: readonly string[]): string =>
  dias.length <= 1 ? (dias[0] ? ddmm(dias[0]) : "") : `${dias.slice(0, -1).map(ddmm).join(", ")} y ${ddmm(dias[dias.length - 1]!)}`;

const NOMBRE: Record<ClavePaso, string> = {
  fecha: "Corregir la fecha de llegada de las guías",
  trozas: "Acomodar las trozas en su especie",
  precio: "Poner precio a la madera",
  descontar: "Descontar la madera usada en cada corrida",
};

type Base = Pick<PasoPuestaAlDia, "clave" | "numero" | "nombre" | "soloAdmin">;
const base = (clave: ClavePaso, numero: PasoPuestaAlDia["numero"], soloAdmin: boolean): Base => ({
  clave,
  numero,
  nombre: NOMBRE[clave],
  soloAdmin,
});

function sinSaber(b: Base, d: { estado: "cargando" } | { estado: "error"; mensaje: string }): PasoPuestaAlDia {
  return {
    ...b,
    estado: d.estado,
    faltan: 0,
    titulo: b.nombre,
    detalle: d.estado === "error" ? `No se pudo revisar: ${d.mensaje}` : "Revisando…",
    accion: null,
  };
}

function pasoFecha(d: Dato<ResumenFecha>): PasoPuestaAlDia {
  const b = base("fecha", 1, true);
  if (d.estado !== "listo") return sinSaber(b, d);
  const f = d.valor;
  const cola = f.sinRevisar > 0 ? ` · ${plural(f.sinRevisar, "guía", "guías")} sin revisar` : "";
  if (f.sospechosas.length > 0) {
    const n = f.sospechosas.length;
    const recibidas = f.recibidasEl.length > 0 ? `Figuran recibidas el ${fechas(f.recibidasEl)}` : "Figuran recibidas";
    return {
      ...b,
      estado: "pendiente",
      faltan: n,
      titulo: `Corrige la fecha de llegada de ${plural(n, "guía", "guías")}`,
      detalle: `${recibidas}${f.sierraDesde ? `, y la sierra ya cortaba su madera desde el ${ddmm(f.sierraDesde)}` : ""}${cola}`,
      accion: "Corregir fechas",
    };
  }
  if (f.sinRecibir.length > 0) {
    const n = f.sinRecibir.length;
    return {
      ...b,
      estado: "revisar",
      faltan: n,
      titulo: `Recibe ${plural(n, "guía que sigue", "guías que siguen")} sin recibir`,
      detalle: `${f.sinRecibir.slice(0, 3).join(", ")}${n > 3 ? ` y ${n - 3} más` : ""}: se reciben en Ingresos → «Recibir en bloque»${cola}`,
      accion: null,
    };
  }
  return { ...b, estado: "hecho", faltan: 0, titulo: b.nombre, detalle: f.sinRevisar > 0 ? cola.slice(3) : null, accion: null };
}

function pasoTrozas(d: Dato<ResumenTrozas>): PasoPuestaAlDia {
  const b = base("trozas", 2, true);
  if (d.estado !== "listo") return sinSaber(b, d);
  const t = d.valor;
  const quietas = t.quietas + t.sinFila;
  const nota = quietas > 0 ? `${plural(quietas, "troza no se puede mover", "trozas no se pueden mover")} (ya aserradas, en un lote o sin fila de su especie)` : null;
  if (t.mover > 0) {
    return {
      ...b,
      estado: "pendiente",
      faltan: t.mover,
      titulo: `Acomoda ${plural(t.mover, "troza", "trozas")} en la fila de su especie`,
      detalle: `${fmtM3(t.m3)} m³ en ${plural(t.guias, "guía", "guías")}${nota ? ` · ${nota}` : ""}`,
      accion: "Acomodar",
    };
  }
  return { ...b, estado: "hecho", faltan: 0, titulo: b.nombre, detalle: nota, accion: null };
}

function pasoPrecio(p: ResumenPrecio): PasoPuestaAlDia {
  const b = base("precio", 3, true);
  if (p.sinPrecio > 0) {
    return {
      ...b,
      estado: "pendiente",
      faltan: p.sinPrecio,
      titulo: `Pon precio a ${plural(p.sinPrecio, "ingreso", "ingresos")}`,
      detalle: `${fmtM3(p.m3SinPrecio)} m³ sin precio: la Plata del permiso no los suma`,
      accion: "Poner precio",
    };
  }
  return { ...b, estado: "hecho", faltan: 0, titulo: b.nombre, detalle: null, accion: null };
}

/** «el paso 1», «el paso 2» o «los pasos 1 y 2». */
function cualesPasos(fecha: boolean, trozas: boolean): string {
  if (fecha && trozas) return "los pasos 1 y 2";
  return fecha ? "el paso 1" : "el paso 2";
}

function pasoDescontar(d: Dato<ResumenDescontar>, fecha: PasoPuestaAlDia, trozas: PasoPuestaAlDia): PasoPuestaAlDia {
  const b = base("descontar", 4, false);
  if (d.estado !== "listo") return sinSaber(b, d);
  const r = d.valor;
  if (r.corridas === 0) return { ...b, estado: "hecho", faltan: 0, titulo: b.nombre, detalle: null, accion: null };

  /* Un freno «espera» sólo mientras su paso no está hecho: si la fecha ya se
     corrigió y la corrida sigue antes de su madera, es que salió de otra. */
  const fechaAbierta = fecha.estado !== "hecho";
  const trozasAbierto = trozas.estado !== "hecho";
  const esperanFecha = fechaAbierta ? r.porFecha : 0;
  const esperanFila = trozasAbierto ? r.porFila : 0;
  const esperan = esperanFecha + esperanFila;
  const resto = r.corridas - r.ya - esperan;
  const partes = [`${r.ya} ${r.ya === 1 ? "se puede" : "se pueden"} ya`];
  if (esperan > 0) partes.push(`${esperan} ${esperan === 1 ? "espera" : "esperan"} ${cualesPasos(esperanFecha > 0, esperanFila > 0)}`);
  if (resto > 0) partes.push(`${resto} sin madera de este permiso que les alcance`);

  const estado: EstadoPaso = r.ya > 0 ? "pendiente" : esperan > 0 ? "espera" : "revisar";
  return {
    ...b,
    estado,
    faltan: r.corridas,
    titulo: `Descuenta la madera de ${plural(r.corridas, "corrida", "corridas")}`,
    detalle: partes.join(" · "),
    accion: r.ya > 0 ? `Descontar ${r.ya}` : "Ver por qué",
  };
}

/** La lista entera, en orden. */
export function armarPuestaAlDia(e: EntradaPuestaAlDia): PuestaAlDia {
  const fecha = pasoFecha(e.fecha);
  const trozas = pasoTrozas(e.trozas);
  const precio = pasoPrecio(e.precio);
  const descontar = pasoDescontar(e.descontar, fecha, trozas);
  const pasos = [fecha, trozas, precio, descontar];
  const abiertos = pasos.filter((p) => p.estado !== "hecho");
  return { pasos, actual: abiertos[0] ?? null, alDia: abiertos.length === 0, pendientes: abiertos.length };
}

/** «1 de 4: corrige la fecha de llegada de 8 guías». `null` si no hay paso actual. */
export function textoDelActual(p: PuestaAlDia): string | null {
  const a = p.actual;
  if (!a) return null;
  if (a.estado === "cargando") return "Revisando el permiso…";
  const titulo = a.estado === "error" ? `no se pudo revisar «${a.nombre.toLowerCase()}»` : a.titulo;
  return `${a.numero} de ${p.pasos.length}: ${titulo.charAt(0).toLowerCase()}${titulo.slice(1)}`;
}
