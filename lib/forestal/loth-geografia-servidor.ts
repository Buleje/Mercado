import "server-only";
import { logger } from "@/lib/logger";
import { formatDateNumeric, formatTime } from "@/lib/format";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestLothParcelaDB } from "@/lib/db/forest-loth-parcela.db";
import { ForestLothCartografiaDB } from "@/lib/db/forest-loth-cartografia.db";
import { ForestLothPoaDB } from "@/lib/db/forest-loth-poa.db";
import { ForestLothGeografiaDB } from "@/lib/db/forest-loth-geografia.db";
import { hasParcela, type LatLng } from "./loth-geo";
import { hasCartografia, type LothCartografia } from "./loth-cartografia";
import { latLngDelArbol } from "./loth-censo-uso";
import { normalizarCondicion } from "./loth-mapa-arboles";
import type { EtapaArbol, EstadoArbol } from "./loth-etapa-arbol";
import { analizarPoa, type PoaCategoria } from "./loth-poa";
import { contieneBbox, recuadroDeTrabajo, type BaseDelRecuadro, type GeografiaPredio } from "./loth-geografia";
import { pedirGrilla, pedirOverpass } from "./loth-geografia-fuentes";
import type { ArbolAExtraer } from "./loth-planificador";

/**
 * loth-geografia-servidor — junta lo que el planificador necesita del negocio:
 * el plan, sus árboles con coordenadas, el contorno dibujado, la cartografía y
 * la geografía (de la caché o de internet). Lo usan `/loth/geografia` y
 * `/loth/planificador`, para que las dos respondan sobre la MISMA zona.
 *
 * Todo por las DB classes, con `tenantId` primero: un `planId` de otro negocio
 * da cero árboles (el tenant va en el WHERE), nunca los árboles ajenos.
 */

export interface ArbolDelCenso {
  id: string;
  codigo: string;
  especie: string;
  lat: number;
  lng: number;
  m3: number | null;
  /** Diámetro a la altura del pecho (m): el POA elige los semilleros por él. */
  dapM: number | null;
  condicion: string | null;
  estadoCenso: string;
}

export interface ContextoPlan {
  planId: string | null;
  arboles: ArbolDelCenso[];
  /** Árboles del censo sin UTM (o con UTM inválida): no se pueden ubicar. */
  sinCoordenadas: number;
  contorno: LatLng[];
  contornoEs: "predio" | "parcela";
  carto: LothCartografia;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** El plan (el pedido o el activo), sus árboles ubicados, el contorno y la cartografía. */
export async function contextoDelPlan(tenantId: string, planId?: string | null): Promise<ContextoPlan> {
  if (!tenantId) throw new Error("tenantId is required");
  const plan = planId?.trim() || (await ForestPlanDB.getActivePlan(tenantId))?.id || null;
  // ADR-462: el área y la cartografía son del PLAN; si no tiene la suya, vale la del negocio.
  const [parcelaPlan, cartoPlan, censo] = await Promise.all([
    plan ? ForestLothParcelaDB.get(tenantId, plan) : Promise.resolve(null),
    plan ? ForestLothCartografiaDB.get(tenantId, plan) : Promise.resolve(null),
    plan ? ForestPlanDB.listTrees(tenantId, plan) : Promise.resolve({ trees: [], total: 0, truncado: false }),
  ]);
  const parcela = parcelaPlan && hasParcela(parcelaPlan) ? parcelaPlan : await ForestLothParcelaDB.get(tenantId);
  const carto = cartoPlan && hasCartografia(cartoPlan) ? cartoPlan : await ForestLothCartografiaDB.get(tenantId);
  const arboles: ArbolDelCenso[] = [];
  let sinCoordenadas = 0;
  for (const t of censo.trees) {
    const p = latLngDelArbol({ utmZona: t.utmZona, utmX: num(t.utmX), utmY: num(t.utmY) });
    if (!p) {
      sinCoordenadas++;
      continue;
    }
    arboles.push({
      id: t.id,
      codigo: t.treeCode,
      especie: t.speciesCommon,
      lat: p[0],
      lng: p[1],
      m3: num(t.volumenEstimadoM3),
      dapM: num(t.dapM),
      condicion: t.condicion ?? null,
      estadoCenso: t.estado ?? "en_pie",
    });
  }
  const conPredio = carto.predio.vertices.length >= 3;
  return {
    planId: plan,
    arboles,
    sinCoordenadas,
    contorno: conPredio ? carto.predio.vertices : parcela.vertices,
    contornoEs: conPredio ? "predio" : "parcela",
    carto,
  };
}

export type ResultadoGeografia =
  | { ok: true; geografia: GeografiaPredio & { desdeCache: boolean } }
  | { ok: false; motivo: string };

/** Tras un fallo de Overpass u Open-Meteo, no se vuelve a salir a internet por esto (salvo «Actualizar»). */
export const ESPERA_TRAS_FALLO_MS = 10 * 60_000;

const fechaTxt = (iso: string) => formatDateNumeric(iso);
const horaTxt = (ms: number) => formatTime(new Date(ms));

/**
 * La geografía de la zona de trabajo. Caché primero; a internet si no hay, si
 * no cubre la zona, si le falta una fuente o si se pide `refrescar`.
 *
 *   · Un servicio caído NUNCA da error: se usa lo guardado (con su fecha) o se
 *     devuelve vacío con el aviso. Lo guardado de OTRA zona no se usa: ríos de
 *     otro lugar dirían «no hay agua» donde sí hay.
 *   · Caché negativa: si un servicio falló hace menos de
 *     {@link ESPERA_TRAS_FALLO_MS}, no se lo vuelve a llamar (salvo `refrescar`):
 *     cada apertura del mapa no martilla a Overpass.
 *   · `soloCache`: nunca sale a internet (el planificador al recalcular).
 *   · Lo que llegue se guarda aunque falte una parte, y se dice qué faltó.
 */
export async function obtenerGeografia(
  tenantId: string,
  ctx: Pick<ContextoPlan, "contorno" | "contornoEs" | "arboles"> & { planId?: string | null },
  opts: { refrescar?: boolean; soloCache?: boolean; ahoraIso?: string; user?: string } = {},
): Promise<ResultadoGeografia> {
  if (!tenantId) throw new Error("tenantId is required");
  const rec = recuadroDeTrabajo({ contorno: ctx.contorno, contornoEs: ctx.contornoEs, arboles: ctx.arboles.map((a) => [a.lat, a.lng] as LatLng) });
  if (!rec.ok) return { ok: false, motivo: rec.motivo };

  let cache: GeografiaPredio | null = null;
  try {
    cache = await ForestLothGeografiaDB.get(tenantId, ctx.planId ?? null);
  } catch (err) {
    logger.error("[loth.geografia] no se pudo leer la caché", { error: String(err), tenantId });
  }
  const cubre = cache != null && contieneBbox(cache.bbox, rec.bbox);
  const avisos = [...rec.avisos];
  const base: BaseDelRecuadro = rec.base;
  const ahora = opts.ahoraIso ?? new Date().toISOString();
  const ahoraMs = Date.parse(ahora);
  const refrescar = opts.refrescar === true && opts.soloCache !== true;

  if (cache && cubre && !refrescar && cache.fuentes.osm && cache.fuentes.elevacion && cache.elevacion) {
    return { ok: true, geografia: { ...cache, base, avisos, desdeCache: true } };
  }

  // Sin salir a internet: lo que haya de esta zona, o nada, y se dice.
  if (opts.soloCache) {
    if (cache && cubre) {
      if (!cache.fuentes.osm) avisos.push("Todavía no se tienen los ríos y caminos de OpenStreetMap: toca «Actualizar» en el planificador.");
      if (!cache.elevacion) avisos.push("Todavía no se tiene el relieve: toca «Actualizar» en el planificador.");
      return { ok: true, geografia: { ...cache, base, avisos, desdeCache: true } };
    }
    avisos.push("Todavía no se trajo la geografía de esta zona: el plan se armó sin ríos, caminos ni relieve.");
    return {
      ok: true,
      geografia: { bbox: rec.bbox, base, rios: [], caminos: [], elevacion: null, fuentes: { osm: null, elevacion: null }, avisos, desdeCache: false },
    };
  }

  const reusar = cache != null && cubre && !refrescar;
  const bbox = reusar && cache ? cache.bbox : rec.bbox;
  const fallos = { osm: (cubre && cache?.fallos?.osm) || null, elevacion: (cubre && cache?.fallos?.elevacion) || null };
  const enEspera = (iso: string | null) => !refrescar && iso != null && ahoraMs - Date.parse(iso) < ESPERA_TRAS_FALLO_MS;
  const tieneOsm = reusar && !!cache?.fuentes.osm;
  const tieneElev = reusar && !!cache?.fuentes.elevacion && !!cache.elevacion;
  const esperaOsm = !tieneOsm && enEspera(fallos.osm);
  const esperaElev = !tieneElev && enEspera(fallos.elevacion);
  const necesitaOsm = !tieneOsm && !esperaOsm;
  const necesitaElev = !tieneElev && !esperaElev;

  // Los dos a la vez, cada uno con su presupuesto: la geografía entera tarda lo que el más lento (≤ 12 s).
  const [osm, alt] = await Promise.all([necesitaOsm ? pedirOverpass(bbox) : null, necesitaElev ? pedirGrilla(bbox) : null]);

  let rios = cache && cubre ? cache.rios : [];
  let caminos = cache && cubre ? cache.caminos : [];
  let fuenteOsm = cache && cubre ? cache.fuentes.osm : null;
  if (esperaOsm && fallos.osm) {
    avisos.push(`OpenStreetMap no respondió a las ${horaTxt(Date.parse(fallos.osm))}: se vuelve a intentar desde las ${horaTxt(Date.parse(fallos.osm) + ESPERA_TRAS_FALLO_MS)} o con «Actualizar».`);
  }
  if (necesitaOsm) {
    if (osm) {
      rios = osm.rios;
      caminos = osm.caminos;
      fuenteOsm = ahora;
      fallos.osm = null;
      logger.info("[loth.geografia] OpenStreetMap", { tenantId, espejo: osm.espejo, rios: rios.length, caminos: caminos.length });
    } else {
      fallos.osm = ahora;
      avisos.push(
        fuenteOsm
          ? `OpenStreetMap no respondió: se usan los ríos y caminos guardados el ${fechaTxt(fuenteOsm)}.`
          : "OpenStreetMap no respondió: por ahora no se conocen ríos ni caminos de la zona. Vuelve a intentar en unos minutos.",
      );
    }
  }

  let elevacion = cache && cubre ? cache.elevacion : null;
  let fuenteElev = cache && cubre ? cache.fuentes.elevacion : null;
  if (esperaElev && fallos.elevacion) {
    avisos.push(`El servicio de altitud no respondió a las ${horaTxt(Date.parse(fallos.elevacion))}: se vuelve a intentar desde las ${horaTxt(Date.parse(fallos.elevacion) + ESPERA_TRAS_FALLO_MS)} o con «Actualizar».`);
  }
  if (necesitaElev) {
    if (alt?.grilla) {
      elevacion = alt.grilla;
      fuenteElev = ahora;
      // Una tanda que no llegó a tiempo deja huecos: la grilla sirve igual, y se dice.
      fallos.elevacion = alt.faltan > 0 ? ahora : null;
      if (alt.faltan > 0) avisos.push(`Faltó la altitud de ${alt.faltan} de ${alt.total} puntos: ahí no se midió la pendiente.`);
    } else {
      fallos.elevacion = ahora;
      if (fuenteElev && elevacion) avisos.push(`El servicio de altitud no respondió: se usa el relieve guardado el ${fechaTxt(fuenteElev)}.`);
      else {
        elevacion = null;
        fuenteElev = null;
        avisos.push("El servicio de altitud no respondió: sin relieve no se miden pendientes. Vuelve a intentar en unos minutos.");
      }
    }
  }
  if (osm && rios.length === 0 && caminos.length === 0) {
    avisos.push("OpenStreetMap no tiene ríos ni caminos cargados en esta zona: si los hay, dibújalos en el mapa.");
  }

  const geo: GeografiaPredio = { bbox, base, rios, caminos, elevacion, fuentes: { osm: fuenteOsm, elevacion: fuenteElev }, fallos, avisos };
  // Se guarda TODO intento —lo que llegó y lo que falló—: el fallo es la caché negativa.
  if (necesitaOsm || necesitaElev) {
    try {
      await ForestLothGeografiaDB.set(tenantId, geo, opts.user ?? "sistema", ctx.planId ?? null);
    } catch (err) {
      logger.error("[loth.geografia] no se pudo guardar la caché", { error: String(err), tenantId });
    }
  }
  return { ok: true, geografia: { ...geo, desdeCache: false } };
}

// ─── Qué árboles se sacan ────────────────────────────────────────────────────

export interface Excluidos {
  motivo: string;
  n: number;
  codigos: string[];
}

/** Etapas que todavía piden sacar madera del monte. */
const ETAPAS_A_SACAR = new Set<EtapaArbol>(["en_pie", "talado", "trozado", "despachado_parcial"]);

const MOTIVO_ETAPA: Partial<Record<EtapaArbol, string>> = {
  semillero: "Semillero: no se tala",
  descartado: "Descartado en el censo",
  despachado: "Ya despachado: salió del monte",
  en_ctp: "Ya está en el aserradero",
};

/**
 * De los árboles del plan, los que hay que sacar: en pie (talar y arrastrar) y
 * los talados o trozados con trozas todavía en el monte (sólo arrastrar). Los
 * semilleros y los bajo el diámetro mínimo NO entran —el censo o el libro los
 * reservan— y cada exclusión se cuenta con su motivo.
 *
 * La etapa sale del libro (`estadoDeArboles`); si no se puede leer, del censo,
 * y se avisa.
 */
export async function arbolesParaPlanificar(
  tenantId: string,
  ctx: Pick<ContextoPlan, "planId" | "arboles">,
  opts: { soloEnPie?: boolean } = {},
): Promise<{ arboles: ArbolAExtraer[]; excluidos: Excluidos[]; avisos: string[]; semilleros: { codigo: string; lat: number; lng: number }[] }> {
  if (!tenantId) throw new Error("tenantId is required");
  const avisos: string[] = [];
  let estados = new Map<string, EstadoArbol>();
  if (ctx.planId && ctx.arboles.length) {
    try {
      const r = await ForestLothDB.estadoDeArboles(tenantId, ctx.planId);
      estados = new Map(r.arboles.map((e) => [e.treeId, e]));
    } catch (err) {
      logger.error("[loth.planificador] estadoDeArboles falló", { error: String(err), tenantId });
      avisos.push("No se pudo leer en qué etapa está cada árbol según el libro: se usó lo que dice el censo.");
    }
  }
  const categoriaPoa = ctx.planId && ctx.arboles.length ? await categoriasDelPoa(tenantId, ctx.planId, ctx.arboles, estados, avisos) : new Map<string, PoaCategoria>();
  const excl = new Map<string, Excluidos>();
  const excluir = (motivo: string, codigo: string) => {
    const e = excl.get(motivo) ?? { motivo, n: 0, codigos: [] };
    e.n++;
    if (e.codigos.length < 20) e.codigos.push(codigo);
    excl.set(motivo, e);
  };

  const arboles: ArbolAExtraer[] = [];
  /** Los que no se tocan: el planificador rodea con las trochas (a menos de 5 m se lastiman). */
  const semilleros: { codigo: string; lat: number; lng: number }[] = [];
  for (const a of ctx.arboles) {
    const clase = normalizarCondicion(a.condicion);
    if (clase === "semillero") {
      excluir("Semillero: no se tala", a.codigo);
      semilleros.push({ codigo: a.codigo, lat: a.lat, lng: a.lng });
      continue;
    }
    if (clase === "bajo_dmc") {
      excluir("Bajo el diámetro mínimo de corta", a.codigo);
      continue;
    }
    // El regente no lo marcó, pero el POA lo reserva: tampoco se tala (el mapa
    // lo pinta como semillero por lo mismo).
    if (categoriaPoa.get(a.id) === "semillero") {
      excluir("Semillero según el POA: no se tala", a.codigo);
      semilleros.push({ codigo: a.codigo, lat: a.lat, lng: a.lng });
      continue;
    }
    const est = estados.get(a.id);
    const etapa: EtapaArbol = est?.etapa ?? (a.estadoCenso === "talado" ? "talado" : a.estadoCenso === "descartado" ? "descartado" : "en_pie");
    if (!ETAPAS_A_SACAR.has(etapa)) {
      excluir(MOTIVO_ETAPA[etapa] ?? `Etapa ${etapa}`, a.codigo);
      continue;
    }
    if ((etapa === "trozado" || etapa === "despachado_parcial") && est && est.trozas.enMonte === 0) {
      excluir("Sus trozas ya salieron del monte", a.codigo);
      continue;
    }
    if (opts.soloEnPie && etapa !== "en_pie") {
      excluir("Ya talado (pediste sólo los en pie)", a.codigo);
      continue;
    }
    arboles.push({ id: a.id, codigo: a.codigo, lat: a.lat, lng: a.lng, m3: a.m3, etapa, especie: a.especie });
  }
  return { arboles, excluidos: [...excl.values()].sort((x, y) => y.n - x.n), avisos, semilleros };
}

/** Etapas del libro en las que el árbol ya está tumbado (no compite por semillero). */
const TUMBADO = new Set<EtapaArbol>(["talado", "trozado", "despachado_parcial", "despachado", "en_ctp"]);

/**
 * La categoría del POA de cada árbol (aprovechable, semillero, bajo DMC…),
 * calculada igual que el mapa y el cuadro del Plan de Manejo: especies
 * autorizadas + configuración del POA del plan + lo que el LIBRO ya taló (un
 * tocón no puede quedarse con el lugar de un semillero). Si algo no se puede
 * leer, se sigue sin el POA y se avisa: mejor un plan con un aviso que ninguno.
 */
async function categoriasDelPoa(
  tenantId: string,
  planId: string,
  arboles: readonly ArbolDelCenso[],
  estados: ReadonlyMap<string, EstadoArbol>,
  avisos: string[],
): Promise<Map<string, PoaCategoria>> {
  try {
    const [plan, especies, config] = await Promise.all([
      ForestPlanDB.getPlan(tenantId, planId),
      ForestPlanDB.listSpecies(tenantId, planId),
      ForestLothPoaDB.get(tenantId, planId),
    ]);
    const taladosEnLibro = new Set([...estados.values()].filter((e) => TUMBADO.has(e.etapa)).map((e) => e.treeId));
    const analisis = analizarPoa({
      trees: arboles.map((a) => ({ id: a.id, treeCode: a.codigo, speciesCommon: a.especie, dapM: a.dapM, volumenEstimadoM3: a.m3, estado: a.estadoCenso })),
      species: especies.map((e) => ({
        speciesCommon: e.speciesCommon,
        volumenAutorizadoM3: Number(e.volumenAutorizadoM3 ?? 0),
        arbolesAutorizados: e.arbolesAutorizados ?? null,
      })),
      areaHa: plan?.areaHa != null ? Number(plan.areaHa) : null,
      config,
      taladosEnLibro,
    });
    return new Map(analisis.arboles.map((x) => [x.id, x.categoria]));
  } catch (err) {
    logger.error("[loth.planificador] POA falló", { error: String(err), tenantId });
    avisos.push("No se pudo calcular el POA: los semilleros que reserva el POA no se descontaron.");
    return new Map();
  }
}
