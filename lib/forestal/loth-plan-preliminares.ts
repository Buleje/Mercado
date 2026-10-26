/**
 * GTF preliminares del plan (Brandon 25-10): «guías que hice a mano y están por
 * enviar a SERFOR». Se anota sólo el N.º de GTF, el N.º de LT vinculado y un
 * resumen por especie (trozas, m³ y bloque); queda como PENDIENTE hasta que la
 * guía se registre en SERFOR y en el libro, o se anule.
 *
 * Lo que NO hace, a propósito: tocar el freno legal. T6, la cascada y
 * `enforceT6EnLote` siguen midiendo sólo lo registrado. Lo preliminar se
 * muestra APARTE, como un KPI: «Preliminar» y «Saldo si se registran»
 * (= lo que queda hoy − lo preliminar pendiente), con la misma tolerancia del
 * freno (`excedeTechoM3`) para pintar rojo lo que quedaría negativo.
 *
 * Una preliminar NO descuenta si:
 *   · está «registrada» o «anulada»;
 *   · su N.º ya está en el libro (de este plan, o sin plan: lo sin plan ya
 *     cuenta en el saldo de cada plan): descontarla otra vez la contaría dos.
 *
 * Puro: sin base ni React (lo usan la ruta, la clase de la base y la pantalla:
 * el servidor calcula, la ventana sólo previsualiza con las mismas funciones).
 */
import { z } from "zod";
import { claveNumeroGtf } from "./gtf-talonario";
import { claveEspecie } from "./loth-constants";
import { excedeTechoM3 } from "./loth-t6";

export const MAX_LINEAS_PRELIMINAR = 30;
export const MAX_PRELIMINARES_POR_PLAN = 500;
export const MAX_HISTORIAL_PRELIMINAR = 30;

export const ESTADOS_PRELIMINAR = ["pendiente", "registrada", "anulada"] as const;
export type EstadoPreliminar = (typeof ESTADOS_PRELIMINAR)[number];

/* `|| 0`: un −0,0004 redondea a −0 y la tarjeta decía «-0.000 m³». */
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000 || 0;

const fechaValida = (s: string) => {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Una fila del resumen: lo que trajo la guía de una especie en un bloque. */
export const lineaPreliminarSchema = z
  .object({
    especie: z.string({ error: "Elige la especie de cada fila." }).trim().min(1, "Elige la especie de cada fila.").max(200),
    trozas: z.number({ error: "Las trozas van en número." }).int("Las trozas van en número entero.").min(0, "Las trozas no pueden ser negativas.").max(99_999),
    m3: z.number({ error: "Los m³ van en número." }).finite().positive("Los m³ van mayores que cero.").max(100_000, "Revisa los m³: pasan de 100 000."),
    bloque: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

/** Lo que manda la ventana (alta y corrección). */
export const datosPreliminarSchema = z
  .object({
    numeroGtf: z.string({ error: "Escribe el N.º de la GTF." }).trim().min(1, "Escribe el N.º de la GTF.").max(40, "El N.º de la GTF es muy largo."),
    numeroLt: z.string({ error: "Escribe el N.º de la LT vinculada." }).trim().min(1, "Escribe el N.º de la LT vinculada.").max(40, "El N.º de la LT es muy largo."),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.").refine(fechaValida, "Esa fecha no existe.").nullable().optional(),
    lineas: z.array(lineaPreliminarSchema, { error: "Agrega al menos una especie." }).min(1, "Agrega al menos una especie.").max(MAX_LINEAS_PRELIMINAR, `Hasta ${MAX_LINEAS_PRELIMINAR} filas por guía.`),
    nota: z.string().trim().max(500, "La nota es muy larga (máximo 500 letras).").nullable().optional(),
  })
  .strict();

export type DatosPreliminar = z.infer<typeof datosPreliminarSchema>;

export interface LineaPreliminar {
  /** El nombre como está en el plan (el de la resolución). */
  especie: string;
  trozas: number;
  /** A 3 decimales. */
  m3: number;
  /** El nombre del bloque del plan; `null` = el plan no tiene bloques. */
  bloque: string | null;
}

export interface CambioPreliminar {
  at: string;
  por: string;
  que: string;
}

export interface GtfPreliminar {
  id: string;
  numeroGtf: string;
  numeroLt: string;
  /** AAAA-MM-DD; `null` = no se anotó. */
  fecha: string | null;
  lineas: LineaPreliminar[];
  nota: string | null;
  estado: EstadoPreliminar;
  motivoAnulacion: string | null;
  /** La guía del libro con la que se dio por registrada, si se encontró. */
  gtfId: string | null;
  creadaPor: string;
  creadaAt: string;
  cambiadaPor: string | null;
  cambiadaAt: string | null;
  /** Lo que se le hizo (lo más nuevo al final, tope 30): nada se borra sin dejar rastro. */
  historial: CambioPreliminar[];
}

/** Los datos ya cruzados con el plan: especie con su nombre del plan, bloque elegido, m³ a 3 decimales. */
export interface DatosListos {
  numeroGtf: string;
  numeroLt: string;
  fecha: string | null;
  lineas: LineaPreliminar[];
  nota: string | null;
}

/** Lo guardado se vuelve a validar al leer: un valor roto no llega a la pantalla. */
export const gtfPreliminarGuardadaSchema = z.object({
  id: z.string().min(1),
  numeroGtf: z.string().min(1),
  numeroLt: z.string(),
  fecha: z.string().nullable(),
  lineas: z.array(z.object({ especie: z.string().min(1), trozas: z.number(), m3: z.number(), bloque: z.string().nullable() })),
  nota: z.string().nullable(),
  estado: z.enum(ESTADOS_PRELIMINAR),
  motivoAnulacion: z.string().nullable(),
  gtfId: z.string().nullable(),
  creadaPor: z.string(),
  creadaAt: z.string(),
  cambiadaPor: z.string().nullable(),
  cambiadaAt: z.string().nullable(),
  historial: z.array(z.object({ at: z.string(), por: z.string(), que: z.string() })),
});

/** La clave de un N.º de guía: «001-0000123» ≡ «1-123» (`claveNumeroGtf`); si no tiene tramos, el texto sin espacios. */
export function claveDeNumeroGtf(numero: string | null | undefined): string | null {
  const t = (numero ?? "").trim();
  if (!t) return null;
  return claveNumeroGtf(t) ?? t.replace(/\s+/g, "").toUpperCase();
}

const enUnaLinea = (s: string) => s.replace(/\s+/g, " ").trim();

export type Preparado = { ok: true; datos: DatosListos } | { ok: false; mensaje: string };

/**
 * Cruza lo que mandó la ventana con el plan: cada especie tiene que estar en el
 * plan (por `claveEspecie`: «Tornillo» ≡ «Tornillo (Cedrelinga catenaeformis)»)
 * y se guarda con el nombre del plan; el bloque es obligatorio si el plan tiene
 * más de uno, es ése solo si tiene uno, y no va si no tiene.
 */
export function prepararPreliminar(datos: DatosPreliminar, especiesDelPlan: readonly { speciesCommon: string }[], bloques: readonly string[]): Preparado {
  if (especiesDelPlan.length === 0) return { ok: false, mensaje: "Este plan no tiene especies cargadas: cárgalas primero en «Especies»." };
  const especieDe = new Map(especiesDelPlan.map((e) => [claveEspecie(e.speciesCommon), e.speciesCommon.trim()]));
  const bloqueDe = new Map(bloques.map((b) => [b.trim().toLowerCase(), b.trim()]));
  const lineas: LineaPreliminar[] = [];
  const vistas = new Set<string>();
  for (const l of datos.lineas) {
    const especie = especieDe.get(claveEspecie(l.especie));
    if (!especie) return { ok: false, mensaje: `«${l.especie.trim()}» no está en las especies de este plan.` };
    let bloque: string | null = null;
    if (bloques.length === 1) bloque = bloques[0]!.trim();
    else if (bloques.length > 1) {
      const pedido = (l.bloque ?? "").trim();
      if (!pedido) return { ok: false, mensaje: `Elige el bloque de ${especie}: el plan tiene ${bloques.length}.` };
      bloque = bloqueDe.get(pedido.toLowerCase()) ?? null;
      if (!bloque) return { ok: false, mensaje: `El bloque «${pedido}» no está en este plan.` };
    }
    const k = `${claveEspecie(especie)}|${(bloque ?? "").toLowerCase()}`;
    if (vistas.has(k)) return { ok: false, mensaje: `${especie}${bloque ? ` (${bloque})` : ""} está dos veces: deja una sola fila y suma ahí.` };
    vistas.add(k);
    const m3 = r3(l.m3);
    if (m3 <= 0) return { ok: false, mensaje: `Los m³ de ${especie} van mayores que cero.` };
    lineas.push({ especie, trozas: l.trozas, m3, bloque });
  }
  const nota = datos.nota ? enUnaLinea(datos.nota) : "";
  return {
    ok: true,
    datos: { numeroGtf: enUnaLinea(datos.numeroGtf), numeroLt: enUnaLinea(datos.numeroLt), fecha: datos.fecha ?? null, lineas, nota: nota || null },
  };
}

/** La preliminar VIVA (no anulada) del plan con el mismo N.º de GTF, salvo `exceptoId`. */
export function preliminarRepetida(guias: readonly GtfPreliminar[], numeroGtf: string, exceptoId?: string): GtfPreliminar | null {
  const k = claveDeNumeroGtf(numeroGtf);
  if (!k) return null;
  return guias.find((g) => g.id !== exceptoId && g.estado !== "anulada" && claveDeNumeroGtf(g.numeroGtf) === k) ?? null;
}

/** Una guía del libro (viva, no anulada) de este plan o sin plan. */
export interface GuiaDelLibro {
  id: string | null;
  gtfNumber: string;
  planId: string | null;
}

export interface EnElLibro {
  /** `null` = el saldo la cuenta (despacho con el N.º escrito en el libro) pero no tiene su guía guardada. */
  gtfId: string | null;
  gtfNumber: string;
  /** La guía del libro no tiene plan: igual ya cuenta en el saldo (ADR-459), pero falta atarla. */
  sinPlan: boolean;
}

/** La guía del libro con ese N.º: primero la de este plan (inequívoca), si no, la sin plan. */
export function guiaDelLibroDe(numeroGtf: string, guias: readonly GuiaDelLibro[], planId: string): EnElLibro | null {
  const k = claveDeNumeroGtf(numeroGtf);
  if (!k) return null;
  const mismas = guias.filter((g) => claveDeNumeroGtf(g.gtfNumber) === k);
  const delPlan = mismas.find((g) => g.planId === planId);
  if (delPlan) return { gtfId: delPlan.id, gtfNumber: delPlan.gtfNumber, sinPlan: false };
  const suelta = mismas.find((g) => g.planId == null);
  return suelta ? { gtfId: suelta.id, gtfNumber: suelta.gtfNumber, sinPlan: true } : null;
}

/** La preliminar como la ve la pantalla. */
export interface GtfPreliminarVista extends GtfPreliminar {
  enElLibro: EnElLibro | null;
  /** ¿Descuenta en «Saldo si se registran»? Pendiente y todavía no en el libro. */
  cuenta: boolean;
  trozas: number;
  m3: number;
}

export function aVista(g: GtfPreliminar, enElLibro: EnElLibro | null): GtfPreliminarVista {
  return {
    ...g,
    enElLibro,
    cuenta: g.estado === "pendiente" && enElLibro == null,
    trozas: g.lineas.reduce((a, l) => a + l.trozas, 0),
    m3: r3(g.lineas.reduce((a, l) => a + l.m3, 0)),
  };
}

/** Lo que el saldo dice de una especie (la forma de `SaldoDeEspecie`). */
export interface EspecieDelSaldo {
  clave: string;
  especie: string;
  autorizadoM3: number | null;
  usadoM3: number;
  quedaM3: number | null;
}

export interface PreliminarDeEspecie {
  clave: string;
  especie: string;
  trozas: number;
  m3: number;
  autorizadoM3: number | null;
  /** Lo que queda hoy (lo que mide el freno). `null` = sin techo. */
  quedaM3: number | null;
  /** quedaM3 − lo preliminar; `null` sin techo; negativo = se pasaría. */
  quedaSiSeRegistranM3: number | null;
  /** Lo usado + lo preliminar pasa el techo (`excedeTechoM3`, a 3 decimales como el freno). */
  excede: boolean;
  porBloque: { bloque: string; trozas: number; m3: number }[];
}

/** Las filas de las preliminares que descuentan, salvo la de `exceptoId` (la que se está corrigiendo). */
export function lineasQueCuentan(guias: readonly Pick<GtfPreliminarVista, "id" | "cuenta" | "lineas">[], exceptoId?: string): LineaPreliminar[] {
  return guias.filter((g) => g.cuenta && g.id !== exceptoId).flatMap((g) => g.lineas);
}

/** Lo preliminar por especie (sólo las que tienen algo), con el saldo si se registran. */
export function preliminarPorEspecie(especies: readonly EspecieDelSaldo[], lineas: readonly LineaPreliminar[]): PreliminarDeEspecie[] {
  const delSaldo = new Map(especies.map((e) => [e.clave || claveEspecie(e.especie), e]));
  const grupos = new Map<string, { especie: string; trozas: number; m3: number; bloques: Map<string, { bloque: string; trozas: number; m3: number }> }>();
  for (const l of lineas) {
    const k = claveEspecie(l.especie);
    if (!k) continue;
    const g = grupos.get(k) ?? { especie: delSaldo.get(k)?.especie ?? l.especie, trozas: 0, m3: 0, bloques: new Map() };
    g.trozas += l.trozas;
    g.m3 = r3(g.m3 + l.m3);
    if (l.bloque) {
      const b = g.bloques.get(l.bloque) ?? { bloque: l.bloque, trozas: 0, m3: 0 };
      b.trozas += l.trozas;
      b.m3 = r3(b.m3 + l.m3);
      g.bloques.set(l.bloque, b);
    }
    grupos.set(k, g);
  }
  return [...grupos.entries()].map(([clave, g]) => {
    const s = delSaldo.get(clave);
    const conTecho = s?.autorizadoM3 != null && s.quedaM3 != null;
    return {
      clave,
      especie: g.especie,
      trozas: g.trozas,
      m3: g.m3,
      autorizadoM3: s?.autorizadoM3 ?? null,
      quedaM3: conTecho ? s!.quedaM3 : null,
      quedaSiSeRegistranM3: conTecho ? r3((s!.quedaM3 as number) - g.m3) : null,
      excede: conTecho ? excedeTechoM3(s!.usadoM3 + g.m3, s!.autorizadoM3 as number) : false,
      porBloque: [...g.bloques.values()].sort((x, y) => x.bloque.localeCompare(y.bloque, "es", { numeric: true })),
    };
  });
}

export interface ResumenPreliminares {
  /** Preliminares que descuentan (pendientes y no en el libro). */
  guias: number;
  trozas: number;
  m3: number;
  /** Pendientes cuyo N.º ya está en el libro: falta sólo confirmarlas. */
  enElLibro: number;
  /** Lo que queda hoy en las especies con techo; `null` = el plan no tiene techo. */
  quedaTotalM3: number | null;
  quedaSiSeRegistranTotalM3: number | null;
  /** Alguna especie se pasaría si se registran. */
  excede: boolean;
}

/** Lo que va en `GET /loth/saldo-plan?planId=…&preliminares=1` (lo calcula el servidor). */
export interface PreliminaresDelPlan {
  /** Las más nuevas primero: pendientes, registradas y anuladas (nada se esconde). */
  guias: GtfPreliminarVista[];
  resumen: ResumenPreliminares;
  porEspecie: PreliminarDeEspecie[];
  /** Los bloques del plan, por nombre: la ventana los ofrece si hay más de uno. */
  bloques: string[];
}

/** El KPI de arriba y la columna por especie, del saldo del plan y sus preliminares (lo calcula el servidor). */
export function resumirPreliminares(
  saldo: { especies: readonly EspecieDelSaldo[]; total: { quedaM3: number }; sinTecho: boolean },
  guias: readonly GtfPreliminarVista[],
): { resumen: ResumenPreliminares; porEspecie: PreliminarDeEspecie[] } {
  const cuentan = guias.filter((g) => g.cuenta);
  const porEspecie = preliminarPorEspecie(saldo.especies, lineasQueCuentan(cuentan));
  const conTechoM3 = porEspecie.filter((e) => e.quedaM3 != null).reduce((a, e) => a + e.m3, 0);
  return {
    resumen: {
      guias: cuentan.length,
      trozas: cuentan.reduce((a, g) => a + g.trozas, 0),
      m3: r3(cuentan.reduce((a, g) => a + g.m3, 0)),
      enElLibro: guias.filter((g) => g.estado === "pendiente" && g.enElLibro != null).length,
      quedaTotalM3: saldo.sinTecho ? null : r3(saldo.total.quedaM3),
      quedaSiSeRegistranTotalM3: saldo.sinTecho ? null : r3(saldo.total.quedaM3 - conTechoM3),
      excede: porEspecie.some((e) => e.excede),
    },
    porEspecie,
  };
}

/**
 * La vista previa de la ventana: cómo quedarían las especies de ESTA guía si se
 * registran todas las pendientes más ésta (sin contarla dos veces al corregirla).
 */
export function previsualizarGuia(
  especies: readonly EspecieDelSaldo[],
  guias: readonly Pick<GtfPreliminarVista, "id" | "cuenta" | "lineas">[],
  lineasNuevas: readonly LineaPreliminar[],
  exceptoId?: string,
): PreliminarDeEspecie[] {
  const propias = new Set(lineasNuevas.map((l) => claveEspecie(l.especie)));
  return preliminarPorEspecie(especies, [...lineasQueCuentan(guias, exceptoId), ...lineasNuevas]).filter((e) => propias.has(e.clave));
}

/** Lo que va en la lista de observaciones del plan mientras la preliminar siga pendiente. */
export function avisoDePreliminar(g: Pick<GtfPreliminarVista, "numeroGtf" | "numeroLt" | "estado" | "enElLibro">): string | null {
  if (g.estado !== "pendiente") return null;
  if (g.enElLibro && !g.enElLibro.sinPlan) return `GTF ${g.numeroGtf} (LT ${g.numeroLt}): ya está en el libro; confírmala como registrada.`;
  if (g.enElLibro) return `GTF ${g.numeroGtf} (LT ${g.numeroLt}): ya está en el libro pero sin plan; átala a este plan y confírmala.`;
  return `GTF ${g.numeroGtf} (LT ${g.numeroLt}): falta registrarla en SERFOR y en el libro.`;
}

/** «Tornillo 30 trozas · 20.000 m³ (Bloque 1)», para la lista y la bitácora. */
export function resumenDeLineas(lineas: readonly LineaPreliminar[], fmt: (m3: number) => string = (m) => m.toFixed(3)): string {
  return lineas.map((l) => `${l.especie} ${l.trozas} ${l.trozas === 1 ? "troza" : "trozas"} · ${fmt(l.m3)} m³${l.bloque ? ` (${l.bloque})` : ""}`).join("; ");
}

// ── Cambios sobre la lista (puros: la clase de la base los aplica bajo candado) ──

export type Resultado<T> = { ok: true; lista: GtfPreliminar[]; guia: GtfPreliminar } & T | { ok: false; status: 404 | 409; codigo: string; mensaje: string };

const conCambio = (g: GtfPreliminar, por: string, at: string, que: string): GtfPreliminar => ({
  ...g,
  cambiadaPor: por,
  cambiadaAt: at,
  historial: [...g.historial, { at, por, que }].slice(-MAX_HISTORIAL_PRELIMINAR),
});

/** El 409 de un N.º repetido, legible. */
function repetida(existe: GtfPreliminar): { ok: false; status: 409; codigo: string; mensaje: string } {
  return {
    ok: false,
    status: 409,
    codigo: "preliminar_repetida",
    mensaje: `La GTF ${existe.numeroGtf} ya está anotada en este plan (${existe.estado}). Corrígela en vez de anotarla otra vez.`,
  };
}

/** Alta. Si el N.º ya está en el libro de este plan, nace «registrada» (y se dice). */
export function agregarPreliminar(
  lista: readonly GtfPreliminar[],
  datos: DatosListos,
  ctx: { id: string; por: string; at: string; enElLibro: EnElLibro | null },
): Resultado<{ yaEnElLibro: boolean }> {
  const existe = preliminarRepetida(lista, datos.numeroGtf);
  if (existe) return repetida(existe);
  if (lista.filter((g) => g.estado !== "anulada").length >= MAX_PRELIMINARES_POR_PLAN) {
    return { ok: false, status: 409, codigo: "tope", mensaje: `Este plan ya tiene ${MAX_PRELIMINARES_POR_PLAN} preliminares vivas: registra o anula algunas primero.` };
  }
  const yaEnElLibro = ctx.enElLibro != null && !ctx.enElLibro.sinPlan;
  const guia: GtfPreliminar = {
    id: ctx.id,
    ...datos,
    estado: yaEnElLibro ? "registrada" : "pendiente",
    motivoAnulacion: null,
    gtfId: yaEnElLibro ? ctx.enElLibro!.gtfId : null,
    creadaPor: ctx.por,
    creadaAt: ctx.at,
    cambiadaPor: null,
    cambiadaAt: null,
    historial: [{ at: ctx.at, por: ctx.por, que: yaEnElLibro ? "Anotada; su N.º ya estaba en el libro: quedó registrada" : "Anotada como pendiente" }],
  };
  return { ok: true, lista: [guia, ...lista], guia, yaEnElLibro };
}

/** Corrección de N.º, LT, fecha, filas o nota. Una anulada no se corrige. */
export function corregirPreliminar(
  lista: readonly GtfPreliminar[],
  id: string,
  datos: DatosListos,
  ctx: { por: string; at: string; enElLibro: EnElLibro | null },
): Resultado<{ yaEnElLibro: boolean }> {
  const actual = lista.find((g) => g.id === id);
  if (!actual) return { ok: false, status: 404, codigo: "no_encontrada", mensaje: "No encontramos esa GTF preliminar en este plan." };
  if (actual.estado === "anulada") return { ok: false, status: 409, codigo: "anulada", mensaje: `La GTF ${actual.numeroGtf} está anulada: no se corrige.` };
  const existe = preliminarRepetida(lista, datos.numeroGtf, id);
  if (existe) return repetida(existe);
  const yaEnElLibro = actual.estado === "pendiente" && ctx.enElLibro != null && !ctx.enElLibro.sinPlan;
  const que = [
    actual.numeroGtf !== datos.numeroGtf ? `N.º ${actual.numeroGtf} → ${datos.numeroGtf}` : null,
    actual.numeroLt !== datos.numeroLt ? `LT ${actual.numeroLt} → ${datos.numeroLt}` : null,
    JSON.stringify(actual.lineas) !== JSON.stringify(datos.lineas) ? "corrigió las especies" : null,
    actual.fecha !== datos.fecha ? "fecha" : null,
    actual.nota !== datos.nota ? "nota" : null,
    yaEnElLibro ? "su N.º ya estaba en el libro: quedó registrada" : null,
  ].filter(Boolean);
  const guia = conCambio(
    {
      ...actual,
      ...datos,
      estado: yaEnElLibro ? "registrada" : actual.estado,
      gtfId: yaEnElLibro ? ctx.enElLibro!.gtfId : actual.gtfId,
    },
    ctx.por,
    ctx.at,
    `Corrigió: ${que.join(", ") || "sin cambios"}`,
  );
  return { ok: true, lista: lista.map((g) => (g.id === id ? guia : g)), guia, yaEnElLibro };
}

export type AccionDeEstado = { accion: "registrada"; gtfId?: string | null } | { accion: "anular"; motivo: string } | { accion: "pendiente" };

/** «Ya la registré», «Anular» (con motivo, baja lógica) o «Volver a pendiente» (deshacer un «ya la registré»). */
export function cambiarEstadoPreliminar(
  lista: readonly GtfPreliminar[],
  id: string,
  a: AccionDeEstado,
  ctx: { por: string; at: string },
): Resultado<object> {
  const actual = lista.find((g) => g.id === id);
  if (!actual) return { ok: false, status: 404, codigo: "no_encontrada", mensaje: "No encontramos esa GTF preliminar en este plan." };
  if (actual.estado === "anulada") return { ok: false, status: 409, codigo: "anulada", mensaje: `La GTF ${actual.numeroGtf} ya está anulada.` };
  let guia: GtfPreliminar;
  if (a.accion === "registrada") {
    if (actual.estado === "registrada") return { ok: false, status: 409, codigo: "ya_registrada", mensaje: `La GTF ${actual.numeroGtf} ya está registrada.` };
    guia = conCambio({ ...actual, estado: "registrada", gtfId: a.gtfId ?? actual.gtfId }, ctx.por, ctx.at, "La marcó como registrada en SERFOR y en el libro");
  } else if (a.accion === "anular") {
    guia = conCambio({ ...actual, estado: "anulada", motivoAnulacion: a.motivo }, ctx.por, ctx.at, `La anuló: ${a.motivo}`);
  } else {
    if (actual.estado === "pendiente") return { ok: false, status: 409, codigo: "ya_pendiente", mensaje: `La GTF ${actual.numeroGtf} ya está pendiente.` };
    guia = conCambio({ ...actual, estado: "pendiente", gtfId: null }, ctx.por, ctx.at, "La volvió a pendiente");
  }
  return { ok: true, lista: lista.map((g) => (g.id === id ? guia : g)), guia };
}
