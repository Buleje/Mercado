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
import { LOTH_SECTIONS, type LothSection } from "@/lib/forestal/loth-constants";
import { auditLoth } from "@/lib/forestal/loth-audit";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { ForestLothPoaDB } from "@/lib/db/forest-loth-poa.db";
import { dmcParaEspecie } from "@/lib/forestal/loth-poa";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

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
 *   T8 · no se tala un árbol censado bajo el DMC de su especie → tala ilegal (RJ 458-2002-INRENA)
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
      | "T6_EXCESO_AUTORIZADO"
      | "T7_ESPECIE_NO_AUTORIZADA"
      // P1 — la línea cae en un mes cerrado: el acta es inmutable hasta reabrir.
      | "PERIODO_CERRADO",
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LothInvariantError";
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
  observations?: string | null;
  /**
   * Motivo por el que se tala un árbol bajo el DMC de su especie (T8). Sin esto
   * el alta se rechaza; con esto queda registrado en el libro y en la auditoría,
   * que es lo que se le exige explicar al titular ante la ARFFS.
   */
  justificacionDmc?: string | null;

  correctsLineNo?: number | null;
  correctionNote?: string | null;

  gpsLat?: number | string | null;
  gpsLng?: number | string | null;
  photoUrl?: string | null;

  createdBy: string;
}

export interface LothListFilters {
  section?: LothSection;
  caratulaId?: string;
  search?: string; // matches code/species/gtf
  includeAnnulled?: boolean;
  limit?: number;
  offset?: number;
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
function describeEntry(e: {
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

export class ForestLothDB {
  // ─── Entries ─────────────────────────────────────────────────────────

  /**
   * Crea una línea del libro dentro de UNA transacción que valida las
   * invariantes de cadena de custodia (T1–T5, ADR-305) y asigna el correlativo
   * `lineNo` bajo LOCK. Antes de esto el `create` insertaba sin ninguna guarda:
   * se podía movilizar dos veces la misma troza, trozar más de lo tumbado o
   * despachar más de lo producido — justo lo que fiscaliza OSINFOR. La Analítica
   * lo detectaba DESPUÉS; acá se IMPIDE.
   *
   * Lanza `LothInvariantError` (→ 422) si el dato rompe la cadena.
   */
  static async create(tenantId: string, input: LothEntryCreateInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!LOTH_SECTIONS.includes(input.section)) {
      throw new Error(`invalid section: ${input.section}`);
    }
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    // P1 (cierre de período): no se puede registrar una línea fechada en un mes
    // cerrado — el acta es inmutable hasta reabrir. Se chequea antes de la tx.
    const entryDate = input.entryDate ?? new Date();
    const cerrado = await ForestLothCierreDB.closedPeriodOf(tenantId, entryDate);
    if (cerrado) {
      throw new LothInvariantError(
        `El período ${cerrado.label} está cerrado: no se pueden registrar líneas fechadas en un mes cerrado. Reabrilo si necesitás corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    // T8 (DMC): un árbol censado por debajo del diámetro mínimo de corta de su
    // especie no se aprovecha. Va ANTES de la tx porque no hay recurso disputado
    // (es el dato contra el censo, no una carrera entre dos altas).
    await ForestLothDB.enforceDmc(tenantId, input);

    const entry = await prisma.$transaction(async (tx) => {
      // 1. Invariantes de cadena de custodia (lockean el recurso disputado).
      await ForestLothDB.enforceInvariants(tx, tenantId, input);

      // 2. Correlativo por (tenant, carátula, sección) — bajo LOCK para que dos
      //    altas concurrentes no repitan el N°. `IS NOT DISTINCT FROM` maneja la
      //    carátula null como igualdad (no como el `= NULL` que nunca matchea).
      const caratulaId = input.caratulaId ?? null;
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
      const lineNo = (max._max.lineNo ?? 0) + 1;

      return tx.forestLothEntry.create({
        data: {
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
          // La justificación del DMC queda EN el libro: es la explicación que
          // el titular tiene que poder mostrar en una fiscalización.
          observations: buildObservations(input),
          correctsLineNo: input.correctsLineNo ?? null,
          correctionNote: input.correctionNote?.trim() || null,
          gpsLat: dec(input.gpsLat),
          gpsLng: dec(input.gpsLng),
          photoUrl: input.photoUrl?.trim() || null,
          status: "registrado",
          createdBy: input.createdBy,
        },
      });
    }, LOTH_TX_OPTS);

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

    const arbol = await prisma.forestCensusTree.findFirst({
      where: { tenantId, treeCode, deletedAt: null },
      select: { speciesCommon: true, dapM: true, planId: true },
    });
    if (!arbol?.dapM) return;

    const config = await ForestLothPoaDB.get(tenantId, arbol.planId);
    const { cm: dmcCm, fuente } = dmcParaEspecie(arbol.speciesCommon, config.dmcOverrides);
    const dapCm = Number(arbol.dapM) * 100;
    if (!Number.isFinite(dapCm) || dapCm >= dmcCm) return;

    if (input.justificacionDmc?.trim()) return; // decisión asumida y registrada

    const origen = fuente === "plan" ? "fijado en el plan" : fuente === "oficial" ? "de la norma (RJ 458-2002-INRENA)" : "general (RJ 458-2002-INRENA)";
    throw new LothInvariantError(
      `El árbol ${treeCode} (${arbol.speciesCommon}) tiene ${dapCm.toFixed(1)} cm de DAP y el DMC ${origen} es ${dmcCm} cm: por debajo del diámetro mínimo de corta no se puede aprovechar. Si igual corresponde talarlo, escribí la justificación.`,
      "T8_BAJO_DMC",
      { treeCode, especie: arbol.speciesCommon, dapCm: Number(dapCm.toFixed(1)), dmcCm },
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
  ): Promise<void> {
    const section = input.section;
    const treeCode = input.treeCode?.trim() || null;
    const trozaCode = input.trozaCode?.trim() || null;

    if (section === "tala") {
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
            `La troza ${trozaCode} ya está registrada en Trozado (línea #${dup.lineNo}). Usá un código de troza único.`,
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
        select: { id: true, speciesCommon: true, volumeM3: true },
      });
      if (!trozada) {
        throw new LothInvariantError(
          `La troza ${trozaCode} no está registrada en Trozado. Registrá el trozado antes de despacharla o consumirla.`,
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
        await ForestLothDB.enforceT7(tx, tenantId, input.planId ?? null, trozada.speciesCommon);
        // T6 — despachar la troza no puede exceder el volumen autorizado del POA
        //      para su especie. El volumen es el de la troza según su Trozado.
        await ForestLothDB.enforceT6(
          tx, tenantId, input.planId ?? null,
          trozada.speciesCommon, trozada.volumeM3 != null ? Number(trozada.volumeM3) : 0,
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
      await ForestLothDB.enforceT7(tx, tenantId, input.planId ?? null, speciesCommon);
      // T6 — sólo el producto despachado en m³ moviliza volumen comparable con el
      //      autorizado (kg/unidad no se cuentan contra el volumen del POA, igual
      //      que en `computeBalance`).
      if (unit === "m3") {
        await ForestLothDB.enforceT6(tx, tenantId, input.planId ?? null, speciesCommon, qty);
      }
      return;
    }
    // producto_terminado: output del aserrío, sin invariante dura.
  }

  /**
   * T6 — el volumen MOVILIZADO de una especie no puede superar el volumen
   * AUTORIZADO por el título habilitante (POA) — el exceso de aprovechamiento es
   * la infracción que sanciona OSINFOR. Antes sólo se DETECTABA en la Analítica
   * (`computeBalance.exceso`); acá se IMPIDE al escribir el despacho.
   *
   * Aplica sólo cuando el plan define un volumen autorizado para esa especie (si
   * no, es código libre sin techo → se salta, mismo criterio que T4 sin tala).
   * LOCKEA la fila de autorización de la especie (`ForestPlanSpecies`), que es el
   * recurso disputado: dos despachos de la misma especie serializan sobre ella y
   * ninguno pasa leyendo un movilizado desactualizado. Es otra tabla que el lock
   * de T1 (sobre `ForestLothEntry` por trozaCode) → sin ciclo de deadlock.
   *
   * `movilizado` espeja EXACTO a `computeBalance` (loth-constants): despacho de
   * trozas (volumen resuelto vía Trozado) + despacho de producto en m³.
   */
  private static async enforceT6(
    tx: Prisma.TransactionClient,
    tenantId: string,
    planIdInput: string | null,
    speciesCommon: string | null,
    nuevoVolumen: number,
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

    // Lock + lectura de la autorización de la especie (el recurso disputado).
    await tx.$queryRaw`
      SELECT "id" FROM "ForestPlanSpecies"
      WHERE "tenantId" = ${tenantId} AND "planId" = ${planId} AND "speciesCommon" = ${species} AND "deletedAt" IS NULL
      ORDER BY "id" FOR UPDATE`;
    const auth = await tx.forestPlanSpecies.findFirst({
      where: { tenantId, planId, speciesCommon: species, deletedAt: null },
      select: { volumenAutorizadoM3: true },
    });
    if (!auth?.volumenAutorizadoM3) return; // sin techo declarado → no se bloquea
    const autorizado = Number(auth.volumenAutorizadoM3);

    // Movilizado hasta ahora para la especie (espejo de computeBalance):
    //  (a) trozas ya despachadas → su volumen según Trozado, filtrado a la especie
    const despachadas = await tx.forestLothEntry.findMany({
      where: { tenantId, section: "despacho_troza", status: "registrado", deletedAt: null },
      select: { trozaCode: true },
    });
    const codes = despachadas.map((d) => d.trozaCode).filter((c): c is string => !!c);
    let movTrozas = 0;
    if (codes.length > 0) {
      const trozados = await tx.forestLothEntry.aggregate({
        where: { tenantId, section: "trozado", status: "registrado", deletedAt: null, speciesCommon: species, trozaCode: { in: codes } },
        _sum: { volumeM3: true },
      });
      movTrozas = Number(trozados._sum.volumeM3 ?? 0);
    }
    //  (b) producto terminado despachado en m³ de la especie
    const prodDesp = await tx.forestLothEntry.aggregate({
      where: { tenantId, section: "despacho_producto", status: "registrado", deletedAt: null, speciesCommon: species, unit: "m3" },
      _sum: { quantity: true },
    });
    const movilizado = movTrozas + Number(prodDesp._sum.quantity ?? 0);

    if (r4(movilizado + nuevoVolumen) > r4(autorizado)) {
      throw new LothInvariantError(
        `El POA autoriza ${r4(autorizado)} m³ de ${species} y ya se movilizaron ${r4(movilizado)} m³; ` +
          `este despacho de ${r4(nuevoVolumen)} m³ excede lo autorizado. Es la infracción que sanciona OSINFOR.`,
        "T6_EXCESO_AUTORIZADO",
        { species, autorizado: r4(autorizado), movilizado: r4(movilizado), pedido: r4(nuevoVolumen) },
      );
    }
  }

  /**
   * T7 — la especie que se MOVILIZA (despacho de troza o de producto) debe estar
   * entre las autorizadas del plan de manejo. Talar/movilizar una especie que no
   * figura en la resolución del título habilitante es infracción — es lo que
   * cruza OSINFOR contra el POA. Antes sólo se DETECTABA en el cruce del Plan de
   * Manejo (UI); acá se IMPIDE al escribir el despacho.
   *
   * Se aplica SÓLO cuando el despacho declara explícitamente su plan (`input.planId`).
   * Sin plan atado (código libre) no fabricamos la restricción: no sabríamos contra
   * qué POA validar. A diferencia de T6, NO cae al plan vigente por defecto — eso
   * bloquearía movimientos legítimos de otros planes/tenants y rompería la cadena
   * de "código libre". Match de especie case-insensitive (el nombre común entra a
   * mano y puede diferir en mayúsculas). Sin especie o sin especies autorizadas
   * cargadas todavía (plan a medio configurar) → no bloquea.
   */
  private static async enforceT7(
    tx: Prisma.TransactionClient,
    tenantId: string,
    planId: string | null,
    speciesCommon: string | null,
  ): Promise<void> {
    const species = speciesCommon?.trim() || null;
    if (!planId || !species) return;

    const autorizadas = await tx.forestPlanSpecies.count({
      where: { tenantId, planId, deletedAt: null },
    });
    if (autorizadas === 0) return; // plan sin especies cargadas → no se puede juzgar

    const match = await tx.forestPlanSpecies.findFirst({
      where: { tenantId, planId, deletedAt: null, speciesCommon: { equals: species, mode: "insensitive" } },
      select: { id: true },
    });
    if (!match) {
      throw new LothInvariantError(
        `La especie "${species}" no está autorizada en el plan de manejo (POA). ` +
          `Movilizar una especie fuera del título habilitante es infracción — agregala a las especies ` +
          `autorizadas del plan o corregí el registro antes de emitir la GTF.`,
        "T7_ESPECIE_NO_AUTORIZADA",
        { species, planId },
      );
    }
  }

  static async list(tenantId: string, filters: LothListFilters = {}) {
    if (!tenantId) throw new Error("tenantId is required");

    const where: Prisma.ForestLothEntryWhereInput = { tenantId, deletedAt: null };
    if (filters.section) where.section = filters.section;
    if (filters.caratulaId) where.caratulaId = filters.caratulaId;
    if (!filters.includeAnnulled) where.status = "registrado";
    if (filters.search) {
      where.OR = [
        { treeCode: { contains: filters.search, mode: "insensitive" } },
        { trozaCode: { contains: filters.search, mode: "insensitive" } },
        { speciesCommon: { contains: filters.search, mode: "insensitive" } },
        { gtfNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [entries, total] = await Promise.all([
      prisma.forestLothEntry.findMany({
        where,
        orderBy: [{ section: "asc" }, { lineNo: "asc" }],
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
    const entry = await prisma.forestLothEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason.trim() },
    });
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

    const entry = await prisma.forestLothEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestLothEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
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

  /** Resumen por sección: conteo + volumen registrado. */
  static async stats(tenantId: string, caratulaId?: string) {
    const where: Prisma.ForestLothEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: "registrado",
    };
    if (caratulaId) where.caratulaId = caratulaId;
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
      const trees = await prisma.forestCensusTree.findMany({
        where: { tenantId, deletedAt: null, estado: "en_pie", ...(planId ? { planId } : {}) },
        orderBy: { treeCode: "asc" },
        take: 1000,
      });
      return trees.map((t) => ({
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
   * Trazabilidad por código (target del QR de origen, Batch 4): dado un código de
   * árbol (85-TOR) o de troza (85-TOR-A), reconstruye toda la cadena del árbol +
   * el plan/título que lo autoriza. Solo info de origen legal (sin costos/precios).
   */
  static async traceByCode(tenantId: string, code: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const norm = code.trim();
    if (!norm) return null;
    // El código de troza es <árbol>-<sufijo>; derivamos el árbol raíz.
    const treeRoot = norm.includes("-") ? norm.replace(/-[A-Za-z0-9]+$/, "") : norm;

    const entries = await prisma.forestLothEntry.findMany({
      where: {
        tenantId, deletedAt: null, status: "registrado",
        OR: [
          { treeCode: treeRoot }, { treeCode: norm },
          { trozaCode: norm }, { trozaCode: treeRoot }, { trozaCode: { startsWith: `${treeRoot}-` } },
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
}
