/**
 * ForestLothDB — Libro de Operaciones de Títulos Habilitantes (LO-TH), ADR-125.
 *
 * Libro del titular de la concesión/permiso EN EL BOSQUE (≠ LO-CTP de planta).
 * Tabla unificada `ForestLothEntry` con discriminador `section` (6 secciones)
 * + carátula `ForestLothCaratula` (1 por tomo).
 *
 * Patrón estándar Buleje:
 * - tenantId 1er parámetro (multi-tenant guard)
 * - Sin Prisma directo desde API/UI (siempre via esta clase)
 * - Cache invalidate por write
 * - lineNo correlativo calculado max+1 por (tenant, carátula, sección)
 * - Subsanación SERFOR: anular es visible (status=anulado), no se borra
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { LOTH_SECTIONS, claveEnElPlan, claveEspecie, type LothSection } from "@/lib/forestal/loth-constants";
import { auditLoth, type LothAuditAction, type LothAuditEntity, type SesionDeAuditoria } from "@/lib/forestal/loth-audit";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { ForestLothPoaDB } from "@/lib/db/forest-loth-poa.db";
import { dmcParaEspecie, esPlanDePlantacion } from "@/lib/forestal/loth-poa";
import { especieEnRegistro, mensajeEspecieFueraDelRegistro } from "@/lib/forestal/loth-plan-especie";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { resumirUsoDelCenso, type UsoArbolCenso } from "@/lib/forestal/loth-censo-uso";
import { estadoDeArboles as estadoDeArbolesDelLibro, type EstadoDeArbolesPlan } from "@/lib/forestal/loth-etapa-arbol";
import { arbolesParaTrazar } from "@/lib/forestal/loth-importar-guia";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { colaDeGtf, mismoNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { ESTADOS_SIN_INGRESO, GtfNumeroDB, GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { gtfRegistradaDesdeApi } from "@/lib/forestal/loth-cuadre-guias";
import { planFichaDesdeApi } from "@/lib/forestal/loth-ficha-permiso";
import type { DatosAvisoTh } from "@/lib/forestal/loth-aviso-plazos";
import { leerGtfDatos, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { identidadDeGuiaTh } from "@/lib/forestal/guia-th-al-ctp";
import { PRODUCTO_TROZA, lineasDeLaGuia, piezasDeItems, type TrozaDelLibro } from "@/lib/forestal/loth-guia-despacho";
import { armarArbolDeTroza, lineaVigente, type ArbolDeTroza } from "@/lib/forestal/arbol-de-troza";
import type { FiltroPermiso } from "@/lib/forestal/loth-filtro-permiso";
import { closedPeriodOf } from "@/lib/forestal/loth-cierre-types";
import type { AtarSinPlanConteo, AtarSinPlanResultado, AtarSeccion } from "@/lib/forestal/loth-atar-sin-plan";
import { avisoCupoAlTalar, entradaDelPlan, motivoCupoValido, notaSobreCupo, MOTIVO_CUPO_MIN, type AvisoCupo, type EntradaCupo } from "@/lib/forestal/loth-cupo-especie";
import { resolverTalaContraCenso } from "@/lib/forestal/loth-tala-del-censo";
import { anotarDespachoT6, claveT6, excedeT6, mensajeT6, type DespachoT6DeLaEspecie, type MedidaT6 } from "@/lib/forestal/loth-t6";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { logger } from "@/lib/logger";
import {
  MAX_LINEAS_A_BORRAR,
  ORDEN_DE_BORRADO,
  contarLineasDelPlan,
  esSeccion,
  planearBorrado,
  type ConteoBorrarDelPlan,
  type LineaParaBorrar,
  type ResultadoBorrarDelPlan,
  type ResultadoBorrarLineas,
} from "@/lib/forestal/loth-borrar-del-plan";

export { LOTH_SECTIONS };
export type { LothSection };

/** Redondeo a 4 decimales — precisión forestal (m³/cantidad). */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Timeout de las transacciones del LO-TH. Igual criterio que `CTP_TX_OPTS`: los
 * guards hacen varios round-trips dentro de la tx (lock FOR UPDATE + reads +
 * insert) y el default de Prisma (5s) los pasa contra el pooler remoto. `maxWait`
 * cubre la espera por conexión cuando dos altas pelean por las mismas filas.
 */
export const LOTH_TX_OPTS = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * Error de invariante del LO-TH: el caller lo mapea a 422 (dato del operador que
 * no cuadra), NO a 500. Gemelo de `CtpInvariantError` (ADR-134/135) — las
 * invariantes T1–T8 (ADR-305) son la cadena de custodia del bosque traducida a
 * código. Postgres no puede expresarlas (son agregadas + aislamiento app-level),
 * así que si no se aplican acá, no se aplican en ningún lado.
 *
 *   T1 · una troza sale (despacho ∪ consumo) UNA sola vez  → doble movilización
 *   T2 · despachar/consumir exige que la troza esté trozada → troza fantasma
 *   T3 · trozaCode único en Trozado; treeCode único en Tala → cadena ambigua
 *   T4 · Σ trozado(árbol) ≤ volumen de la tala del árbol    → trozar más que lo tumbado
 *   T5 · Σ despacho_producto ≤ Σ producto_terminado         → despachar más que lo producido
 *   T6 · Σ movilizado(especie) ≤ volumen autorizado (POA)   → EXCESO DE APROVECHAMIENTO (OSINFOR)
 *   T7 · la especie movilizada debe estar AUTORIZADA en el plan → tala/movilización de especie fuera del POA (infracción)
 *        En una PLANTACIÓN con especies registradas, también la TALA (ADR-459).
 *   T8 · no se tala un árbol censado bajo el DMC de su especie → tala ilegal (RJ 458-2002-INRENA)
 *   T9 · Σ talado(especie) ≤ volumen AUTORIZADO + 0,01 m³ → se registra IGUAL con
 *        motivo escrito (el libro refleja lo que pasó en el monte). Sin autorizado,
 *        el cupo es el censo y pasarlo sólo se avisa y se audita.
 */
export class LothInvariantError extends Error {
  constructor(
    message: string,
    readonly code:
      | "T1_TROZA_YA_MOVILIZADA"
      | "T2_TROZA_SIN_TROZADO"
      | "T3_TROZA_DUPLICADA"
      | "T3_TALA_DUPLICADA"
      | "T4_TROZADO_SUPERA_TALA"
      | "T5_DESPACHO_SUPERA_PRODUCCION"
      | "T8_BAJO_DMC"
      | "T9_CUPO_ESPECIE"
      | "T6_EXCESO_AUTORIZADO"
      | "T7_ESPECIE_NO_AUTORIZADA"
      // P1 — la línea cae en un mes cerrado: el acta es inmutable hasta reabrir.
      | "PERIODO_CERRADO"
      // Una carátula con líneas vivas es un libro que existe: no se borra.
      | "CARATULA_CON_LINEAS"
      // Una guía ampara UN título: trozas de dos planes son dos guías.
      | "GUIA_VARIOS_PLANES"
      | "GUIA_VARIOS_PLANES"
      // El planId de la línea no es un plan vivo de ESTE negocio (sin FK: se valida
      // acá). Un solo código para el alta, el importador y «atar sin plan» (→ 400 en el alta).
      | "PLAN_NO_EXISTE"
      | "SIN_SECCIONES"
      // La tala de un árbol del censo va con el plan y la especie del censo.
      | "TALA_PLAN_DISTINTO_AL_CENSO"
      | "TALA_ARBOL_EN_VARIOS_PLANES"
      | "TALA_ESPECIE_DISTINTA_AL_CENSO",
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LothInvariantError";
  }
}

/**
 * El dato cuadra pero QUIEN lo asienta no puede (→ 403, no 422). Hoy: una tala
 * por encima de lo AUTORIZADO para su especie la registra sólo el dueño o el
 * administrador — es la excepción que el titular firma ante OSINFOR, no la
 * decide el almacenero con su propio motivo (auditoría T9, 30-09).
 */
export class LothPermisoError extends Error {
  readonly code = "T9_SOLO_DUENO" as const;
  constructor(
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LothPermisoError";
  }
}

export interface LothEntryCreateInput {
  caratulaId?: string | null;
  planId?: string | null;
  section: LothSection;
  entryDate?: Date;

  treeCode?: string | null;
  trozaCode?: string | null;
  despachoCode?: string | null;
  isRama?: boolean;

  speciesCommon?: string | null;
  speciesScientific?: string | null;
  cites?: boolean;

  diamMayorM?: number | string | null;
  diamMenorM?: number | string | null;
  lengthM?: number | string | null;
  volumeM3?: number | string | null;

  productType?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  pieces?: number | null;

  gtfNumber?: string | null;

  discarded?: boolean;
  consumoInterno?: boolean;
  /** ADR-422: medidas crudas de campo (respaldo del promedio y la longitud). */
  medicionCruda?: unknown;
  /** RDE 264-2019 §1 item 3: el código va marcado en el fuste y en el tocón. */
  marcadoFuste?: boolean;
  marcadoTocon?: boolean;
  observations?: string | null;
  /**
   * Motivo por el que se tala un árbol bajo el DMC de su especie (T8). Sin esto
   * el alta se rechaza; con esto queda registrado en el libro y en la auditoría,
   * que es lo que se le exige explicar al titular ante la ARFFS.
   */
  justificacionDmc?: string | null;
  /**
   * Motivo por el que se registra una tala que deja a su especie por encima del
   * cupo (T9). Sin esto el alta se rechaza con el número; con esto se registra y
   * el motivo queda en la línea y en la auditoría.
   */
  motivoSobreCupo?: string | null;
  /**
   * ¿Quién asienta puede registrar una tala por encima de lo AUTORIZADO? Lo
   * decide la RUTA por el rol del JWT (admin/owner), nunca el body. Sin esto
   * (undefined) se niega: el default seguro.
   */
  puedeExcederCupo?: boolean;
  /** IP y navegador de quien asienta (los pone la ruta): van al evento sobre-cupo, no a la línea. */
  sesion?: SesionDeAuditoria;

  correctsLineNo?: number | null;
  correctionNote?: string | null;

  gpsLat?: number | string | null;
  gpsLng?: number | string | null;
  photoUrl?: string | null;
  /** De dónde salió el GPS: el teléfono en el tocón, la coordenada del censo o una UTM tipeada. */
  gpsOrigen?: "telefono" | "censo" | "utm" | null;

  /** Datos internos de la tala (NO salen en el formato SERFOR). */
  motosierrista?: string | null;
  motosierristaId?: string | null;
  /** «HH:MM» de la tumba. */
  horaTala?: string | null;

  createdBy: string;
}

export interface LothListFilters {
  section?: LothSection;
  caratulaId?: string;
  search?: string; // matches code/species/gtf
  includeAnnulled?: boolean;
  limit?: number;
  offset?: number;
  /** De qué permiso (02-10-2026, `lib/forestal/loth-filtro-permiso`). Sin esto, el libro entero. */
  permiso?: FiltroPermiso | null;
}

/**
 * El `where` del filtro por permiso. Va siempre DENTRO de un `AND` junto al
 * `tenantId`: la búsqueda también usa `OR`, y dos `OR` en el mismo objeto se pisan.
 */
function wherePermiso(f: FiltroPermiso): Prisma.ForestLothEntryWhereInput {
  if (f.tipo === "sin-plan") return { planId: null };
  return f.conSinPlan ? { OR: [{ planId: f.planId }, { planId: null }] } : { planId: f.planId };
}

export interface LothCaratulaInput {
  registroNumber?: string | null;
  tomo?: string | null;
  titularName: string;
  representanteLegal?: string | null;
  tituloHabilitante?: string | null;
  ruc?: string | null;
  dni?: string | null;
  domicilio?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  telefono?: string | null;
  email?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
  resolucionDate?: Date | null;
  createdBy: string;
}

const CACHE_PREFIX = "forest-loth";

/** Cubicación Smalian/SERFOR (re-export de la fórmula pura). */
export { smalianVolume } from "@/lib/forestal/loth-constants";

const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

/**
 * Observaciones de la línea + la justificación del DMC, si la hubo. Se guardan
 * juntas y con prefijo explícito para que la excepción se lea de una en el libro
 * (y en el export a la ARFFS), no escondida en un campo aparte.
 */
function buildObservations(input: { observations?: string | null; justificacionDmc?: string | null }): string | null {
  const obs = input.observations?.trim() || "";
  const just = input.justificacionDmc?.trim() || "";
  if (!just) return obs || null;
  return `[Tala bajo DMC justificada: ${just}]${obs ? ` ${obs}` : ""}`.slice(0, 2000);
}

/** Descripción legible de una línea para el audit log (fiscalizador-friendly). */
export function describeEntry(e: {
  section: string;
  lineNo: number;
  treeCode: string | null;
  trozaCode: string | null;
  speciesCommon: string | null;
  volumeM3: Prisma.Decimal | null;
  productType: string | null;
  quantity: Prisma.Decimal | null;
  unit: string | null;
  gtfNumber: string | null;
}): string {
  const code = e.trozaCode || e.treeCode || e.productType || "—";
  const esp = e.speciesCommon ? ` · ${e.speciesCommon}` : "";
  const vol = e.volumeM3 != null ? ` · ${fmtM3(Number(e.volumeM3))} m³` : "";
  const qty = e.quantity != null ? ` · ${Number(e.quantity).toFixed(4)} ${e.unit ?? ""}`.trimEnd() : "";
  const gtf = e.gtfNumber ? ` · GTF ${e.gtfNumber}` : "";
  return `Registró ${e.section} #${e.lineNo}: ${code}${esp}${vol}${qty}${gtf}`;
}

/** Lo que el borrado en bloque lee de cada línea. */
const SEL_BORRAR = {
  id: true, section: true, status: true, lineNo: true, treeCode: true, trozaCode: true,
  volumeM3: true, entryDate: true, gtfNumber: true, planId: true,
} as const satisfies Prisma.ForestLothEntrySelect;
type FilaParaBorrar = Prisma.ForestLothEntryGetPayload<{ select: typeof SEL_BORRAR }>;

export class ForestLothDB {
  // ─── Entries ─────────────────────────────────────────────────────────

  /**
   * El plan de una línea lo decide SU FUENTE, no el selector: el trozado es del
   * plan de su tala, el despacho y el consumo del plan de su troza (revisión
   * ADR-459). El importador con un permiso elegido para un archivo que mezcla
   * talas de dos planes —o cualquier cliente con el plan equivocado— dejaba la
   * troza contando en el saldo de otro permiso y juzgada (T6/T7) contra otro
   * registro. Sin fuente encontrada, o fuente sin plan, manda lo que vino.
   */
  private static async planDeLaFuente(tenantId: string, input: LothEntryCreateInput): Promise<string | null> {
    const treeCode = input.treeCode?.trim() || null;
    const trozaCode = input.trozaCode?.trim() || null;
    let fuente: { planId: string | null } | null = null;
    if (input.section === "trozado" && treeCode) {
      fuente = await prisma.forestLothEntry.findFirst({
        where: { tenantId, section: "tala", treeCode, status: "registrado", deletedAt: null },
        select: { planId: true },
      });
    } else if ((input.section === "despacho_troza" || input.section === "consumo_troza") && trozaCode) {
      fuente = await prisma.forestLothEntry.findFirst({
        where: { tenantId, section: "trozado", trozaCode, status: "registrado", deletedAt: null },
        select: { planId: true },
      });
    }
    const pedido = input.planId?.trim() || null;
    if (!fuente?.planId || fuente.planId === pedido) return pedido;
    /* El plan de la fuente manda sólo si sigue vivo: una tala de un plan dado
       de baja no deja la troza sin poder registrarse. */
    const vivo = await prisma.forestPlan.findFirst({ where: { tenantId, id: fuente.planId, deletedAt: null }, select: { id: true } });
    return vivo ? fuente.planId : pedido;
  }

  /**
   * Crea una línea del libro dentro de UNA transacción que valida las
   * invariantes de cadena de custodia (T1–T5, ADR-305) y asigna el correlativo
   * `lineNo` bajo LOCK. Antes de esto el `create` insertaba sin ninguna guarda:
   * se podía movilizar dos veces la misma troza, trozar más de lo tumbado o
   * despachar más de lo producido — justo lo que fiscaliza OSINFOR. La Analítica
   * lo detectaba DESPUÉS; acá se IMPIDE.
   *
   * T9 (cupo de la especie) va en la misma tx, con su lock ÚLTIMO.
   *
   * Lanza `LothInvariantError` (→ 422) si el dato rompe la cadena y
   * `LothPermisoError` (→ 403) si quien asienta no puede pasar lo autorizado.
   */
  static async create(tenantId: string, pedido: LothEntryCreateInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!LOTH_SECTIONS.includes(pedido.section)) {
      throw new Error(`invalid section: ${pedido.section}`);
    }
    if (!pedido.createdBy?.trim()) throw new Error("createdBy is required");

    // El plan y la especie los pone la BASE, no el navegador: planId del
    // tenant y, en la tala de un árbol censado, el plan y la especie del censo
    // (auditoría T9, 30-09). Antes de todo lo demás: el DMC, T3 y el cupo miden
    // con esto, y es lo que se guarda. Un plan ajeno o de baja → `PLAN_NO_EXISTE`
    // (security, 02-10: sin él, T6 y T7 no tenían contra qué juzgar).
    const resuelta = await ForestLothDB.resolverPlanYArbol(tenantId, pedido);

    // P1 (cierre de período): no se puede registrar una línea fechada en un mes
    // cerrado — el acta es inmutable hasta reabrir. Se chequea antes de la tx.
    const entryDate = resuelta.entryDate ?? new Date();
    const cerrado = await ForestLothCierreDB.closedPeriodOf(tenantId, entryDate);
    if (cerrado) {
      throw new LothInvariantError(
        `El período ${cerrado.label} está cerrado: no se pueden registrar líneas fechadas en un mes cerrado. Reábrelo si necesitas corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    // De acá en adelante (T6/T7, T9, saldo, el asiento) la línea lleva el plan
    // de su FUENTE (ADR-459): el trozado, el de su tala; el despacho y el
    // consumo, el de su troza. `planDeLaFuente` sólo lo cambia por un plan vivo.
    const input: LothEntryCreateInput = { ...resuelta, planId: await ForestLothDB.planDeLaFuente(tenantId, resuelta) };

    // T8 (DMC): un árbol censado por debajo del diámetro mínimo de corta de su
    // especie no se aprovecha. Va ANTES de la tx porque no hay recurso disputado
    // (es el dato contra el censo, no una carrera entre dos altas).
    await ForestLothDB.enforceDmc(tenantId, input);

    const entry = await prisma.$transaction(
      (tx) => ForestLothDB.asentarEnTx(tx, tenantId, input, entryDate),
      LOTH_TX_OPTS,
    );

    auditLoth({
      tenantId,
      action: "loth_linea_create",
      entity: "ForestLothEntry",
      entityId: entry.id,
      detail: describeEntry(entry),
      user: input.createdBy,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return entry;
  }

  /**
   * El cuerpo de `create` dentro de una transacción ajena: invariantes (T1–T7,
   * lockeando el recurso disputado) + correlativo bajo lock + T9 (cupo de la
   * especie) + la fila. Lo usa el importador de guías ya despachadas (ADR-461),
   * que asienta tala, trozado y despacho de UNA guía en una sola transacción.
   *
   * NO revisa el mes cerrado (P1), el plan ni el DMC (T8): eso lo hace quien
   * llama, antes de abrir la transacción — como `create`. Tampoco audita ni
   * invalida la caché: eso va DESPUÉS del commit (el evento sobre-cupo, sí: va
   * en la tx, como en `create`).
   *
   * Lo que `create` resuelve antes de la tx y acá no hay quién: la tala de un
   * árbol del censo de SU plan va con la especie del censo (`especieDelCensoEnTx`).
   * Sin esto, una ficha con otra especie esquivaba el cupo (auditoría T9, 30-09).
   * Si quien llama no decide el rol (`puedeExcederCupo` sin definir), pasar lo
   * AUTORIZADO se rechaza siempre (sin motivo, el 422 de T9).
   *
   * `correlativos` (opcional) recuerda el último N° por sección dentro de la
   * misma transacción: el lock de la sección se toma una vez y las líneas
   * siguientes siguen la cuenta, en vez de dos consultas más por línea.
   */
  static async registrarLineaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: LothEntryCreateInput,
    entryDate: Date,
    correlativos?: Map<string, number>,
    /** De dónde sale la línea, para el evento sobre-cupo («tala nueva de la GTF …»). */
    origen?: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const resuelta = await ForestLothDB.especieDelCensoEnTx(tx, tenantId, input);
    return ForestLothDB.asentarEnTx(tx, tenantId, resuelta, entryDate, correlativos, origen);
  }

  /**
   * T9 al AGRANDAR una tala que ya está en el libro (revisión de seguridad
   * 04-10): el importador de guías (ADR-461) amplía la tala referencial de un
   * árbol con las trozas de otra guía, y antes actualizaba `volumeM3` sin medir
   * el cupo ni dejar `loth_tala_sobre_cupo`. Ahora se mide como una tala nueva
   * del importador: plan y especie DEL CENSO (`especieDelCensoEnTx`) y la misma
   * `enforceCupoEspecie`, con su lock, en la tx de quien llama.
   *
   * Sólo entra el AUMENTO: la tala previa ya suma en el libro y
   * `avisoCupoAlTalar` REEMPLAZA la tala del mismo árbol por la medida nueva
   * (el árbol no cuenta dos veces). Midiendo con el total nuevo y el código del
   * árbol, lo talado de la especie sube exactamente `nuevo − previo`; pasar el
   * aumento suelto reemplazaría a la previa y mediría de menos. Si baja o queda
   * igual, no se mide (`null`).
   *
   * La especie no se toma de la tala vieja: la pone el censo (una tala de antes
   * del 30-09 con otro nombre no esquiva el cupo ni frena la guía por el
   * nombre). Sobre lo AUTORIZADO sin motivo → 422 `T9_CUPO_ESPECIE`; con motivo
   * sin rol decidido → 403: lo mismo que una tala nueva. El evento lo escribe
   * quien llama con `auditarSobreCupoEnTx`, en la misma tx.
   */
  static async cupoAlAmpliarTalaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    tala: { planId: string | null; treeCode: string | null; speciesScientific?: string | null; antesM3: number | null; despuesM3: number | null },
    decision: { motivoSobreCupo?: string | null; puedeExcederCupo?: boolean; createdBy: string },
  ): Promise<AvisoCupo | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const despues = tala.despuesM3;
    if (despues == null || !Number.isFinite(despues) || despues <= (tala.antesM3 ?? 0)) return null;
    const resuelta = await ForestLothDB.especieDelCensoEnTx(tx, tenantId, {
      section: "tala",
      planId: tala.planId,
      treeCode: tala.treeCode,
      speciesCommon: null,
      speciesScientific: tala.speciesScientific ?? null,
      createdBy: decision.createdBy,
    });
    return ForestLothDB.enforceCupoEspecie(tx, tenantId, {
      ...resuelta,
      volumeM3: despues,
      motivoSobreCupo: decision.motivoSobreCupo,
      puedeExcederCupo: decision.puedeExcederCupo,
    });
  }

  /**
   * El evento sobre-cupo, en la MISMA tx que la tala (nueva o agrandada): la
   * excepción que el titular tiene que poder explicar no puede quedar asentada
   * sin su rastro (con `auditLoth`, fire-and-forget, un fallo del log la
   * perdía). Se busca por su nombre: contra el censo es un aviso
   * (`loth_tala_sobre_censo`), contra lo autorizado, la excepción con motivo
   * (`loth_tala_sobre_cupo`). Si el log no se escribe, no se escribe la tala.
   * `contexto` va tras el código del árbol (la ampliación dice de cuánto a cuánto).
   */
  static async auditarSobreCupoEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    cupo: AvisoCupo,
    linea: { id: string; lineNo: number; treeCode: string | null },
    motivo: string | null | undefined,
    user: string | null | undefined,
    contexto?: string,
    sesion?: SesionDeAuditoria,
  ): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const action: LothAuditAction = cupo.exigeMotivo ? "loth_tala_sobre_cupo" : "loth_tala_sobre_censo";
    // ActivityLog tiene RLS por `app.tenant_id` (ADR-114): sin fijarlo, con
    // el rol sin BYPASSRLS el INSERT fallaría y tumbaría la tala. `true` =
    // sólo para esta tx (lo mismo que hace `withRlsTx`).
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.activityLog.create({
      data: {
        tenantId,
        action,
        entity: "ForestLothEntry" satisfies LothAuditEntity,
        entityId: linea.id,
        user: user || "unknown",
        ipAddress: sesion?.ipAddress ?? null,
        userAgent: sesion?.userAgent ?? null,
        detail: `Tala #${linea.lineNo} ${linea.treeCode ?? "—"}${contexto ? ` ${contexto}` : ""}: ${
          motivoCupoValido(motivo) ? notaSobreCupo(cupo, motivo ?? "") : `[Aviso sin motivo] ${cupo.mensaje}`
        }`,
      },
    });
  }

  /**
   * La tala que entra sin pasar por `create` (el importador, ADR-461) también va
   * con la especie DEL CENSO. A diferencia de `resolverPlanYArbol`, el plan ya lo
   * eligió y validó quien llama —dentro de SU tx: puede ser un plan recién
   * creado, por eso se lee con `tx`—, y se mira sólo el censo de ESE plan: un
   * código de árbol de otro permiso no es este árbol (como `arbolesBajoDmc`).
   * Otra especie que la del censo → 422 `TALA_ESPECIE_DISTINTA_AL_CENSO`.
   */
  private static async especieDelCensoEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: LothEntryCreateInput,
  ): Promise<LothEntryCreateInput> {
    const treeCode = input.treeCode?.trim() || null;
    const planId = input.planId?.trim() || null;
    if (input.section !== "tala" || !treeCode || !planId) return input;
    const arboles = await tx.forestCensusTree.findMany({
      where: { tenantId, planId, treeCode, deletedAt: null },
      select: { planId: true, speciesCommon: true, speciesScientific: true },
      orderBy: { id: "asc" },
      take: 1,
    });
    const r = resolverTalaContraCenso(
      { treeCode, planId, speciesCommon: input.speciesCommon ?? null, speciesScientific: input.speciesScientific ?? null },
      arboles,
    );
    if (!r.ok) throw new LothInvariantError(r.mensaje, r.code, r.detail);
    return { ...input, planId: r.planId, speciesCommon: r.speciesCommon, speciesScientific: r.speciesScientific };
  }

  /**
   * Invariantes + correlativo + T9 + la fila (+ el evento sobre-cupo), con el
   * plan y la especie YA resueltos contra la base (`create` o `registrarLineaEnTx`).
   */
  private static async asentarEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: LothEntryCreateInput,
    entryDate: Date,
    correlativos?: Map<string, number>,
    origen?: string,
  ) {
    // 1. Invariantes de cadena de custodia (lockean el recurso disputado).
    await ForestLothDB.enforceInvariants(tx, tenantId, input);

    // 2. Correlativo por (tenant, carátula, sección) — bajo LOCK para que dos
    //    altas concurrentes no repitan el N°. `IS NOT DISTINCT FROM` maneja la
    //    carátula null como igualdad (no como el `= NULL` que nunca matchea).
    const caratulaId = input.caratulaId ?? null;
    const llave = `${input.section}:${caratulaId ?? ""}`;
    let lineNo = correlativos?.get(llave);
    if (lineNo === undefined) {
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "section" = ${input.section}
          AND "caratulaId" IS NOT DISTINCT FROM ${caratulaId} AND "deletedAt" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `;
      const max = await tx.forestLothEntry.aggregate({
        where: { tenantId, caratulaId, section: input.section },
        _max: { lineNo: true },
      });
      lineNo = max._max.lineNo ?? 0;
    }
    lineNo += 1;
    correlativos?.set(llave, lineNo);

    // 3. T9 — cupo de la especie. Su lock (advisory) es el ÚLTIMO de la tx:
    //    tomado entre el FOR UPDATE de T3 y el del correlativo, dos altas
    //    podían quedar abrazadas (una con el cupo esperando el correlativo, la
    //    otra al revés). Al final, nadie que lo tenga espera otro lock del libro.
    //    En el importador (varias líneas por tx) las líneas siguientes toman más
    //    locks con el cupo tomado, pero siempre DESPUÉS del correlativo de la
    //    Tala, que es el que toma antes toda alta de tala: no se cruzan.
    const cupo = await ForestLothDB.enforceCupoEspecie(tx, tenantId, input);
    // La nota va al libro sólo con motivo escrito (siempre contra lo
    // autorizado; opcional contra el censo). Sin motivo, el aviso del censo
    // queda en la auditoría.
    const conMotivo = cupo && motivoCupoValido(input.motivoSobreCupo);
    const inputFinal: LothEntryCreateInput = conMotivo
      ? {
          ...input,
          observations: `${notaSobreCupo(cupo, input.motivoSobreCupo ?? "")}${input.observations?.trim() ? ` ${input.observations.trim()}` : ""}`,
        }
      : input;

    const creada = await tx.forestLothEntry.create({ data: ForestLothDB.datosDeLinea(tenantId, inputFinal, entryDate, caratulaId, lineNo) });

    // 4. El evento sobre-cupo, en la MISMA tx (`auditarSobreCupoEnTx`), con el
    //    exceso en m³ y de dónde salió (como el de una tala agrandada).
    if (cupo) {
      const contexto = `(${origen ? `${origen}; ` : ""}exceso ${fmtM3(cupo.excesoM3)} m³)`;
      await ForestLothDB.auditarSobreCupoEnTx(tx, tenantId, cupo, creada, input.motivoSobreCupo, input.createdBy, contexto, input.sesion);
    }
    return creada;
  }

  // ─── Despacho con guía (28-09-2026) ────────────────────────────────────

  /**
   * Las trozas del Trozado que todavía pueden salir en una guía: registradas,
   * con código y sin despacho ni consumo vivo (T1). Es la misma regla que el
   * picker de «Nueva línea» (`availableSource("despacho_troza")`), pero con las
   * medidas y el plan de cada troza: la guía imprime D1·D2·L y agrupa por plan.
   */
  static async trozasParaGuia(tenantId: string): Promise<TrozaDelLibro[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestLothEntry.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "registrado",
        section: { in: ["trozado", "despacho_troza", "consumo_troza"] },
        trozaCode: { not: null },
      },
      select: {
        id: true, section: true, lineNo: true, entryDate: true, planId: true, treeCode: true, trozaCode: true,
        speciesCommon: true, speciesScientific: true, cites: true,
        diamMayorM: true, diamMenorM: true, lengthM: true, volumeM3: true,
      },
      orderBy: [{ treeCode: "asc" }, { trozaCode: "asc" }],
      take: 5000,
    });
    const salieron = new Set(rows.filter((r) => r.section !== "trozado").map((r) => r.trozaCode));
    const n = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
    return rows
      .filter((r) => r.section === "trozado" && r.trozaCode && !salieron.has(r.trozaCode))
      .map((r) => ({
        id: r.id,
        lineNo: r.lineNo,
        planId: r.planId,
        fecha: r.entryDate.toISOString().slice(0, 10),
        codigo: r.trozaCode as string,
        arbol: r.treeCode,
        comun: r.speciesCommon,
        cientifico: r.speciesScientific,
        cites: r.cites,
        diamMayorM: n(r.diamMayorM),
        diamMenorM: n(r.diamMenorM),
        lengthM: n(r.lengthM),
        volumeM3: n(r.volumeM3),
      }));
  }

  /**
   * Registra la GUÍA y sus N líneas de Despacho de trozas en UNA transacción.
   *
   * Antes eran dos actos en dos pantallas: emitir la GTF no asentaba el
   * despacho, y asentar el despacho no emitía guía — de ahí las guías
   * «declaradas en el libro y no emitidas» y las emitidas sin despacho. Acá es
   * todo o nada: si una troza ya salió (T1), no está trozada (T2), su especie
   * no está en el plan (T7) o se pasa de lo autorizado (T6), no queda ni la
   * guía ni ninguna línea.
   *
   * Lo que viaja lo decide la BASE: el cliente manda los códigos y las medidas,
   * la especie y el volumen salen de la línea de Trozado de cada troza.
   */
  static async despacharConGuia(
    tenantId: string,
    input: {
      gtfNumber: string;
      gtfDate: Date;
      trozaCodes: string[];
      gtfDatos: GtfDatos;
      titularName: string | null;
      observations?: string | null;
      createdBy: string;
    },
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const num = input.gtfNumber.trim();
    if (!num) throw new Error("gtfNumber is required");
    const codes = [...new Set(input.trozaCodes.map((c) => c.trim()).filter(Boolean))].sort();
    if (codes.length === 0) throw new Error("trozaCodes is required");

    const cerrado = await ForestLothCierreDB.closedPeriodOf(tenantId, input.gtfDate);
    if (cerrado) {
      throw new LothInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede despachar con fecha de un mes cerrado. Reábrelo si necesitas corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }
    const caratula = await ForestLothDB.getActiveCaratula(tenantId);
    const caratulaId = caratula?.id ?? null;

    const resultado = await prisma.$transaction(
      (tx) => ForestLothDB.despacharConGuiaEnTx(tx, tenantId, { ...input, gtfNumber: num, trozaCodes: codes }, caratulaId),
      { timeout: 60_000, maxWait: 10_000 },
    );

    ForestLothDB.auditarDespachoConGuia(tenantId, num, resultado, input.createdBy);
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      invalidateByPrefix(`forest-gtf:${tenantId}`);
    } catch { /* cache best-effort */ }
    return resultado;
  }

  /** El rastro de un despacho con guía: la guía y cada línea (después del commit). */
  static auditarDespachoConGuia(
    tenantId: string,
    num: string,
    resultado: { gtf: { id: string; destino: string | null }; lineas: (Parameters<typeof describeEntry>[0] & { id: string })[]; volumen: number },
    user: string,
  ): void {
    auditLoth({
      tenantId,
      action: "loth_gtf_create",
      entity: "ForestGtf",
      entityId: resultado.gtf.id,
      detail: `Despachó con la GTF ${num}: ${resultado.lineas.length} troza(s), ${fmtM3(resultado.volumen)} m³${resultado.gtf.destino ? ` → ${resultado.gtf.destino}` : ""}`,
      user,
    });
    for (const l of resultado.lineas) {
      auditLoth({
        tenantId,
        action: "loth_linea_create",
        entity: "ForestLothEntry",
        entityId: l.id,
        detail: describeEntry(l),
        user,
      });
    }
  }

  /**
   * El cuerpo de `despacharConGuia` dentro de una transacción ajena: candado
   * del N°, las trozas como las declaró el Trozado, una línea de Despacho por
   * troza con sus invariantes y la guía. Lo reusa el importador de guías ya
   * despachadas (ADR-461), que asienta trozados y despacho en la MISMA
   * transacción. No revisa el mes cerrado ni audita: eso es de quien llama.
   *
   * `controlDeRepetidos: "ninguno"` = quien llama ya decidió, bajo el MISMO
   * candado del N°, que la guía no está en el libro (el importador mira sólo
   * las vigentes: una guía de SERFOR anulada en el libro se vuelve a anotar).
   *
   * `excepcionT6` (sólo el importador, ADR-468): T6 mide igual, con su lock,
   * pero en vez de rechazar anota en ese Map lo que la guía despacha de cada
   * especie con techo; quien llama decide con `excesosDelDespacho` y deja el
   * evento. Sin él (todo otro camino), T6 rechaza como siempre.
   */
  static async despacharConGuiaEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: {
      gtfNumber: string;
      gtfDate: Date;
      trozaCodes: string[];
      /**
       * ADR-474 (sólo el importador): código único del libro → el código como
       * lo imprime la guía, cuando difieren («12A (0000002)» → «12A»). Va a
       * `items[].codigoGuia`: la hoja SERFOR lo imprime para que el papel
       * coincida con SNIFFS. El despacho desde el libro no lo manda.
       */
      codigosGuia?: ReadonlyMap<string, string>;
      gtfDatos: GtfDatos;
      titularName: string | null;
      observations?: string | null;
      createdBy: string;
    },
    caratulaId: string | null,
    opts: { controlDeRepetidos?: "talonario" | "ninguno"; excepcionT6?: Map<string, DespachoT6DeLaEspecie> } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const num = input.gtfNumber.trim();
    if (!num) throw new Error("gtfNumber is required");
    const codes = [...new Set(input.trozaCodes.map((c) => c.trim()).filter(Boolean))].sort();
    if (codes.length === 0) throw new Error("trozaCodes is required");

    // 1. El candado del N° NORMALIZADO (mismo que `ForestGtfDB.create`,
    //    Recibir y Anular en el TH): «19-001-65» y «019-001-0000065» van en
    //    fila. El repetido se mira abajo, con el plan de las trozas ya sabido.
    await GtfNumeroDB.bloquear(tx, tenantId, num);

    // 2. Las trozas, como las declaró el Trozado.
    const trozados = await tx.forestLothEntry.findMany({
      where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, trozaCode: { in: codes } },
      select: {
        id: true,
        trozaCode: true, treeCode: true, planId: true, speciesCommon: true, speciesScientific: true, cites: true,
        diamMayorM: true, diamMenorM: true, lengthM: true, volumeM3: true,
      },
    });
    const porCodigo = new Map(trozados.map((t) => [t.trozaCode as string, t]));
    const planes = [...new Set(trozados.map((t) => t.planId ?? null))];
    if (planes.length > 1) {
      throw new LothInvariantError(
        "Estas trozas son de dos planes de manejo distintos. Una guía ampara un solo título habilitante: haz una guía por plan.",
        "GUIA_VARIOS_PLANES",
        { planes },
      );
    }
    const planId = planes[0] ?? null;

    /* Una GTF no se anota dos veces en el MISMO talonario. Los talonarios son
       del titular: el mismo N° de otro titular es otra guía (29-09-2026). */
    if (opts.controlDeRepetidos !== "ninguno") {
      await ForestGtfDB.exigirSinRepetir(tx, tenantId, num, {
        titular: input.titularName?.trim() || null,
        permiso: input.gtfDatos.titulos[0]?.trim() || null,
        planId,
      });
    }

    // 3. Una línea de Despacho por troza, con las invariantes de siempre.
    //    El correlativo se toma UNA vez bajo lock y se incrementa acá.
    await tx.$queryRaw`
      SELECT "id" FROM "ForestLothEntry"
      WHERE "tenantId" = ${tenantId} AND "section" = 'despacho_troza'
        AND "caratulaId" IS NOT DISTINCT FROM ${caratulaId} AND "deletedAt" IS NULL
      ORDER BY "id"
      FOR UPDATE
    `;
    const max = await tx.forestLothEntry.aggregate({
      where: { tenantId, caratulaId, section: "despacho_troza" },
      _max: { lineNo: true },
    });
    let lineNo = max._max.lineNo ?? 0;
    const lineas = [];
    for (const trozaCode of codes) {
      const linea: LothEntryCreateInput = {
        caratulaId,
        planId: porCodigo.get(trozaCode)?.planId ?? planId,
        section: "despacho_troza",
        entryDate: input.gtfDate,
        trozaCode,
        gtfNumber: num,
        createdBy: input.createdBy,
      };
      // T2 (sin trozado) y T1 (ya salió) salen de acá con su mensaje.
      await ForestLothDB.enforceInvariants(tx, tenantId, linea, opts.excepcionT6);
      lineNo += 1;
      lineas.push(await tx.forestLothEntry.create({ data: ForestLothDB.datosDeLinea(tenantId, linea, input.gtfDate, caratulaId, lineNo) }));
    }

    // 4. La guía, con la foto de lo que viaja.
    const n = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
    const items = codes.map((code) => {
      const t = porCodigo.get(code);
      const codigoGuia = input.codigosGuia?.get(code)?.trim();
      return {
        code,
        ...(codigoGuia && codigoGuia !== code ? { codigoGuia } : {}),
        treeCode: t?.treeCode ?? null,
        species: t?.speciesCommon ?? null,
        scientific: t?.speciesScientific ?? null,
        cites: t?.cites ?? false,
        diamMayorM: n(t?.diamMayorM ?? null),
        diamMenorM: n(t?.diamMenorM ?? null),
        lengthM: n(t?.lengthM ?? null),
        volumeM3: n(t?.volumeM3 ?? null),
        productType: PRODUCTO_TROZA,
        pieces: 1,
        /* ADR-450 L4: la línea de Trozado de la troza. «Recibir» en el CTP
           la guarda en la troza: así recuerda su árbol sin adivinar por el
           texto del código. */
        trozadoId: t?.id ?? null,
      };
    });
    const volumen = r4(items.reduce((a, it) => a + (it.volumeM3 ?? 0), 0));
    const d = input.gtfDatos;
    const plan = planId
      ? await tx.forestPlan.findFirst({ where: { tenantId, id: planId }, select: { parcelaCorta: true } })
      : null;
    const gtf = await tx.forestGtf.create({
      data: {
        tenantId,
        planId,
        gtfNumber: num,
        gtfDate: input.gtfDate,
        tipo: "trozas",
        titularName: input.titularName?.trim() || null,
        tituloHabilitante: d.titulos[0]?.trim() || null,
        parcelaCorta: plan?.parcelaCorta ?? null,
        transportista: d.transportista.nombre.trim() || null,
        transportistaDoc: d.transportista.docNumero.trim() || null,
        conductor: d.vehiculo.conductor.trim() || null,
        conductorLicencia: d.vehiculo.licencia.trim() || null,
        placaVehiculo: d.vehiculo.placa.trim() || null,
        origen: d.traslado.puntoPartida.trim() || null,
        destino: d.destinatario.nombre.trim() || null,
        items: items as unknown as Prisma.InputJsonValue,
        volumenTotalM3: volumen > 0 ? new Prisma.Decimal(volumen) : null,
        piezasTotal: items.length,
        observations: input.observations?.trim() || d.observaciones.trim() || null,
        gtfDatos: d as unknown as Prisma.InputJsonValue,
        createdBy: input.createdBy,
      },
    });
    return { gtf, lineas, volumen };
  }

  /**
   * Anula la guía Y sus líneas de Despacho de trozas, juntas. Es la vuelta
   * atrás de `despacharConGuia`: si sólo se anulara el papel, las trozas
   * seguirían «despachadas» (T1) y no podrían ir en la guía corregida.
   * Nada se borra: guía y líneas quedan visibles con su motivo.
   */
  /**
   * Las líneas de despacho vivas de ESTA guía: las que anula
   * `anularGuiaConDespachos` y las que cuenta el modal de anular (una sola
   * regla, `lineasDeLaGuia`).
   */
  static async lineasDeLaGuia(
    tenantId: string,
    gtf: { id: string; gtfNumber: string; items: unknown; planId: string | null; titularName: string | null },
  ): Promise<{ id: string; entryDate: Date }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const cola = colaDeGtf(gtf.gtfNumber);
    const [candidatas, conLaCola] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, section: "despacho_troza", gtfNumber: gtf.gtfNumber, status: "registrado", deletedAt: null },
        select: { id: true, entryDate: true, trozaCode: true, planId: true },
      }),
      cola
        ? prisma.forestGtf.findMany({
            where: { tenantId, deletedAt: null, id: { not: gtf.id }, gtfNumber: { endsWith: cola } },
            select: { gtfNumber: true },
          })
        : Promise.resolve([]),
    ]);
    const otras = conLaCola.filter((g) => mismoNumeroGtf(g.gtfNumber, gtf.gtfNumber)).length;
    const planIds = [...new Set(candidatas.map((l) => l.planId).filter((p): p is string => Boolean(p)))];
    const planes =
      otras > 0 && !gtf.planId && planIds.length
        ? await prisma.forestPlan.findMany({ where: { tenantId, id: { in: planIds } }, select: { id: true, titularName: true } })
        : [];
    const titularDe = new Map(planes.map((p) => [p.id, p.titularName]));
    return lineasDeLaGuia(gtf, candidatas, { otrasConElNumero: otras, titularDePlan: (id) => titularDe.get(id) ?? null }).map(
      ({ id, entryDate }) => ({ id, entryDate }),
    );
  }

  static async anularGuiaConDespachos(tenantId: string, gtfId: string, reason: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    const motivo = reason?.trim();
    if (!motivo) throw new Error("reason is required");
    const gtf = await prisma.forestGtf.findFirst({ where: { tenantId, id: gtfId, deletedAt: null } });
    if (!gtf) return null;
    /* Las líneas de ESTA guía (`lineasDeLaGuia`): dos titulares pueden tener
       el mismo N° (29-09-2026) y sólo por el N° se anulaban los despachos del
       otro — también en una guía hecha a mano sin códigos de troza. */
    const lineasVivas = await ForestLothDB.lineasDeLaGuia(tenantId, gtf);
    for (const l of lineasVivas) {
      const cerrado = await ForestLothCierreDB.closedPeriodOf(tenantId, l.entryDate);
      if (cerrado) {
        throw new LothInvariantError(
          `El período ${cerrado.label} está cerrado: no se pueden anular sus despachos. Reábrelo primero.`,
          "PERIODO_CERRADO",
          { periodKey: cerrado.periodKey },
        );
      }
    }
    const [anulada, lineas] = await prisma.$transaction(async (tx) => {
      /* Si la madera ya entró al Libro CTP del negocio, anular acá liberaría
         trozas que allá siguen en el libro: 409 hasta que el CTP anule sus
         ingresos. Con el MISMO candado del N° que «Recibir» (28-09-2026). */
      await GtfNumeroDB.exigirSinIngresosEnElCtp(tx, tenantId, {
        gtfNumber: gtf.gtfNumber,
        ...identidadDeGuiaTh(gtf, leerGtfDatos(gtf.gtfDatos)),
      });
      const g = await tx.forestGtf.update({
        where: { id: gtf.id, tenantId } satisfies Prisma.ForestGtfWhereUniqueInput,
        data: { status: "anulada", annulledReason: motivo },
      });
      const r = await tx.forestLothEntry.updateMany({
        where: { tenantId, id: { in: lineasVivas.map((l) => l.id) } },
        data: { status: "anulado", annulledReason: `Se anuló la GTF ${gtf.gtfNumber}: ${motivo}`.slice(0, 500) },
      });
      return [g, r.count] as const;
    }, LOTH_TX_OPTS);
    auditLoth({
      tenantId,
      action: "loth_gtf_annul",
      entity: "ForestGtf",
      entityId: gtf.id,
      detail: `Anuló la GTF ${gtf.gtfNumber} y ${lineas} línea(s) de despacho. Motivo: ${motivo}`,
      user,
    });
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
      invalidateByPrefix(`forest-gtf:${tenantId}`);
    } catch { /* cache best-effort */ }
    return { gtf: anulada, lineasAnuladas: lineas };
  }

  /**
   * La fila de una línea nueva, tal como se inserta. Una sola definición para
   * el alta de a una (`create`) y para el despacho con guía (`despacharConGuia`):
   * si cada una armara la suya, la segunda se quedaría corta el día que se sume
   * un campo (memoria «campos copiados a mano se quedan cortos»).
   */
  private static datosDeLinea(
    tenantId: string,
    input: LothEntryCreateInput,
    entryDate: Date,
    caratulaId: string | null,
    lineNo: number,
  ): Prisma.ForestLothEntryUncheckedCreateInput {
    return {
      tenantId,
      caratulaId,
      planId: input.planId ?? null,
      section: input.section,
      lineNo,
      entryDate,
      treeCode: input.treeCode?.trim() || null,
      trozaCode: input.trozaCode?.trim() || null,
      despachoCode: input.despachoCode?.trim() || null,
      isRama: input.isRama ?? false,
      speciesCommon: input.speciesCommon?.trim() || null,
      speciesScientific: input.speciesScientific?.trim() || null,
      cites: input.cites ?? false,
      diamMayorM: dec(input.diamMayorM),
      diamMenorM: dec(input.diamMenorM),
      lengthM: dec(input.lengthM),
      volumeM3: dec(input.volumeM3),
      productType: input.productType?.trim() || null,
      quantity: dec(input.quantity),
      unit: input.unit?.trim() || null,
      pieces: input.pieces ?? null,
      gtfNumber: input.gtfNumber?.trim() || null,
      discarded: input.discarded ?? false,
      consumoInterno: input.consumoInterno ?? false,
      medicionCruda: (input.medicionCruda ?? undefined) as never,
      marcadoFuste: input.marcadoFuste ?? false,
      marcadoTocon: input.marcadoTocon ?? false,
      // La justificación del DMC queda EN el libro: es la explicación que
      // el titular tiene que poder mostrar en una fiscalización.
      observations: buildObservations(input),
      correctsLineNo: input.correctsLineNo ?? null,
      correctionNote: input.correctionNote?.trim() || null,
      gpsLat: dec(input.gpsLat),
      gpsLng: dec(input.gpsLng),
      photoUrl: input.photoUrl?.trim() || null,
      // Sin coordenada no hay origen que declarar.
      gpsOrigen: input.gpsLat != null && input.gpsLng != null ? (input.gpsOrigen ?? null) : null,
      motosierrista: input.motosierrista?.trim() || null,
      motosierristaId: input.motosierrista?.trim() ? (input.motosierristaId?.trim() || null) : null,
      horaTala: input.horaTala?.trim() || null,
      status: "registrado",
      createdBy: input.createdBy,
    };
  }

  /**
   * El plan y la especie de la línea, validados contra la BASE (auditoría T9,
   * 30-09). `ForestLothEntry.planId` no tiene FK: sin esto, un planId inventado
   * o de otro negocio dejaba el censo vacío y el cupo (T9) y lo autorizado
   * (T6/T7) no medían nada.
   *
   *  - Si viene `planId`, tiene que ser un plan vivo de ESTE tenant → si no, 422.
   *  - Tala de un árbol del censo: el plan y la especie son los del árbol
   *    (`resolverTalaContraCenso`); otra especie u otro plan → 422. Sin planId,
   *    se toma el del árbol. Un código fuera del censo queda como vino.
   *
   * Va antes de la tx: son lecturas de catálogo (plan y censo), no el recurso
   * disputado; el lock del cupo sigue siendo el último de la tx.
   */
  private static async resolverPlanYArbol(tenantId: string, input: LothEntryCreateInput): Promise<LothEntryCreateInput> {
    const planPedido = input.planId?.trim() || null;
    if (planPedido && !(await ForestPlanDB.getPlan(tenantId, planPedido))) {
      throw new LothInvariantError(
        "Ese plan de manejo no existe en este negocio o está dado de baja: elige otro plan para registrar la línea.",
        "PLAN_NO_EXISTE",
        { planId: planPedido },
      );
    }
    const treeCode = input.treeCode?.trim() || null;
    if (input.section !== "tala" || !treeCode) return { ...input, planId: planPedido };

    const arboles = await prisma.forestCensusTree.findMany({
      where: { tenantId, treeCode, deletedAt: null },
      select: { planId: true, speciesCommon: true, speciesScientific: true },
      orderBy: { id: "asc" },
      take: 50,
    });
    const r = resolverTalaContraCenso(
      { treeCode, planId: planPedido, speciesCommon: input.speciesCommon ?? null, speciesScientific: input.speciesScientific ?? null },
      arboles,
    );
    if (!r.ok) throw new LothInvariantError(r.mensaje, r.code, r.detail);
    return { ...input, planId: r.planId, speciesCommon: r.speciesCommon, speciesScientific: r.speciesScientific };
  }

  /**
   * T8 — DMC. Si el árbol figura en el censo con su DAP y ese DAP no llega al
   * diámetro mínimo de corta de la especie, la tala se rechaza (422) salvo que
   * el operador escriba una justificación, que queda en el libro.
   *
   * Fuente del DAP: el CENSO (medido a 1,30 m). El diámetro del tocón que se
   * anota en la tala NO es DAP, así que no sirve para este chequeo. Si el árbol
   * no está censado no se bloquea: el libro admite códigos libres.
   */
  private static async enforceDmc(tenantId: string, input: LothEntryCreateInput): Promise<void> {
    if (input.section !== "tala") return;
    const treeCode = input.treeCode?.trim();
    if (!treeCode) return;

    // El árbol del plan ya resuelto (`resolverPlanYArbol`): con el mismo
    // código en dos censos, el DAP que cuenta es el del plan de esta tala.
    const arbol = await prisma.forestCensusTree.findFirst({
      where: { tenantId, treeCode, deletedAt: null, ...(input.planId ? { planId: input.planId } : {}) },
      select: { speciesCommon: true, dapM: true, planId: true },
      orderBy: { id: "asc" },
    });
    if (!arbol?.dapM) return;

    const config = await ForestLothPoaDB.get(tenantId, arbol.planId);
    const { cm: dmcCm, fuente } = dmcParaEspecie(arbol.speciesCommon, config.dmcOverrides);
    const dapCm = Number(arbol.dapM) * 100;
    if (!Number.isFinite(dapCm) || dapCm >= dmcCm) return;

    if (input.justificacionDmc?.trim()) return; // decisión asumida y registrada

    throw ForestLothDB.errorBajoDmc(treeCode, arbol.speciesCommon, dapCm, dmcCm, fuente);
  }

  /** El error de T8 (un solo texto para la tala de a una y la del importador). */
  private static errorBajoDmc(
    treeCode: string,
    especie: string,
    dapCm: number,
    dmcCm: number,
    fuente: ReturnType<typeof dmcParaEspecie>["fuente"],
  ): LothInvariantError {
    const origen = fuente === "plan" ? "fijado en el plan" : fuente === "oficial" ? "de la norma (RJ 458-2002-INRENA)" : "general (RJ 458-2002-INRENA)";
    return new LothInvariantError(
      `El árbol ${treeCode} (${especie}) tiene ${dapCm.toFixed(1)} cm de DAP y el DMC ${origen} es ${dmcCm} cm: por debajo del diámetro mínimo de corta no se puede aprovechar. Si igual corresponde talarlo, escribe la justificación.`,
      "T8_BAJO_DMC",
      { treeCode, especie, dapCm: Number(dapCm.toFixed(1)), dmcCm },
    );
  }

  /**
   * T8 para varias talas de UN plan de una vez (importador de guías, ADR-461):
   * los árboles de ESE censo que están bajo el DMC de su especie, con el mismo
   * error que `enforceDmc`. Mira sólo el censo del plan: un código de árbol de
   * otro permiso no es este árbol. Sin justificación posible en el importador:
   * esa tala se registra a mano, con su motivo.
   */
  static async arbolesBajoDmc(tenantId: string, planId: string, treeCodes: readonly string[]): Promise<Map<string, LothInvariantError>> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigos = [...new Set(treeCodes.map((c) => c.trim()).filter(Boolean))];
    const out = new Map<string, LothInvariantError>();
    if (!planId || codigos.length === 0) return out;
    const arboles = await prisma.forestCensusTree.findMany({
      where: { tenantId, planId, treeCode: { in: codigos }, deletedAt: null, dapM: { not: null } },
      select: { treeCode: true, speciesCommon: true, dapM: true },
    });
    if (arboles.length === 0) return out;
    const config = await ForestLothPoaDB.get(tenantId, planId);
    for (const a of arboles) {
      const { cm: dmcCm, fuente } = dmcParaEspecie(a.speciesCommon, config.dmcOverrides);
      const dapCm = Number(a.dapM) * 100;
      if (!Number.isFinite(dapCm) || dapCm >= dmcCm) continue;
      out.set(a.treeCode, ForestLothDB.errorBajoDmc(a.treeCode, a.speciesCommon, dapCm, dmcCm, fuente));
    }
    return out;
  }

  /**
   * Lo que T9 mide en un plan: su censo, lo AUTORIZADO por especie y las talas
   * vivas del libro de un código de ese censo (`entradaDelPlan` →
   * `talasDelPlan`, el mismo filtro de la vista). UNA lectura para las dos
   * puntas: `enforceCupoEspecie` la llama con `tx` bajo el lock de la especie,
   * y la vista previa del importador (ADR-461) con `prisma`, sin lock ni
   * escritura, para avisar ANTES el mismo exceso que la importación rechaza.
   */
  static async entradaCupoDelPlan(
    db: Prisma.TransactionClient | typeof prisma,
    tenantId: string,
    planId: string,
  ): Promise<EntradaCupo> {
    if (!tenantId) throw new Error("tenantId is required");
    const [censo, autorizadas] = await Promise.all([
      db.forestCensusTree.findMany({
        where: { tenantId, planId, deletedAt: null },
        select: { treeCode: true, speciesCommon: true, volumenEstimadoM3: true },
      }),
      db.forestPlanSpecies.findMany({
        where: { tenantId, planId, deletedAt: null },
        select: { speciesCommon: true, volumenAutorizadoM3: true, arbolesAutorizados: true },
      }),
    ]);
    // Sólo las talas de un código del censo de ESTE plan (y no asentadas a
    // otro): el filtro fino es `talasDelPlan`, el mismo de la vista.
    const codigos = censo.map((c) => c.treeCode);
    const talas = await db.forestLothEntry.findMany({
      where: { tenantId, section: "tala", status: "registrado", deletedAt: null, treeCode: { in: codigos } },
      select: { treeCode: true, speciesCommon: true, volumeM3: true, planId: true },
    });
    const n = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
    return entradaDelPlan(
      planId,
      censo.map((c) => ({ treeCode: c.treeCode, speciesCommon: c.speciesCommon, volumenEstimadoM3: n(c.volumenEstimadoM3) })),
      talas.map((t) => ({ treeCode: t.treeCode, speciesCommon: t.speciesCommon, volumeM3: n(t.volumeM3), planId: t.planId })),
      autorizadas.map((s) => ({
        speciesCommon: s.speciesCommon,
        volumenAutorizadoM3: n(s.volumenAutorizadoM3),
        arbolesAutorizados: s.arbolesAutorizados,
      })),
    );
  }

  /**
   * T9 — cupo de la especie (30-09: en Blas el Tornillo se taló al 154 % de lo
   * censado sin que nada lo dijera). Cupo = volumen AUTORIZADO del plan para la
   * especie; si el plan no lo trae, lo CENSADO. La cuenta es la misma función
   * pura que usa el formulario para avisar (`avisoCupoAlTalar`), pero la decide
   * ACÁ con lo que hay en la base: el cliente no decide.
   *
   * Sólo contra lo AUTORIZADO se exige motivo (≥ 5 letras; sin él, 422). Contra
   * el censo se devuelve el aviso sin frenar: el censo puede estar incompleto
   * (Blas: Tornillo con 2 de 45 árboles autorizados censados) y frenar ahí
   * trabaría el importador por un censo a medias. Sin plan (ni en la línea ni en el árbol
   * del censo) no hay cupo contra el cual medir → no aplica. Las talas y la
   * tala nueva cuentan sólo si su código está en el censo del plan
   * (`entradaDelPlan` → `talasDelPlan`, el mismo filtro de la vista).
   *
   * Lock: advisory por (tenant, plan, especie) — el recurso disputado es el cupo
   * de la especie, que no es UNA fila. Se toma ÚLTIMO en la tx de `create`
   * (después del FOR UPDATE del correlativo): quien lo tiene ya no espera
   * ningún otro lock del libro → no hay ciclo.
   */
  private static async enforceCupoEspecie(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: LothEntryCreateInput,
  ): Promise<AvisoCupo | null> {
    if (input.section !== "tala") return null;
    const vol = input.volumeM3 == null || input.volumeM3 === "" ? null : Number(input.volumeM3);
    if (vol == null || !Number.isFinite(vol) || vol <= 0) return null;
    const treeCode = input.treeCode?.trim() || null;

    // Plan y especie ya resueltos contra la base (`resolverPlanYArbol`): en la
    // tala de un árbol censado son los del censo, nunca los del navegador.
    const planId = input.planId ?? null;
    const especie = input.speciesCommon?.trim() || null;
    const clave = claveEspecie(especie);
    if (!planId || !clave) return null;

    // Dos claves int4 (tenant; plan+especie) en vez de un hashtext de 32 bits
    // sobre todo junto: 64 bits de espacio y otro keyspace que el de los locks
    // de una clave (`gtf:…`). Parametrizado: el texto nunca se interpola.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${`${planId}:${clave}`}))`;

    const aviso = avisoCupoAlTalar(await ForestLothDB.entradaCupoDelPlan(tx, tenantId, planId), {
      treeCode,
      speciesCommon: especie,
      volumeM3: vol,
    });
    if (!aviso) return null;
    // Contra el censo: aviso, no freno (el censo puede estar incompleto).
    if (!aviso.exigeMotivo) return aviso;
    const conMotivo = motivoCupoValido(input.motivoSobreCupo);
    // Sobre lo AUTORIZADO la excepción la firma el dueño o el administrador:
    // el almacenero no la asienta con su propio motivo (→ 403, no 422). `false`
    // = la ruta lo decidió por el rol: se dice ya, traiga o no motivo. Sin
    // decidir (`undefined`: quien llama no miró el rol) también se niega: con
    // motivo, 403; sin él, el 422 de abajo. El importador de guías (ADR-461)
    // manda el motivo de la pantalla y el rol del JWT; lo que rechace lo
    // muestra como rechazo de la guía (no un 500).
    if (input.puedeExcederCupo === false || (!input.puedeExcederCupo && conMotivo)) {
      throw new LothPermisoError(`${aviso.mensaje} Pídele al dueño o al administrador que registre esta tala.`, {
        especie: aviso.especie,
        fuente: aviso.fuente,
        cupoM3: aviso.cupoM3,
        taladoConEsteM3: aviso.taladoConEsteM3,
        pctConEste: aviso.pctConEste,
        avisoCupo: aviso.mensaje,
      });
    }
    if (conMotivo) return aviso;

    throw new LothInvariantError(
      `${aviso.mensaje} Si igual corresponde registrarla —el libro tiene que reflejar lo que pasó en el monte—, confirma y escribe el motivo (${MOTIVO_CUPO_MIN} letras o más): queda en la línea y en la auditoría.`,
      "T9_CUPO_ESPECIE",
      {
        especie: aviso.especie,
        fuente: aviso.fuente,
        cupoM3: aviso.cupoM3,
        taladoAntesM3: aviso.taladoAntesM3,
        taladoConEsteM3: aviso.taladoConEsteM3,
        pctConEste: aviso.pctConEste,
        excesoM3: aviso.excesoM3,
        yaExcedida: aviso.yaExcedida,
        avisoCupo: aviso.mensaje,
      },
    );
  }

  /**
   * Valida las invariantes T1–T5 dentro de la tx, LOCKEANDO el recurso disputado
   * (la troza, el árbol o el producto) — no la fila que se escribe. El lock va
   * sobre lo disputado porque dos altas que movilizan la misma troza son filas
   * distintas: sin lock las dos leen el mismo saldo y ambas pasan (el TOCTOU que
   * ya se pagó en el CTP). Ordenado por id para no deadlockear.
   */
  private static async enforceInvariants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: LothEntryCreateInput,
    /** Sólo el importador (ADR-468): T6 del despacho de trozas anota en vez de rechazar. */
    excepcionT6?: Map<string, DespachoT6DeLaEspecie>,
  ): Promise<void> {
    const section = input.section;
    const treeCode = input.treeCode?.trim() || null;
    const trozaCode = input.trozaCode?.trim() || null;

    if (section === "tala") {
      // T7 — en una plantación, sólo se tala lo que está en su registro (ADR-459).
      //      Va antes del T3: la plantación sin censo tala con códigos libres
      //      (o sin código), y la especie se juzga igual.
      await ForestLothDB.enforceT7(tx, tenantId, input.planId ?? null, input.speciesCommon ?? null, input.speciesScientific ?? null, "tala");
      // T3 — un árbol se tala una sola vez.
      if (!treeCode) return;
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "section" = 'tala' AND "treeCode" = ${treeCode} AND "deletedAt" IS NULL
        ORDER BY "id" FOR UPDATE`;
      const dup = await tx.forestLothEntry.findFirst({
        where: { tenantId, section: "tala", treeCode, status: "registrado", deletedAt: null },
        select: { lineNo: true },
      });
      if (dup) {
        throw new LothInvariantError(
          `El árbol ${treeCode} ya fue talado (línea #${dup.lineNo}). No se tala dos veces el mismo árbol.`,
          "T3_TALA_DUPLICADA",
          { treeCode, lineNo: dup.lineNo },
        );
      }
      return;
    }

    if (section === "trozado") {
      // Lock del árbol (para T4) + la troza (para T3).
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          AND ("treeCode" = ${treeCode} OR "trozaCode" = ${trozaCode})
        ORDER BY "id" FOR UPDATE`;
      // T3 — trozaCode único en Trozado.
      if (trozaCode) {
        const dup = await tx.forestLothEntry.findFirst({
          where: { tenantId, section: "trozado", trozaCode, status: "registrado", deletedAt: null },
          select: { lineNo: true },
        });
        if (dup) {
          throw new LothInvariantError(
            `La troza ${trozaCode} ya está registrada en Trozado (línea #${dup.lineNo}). Usa un código de troza único.`,
            "T3_TROZA_DUPLICADA",
            { trozaCode, lineNo: dup.lineNo },
          );
        }
      }
      // T4 — Σ trozado(árbol) + esta ≤ volumen de la tala del árbol (merma normal
      //      hace que trozado sea < tala; nunca puede superarlo). Solo si la tala
      //      existe con volumen: si no, se registra como código libre.
      if (treeCode && input.volumeM3 != null) {
        const tala = await tx.forestLothEntry.findFirst({
          where: { tenantId, section: "tala", treeCode, status: "registrado", deletedAt: null },
          select: { volumeM3: true },
        });
        if (tala?.volumeM3 != null) {
          const talaVol = Number(tala.volumeM3);
          const prev = await tx.forestLothEntry.aggregate({
            where: { tenantId, section: "trozado", treeCode, status: "registrado", deletedAt: null },
            _sum: { volumeM3: true },
          });
          const yaTrozado = Number(prev._sum.volumeM3 ?? 0);
          const nuevo = Number(input.volumeM3);
          if (r4(yaTrozado + nuevo) > r4(talaVol)) {
            throw new LothInvariantError(
              `El árbol ${treeCode} se taló con ${r4(talaVol)} m³ y ya tiene ${r4(yaTrozado)} m³ trozados; ` +
                `estás agregando ${r4(nuevo)} m³, que supera lo tumbado.`,
              "T4_TROZADO_SUPERA_TALA",
              { treeCode, talaVol: r4(talaVol), yaTrozado: r4(yaTrozado), nuevo: r4(nuevo) },
            );
          }
        }
      }
      return;
    }

    if (section === "despacho_troza" || section === "consumo_troza") {
      if (!trozaCode) return; // el form exige trozaCode acá; sin él no hay qué atar
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND "trozaCode" = ${trozaCode}
        ORDER BY "id" FOR UPDATE`;
      // T2 — la troza debe existir en Trozado (origen legal de la salida).
      const trozada = await tx.forestLothEntry.findFirst({
        where: { tenantId, section: "trozado", trozaCode, status: "registrado", deletedAt: null },
        select: { id: true, speciesCommon: true, speciesScientific: true, volumeM3: true },
      });
      if (!trozada) {
        throw new LothInvariantError(
          `La troza ${trozaCode} no está registrada en Trozado. Registra el trozado antes de despacharla o consumirla.`,
          "T2_TROZA_SIN_TROZADO",
          { trozaCode },
        );
      }
      // T1 — una troza sale del bosque UNA vez (despacho O consumo, no ambos ni
      //      dos veces). Es el killer anti-blanqueo: la misma troza en 2 GTF.
      const usada = await tx.forestLothEntry.findFirst({
        where: {
          tenantId,
          section: { in: ["despacho_troza", "consumo_troza"] },
          trozaCode,
          status: "registrado",
          deletedAt: null,
        },
        select: { lineNo: true, section: true },
      });
      if (usada) {
        const queHizo = usada.section === "despacho_troza" ? "despachada" : "consumida";
        throw new LothInvariantError(
          `La troza ${trozaCode} ya fue ${queHizo} (línea #${usada.lineNo}). Una troza sale del bosque una sola vez.`,
          "T1_TROZA_YA_MOVILIZADA",
          { trozaCode, lineNo: usada.lineNo, section: usada.section },
        );
      }
      // T7 + T6 — sólo el despacho MOVILIZA (consumo interno no sale al exterior).
      if (section === "despacho_troza") {
        // T7 — la especie de la troza debe estar autorizada en el plan de manejo.
        await ForestLothDB.enforceT7(tx, tenantId, input.planId ?? null, trozada.speciesCommon, trozada.speciesScientific, "despacho");
        // T6 — despachar la troza no puede exceder el volumen autorizado del POA
        //      para su especie. El volumen es el de la troza según su Trozado.
        await ForestLothDB.enforceT6(
          tx, tenantId, input.planId ?? null,
          trozada.speciesCommon, trozada.speciesScientific, trozada.volumeM3 != null ? Number(trozada.volumeM3) : 0,
          excepcionT6,
        );
      }
      return;
    }

    if (section === "despacho_producto") {
      // T5 — Σ despacho_producto(prod,esp,unidad) + este ≤ Σ producto_terminado.
      const productType = input.productType?.trim() || null;
      const speciesCommon = input.speciesCommon?.trim() || null;
      const unit = input.unit?.trim() || null;
      const qty = input.quantity != null ? Number(input.quantity) : 0;
      if (!productType || !(qty > 0)) return;
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          AND "section" IN ('producto_terminado','despacho_producto') AND "productType" = ${productType}
        ORDER BY "id" FOR UPDATE`;
      const match = { tenantId, productType, speciesCommon, unit, status: "registrado" as const, deletedAt: null };
      const [prod, desp] = await Promise.all([
        tx.forestLothEntry.aggregate({ where: { ...match, section: "producto_terminado" }, _sum: { quantity: true } }),
        tx.forestLothEntry.aggregate({ where: { ...match, section: "despacho_producto" }, _sum: { quantity: true } }),
      ]);
      const producido = Number(prod._sum.quantity ?? 0);
      const yaDespachado = Number(desp._sum.quantity ?? 0);
      if (r4(yaDespachado + qty) > r4(producido)) {
        throw new LothInvariantError(
          `Se produjeron ${r4(producido)} de ${productType}${speciesCommon ? ` · ${speciesCommon}` : ""} y ya se despacharon ` +
            `${r4(yaDespachado)}; estás despachando ${r4(qty)}, que supera lo producido.`,
          "T5_DESPACHO_SUPERA_PRODUCCION",
          { productType, producido: r4(producido), yaDespachado: r4(yaDespachado), pedido: r4(qty) },
        );
      }
      // T7 — la especie del producto despachado debe estar autorizada en el plan
      //      (movilizar una especie fuera del POA es infracción, sea cual sea la unidad).
      await ForestLothDB.enforceT7(tx, tenantId, input.planId ?? null, speciesCommon, input.speciesScientific ?? null, "despacho");
      // T6 — sólo el producto despachado en m³ moviliza volumen comparable con el
      //      autorizado (kg/unidad no se cuentan contra el volumen del POA, igual
      //      que en `computeBalance`).
      if (unit === "m3") {
        await ForestLothDB.enforceT6(tx, tenantId, input.planId ?? null, speciesCommon, input.speciesScientific ?? null, qty);
      }
      return;
    }
    // producto_terminado: output del aserrío, sin invariante dura.
  }

  /**
   * T6 — el volumen MOVILIZADO de una especie no puede superar el volumen
   * AUTORIZADO por el título habilitante (POA) — o el REGISTRADO de una
   * plantación (ADR-459) — : el exceso de aprovechamiento es la infracción que
   * sanciona OSINFOR. Antes sólo se DETECTABA en la Analítica
   * (`computeBalance.exceso`); acá se IMPIDE al escribir el despacho.
   *
   * Aplica sólo cuando el plan define un volumen para esa especie (si no, es
   * código libre sin techo → se salta, mismo criterio que T4 sin tala).
   *
   * La especie se reconoce con `resolverEspecie` (clave común; si no, el
   * científico), la MISMA regla que T7 y `computeBalance`: el plan anota
   * «Tornillo (Cedrelinga catenaeformis)» y el libro «Tornillo»; o «Cedro rojo»
   * y «Cedro», los dos *Cedrela odorata*. Si T6 mirara otra cosa que T7, la
   * especie pasaría T7 y T6 no encontraría su techo: se saltearía en silencio.
   *
   * LOCKEA las filas de autorización de la especie (`ForestPlanSpecies`), que
   * son el recurso disputado: dos despachos de la misma especie serializan sobre
   * ellas y ninguno pasa leyendo un movilizado desactualizado. Es otra tabla que
   * el lock de T1 (sobre `ForestLothEntry` por trozaCode) → sin ciclo de deadlock.
   *
   * `movilizado` espeja EXACTO a `ForestPlanDB.balanceExtraccion`: líneas de ESTE
   * plan y las sin plan (ADR-459; antes, el libro entero — el despacho de otro
   * plan con la misma especie se comía el techo de éste), despacho de trozas
   * (volumen resuelto vía Trozado) + despacho de producto en m³.
   *
   * `excepcion` (sólo el importador de guías ya emitidas por SERFOR, ADR-468):
   * misma especie, mismo lock, misma medida; en vez de rechazar, anota la troza
   * en lo que la guía despacha de su especie (`anotarDespachoT6`). Sin él, el
   * rechazo es el de siempre, palabra por palabra.
   */
  private static async enforceT6(
    tx: Prisma.TransactionClient,
    tenantId: string,
    planIdInput: string | null,
    speciesCommon: string | null,
    speciesScientific: string | null,
    nuevoVolumen: number,
    excepcion?: Map<string, DespachoT6DeLaEspecie>,
  ): Promise<void> {
    const species = speciesCommon?.trim() || null;
    if (!species || !(nuevoVolumen > 0)) return;

    // Plan de referencia: el de la línea, o el vigente del tenant.
    const planId =
      planIdInput ??
      (await tx.forestPlan.findFirst({
        where: { tenantId, deletedAt: null, estado: "vigente" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }))?.id ??
      null;
    if (!planId) return;

    // La especie del plan que le corresponde (común o científico) y, sobre sus filas, el lock.
    const delPlan = await ForestLothDB.especiesT6DelPlan(tx, tenantId, planId);
    const clave = claveT6(delPlan, species, speciesScientific);
    if (!clave) return; // sin techo declarado → no se bloquea
    const ids = delPlan.filter((f) => claveEspecie(f.speciesCommon) === clave).map((f) => f.id).sort();
    await tx.$queryRaw`
      SELECT "id" FROM "ForestPlanSpecies"
      WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(ids)}) AND "deletedAt" IS NULL
      ORDER BY "id" FOR UPDATE`;
    // Releída bajo el lock: lo que vale es lo autorizado DESPUÉS de esperar.
    const medida = await ForestLothDB.medidaT6(tx, tenantId, planId, delPlan, clave);
    if (excepcion && medida.autorizado != null) {
      anotarDespachoT6(excepcion, clave, species, { autorizado: medida.autorizado, movilizado: medida.movilizado }, nuevoVolumen);
      return;
    }
    if (medida.autorizado == null || !excedeT6(medida, nuevoVolumen)) return;

    // En una plantación no hay POA que autorice: el techo es lo REGISTRADO (ADR-459).
    const plan = await tx.forestPlan.findFirst({
      where: { tenantId, id: planId },
      select: { planType: true, planNumber: true, tituloHabilitante: true },
    });
    const m = { autorizado: medida.autorizado, movilizado: medida.movilizado };
    throw new LothInvariantError(mensajeT6(species, m, nuevoVolumen, esPlanDePlantacion(plan)), "T6_EXCESO_AUTORIZADO", {
      species,
      autorizado: r4(m.autorizado),
      movilizado: r4(m.movilizado),
      pedido: r4(nuevoVolumen),
    });
  }

  /** Las especies del plan con su id: de ellas sale la clave que pone el techo de T6. */
  static async especiesT6DelPlan(db: Prisma.TransactionClient | typeof prisma, tenantId: string, planId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return db.forestPlanSpecies.findMany({
      where: { tenantId, planId, deletedAt: null },
      select: { id: true, speciesCommon: true, speciesScientific: true },
    });
  }

  /**
   * Lo que T6 mide de UNA especie (su `clave` en el plan): lo autorizado (Σ de
   * sus filas; `null` = sin techo) y lo ya movilizado. UNA lectura para las dos
   * puntas: `enforceT6` la llama con `tx` después del lock de la especie; la
   * vista previa del importador de guías (ADR-461), con `prisma`, sin lock ni
   * escritura.
   *
   * `movilizado` espeja EXACTO a `ForestPlanDB.balanceExtraccion`: líneas de
   * ESTE plan y las sin plan, despacho de trozas (volumen resuelto vía Trozado)
   * + despacho de producto en m³.
   */
  static async medidaT6(
    db: Prisma.TransactionClient | typeof prisma,
    tenantId: string,
    planId: string,
    delPlan: readonly { id: string; speciesCommon: string; speciesScientific: string | null }[],
    clave: string,
  ): Promise<MedidaT6> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = delPlan.filter((f) => claveEspecie(f.speciesCommon) === clave).map((f) => f.id).sort();
    if (ids.length === 0) return { autorizado: null, movilizado: 0 };
    const auth = await db.forestPlanSpecies.aggregate({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      _sum: { volumenAutorizadoM3: true },
    });
    if (auth._sum.volumenAutorizadoM3 == null) return { autorizado: null, movilizado: 0 };
    const autorizado = Number(auth._sum.volumenAutorizadoM3);

    const delAlcance = { tenantId, status: "registrado" as const, deletedAt: null, OR: [{ planId }, { planId: null }] };
    //  (a) trozas ya despachadas → su volumen según Trozado, de la especie
    const despachadas = await db.forestLothEntry.findMany({
      where: { ...delAlcance, section: "despacho_troza" },
      select: { trozaCode: true },
    });
    const codes = [...new Set(despachadas.map((d) => d.trozaCode).filter((c): c is string => !!c))];
    let movTrozas = 0;
    if (codes.length > 0) {
      const trozados = await db.forestLothEntry.groupBy({
        by: ["speciesCommon", "speciesScientific"],
        where: { ...delAlcance, section: "trozado", trozaCode: { in: codes } },
        _sum: { volumeM3: true },
      });
      movTrozas = trozados
        .filter((t) => claveEnElPlan(delPlan, t.speciesCommon, t.speciesScientific) === clave)
        .reduce((acc, t) => acc + Number(t._sum.volumeM3 ?? 0), 0);
    }
    //  (b) producto terminado despachado en m³ de la especie
    const prodDesp = await db.forestLothEntry.groupBy({
      by: ["speciesCommon", "speciesScientific"],
      where: { ...delAlcance, section: "despacho_producto", unit: "m3" },
      _sum: { quantity: true },
    });
    const movProducto = prodDesp
      .filter((p) => claveEnElPlan(delPlan, p.speciesCommon, p.speciesScientific) === clave)
      .reduce((acc, p) => acc + Number(p._sum.quantity ?? 0), 0);
    return { autorizado, movilizado: movTrozas + movProducto };
  }

  /**
   * T7 — la especie debe estar entre las del plan de manejo. Talar o movilizar
   * una especie que no figura en la resolución del título habilitante —o en el
   * registro de la plantación— es infracción: es lo que cruza OSINFOR.
   *
   * Dos momentos, UNA regla de especie (`especieEnRegistro`: por clave, o por el
   * científico si los dos lo traen — «Tornillo» = «Tornillo (Cedrelinga …)»,
   * «Bolaina» = «bolaina»; antes era texto exacto sin mayúsculas y el despacho
   * de «Tornillo» contra «Tornillo (Cedrelinga …)» se rechazaba estando en regla):
   *  - `despacho`: en todo plan. Lo que sale del bosque.
   *  - `tala`: SÓLO en una plantación (`esPlanDePlantacion`, ADR-459). Sin censo,
   *    el registro es lo único que dice qué especies hay; en bosque natural la
   *    tala la juzga el censo y el DMC (T8).
   *
   * Se aplica SÓLO cuando la línea declara su plan (`planId`): sin plan atado
   * (código libre) no hay contra qué validar. A diferencia de T6, NO cae al plan
   * vigente por defecto — eso bloquearía movimientos legítimos de otros planes.
   * Sin especie, o sin especies cargadas todavía (plan a medio configurar, como
   * la plantación 19-SEC de Blas: 0 especies) → no bloquea. Pasarse del volumen
   * en la tala tampoco: eso lo frena T6 al despachar.
   */
  private static async enforceT7(
    tx: Prisma.TransactionClient,
    tenantId: string,
    planId: string | null,
    speciesCommon: string | null,
    speciesScientific: string | null,
    momento: "tala" | "despacho",
  ): Promise<void> {
    const species = speciesCommon?.trim() || null;
    if (!planId || !species) return;

    // En serie: la tx es UNA conexión (un Promise.all acá es el aviso de pg@9).
    const plan = await tx.forestPlan.findFirst({
      where: { tenantId, id: planId, deletedAt: null },
      select: { planType: true, planNumber: true, tituloHabilitante: true },
    });
    const plantacion = esPlanDePlantacion(plan);
    if (momento === "tala" && !plantacion) return;
    const registro = await tx.forestPlanSpecies.findMany({
      where: { tenantId, planId, deletedAt: null },
      select: { speciesCommon: true, speciesScientific: true },
    });
    if (registro.length === 0) return; // plan sin especies cargadas → no se puede juzgar
    if (especieEnRegistro(registro, species, speciesScientific)) return;

    throw new LothInvariantError(
      plantacion
        ? mensajeEspecieFueraDelRegistro(species)
        : `La especie "${species}" no está autorizada en el plan de manejo (POA). ` +
            `Movilizar una especie fuera del título habilitante es infracción — agrégala a las especies ` +
            `autorizadas del plan o corrige el registro antes de emitir la GTF.`,
      "T7_ESPECIE_NO_AUTORIZADA",
      { species, planId, momento },
    );
  }

  static async list(tenantId: string, filters: LothListFilters = {}) {
    if (!tenantId) throw new Error("tenantId is required");

    const where: Prisma.ForestLothEntryWhereInput = { tenantId, deletedAt: null };
    if (filters.section) where.section = filters.section;
    if (filters.caratulaId) where.caratulaId = filters.caratulaId;
    if (!filters.includeAnnulled) where.status = "registrado";
    const condiciones: Prisma.ForestLothEntryWhereInput[] = [];
    if (filters.search) {
      condiciones.push({
        OR: [
          { treeCode: { contains: filters.search, mode: "insensitive" } },
          { trozaCode: { contains: filters.search, mode: "insensitive" } },
          { speciesCommon: { contains: filters.search, mode: "insensitive" } },
          { gtfNumber: { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }
    if (filters.permiso) condiciones.push(wherePermiso(filters.permiso));
    if (condiciones.length) where.AND = condiciones;

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [entries, total] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where,
        // `id` desempata: el N° de línea se repite entre carátulas (medido en
        // `main`: 7 pares sección+línea). Sin desempate, dos páginas seguidas
        // podían traer la misma línea y saltarse otra — y el impreso/Excel
        // leen el libro entero de a páginas (`leerLibroEntero`).
        orderBy: [{ section: "asc" }, { lineNo: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.forestLothEntry.count({ where }),
    ]);

    return { entries, total };
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestLothEntry.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  /** Subsanación SERFOR: anular es visible, no se borra. */
  static async annul(tenantId: string, id: string, reason: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("annul reason is required");
    // P1: una línea de un mes cerrado es inmutable (ni anular) hasta reabrir.
    const existing = await prisma.forestLothEntry.findFirst({ where: { id, tenantId }, select: { entryDate: true } });
    if (existing) {
      const cerrado = await ForestLothCierreDB.closedPeriodOf(tenantId, existing.entryDate);
      if (cerrado) {
        throw new LothInvariantError(
          `El período ${cerrado.label} está cerrado: no se puede anular una línea de un mes cerrado. Reabrilo primero.`,
          "PERIODO_CERRADO",
          { periodKey: cerrado.periodKey },
        );
      }
    }
    /* Una línea de DESPACHO con guía libera su troza: si esa guía ya entró al
       Libro CTP, 409 con el mismo candado y el mismo mensaje que anular la guía. */
    const entry = await prisma.$transaction(async (tx) => {
      await ForestLothDB.exigirDespachoFueraDelCtp(tx, tenantId, id);
      return tx.forestLothEntry.update({
        where: { id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
        data: { status: "anulado", annulledReason: reason.trim() },
      });
    }, LOTH_TX_OPTS);
    auditLoth({
      tenantId,
      action: "loth_linea_annul",
      entity: "ForestLothEntry",
      entityId: id,
      detail: `Anuló ${entry.section} #${entry.lineNo} (${entry.trozaCode || entry.treeCode || entry.productType || "—"}). Motivo: ${reason.trim()}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return entry;
  }

  /**
   * Si la línea es un despacho vivo con N° de guía, esa guía no puede haber
   * entrado al Libro CTP del negocio (candado + chequeo de
   * `GtfNumeroDB.exigirSinIngresosEnElCtp`, con el permiso y el titular de la
   * guía emitida si la hay). Cualquier otra línea pasa sin mirar nada.
   */
  private static async exigirDespachoFueraDelCtp(tx: Prisma.TransactionClient, tenantId: string, id: string): Promise<void> {
    const linea = await tx.forestLothEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { section: true, status: true, gtfNumber: true, treeCode: true, trozaCode: true, planId: true, lineNo: true },
    });
    /* ADR-450 R4: el Trozado (o la Tala) de una troza que ya está viva en el
       Libro CTP tampoco se anula: la troza del CTP perdería su árbol. */
    if (linea && (linea.section === "trozado" || linea.section === "tala")) {
      await ForestLothDB.exigirTrozadosFueraDelCtp(tx, tenantId, { id, ...linea });
      return;
    }
    const gtfNumber = linea?.gtfNumber?.trim();
    if (!linea || linea.section !== "despacho_troza" || linea.status !== "registrado" || !gtfNumber) return;
    /* La guía de ESTA línea es la que lleva su troza: dos titulares pueden
       tener el mismo N° (29-09-2026) y «la más nueva con ese N°» podía ser la
       del otro, con otro permiso, y el control no veía el ingreso de ésta. Si
       no se sabe cuál es, sin identidad: cuenta todo ingreso con ese N°. */
    const guias = await tx.forestGtf.findMany({
      where: { tenantId, gtfNumber, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { tituloHabilitante: true, titularName: true, gtfDatos: true, items: true },
    });
    const troza = linea.trozaCode?.trim();
    const conLaTroza = troza ? guias.filter((g) => piezasDeItems(g.items).some((p) => p.codigo === troza)) : [];
    const guia = conLaTroza.length === 1 ? conLaTroza[0] : guias.length === 1 ? guias[0] : null;
    const identidad = guia ? identidadDeGuiaTh(guia, leerGtfDatos(guia.gtfDatos)) : { permiso: null, titular: null };
    await GtfNumeroDB.exigirSinIngresosEnElCtp(tx, tenantId, { gtfNumber, ...identidad });
  }

  /**
   * ADR-450 R4: las líneas de Trozado que cuelgan de esta línea (ella misma,
   * o las del árbol de una Tala) y los N° de las guías que las despacharon
   * (el candado de «Recibir»). Sin trozados, no hay nada que mirar.
   */
  private static async exigirTrozadosFueraDelCtp(
    tx: Prisma.TransactionClient,
    tenantId: string,
    linea: { id: string; section: string; lineNo: number; treeCode: string | null; trozaCode: string | null; planId: string | null },
  ): Promise<void> {
    const arbol = linea.treeCode?.trim();
    const trozados =
      linea.section === "trozado"
        ? [{ id: linea.id, trozaCode: linea.trozaCode }]
        : arbol
          ? await tx.forestLothEntry.findMany({
              where: {
                tenantId,
                section: "trozado",
                treeCode: arbol,
                ...(linea.planId ? { OR: [{ planId: linea.planId }, { planId: null }] } : {}),
              },
              select: { id: true, trozaCode: true },
            })
          : [];
    if (trozados.length === 0) return;
    const codigos = [...new Set(trozados.map((t) => t.trozaCode?.trim()).filter((c): c is string => !!c))];
    const despachos = codigos.length
      ? await tx.forestLothEntry.findMany({
          where: { tenantId, section: "despacho_troza", trozaCode: { in: codigos }, gtfNumber: { not: null } },
          select: { gtfNumber: true },
        })
      : [];
    const queSeAnula =
      linea.section === "trozado"
        ? { de: `del trozado #${linea.lineNo}`, la: `el trozado #${linea.lineNo}` }
        : { de: `de la tala #${linea.lineNo} (árbol ${arbol})`, la: `la tala #${linea.lineNo}` };
    await GtfNumeroDB.exigirTrozadosFueraDelCtp(
      tx,
      tenantId,
      trozados.map((t) => t.id),
      despachos.map((d) => d.gtfNumber ?? ""),
      queSeAnula,
    );
  }

  /**
   * El árbol de cada línea de Trozado (ADR-450 L4), para la ficha de la troza
   * del Libro CTP. Tres consultas: los trozados, las talas de sus árboles y su
   * censo. Se LEE con su estado —una tala anulada es historia, no un hecho
   * vigente— y nada se copia: si el Libro TH corrige la tala, la ficha lo ve.
   *
   *   · Trozado: por id, en cualquier estado (la troza del CTP lo nombra).
   *   · Tala: la del mismo árbol y el mismo plan (o sin plan de un lado); la
   *     vigente primero, después la más nueva. Las borradas no cuentan.
   *   · Censo: la fila del mismo árbol en el plan del trozado; si el trozado no
   *     tiene plan y hay más de una, no se adivina. Sólo de planes VIVOS: dar de
   *     baja un plan no borra su censo, y esa fila muerta volvía ambiguo el árbol
   *     del plan vivo (dos filas → ninguna) o mostraba la de un plan de baja.
   */
  static async arbolesDeTrozados(tenantId: string, ids: readonly (string | null | undefined)[]): Promise<Map<string, ArbolDeTroza>> {
    if (!tenantId) throw new Error("tenantId is required");
    const out = new Map<string, ArbolDeTroza>();
    const unicos = [...new Set(ids.map((i) => i?.trim()).filter((i): i is string => !!i))].slice(0, 5000);
    if (unicos.length === 0) return out;
    const trozados = await prisma.forestLothEntry.findMany({
      where: { tenantId, id: { in: unicos }, section: "trozado" },
      select: {
        id: true, lineNo: true, entryDate: true, status: true, deletedAt: true, planId: true,
        treeCode: true, trozaCode: true, speciesCommon: true, speciesScientific: true,
      },
    });
    const arboles = [...new Set(trozados.map((t) => t.treeCode?.trim()).filter((c): c is string => !!c))];
    if (arboles.length === 0) return out;
    const [talas, censoTodo, planesVivos] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, section: "tala", treeCode: { in: arboles }, deletedAt: null },
        select: {
          id: true, lineNo: true, entryDate: true, status: true, deletedAt: true, planId: true, treeCode: true,
          gpsLat: true, gpsLng: true, gpsOrigen: true, createdAt: true,
        },
      }),
      prisma.forestCensusTree.findMany({
        where: { tenantId, treeCode: { in: arboles }, deletedAt: null },
        select: {
          planId: true, treeCode: true, utmX: true, utmY: true, utmZona: true, parcelaCorta: true, condicion: true,
          speciesCommon: true, speciesScientific: true,
        },
      }),
      prisma.forestPlan.findMany({ where: { tenantId, deletedAt: null }, select: { id: true } }),
    ]);
    const vivos = new Set(planesVivos.map((p) => p.id));
    const censo = censoTodo.filter((c) => vivos.has(c.planId));
    const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
    const mismoPlan = (a: string | null, b: string | null) => !a || !b || a === b;
    for (const t of trozados) {
      const arbol = t.treeCode?.trim();
      if (!arbol) continue;
      const tala =
        talas
          .filter((x) => x.treeCode?.trim() === arbol && mismoPlan(x.planId, t.planId))
          .sort(
            (a, b) =>
              Number(lineaVigente(b)) - Number(lineaVigente(a)) || b.createdAt.getTime() - a.createdAt.getTime(),
          )[0] ?? null;
      const delCenso = censo.filter((c) => c.treeCode.trim() === arbol && (!t.planId || c.planId === t.planId));
      const fila = delCenso.length === 1 ? delCenso[0] : null;
      const a = armarArbolDeTroza(
        t,
        tala ? { ...tala, gpsLat: num(tala.gpsLat), gpsLng: num(tala.gpsLng) } : null,
        fila ? { ...fila, utmX: num(fila.utmX), utmY: num(fila.utmY) } : null,
      );
      if (a) out.set(t.id, a);
    }
    return out;
  }

  /** Soft delete (solo errores de captura del sistema, no subsanación normativa). */
  static async softDelete(tenantId: string, id: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");

    // P1 (cierre de período): borrar una línea de un mes cerrado altera el acta
    // igual que anularla. `create` y `annul` ya lo validaban; esto quedó afuera.
    const previa = await prisma.forestLothEntry.findFirst({ where: { id, tenantId }, select: { entryDate: true } });
    if (previa) {
      const cerradoDel = await ForestLothCierreDB.closedPeriodOf(tenantId, previa.entryDate);
      if (cerradoDel) {
        throw new LothInvariantError(
          `El período ${cerradoDel.label} está cerrado: no se puede borrar una línea de un mes cerrado. Reabrilo primero.`,
          "PERIODO_CERRADO",
          { periodKey: cerradoDel.periodKey },
        );
      }
    }

    const entry = await prisma.$transaction(async (tx) => {
      await ForestLothDB.exigirDespachoFueraDelCtp(tx, tenantId, id);
      return tx.forestLothEntry.update({
        where: { id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
        data: { deletedAt: new Date() },
      });
    }, LOTH_TX_OPTS);
    auditLoth({
      tenantId,
      action: "loth_linea_delete",
      entity: "ForestLothEntry",
      entityId: id,
      detail: `Borró (soft-delete) ${entry.section} #${entry.lineNo} (${entry.trozaCode || entry.treeCode || entry.productType || "—"})`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return entry;
  }

  /**
   * Cuántas líneas (no borradas) tiene el plan por sección, con su volumen y las
   * que caen en un mes cerrado: lo que «Borrar operaciones del plan» muestra
   * ANTES de borrar. Sólo las que citan ESTE plan (las sin plan no se tocan).
   */
  static async contarDelPlan(tenantId: string, planId: string): Promise<ConteoBorrarDelPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId?.trim()) throw new Error("planId is required");
    const [filas, cierres] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, planId, deletedAt: null },
        select: { section: true, status: true, volumeM3: true, entryDate: true },
      }),
      ForestLothCierreDB.list(tenantId),
    ]);
    return contarLineasDelPlan(
      planId,
      filas.map((f) => ({ ...f, volumeM3: Number(f.volumeM3 ?? 0) })),
      (d) => closedPeriodOf(cierres, d)?.label ?? null,
    );
  }

  /**
   * Borra (soft) las operaciones de UN plan en las secciones pedidas, con las
   * mismas guardas que `softDelete` línea por línea —mes cerrado y Libro CTP
   * saltan la línea en vez de cortar todo— y sin dejar una línea viva colgando
   * de otra borrada (`planearBorradoDelPlan`). Todo en UNA transacción: o se
   * borra lo decidido, o nada. Las talas borradas devuelven su árbol a «en pie»
   * si ya no les queda una tala vigente.
   */
  static async softDeleteDelPlan(
    tenantId: string,
    planId: string,
    secciones: readonly string[],
    user = "unknown",
  ): Promise<ResultadoBorrarDelPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planId?.trim()) throw new Error("planId is required");
    const pedidas = [...new Set(secciones.filter(esSeccion))];
    if (pedidas.length === 0) {
      throw new LothInvariantError("Elige al menos una sección para borrar.", "SIN_SECCIONES", {});
    }
    const cierres = await ForestLothCierreDB.list(tenantId);
    const mesCerrado = (d: Date) => closedPeriodOf(cierres, d)?.label ?? null;

    const r = await prisma.$transaction(async (tx) => {
      // En serie: dentro de la tx es UNA conexión.
      /* Lock de las líneas del plan ANTES de leerlas (review 07-10): el alta de
         un trozado bloquea la fila de su tala, revisa T4 y confirma. Sin este
         lock, el bloque leía «sin trozado» y su updateMany borraba la tala
         igual tras esperar ese candado → trozado huérfano. Con él, el que
         llega segundo ve lo que dejó el primero. Mismo orden (`id`) que los
         otros locks del libro: sin abrazo mortal. */
      await tx.$queryRaw`
        SELECT "id" FROM "ForestLothEntry"
        WHERE "tenantId" = ${tenantId} AND "planId" = ${planId} AND "deletedAt" IS NULL
        ORDER BY "id" FOR UPDATE`;
      /* Todas las del plan: las de las secciones elegidas se piden; las demás
         sólo frenan (un trozado vivo del plan sostiene a su tala). */
      const delPlan = await tx.forestLothEntry.findMany({ where: { tenantId, planId, deletedAt: null }, select: SEL_BORRAR });
      const pedidasSet = new Set<string>(pedidas);
      return ForestLothDB.borrarEnTx(tx, tenantId, {
        propias: delPlan,
        pedidas: new Set(delPlan.filter((l) => pedidasSet.has(l.section)).map((l) => l.id)),
        mesCerrado,
        planId,
      });
    }, LOTH_TX_OPTS);

    const resultado: ResultadoBorrarDelPlan = {
      planId,
      borradas: r.borradas,
      m3: r.m3,
      porSeccion: r.porSeccion,
      saltadas: r.saltadas,
      arbolesLiberados: 0,
    };
    if (resultado.borradas > 0) {
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      resultado.arbolesLiberados = await ForestLothDB.liberarArbolesPorPlan(tenantId, r.talasPorPlan);
      const secs = resultado.porSeccion.map((s) => `${s.section} ${s.borradas}`).join(", ");
      const saltos = resultado.saltadas.map((s) => `${s.section}/${s.motivo} ${s.n}`).join(", ");
      auditLoth({
        tenantId,
        action: "loth_linea_delete",
        entity: "ForestLothEntry",
        entityId: planId,
        detail: `Borró (soft-delete) en bloque ${resultado.borradas} líneas del plan ${planId} (${secs}; ${fmtM3(resultado.m3)} m³).${saltos ? ` Se quedaron: ${saltos}.` : ""}${resultado.arbolesLiberados > 0 ? ` ${resultado.arbolesLiberados} árboles volvieron a «en pie».` : ""}`,
        user,
      });
    }
    return resultado;
  }

  /**
   * Borra (soft) las líneas ELEGIDAS en «Secciones» —las marcadas o todas las
   * que deja el filtro; pueden ser de varias secciones y varios planes— con
   * EXACTAMENTE las guardas de `softDeleteDelPlan`: mes cerrado, Libro CTP, sin
   * dejar una línea viva colgando (una tala con trozado vivo que no está en lo
   * elegido se queda), de la salida a la fuente, en UNA transacción.
   *
   * `incluirLoQueCuelga`: suma a lo elegido el trozado de sus talas y los
   * despachos/consumos de sus trozas (del mismo plan o sin plan), para que
   * «borrar estas talas» no se quede entera por su trozado.
   * `simular`: la vista previa del modal; decide igual y no escribe.
   * Ids que no son líneas vivas del negocio se ignoran (y se cuentan).
   */
  static async softDeleteLineas(
    tenantId: string,
    ids: readonly string[],
    user = "unknown",
    opts: { simular?: boolean; incluirLoQueCuelga?: boolean } = {},
  ): Promise<ResultadoBorrarLineas> {
    if (!tenantId) throw new Error("tenantId is required");
    const unicos = [...new Set(ids.map((i) => i.trim()).filter(Boolean))].slice(0, MAX_LINEAS_A_BORRAR);
    if (unicos.length === 0) {
      throw new LothInvariantError("Elige al menos una línea para borrar.", "SIN_SECCIONES", {});
    }
    const simular = opts.simular === true;
    const cierres = await ForestLothCierreDB.list(tenantId);
    const mesCerrado = (d: Date) => closedPeriodOf(cierres, d)?.label ?? null;

    const r = await prisma.$transaction(async (tx) => {
      const pedidosIds = opts.incluirLoQueCuelga ? await ForestLothDB.conLoQueCuelga(tx, tenantId, unicos) : unicos;
      /* El mismo lock que el borrado de un plan, sobre lo pedido y por `id`
         ordenado, ANTES de leer: un trozado que entra en paralelo espera o se ve.
         La vista previa no escribe: no bloquea a nadie (review 07-10; se pide
         cada vez que se marca o desmarca «Incluir lo que cuelga»). */
      if (!simular) {
        await tx.$queryRaw`
          SELECT "id" FROM "ForestLothEntry"
          WHERE "tenantId" = ${tenantId} AND "id" = ANY(${pedidosIds}::text[]) AND "deletedAt" IS NULL
          ORDER BY "id" FOR UPDATE`;
      }
      const propias = await tx.forestLothEntry.findMany({
        where: { tenantId, id: { in: pedidosIds }, deletedAt: null },
        select: SEL_BORRAR,
      });
      const res = await ForestLothDB.borrarEnTx(tx, tenantId, {
        propias,
        pedidas: new Set(propias.map((l) => l.id)),
        mesCerrado,
        simular,
      });
      return { ...res, pedidas: pedidosIds.length, agregadas: pedidosIds.length - unicos.length, encontradas: propias.length };
    }, LOTH_TX_OPTS);

    const resultado: ResultadoBorrarLineas = {
      simulado: simular,
      pedidas: r.pedidas,
      ignoradas: r.pedidas - r.encontradas,
      agregadas: r.agregadas,
      borradas: r.borradas,
      m3: r.m3,
      porSeccion: r.porSeccion,
      porPlan: r.porPlan,
      saltadas: r.saltadas,
      arbolesLiberados: 0,
    };
    if (!simular && resultado.borradas > 0) {
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      resultado.arbolesLiberados = await ForestLothDB.liberarArbolesPorPlan(tenantId, r.talasPorPlan);
      const secs = resultado.porSeccion.map((s) => `${s.section} ${s.borradas}`).join(", ");
      const planes = resultado.porPlan.map((p) => `${p.planId ?? "sin plan"} ${p.borradas}`).join(", ");
      const saltos = resultado.saltadas.map((s) => `${s.section}/${s.motivo} ${s.n}`).join(", ");
      auditLoth({
        tenantId,
        action: "loth_linea_delete",
        entity: "ForestLothEntry",
        entityId: `lineas:${resultado.borradas}`,
        detail: `Borró (soft-delete) en bloque ${resultado.borradas} líneas elegidas en Secciones (${secs}; por plan: ${planes}; ${fmtM3(resultado.m3)} m³).${resultado.agregadas > 0 ? ` ${resultado.agregadas} sumadas por «lo que cuelga».` : ""}${saltos ? ` Se quedaron: ${saltos}.` : ""}${resultado.arbolesLiberados > 0 ? ` ${resultado.arbolesLiberados} árboles volvieron a «en pie».` : ""} Ids: ${r.borradasIds.slice(0, 30).join(",")}${r.borradasIds.length > 30 ? ",…" : ""}`,
        user,
      });
    }
    return resultado;
  }

  /**
   * Lo pedido + lo que cuelga de ello (vivo, del mismo plan o sin plan): el
   * trozado de sus talas y las salidas (despacho/consumo) de esas trozas.
   * Lectura previa al lock: lo que aparezca después del lock sólo frena.
   */
  private static async conLoQueCuelga(tx: Prisma.TransactionClient, tenantId: string, ids: readonly string[]): Promise<string[]> {
    const out = new Set(ids);
    const base = await tx.forestLothEntry.findMany({
      where: { tenantId, id: { in: [...ids] }, deletedAt: null },
      select: { id: true, section: true, treeCode: true, trozaCode: true, planId: true },
    });
    /* Se suma la hija de SU plan o sin plan; un padre sin plan sólo arrastra
       hijas sin plan (el código es por plan: el «5» sin plan no es el «5» de
       otro permiso). Un trozado sin plan hereda el plan de su tala para el
       2.º salto (review 07-10: si no, tala P1 → trozado sin plan → despacho P2). */
    const dePadre = (padre: string | null, hija: string | null) => hija == null || padre === hija;
    const talas = base.filter((l) => l.section === "tala" && l.treeCode?.trim());
    const arboles = [...new Set(talas.map((t) => (t.treeCode as string).trim()))];
    const trozados = arboles.length === 0 ? [] : (await tx.forestLothEntry.findMany({
      where: { tenantId, section: "trozado", treeCode: { in: arboles }, deletedAt: null },
      select: { id: true, section: true, treeCode: true, trozaCode: true, planId: true },
    })).flatMap((x) => {
      const tala = talas.find((t) => t.treeCode?.trim() === x.treeCode?.trim() && dePadre(t.planId, x.planId));
      return tala ? [{ ...x, planId: x.planId ?? tala.planId }] : [];
    });
    for (const t of trozados) out.add(t.id);
    const conTroza = [...base.filter((l) => l.section === "trozado"), ...trozados].filter((l) => l.trozaCode?.trim());
    const trozas = [...new Set(conTroza.map((t) => (t.trozaCode as string).trim()))];
    const salidas = trozas.length === 0 ? [] : await tx.forestLothEntry.findMany({
      where: { tenantId, section: { in: ["despacho_troza", "consumo_troza"] }, trozaCode: { in: trozas }, deletedAt: null },
      select: { id: true, trozaCode: true, planId: true },
    });
    for (const x of salidas) {
      if (conTroza.some((t) => t.trozaCode?.trim() === x.trozaCode?.trim() && dePadre(t.planId, x.planId))) out.add(x.id);
    }
    return [...out].slice(0, MAX_LINEAS_A_BORRAR * 3);
  }

  /**
   * El núcleo compartido de los dos borrados en bloque, DENTRO de la tx y con
   * las líneas pedidas ya bloqueadas: busca las hijas vivas que podrían quedar
   * colgando (de cualquier plan; el planificador sólo mira las del mismo plan o
   * sin plan), pregunta al Libro CTP, decide (`planearBorrado`) y, si no es
   * simulación, marca `deletedAt` sección por sección de la salida a la fuente.
   */
  private static async borrarEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    o: {
      propias: ReadonlyArray<FilaParaBorrar>;
      pedidas: ReadonlySet<string>;
      mesCerrado: (d: Date) => string | null;
      /** Con plan, el UPDATE también lo exige (el borrado de un plan). */
      planId?: string;
      simular?: boolean;
    },
  ) {
    const pedidas = o.propias.filter((l) => o.pedidas.has(l.id));
    const arboles = [...new Set(pedidas.filter((l) => l.section === "tala").map((l) => l.treeCode?.trim()).filter((c): c is string => !!c))];
    const trozas = [...new Set(pedidas.filter((l) => l.section === "trozado").map((l) => l.trozaCode?.trim()).filter((c): c is string => !!c))];
    const planesProducto = [...new Set(pedidas.filter((l) => l.section === "producto_terminado").map((l) => l.planId))];
    const ors: Prisma.ForestLothEntryWhereInput[] = [];
    if (arboles.length) ors.push({ section: "trozado", treeCode: { in: arboles } });
    if (trozas.length) ors.push({ section: { in: ["despacho_troza", "consumo_troza"] }, trozaCode: { in: trozas } });
    const conPlan = planesProducto.filter((p): p is string => p != null);
    if (conPlan.length) ors.push({ section: "despacho_producto", planId: { in: conPlan } });
    if (planesProducto.includes(null)) ors.push({ section: "despacho_producto", planId: null });
    const yaEstan = new Set(o.propias.map((l) => l.id));
    const hijas = ors.length === 0 ? [] : (await tx.forestLothEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", OR: ors },
      select: SEL_BORRAR,
    })).filter((l) => !yaEstan.has(l.id));

    const candidatas = pedidas.filter((l) => !o.mesCerrado(l.entryDate));
    const enCtp = await ForestLothDB.lineasEnElCtp(tx, tenantId, candidatas);
    const aLinea = (l: FilaParaBorrar, pedida: boolean): LineaParaBorrar => ({ ...l, volumeM3: Number(l.volumeM3 ?? 0), pedida });
    const plan = planearBorrado({
      lineas: [...o.propias.map((l) => aLinea(l, o.pedidas.has(l.id))), ...hijas.map((l) => aLinea(l, false))],
      mesCerrado: o.mesCerrado,
      enCtp,
    });

    const ahora = new Date();
    const porSeccion: ResultadoBorrarLineas["porSeccion"] = [];
    const porPlan = new Map<string | null, { planId: string | null; borradas: number; m3: number }>();
    const talasPorPlan = new Map<string | null, string[]>();
    const borradasIds: string[] = [];
    for (const section of ORDEN_DE_BORRADO) {
      const lineas = plan.porSeccion.get(section);
      if (!lineas?.length) continue;
      const ids = lineas.map((l) => l.id);
      // La condición va en el WHERE: lo que otro borró entre el SELECT y acá no se cuenta dos veces.
      const count = o.simular
        ? ids.length
        : (await tx.forestLothEntry.updateMany({
            where: { tenantId, id: { in: ids }, deletedAt: null, ...(o.planId ? { planId: o.planId } : {}) },
            data: { deletedAt: ahora },
          })).count;
      borradasIds.push(...ids);
      const registradas = lineas.filter((l) => l.status === "registrado");
      porSeccion.push({ section, borradas: count, m3: r4(registradas.reduce((a, l) => a + l.volumeM3, 0)) });
      for (const l of lineas) {
        const k = l.planId ?? null;
        const p = porPlan.get(k) ?? { planId: k, borradas: 0, m3: 0 };
        porPlan.set(k, p);
        p.borradas += 1;
        if (l.status === "registrado") p.m3 = r4(p.m3 + l.volumeM3);
      }
      if (section === "tala") {
        for (const l of registradas) {
          const code = l.treeCode?.trim();
          if (!code) continue;
          const k = l.planId ?? null;
          talasPorPlan.set(k, [...(talasPorPlan.get(k) ?? []), code]);
        }
      }
    }
    return {
      borradas: porSeccion.reduce((a, s) => a + s.borradas, 0),
      m3: r4(porSeccion.reduce((a, s) => a + s.m3, 0)),
      porSeccion,
      porPlan: [...porPlan.values()],
      saltadas: plan.saltadas,
      talasPorPlan,
      borradasIds,
    };
  }

  /** Árboles a «en pie», plan por plan. El libro ya quedó bien: un fallo acá sólo se loguea. */
  private static async liberarArbolesPorPlan(tenantId: string, talasPorPlan: ReadonlyMap<string | null, string[]>): Promise<number> {
    let n = 0;
    for (const [planId, codigos] of talasPorPlan) {
      try {
        n += await ForestLothDB.liberarArboles(tenantId, codigos, planId);
      } catch (err) {
        logger.error("[loth.borrarEnBloque] liberar árboles failed", { error: String(err), tenantId });
      }
    }
    return n;
  }

  /**
   * Las candidatas que el Libro CTP frena, con las mismas reglas que
   * `exigirDespachoFueraDelCtp` (ADR-450 R4) pero en bloque: un trozado cuya
   * troza entró al CTP, una tala con un trozado de su árbol que entró (en
   * cualquier estado, de su plan o sin plan; tala sin plan: de cualquiera) y un
   * despacho cuya guía ya se recibió. Toma los candados de «Recibir» de todas
   * las guías en orden.
   */
  private static async lineasEnElCtp(
    tx: Prisma.TransactionClient,
    tenantId: string,
    candidatas: ReadonlyArray<{ id: string; section: string; status: string; treeCode: string | null; trozaCode: string | null; gtfNumber: string | null; planId: string | null }>,
  ): Promise<Set<string>> {
    const out = new Set<string>();
    const talas = candidatas.filter((l) => l.section === "tala" && l.treeCode?.trim());
    const trozados = candidatas.filter((l) => l.section === "trozado");
    const despachos = candidatas.filter((l) => l.section === "despacho_troza" && l.status === "registrado" && l.gtfNumber?.trim());
    const arboles = [...new Set(talas.map((t) => (t.treeCode as string).trim()))];
    /* El alcance de `exigirTrozadosFueraDelCtp`: con plan, los trozados de ese plan o sin plan. */
    const delArbol = (t: (typeof talas)[number], x: { treeCode: string | null; planId: string | null }) =>
      x.treeCode?.trim() === (t.treeCode as string).trim() && (!t.planId || x.planId === t.planId || x.planId == null);
    const deLasTalas = arboles.length === 0 ? [] : (await tx.forestLothEntry.findMany({
      where: { tenantId, section: "trozado", treeCode: { in: arboles } },
      select: { id: true, treeCode: true, trozaCode: true, planId: true },
    })).filter((x) => talas.some((t) => delArbol(t, x)));
    const todos = [...trozados, ...deLasTalas];
    const codigos = [...new Set(todos.map((t) => t.trozaCode?.trim()).filter((c): c is string => !!c))];
    const guiasDeTrozas = codigos.length === 0 ? [] : await tx.forestLothEntry.findMany({
      where: { tenantId, section: "despacho_troza", trozaCode: { in: codigos }, gtfNumber: { not: null } },
      select: { gtfNumber: true },
    });
    await GtfNumeroDB.bloquearEnOrden(tx, tenantId, [
      ...guiasDeTrozas.map((g) => g.gtfNumber ?? ""),
      ...despachos.map((d) => d.gtfNumber ?? ""),
    ]);
    const enElCtp = new Set(
      (await GtfNumeroDB.trozadosEnElCtp(tx, tenantId, todos.map((t) => t.id))).map((v) => v.lothTrozadoId ?? ""),
    );
    for (const t of trozados) if (enElCtp.has(t.id)) out.add(t.id);
    for (const t of talas) {
      if (deLasTalas.some((x) => delArbol(t, x) && enElCtp.has(x.id))) out.add(t.id);
    }
    /* Un despacho por N° de guía: las líneas de una guía son la misma guía y
       el mismo ingreso al CTP (decenas de chequeos, no cientos). */
    const porGuia = new Map<string, string[]>();
    for (const d of despachos) {
      const n = (d.gtfNumber as string).trim();
      porGuia.set(n, [...(porGuia.get(n) ?? []), d.id]);
    }
    for (const ids of porGuia.values()) {
      try {
        await ForestLothDB.exigirDespachoFueraDelCtp(tx, tenantId, ids[0]);
      } catch (err) {
        if (!(err instanceof GuiaYaEnElCtpError)) throw err;
        for (const id of ids) out.add(id);
      }
    }
    return out;
  }

  /** Totales de un rango de fechas (para el acta de cierre de período). */
  static async resumenPeriodo(tenantId: string, from: Date, to: Date) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestLothEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
      entryDate: { gte: from, lte: to },
    };
    const [count, tala, trozado] = await Promise.all([
      prisma.forestLothEntry.count({ where }),
      prisma.forestLothEntry.aggregate({ where: { ...where, section: "tala" }, _sum: { volumeM3: true } }),
      prisma.forestLothEntry.aggregate({ where: { ...where, section: "trozado" }, _sum: { volumeM3: true } }),
    ]);
    return {
      lineasCount: count,
      taladoM3: Number(tala._sum.volumeM3 ?? 0),
      trozadoM3: Number(trozado._sum.volumeM3 ?? 0),
    };
  }

  /**
   * Líneas y volumen por sección (las registradas). Con `permiso`, el mismo
   * filtro que `list`: `{ conSinPlan: true }` es el alcance de
   * `ForestPlanDB.balanceExtraccion` (el informe de ejecución no mezcla el
   * balance de UN plan con los movimientos de todos); la pantalla del libro
   * pide sólo las del plan.
   */
  static async stats(tenantId: string, caratulaId?: string, permiso?: FiltroPermiso | null) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestLothEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
    };
    if (caratulaId) where.caratulaId = caratulaId;
    if (permiso) where.AND = [wherePermiso(permiso)];
    const rows = await prisma.forestLothEntry.groupBy({
      by: ["section"],
      where,
      _count: { _all: true },
      _sum: { volumeM3: true, quantity: true },
    });
    return rows.map((r) => ({
      section: r.section as LothSection,
      count: r._count._all,
      totalVolumeM3: r._sum.volumeM3?.toNumber() ?? 0,
      totalQuantity: r._sum.quantity?.toNumber() ?? 0,
    }));
  }

  /**
   * Cuántas líneas se pueden atar a un permiso: vivas, registradas y sin plan
   * (las anuladas son historia del libro y no cuentan en ningún saldo), y cuántas
   * de ésas están en un mes cerrado.
   */
  static async conteoAtarSinPlan(tenantId: string): Promise<AtarSinPlanConteo> {
    if (!tenantId) throw new Error("tenantId is required");
    const [filas, cierres] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", planId: null },
        select: { entryDate: true },
      }),
      ForestLothCierreDB.list(tenantId),
    ]);
    const cerradas = filas.filter((f) => closedPeriodOf(cierres, f.entryDate)).length;
    return { total: filas.length, cerradas };
  }

  /**
   * Ata a un permiso las líneas del libro que no citan plan (ADR-459: cuentan en
   * el saldo de TODOS los planes). La TALA toma `planIdTalas`; el trozado, el plan
   * de su tala; el despacho y el consumo, el de su troza (la misma regla que
   * `planDeLaFuente`); sin fuente, o con la fuente en un plan dado de baja, el
   * elegido. Sólo líneas vivas, registradas y con `planId IS NULL` (la condición
   * va en el WHERE del UPDATE: una carrera con otro atado no pisa nada). Los
   * meses CERRADOS no se tocan —el acta es inmutable— y se cuentan aparte.
   *
   * NO re-evalúa T6/T7 (lo atado ya está asentado): sólo avisa cuántas líneas
   * quedan con una especie fuera del registro del plan. `simular` calcula la vista
   * previa sin escribir. UNA transacción.
   */
  static async atarSinPlan(
    tenantId: string,
    planIdTalas: string,
    actor: string,
    opts: { simular?: boolean } = {},
  ): Promise<AtarSinPlanResultado> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!planIdTalas?.trim()) throw new Error("planId is required");
    const simular = opts.simular === true;
    if (!simular && !actor?.trim()) throw new Error("actor is required");

    const calcular = async (db: Prisma.TransactionClient | typeof prisma): Promise<{
      resultado: AtarSinPlanResultado;
      porPlan: Map<string, string[]>;
    }> => {
      // En serie: dentro de la tx es UNA conexión (un Promise.all acá es el aviso de pg@9).
      const planes = await db.forestPlan.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, planType: true, planNumber: true, tituloHabilitante: true },
      });
      if (!planes.some((p) => p.id === planIdTalas)) {
        throw new LothInvariantError(
          "Ese plan de manejo no existe en este negocio o está dado de baja: elige otro permiso.",
          "PLAN_NO_EXISTE",
          { planId: planIdTalas },
        );
      }
      const vivos = new Set(planes.map((p) => p.id));
      const cierres = await ForestLothCierreDB.list(tenantId);
      const candidatas = await db.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", planId: null },
        select: { id: true, section: true, treeCode: true, trozaCode: true, entryDate: true, speciesCommon: true, speciesScientific: true },
        orderBy: [{ section: "asc" }, { lineNo: "asc" }],
      });
      const fuentes = candidatas.length === 0 ? [] : await db.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", section: { in: ["tala", "trozado"] } },
        select: { section: true, treeCode: true, trozaCode: true, planId: true, speciesCommon: true, speciesScientific: true },
      });
      type Troza = { treeCode: string | null; planId: string | null; comun: string | null; cientifico: string | null };
      const talaDe = new Map<string, string | null>();
      const trozadoDe = new Map<string, Troza>();
      for (const f of fuentes) {
        const arbol = f.treeCode?.trim();
        const troza = f.trozaCode?.trim();
        if (f.section === "tala" && arbol && !talaDe.has(arbol)) talaDe.set(arbol, f.planId);
        if (f.section === "trozado" && troza && !trozadoDe.has(troza)) {
          trozadoDe.set(troza, { treeCode: arbol || null, planId: f.planId, comun: f.speciesCommon, cientifico: f.speciesScientific });
        }
      }
      /** El plan de una tala: el suyo si sigue vivo; sin plan, el que se le va a dar. */
      const planDeLaTala = (arbol: string | null | undefined): string | null => {
        const k = arbol?.trim();
        if (!k || !talaDe.has(k)) return null;
        const p = talaDe.get(k) ?? null;
        return p == null ? planIdTalas : vivos.has(p) ? p : null;
      };
      const decidir = (c: (typeof candidatas)[number]): { planId: string; heredado: boolean; comun: string | null; cientifico: string | null } => {
        const comun = c.speciesCommon;
        const cientifico = c.speciesScientific;
        if (c.section === "trozado") {
          const p = planDeLaTala(c.treeCode);
          return { planId: p ?? planIdTalas, heredado: p != null && p !== planIdTalas, comun, cientifico };
        }
        if (c.section === "despacho_troza" || c.section === "consumo_troza") {
          const t = c.trozaCode?.trim() ? trozadoDe.get(c.trozaCode.trim()) : undefined;
          if (!t) return { planId: planIdTalas, heredado: false, comun, cientifico };
          const p = t.planId == null ? planDeLaTala(t.treeCode) : vivos.has(t.planId) ? t.planId : null;
          return {
            planId: p ?? planIdTalas,
            heredado: p != null && p !== planIdTalas,
            comun: comun ?? t.comun,
            cientifico: cientifico ?? t.cientifico,
          };
        }
        return { planId: planIdTalas, heredado: false, comun, cientifico };
      };

      const porPlan = new Map<string, string[]>();
      const secciones = new Map<string, AtarSeccion>();
      const periodos = new Set<string>();
      const paraRegistro: Array<{ planId: string; section: string; comun: string | null; cientifico: string | null }> = [];
      let cerradas = 0;
      for (const c of candidatas) {
        const sec = secciones.get(c.section) ?? { section: c.section, total: 0, porPlan: [], cerradas: 0 };
        secciones.set(c.section, sec);
        sec.total += 1;
        const cerrado = closedPeriodOf(cierres, c.entryDate);
        if (cerrado) {
          sec.cerradas += 1;
          cerradas += 1;
          periodos.add(cerrado.label);
          continue;
        }
        const d = decidir(c);
        let tanda = sec.porPlan.find((x) => x.planId === d.planId);
        if (!tanda) {
          tanda = { planId: d.planId, n: 0, heredado: 0 };
          sec.porPlan.push(tanda);
        }
        tanda.n += 1;
        if (d.heredado) tanda.heredado += 1;
        const ids = porPlan.get(d.planId) ?? [];
        ids.push(c.id);
        porPlan.set(d.planId, ids);
        if (c.section === "tala" || c.section === "despacho_troza" || c.section === "despacho_producto") {
          paraRegistro.push({ planId: d.planId, section: c.section, comun: d.comun, cientifico: d.cientifico });
        }
      }

      // Aviso T7 (no bloquea): la especie contra el registro del plan al que va.
      const destinos = [...porPlan.keys()];
      const registros = destinos.length === 0 ? [] : await db.forestPlanSpecies.findMany({
        where: { tenantId, planId: { in: destinos }, deletedAt: null },
        select: { planId: true, speciesCommon: true, speciesScientific: true },
      });
      let fuera = 0;
      const especiesFuera = new Set<string>();
      for (const r of paraRegistro) {
        const comun = r.comun?.trim();
        if (!comun) continue;
        const plan = planes.find((p) => p.id === r.planId);
        // La tala sólo se juzga en una plantación (como T7); el despacho, en todo plan.
        if (r.section === "tala" && !esPlanDePlantacion(plan ?? null)) continue;
        const registro = registros.filter((x) => x.planId === r.planId);
        if (registro.length === 0 || especieEnRegistro(registro, comun, r.cientifico)) continue;
        fuera += 1;
        especiesFuera.add(comun);
      }

      return {
        porPlan,
        resultado: {
          simulado: simular,
          planId: planIdTalas,
          total: candidatas.length,
          atadas: candidatas.length - cerradas,
          porSeccion: [...secciones.values()],
          cerradas: { n: cerradas, periodos: [...periodos].sort() },
          fueraDelRegistro: { n: fuera, especies: [...especiesFuera].sort() },
        },
      };
    };

    if (simular) return (await calcular(prisma)).resultado;

    const { resultado, grupos } = await prisma.$transaction(async (tx) => {
      const { resultado, porPlan } = await calcular(tx);
      let atadas = 0;
      const grupos: Array<{ planId: string; ids: string[] }> = [];
      for (const [planId, ids] of porPlan) {
        // La condición va en el WHERE: lo que otro atado ya tocó entre el SELECT y acá no se pisa.
        const r = await tx.forestLothEntry.updateMany({
          where: { tenantId, id: { in: ids }, planId: null, deletedAt: null, status: "registrado" },
          data: { planId },
        });
        atadas += r.count;
        grupos.push({ planId, ids });
      }
      return { resultado: { ...resultado, atadas }, grupos };
    }, LOTH_TX_OPTS);

    if (resultado.atadas > 0) {
      const resumen = grupos
        .map((g) => `${g.ids.length} → plan ${g.planId} [${g.ids.slice(0, 30).join(",")}${g.ids.length > 30 ? ",…" : ""}]`)
        .join("; ");
      auditLoth({
        tenantId,
        action: "loth_linea_atar_plan",
        entity: "ForestLothEntry",
        entityId: planIdTalas,
        detail: `Ató ${resultado.atadas} líneas sin plan (antes: sin plan; después: ${resumen}).${resultado.cerradas.n > 0 ? ` ${resultado.cerradas.n} de meses cerrados (${resultado.cerradas.periodos.join(", ")}) quedaron sin tocar.` : ""}`,
        user: actor,
      });
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    }
    return resultado;
  }

  /**
   * Cuántas líneas del libro (registradas o anuladas, no borradas) no citan
   * plan. El selector de permiso ofrece «Sin plan» sólo si hay alguna: la
   * tabla muestra también las anuladas, así que se cuentan.
   */
  static async lineasSinPlan(tenantId: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestLothEntry.count({ where: { tenantId, deletedAt: null, planId: null } });
  }

  /**
   * Trozas despachadas con su especie/medidas/volumen resueltos desde Trozado.
   * Alimenta el prefill de la GTF ("cargar desde despacho").
   */
  static async despachablesResueltos(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const entries = await prisma.forestLothEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", section: { in: ["trozado", "despacho_troza"] } },
      select: {
        section: true, trozaCode: true, speciesCommon: true, speciesScientific: true, cites: true,
        diamMayorM: true, diamMenorM: true, lengthM: true, volumeM3: true, gtfNumber: true,
      },
    });
    const trozaMap = new Map<string, { species: string | null; scientific: string | null; cites: boolean; dM: number | null; dm: number | null; L: number | null; vol: number | null }>();
    for (const e of entries) {
      if (e.section === "trozado" && e.trozaCode) {
        trozaMap.set(e.trozaCode, {
          species: e.speciesCommon, scientific: e.speciesScientific, cites: e.cites,
          dM: e.diamMayorM ? Number(e.diamMayorM) : null, dm: e.diamMenorM ? Number(e.diamMenorM) : null,
          L: e.lengthM ? Number(e.lengthM) : null, vol: e.volumeM3 ? Number(e.volumeM3) : null,
        });
      }
    }
    const items: Array<Record<string, unknown>> = [];
    for (const e of entries) {
      if (e.section === "despacho_troza" && e.trozaCode) {
        const t = trozaMap.get(e.trozaCode);
        items.push({
          code: e.trozaCode, species: t?.species ?? null, scientific: t?.scientific ?? null, cites: t?.cites ?? false,
          diamMayorM: t?.dM ?? null, diamMenorM: t?.dm ?? null, lengthM: t?.L ?? null, volumeM3: t?.vol ?? null,
          gtfNumber: e.gtfNumber ?? null,
        });
      }
    }
    return items;
  }

  /**
   * Códigos de troza REGISTRADOS en el libro (sección Trozado), sin importar si
   * ya se despacharon o consumieron (T2: toda troza despachada/consumida debe
   * existir en Trozado — así que Trozado solo alcanza y sobra como fuente).
   *
   * Para la validación GTF ↔ Libro (`GtfForm`): antes se usaba
   * `availableSource(tenantId, "despacho_troza")`, que a propósito EXCLUYE las
   * trozas ya despachadas (es el picker para crear un despacho nuevo) — así que
   * toda troza cargada con "Cargar trozas despachadas" (`despachablesResueltos`,
   * que trae justamente las YA despachadas) se marcaba "no está en el libro"
   * por construcción. Esta consulta no excluye nada: es la fuente correcta.
   */
  static async trozaCodesRegistrados(tenantId: string): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestLothEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", section: "trozado", trozaCode: { not: null } },
      select: { trozaCode: true },
      distinct: ["trozaCode"],
    });
    return rows.map((r) => r.trozaCode).filter((c): c is string => !!c);
  }

  /**
   * Ítems seleccionables para la sección (flujo data-driven, ADR-127):
   *  - tala            → censo del plan con árboles `en_pie`
   *  - trozado         → talas registradas (árboles tumbados) listos para trozar
   *  - despacho_troza  → trozas trozadas aún no despachadas
   *  - consumo_troza   → trozas trozadas aún no consumidas
   *  - producto_terminado → trozas consumidas (materia prima del aserrío)
   *  - despacho_producto  → productos terminados disponibles para despachar
   */
  static async availableSource(tenantId: string, section: LothSection, planId?: string) {
    if (!tenantId) throw new Error("tenantId is required");

    if (section === "tala") {
      // Sólo el censo de planes VIVOS: dar de baja un plan no borra su censo, y sus
      // árboles se seguían ofreciendo para talar (con `planId` de un plan de baja, todos).
      const vivos = await prisma.forestPlan.findMany({
        where: { tenantId, deletedAt: null, ...(planId ? { id: planId } : {}) },
        select: { id: true },
      });
      if (vivos.length === 0) return [];
      const [trees, talados] = await Promise.all([
        prisma.forestCensusTree.findMany({
          where: { tenantId, deletedAt: null, estado: "en_pie", planId: { in: vivos.map((p) => p.id) } },
          orderBy: { treeCode: "asc" },
          take: 1000,
        }),
        /* El censo pasa a «talado» con un fire-and-forget al asentar la tala;
           si eso falla, el árbol sigue «en pie» y se ofrecía para talar otra
           vez — T3 lo rechazaba recién al guardar (medido 28-09: el 85-TOR del
           tenant de QA, con su línea N° 1, 4 trozas y 2 despachadas). */
        prisma.forestLothEntry.findMany({
          where: { tenantId, section: "tala", status: "registrado", deletedAt: null, treeCode: { not: null } },
          select: { treeCode: true },
          distinct: ["treeCode"],
        }),
      ]);
      const yaTalados = new Set(talados.map((t) => t.treeCode));
      return trees.filter((t) => !yaTalados.has(t.treeCode)).map((t) => ({
        kind: "censo" as const,
        code: t.treeCode,
        species: t.speciesCommon,
        scientific: t.speciesScientific,
        cites: t.cites,
        dapM: t.dapM ? Number(t.dapM) : null,
        hcM: t.alturaComercialM ? Number(t.alturaComercialM) : null,
        vol: t.volumenEstimadoM3 ? Number(t.volumenEstimadoM3) : null,
        meta: t.parcelaCorta ?? null,
        // Coordenada del censo: el alta de Tala la hereda como GPS de la
        // operación (cobertura EUDR sin volver al monte) — ver LothGpsField.
        utmZona: t.utmZona ?? null,
        utmX: t.utmX ? Number(t.utmX) : null,
        utmY: t.utmY ? Number(t.utmY) : null,
      }));
    }

    const entries = await prisma.forestLothEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", ...(planId ? { planId } : {}) },
      select: { section: true, treeCode: true, trozaCode: true, speciesCommon: true, speciesScientific: true, cites: true, volumeM3: true, productType: true, quantity: true, unit: true },
    });
    const mapTroza = (e: (typeof entries)[number]) => ({
      kind: "troza" as const, code: e.trozaCode, species: e.speciesCommon, scientific: e.speciesScientific,
      cites: e.cites, vol: e.volumeM3 ? Number(e.volumeM3) : null,
    });

    if (section === "trozado") {
      return entries.filter((e) => e.section === "tala" && e.treeCode).map((e) => ({
        kind: "tala" as const, code: e.treeCode, species: e.speciesCommon, scientific: e.speciesScientific,
        cites: e.cites, vol: e.volumeM3 ? Number(e.volumeM3) : null,
      }));
    }
    if (section === "despacho_troza" || section === "consumo_troza") {
      // Una troza sale del bosque UNA vez (T1): excluir las YA despachadas O
      // consumidas, no solo las de esta misma sección (antes se colaban las
      // despachadas en el picker de consumo — el usuario solo veía el conflicto al guardar).
      const used = new Set(
        entries.filter((e) => e.section === "despacho_troza" || e.section === "consumo_troza").map((e) => e.trozaCode),
      );
      return entries.filter((e) => e.section === "trozado" && e.trozaCode && !used.has(e.trozaCode)).map(mapTroza);
    }
    if (section === "producto_terminado") {
      // Trozas consumidas aún no convertidas en producto (una troza → un producto).
      const usedInProd = new Set(entries.filter((e) => e.section === "producto_terminado").map((e) => e.trozaCode));
      return entries.filter((e) => e.section === "consumo_troza" && e.trozaCode && !usedInProd.has(e.trozaCode)).map(mapTroza);
    }
    if (section === "despacho_producto") {
      return entries.filter((e) => e.section === "producto_terminado").map((e) => ({
        kind: "producto" as const, code: e.productType, species: e.speciesCommon, scientific: e.speciesScientific,
        cites: e.cites, productType: e.productType, quantity: e.quantity ? Number(e.quantity) : null, unit: e.unit,
        // La troza de origen del producto → el despacho la hereda para trazar por árbol.
        trozaCode: e.trozaCode,
      }));
    }
    return [];
  }

  /**
   * Lo que el libro ya hizo con cada árbol: la línea de tala, cuántas trozas
   * salieron en el trozado y cuántas se despacharon o consumieron. Lo lee el
   * modal «Ver censo» de la tala para decir «talado el lunes 28/09 · línea
   * N° 3 · 1 troza» en vez del `estado` del censo, que puede quedar atrás.
   *
   * Por código de árbol en todo el tenant: es el mismo criterio de T3 (un
   * árbol se tala una sola vez, sin importar de qué plan venga la línea).
   */
  /** ¿El árbol tiene una tala vigente (registrada, no borrada) en el libro? */
  static async tieneTalaVigente(tenantId: string, treeCode: string): Promise<boolean> {
    return (await ForestLothDB.arbolesConTalaVigente(tenantId, [treeCode])).size > 0;
  }

  /**
   * Anular o borrar la tala de un árbol lo devuelve «en pie» en el censo —el
   * espejo de lo que hace el alta, que lo marca «talado»—. Sin esto el árbol
   * quedaba talado para siempre sin una sola línea que lo respalde (medido
   * 28-09 en QA: QA-MAPA-3 «talado» en el censo, 0 talas vigentes). Sólo los
   * códigos sin otra tala vigente en el negocio, y sólo si el censo los tiene
   * talados (los del plan de la tala; sin plan, los del negocio). Devuelve
   * cuántos árboles volvieron.
   */
  static async liberarArboles(tenantId: string, treeCodes: readonly string[], planId: string | null): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigos = [...new Set(treeCodes.map((c) => c.trim()).filter(Boolean))];
    if (codigos.length === 0) return 0;
    const conTala = await ForestLothDB.arbolesConTalaVigente(tenantId, codigos, planId);
    return ForestPlanDB.marcarEnPieLosTalados(tenantId, codigos.filter((c) => !conTala.has(c)), planId);
  }

  /**
   * De estos códigos de árbol, los que todavía tienen una tala vigente. Con
   * `planId`, sólo cuentan las talas de ESE plan o sin plan: el código del
   * árbol es por plan, y una tala del mismo código en otro plan no puede dejar
   * «talado» al árbol de éste (review 07-10).
   */
  static async arbolesConTalaVigente(tenantId: string, treeCodes: readonly string[], planId?: string | null): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigos = [...new Set(treeCodes.map((c) => c.trim()).filter(Boolean))];
    if (codigos.length === 0) return new Set();
    const filas = await prisma.forestLothEntry.findMany({
      where: {
        tenantId, section: "tala", treeCode: { in: codigos }, status: "registrado", deletedAt: null,
        ...(planId ? { OR: [{ planId }, { planId: null }] } : {}),
      },
      select: { treeCode: true },
    });
    return new Set(filas.map((f) => f.treeCode?.trim() ?? "").filter(Boolean));
  }

  static async usoDelCenso(tenantId: string): Promise<UsoArbolCenso[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestLothEntry.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "registrado",
        section: { in: ["tala", "trozado", "despacho_troza", "consumo_troza"] },
      },
      select: { section: true, lineNo: true, entryDate: true, treeCode: true, trozaCode: true, volumeM3: true },
      take: 50_000,
    });
    return resumirUsoDelCenso(rows.map((r) => ({ ...r, volumeM3: r.volumeM3 == null ? null : Number(r.volumeM3) })));
  }

  /**
   * En qué punto de la cadena está cada árbol del censo de un plan (en pie →
   * talado → trozado → despachado → en el CTP), leído del libro ENTERO —no
   * del tope de 500 líneas con que el mapa carga el libro—. Lo pinta el mapa
   * del Libro TH sobre cada punto. Sólo lectura.
   *
   * Líneas del plan y las sin plan (las viejas no lo guardaban), el mismo
   * criterio de `arbolesDeTrozados`. Las anuladas vienen igual: no cuentan,
   * pero la última tala anulada explica por qué el censo y el libro no cuadran.
   * «En el CTP» = una troza recibida (no `noRecepcionada`) de un ingreso vivo
   * que guarda su línea de Trozado (ADR-450).
   */
  static async estadoDeArboles(tenantId: string, planId: string): Promise<EstadoDeArbolesPlan> {
    if (!tenantId) throw new Error("tenantId is required");
    const plan = planId.trim();
    if (!plan) return { arboles: [], sinCenso: [] };
    const [arboles, lineas] = await Promise.all([
      prisma.forestCensusTree.findMany({
        where: { tenantId, planId: plan, deletedAt: null },
        select: { id: true, treeCode: true, estado: true, condicion: true },
        take: 20_000,
      }),
      prisma.forestLothEntry.findMany({
        where: {
          tenantId,
          deletedAt: null,
          section: { in: ["tala", "trozado", "despacho_troza", "consumo_troza"] },
          OR: [{ planId: plan }, { planId: null }],
        },
        select: {
          id: true, section: true, status: true, lineNo: true, entryDate: true,
          treeCode: true, trozaCode: true, volumeM3: true, gtfNumber: true,
        },
        take: 50_000,
      }),
    ]);
    const trozados = lineas.filter((l) => l.section === "trozado" && l.status === "registrado").map((l) => l.id);
    const enCtp =
      trozados.length === 0
        ? []
        : await prisma.woodEntryTroza.findMany({
            where: {
              tenantId,
              lothTrozadoId: { in: trozados },
              noRecepcionada: false,
              entry: { tenantId, deletedAt: null, status: { notIn: [...ESTADOS_SIN_INGRESO] } },
            },
            select: { lothTrozadoId: true },
            distinct: ["lothTrozadoId"],
          });
    return estadoDeArbolesDelLibro(
      arboles,
      lineas.map((l) => ({ ...l, volumeM3: l.volumeM3 == null ? null : Number(l.volumeM3) })),
      new Set(enCtp.map((t) => t.lothTrozadoId).filter((id): id is string => !!id)),
    );
  }

  /**
   * Trazabilidad por código (target del QR de origen, Batch 4): dado un código de
   * árbol (85-TOR) o de troza (85-TOR-A), reconstruye toda la cadena del árbol +
   * el plan/título que lo autoriza. Solo info de origen legal (sin costos/precios).
   */
  static async traceByCode(tenantId: string, code: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const norm = code.trim();
    if (!norm) return null;
    // El árbol raíz del código: «85-TOR-A», «186A» y el único de ADR-474
    // «12-A (0000002)» (el paréntesis rompía la regla vieja del guion).
    const raices = arbolesParaTrazar(norm);
    const treeRoot = raices[0] ?? norm;

    const entries = await prisma.forestLothEntry.findMany({
      where: {
        tenantId, deletedAt: null, status: "registrado",
        OR: [
          { treeCode: { in: [...raices, norm] } },
          { trozaCode: { in: [...raices, norm] } },
          ...raices.map((r) => ({ trozaCode: { startsWith: `${r}-` } })),
        ],
      },
      orderBy: [{ entryDate: "asc" }, { lineNo: "asc" }],
      select: {
        section: true, lineNo: true, entryDate: true, treeCode: true, trozaCode: true, despachoCode: true,
        speciesCommon: true, speciesScientific: true, cites: true, productType: true,
        volumeM3: true, quantity: true, unit: true, gtfNumber: true, planId: true,
      },
    });
    if (entries.length === 0) return null;

    const planId = entries.find((e) => e.planId)?.planId ?? null;
    const plan = planId
      ? await prisma.forestPlan.findFirst({
          where: { tenantId, id: planId, deletedAt: null },
          select: { planType: true, planNumber: true, titularName: true, tituloHabilitante: true, resolucionNumber: true, resolucionDate: true, region: true, arffs: true, vigenciaHasta: true, estado: true },
        })
      : null;

    const speciesEntry = entries.find((e) => e.speciesCommon) ?? entries[0];
    const gtfs = [...new Set(entries.map((e) => e.gtfNumber).filter(Boolean))] as string[];

    return {
      code: norm,
      treeCode: treeRoot,
      species: speciesEntry.speciesCommon,
      scientific: speciesEntry.speciesScientific,
      cites: speciesEntry.cites,
      plan,
      gtfs,
      chain: entries.map((e) => ({
        section: e.section, lineNo: e.lineNo, entryDate: e.entryDate.toISOString(),
        treeCode: e.treeCode, trozaCode: e.trozaCode, despachoCode: e.despachoCode,
        productType: e.productType, volumeM3: e.volumeM3 ? Number(e.volumeM3) : null,
        quantity: e.quantity ? Number(e.quantity) : null, unit: e.unit, gtfNumber: e.gtfNumber,
      })),
    };
  }

  // ─── Carátula ────────────────────────────────────────────────────────

  static async createCaratula(tenantId: string, input: LothCaratulaInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.titularName?.trim()) throw new Error("titularName is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    const caratula = await prisma.forestLothCaratula.create({
      data: {
        tenantId,
        registroNumber: input.registroNumber?.trim() || null,
        tomo: input.tomo?.trim() || null,
        titularName: input.titularName.trim(),
        representanteLegal: input.representanteLegal?.trim() || null,
        tituloHabilitante: input.tituloHabilitante?.trim() || null,
        ruc: input.ruc?.trim() || null,
        dni: input.dni?.trim() || null,
        domicilio: input.domicilio?.trim() || null,
        departamento: input.departamento?.trim() || null,
        provincia: input.provincia?.trim() || null,
        distrito: input.distrito?.trim() || null,
        telefono: input.telefono?.trim() || null,
        email: input.email?.trim() || null,
        docGestionType: input.docGestionType?.trim() || null,
        docGestionName: input.docGestionName?.trim() || null,
        resolucionNumber: input.resolucionNumber?.trim() || null,
        resolucionDate: input.resolucionDate ?? null,
        createdBy: input.createdBy,
      },
    });
    auditLoth({
      tenantId,
      action: "loth_caratula_create",
      entity: "ForestLothCaratula",
      entityId: caratula.id,
      detail: `Creó la carátula del libro: ${caratula.titularName}${caratula.tituloHabilitante ? ` · TH ${caratula.tituloHabilitante}` : ""}`,
      user: input.createdBy,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return caratula;
  }

  static async listCaratulas(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestLothCaratula.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getActiveCaratula(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestLothCaratula.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateCaratula(
    tenantId: string,
    id: string,
    patch: Partial<Omit<LothCaratulaInput, "createdBy">>,
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const data: Prisma.ForestLothCaratulaUpdateInput = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      (data as Record<string, unknown>)[k] =
        typeof v === "string" ? v.trim() || null : v;
    }
    const caratula = await prisma.forestLothCaratula.update({
      where: { id, tenantId } satisfies Prisma.ForestLothCaratulaWhereUniqueInput,
      data,
    });
    auditLoth({
      tenantId,
      action: "loth_caratula_update",
      entity: "ForestLothCaratula",
      entityId: id,
      detail: `Actualizó la carátula: ${Object.keys(patch).join(", ")}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return caratula;
  }

  /**
   * Baja lógica de una carátula cargada por error (p. ej. de prueba).
   *
   * Sólo si ya no le cuelga ninguna línea viva: una carátula con líneas es la
   * identidad de un libro que existe, y borrarla dejaría esas líneas sin
   * titular en el formato SERFOR. Primero se sacan las líneas.
   */
  static async softDeleteCaratula(tenantId: string, id: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    const lineasVivas = await prisma.forestLothEntry.count({ where: { tenantId, caratulaId: id, deletedAt: null } });
    if (lineasVivas > 0) {
      throw new LothInvariantError(
        `La carátula tiene ${lineasVivas} línea(s) en el libro: no se puede borrar mientras las tenga.`,
        "CARATULA_CON_LINEAS",
        { lineasVivas },
      );
    }
    const caratula = await prisma.forestLothCaratula.update({
      where: { id, tenantId } satisfies Prisma.ForestLothCaratulaWhereUniqueInput,
      data: { deletedAt: new Date(), isActive: false },
    });
    auditLoth({
      tenantId,
      action: "loth_caratula_delete",
      entity: "ForestLothCaratula",
      entityId: id,
      detail: `Borró (soft-delete) la carátula: ${caratula.titularName}${caratula.tituloHabilitante ? ` · TH ${caratula.tituloHabilitante}` : ""}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return caratula;
  }

  /**
   * Lo que lee el aviso de plazos del Libro TH (`loth-aviso-plazos`, cron
   * `forestal-plazos`), con la MISMA forma que ve la pantalla: las líneas
   * serializadas como las devuelve la API (Decimals → string), las guías por
   * el mismo normalizador del cuadre (`gtfRegistradaDesdeApi`) y los planes de
   * `ForestPlanDB.listPlans` + `planFichaDesdeApi`, como la ficha del permiso.
   */
  static async datosAvisoPlazos(tenantId: string): Promise<DatosAvisoTh> {
    if (!tenantId) throw new Error("tenantId is required");
    const [lineas, gtfs, planes] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado" },
        orderBy: [{ section: "asc" }, { lineNo: "asc" }, { id: "asc" }],
        take: LIMITE_LINEAS_AVISO,
      }),
      /* TODAS las guías, no `ForestGtfDB.list` (corta en 200): con el tope, una
         guía vieja que el libro cita saldría «citada sin registrar» por WhatsApp
         — un rojo falso que enseña a ignorar el aviso. */
      prisma.forestGtf.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          gtfNumber: true, gtfDate: true, tipo: true, status: true, volumenTotalM3: true,
          piezasTotal: true, placaVehiculo: true, gtfDatos: true,
        },
        take: LIMITE_LINEAS_AVISO,
      }),
      ForestPlanDB.listPlans(tenantId),
    ]);
    // JSON ida y vuelta = exactamente lo que serializa la API (Decimal.toJSON, Date ISO).
    const comoApi = <T>(v: unknown): T => JSON.parse(JSON.stringify(v)) as T;
    return {
      lineas: comoApi<LothEntryDTO[]>(lineas),
      gtfs: comoApi<unknown[]>(gtfs).flatMap((raw) => {
        const g = gtfRegistradaDesdeApi(raw);
        const tipo = (raw as { tipo?: unknown }).tipo;
        return g ? [{ ...g, tipo: typeof tipo === "string" && tipo ? tipo : "trozas" }] : [];
      }),
      planes: comoApi<unknown[]>(planes).flatMap((raw) => {
        const p = planFichaDesdeApi(raw);
        return p ? [p] : [];
      }),
    };
  }

  /**
   * Tenants con Libro TH (líneas o un plan vivo), para el cron de plazos.
   * Excepción documentada a «tenantId primer parámetro»: es la enumeración que
   * el cron recorre de a un tenant, igual que `DocumentsDB.tenantsCon…`.
   */
  static async tenantsConLibroTh(): Promise<string[]> {
    const [conLineas, conPlan] = await Promise.all([
      prisma.forestLothEntry.findMany({ where: { deletedAt: null }, select: { tenantId: true }, distinct: ["tenantId"] }),
      prisma.forestPlan.findMany({ where: { deletedAt: null, isActive: true }, select: { tenantId: true }, distinct: ["tenantId"] }),
    ]);
    return [...new Set([...conLineas, ...conPlan].map((r) => r.tenantId))];
  }
}

/** Tope de líneas que lee el aviso (un libro real anda en cientos; esto es sólo un techo). */
const LIMITE_LINEAS_AVISO = 20_000;
