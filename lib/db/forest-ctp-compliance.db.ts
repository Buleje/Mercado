/**
 * forest-ctp-compliance.db — la historia del cumplimiento del Libro CTP (ADR-384).
 *
 * El panel muestra una foto: cómo está el score HOY. Esto guarda la película,
 * para poder contestar «¿esto viene mejorando?», «¿cuánto subió cuando
 * corregimos los 12 fuera de plazo de julio?» y «¿desde cuándo hay stock
 * negativo?» — que es exactamente lo que pregunta un fiscalizador.
 *
 * POR QUÉ ESTA CLASE NO CALCULA NADA:
 * el score se compone en el cliente juntando cinco agregados que ya existen
 * (`wood-entries?stats`, `ctp?saldos`, `ctp?traza`, `ctp-ficha`,
 * `ctp?section=produccion`). Un cron que los reimplementara acá crearía un
 * SEGUNDO score que va a divergir del que ve el operador — el mismo patrón que
 * este módulo ya combatió tres veces (las tres lecturas de una troza, los tres
 * lectores de `estaFueraDePlazo`, `claveEspecie`). Un libro fiscalizable no
 * puede tener dos versiones de su propio cumplimiento.
 *
 * Así que acá sólo se GUARDA lo que el panel ya calculó. El costo aceptado y
 * dicho en la UI: sólo hay punto los días que alguien abrió el libro.
 */
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";

const CACHE_PREFIX = "forest-ctp-compliance";

/** Los contadores del snapshot, tal como los compuso el panel. */
export interface ComplianceSnapshotInput {
  /** La `key` del CtpPeriod mirado (`mes-actual`, `todo`, …). */
  periodo: string;
  /** 0-100, tal cual lo mostró el gauge. */
  score: number;
  fueraPlazo: number;
  pendientes: number;
  especiesEnNegativo: number;
  stockNegativo: number;
  despachosSinTraza: number;
  citesCount: number;
  citesSinPermiso: number;
  rendimientoAlto: number;
  documentosVencidos: number;
  documentosPorVencer: number;
  totalIngresos: number;
}

export interface ComplianceSnapshot extends ComplianceSnapshotInput {
  /** El día medido, `yyyy-mm-dd`. */
  fecha: string;
}

/**
 * El día de hoy en UTC, a medianoche.
 *
 * UTC y no hora de Lima a propósito: la columna es `@db.Date` y el resto del
 * libro ya formatea sus fechas date-only con `timeZone:"UTC"`. Mezclar
 * convenciones acá reintroduciría el off-by-one que el módulo ya arregló.
 */
function hoyUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** `Date` → `yyyy-mm-dd` sin pasar por la zona horaria local. */
const iso = (d: Date): string => d.toISOString().slice(0, 10);

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : 0)));

/** Los contadores son cantidades: nunca negativas, siempre enteras. */
const cuenta = (n: number): number => clamp(n, 0, 1_000_000);

export const ForestCtpComplianceDB = {
  /**
   * Guarda (o pisa) el punto de HOY para ese período.
   *
   * Pisa a propósito: si el operador corrigió tres ingresos y volvió a abrir el
   * libro, lo que vale es el último estado del día, no el primero. Guardar el
   * peor momento de la jornada como si fuera el cierre sería mentir hacia
   * abajo.
   */
  async registrarHoy(
    tenantId: string,
    input: ComplianceSnapshotInput,
    actor: string,
  ): Promise<ComplianceSnapshot> {
    const fecha = hoyUtc();
    const datos = {
      score: clamp(input.score, 0, 100),
      fueraPlazo: cuenta(input.fueraPlazo),
      pendientes: cuenta(input.pendientes),
      especiesEnNegativo: cuenta(input.especiesEnNegativo),
      stockNegativo: cuenta(input.stockNegativo),
      despachosSinTraza: cuenta(input.despachosSinTraza),
      citesCount: cuenta(input.citesCount),
      citesSinPermiso: cuenta(input.citesSinPermiso),
      rendimientoAlto: cuenta(input.rendimientoAlto),
      documentosVencidos: cuenta(input.documentosVencidos),
      documentosPorVencer: cuenta(input.documentosPorVencer),
      totalIngresos: cuenta(input.totalIngresos),
    };

    const row = await prisma.forestCtpComplianceSnapshot.upsert({
      where: { tenantId_periodo_fecha: { tenantId, periodo: input.periodo, fecha } },
      create: { tenantId, periodo: input.periodo, fecha, ...datos, createdBy: actor },
      update: datos,
    });

    invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    return { ...datos, periodo: row.periodo, fecha: iso(row.fecha) };
  },

  /**
   * La serie de un período, del más viejo al más nuevo.
   *
   * `dias` acota hacia atrás. No rellena los días sin punto: interpolar sobre
   * un hueco de tres semanas dibujaría una línea que afirma un dato que nadie
   * midió — y este libro es fiscalizable.
   */
  async serie(tenantId: string, periodo: string, dias = 90): Promise<ComplianceSnapshot[]> {
    const desde = hoyUtc();
    desde.setUTCDate(desde.getUTCDate() - clamp(dias, 1, 730));

    const rows = await prisma.forestCtpComplianceSnapshot.findMany({
      where: { tenantId, periodo, fecha: { gte: desde } },
      orderBy: { fecha: "asc" },
    });

    return rows.map((r) => ({
      fecha: iso(r.fecha),
      periodo: r.periodo,
      score: r.score,
      fueraPlazo: r.fueraPlazo,
      pendientes: r.pendientes,
      especiesEnNegativo: r.especiesEnNegativo,
      stockNegativo: r.stockNegativo,
      despachosSinTraza: r.despachosSinTraza,
      citesCount: r.citesCount,
      citesSinPermiso: r.citesSinPermiso,
      rendimientoAlto: r.rendimientoAlto,
      documentosVencidos: r.documentosVencidos,
      documentosPorVencer: r.documentosPorVencer,
      totalIngresos: r.totalIngresos,
    }));
  },
};
