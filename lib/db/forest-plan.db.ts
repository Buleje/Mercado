/**
 * ForestPlanDB — Plan de Manejo Forestal + Censo + Especies autorizadas (ADR-126).
 *
 * Base maestra del LO-TH: el permiso aprobado, las especies/volúmenes
 * autorizados y el censo de árboles. De acá la Tala jala datos por código.
 *
 * Patrón Buleje: tenantId 1er param · sin Prisma directo desde API/UI ·
 * cache invalidate por write.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { logger } from "@/lib/logger";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  censusVolume, claveEspecie, computeBalance, computeAprovechamiento, cruzarEspecies, detectAnomalias, projectSaldo, computeCosteo,
  estaFueraDePlazo,
  type BalanceMovement, type BalanceSpeciesInput, type CosteoSpeciesInput,
} from "@/lib/forestal/loth-constants";
import { ForestLothPoaDB } from "@/lib/db/forest-loth-poa.db";
import { defaultPoaConfig } from "@/lib/forestal/loth-poa";
import { lineasDelPlan as lineasDelPlanFn } from "@/lib/forestal/loth-analitica-plan";
import { ESTADOS_SIN_INGRESO } from "@/lib/db/gtf-numero.db";
import {
  PLAN_ID_SIN_PLAN, SECCIONES_EXTRACCION, TOPE_ARBOLES, TOPE_LINEAS,
  armarExtraccion, diaUtc, permisoDelPlan,
  type PlanDeExtraccion,
} from "@/lib/forestal/loth-extraccion";
import type { ExtraccionFiltro, ExtraccionResponse } from "@/lib/forestal/loth-extraccion-tipos";
import { planDeUpsert, type ItemAutorizar } from "@/lib/forestal/loth-autorizar-lote";
import { findSpeciesByCommonName } from "@/data/forestry-species";

const CACHE_PREFIX = "forest-plan";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

/** Volumen comercial del árbol en pie (re-export de la fórmula pura). */
export { censusVolume };

/**
 * El plan se quiso atar a un permiso que no es de este negocio (o ya no existe).
 * Clase propia para que la ruta lo devuelva como **400 con el motivo** y no
 * como un 500 mudo: es un dato mal mandado, no una falla del servidor.
 */
export class ContratoAjenoError extends Error {
  constructor() {
    super("Ese permiso no existe en este negocio.");
    this.name = "ContratoAjenoError";
  }
}

export interface PlanInput {
  caratulaId?: string | null;
  planType?: string;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: Date | null;
  titularName: string;
  /** Regente forestal a cargo (ADR-423) y su N° del Registro Nacional de SERFOR. */
  regenteName?: string | null;
  regenteRegistro?: string | null;
  regenteEspecialidad?: string | null;
  representanteLegal?: string | null;
  arffs?: string | null;
  region?: string | null;
  parcelaCorta?: string | null;
  areaHa?: number | string | null;
  uitRef?: number | string | null;
  costoExtraccionM3?: number | string | null;
  costoTransformacionM3?: number | string | null;
  costoFleteM3?: number | string | null;
  vigenciaDesde?: Date | null;
  vigenciaHasta?: Date | null;
  estado?: string;
  notes?: string | null;
  /** Cómo se reconoce y dónde queda (ADR-426). */
  alias?: string | null;
  propietarioNombre?: string | null;
  propietarioDocTipo?: string | null;
  propietarioDoc?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  sector?: string | null;
  cuenca?: string | null;
  /** El permiso (`ForestContrato`) bajo el que se aprobó. Se valida que sea de
   *  ESTE tenant: no hay FK que lo haga (ADR-426). */
  contratoId?: string | null;
  createdBy: string;
}

export interface SpeciesInput {
  planId: string;
  speciesCommon: string;
  speciesScientific?: string | null;
  cites?: boolean;
  categoria?: string | null;
  volumenAutorizadoM3: number | string;
  arbolesAutorizados?: number | null;
  valorEstadoNaturalSoles?: number | string | null;
  precioVentaSoles?: number | string | null;
  /** Plantación (ADR-459): año en que se instaló y hectáreas que ocupa. `null` = no se sabe. */
  anioInstalacion?: number | null;
  superficieHa?: number | string | null;
}

/** Una especie que entra con el alta del plan: la misma forma, sin `planId` (lo pone el alta). */
export type EspecieDelAlta = Omit<SpeciesInput, "planId">;

/**
 * La misma especie dos veces (por clave: «Bolaina» = «bolaina» =
 * «Bolaina (Guazuma crinita)»). Dos filas de la misma especie se llevan cada una
 * el volumen talado entero y el saldo se cuenta doble.
 *
 * - Con un nombre (alta/corrección de a una): ya está en el plan → 409 en la ruta.
 * - Con una lista (carga por lote, PUT): el pedido la trae dos veces → 400; no se
 *   adivina cuál vale.
 * `especies` siempre trae la lista (de uno o de varios) para la ruta.
 */
export class EspecieRepetidaError extends Error {
  readonly especie: string;
  readonly yaEsta: string;
  readonly especies: string[];
  constructor(especie: string | readonly string[], yaEsta?: string) {
    const lista = typeof especie === "string" ? [especie] : [...especie];
    const primera = lista[0] ?? "";
    const ya = yaEsta ?? primera;
    super(
      typeof especie !== "string"
        ? `La especie ${lista.join(", ")} viene dos veces.`
        : ya === primera
          ? `«${primera}» ya está en el plan: una especie va una sola vez.`
          : `«${primera}» ya está en el plan como «${ya}»: corrige esa fila en vez de agregarla de nuevo.`,
    );
    this.name = "EspecieRepetidaError";
    this.especie = primera;
    this.yaEsta = ya;
    this.especies = lista;
  }
}

/** El plan no existe en ESTE negocio (o está de baja): la especie no se cuelga de él → 404. */
export class PlanNoEncontradoError extends Error {
  constructor() {
    super("Ese plan no existe en este negocio.");
    this.name = "PlanNoEncontradoError";
  }
}

/** La especie no existe en ESTE negocio o ya está de baja → 404 (antes, un P2025 de Prisma = 500). */
export class EspecieNoEncontradaError extends Error {
  constructor() {
    super("Esa especie no existe en este plan.");
    this.name = "EspecieNoEncontradaError";
  }
}

export interface TreeInput {
  planId: string;
  treeCode: string;
  speciesCommon: string;
  speciesScientific?: string | null;
  /** Nombre en idioma nativo, como lo trae la hoja del censo. */
  speciesNative?: string | null;
  cites?: boolean;
  dapM?: number | string | null;
  alturaComercialM?: number | string | null;
  factorForma?: number | string | null;
  volumenEstimadoM3?: number | string | null;
  utmZona?: string | null;
  utmX?: number | string | null;
  utmY?: number | string | null;
  parcelaCorta?: string | null;
  calidad?: string | null;
  /** Condición que declara el censo («Aprovechable», «Semillero»…), no la categoría POA calculada. */
  condicion?: string | null;
  estado?: string;
  notes?: string | null;
  /** Cómo se reconoce y dónde queda (ADR-426). */
  alias?: string | null;
  propietarioNombre?: string | null;
  propietarioDocTipo?: string | null;
  propietarioDoc?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  sector?: string | null;
  cuenca?: string | null;
  /** El permiso (`ForestContrato`) bajo el que se aprobó. Se valida que sea de
   *  ESTE tenant: no hay FK que lo haga (ADR-426). */
  contratoId?: string | null;
  createdBy: string;
}

/** La especie ya está DOS veces en el plan (409): se limpia antes en el editor de a una. */
export class EspecieDuplicadaEnPlanError extends Error {
  constructor(readonly especies: string[]) {
    super(`${especies.join(", ")} ya figura dos veces en el plan: borra la repetida antes de cargar.`);
    this.name = "EspecieDuplicadaEnPlanError";
  }
}

/** Un código de árbol que ya está en el censo del plan (409 en el endpoint). */
export class CensoCodigoRepetidoError extends Error {
  constructor(readonly treeCode: string) {
    super(`El árbol ${treeCode} ya está en el censo de este plan.`);
    this.name = "CensoCodigoRepetidoError";
  }
}

export class ForestPlanDB {
  // ─── Plan ─────────────────────────────────────────────────────────────
  /**
   * El permiso existe, es de ESTE negocio y está vivo — o no se ata.
   *
   * `ForestPlan.contratoId` va **sin FK** a propósito (ADR-426): el ensayo de la
   * migración mostró que una clave foránea habría aceptado un contrato de otro
   * tenant, porque compara ids y no tenants. El aislamiento de este repo es
   * app-level, así que el guard vive acá. Un id ajeno **rompe** la operación en
   * vez de guardarse en silencio: es un bug del cliente o un intento cruzado, y
   * las dos cosas se avisan.
   */
  private static async exigirContratoDelTenant(tenantId: string, contratoId: string | null | undefined) {
    const id = (contratoId ?? "").trim();
    if (!id) return null;
    const existe = await prisma.forestContrato.findFirst({
      where: { tenantId, id, deletedAt: null },
      select: { id: true },
    });
    if (!existe) throw new ContratoAjenoError();
    return existe.id;
  }

  /** La fila de un plan nuevo, tal como se inserta (una sola definición para las dos altas). */
  private static datosDelPlan(
    tenantId: string,
    input: PlanInput,
    contratoId: string | null,
  ): Prisma.ForestPlanUncheckedCreateInput {
    return {
      tenantId,
      caratulaId: input.caratulaId ?? null,
      planType: input.planType ?? "PO",
      planNumber: input.planNumber?.trim() || null,
      tituloHabilitante: input.tituloHabilitante?.trim() || null,
      resolucionNumber: input.resolucionNumber?.trim() || null,
      resolucionDate: input.resolucionDate ?? null,
      titularName: input.titularName.trim(),
      regenteName: input.regenteName?.trim() || null,
      regenteRegistro: input.regenteRegistro?.trim() || null,
      regenteEspecialidad: input.regenteEspecialidad?.trim() || null,
      representanteLegal: input.representanteLegal?.trim() || null,
      arffs: input.arffs?.trim() || null,
      region: input.region?.trim() || null,
      parcelaCorta: input.parcelaCorta?.trim() || null,
      areaHa: dec(input.areaHa),
      uitRef: dec(input.uitRef),
      costoExtraccionM3: dec(input.costoExtraccionM3),
      costoTransformacionM3: dec(input.costoTransformacionM3),
      costoFleteM3: dec(input.costoFleteM3),
      vigenciaDesde: input.vigenciaDesde ?? null,
      vigenciaHasta: input.vigenciaHasta ?? null,
      estado: input.estado ?? "vigente",
      notes: input.notes?.trim() || null,
      alias: input.alias?.trim() || null,
      propietarioNombre: input.propietarioNombre?.trim() || null,
      propietarioDocTipo: input.propietarioDocTipo?.trim() || null,
      propietarioDoc: input.propietarioDoc?.trim() || null,
      provincia: input.provincia?.trim() || null,
      distrito: input.distrito?.trim() || null,
      sector: input.sector?.trim() || null,
      cuenca: input.cuenca?.trim() || null,
      contratoId,
      createdBy: input.createdBy,
    };
  }

  static async createPlan(tenantId: string, input: PlanInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.titularName?.trim()) throw new Error("titularName is required");
    const contratoId = await this.exigirContratoDelTenant(tenantId, input.contratoId);
    const plan = await prisma.forestPlan.create({ data: ForestPlanDB.datosDelPlan(tenantId, input, contratoId) });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    ForestPlanDB.auditarAlta(tenantId, plan, [], input.createdBy);
    return plan;
  }

  /**
   * Alta del plan DENTRO de una transacción ajena (ADR-461: el importador de
   * guías crea el permiso y asienta la guía en la MISMA transacción — o todo o
   * nada). La misma fila que `createPlan`; el permiso (`contratoId`) se valida
   * contra ESTE tenant con la `tx`. La caché y el rastro van después del commit:
   * `despuesDelAlta`.
   */
  static async crearPlanEnTx(tx: Prisma.TransactionClient, tenantId: string, input: PlanInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.titularName?.trim()) throw new Error("titularName is required");
    const pedido = (input.contratoId ?? "").trim();
    let contratoId: string | null = null;
    if (pedido) {
      const existe = await tx.forestContrato.findFirst({ where: { tenantId, id: pedido, deletedAt: null }, select: { id: true } });
      if (!existe) throw new ContratoAjenoError();
      contratoId = existe.id;
    }
    return tx.forestPlan.create({ data: ForestPlanDB.datosDelPlan(tenantId, input, contratoId) });
  }

  /** Lo que sigue al commit de un `crearPlanEnTx`: caché del plan y el renglón del alta. */
  static despuesDelAlta(
    tenantId: string,
    plan: { id: string; planType: string; planNumber: string | null; titularName: string },
    actor: string,
  ): void {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-plan] no se pudo invalidar la caché tras el alta", { error: String(err), tenantId, planId: plan.id });
    }
    ForestPlanDB.auditarAlta(tenantId, plan, [], actor);
  }

  /** El renglón del alta: qué plan y, si vino con su registro, qué especies y cuántos m³. */
  private static auditarAlta(
    tenantId: string,
    plan: { id: string; planType: string; planNumber: string | null; titularName: string },
    especies: readonly { speciesCommon: string; volumenAutorizadoM3: Prisma.Decimal }[],
    actor: string,
  ) {
    const total = especies.reduce((a, e) => a + Number(e.volumenAutorizadoM3), 0);
    const lista = especies
      .slice(0, 12)
      .map((e) => `${e.speciesCommon} ${fmtM3(Number(e.volumenAutorizadoM3))}`)
      .join(" · ");
    auditCtp({
      tenantId,
      action: "ctp_plan_alta",
      entity: "ForestPlan",
      entityId: plan.id,
      detail:
        `Alta del plan ${plan.planType} ${plan.planNumber ?? "(sin N°)"} — ${plan.titularName}` +
        (especies.length > 0
          ? `, con ${especies.length} especie(s) y ${fmtM3(total)} m³: ${lista}${especies.length > 12 ? " …" : ""}`
          : ""),
      user: actor,
    });
  }

  /**
   * Alta del plan CON sus especies (ADR-459): el registro de una plantación
   * declara especie, volumen, año y superficie, y con eso se trabaja sin censo.
   *
   * Plan y especies van en UNA transacción: o entra todo o nada. Un plan de
   * plantación que quedara creado sin su registro dejaría la tala sin base
   * contra qué descontar, y el usuario lo cargaría de nuevo → dos planes.
   * Las especies entran en UN `createManyAndReturn` (no una consulta por
   * especie: 60 viajes al pooler pasan el timeout de la transacción).
   *
   * Sin especies es el alta de siempre (`createPlan`).
   */
  static async crearPlanConEspecies(tenantId: string, input: PlanInput, especies: readonly EspecieDelAlta[]) {
    if (especies.length === 0) return { plan: await ForestPlanDB.createPlan(tenantId, input), species: [] };
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.titularName?.trim()) throw new Error("titularName is required");
    ForestPlanDB.exigirSinRepetir(especies.map((e) => e.speciesCommon));
    const contratoId = await this.exigirContratoDelTenant(tenantId, input.contratoId);
    const res = await prisma.$transaction(
      async (tx) => {
        const plan = await tx.forestPlan.create({ data: ForestPlanDB.datosDelPlan(tenantId, input, contratoId) });
        const species = await tx.forestPlanSpecies.createManyAndReturn({
          data: especies.map((e) => ForestPlanDB.datosDeEspecie(tenantId, plan.id, e)),
        });
        return { plan, species };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    ForestPlanDB.auditarAlta(tenantId, res.plan, res.species, input.createdBy);
    return res;
  }

  static async listPlans(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestPlan.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getPlan(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestPlan.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  static async getActivePlan(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestPlan.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updatePlan(
    tenantId: string,
    id: string,
    patch: Partial<Omit<PlanInput, "createdBy">>,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (patch.contratoId !== undefined) await this.exigirContratoDelTenant(tenantId, patch.contratoId);
    const data: Prisma.ForestPlanUpdateInput = {};
    const decKeys = new Set(["areaHa", "uitRef", "costoExtraccionM3", "costoTransformacionM3", "costoFleteM3"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    const plan = await prisma.forestPlan.update({
      where: { id, tenantId } satisfies Prisma.ForestPlanWhereUniqueInput,
      data,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return plan;
  }

  /**
   * Qué cuelga de este plan hoy — para poder decirlo ANTES de confirmar la baja.
   *
   * Cinco tablas lo citan por `planId` y en una baja no significan lo mismo:
   * las especies autorizadas y el censo SON el plan (se van con él de la
   * vista), mientras que los asientos del LO-TH, las guías y los permisos son
   * papel ya emitido que sigue existiendo y que se declara ante la ARFFS.
   *
   * ⚠️ No se suma el volumen de los asientos, a propósito. `ForestLothEntry`
   * tiene `volumeM3`, pero la MISMA madera se asienta en tala, en trozado y
   * otra vez en despacho: sumar las filas del plan daría cerca del triple del
   * volumen real y sería un número inventado con cara de oficial (regla 2 de
   * `verificacion-de-verdad`). El único volumen que el modelo publica sin
   * derivar es el autorizado del plan, y ése es el que se devuelve.
   */
  static async usosDelPlan(tenantId: string, planId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const [especies, censo, asientos, guias, contratos, autorizado] = await Promise.all([
      prisma.forestPlanSpecies.count({ where: { tenantId, planId, deletedAt: null } }),
      prisma.forestCensusTree.count({ where: { tenantId, planId, deletedAt: null } }),
      prisma.forestLothEntry.count({ where: { tenantId, planId, deletedAt: null } }),
      prisma.forestGtf.count({ where: { tenantId, planId, deletedAt: null } }),
      prisma.forestContrato.count({ where: { tenantId, planId, deletedAt: null } }),
      prisma.forestPlanSpecies.aggregate({
        where: { tenantId, planId, deletedAt: null },
        _sum: { volumenAutorizadoM3: true },
      }),
    ]);
    // Sin especies cargadas el volumen autorizado es DESCONOCIDO, no cero: un
    // 0,000 m³ en el "¿estás seguro?" diría que el plan no autoriza nada.
    const suma = autorizado._sum.volumenAutorizadoM3;
    return {
      especies,
      censo,
      asientos,
      guias,
      contratos,
      volumenAutorizadoM3: suma == null ? null : Number(suma),
    };
  }

  /**
   * Da de baja un plan cargado por error.
   *
   * **Baja lógica** (`deletedAt`), nunca borrado físico: los asientos del
   * LO-TH y las guías que lo citan siguen existiendo —son lo que se declara
   * ante la ARFFS— y su `planId` apunta acá. El plan desaparece del selector y
   * deja de ser el activo; la historia que se firmó bajo él, no.
   *
   * Devuelve `null` si no existe (o ya estaba de baja) para que la ruta
   * responda 404 en vez de fabricar un update sobre nada. Lo que colgaba se
   * mide ANTES del update y queda escrito en el rastro: un fiscalizador que ve
   * un plan de baja necesita saber cuánto papel quedó huérfano.
   */
  static async eliminarPlan(tenantId: string, planId: string, actor: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const existe = await prisma.forestPlan.findFirst({
      where: { tenantId, id: planId, deletedAt: null },
    });
    if (!existe) return null;

    const usos = await ForestPlanDB.usosDelPlan(tenantId, planId);
    const plan = await prisma.forestPlan.update({
      where: { id: planId, tenantId } satisfies Prisma.ForestPlanWhereUniqueInput,
      data: { deletedAt: new Date(), isActive: false },
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-plan] no se pudo invalidar la caché tras la baja", {
        error: String(err),
        tenantId,
        planId,
      });
    }
    auditCtp({
      tenantId,
      action: "ctp_plan_baja",
      entity: "ForestPlan",
      entityId: plan.id,
      detail:
        `Baja del plan ${plan.planType} ${plan.planNumber ?? "(sin N°)"} — ${plan.titularName}. ` +
        `Colgaban: ${usos.especies} especies, ${usos.censo} árboles del censo, ` +
        `${usos.asientos} asientos del LO-TH, ${usos.guias} guías, ${usos.contratos} permisos`,
      user: actor,
    });
    return plan;
  }

  /**
   * Revierte una baja (02-10-2026: en Blas se dio de baja el plan que tenía el
   * censo, las líneas y el permiso, y se creó otro vacío con el mismo N° para
   * corregir el titular). Espejo de `eliminarPlan`: acotado al tenant, sólo
   * sobre un plan que ESTÁ de baja (si no, `null` → 404), invalida la caché y
   * deja rastro con lo que vuelve a colgar de él.
   */
  static async reactivarPlan(tenantId: string, planId: string, actor: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const deBaja = await prisma.forestPlan.findFirst({
      where: { tenantId, id: planId, deletedAt: { not: null } },
    });
    if (!deBaja) return null;
    const plan = await prisma.forestPlan.update({
      where: { id: planId, tenantId } satisfies Prisma.ForestPlanWhereUniqueInput,
      data: { deletedAt: null, isActive: true },
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-plan] no se pudo invalidar la caché tras reactivar", { error: String(err), tenantId, planId });
    }
    const usos = await ForestPlanDB.usosDelPlan(tenantId, planId);
    auditCtp({
      tenantId,
      action: "ctp_plan_reactivado",
      entity: "ForestPlan",
      entityId: plan.id,
      detail:
        `Reactivado el plan ${plan.planType} ${plan.planNumber ?? "(sin N°)"} — ${plan.titularName}. ` +
        `Vuelven a colgar: ${usos.especies} especies, ${usos.censo} árboles del censo, ` +
        `${usos.asientos} asientos del LO-TH, ${usos.guias} guías, ${usos.contratos} permisos`,
      user: actor,
    });
    return plan;
  }

  // ─── Especies autorizadas ──────────────────────────────────────────────
  static async listSpecies(tenantId: string, planId: string) {
    return prisma.forestPlanSpecies.findMany({
      where: { tenantId, planId, deletedAt: null },
      orderBy: { speciesCommon: "asc" },
    });
  }

  /** La fila de una especie nueva. Una sola definición para el alta suelta y la del plan. */
  private static datosDeEspecie(
    tenantId: string,
    planId: string,
    input: EspecieDelAlta,
  ): Prisma.ForestPlanSpeciesCreateManyInput {
    if (!input.speciesCommon?.trim()) throw new Error("speciesCommon is required");
    return {
      tenantId,
      planId,
      speciesCommon: input.speciesCommon.trim(),
      speciesScientific: input.speciesScientific?.trim() || null,
      cites: input.cites ?? false,
      categoria: input.categoria?.trim() || null,
      volumenAutorizadoM3: new Prisma.Decimal(input.volumenAutorizadoM3),
      arbolesAutorizados: input.arbolesAutorizados ?? null,
      valorEstadoNaturalSoles: dec(input.valorEstadoNaturalSoles),
      precioVentaSoles: dec(input.precioVentaSoles),
      /* Sólo si vinieron (la columna ya nace NULL): así el alta de siempre, que no
         los manda, no depende de un cliente Prisma que conozca las columnas del
         ADR-459 — un dev server sin reiniciar seguía dando 500 en TODA alta. */
      ...(input.anioInstalacion !== undefined ? { anioInstalacion: input.anioInstalacion } : {}),
      ...(input.superficieHa !== undefined ? { superficieHa: dec(input.superficieHa) } : {}),
    };
  }

  /** La misma especie (por clave) dos veces en una lista → `EspecieRepetidaError`. */
  private static exigirSinRepetir(nombres: readonly string[]): void {
    const vistas = new Map<string, string>();
    for (const n of nombres) {
      const k = claveEspecie(n);
      const antes = k ? vistas.get(k) : undefined;
      if (antes != null) throw new EspecieRepetidaError(n.trim(), antes);
      if (k) vistas.set(k, n.trim());
    }
  }

  /**
   * Turno por plan para tocar sus especies. Sin esto, dos altas de la misma
   * especie a la vez leían «no está» las dos y entraban las dos (no hay índice
   * único que lo impida: la clave se calcula). Candado de la transacción: se
   * suelta solo al confirmar o deshacer.
   */
  private static async turnoDelPlan(tx: Prisma.TransactionClient, tenantId: string, planId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`forest-plan-especies:${planId}`}))`;
  }

  /**
   * ¿La especie ya está viva en el plan (por clave)? `exceptoId` = la fila que se
   * está corrigiendo (renombrarla a sí misma no es repetirla). Va DENTRO del turno.
   */
  private static async exigirEspecieNueva(
    tx: Prisma.TransactionClient,
    tenantId: string,
    planId: string,
    nombre: string,
    exceptoId?: string,
  ) {
    const vivas = await tx.forestPlanSpecies.findMany({
      where: { tenantId, planId, deletedAt: null, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
      select: { speciesCommon: true },
    });
    ForestPlanDB.exigirSinRepetir([...vivas.map((v) => v.speciesCommon), nombre]);
  }

  /** La especie viva de ESTE negocio, o `EspecieNoEncontradaError` (→ 404, no un 500 de Prisma). */
  private static async especieViva(tenantId: string, id: string) {
    const actual = await prisma.forestPlanSpecies.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!actual) throw new EspecieNoEncontradaError();
    return actual;
  }

  static async addSpecies(tenantId: string, input: SpeciesInput, actor = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.planId) throw new Error("planId is required");
    if (!input.speciesCommon?.trim()) throw new Error("speciesCommon is required");
    /* `ForestPlanSpecies.planId` no tiene FK: sin esto, un `planId` de otro
       negocio (o de un plan dado de baja) dejaba una especie huérfana. */
    const plan = await prisma.forestPlan.findFirst({
      where: { tenantId, id: input.planId, deletedAt: null },
      select: { id: true, planType: true, planNumber: true },
    });
    if (!plan) throw new PlanNoEncontradoError();
    const row = await prisma.$transaction(
      async (tx) => {
        await ForestPlanDB.turnoDelPlan(tx, tenantId, input.planId);
        await ForestPlanDB.exigirEspecieNueva(tx, tenantId, input.planId, input.speciesCommon);
        return tx.forestPlanSpecies.create({ data: ForestPlanDB.datosDeEspecie(tenantId, input.planId, input) });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    auditCtp({
      tenantId,
      action: "ctp_plan_especie_alta",
      entity: "ForestPlanSpecies",
      entityId: row.id,
      detail: `Agregó ${row.speciesCommon} con ${fmtM3(Number(row.volumenAutorizadoM3))} m³ al plan ${plan.planType} ${plan.planNumber ?? "(sin N°)"}`,
      user: actor,
    });
    return row;
  }

  static async updateSpecies(
    tenantId: string,
    id: string,
    patch: Partial<Omit<SpeciesInput, "planId">>,
    actor = "unknown",
  ) {
    const antes = await ForestPlanDB.especieViva(tenantId, id);
    const data: Prisma.ForestPlanSpeciesUpdateInput = {};
    const decKeys = new Set(["volumenAutorizadoM3", "valorEstadoNaturalSoles", "precioVentaSoles", "superficieHa"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    const renombra = patch.speciesCommon !== undefined && patch.speciesCommon.trim() !== "";
    const row = await prisma.$transaction(
      async (tx) => {
        if (renombra) {
          await ForestPlanDB.turnoDelPlan(tx, tenantId, antes.planId);
          await ForestPlanDB.exigirEspecieNueva(tx, tenantId, antes.planId, patch.speciesCommon ?? "", id);
        }
        return tx.forestPlanSpecies.update({
          where: { id, tenantId } satisfies Prisma.ForestPlanSpeciesWhereUniqueInput,
          data,
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    const cambios = ForestPlanDB.cambiosDeEspecie(antes, row);
    if (cambios) {
      auditCtp({
        tenantId,
        action: "ctp_plan_especie_editar",
        entity: "ForestPlanSpecies",
        entityId: row.id,
        detail: `Corrigió ${antes.speciesCommon} del plan: ${cambios}`,
        user: actor,
      });
    }
    return row;
  }

  /** «volumen 3,000 → 50,000 m³ · nombre Cedro → Cedro rojo»; `""` si nada cambió. */
  private static cambiosDeEspecie(
    antes: { speciesCommon: string; volumenAutorizadoM3: Prisma.Decimal; speciesScientific: string | null; precioVentaSoles: Prisma.Decimal | null; valorEstadoNaturalSoles: Prisma.Decimal | null; cites: boolean },
    despues: typeof antes,
  ): string {
    const partes: string[] = [];
    const vA = Number(antes.volumenAutorizadoM3);
    const vD = Number(despues.volumenAutorizadoM3);
    if (vA !== vD) partes.push(`volumen ${fmtM3(vA)} → ${fmtM3(vD)} m³`);
    if (antes.speciesCommon !== despues.speciesCommon) partes.push(`nombre ${antes.speciesCommon} → ${despues.speciesCommon}`);
    if ((antes.speciesScientific ?? "") !== (despues.speciesScientific ?? "")) {
      partes.push(`científico ${antes.speciesScientific ?? "—"} → ${despues.speciesScientific ?? "—"}`);
    }
    if (antes.cites !== despues.cites) partes.push(`CITES ${antes.cites ? "sí" : "no"} → ${despues.cites ? "sí" : "no"}`);
    const s = (v: Prisma.Decimal | null) => (v == null ? "—" : `S/ ${Number(v).toFixed(2)}`);
    if (s(antes.precioVentaSoles) !== s(despues.precioVentaSoles)) partes.push(`precio ${s(antes.precioVentaSoles)} → ${s(despues.precioVentaSoles)}`);
    if (s(antes.valorEstadoNaturalSoles) !== s(despues.valorEstadoNaturalSoles)) {
      partes.push(`VEN ${s(antes.valorEstadoNaturalSoles)} → ${s(despues.valorEstadoNaturalSoles)}`);
    }
    return partes.join(" · ");
  }

  static async removeSpecies(tenantId: string, id: string, actor = "unknown") {
    const antes = await ForestPlanDB.especieViva(tenantId, id);
    const row = await prisma.forestPlanSpecies.update({
      where: { id, tenantId } satisfies Prisma.ForestPlanSpeciesWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    auditCtp({
      tenantId,
      action: "ctp_plan_especie_baja",
      entity: "ForestPlanSpecies",
      entityId: id,
      detail: `Quitó ${antes.speciesCommon} (${fmtM3(Number(antes.volumenAutorizadoM3))} m³) del plan`,
      user: actor,
    });
    return row;
  }

  /**
   * Lo autorizado por la resolución, varias especies en UNA llamada.
   *
   * Upsert por especie **normalizada** (`claveEspecie`): si el plan ya tiene la
   * especie —aunque la escriba «Tornillo (Cedrelinga…)» y el pedido «tornillo»—
   * se corrigen sus números; si no, se crea. El nombre de una fila existente no
   * se toca (lo cruzan el balance y el control).
   *
   * - El plan tiene que ser de ESTE tenant y estar vivo: se bloquea su fila
   *   (`FOR UPDATE`, con `tenantId` en el WHERE) y, si no aparece, es
   *   `PlanNoEncontradoError` → 404. El lock además serializa dos guardados
   *   simultáneos: sin él, los dos verían la especie ausente y la crearían dos
   *   veces (no hay índice único que lo impida), duplicando el cupo.
   * - Todo o nada, en una transacción: una resolución a medio cargar declara
   *   un cupo que nadie firmó.
   */
  static async guardarAutorizadasLote(
    tenantId: string,
    planId: string,
    items: readonly ItemAutorizar[],
    actor: string,
  ): Promise<{ creadas: number; actualizadas: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    if (items.length === 0) return { creadas: 0, actualizadas: 0 };

    const r = await prisma.$transaction(async (tx) => {
      const plan = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "ForestPlan"
        WHERE "id" = ${planId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        FOR UPDATE`;
      if (plan.length === 0) throw new PlanNoEncontradoError();
      /* El mismo turno que el alta y el renombre de una especie (merge 04-10):
         con sólo el FOR UPDATE, un POST simultáneo no esperaba y la especie
         quedaba dos veces, sumando el cupo doble. POST/PATCH no toman la fila
         del plan, así que el orden fila → turno no se cruza con nadie. */
      await ForestPlanDB.turnoDelPlan(tx, tenantId, planId);

      const existentes = await tx.forestPlanSpecies.findMany({
        where: { tenantId, planId, deletedAt: null },
        select: { id: true, speciesCommon: true },
      });
      const decision = planDeUpsert(existentes, items);
      if (decision.repetidas.length > 0) throw new EspecieRepetidaError(decision.repetidas);
      if (decision.duplicadasEnPlan.length > 0) throw new EspecieDuplicadaEnPlanError(decision.duplicadasEnPlan);

      for (const it of decision.actualizar) {
        await tx.forestPlanSpecies.update({
          where: { id: it.id, tenantId } satisfies Prisma.ForestPlanSpeciesWhereUniqueInput,
          data: {
            volumenAutorizadoM3: new Prisma.Decimal(it.volumenAutorizadoM3),
            arbolesAutorizados: it.arbolesAutorizados,
          },
        });
      }
      if (decision.crear.length > 0) {
        await tx.forestPlanSpecies.createMany({
          data: decision.crear.map((it) => {
            /* Lo mismo que hace el alta de a una: el científico y CITES salen
               del catálogo, no de lo que se tipee. */
            const cat = findSpeciesByCommonName(it.speciesCommon);
            return {
              tenantId,
              planId,
              speciesCommon: it.speciesCommon,
              speciesScientific: cat?.scientificName ?? null,
              cites: cat?.cites ?? false,
              volumenAutorizadoM3: new Prisma.Decimal(it.volumenAutorizadoM3),
              arbolesAutorizados: it.arbolesAutorizados,
            };
          }),
        });
      }
      return decision;
    });

    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch (err) {
      logger.error("[forest-plan] no se pudo invalidar la caché tras cargar lo autorizado", {
        error: String(err),
        tenantId,
        planId,
      });
    }
    const linea = (it: ItemAutorizar) =>
      `${it.speciesCommon} ${it.volumenAutorizadoM3} m³${it.arbolesAutorizados != null ? ` / ${it.arbolesAutorizados} árb.` : ""}`;
    auditCtp({
      tenantId,
      action: "ctp_plan_especies_lote",
      entity: "ForestPlan",
      entityId: planId,
      detail:
        `Autorizado por especie: ${r.crear.length} nuevas, ${r.actualizar.length} corregidas. ` +
        [...r.crear, ...r.actualizar].map(linea).join("; "),
      user: actor,
    });
    return { creadas: r.crear.length, actualizadas: r.actualizar.length };
  }

  // ─── Censo (árboles) ───────────────────────────────────────────────────
  /**
   * El censo del plan.
   *
   * ⚠️ Viene ACOTADO y eso importa más acá que en otras listas: el Plan
   * Operativo (aprovechables, semilleros, volumen sobre DMC, intensidad por
   * hectárea) se calcula sobre estas filas. Con un censo de 3.000 árboles y un
   * tope de 500, la pantalla no mostraba «faltan 2.500»: mostraba un POA
   * completo y equivocado, que es peor. Por eso `total` es el conteo REAL y
   * quien llame tiene que poder decir «hay N y estás calculando sobre M».
   *
   * El techo por defecto es alto a propósito —un POA de mil hectáreas censa
   * miles de árboles y son filas angostas— y el tope duro existe sólo para que
   * un tenant con un censo absurdo no tumbe el navegador.
   */
  static async listTrees(
    tenantId: string,
    planId: string,
    filters: { estado?: string; search?: string; limit?: number } = {},
  ) {
    const where: Prisma.ForestCensusTreeWhereInput = { tenantId, planId, deletedAt: null };
    if (filters.estado) where.estado = filters.estado;
    if (filters.search) {
      where.OR = [
        { treeCode: { contains: filters.search, mode: "insensitive" } },
        { speciesCommon: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const [trees, total] = await Promise.all([
      prisma.forestCensusTree.findMany({
        where,
        orderBy: { treeCode: "asc" },
        take: Math.min(Math.max(filters.limit ?? 10_000, 1), 20_000),
      }),
      prisma.forestCensusTree.count({ where }),
    ]);
    return { trees, total, truncado: trees.length < total };
  }

  /** Lookup por código — alimenta el autocompletado de Tala (data-driven). */
  static async getTreeByCode(tenantId: string, treeCode: string) {
    if (!tenantId || !treeCode?.trim()) return null;
    return prisma.forestCensusTree.findFirst({
      where: { tenantId, treeCode: treeCode.trim(), deletedAt: null },
    });
  }

  static async addTree(tenantId: string, input: TreeInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.planId) throw new Error("planId is required");
    if (!input.treeCode?.trim()) throw new Error("treeCode is required");
    /* El import ya descarta los repetidos; el alta de a uno no lo hacía y el
       índice de `treeCode` no es único: dos árboles con el mismo código inflan
       el POA con madera que no existe y la Tala no sabe cuál jalar. */
    const repetido = await prisma.forestCensusTree.findFirst({
      where: { tenantId, planId: input.planId, deletedAt: null, treeCode: { equals: input.treeCode.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    if (repetido) throw new CensoCodigoRepetidoError(input.treeCode.trim());
    const dap = input.dapM != null ? Number(input.dapM) : 0;
    const hc = input.alturaComercialM != null ? Number(input.alturaComercialM) : 0;
    const ff = input.factorForma != null ? Number(input.factorForma) : 0.65;
    const vol =
      input.volumenEstimadoM3 != null && input.volumenEstimadoM3 !== ""
        ? Number(input.volumenEstimadoM3)
        : censusVolume(dap, hc, ff);
    const row = await prisma.forestCensusTree.create({
      data: {
        tenantId,
        planId: input.planId,
        treeCode: input.treeCode.trim(),
        speciesCommon: input.speciesCommon.trim(),
        speciesScientific: input.speciesScientific?.trim() || null,
        speciesNative: input.speciesNative?.trim() || null,
        cites: input.cites ?? false,
        dapM: dec(input.dapM),
        alturaComercialM: dec(input.alturaComercialM),
        factorForma: dec(input.factorForma ?? 0.65),
        volumenEstimadoM3: vol > 0 ? new Prisma.Decimal(vol) : null,
        utmZona: input.utmZona?.trim() || null,
        utmX: dec(input.utmX),
        utmY: dec(input.utmY),
        parcelaCorta: input.parcelaCorta?.trim() || null,
        calidad: input.calidad?.trim() || null,
        condicion: input.condicion?.trim() || null,
        estado: input.estado ?? "en_pie",
        notes: input.notes?.trim() || null,
        createdBy: input.createdBy,
      },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  /** Import masivo del censo (cientos de árboles). Devuelve {creados, errores}. */
  /**
   * Importa el censo entero de un plan.
   *
   * ⚠️ Va en LOTES y no fila por fila. Antes hacía un `INSERT` por árbol: 600
   * árboles tardaban 75 segundos medidos —600 viajes al pooler— y un censo real
   * de tres mil habría pasado el timeout del endpoint y dejado el censo a
   * medias, que es la peor forma de fallar en un libro legal.
   *
   * Lo que se valida por fila (código, especie, volumen) es puro y se hace en
   * memoria, así que no cuesta viajes: al servidor sólo van los que ya pasaron.
   * Los códigos repetidos DENTRO del archivo se descartan acá —el índice de
   * `treeCode` no es único en la base, así que nadie más lo haría— y se informan
   * uno por uno: importar dos veces el mismo árbol infla el POA con madera que
   * no existe.
   */
  static async bulkImportTrees(
    tenantId: string,
    planId: string,
    rows: Array<Omit<TreeInput, "planId" | "createdBy">>,
    createdBy: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    const errores: string[] = [];

    /* Los códigos que YA están en el censo: reimportar el mismo archivo no
       puede duplicar árboles. Una sola consulta, no una por fila. */
    const existentes = new Set(
      (
        await prisma.forestCensusTree.findMany({
          where: { tenantId, planId, deletedAt: null },
          select: { treeCode: true },
        })
      ).map((t) => t.treeCode.trim().toLowerCase()),
    );

    const vistos = new Set<string>();
    const data: Prisma.ForestCensusTreeCreateManyInput[] = [];
    for (const r of rows) {
      const code = r.treeCode?.toString().trim();
      const especie = r.speciesCommon?.toString().trim();
      if (!code || !especie) { errores.push("Fila sin código o especie"); continue; }
      const key = code.toLowerCase();
      if (existentes.has(key)) { errores.push(`${code}: ya está en el censo`); continue; }
      if (vistos.has(key)) { errores.push(`${code}: repetido en el archivo`); continue; }
      vistos.add(key);

      const dap = r.dapM != null ? Number(r.dapM) : 0;
      const hc = r.alturaComercialM != null ? Number(r.alturaComercialM) : 0;
      const ff = r.factorForma != null ? Number(r.factorForma) : 0.65;
      const vol =
        r.volumenEstimadoM3 != null && r.volumenEstimadoM3 !== ""
          ? Number(r.volumenEstimadoM3)
          : censusVolume(dap, hc, ff);

      data.push({
        tenantId, planId, createdBy,
        treeCode: code,
        speciesCommon: especie,
        speciesScientific: r.speciesScientific?.trim() || null,
        speciesNative: r.speciesNative?.trim() || null,
        cites: r.cites ?? false,
        dapM: dec(r.dapM),
        alturaComercialM: dec(r.alturaComercialM),
        factorForma: dec(r.factorForma ?? 0.65),
        volumenEstimadoM3: vol > 0 ? new Prisma.Decimal(vol) : null,
        utmZona: r.utmZona?.trim() || null,
        utmX: dec(r.utmX),
        utmY: dec(r.utmY),
        parcelaCorta: r.parcelaCorta?.trim() || null,
        calidad: r.calidad?.trim() || null,
        condicion: r.condicion?.trim() || null,
        estado: r.estado ?? "en_pie",
        notes: r.notes?.trim() || null,
      });
    }

    /* En tandas: un `createMany` de diez mil filas arma una sentencia que el
       pooler rechaza por tamaño. 500 es holgado y son 6 viajes para un censo
       de tres mil, no tres mil. */
    let creados = 0;
    for (let i = 0; i < data.length; i += 500) {
      const r = await prisma.forestCensusTree.createMany({ data: data.slice(i, i + 500) });
      creados += r.count;
    }
    if (creados > 0) {
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* la caché se repuebla sola en la próxima lectura */ }
    }
    return { creados, errores };
  }

  static async updateTree(
    tenantId: string,
    id: string,
    patch: Partial<Omit<TreeInput, "planId" | "createdBy">>,
  ) {
    const data: Prisma.ForestCensusTreeUpdateInput = {};
    const decKeys = new Set(["dapM", "alturaComercialM", "factorForma", "volumenEstimadoM3", "utmX", "utmY"]);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (decKeys.has(k)) (data as Record<string, unknown>)[k] = dec(v as number | string | null);
      else if (typeof v === "string") (data as Record<string, unknown>)[k] = v.trim() || null;
      else (data as Record<string, unknown>)[k] = v;
    }
    const row = await prisma.forestCensusTree.update({
      where: { id, tenantId } satisfies Prisma.ForestCensusTreeWhereUniqueInput,
      data,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  /** Marca un árbol del censo por código (lo usa la Tala al talar). */
  static async markTreeStatusByCode(tenantId: string, treeCode: string, estado: string) {
    if (!tenantId || !treeCode?.trim()) return null;
    const tree = await ForestPlanDB.getTreeByCode(tenantId, treeCode);
    if (!tree) return null;
    const row = await prisma.forestCensusTree.update({
      where: { id: tree.id, tenantId } satisfies Prisma.ForestCensusTreeWhereUniqueInput,
      data: { estado },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  static async softDeleteTree(tenantId: string, id: string) {
    const row = await prisma.forestCensusTree.update({
      where: { id, tenantId } satisfies Prisma.ForestCensusTreeWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return row;
  }

  /**
   * Borra varios árboles del censo de UN plan: los elegidos (`ids`) o todos
   * (`todos`, el «deshacer» de una hoja mal importada). Los talados NO se
   * tocan —son el origen de la cadena de custodia— y se devuelven contados
   * para que la pantalla diga cuántos quedaron y por qué.
   */
  static async softDeleteTrees(
    tenantId: string,
    planId: string,
    sel: { ids?: string[]; todos?: boolean },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId) throw new Error("planId is required");
    if (!sel.todos && !sel.ids?.length) return { borrados: 0, taladosConservados: 0 };
    const elegidos = sel.todos ? {} : { id: { in: sel.ids } };
    const [r, taladosConservados] = await Promise.all([
      prisma.forestCensusTree.updateMany({
        where: { tenantId, planId, deletedAt: null, ...elegidos, estado: { not: "talado" } },
        data: { deletedAt: new Date() },
      }),
      prisma.forestCensusTree.count({ where: { tenantId, planId, deletedAt: null, ...elegidos, estado: "talado" } }),
    ]);
    if (r.count > 0) {
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    }
    return { borrados: r.count, taladosConservados };
  }

  // ─── Balance de extracción / saldos (ADR-126, Fase 3) ──────────────────
  /**
   * Saldo SERFOR = autorizado − movilizado(GTF), por especie, con las líneas
   * de ESTE plan (+ las sin plan). Cruza las especies autorizadas (o, en una
   * plantación, las registradas) con los movimientos del LO-TH:
   *  - talado    = Σ volumen de la sección Tala por especie
   *  - movilizado = Σ volumen de trozas despachadas (resuelto vía Trozado) +
   *                 Σ cantidad de producto terminado despachado en m³
   */
  /**
   * `soloDelPlan`: sin las líneas sin plan. Lo que se DECLARA como de esta
   * plantación (actualización del registro RNPF) no puede incluir madera que el
   * libro no ató a ningún plan (revisión ADR-459).
   */
  static async balanceExtraccion(tenantId: string, planId: string, opts: { soloDelPlan?: boolean } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const [speciesRows, entries, plan] = await Promise.all([
      prisma.forestPlanSpecies.findMany({ where: { tenantId, planId, deletedAt: null } }),
      // Sólo las líneas de ESTE plan y las que no tienen plan (ADR-459). Antes leía
      // el libro entero: el saldo de un plan descontaba las talas de otro y sus
      // especies salían como «fuera del plan» (Blas: la Copaiba y el Sapotillo de
      // la plantación 19-SEC aparecían movilizados en PO-2026-001).
      prisma.forestLothEntry.findMany({
        where: opts.soloDelPlan
          ? { tenantId, deletedAt: null, status: "registrado", planId }
          : { tenantId, deletedAt: null, status: "registrado", OR: [{ planId }, { planId: null }] },
        select: { section: true, speciesCommon: true, speciesScientific: true, trozaCode: true, volumeM3: true, quantity: true, unit: true },
      }),
      prisma.forestPlan.findFirst({ where: { tenantId, id: planId, deletedAt: null } }),
    ]);

    const species: BalanceSpeciesInput[] = speciesRows.map((s) => ({
      speciesCommon: s.speciesCommon,
      speciesScientific: s.speciesScientific,
      cites: s.cites,
      volumenAutorizadoM3: Number(s.volumenAutorizadoM3),
      precioVentaSoles: s.precioVentaSoles ? Number(s.precioVentaSoles) : null,
      valorEstadoNaturalSoles: s.valorEstadoNaturalSoles ? Number(s.valorEstadoNaturalSoles) : null,
    }));
    const movements: BalanceMovement[] = entries.map((e) => ({
      section: e.section,
      speciesCommon: e.speciesCommon,
      speciesScientific: e.speciesScientific,
      trozaCode: e.trozaCode,
      volumeM3: e.volumeM3 ? Number(e.volumeM3) : null,
      quantity: e.quantity ? Number(e.quantity) : null,
      unit: e.unit,
    }));
    const uit = Number(plan?.uitRef ?? 0);
    const area = Number(plan?.areaHa ?? 0);

    const result = computeBalance(species, movements, { uitRef: uit, areaHa: area });
    return {
      ...result,
      plan: plan ? { vigenciaHasta: plan.vigenciaHasta, estado: plan.estado, areaHa: area, uitRef: uit } : null,
    };
  }

  /**
   * Analítica de inteligencia (Batch 2 · frente C): aprovechamiento bosque→producto,
   * balance por especie, proyección de agotamiento del saldo y anomalías.
   * Usa el plan activo si no se pasa planId. Funciona sin plan (sin balance/proyección).
   */
  static async analytics(tenantId: string, planId?: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const plan = planId
      ? await prisma.forestPlan.findFirst({ where: { tenantId, id: planId, deletedAt: null } })
      : await prisma.forestPlan.findFirst({ where: { tenantId, deletedAt: null, estado: "vigente" }, orderBy: { createdAt: "desc" } });

    const [entriesTodas, speciesRows, planesVivos] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        select: {
          id: true, planId: true, status: true, lineNo: true, section: true, speciesCommon: true, speciesScientific: true, trozaCode: true, treeCode: true,
          volumeM3: true, quantity: true, unit: true, entryDate: true, createdAt: true, cites: true, gtfNumber: true,
        },
      }),
      plan
        ? prisma.forestPlanSpecies.findMany({ where: { tenantId, planId: plan.id, deletedAt: null } })
        : Promise.resolve([]),
      prisma.forestPlan.findMany({ where: { tenantId, deletedAt: null }, select: { id: true } }),
    ]);

    // Con un plan PEDIDO y más de un plan en el negocio, sólo cuenta lo de ese plan (misma
    // atribución que «Extracción»): sin esto el movilizado de todos se cruzaba con los precios
    // de UNO y los despachos sin plan se valorizaban en cada plan. Sin `planId` (Cumplimiento,
    // resumen, informe) sigue el libro entero.
    let idsDelPlan: string[] | null = null;
    let sinAtribuir: { lineas: number; ambiguas: number } | null = null;
    let entries = entriesTodas;
    if (plan && planId && planesVivos.length > 1) {
      const arbolesRaw = await prisma.forestCensusTree.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, planId: true, treeCode: true, speciesCommon: true, cites: true, dapM: true, volumenEstimadoM3: true, estado: true, condicion: true },
        orderBy: { id: "asc" },
        take: TOPE_ARBOLES,
      });
      const n = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : Number(v));
      const propias = lineasDelPlanFn(
        planesVivos.map((p) => p.id),
        plan.id,
        arbolesRaw.map((a) => ({ ...a, dapM: n(a.dapM), volumenEstimadoM3: n(a.volumenEstimadoM3) })),
        entriesTodas.map((e) => ({ ...e, volumeM3: n(e.volumeM3), quantity: n(e.quantity) })),
      );
      entries = entriesTodas.filter((e) => propias.ids.has(e.id));
      idsDelPlan = [...propias.ids];
      sinAtribuir = propias.sinPlan;
    }

    const movements: BalanceMovement[] = entries.map((e) => ({
      section: e.section, speciesCommon: e.speciesCommon, speciesScientific: e.speciesScientific, trozaCode: e.trozaCode,
      volumeM3: e.volumeM3 ? Number(e.volumeM3) : null, quantity: e.quantity ? Number(e.quantity) : null, unit: e.unit,
    }));

    const aprovechamiento = computeAprovechamiento(movements);

    let balance: ReturnType<typeof computeBalance> | null = null;
    if (plan && speciesRows.length > 0) {
      const species: BalanceSpeciesInput[] = speciesRows.map((s) => ({
        speciesCommon: s.speciesCommon, speciesScientific: s.speciesScientific, cites: s.cites, volumenAutorizadoM3: Number(s.volumenAutorizadoM3),
        precioVentaSoles: s.precioVentaSoles ? Number(s.precioVentaSoles) : null,
        valorEstadoNaturalSoles: s.valorEstadoNaturalSoles ? Number(s.valorEstadoNaturalSoles) : null,
      }));
      balance = computeBalance(species, movements, { uitRef: Number(plan.uitRef ?? 0), areaHa: Number(plan.areaHa ?? 0) });
    }

    // Fuera de plazo — predicado ÚNICO (loth-constants), no re-implementado acá.
    const lateCount = entries.filter((e) => estaFueraDePlazo(e.entryDate, e.createdAt)).length;

    const anomalias = detectAnomalias(movements, balance?.rows ?? [], lateCount);

    let projection = null;
    if (balance) {
      const saldoTotal = balance.rows.reduce((a, r) => a + Math.max(0, r.saldo), 0);
      const movilizadoTotal = balance.rows.reduce((a, r) => a + r.movilizado, 0);
      const firstActivity = entries.reduce<Date | null>((min, e) => (e.entryDate && (!min || e.entryDate < min) ? e.entryDate : min), null);
      projection = projectSaldo(saldoTotal, movilizadoTotal, firstActivity?.toISOString() ?? null, new Date().toISOString());
    }

    // Costeo y margen por m³ (Batch 3): cruza balance × precios × parámetros de costo del plan.
    const costos = {
      extraccionM3: Number(plan?.costoExtraccionM3 ?? 0),
      transformacionM3: Number(plan?.costoTransformacionM3 ?? 0),
      fleteM3: Number(plan?.costoFleteM3 ?? 0),
    };
    let costeo = null;
    if (plan && balance && speciesRows.length > 0) {
      const costeoInputs: CosteoSpeciesInput[] = balance.rows.map((r) => {
        const sp = speciesRows.find((s) => s.speciesCommon === r.species);
        return {
          species: r.species, cites: sp?.cites ?? false, movilizadoM3: r.movilizado,
          precioVentaM3: sp?.precioVentaSoles ? Number(sp.precioVentaSoles) : 0,
          venM3: sp?.valorEstadoNaturalSoles ? Number(sp.valorEstadoNaturalSoles) : 0,
        };
      });
      costeo = computeCosteo(costeoInputs, costos);
    }

    // Especies CITES presentes en el libro (para el cruce con el catálogo de
    // permisos en el panel Cumplimiento — informativo, no resta score).
    const citesEspecies = [
      ...new Set(entries.filter((e) => e.cites && e.speciesCommon).map((e) => e.speciesCommon as string)),
    ];

    // Especies con operaciones en el libro que NO figuran entre las autorizadas
    // del plan (tala/movilización fuera del POA — infracción que cruza OSINFOR).
    // Sólo si el plan declara especies; match case-insensitive. Sin query extra:
    // reusa `entries` + `speciesRows` ya cargados. T7 ya frena el despacho; esto
    // surfacea además la tala/trozado de una especie fuera del plan en el informe.
    // El cruce va por CLAVE canónica, no por string: el plan copia el nombre de
    // la resolución («Tornillo (Cedrelinga catenaeformis)») y el libro asienta
    // el común («Tornillo»). Compararlos literalmente acusaba de infracción a
    // un titular que estaba en regla, le dejaba el saldo POA intacto habiendo
    // talado y le mostraba la rentabilidad en cero.
    const cruce =
      speciesRows.length > 0
        ? cruzarEspecies(
            entries.map((e) => e.speciesCommon?.trim()).filter((s): s is string => !!s),
            speciesRows.map((s) => s.speciesCommon),
          )
        : { autorizadas: new Map<string, string>(), sinAutorizar: [], ambiguas: [] };
    const especiesNoAutorizadas = cruce.sinAutorizar;
    /** Parecidas pero escritas distinto: es nomenclatura, no infracción. */
    const especiesAmbiguas = cruce.ambiguas;

    return {
      hasPlan: !!plan,
      plan: plan
        ? {
            id: plan.id, planNumber: plan.planNumber ?? null, titularName: plan.titularName, estado: plan.estado, vigenciaHasta: plan.vigenciaHasta, costos,
            /* Para que el informe del libro sepa si es una plantación (ADR-459): ahí se habla de «registrado», no de «autorizado». */
            planType: plan.planType, tituloHabilitante: plan.tituloHabilitante ?? null,
          }
        : null,
      aprovechamiento, balance, anomalias, projection, lateCount, costeo, citesEspecies, especiesNoAutorizadas, especiesAmbiguas,
      /** Sólo con un plan pedido y 2+ planes: ids de las líneas de ESE plan, y lo que no se pudo atribuir a ninguno. */
      idsDelPlan, sinAtribuir,
    };
  }

  // ─── Stats del plan (censo) ────────────────────────────────────────────
  static async censusSummary(tenantId: string, planId: string) {
    const rows = await prisma.forestCensusTree.groupBy({
      by: ["estado"],
      where: { tenantId, planId, deletedAt: null },
      _count: { _all: true },
      _sum: { volumenEstimadoM3: true },
    });
    return rows.map((r) => ({
      estado: r.estado,
      count: r._count._all,
      volumenEstimadoM3: r._sum.volumenEstimadoM3?.toNumber() ?? 0,
    }));
  }

  // ─── Extracción del Libro TH (ADR-454) ─────────────────────────────────

  /**
   * La vista «Extracción»: por permiso (plan) y por especie, el censo
   * aprovechable contra lo talado, trozado y despachado, con un saldo por
   * operación y la cadena hasta el aserrado del CTP. Sólo lectura.
   *
   * Lee TODO lo del negocio en 7 consultas en paralelo (planes, especies,
   * censo, líneas, permisos, trozas del CTP atadas a su trozado, POA) y lo
   * arma `armarExtraccion` (puro). Los censos de TODOS los planes entran
   * aunque se pida uno: una línea sin plan se atribuye por su árbol, y si su
   * árbol es de otro plan no puede caer en éste.
   *
   * `null` = el plan o el permiso pedido no existe en este negocio (404).
   * Topes: 20 000 árboles y 50 000 líneas; si se alcanzan, `limites.truncado`
   * y el aviso `libro_truncado`.
   */
  static async extraccion(tenantId: string, f: ExtraccionFiltro): Promise<ExtraccionResponse | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const [planes, especies, arbolesRaw, lineasRaw, contratos, trozasCtp] = await Promise.all([
      prisma.forestPlan.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, planNumber: true, planType: true, titularName: true, alias: true, estado: true,
          tituloHabilitante: true, contratoId: true, vigenciaDesde: true, vigenciaHasta: true, areaHa: true,
        },
      }),
      prisma.forestPlanSpecies.findMany({
        where: { tenantId, deletedAt: null },
        select: { planId: true, speciesCommon: true, cites: true, volumenAutorizadoM3: true, arbolesAutorizados: true },
      }),
      prisma.forestCensusTree.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true, planId: true, treeCode: true, speciesCommon: true, cites: true,
          dapM: true, volumenEstimadoM3: true, estado: true, condicion: true,
        },
        orderBy: { id: "asc" },
        take: TOPE_ARBOLES + 1,
      }),
      prisma.forestLothEntry.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: ["registrado", "anulado"] },
          section: { in: [...SECCIONES_EXTRACCION] },
        },
        select: {
          id: true, planId: true, section: true, status: true, lineNo: true, entryDate: true,
          treeCode: true, trozaCode: true, speciesCommon: true, cites: true,
          volumeM3: true, quantity: true, unit: true, gtfNumber: true,
        },
        orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
        take: TOPE_LINEAS + 1,
      }),
      prisma.forestContrato.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, codigo: true, codigoNorm: true, planId: true },
      }),
      // Recibida en planta (ADR-450): la troza guarda su línea de Trozado; ingreso vivo, no anulado ni rechazado.
      prisma.woodEntryTroza.findMany({
        where: {
          tenantId,
          lothTrozadoId: { not: null },
          noRecepcionada: false,
          entry: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } },
        },
        select: {
          lothTrozadoId: true,
          volumenM3: true,
          consumidaEn: { select: { tenantId: true, deletedAt: true, status: true } },
          entry: { select: { fechaRecepcion: true, entryDate: true } },
        },
        take: TOPE_LINEAS + 1,
      }),
    ]);

    const truncado = arbolesRaw.length > TOPE_ARBOLES || lineasRaw.length > TOPE_LINEAS || trozasCtp.length > TOPE_LINEAS;
    const arbolesLeidos = arbolesRaw.slice(0, TOPE_ARBOLES);
    const lineasLeidas = lineasRaw.slice(0, TOPE_LINEAS);

    // Alcance: un plan, los planes de un permiso, «Sin plan» o todo el negocio.
    const permisos = contratos.map((c) => ({ id: c.id, codigo: c.codigo, codigoNorm: c.codigoNorm, planId: c.planId }));
    let planesEnAlcance: string[] | null = null;
    let conSinPlan = true;
    let permisoSinPlan: { contratoId: string; codigo: string } | null = null;
    const planId = f.planId?.trim() || null;
    const contratoId = f.contratoId?.trim() || null;
    if (planId === PLAN_ID_SIN_PLAN) {
      planesEnAlcance = [];
    } else if (planId) {
      if (!planes.some((p) => p.id === planId)) return null;
      planesEnAlcance = [planId];
      conSinPlan = false;
    } else if (contratoId) {
      const permiso = permisos.find((p) => p.id === contratoId);
      if (!permiso) return null;
      planesEnAlcance = planes.filter((p) => permisoDelPlan(p, permisos)?.contratoId === permiso.id).map((p) => p.id);
      conSinPlan = false;
      if (planesEnAlcance.length === 0) permisoSinPlan = { contratoId: permiso.id, codigo: permiso.codigo };
    }

    /* La config del POA de cada plan con su origen (guardada, o el defecto del
       plan: plantación 0 %, bosque 10 % — ADR-455). Se pasa el plan ya leído:
       el KV se lee una vez por plan, el plan no se vuelve a leer. */
    const poaDe = new Map(
      await Promise.all(
        planes.map(async (p) => [p.id, await ForestLothPoaDB.leer(tenantId, p.id, p)] as const),
      ),
    );
    const num = (v: Prisma.Decimal | number | null | undefined): number | null => (v == null ? null : Number(v));
    const dia = (v: Date | null): string | null => (v ? diaUtc(v) || null : null);

    const planesEntrada: PlanDeExtraccion[] = planes.map((p) => ({
      id: p.id,
      planNumber: p.planNumber,
      planType: p.planType,
      titular: p.titularName,
      alias: p.alias,
      estado: p.estado,
      tituloHabilitante: p.tituloHabilitante,
      contratoId: p.contratoId,
      vigenciaDesde: dia(p.vigenciaDesde),
      vigenciaHasta: dia(p.vigenciaHasta),
      areaHa: num(p.areaHa),
      poa: {
        config: poaDe.get(p.id)?.config ?? defaultPoaConfig(p),
        configurado: poaDe.get(p.id)?.origen === "guardado",
      },
      especies: especies
        .filter((e) => e.planId === p.id)
        .map((e) => ({
          speciesCommon: e.speciesCommon,
          cites: e.cites,
          volumenAutorizadoM3: Number(e.volumenAutorizadoM3),
          arbolesAutorizados: e.arbolesAutorizados,
        })),
    }));

    return armarExtraccion({
      hoy: new Date(),
      alcance: { planId, contratoId },
      planesEnAlcance,
      conSinPlan,
      permisoSinPlan,
      planes: planesEntrada,
      permisos,
      arboles: arbolesLeidos.map((a) => ({
        id: a.id,
        planId: a.planId,
        treeCode: a.treeCode,
        speciesCommon: a.speciesCommon,
        cites: a.cites,
        dapM: num(a.dapM),
        volumenEstimadoM3: num(a.volumenEstimadoM3),
        estado: a.estado,
        condicion: a.condicion,
      })),
      lineas: lineasLeidas.map((l) => ({ ...l, volumeM3: num(l.volumeM3), quantity: num(l.quantity) })),
      recepciones: trozasCtp.flatMap((t) =>
        t.lothTrozadoId
          ? [{
              lothTrozadoId: t.lothTrozadoId,
              volumenM3: num(t.volumenM3),
              aserrada: !!t.consumidaEn && t.consumidaEn.tenantId === tenantId && t.consumidaEn.deletedAt == null && t.consumidaEn.status !== "anulado",
              // Fecha date-only: el día UTC, como el resto del libro.
              dia: (t.entry?.fechaRecepcion ?? t.entry?.entryDate ?? null)?.toISOString().slice(0, 10) ?? null,
            }]
          : [],
      ),
      desde: f.desde ?? null,
      hasta: f.hasta ?? null,
      antDesde: f.antDesde ?? null,
      antHasta: f.antHasta ?? null,
      limites: { arbolesLeidos: arbolesLeidos.length, lineasLeidas: lineasLeidas.length, truncado },
    });
  }
}
