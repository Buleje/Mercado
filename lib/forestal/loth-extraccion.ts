/**
 * loth-extraccion — la vista «Extracción» del Libro TH (ADR-454): el permiso
 * de punta a punta, del censo al aserrado, con un saldo por operación.
 *
 * La regla que manda todo el archivo: la MISMA madera se asienta en tala, en
 * trozado y en despacho. Cada operación se suma por separado, su saldo es
 * `base − esa operación` y cada troza cae en UNA sola salida (despachada,
 * consumida en el TH o todavía en el monte). Así `desp + cons + monte =
 * trozado` sale exacto, troza por troza.
 *
 *  · Base = censo aprovechable: censado − semilleros (regente + POA) − bajo
 *    DMC / sin DAP / descartados. **Incluye lo ya talado**: `analizarPoa` saca
 *    lo talado de «aprovechable» (sirve para «qué queda»), así que acá su
 *    categoría `talado` vuelve a la base — la base no se achica al talar.
 *  · El m³ de un despacho es el de SU trozado: la línea de despacho no trae m³.
 *  · Sólo líneas `registrado`, hasta `hasta` (acumulado, no del período).
 *  · Fechas del libro = día UTC (date-only); «hoy» = día de Lima.
 *
 * PURO y client-safe: sin `Date.now` (el `hoy` entra por parámetro), sin
 * `lib/db`. Lo llama `ForestPlanDB.extraccion` y lo prueban los tests.
 */

import { analizarPoa, type PoaConfig } from "./loth-poa";
import {
  claveEspecie,
  computeBalance,
  cruzarEspecies,
  projectSaldo,
  type BalanceMovement,
  type BalanceSpeciesInput,
} from "./loth-constants";
import { estadoDeArboles, type EtapaArbol, type LineaParaEtapa, type TipoAviso } from "./loth-etapa-arbol";
import { analizarZafra } from "./loth-zafra";
import { permisoGemeloDelPlan } from "./loth-plan-permiso";
import { claveDeCodigo } from "./loth-placa";
import { arbolDeTroza } from "./loth-censo-uso";
import { normalizarCondicion } from "./loth-mapa-arboles";
import { ptAserrableDeRolliza } from "./loth-restante";
import { limaDateKey } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  DIAS_MINIMOS_PARA_RITMO,
  TOLERANCIA_M3,
  UMBRAL_AVISO_PCT,
  UMBRAL_TOPE_PCT,
  type AvisoExtraccion,
  type BaseDelTope,
  type CensoFila,
  type EtapaEmbudo,
  type ExtraccionResponse,
  type FilaExtraccion,
  type KpisExtraccion,
  type PasoCadena,
  type PermisoExtraccion,
  type SaldoContra,
  type SemanaExtraccion,
  type Suma,
  type VentanaExtraccion,
} from "./loth-extraccion-tipos";

// ─── Constantes ──────────────────────────────────────────────────────────────

/** `?planId=sin-plan` pide sólo las líneas que no tienen plan ni árbol en un censo. */
export const PLAN_ID_SIN_PLAN = "sin-plan";
/** Topes de lectura (los de `ForestLothDB.estadoDeArboles`). */
export const TOPE_ARBOLES = 20_000;
export const TOPE_LINEAS = 50_000;
/** Secciones que lee la vista: la cadena de la troza y el producto (sólo para el saldo autorizado). */
export const SECCIONES_EXTRACCION = ["tala", "trozado", "despacho_troza", "consumo_troza", "despacho_producto"] as const;
/** Cinco años de semanas: más es ruido en un gráfico y una respuesta pesada. */
const MAX_SEMANAS = 260;
const CLAVE_SIN_ESPECIE = "sin-especie";
const DIA_MS = 86_400_000;

const r4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const r2 = (n: number): number => Math.round(n * 100) / 100;
const m3 = (n: number): string => formatNumber(n, 3);
const pctTxt = (n: number): string => formatNumber(n, 1);
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

// ─── Entrada ─────────────────────────────────────────────────────────────────

export interface EspecieAutorizada {
  speciesCommon: string;
  cites: boolean;
  volumenAutorizadoM3: number;
  arbolesAutorizados: number | null;
}

/** Un plan de manejo vivo (`ForestPlan`), con lo que la vista necesita. Fechas `AAAA-MM-DD`. */
export interface PlanDeExtraccion {
  id: string;
  planNumber: string | null;
  planType: string | null;
  titular: string | null;
  alias: string | null;
  estado: string | null;
  tituloHabilitante: string | null;
  contratoId: string | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  areaHa: number | null;
  /** La config guardada del POA (`ForestLothPoaDB.get`); `configurado=false` = el 10 % por defecto. */
  poa: { config: PoaConfig; configurado: boolean };
  especies: EspecieAutorizada[];
}

/** Un permiso vivo (`ForestContrato`). */
export interface PermisoDeExtraccion {
  id: string;
  codigo: string;
  codigoNorm: string | null;
  planId: string | null;
}

export interface ArbolDeExtraccion {
  id: string;
  planId: string;
  treeCode: string;
  speciesCommon: string;
  cites: boolean;
  dapM: number | null;
  volumenEstimadoM3: number | null;
  /** en_pie | talado | descartado (lo que dice el CENSO). */
  estado: string;
  condicion: string | null;
}

export interface LineaDeExtraccion {
  id: string;
  planId: string | null;
  section: string;
  /** registrado | anulado — las anuladas sólo explican avisos del censo, no suman. */
  status: string;
  lineNo: number;
  entryDate: Date | string;
  treeCode: string | null;
  trozaCode: string | null;
  speciesCommon: string | null;
  cites: boolean;
  volumeM3: number | null;
  quantity: number | null;
  unit: string | null;
  gtfNumber: string | null;
}

/** Una troza del Libro CTP que guarda su línea de Trozado (ADR-450), ya filtrada: recibida y de un ingreso vivo. */
export interface RecepcionDeExtraccion {
  lothTrozadoId: string;
  volumenM3: number | null;
  /** Consumida por una corrida viva (`ForestCtpEntry` sin borrar ni anular). */
  aserrada: boolean;
}

export interface EntradaExtraccion {
  /** El instante de la consulta: su día de Lima es «hoy». Nunca `Date.now()` adentro. */
  hoy: Date;
  alcance: { planId: string | null; contratoId: string | null };
  /** Ids de los planes que se devuelven; `null` = todos. La atribución usa SIEMPRE todos los censos. */
  planesEnAlcance: readonly string[] | null;
  /** ¿Va la fila «Sin plan»? (vista «Todos» o `planId=sin-plan`). */
  conSinPlan: boolean;
  /** Se pidió un permiso que no tiene plan: se dice con un aviso. */
  permisoSinPlan?: { contratoId: string; codigo: string } | null;
  /** TODOS los planes vivos del negocio (para atribuir las líneas sin plan por su árbol). */
  planes: readonly PlanDeExtraccion[];
  permisos: readonly PermisoDeExtraccion[];
  arboles: readonly ArbolDeExtraccion[];
  lineas: readonly LineaDeExtraccion[];
  recepciones: readonly RecepcionDeExtraccion[];
  desde?: string | null;
  hasta?: string | null;
  antDesde?: string | null;
  antHasta?: string | null;
  limites: { arbolesLeidos: number; lineasLeidas: number; truncado: boolean };
}

// ─── Días ────────────────────────────────────────────────────────────────────

/** El día de una fecha date-only del libro: se lee en UTC (medianoche UTC = ese día). */
export function diaUtc(v: Date | string | null | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const msDeDia = (d: string): number => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const sumarDias = (d: string, n: number): string => new Date(msDeDia(d) + n * DIA_MS).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string): number => Math.round((msDeDia(b) - msDeDia(a)) / DIA_MS);

/** El lunes de la semana de un día (`AAAA-MM-DD`). */
export function lunesDe(dia: string): string {
  const dow = new Date(msDeDia(dia)).getUTCDay();
  return sumarDias(dia, -((dow + 6) % 7));
}

// ─── Sumas ───────────────────────────────────────────────────────────────────

const sumaVacia = (): Suma => ({ m3: 0, n: 0, sinVolumen: 0 });

function contar(s: Suma, v: number | null): void {
  s.n += 1;
  if (v == null) s.sinVolumen += 1;
  else s.m3 += v;
}

function agregar(a: Suma, b: Suma): void {
  a.m3 += b.m3;
  a.n += b.n;
  a.sinVolumen += b.sinVolumen;
}

const cerrar = (s: Suma): Suma => ({ m3: r4(s.m3), n: s.n, sinVolumen: s.sinVolumen });

// ─── Plan ↔ permiso ──────────────────────────────────────────────────────────

/**
 * El permiso del plan: el que guarda el plan (`contratoId`), si no el que
 * apunta al plan (`ForestContrato.planId`), si no el gemelo por código
 * (sugerido: nunca se escribe).
 */
export function permisoDelPlan(
  plan: Pick<PlanDeExtraccion, "id" | "contratoId" | "planNumber" | "tituloHabilitante">,
  permisos: readonly PermisoDeExtraccion[],
): PermisoExtraccion["permiso"] {
  if (plan.contratoId) {
    const p = permisos.find((x) => x.id === plan.contratoId);
    if (p) return { contratoId: p.id, codigo: p.codigo, vinculo: "plan" };
  }
  const porPermiso = permisos.find((x) => x.planId === plan.id);
  if (porPermiso) return { contratoId: porPermiso.id, codigo: porPermiso.codigo, vinculo: "permiso" };
  const gemelo = permisoGemeloDelPlan(plan, permisos);
  return gemelo ? { contratoId: gemelo.id, codigo: gemelo.codigo, vinculo: "gemelo" } : null;
}

// ─── Atribuir las líneas ─────────────────────────────────────────────────────

export interface TalaAtribuida {
  planId: string | null;
  /** Clave del árbol (`claveDeCodigo`), o `#id` si la línea no trae código. */
  arbol: string;
  especie: string;
  etiqueta: string;
  cites: boolean;
  dia: string;
  m3: number | null;
}

export interface TrozaAtribuida {
  planId: string | null;
  clave: string;
  arbol: string;
  especie: string;
  etiqueta: string;
  cites: boolean;
  dia: string;
  m3: number | null;
  /** Id de la línea de Trozado: lo que guarda la troza del CTP (ADR-450). */
  trozadoId: string;
  salida: "despacho" | "consumo" | null;
  diaSalida: string | null;
}

/** Un despacho o consumo de una troza que no tiene su línea de Trozado (T2 lo impide al guardar). */
export interface SalidaSinTrozado {
  planId: string | null;
  troza: string;
  seccion: "despacho" | "consumo";
  especie: string;
  etiqueta: string;
  dia: string;
  m3: number | null;
}

export interface ProductoDespachado {
  planId: string | null;
  especie: string;
  etiqueta: string;
  m3: number;
  dia: string;
}

export interface LineasAtribuidas {
  talas: TalaAtribuida[];
  trozas: TrozaAtribuida[];
  salidasSinTrozado: SalidaSinTrozado[];
  productos: ProductoDespachado[];
  /** Líneas (vivas y anuladas, hasta `hasta`) por plan, para la etapa de cada árbol. `""` = sin plan. */
  lineasDelPlan: Map<string, LineaDeExtraccion[]>;
  /** Líneas vivas de la cadena que no tienen plan ni árbol en un censo; `ambiguas` = el árbol está en 2+ censos. */
  sinPlan: { lineas: number; ambiguas: number };
}

const orden = (a: LineaDeExtraccion, b: LineaDeExtraccion): number =>
  diaUtc(a.entryDate).localeCompare(diaUtc(b.entryDate)) || a.lineNo - b.lineNo || a.id.localeCompare(b.id);

/**
 * Cada línea viva a su plan, y cada troza a UNA salida.
 *
 * Plan de una línea: su `planId` (si es un plan vivo); si no, el plan cuyo
 * censo tiene su árbol (si está en dos censos, ninguno: se dice). Una salida
 * (despacho o consumo) sigue a SU troza: el plan y la especie del trozado. Así
 * la identidad `desp + cons + monte = trozado` vale también por plan.
 */
export function atribuirLineas(
  planes: readonly Pick<PlanDeExtraccion, "id">[],
  arboles: readonly ArbolDeExtraccion[],
  lineas: readonly LineaDeExtraccion[],
  hasta: string,
): LineasAtribuidas {
  const planesVivos = new Set(planes.map((p) => p.id));
  /** clave del árbol → planes cuyo censo lo tiene. */
  const planesDelArbol = new Map<string, Set<string>>();
  /** `${plan}|${clave}` → árbol del censo. */
  const arbolDe = new Map<string, ArbolDeExtraccion>();
  for (const a of arboles) {
    // El censo de un plan dado de baja sigue vivo (`eliminarPlan` no lo borra): si contara,
    // sus líneas irían a un plan que no se muestra y no aparecerían ni en «Sin plan».
    if (!planesVivos.has(a.planId)) continue;
    const k = claveDeCodigo(a.treeCode);
    if (!k) continue;
    const set = planesDelArbol.get(k) ?? new Set<string>();
    set.add(a.planId);
    planesDelArbol.set(k, set);
    if (!arbolDe.has(`${a.planId}|${k}`)) arbolDe.set(`${a.planId}|${k}`, a);
  }

  let ambiguas = 0;
  const planPorArbol = (clave: string, contarAmbigua = true): string | null => {
    const set = clave ? planesDelArbol.get(clave) : undefined;
    if (!set || set.size === 0) return null;
    if (set.size > 1) {
      if (contarAmbigua) ambiguas += 1;
      return null;
    }
    return [...set][0];
  };
  const planDeLinea = (l: LineaDeExtraccion, arbol: string): string | null =>
    l.planId && planesVivos.has(l.planId) ? l.planId : planPorArbol(arbol);

  const dentro = lineas.filter((l) => {
    const d = diaUtc(l.entryDate);
    return d !== "" && d <= hasta;
  });
  const vivas = dentro.filter((l) => l.status === "registrado").sort(orden);
  const lineasDelPlan = new Map<string, LineaDeExtraccion[]>();
  const alPlan = (plan: string | null, l: LineaDeExtraccion) => {
    const k = plan ?? "";
    const lista = lineasDelPlan.get(k);
    if (lista) lista.push(l);
    else lineasDelPlan.set(k, [l]);
  };

  // 1. Tala: la primera viva de cada árbol (T3).
  const talas: TalaAtribuida[] = [];
  const talaDe = new Map<string, TalaAtribuida>();
  for (const l of vivas) {
    if (l.section !== "tala") continue;
    const codigo = l.treeCode?.trim() ?? "";
    const arbol = (codigo && claveDeCodigo(codigo)) || `#${l.id}`;
    const planId = planDeLinea(l, codigo ? arbol : "");
    alPlan(planId, l);
    const key = `${planId ?? ""}|${arbol}`;
    if (talaDe.has(key)) continue;
    const censo = planId ? arbolDe.get(`${planId}|${arbol}`) : undefined;
    const etiqueta = l.speciesCommon?.trim() || censo?.speciesCommon?.trim() || "";
    const t: TalaAtribuida = {
      planId,
      arbol,
      especie: claveEspecie(etiqueta) || CLAVE_SIN_ESPECIE,
      etiqueta: etiqueta || "Sin especie",
      cites: l.cites || !!censo?.cites,
      dia: diaUtc(l.entryDate),
      m3: l.volumeM3,
    };
    talaDe.set(key, t);
    talas.push(t);
  }

  // 2. Trozado: la primera viva de cada troza (T3).
  const trozas: TrozaAtribuida[] = [];
  const trozasPorClave = new Map<string, TrozaAtribuida[]>();
  const vistas = new Set<string>();
  for (const l of vivas) {
    if (l.section !== "trozado") continue;
    const troza = l.trozaCode?.trim() ?? "";
    const arbolTexto = l.treeCode?.trim() || (troza ? arbolDeTroza(troza) : "");
    const arbol = (arbolTexto && claveDeCodigo(arbolTexto)) || `#${l.id}`;
    const clave = (troza && claveDeCodigo(troza)) || `#${l.id}`;
    const planId = planDeLinea(l, arbolTexto ? arbol : "");
    alPlan(planId, l);
    if (vistas.has(`${planId ?? ""}|${clave}`)) continue;
    vistas.add(`${planId ?? ""}|${clave}`);
    const tala = talaDe.get(`${planId ?? ""}|${arbol}`);
    const censo = planId ? arbolDe.get(`${planId}|${arbol}`) : undefined;
    const etiqueta = l.speciesCommon?.trim() || tala?.etiqueta || censo?.speciesCommon?.trim() || "";
    const t: TrozaAtribuida = {
      planId,
      clave,
      arbol,
      especie: claveEspecie(etiqueta) || CLAVE_SIN_ESPECIE,
      etiqueta: etiqueta || "Sin especie",
      cites: l.cites || !!tala?.cites || !!censo?.cites,
      dia: diaUtc(l.entryDate),
      m3: l.volumeM3,
      trozadoId: l.id,
      salida: null,
      diaSalida: null,
    };
    trozas.push(t);
    const lista = trozasPorClave.get(clave);
    if (lista) lista.push(t);
    else trozasPorClave.set(clave, [t]);
  }

  // 3. Salidas: la primera de cada troza (T1). La segunda no suma.
  const salidasSinTrozado: SalidaSinTrozado[] = [];
  const productos: ProductoDespachado[] = [];
  for (const l of vivas) {
    if (l.section === "despacho_producto") {
      const planId = l.planId && planesVivos.has(l.planId) ? l.planId : null;
      alPlan(planId, l);
      const cantidad = l.quantity ?? 0;
      if ((l.unit ?? "").toLowerCase() !== "m3" || !(cantidad > 0)) continue;
      const etiqueta = l.speciesCommon?.trim() || "";
      productos.push({
        planId,
        especie: claveEspecie(etiqueta) || CLAVE_SIN_ESPECIE,
        etiqueta: etiqueta || "Sin especie",
        m3: cantidad,
        dia: diaUtc(l.entryDate),
      });
      continue;
    }
    if (l.section !== "despacho_troza" && l.section !== "consumo_troza") continue;
    const seccion = l.section === "despacho_troza" ? "despacho" : "consumo";
    const troza = l.trozaCode?.trim() ?? "";
    const clave = troza ? claveDeCodigo(troza) : "";
    const todas = clave ? (trozasPorClave.get(clave) ?? []) : [];
    // Si SU plan tiene esa troza, la salida es de ésa: una repetida no cae en la homónima de otro plan.
    const delPlan = l.planId && planesVivos.has(l.planId) ? todas.filter((c) => c.planId === l.planId) : [];
    const candidatas = delPlan.length > 0 ? delPlan : todas;
    const libre = candidatas.find((c) => !c.salida);
    if (libre) {
      libre.salida = seccion;
      libre.diaSalida = diaUtc(l.entryDate);
      alPlan(libre.planId, l);
      continue;
    }
    if (candidatas.length > 0) {
      // La troza ya salió: esta línea repite una salida y no suma (T1).
      alPlan(candidatas[0].planId, l);
      continue;
    }
    const arbolTexto = troza ? arbolDeTroza(troza) : "";
    const arbol = arbolTexto ? claveDeCodigo(arbolTexto) : "";
    const planId = planDeLinea(l, arbol);
    alPlan(planId, l);
    const censo = planId && arbol ? arbolDe.get(`${planId}|${arbol}`) : undefined;
    const etiqueta = l.speciesCommon?.trim() || censo?.speciesCommon?.trim() || "";
    salidasSinTrozado.push({
      planId,
      troza: troza || "—",
      seccion,
      especie: claveEspecie(etiqueta) || CLAVE_SIN_ESPECIE,
      etiqueta: etiqueta || "Sin especie",
      dia: diaUtc(l.entryDate),
      m3: l.volumeM3,
    });
  }

  // Las anuladas no suman; van al plan para que la etapa del árbol explique por qué el censo y el libro no cuadran.
  for (const l of dentro) {
    if (l.status !== "anulado" || l.section === "despacho_producto") continue;
    const codigo = l.treeCode?.trim() || (l.trozaCode?.trim() ? arbolDeTroza(l.trozaCode.trim()) : "");
    const planId = l.planId && planesVivos.has(l.planId) ? l.planId : planPorArbol(codigo ? claveDeCodigo(codigo) : "", false);
    alPlan(planId, l);
  }

  const cadenaSinPlan = (lineasDelPlan.get("") ?? []).filter((l) => l.status === "registrado" && l.section !== "despacho_producto");
  return {
    talas,
    trozas,
    salidasSinTrozado,
    productos,
    lineasDelPlan,
    sinPlan: { lineas: cadenaSinPlan.length, ambiguas },
  };
}

// ─── Censo por especie ───────────────────────────────────────────────────────

export interface CensoDeEspecie extends Omit<CensoFila, "autorizadoM3" | "arbolesAutorizados"> {
  clave: string;
  etiqueta: string;
  cites: boolean;
  /** m³ de los semilleros que puso el POA (sin los del regente). */
  semillerosPoaM3: number;
}

const censoVacio = (clave: string, etiqueta: string): CensoDeEspecie => ({
  clave,
  etiqueta,
  cites: false,
  censadoM3: 0,
  censados: 0,
  semillerosRegente: 0,
  semillerosPoa: 0,
  semillerosM3: 0,
  semillerosPoaM3: 0,
  excluidos: 0,
  excluidosM3: 0,
  aprovechableM3: 0,
  aprovechables: 0,
  enPieAprovechables: 0,
});

/**
 * El censo de un plan, por especie, con la base «aprobado según censo».
 *
 * **La base NO crece al talar.** Se clasifica el censo ORIGINAL: para
 * `analizarPoa` todo árbol no descartado está en pie, así el DMC y los
 * semilleros de mayor DAP se eligen una sola vez. Calcularlos sobre lo que
 * queda en pie soltaba semilleros al talar (Blas, Copaiba: 11 en pie → 2
 * semilleros; 10 → 1) y la base —y el saldo— SUBÍAN con cada tala.
 *
 * Cada árbol cae en UN casillero y la tala no lo mueve de casillero: descartado
 * (según el censo) → excluido · semillero del regente → semillero · semillero
 * del POA → semillero · aprovechable → base · bajo DMC / sin DAP → excluido.
 * Un semillero o un bajo DMC que se taló sigue fuera de la base: su tala resta
 * del saldo y la etapa del árbol lo avisa. La tala sólo decide «en pie».
 *
 * `analizarPoa` y la vista POA no cambian: ellas responden «qué queda», esta
 * función «qué se aprobó».
 *
 * @param talados ids de los árboles ya talados (libro o censo): sólo cuentan para «en pie».
 */
export function censoPorEspecie(
  arboles: readonly ArbolDeExtraccion[],
  especies: readonly EspecieAutorizada[],
  config: PoaConfig,
  talados: ReadonlySet<string>,
  areaHa: number | null = null,
): Map<string, CensoDeEspecie> {
  const descartado = (a: ArbolDeExtraccion): boolean => (a.estado ?? "").trim() === "descartado";
  const poa = analizarPoa({
    trees: arboles.map((a) => ({
      id: a.id,
      treeCode: a.treeCode,
      speciesCommon: a.speciesCommon,
      dapM: a.dapM,
      volumenEstimadoM3: a.volumenEstimadoM3,
      // El censo original: lo talado vuelve a estar en pie para elegir.
      estado: descartado(a) ? "descartado" : "en_pie",
    })),
    species: especies.map((e) => ({
      speciesCommon: e.speciesCommon,
      volumenAutorizadoM3: e.volumenAutorizadoM3,
      arbolesAutorizados: e.arbolesAutorizados,
    })),
    areaHa,
    config,
  });
  const categoria = new Map(poa.arboles.map((a) => [a.id, a.categoria]));

  const out = new Map<string, CensoDeEspecie>();
  for (const a of arboles) {
    const clave = claveEspecie(a.speciesCommon) || CLAVE_SIN_ESPECIE;
    let c = out.get(clave);
    if (!c) {
      c = censoVacio(clave, a.speciesCommon?.trim() || "Sin especie");
      out.set(clave, c);
    }
    const v = a.volumenEstimadoM3 ?? 0;
    c.cites ||= a.cites;
    c.censados += 1;
    c.censadoM3 += v;
    const cat = categoria.get(a.id);
    if (cat === "descartado") {
      c.excluidos += 1;
      c.excluidosM3 += v;
    } else if (normalizarCondicion(a.condicion) === "semillero") {
      c.semillerosRegente += 1;
      c.semillerosM3 += v;
    } else if (cat === "semillero") {
      c.semillerosPoa += 1;
      c.semillerosM3 += v;
      c.semillerosPoaM3 += v;
    } else if (cat === "aprovechable") {
      c.aprovechables += 1;
      c.aprovechableM3 += v;
      if (!talados.has(a.id) && (a.estado ?? "").trim() !== "talado") c.enPieAprovechables += 1;
    } else {
      c.excluidos += 1;
      c.excluidosM3 += v;
    }
  }
  for (const c of out.values()) {
    c.censadoM3 = r4(c.censadoM3);
    c.semillerosM3 = r4(c.semillerosM3);
    c.semillerosPoaM3 = r4(c.semillerosPoaM3);
    c.excluidosM3 = r4(c.excluidosM3);
    c.aprovechableM3 = r4(c.aprovechableM3);
  }
  return out;
}

// ─── La cadena por especie ───────────────────────────────────────────────────

export interface CadenaDeEspecie {
  clave: string;
  etiqueta: string;
  cites: boolean;
  talado: Suma;
  trozado: Suma;
  arboles: number;
  despachado: Suma;
  consumidoTh: Suma;
  enElMonte: Suma;
  taladosSinTrozar: Suma;
  recibido: Suma;
  m3Guia: number;
  aserrado: Suma;
  salidasSinTrozado: Suma;
  recibidasSinDespacho: Suma;
  /** Días (`AAAA-MM-DD`) de trozado de las trozas que siguen en el monte. */
  diasEnElMonte: string[];
}

const cadenaVacia = (clave: string, etiqueta: string): CadenaDeEspecie => ({
  clave,
  etiqueta,
  cites: false,
  talado: sumaVacia(),
  trozado: sumaVacia(),
  arboles: 0,
  despachado: sumaVacia(),
  consumidoTh: sumaVacia(),
  enElMonte: sumaVacia(),
  taladosSinTrozar: sumaVacia(),
  recibido: sumaVacia(),
  m3Guia: 0,
  aserrado: sumaVacia(),
  salidasSinTrozado: sumaVacia(),
  recibidasSinDespacho: sumaVacia(),
  diasEnElMonte: [],
});

/**
 * Tala, trozado y la salida de cada troza, por especie. Las trozas son
 * disjuntas por construcción: cada una está despachada, consumida o en el monte.
 *
 * @param recepciones por id de la línea de Trozado (lo que guarda la troza del CTP).
 */
export function cadenaPorEspecie(
  talas: readonly TalaAtribuida[],
  trozas: readonly TrozaAtribuida[],
  salidasSinTrozado: readonly SalidaSinTrozado[],
  recepciones: ReadonlyMap<string, RecepcionDeExtraccion>,
): Map<string, CadenaDeEspecie> {
  const out = new Map<string, CadenaDeEspecie>();
  const de = (clave: string, etiqueta: string): CadenaDeEspecie => {
    let c = out.get(clave);
    if (!c) {
      c = cadenaVacia(clave, etiqueta);
      out.set(clave, c);
    }
    return c;
  };

  const conTrozas = new Set(trozas.map((t) => `${t.planId ?? ""}|${t.arbol}`));
  for (const t of talas) {
    const c = de(t.especie, t.etiqueta);
    c.cites ||= t.cites;
    contar(c.talado, t.m3);
    if (!conTrozas.has(`${t.planId ?? ""}|${t.arbol}`)) contar(c.taladosSinTrozar, t.m3);
  }

  const arbolesDe = new Map<string, Set<string>>();
  for (const t of trozas) {
    const c = de(t.especie, t.etiqueta);
    c.cites ||= t.cites;
    contar(c.trozado, t.m3);
    const set = arbolesDe.get(t.especie) ?? new Set<string>();
    set.add(`${t.planId ?? ""}|${t.arbol}`);
    arbolesDe.set(t.especie, set);
    if (t.salida === "despacho") contar(c.despachado, t.m3);
    else if (t.salida === "consumo") contar(c.consumidoTh, t.m3);
    else {
      contar(c.enElMonte, t.m3);
      c.diasEnElMonte.push(t.dia);
    }
    const rec = recepciones.get(t.trozadoId);
    if (rec) {
      contar(c.recibido, t.m3);
      c.m3Guia += rec.volumenM3 ?? 0;
      if (rec.aserrada) contar(c.aserrado, t.m3);
      if (t.salida !== "despacho") contar(c.recibidasSinDespacho, t.m3);
    }
  }
  for (const [clave, set] of arbolesDe) de(clave, "").arboles = set.size;
  for (const s of salidasSinTrozado) contar(de(s.especie, s.etiqueta).salidasSinTrozado, s.m3);
  return out;
}

// ─── Saldo ───────────────────────────────────────────────────────────────────

/**
 * `base − operación` y cuánto de la base se usó.
 *
 * `pct` = operación ÷ base × 100 (lo que se lleva usado; el aviso mira 80 y
 * 100). `nivel`: pasarse del AUTORIZADO es `exceso` (rojo); pasarse del CENSO
 * es `tope` (ámbar: el censo estima en pie, la tala mide con cinta). Sin base
 * conocida (`null`) → `sin_base`. Tolerancia: 0,01 m³.
 */
export function saldoContra(base: number | null, operacion: number, contra: BaseDelTope): SaldoContra {
  if (base == null) return { m3: r4(-operacion), pct: null, nivel: "sin_base" };
  const saldo = r4(base - operacion);
  if (base <= TOLERANCIA_M3) {
    if (operacion <= TOLERANCIA_M3) return { m3: saldo, pct: null, nivel: "sin_base" };
    return { m3: saldo, pct: null, nivel: contra === "autorizado" ? "exceso" : "tope" };
  }
  const pct = r2((operacion / base) * 100);
  if (saldo < -TOLERANCIA_M3) return { m3: saldo, pct, nivel: contra === "autorizado" ? "exceso" : "tope" };
  if (saldo <= TOLERANCIA_M3 || pct >= UMBRAL_TOPE_PCT) return { m3: saldo, pct, nivel: "tope" };
  if (pct >= UMBRAL_AVISO_PCT) return { m3: saldo, pct, nivel: "atencion" };
  return { m3: saldo, pct, nivel: "ok" };
}

// ─── Fila (acumulador que se puede sumar entre planes) ───────────────────────

/** Una fila todavía sin redondear: se puede sumar entre planes sin arrastrar redondeos. */
export interface Acum {
  clave: string;
  etiqueta: string;
  cites: boolean;
  fueraDelPlan: boolean;
  /** false = «Sin plan»: no hay censo contra qué medir (saldo `sin_base`). */
  tieneCenso: boolean;
  censo: CensoDeEspecie;
  autorizadoM3: number | null;
  arbolesAutorizados: number | null;
  cadena: CadenaDeEspecie;
  movilizadoM3: number;
  /** Lo movilizado de las partes que SÍ tienen autorizado (el saldo autorizado sólo resta eso). */
  movilizadoAutM3: number;
  topeM3: number | null;
  topeAutorizado: boolean;
}

const sumaNulos = (a: number | null, b: number | null): number | null => (a == null ? b : b == null ? a : a + b);

function sumarSumas(a: Suma, b: Suma): Suma {
  const s = { ...a };
  agregar(s, b);
  return s;
}

function juntarAcum(a: Acum, b: Acum, clave = a.clave, etiqueta = a.etiqueta): Acum {
  const censo: CensoDeEspecie = { ...censoVacio(clave, etiqueta) };
  for (const k of [
    "censadoM3", "censados", "semillerosRegente", "semillerosPoa", "semillerosM3", "semillerosPoaM3",
    "excluidos", "excluidosM3", "aprovechableM3", "aprovechables", "enPieAprovechables",
  ] as const) {
    censo[k] = a.censo[k] + b.censo[k];
  }
  censo.cites = a.censo.cites || b.censo.cites;
  const ca = a.cadena;
  const cb = b.cadena;
  const cadena: CadenaDeEspecie = {
    clave,
    etiqueta,
    cites: ca.cites || cb.cites,
    talado: sumarSumas(ca.talado, cb.talado),
    trozado: sumarSumas(ca.trozado, cb.trozado),
    arboles: ca.arboles + cb.arboles,
    despachado: sumarSumas(ca.despachado, cb.despachado),
    consumidoTh: sumarSumas(ca.consumidoTh, cb.consumidoTh),
    enElMonte: sumarSumas(ca.enElMonte, cb.enElMonte),
    taladosSinTrozar: sumarSumas(ca.taladosSinTrozar, cb.taladosSinTrozar),
    recibido: sumarSumas(ca.recibido, cb.recibido),
    m3Guia: ca.m3Guia + cb.m3Guia,
    aserrado: sumarSumas(ca.aserrado, cb.aserrado),
    salidasSinTrozado: sumarSumas(ca.salidasSinTrozado, cb.salidasSinTrozado),
    recibidasSinDespacho: sumarSumas(ca.recibidasSinDespacho, cb.recibidasSinDespacho),
    diasEnElMonte: [...ca.diasEnElMonte, ...cb.diasEnElMonte],
  };
  const topeM3 = sumaNulos(a.topeM3, b.topeM3);
  const topeAutorizado =
    a.topeM3 == null ? b.topeAutorizado : b.topeM3 == null ? a.topeAutorizado : a.topeAutorizado && b.topeAutorizado;
  return {
    clave,
    etiqueta,
    cites: a.cites || b.cites,
    fueraDelPlan: a.fueraDelPlan || b.fueraDelPlan,
    tieneCenso: a.tieneCenso || b.tieneCenso,
    censo,
    autorizadoM3: sumaNulos(a.autorizadoM3, b.autorizadoM3),
    arbolesAutorizados: sumaNulos(a.arbolesAutorizados, b.arbolesAutorizados),
    cadena,
    movilizadoM3: a.movilizadoM3 + b.movilizadoM3,
    movilizadoAutM3: a.movilizadoAutM3 + b.movilizadoAutM3,
    topeM3,
    topeAutorizado,
  };
}

function juntarTodos(partes: readonly Acum[], clave: string, etiqueta: string): Acum {
  let acc = acumVacio(clave, etiqueta, false);
  for (const p of partes) acc = juntarAcum(acc, p, clave, etiqueta);
  return acc;
}

function acumVacio(clave: string, etiqueta: string, tieneCenso: boolean): Acum {
  return {
    clave,
    etiqueta,
    cites: false,
    fueraDelPlan: false,
    tieneCenso,
    censo: censoVacio(clave, etiqueta),
    autorizadoM3: null,
    arbolesAutorizados: null,
    cadena: cadenaVacia(clave, etiqueta),
    movilizadoM3: 0,
    movilizadoAutM3: 0,
    topeM3: null,
    topeAutorizado: false,
  };
}

function filaDe(a: Acum): FilaExtraccion {
  const c = a.cadena;
  const base = a.tieneCenso ? r4(a.censo.aprovechableM3) : null;
  const talado = cerrar(c.talado);
  const trozado = cerrar(c.trozado);
  const despachado = cerrar(c.despachado);
  const tope = a.topeM3 == null ? null : { base: (a.topeAutorizado ? "autorizado" : "censo") as BaseDelTope, m3: r4(a.topeM3) };
  return {
    clave: a.clave,
    etiqueta: a.etiqueta,
    cites: a.cites || a.censo.cites || c.cites,
    fueraDelPlan: a.fueraDelPlan,
    censo: {
      censadoM3: r4(a.censo.censadoM3),
      censados: a.censo.censados,
      semillerosRegente: a.censo.semillerosRegente,
      semillerosPoa: a.censo.semillerosPoa,
      semillerosM3: r4(a.censo.semillerosM3),
      excluidos: a.censo.excluidos,
      excluidosM3: r4(a.censo.excluidosM3),
      aprovechableM3: r4(a.censo.aprovechableM3),
      aprovechables: a.censo.aprovechables,
      enPieAprovechables: a.censo.enPieAprovechables,
      autorizadoM3: a.autorizadoM3 == null ? null : r4(a.autorizadoM3),
      arbolesAutorizados: a.arbolesAutorizados,
    },
    talado,
    trozado: { ...trozado, arboles: c.arboles },
    despachado,
    consumidoTh: cerrar(c.consumidoTh),
    enElMonte: cerrar(c.enElMonte),
    taladosSinTrozar: cerrar(c.taladosSinTrozar),
    recibido: { ...cerrar(c.recibido), m3Guia: r4(c.m3Guia) },
    aserrado: cerrar(c.aserrado),
    saldo: {
      tala: saldoContra(base, talado.m3, "censo"),
      trozado: saldoContra(base, trozado.m3, "censo"),
      despacho: saldoContra(base, despachado.m3, "censo"),
    },
    movilizadoM3: r4(a.movilizadoM3),
    saldoAutorizado: a.autorizadoM3 == null ? null : saldoContra(r4(a.autorizadoM3), r4(a.movilizadoAutM3), "autorizado"),
    tope,
    avance: tope ? saldoContra(tope.m3, talado.m3, tope.base) : { m3: r4(-talado.m3), pct: null, nivel: "sin_base" },
  };
}

const ordenFilas = (a: FilaExtraccion, b: FilaExtraccion): number =>
  b.censo.censadoM3 - a.censo.censadoM3 || b.talado.m3 - a.talado.m3 || a.etiqueta.localeCompare(b.etiqueta, "es");

// ─── Un permiso ──────────────────────────────────────────────────────────────

/** El permiso calculado + lo que los avisos necesitan y la respuesta no lleva. */
export interface DetalleDePermiso {
  permiso: PermisoExtraccion;
  /** Las filas sumables (para juntar permisos sin recalcular). */
  acumTotal: Acum;
  acumEspecies: Acum[];
  semillerosPoa: number;
  semillerosPoaM3: number;
  /** El regente escribió la condición de al menos un árbol (declaró, aunque sea «Aprovechable»). */
  regenteDeclaro: boolean;
  ambiguas: { libro: string; plan: string }[];
  lineasSinPlan: number;
  /** Líneas sin plan cuyo árbol está en dos o más censos (no se elige uno a ciegas). */
  arbolEnDosCensos: number;
}

function armarPermiso(
  plan: PlanDeExtraccion | null,
  permisos: readonly PermisoDeExtraccion[],
  arboles: readonly ArbolDeExtraccion[],
  atr: LineasAtribuidas,
  recepciones: ReadonlyMap<string, RecepcionDeExtraccion>,
  enCtp: ReadonlySet<string>,
): DetalleDePermiso {
  const planId = plan?.id ?? null;
  const delPlan = <T extends { planId: string | null }>(xs: readonly T[]): T[] => xs.filter((x) => x.planId === planId);
  const talas = delPlan(atr.talas);
  const trozas = delPlan(atr.trozas);
  const sinTrozado = delPlan(atr.salidasSinTrozado);
  const productos = delPlan(atr.productos);

  // Censo: la base, con los talados que dice el LIBRO.
  const arbolesDelPlan = plan ? arboles.filter((a) => a.planId === plan.id) : [];
  const conTala = new Set(talas.map((t) => t.arbol));
  const talados = new Set(arbolesDelPlan.filter((a) => conTala.has(claveDeCodigo(a.treeCode))).map((a) => a.id));
  const censo = plan
    ? censoPorEspecie(arbolesDelPlan, plan.especies, plan.poa.config, talados, plan.areaHa)
    : new Map<string, CensoDeEspecie>();
  const cadena = cadenaPorEspecie(talas, trozas, sinTrozado, recepciones);

  // Autorizado por clave; `null` si el plan no autoriza especie alguna.
  const especiesPlan = plan?.especies ?? [];
  const autorizadoDe = new Map<string, { m3: number; arboles: number | null; nombre: string; cites: boolean }>();
  for (const e of especiesPlan) {
    const k = claveEspecie(e.speciesCommon) || CLAVE_SIN_ESPECIE;
    const prev = autorizadoDe.get(k);
    autorizadoDe.set(k, {
      m3: (prev?.m3 ?? 0) + (Number(e.volumenAutorizadoM3) || 0),
      arboles: sumaNulos(prev?.arboles ?? null, e.arbolesAutorizados),
      nombre: prev?.nombre ?? e.speciesCommon,
      cites: (prev?.cites ?? false) || e.cites,
    });
  }
  const conEspecies = especiesPlan.length > 0;

  // Saldo autorizado: la MISMA cuenta que la vista Plan (`computeBalance`), con lo de este plan.
  const movimientos: BalanceMovement[] = [
    ...talas.map((t) => ({ section: "tala", speciesCommon: t.etiqueta, trozaCode: null, volumeM3: t.m3, quantity: null, unit: null })),
    ...trozas.map((t) => ({ section: "trozado", speciesCommon: t.etiqueta, trozaCode: `${t.clave}`, volumeM3: t.m3, quantity: null, unit: null })),
    ...trozas
      .filter((t) => t.salida === "despacho")
      .map((t) => ({ section: "despacho_troza", speciesCommon: null, trozaCode: `${t.clave}`, volumeM3: null, quantity: null, unit: null })),
    ...productos.map((p) => ({ section: "despacho_producto", speciesCommon: p.etiqueta, trozaCode: null, volumeM3: null, quantity: p.m3, unit: "m3" })),
  ];
  const balance = computeBalance(
    especiesPlan.map<BalanceSpeciesInput>((e) => ({ speciesCommon: e.speciesCommon, cites: e.cites, volumenAutorizadoM3: e.volumenAutorizadoM3 })),
    movimientos,
  );
  const movilizadoDe = new Map<string, number>();
  for (const r of balance.rows) {
    const k = claveEspecie(r.species) || CLAVE_SIN_ESPECIE;
    movilizadoDe.set(k, (movilizadoDe.get(k) ?? 0) + r.movilizado);
  }
  for (const f of balance.fueraDePlan) {
    const k = claveEspecie(f.species) || CLAVE_SIN_ESPECIE;
    movilizadoDe.set(k, (movilizadoDe.get(k) ?? 0) + f.movilizadoM3);
  }

  // Fuera del plan: especies con operaciones que el plan no autoriza (las parecidas avisan, no se funden).
  const conOperaciones = [...cadena.values()].filter(
    (c) => c.talado.n + c.trozado.n + c.despachado.n + c.consumidoTh.n + c.salidasSinTrozado.n > 0,
  );
  const cruce = conEspecies
    ? cruzarEspecies(conOperaciones.map((c) => c.etiqueta), especiesPlan.map((e) => e.speciesCommon))
    : { autorizadas: new Map<string, string>(), sinAutorizar: [] as string[], ambiguas: [] as { libro: string; plan: string }[] };
  const sinAutorizar = new Set(cruce.sinAutorizar.map((n) => claveEspecie(n)));

  const claves = new Set<string>([...censo.keys(), ...cadena.keys(), ...autorizadoDe.keys()]);
  const acumEspecies: Acum[] = [];
  for (const clave of claves) {
    const ce = censo.get(clave);
    const ca = cadena.get(clave);
    const au = autorizadoDe.get(clave);
    const etiqueta = ce?.etiqueta || ca?.etiqueta || au?.nombre || "Sin especie";
    const autorizadoM3 = conEspecies ? (au?.m3 ?? 0) : null;
    const aprovechable = ce?.aprovechableM3 ?? 0;
    const movilizado = r4(movilizadoDe.get(clave) ?? 0);
    const topeM3 = autorizadoM3 != null ? autorizadoM3 : plan && aprovechable > 0 ? aprovechable : null;
    acumEspecies.push({
      clave,
      etiqueta,
      cites: !!(ce?.cites || ca?.cites || au?.cites),
      fueraDelPlan: sinAutorizar.has(clave),
      tieneCenso: plan != null,
      censo: ce ?? censoVacio(clave, etiqueta),
      autorizadoM3,
      arbolesAutorizados: conEspecies ? (au?.arboles ?? null) : null,
      cadena: ca ?? cadenaVacia(clave, etiqueta),
      movilizadoM3: movilizado,
      movilizadoAutM3: autorizadoM3 != null ? movilizado : 0,
      topeM3,
      topeAutorizado: autorizadoM3 != null,
    });
  }
  const acumTotal = juntarTodos(acumEspecies, "total", "Total");
  acumTotal.tieneCenso = plan != null;
  // Una especie sin censo, sin autorizar y sin madera en la cadena (p. ej. sólo una salida sin
  // trozado) sería una fila de ceros: queda en el total y en su aviso, no en la tabla.
  const visibles = acumEspecies.filter(
    (a) => a.censo.censados > 0 || autorizadoDe.has(a.clave) || a.cadena.talado.n + a.cadena.trozado.n + a.cadena.recibido.n > 0,
  );
  const especiesFilas = visibles.map(filaDe).sort(ordenFilas);

  // Etapa de cada árbol (la misma función que el mapa), con las líneas de ESTE plan.
  const etapas = plan
    ? estadoDeArboles(
        arbolesDelPlan.map((a) => ({ id: a.id, treeCode: a.treeCode, estado: a.estado, condicion: a.condicion })),
        (atr.lineasDelPlan.get(plan.id) ?? []).map<LineaParaEtapa>((l) => ({
          id: l.id,
          section: l.section,
          status: l.status,
          lineNo: l.lineNo,
          entryDate: l.entryDate,
          treeCode: l.treeCode,
          trozaCode: l.trozaCode,
          volumeM3: l.volumeM3,
          gtfNumber: l.gtfNumber,
        })),
        enCtp,
      )
    : null;
  const porEtapa: Partial<Record<EtapaArbol, number>> = {};
  const avisos: Partial<Record<TipoAviso, number>> = {};
  let conAviso = 0;
  for (const a of etapas?.arboles ?? []) {
    porEtapa[a.etapa] = (porEtapa[a.etapa] ?? 0) + 1;
    if (a.avisos.length > 0) conAviso += 1;
    for (const av of a.avisos) avisos[av.tipo] = (avisos[av.tipo] ?? 0) + 1;
  }

  const semillerosRegente = [...censo.values()].reduce((s, c) => s + c.semillerosRegente, 0);
  const permiso: PermisoExtraccion = {
    planId,
    planNumber: plan?.planNumber ?? null,
    planType: plan?.planType ?? null,
    titular: plan?.titular ?? null,
    alias: plan?.alias ?? null,
    estado: plan?.estado ?? null,
    vigenciaDesde: plan?.vigenciaDesde ?? null,
    vigenciaHasta: plan?.vigenciaHasta ?? null,
    permiso: plan ? permisoDelPlan(plan, permisos) : null,
    poa: {
      semillerosPct: plan?.poa.config.semillerosPct ?? 0,
      configurado: plan?.poa.configurado ?? false,
      semillerosRegente,
    },
    total: filaDe(acumTotal),
    especies: especiesFilas,
    arboles: { porEtapa, conAviso, avisos },
  };
  return {
    permiso,
    acumTotal,
    acumEspecies: visibles,
    semillerosPoa: [...censo.values()].reduce((s, c) => s + c.semillerosPoa, 0),
    semillerosPoaM3: r4([...censo.values()].reduce((s, c) => s + c.semillerosPoaM3, 0)),
    regenteDeclaro: arbolesDelPlan.some((a) => normalizarCondicion(a.condicion) != null),
    ambiguas: cruce.ambiguas,
    lineasSinPlan: plan ? 0 : atr.sinPlan.lineas,
    arbolEnDosCensos: plan ? 0 : atr.sinPlan.ambiguas,
  };
}

// ─── Período y semanas ───────────────────────────────────────────────────────

/** Tala, trozado y despacho que OCURRIERON en `[desde, hasta]` (flujo, no acumulado). */
export function ventanaDeLineas(
  talas: readonly TalaAtribuida[],
  trozas: readonly TrozaAtribuida[],
  desde: string,
  hasta: string,
): VentanaExtraccion {
  const en = (d: string | null): boolean => !!d && d >= desde && d <= hasta;
  const talado = sumaVacia();
  const trozado = sumaVacia();
  const despachado = sumaVacia();
  const dias = new Set<string>();
  for (const t of talas) {
    if (!en(t.dia)) continue;
    contar(talado, t.m3);
    dias.add(t.dia);
  }
  for (const t of trozas) {
    if (en(t.dia)) {
      contar(trozado, t.m3);
      dias.add(t.dia);
    }
    if (t.salida === "despacho" && en(t.diaSalida)) {
      contar(despachado, t.m3);
      dias.add(t.diaSalida as string);
    }
  }
  return { desde, hasta, talado: cerrar(talado), trozado: cerrar(trozado), despachado: cerrar(despachado), diasConActividad: dias.size };
}

/** La meta lineal de un permiso: agotar su tope entre el inicio y el cierre de la vigencia. */
export interface MetaDePermiso {
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  topeM3: number | null;
}

/**
 * Semana a semana (lunes, calendario de Lima) de `desde` a `hasta`: lo talado,
 * trozado y despachado en la semana, el talado acumulado desde la PRIMERA tala
 * (no desde `desde`) y la meta acumulada. La meta es la suma de las metas
 * lineales de cada permiso con tope; si alguno con tope no tiene vigencia, no
 * hay meta (`null`): media meta dibujada como entera miente.
 */
export function semanasDeExtraccion(
  talas: readonly TalaAtribuida[],
  trozas: readonly TrozaAtribuida[],
  desde: string,
  hasta: string,
  metas: readonly MetaDePermiso[],
): SemanaExtraccion[] {
  let inicio = lunesDe(desde);
  const ultimo = lunesDe(hasta);
  const total = Math.floor(diasEntre(inicio, ultimo) / 7) + 1;
  if (total > MAX_SEMANAS) inicio = sumarDias(ultimo, -7 * (MAX_SEMANAS - 1));

  const conTope = metas.filter((m) => m.topeM3 != null && m.topeM3 > 0);
  const metaValida = conTope.length > 0 && conTope.every((m) => m.vigenciaDesde && m.vigenciaHasta && m.vigenciaHasta > m.vigenciaDesde);
  const metaAl = (dia: string): number | null => {
    if (!metaValida) return null;
    let s = 0;
    for (const m of conTope) {
      const d0 = m.vigenciaDesde as string;
      const d1 = m.vigenciaHasta as string;
      const frac = Math.max(0, Math.min(1, diasEntre(d0, dia) / Math.max(1, diasEntre(d0, d1))));
      s += (m.topeM3 as number) * frac;
    }
    return r4(s);
  };

  // Cubetas por lunes: una pasada por las líneas, no una por semana.
  const cubeta = new Map<string, { tala: number; troza: number; despacho: number }>();
  const en = (d: string | null): d is string => !!d && d >= desde && d <= hasta;
  const sumarA = (dia: string, campo: "tala" | "troza" | "despacho", v: number | null) => {
    const k = lunesDe(dia);
    const c = cubeta.get(k) ?? { tala: 0, troza: 0, despacho: 0 };
    c[campo] += v ?? 0;
    cubeta.set(k, c);
  };
  for (const t of talas) if (en(t.dia)) sumarA(t.dia, "tala", t.m3);
  for (const t of trozas) {
    if (en(t.dia)) sumarA(t.dia, "troza", t.m3);
    if (t.salida === "despacho" && en(t.diaSalida)) sumarA(t.diaSalida, "despacho", t.m3);
  }

  const talasOrd = [...talas].sort((a, b) => a.dia.localeCompare(b.dia));
  let idx = 0;
  let acum = 0;
  const semanas: SemanaExtraccion[] = [];
  for (let lunes = inicio; lunes <= ultimo; lunes = sumarDias(lunes, 7)) {
    const domingo = sumarDias(lunes, 6);
    while (idx < talasOrd.length && talasOrd[idx].dia <= domingo) {
      acum += talasOrd[idx].m3 ?? 0;
      idx += 1;
    }
    const c = cubeta.get(lunes);
    semanas.push({
      semana: lunes,
      taladoM3: r4(c?.tala ?? 0),
      trozadoM3: r4(c?.troza ?? 0),
      despachadoM3: r4(c?.despacho ?? 0),
      taladoAcumM3: r4(acum),
      metaAcumM3: metaAl(domingo),
    });
  }
  return semanas;
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

/** m³ talados por semana en una ventana; sin `DIAS_MINIMOS_PARA_RITMO` días con tala no hay ritmo. */
function ritmoDe(talas: readonly TalaAtribuida[], desde: string, hasta: string): { m3: number | null; motivo: string | null } {
  const dias = new Set<string>();
  let total = 0;
  for (const t of talas) {
    if (t.dia < desde || t.dia > hasta) continue;
    dias.add(t.dia);
    total += t.m3 ?? 0;
  }
  if (hasta < desde || dias.size < DIAS_MINIMOS_PARA_RITMO) {
    return {
      m3: null,
      motivo: `Hace falta tala en al menos ${DIAS_MINIMOS_PARA_RITMO} días para medir un ritmo (hay ${plural(dias.size, "día", "días")}).`,
    };
  }
  const semanas = (diasEntre(desde, hasta) + 1) / 7;
  return { m3: r4(total / semanas), motivo: null };
}

export interface EntradaKpis {
  total: FilaExtraccion;
  talas: readonly TalaAtribuida[];
  trozas: readonly TrozaAtribuida[];
  periodo: VentanaExtraccion;
  anterior: VentanaExtraccion | null;
  /** Los planes reales del alcance (sin «Sin plan»): el plazo y el cierre sólo se leen si es UNO. */
  planes: readonly PermisoExtraccion[];
  /** Trozas recibidas en el CTP cuya salida del libro NO es un despacho (van a su aviso, no a «llegó»). */
  recibidasSinDespacho: number;
  hoy: Date;
}

export function kpisDeExtraccion(e: EntradaKpis): KpisExtraccion {
  const { total, periodo, anterior } = e;
  const base = total.censo.aprovechableM3;
  const talado = total.talado.m3;
  const hoyDia = limaDateKey(e.hoy);
  const unico = e.planes.length === 1 ? e.planes[0] : null;
  // «Hoy» del cálculo: si la vista mira un `hasta` pasado, ese día (a mediodía, como la
  // primera tala); si no, el instante real. Así el plazo, el ritmo y la proyección de un
  // período cerrado no cambian con el día en que se consulta.
  const pasado = periodo.hasta < hoyDia;
  const refDia = pasado ? periodo.hasta : hoyDia;
  const ref = pasado ? new Date(`${periodo.hasta}T12:00:00Z`) : e.hoy;

  // 1. Extraído del censo, contra el plazo corrido.
  let plazoPct: number | null = null;
  if (unico?.vigenciaDesde && unico.vigenciaHasta) {
    const z = analizarZafra({
      vigenciaDesde: unico.vigenciaDesde,
      vigenciaHasta: unico.vigenciaHasta,
      autorizadoM3: total.tope?.m3 ?? base,
      movilizadoM3: talado,
      hoy: ref,
    });
    plazoPct = z.estado === "sin_vigencia" ? null : z.avanceTiempoPct;
  }

  // 3. Ritmo, contra la MISMA cuenta sobre la ventana anterior.
  const ritmo = ritmoDe(e.talas, periodo.desde, refDia);
  const ritmoAnt = anterior ? ritmoDe(e.talas, anterior.desde, anterior.hasta) : null;
  const variacionPct =
    ritmo.m3 != null && ritmoAnt?.m3 != null && ritmoAnt.m3 > 0 ? r2(((ritmo.m3 - ritmoAnt.m3) / ritmoAnt.m3) * 100) : null;

  // 4. Se agota el…: sólo con ritmo.
  const saldo = total.saldo.tala.m3;
  let agotamiento: KpisExtraccion["agotamiento"] = {
    fecha: null,
    dias: null,
    vigenciaHasta: unico?.vigenciaHasta ?? null,
    llegaAlCierre: null,
    motivoSinDato: null,
  };
  if (!(base > 0)) agotamiento.motivoSinDato = "Sin censo aprovechable contra qué medir.";
  else if (saldo <= TOLERANCIA_M3) agotamiento.motivoSinDato = "Ya no queda saldo contra el censo.";
  else if (ritmo.m3 == null) agotamiento.motivoSinDato = "Sin ritmo de tala todavía.";
  else {
    const primera = e.talas.reduce<string | null>((min, t) => (t.dia && (!min || t.dia < min) ? t.dia : min), null);
    const p = projectSaldo(saldo, talado, primera ? `${primera}T12:00:00Z` : null, ref.toISOString());
    if (!p || !p.fechaAgotamientoISO) agotamiento.motivoSinDato = "Sin tala para proyectar.";
    else {
      const fecha = limaDateKey(p.fechaAgotamientoISO);
      agotamiento = {
        ...agotamiento,
        fecha,
        dias: p.diasParaAgotar,
        llegaAlCierre: agotamiento.vigenciaHasta ? fecha <= agotamiento.vigenciaHasta : null,
      };
    }
  }

  // 5. Trozas en el monte: la más vieja, contra el «hoy» del cálculo.
  const corte = refDia;
  const enMonte = e.trozas.filter((t) => !t.salida);
  const masVieja = enMonte.reduce<string | null>((min, t) => (t.dia && (!min || t.dia < min) ? t.dia : min), null);
  // 6. Llegó a planta: de las despachadas, cuántas recibió el CTP.
  const llegaron = Math.max(0, total.recibido.n - e.recibidasSinDespacho);

  return {
    extraido: { pct: base > 0 ? r2((talado / base) * 100) : null, taladoM3: talado, baseM3: base, plazoPct },
    porTalar: {
      m3: r4(base - talado),
      arbolesEnPie: total.censo.enPieAprovechables,
      ptAserrableRef: Math.round(ptAserrableDeRolliza(Math.max(0, base - talado))),
    },
    ritmoSemanal: { m3: ritmo.m3, anteriorM3: ritmoAnt?.m3 ?? null, variacionPct, motivoSinDato: ritmo.motivo },
    agotamiento,
    trozasEnElMonte: {
      n: total.enElMonte.n,
      m3: total.enElMonte.m3,
      diasMasVieja: masVieja ? Math.max(0, diasEntre(masVieja, corte)) : null,
    },
    llegoAPlanta: {
      pct: total.despachado.n > 0 ? r2((llegaron / total.despachado.n) * 100) : null,
      recibidas: llegaron,
      despachadas: total.despachado.n,
    },
  };
}

// ─── Embudo ──────────────────────────────────────────────────────────────────

const PASO_LABEL: Record<PasoCadena, string> = {
  censo: "Censo aprovechable",
  autorizado: "Autorizado",
  talado: "Talado",
  trozado: "Trozado",
  despachado: "Despachado",
  recibido: "Recibido en planta",
  aserrado: "Aserrado",
};

/**
 * La cadena del permiso en m³: censo (y autorizado, como referencia paralela)
 * → talado → trozado → despachado → recibido → aserrado. El % es contra el
 * paso anterior de la cadena (el talado, contra el censo). Lo consumido en el
 * TH es una rama, no merma: no se dibuja acá.
 */
export function embudoDe(total: FilaExtraccion): EtapaEmbudo[] {
  const pct = (a: number, b: number | null): number | null => (b != null && b > 0 ? r2((a / b) * 100) : null);
  const censo = total.censo.aprovechableM3;
  const pasos: EtapaEmbudo[] = [{ paso: "censo", label: PASO_LABEL.censo, m3: censo, n: total.censo.aprovechables, pctDelAnterior: null }];
  if (total.censo.autorizadoM3 != null) {
    // El autorizado es el tope legal, no un paso por el que pase la madera: sin % (contra el
    // censo daba «871 %» en main). Si pasa lo que el censo sostiene, lo dice su aviso.
    pasos.push({
      paso: "autorizado",
      label: PASO_LABEL.autorizado,
      m3: total.censo.autorizadoM3,
      n: total.censo.arbolesAutorizados,
      pctDelAnterior: null,
    });
  }
  const cadena: [PasoCadena, Suma, number | null][] = [
    ["talado", total.talado, censo],
    ["trozado", total.trozado, total.talado.m3],
    ["despachado", total.despachado, total.trozado.m3],
    ["recibido", total.recibido, total.despachado.m3],
    ["aserrado", total.aserrado, total.recibido.m3],
  ];
  for (const [paso, s, anterior] of cadena) {
    pasos.push({ paso, label: PASO_LABEL[paso], m3: s.m3, n: s.n, pctDelAnterior: pct(s.m3, anterior) });
  }
  return pasos;
}

// ─── Avisos ──────────────────────────────────────────────────────────────────

const PESO_NIVEL: Record<AvisoExtraccion["nivel"], number> = { error: 0, warning: 1, info: 2 };

const TEXTO_AVISO_ETAPA: Record<TipoAviso, [string, string]> = {
  censo_talado_sin_tala: ["talado en el censo sin tala en el libro", "talados en el censo sin tala en el libro"],
  censo_no_dice_talado: ["con tala y el censo lo tiene en pie", "con tala y el censo los tiene en pie"],
  trozas_sin_tala: ["con trozas sin tala", "con trozas sin tala"],
  despacho_sin_trozado: ["con despacho sin trozado", "con despacho sin trozado"],
  semillero_talado: ["semillero del regente talado", "semilleros del regente talados"],
};

export interface OpcionesAvisos {
  /** Más de un permiso en la respuesta: cada texto nombra el suyo. */
  varios: boolean;
  limites: { arbolesLeidos: number; lineasLeidas: number; truncado: boolean };
  permisoSinPlan?: { contratoId: string; codigo: string } | null;
}

/** Lo que pide atención, del más grave al más leve (y, a igual nivel, el de más m³). */
export function avisosDeExtraccion(detalles: readonly DetalleDePermiso[], op: OpcionesAvisos): AvisoExtraccion[] {
  const out: AvisoExtraccion[] = [];
  for (const d of detalles) {
    const p = d.permiso;
    const planId = p.planId;
    const nombrePlan = p.planNumber || p.alias || (planId ? "Plan sin número" : "Sin plan");
    const de = (texto: string): string => (op.varios ? `${nombrePlan} · ${texto}` : texto);
    const push = (a: Omit<AvisoExtraccion, "planId" | "texto"> & { texto: string }) =>
      out.push({ ...a, planId, texto: de(a.texto) });

    if (!planId) {
      if (d.lineasSinPlan > 0) {
        push({
          tipo: "lineas_sin_plan",
          nivel: "warning",
          especie: null,
          texto: `${plural(d.lineasSinPlan, "línea del libro no tiene", "líneas del libro no tienen")} plan ni árbol en un censo (${m3(p.total.trozado.m3)} m³ trozados)${d.arbolEnDosCensos > 0 ? `, ${d.arbolEnDosCensos} con el árbol en dos censos` : ""}: van en «Sin plan», sin censo contra qué medir.`,
          cifraM3: p.total.trozado.m3,
        });
      }
    }

    for (const e of p.especies) {
      if (e.fueraDelPlan) {
        push({
          tipo: "especie_fuera_del_plan",
          nivel: "error",
          especie: e.clave,
          texto: `${e.etiqueta}: tiene operaciones en el libro (${m3(e.talado.m3)} m³ talados, ${m3(e.trozado.m3)} m³ trozados) y el plan no la autoriza.`,
          cifraM3: e.talado.m3,
        });
      }
      const autorizado = e.tope?.base === "autorizado";
      const excesoAut = !e.fueraDelPlan && (e.saldoAutorizado?.nivel === "exceso" || (autorizado && e.avance.nivel === "exceso"));
      if (excesoAut) {
        const aut = e.censo.autorizadoM3 ?? 0;
        const talaPasa = e.talado.m3 > aut + TOLERANCIA_M3;
        const cifra = r4(Math.max(e.talado.m3, e.movilizadoM3) - aut);
        push({
          tipo: "exceso_autorizado",
          nivel: "error",
          especie: e.clave,
          texto: talaPasa
            ? `${e.etiqueta}: se talaron ${m3(e.talado.m3)} m³ y el plan autoriza ${m3(aut)} m³ (${m3(cifra)} m³ de más).`
            : `${e.etiqueta}: se movilizaron ${m3(e.movilizadoM3)} m³ y el plan autoriza ${m3(aut)} m³ (${m3(cifra)} m³ de más).`,
          cifraM3: cifra,
        });
      } else if (e.tope && !e.fueraDelPlan) {
        const sobreCenso = !autorizado && e.talado.m3 > e.tope.m3 + TOLERANCIA_M3;
        const contra = autorizado ? "lo autorizado" : "el censo aprovechable";
        if (e.avance.nivel === "tope" && !sobreCenso) {
          push({
            tipo: "avance_100",
            nivel: autorizado ? "error" : "warning",
            especie: e.clave,
            texto: `${e.etiqueta}: se llegó al tope de ${contra} (${m3(e.talado.m3)} de ${m3(e.tope.m3)} m³ talados).`,
            cifraM3: e.avance.m3,
          });
        } else if (e.avance.nivel === "atencion") {
          push({
            tipo: "avance_80",
            nivel: "warning",
            especie: e.clave,
            texto: `${e.etiqueta}: llevas talado el ${pctTxt(e.avance.pct ?? 0)} % de ${contra} (${m3(e.talado.m3)} de ${m3(e.tope.m3)} m³); quedan ${m3(e.avance.m3)} m³.`,
            cifraM3: e.avance.m3,
          });
        }
      }
      if (planId && e.talado.m3 > e.censo.aprovechableM3 + TOLERANCIA_M3) {
        const dif = r4(e.talado.m3 - e.censo.aprovechableM3);
        push({
          tipo: "medido_sobre_censo",
          nivel: "warning",
          especie: e.clave,
          texto: `${e.etiqueta}: se midieron ${m3(e.talado.m3)} m³ talados contra ${m3(e.censo.aprovechableM3)} m³ del censo aprovechable (${m3(dif)} m³ más). El censo estima en pie y la tala mide con cinta: no es una infracción.`,
          cifraM3: dif,
        });
      }
    }

    for (const a of d.ambiguas) {
      push({
        tipo: "especie_fuera_del_plan",
        nivel: "warning",
        especie: claveEspecie(a.libro) || null,
        texto: `${a.libro} no figura así en el plan: ¿es «${a.plan}»? Revisa el nombre antes de tomarlo como fuera del plan.`,
        cifraM3: null,
      });
    }

    const sinRespaldo = p.especies.filter(
      (e) => e.censo.autorizadoM3 != null && e.censo.autorizadoM3 > e.censo.aprovechableM3 + TOLERANCIA_M3,
    );
    if (sinRespaldo.length > 0) {
      const cifra = r4(sinRespaldo.reduce((s, e) => s + ((e.censo.autorizadoM3 ?? 0) - e.censo.aprovechableM3), 0));
      const detalle = sinRespaldo
        .slice(0, 4)
        .map((e) => `${e.etiqueta} ${m3(e.censo.autorizadoM3 ?? 0)} contra ${m3(e.censo.aprovechableM3)} m³`)
        .join(" · ");
      push({
        tipo: "autorizado_sin_respaldo",
        nivel: "info",
        especie: sinRespaldo.length === 1 ? sinRespaldo[0].clave : null,
        texto: `${plural(sinRespaldo.length, "especie autoriza", "especies autorizan")} más de lo que el censo sostiene: ${detalle}${sinRespaldo.length > 4 ? " …" : ""}.`,
        cifraM3: cifra,
      });
    }

    const t = p.total;
    if (t.taladosSinTrozar.n > 0) {
      push({
        tipo: "talados_sin_trozar",
        nivel: "info",
        especie: null,
        texto: `${plural(t.taladosSinTrozar.n, "árbol talado sigue", "árboles talados siguen")} sin trozar en el monte (${m3(t.taladosSinTrozar.m3)} m³).`,
        cifraM3: t.taladosSinTrozar.m3,
      });
    }
    const sinTrozado = d.acumTotal.cadena.salidasSinTrozado;
    if (sinTrozado.n > 0) {
      push({
        tipo: "salida_sin_trozado",
        nivel: "warning",
        especie: null,
        texto: `${plural(sinTrozado.n, "troza salió", "trozas salieron")} sin su línea de Trozado: no entran en la cadena${sinTrozado.m3 > 0 ? ` (${m3(r4(sinTrozado.m3))} m³ según la salida)` : ""}.`,
        cifraM3: sinTrozado.m3 > 0 ? r4(sinTrozado.m3) : null,
      });
    }
    const sinDespacho = d.acumTotal.cadena.recibidasSinDespacho;
    if (sinDespacho.n > 0) {
      push({
        tipo: "recibida_sin_despacho",
        nivel: "warning",
        especie: null,
        texto: `${plural(sinDespacho.n, "troza llegó", "trozas llegaron")} al CTP sin despacho en el libro (${m3(r4(sinDespacho.m3))} m³): falta asentar su salida.`,
        cifraM3: r4(sinDespacho.m3),
      });
    }
    if (p.arboles.conAviso > 0) {
      const partes = (Object.entries(p.arboles.avisos) as [TipoAviso, number][])
        .filter(([, n]) => n > 0)
        .map(([tipo, n]) => `${n} ${TEXTO_AVISO_ETAPA[tipo][n === 1 ? 0 : 1]}`);
      push({
        tipo: "censo_libro_distinto",
        nivel: "warning",
        especie: null,
        texto: `En ${plural(p.arboles.conAviso, "árbol", "árboles")} el censo y el libro no dicen lo mismo: ${partes.join(" · ")}.`,
        cifraM3: null,
      });
    }
    if (planId && d.semillerosPoa > 0 && p.poa.semillerosRegente === 0) {
      const sinSemilleros = r4(t.censo.aprovechableM3 + d.semillerosPoaM3);
      const origen = p.poa.configurado ? `el ${p.poa.semillerosPct} % de Parámetros del POA` : `el ${p.poa.semillerosPct} % por defecto`;
      const regente = d.regenteDeclaro ? "el regente no declaró ninguno" : "el censo no trae la condición del regente";
      const plantacion = /plantaci/i.test(p.planType ?? "") ? " en una plantación" : "";
      push({
        tipo: "semilleros_sistema_vs_regente",
        nivel: "warning",
        especie: null,
        texto: `El sistema reserva ${plural(d.semillerosPoa, "semillero", "semilleros")} (${m3(d.semillerosPoaM3)} m³, ${origen}) y ${regente}${plantacion}: la base baja de ${m3(sinSemilleros)} a ${m3(t.censo.aprovechableM3)} m³. Si el plan no los exige, pon 0 % en Parámetros del POA.`,
        cifraM3: d.semillerosPoaM3,
      });
    }
    if (planId && (!p.permiso || p.permiso.vinculo === "gemelo")) {
      push({
        tipo: "plan_sin_permiso",
        nivel: "info",
        especie: null,
        texto: p.permiso
          ? `El plan no está unido a su permiso; el permiso ${p.permiso.codigo} tiene el mismo código (se sugiere, no se unió).`
          : "El plan no está unido a ningún permiso: lo recibido en el CTP no se puede leer por permiso.",
        cifraM3: null,
      });
    }
  }

  if (op.permisoSinPlan) {
    out.push({
      tipo: "permiso_sin_plan",
      nivel: "warning",
      planId: null,
      especie: null,
      texto: `El permiso ${op.permisoSinPlan.codigo} no tiene plan de manejo en el Libro TH: no hay censo contra qué medir.`,
      cifraM3: null,
    });
  }
  if (op.limites.truncado) {
    out.push({
      tipo: "libro_truncado",
      nivel: "error",
      planId: null,
      especie: null,
      texto: `El libro es más grande de lo que se lee de una vez (${formatNumber(op.limites.lineasLeidas, 0)} líneas, ${formatNumber(op.limites.arbolesLeidos, 0)} árboles): las cifras son parciales.`,
      cifraM3: null,
    });
  }
  return out.sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel] || (b.cifraM3 ?? -1) - (a.cifraM3 ?? -1));
}

// ─── Todo junto ──────────────────────────────────────────────────────────────

/** La respuesta entera de `GET /api/admin/forestal/loth/extraccion`. */
export function armarExtraccion(e: EntradaExtraccion): ExtraccionResponse {
  const hoyDia = limaDateKey(e.hoy);
  const hasta = e.hasta || hoyDia;
  const atr = atribuirLineas(e.planes, e.arboles, e.lineas, hasta);

  const recepciones = new Map<string, RecepcionDeExtraccion>();
  for (const r of e.recepciones) if (!recepciones.has(r.lothTrozadoId)) recepciones.set(r.lothTrozadoId, r);
  const enCtp = new Set(recepciones.keys());

  const enAlcance = e.planesEnAlcance ? new Set(e.planesEnAlcance) : null;
  const planes = e.planes.filter((p) => !enAlcance || enAlcance.has(p.id));
  const detalles = planes.map((p) => armarPermiso(p, e.permisos, e.arboles, atr, recepciones, enCtp));
  if (e.conSinPlan) {
    const sinPlan = armarPermiso(null, e.permisos, e.arboles, atr, recepciones, enCtp);
    const t = sinPlan.permiso.total;
    const conAlgo = t.talado.n + t.trozado.n + sinPlan.acumTotal.cadena.salidasSinTrozado.n > 0 || sinPlan.lineasSinPlan > 0;
    if (conAlgo) detalles.push(sinPlan);
  }

  const idsAlcance = new Set(detalles.map((d) => d.permiso.planId ?? ""));
  const enScope = <T extends { planId: string | null }>(xs: readonly T[]): T[] => xs.filter((x) => idsAlcance.has(x.planId ?? ""));
  const talas = enScope(atr.talas);
  const trozas = enScope(atr.trozas);

  // Total y especies del alcance: sumando los acumuladores, nunca las filas ya redondeadas.
  const unDetalle = detalles.length === 1 ? detalles[0] : null;
  const total = unDetalle ? unDetalle.permiso.total : filaDe(juntarTodos(detalles.map((d) => d.acumTotal), "total", "Total"));
  let especies: FilaExtraccion[];
  if (unDetalle) especies = unDetalle.permiso.especies;
  else {
    const porClave = new Map<string, Acum[]>();
    for (const d of detalles) {
      for (const a of d.acumEspecies) {
        const lista = porClave.get(a.clave);
        if (lista) lista.push(a);
        else porClave.set(a.clave, [a]);
      }
    }
    especies = [...porClave.entries()].map(([clave, partes]) => filaDe(juntarTodos(partes, clave, partes[0].etiqueta))).sort(ordenFilas);
  }

  // Período: por defecto, de la primera operación del alcance a `hasta`.
  const primera = [...talas.map((t) => t.dia), ...trozas.map((t) => t.dia)].filter(Boolean).sort()[0] ?? hasta;
  let desde = e.desde || primera;
  if (desde > hasta) desde = hasta;
  const periodo = ventanaDeLineas(talas, trozas, desde, hasta);
  const anterior = e.antDesde && e.antHasta ? ventanaDeLineas(talas, trozas, e.antDesde, e.antHasta) : null;

  const planesReales = detalles.filter((d) => d.permiso.planId).map((d) => d.permiso);
  const semanas = semanasDeExtraccion(
    talas,
    trozas,
    desde,
    hasta,
    detalles
      .filter((d) => d.permiso.planId)
      .map((d) => ({ vigenciaDesde: d.permiso.vigenciaDesde, vigenciaHasta: d.permiso.vigenciaHasta, topeM3: d.permiso.total.tope?.m3 ?? null })),
  );

  return {
    generadoEn: e.hoy.toISOString(),
    alcance: e.alcance,
    permisos: detalles.map((d) => d.permiso),
    total,
    especies,
    periodo,
    anterior,
    semanas,
    kpis: kpisDeExtraccion({
      total,
      talas,
      trozas,
      periodo,
      anterior,
      planes: planesReales,
      recibidasSinDespacho: detalles.reduce((s, d) => s + d.acumTotal.cadena.recibidasSinDespacho.n, 0),
      hoy: e.hoy,
    }),
    embudo: embudoDe(total),
    avisos: avisosDeExtraccion(detalles, { varios: detalles.length > 1, limites: e.limites, permisoSinPlan: e.permisoSinPlan }),
    limites: e.limites,
    recibidoAlDia: true,
  };
}
