/**
 * forest-lote.db — Lotes de producción / comercialización forestal (ADR-136).
 *
 * Capa COMERCIAL sobre el CTP: agrupa corridas de producción ya hechas en un
 * lote con código (L-2026-001), grado de calidad y estado. Es la unidad que un
 * comprador o exportador referencia, y hereda la cadena de custodia de sus
 * corridas — cada corrida → sus guías de ingreso (ForestCtpConsumo) — así que
 * puede certificar su origen igual que un despacho.
 *
 * ── Invariante L1 (mirror de I5) ────────────────────────────────────────────
 *   Σ miembros(corrida) ≤ corrida.quantity    (a través de TODOS los lotes)
 *
 * No se puede empaquetar más de lo que una corrida produjo. Se valida app-level
 * con LOCK sobre las CORRIDAS (el recurso disputado), ordenadas por id, dentro
 * de la tx del setMiembros — exactamente el patrón de I5. Postgres no puede
 * (es agregada y el aislamiento es app-level).
 *
 * Frontera con el despacho (v1): el lote es organizativo; su "disponible"
 * descuenta lo puesto en OTROS lotes, NO en despachos. Es una vista comercial
 * paralela, no un segundo stock — despacho por lote sería un follow-up.
 */
import { calcularMetaEspecies, construirCadenaLote } from "@/lib/forestal/ctp-cadena-lote";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { CtpInvariantError, CTP_TX_OPTS } from "./forest-ctp-consumo.db";
import { metaDeLote } from "@/lib/forestal/lote-metricas";

const CACHE_PREFIX = "forest-lote";
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export type LoteStatus = "abierto" | "cerrado" | "despachado" | "anulado";
export const LOTE_STATUSES: readonly LoteStatus[] = ["abierto", "cerrado", "despachado", "anulado"];

/** Transiciones permitidas — un lote anulado o despachado ya no se reabre. */
const TRANSICIONES: Record<LoteStatus, LoteStatus[]> = {
  abierto: ["cerrado", "anulado"],
  cerrado: ["abierto", "despachado", "anulado"],
  despachado: [],
  anulado: [],
};

export interface LoteMiembroInput {
  produccionEntryId: string;
  quantity: number | string;
}

export interface CreateLoteInput {
  productType?: string | null;
  speciesCommon?: string | null;
  speciesScientific?: string | null;
  cites?: boolean;
  unit?: string | null;
  grade?: string | null;
  destino?: string | null;
  /** Ventana de trabajo (ADR-327): otro eje que el `status` comercial. */
  fechaInicio?: Date | null;
  fechaFin?: Date | null;
  /** De quién es la madera — el caso del aserradero que asierra por encargo. */
  titularId?: string | null;
  titularNombre?: string | null;
  notes?: string | null;
  miembros?: LoteMiembroInput[];
  createdBy: string;
}

export interface TrazabilidadLote {
  completa: boolean;
  totalCantidad: number;
  /** Por qué NO está completa, para que la UI lo explique. */
  motivo: "ok" | "sin_miembros" | "corrida_sin_origen";
  corridas: {
    produccionEntryId: string;
    lineNo: number;
    quantity: number;
    guias: string[];
    sinOrigen: boolean;
  }[];
}

export class ForestLoteDB {
  /** Lista de lotes con conteo de miembros y cantidad total (agregado en DB). */
  static async list(
    tenantId: string,
    opts: { status?: LoteStatus; search?: string; fromDate?: Date; toDate?: Date } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestProdLoteWhereInput = {
      tenantId,
      deletedAt: null,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.fromDate || opts.toDate
        ? { createdAt: { ...(opts.fromDate && { gte: opts.fromDate }), ...(opts.toDate && { lte: opts.toDate }) } }
        : {}),
      ...(opts.search?.trim()
        ? {
            OR: [
              { loteCode: { contains: opts.search.trim(), mode: "insensitive" } },
              { speciesCommon: { contains: opts.search.trim(), mode: "insensitive" } },
              { productType: { contains: opts.search.trim(), mode: "insensitive" } },
              { destino: { contains: opts.search.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const lotes = await prisma.forestProdLote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      // `produccionEntryId` viaja para que el export oficial pueda poner el N° de
      // lote (casillero 8 de las secciones 3 y 4 del LO-CTP) en la fila de la
      // corrida y del despacho: sin esto, el lote se ve en el módulo pero falta
      // justo en el documento que se presenta.
      include: { miembros: { select: { quantity: true, produccionEntryId: true } } },
    });

    // Cuánto de cada lote YA SALIÓ. Sin esto el módulo mostraba el lote armado
    // pero no lo único que se pregunta en la planta —*"¿cuánto me queda de este
    // lote?"*— y había que abrir corrida por corrida para saberlo.
    //
    // Sólo cuentan los despachos VIVOS: uno anulado devolvió el producto al
    // lote. Mismo criterio que `ForestCtpDB.list()`; si divergieran, el mismo
    // despacho restaría en una pantalla y no en la otra.
    const corridasDeLotes = [...new Set(lotes.flatMap((l) => l.miembros.map((m) => m.produccionEntryId)))];
    const [salidas, consumos, corridas] = corridasDeLotes.length
      ? await Promise.all([
          prisma.forestCtpDespachoOrigen.groupBy({
            by: ["produccionEntryId"],
            where: {
              tenantId,
              produccionEntryId: { in: corridasDeLotes },
              despacho: { deletedAt: null, status: "registrado" },
            },
            _sum: { quantity: true },
          }),
          // Los m³ de trozas que entraron a cada corrida: es el DENOMINADOR de
          // la meta de rendimiento (ADR-134 D5, invariante I2).
          prisma.forestCtpConsumo.groupBy({
            by: ["ctpEntryId"],
            where: { tenantId, ctpEntryId: { in: corridasDeLotes } },
            _sum: { volumeM3: true },
          }),
          // La corrida anulada no produjo nada: incluirla bajaría el rendimiento
          // con madera que no salió. Mismo criterio que el despacho de arriba.
          prisma.forestCtpEntry.findMany({
            where: {
              tenantId,
              id: { in: corridasDeLotes },
              deletedAt: null,
              status: "registrado",
            },
            select: { id: true, speciesCommon: true, quantity: true, unit: true },
          }),
        ])
      : [[], [], []];

    const despachadoPorCorrida = new Map(
      salidas.map((r) => [r.produccionEntryId, Number(r._sum.quantity ?? 0)]),
    );
    const consumoPorCorrida = new Map(
      consumos.map((r) => [r.ctpEntryId, Number(r._sum.volumeM3 ?? 0)]),
    );
    const corridaPorId = new Map(corridas.map((c) => [c.id, c]));

    return lotes.map((l) => {
      const totalCantidad = r4(l.miembros.reduce((a, m) => a + Number(m.quantity), 0));
      const despachado = r4(
        l.miembros.reduce((a, m) => a + (despachadoPorCorrida.get(m.produccionEntryId) ?? 0), 0),
      );

      // La meta se arma con las corridas ENTERAS del lote, no con la fracción
      // que el lote se lleva: el consumo se atribuye a la corrida completa (I2)
      // y cruzarlo contra una parte de lo producido daría un rendimiento
      // inventado. La pantalla lo rotula como "de sus corridas".
      const idsVivos = l.miembros
        .map((m) => m.produccionEntryId)
        .filter((id) => corridaPorId.has(id));
      const meta = metaDeLote(
        calcularMetaEspecies(
          idsVivos.map((id) => ({
            produccionEntryId: id,
            especie: corridaPorId.get(id)?.speciesCommon ?? "—",
            volumeM3: consumoPorCorrida.get(id) ?? 0,
          })),
          idsVivos.map((id) => {
            const c = corridaPorId.get(id)!;
            return {
              produccionEntryId: id,
              especie: c.speciesCommon,
              quantity: Number(c.quantity ?? 0),
              unit: c.unit,
            };
          }),
        ),
      );

      return {
        id: l.id,
        loteCode: l.loteCode,
        productType: l.productType,
        speciesCommon: l.speciesCommon,
        speciesScientific: l.speciesScientific,
        cites: l.cites,
        unit: l.unit,
        grade: l.grade,
        destino: l.destino,
        fechaInicio: l.fechaInicio,
        fechaFin: l.fechaFin,
        titularId: l.titularId,
        titularNombre: l.titularNombre,
        status: l.status as LoteStatus,
        notes: l.notes,
        annulledReason: l.annulledReason,
        createdAt: l.createdAt,
        closedAt: l.closedAt,
        miembrosCount: l.miembros.length,
        /** Corridas que arma este lote — para mapear corrida → N° de lote. */
        corridaIds: l.miembros.map((m) => m.produccionEntryId),
        totalCantidad,
        despachado,
        /**
         * Lo que queda del lote. Con `Math.max(0, …)`: un despacho mayor que lo
         * armado es un dato roto, y mostrarlo en negativo haría pensar que el
         * sistema descuenta de más en vez de que hay algo que revisar arriba.
         */
        disponible: r4(Math.max(0, totalCantidad - despachado)),
        /** Rendimiento vs. la meta de referencia. `null` sin consumo atribuido. */
        meta,
      };
    });
  }

  /** Resumen del período para la cabecera del módulo. */
  static async stats(tenantId: string, period: { fromDate?: Date; toDate?: Date } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestProdLoteWhereInput = {
      tenantId,
      deletedAt: null,
      ...(period.fromDate || period.toDate
        ? { createdAt: { ...(period.fromDate && { gte: period.fromDate }), ...(period.toDate && { lte: period.toDate }) } }
        : {}),
    };
    const [porEstado, miembros] = await Promise.all([
      prisma.forestProdLote.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.forestProdLoteMiembro.aggregate({
        where: { tenantId, lote: where },
        _sum: { quantity: true },
      }),
    ]);
    const byStatus = Object.fromEntries(porEstado.map((r) => [r.status, r._count._all])) as Record<string, number>;
    return {
      total: porEstado.reduce((a, r) => a + r._count._all, 0),
      abiertos: byStatus.abierto ?? 0,
      cerrados: byStatus.cerrado ?? 0,
      despachados: byStatus.despachado ?? 0,
      anulados: byStatus.anulado ?? 0,
      cantidadTotal: r4(Number(miembros._sum.quantity ?? 0)),
    };
  }

  /** Ficha completa: el lote + sus miembros con la corrida de cada uno. */
  static async get(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestProdLote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        miembros: {
          orderBy: { createdAt: "asc" },
          include: {
            produccion: {
              select: { id: true, lineNo: true, entryDate: true, productType: true, speciesCommon: true, quantity: true, unit: true },
            },
          },
        },
      },
    });
    if (!lote) return null;
    return {
      ...lote,
      status: lote.status as LoteStatus,
      miembros: lote.miembros.map((m) => ({
        produccionEntryId: m.produccionEntryId,
        quantity: Number(m.quantity),
        lineNo: m.produccion.lineNo,
        productType: m.produccion.productType,
        speciesCommon: m.produccion.speciesCommon,
        producido: m.produccion.quantity ? Number(m.produccion.quantity) : 0,
      })),
    };
  }

  /**
   * Corridas de producción con saldo disponible para empaquetar en un lote.
   * disponible = corrida.quantity − Σ(miembros en OTROS lotes de esa corrida).
   */
  static async availableCorridas(tenantId: string, opts: { excludeLoteId?: string } = {}) {
    if (!tenantId) throw new Error("tenantId is required");
    const corridas = await prisma.forestCtpEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado", section: "produccion" },
      orderBy: { entryDate: "desc" },
      take: 300,
      select: {
        id: true, lineNo: true, entryDate: true, productType: true,
        speciesCommon: true, speciesScientific: true, cites: true, quantity: true, unit: true,
      },
    });
    if (corridas.length === 0) return [];

    const enLotes = await prisma.forestProdLoteMiembro.groupBy({
      by: ["produccionEntryId"],
      where: {
        tenantId,
        produccionEntryId: { in: corridas.map((c) => c.id) },
        ...(opts.excludeLoteId ? { loteId: { not: opts.excludeLoteId } } : {}),
        // Un lote anulado/borrado no sigue reservando la corrida.
        lote: { deletedAt: null, status: { not: "anulado" } },
      },
      _sum: { quantity: true },
    });
    const usado = new Map(enLotes.map((e) => [e.produccionEntryId, Number(e._sum.quantity ?? 0)]));

    return corridas
      .map((c) => {
        const producido = c.quantity ? Number(c.quantity) : 0;
        return {
          kind: "corrida" as const,
          id: c.id,
          code: `Corrida #${c.lineNo}`,
          lineNo: c.lineNo,
          entryDate: c.entryDate,
          productType: c.productType,
          species: c.speciesCommon,
          scientific: c.speciesScientific,
          cites: c.cites,
          unit: c.unit,
          producido,
          disponible: r4(producido - (usado.get(c.id) ?? 0)),
        };
      })
      .filter((c) => c.disponible > 0);
  }

  /**
   * Crea un lote: genera el correlativo L-YYYY-NNN y, si vienen miembros, los
   * atribuye (valida L1). El correlativo se saca dentro de la tx para que dos
   * altas concurrentes no colisionen en el mismo número.
   */
  static async create(tenantId: string, input: CreateLoteInput, now: Date) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    const year = now.getUTCFullYear();
    const prefix = `L-${year}-`;

    const lote = await prisma.$transaction(async (tx) => {
      // Correlativo por AÑO y tenant: el mayor sufijo existente + 1.
      const ultimos = await tx.forestProdLote.findMany({
        where: { tenantId, loteCode: { startsWith: prefix } },
        select: { loteCode: true },
      });
      const maxN = ultimos.reduce((max, l) => {
        const n = parseInt(l.loteCode.slice(prefix.length), 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
      const loteCode = `${prefix}${String(maxN + 1).padStart(3, "0")}`;

      return tx.forestProdLote.create({
        data: {
          tenantId,
          loteCode,
          productType: input.productType?.trim() || null,
          speciesCommon: input.speciesCommon?.trim() || null,
          speciesScientific: input.speciesScientific?.trim() || null,
          cites: input.cites ?? false,
          unit: input.unit?.trim() || "m3",
          grade: input.grade?.trim() || null,
          destino: input.destino?.trim() || null,
          fechaInicio: input.fechaInicio ?? null,
          fechaFin: input.fechaFin ?? null,
          titularId: input.titularId?.trim() || null,
          // El nombre queda copiado: es acta. Si mañana se corrige la ficha del
          // directorio, lo que se certificó con este lote no cambia.
          titularNombre: input.titularNombre?.trim() || null,
          notes: input.notes?.trim() || null,
          status: "abierto",
          createdBy: input.createdBy,
        },
      });
    }, CTP_TX_OPTS);

    auditCtp({
      tenantId,
      action: "ctp_lote_create",
      entity: "ForestProdLote",
      entityId: lote.id,
      detail: `Creó el lote ${lote.loteCode}${lote.productType ? ` · ${lote.productType}` : ""}${lote.speciesCommon ? ` · ${lote.speciesCommon}` : ""}`,
      user: input.createdBy,
    });

    // La atribución va por su propia vía (valida L1). Si viola, tira y el lote
    // queda sin miembros — visible como lote vacío, que es lo que hay que corregir.
    if (input.miembros?.length) {
      await ForestLoteDB.setMiembros(tenantId, lote.id, input.miembros, input.createdBy);
    }

    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* best-effort */ }
    return lote;
  }

  /**
   * Reemplaza el set de miembros de un lote, validando L1 + tenant + orientación
   * dentro de UNA transacción. LOCKEA LAS CORRIDAS (el recurso disputado), no el
   * lote — dos lotes citando la misma corrida lockean la misma fila y se serializan.
   */
  static async setMiembros(tenantId: string, loteId: string, miembros: LoteMiembroInput[], user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!loteId) throw new Error("loteId is required");
    if (!user?.trim()) throw new Error("user is required");

    const ids = miembros.map((m) => m.produccionEntryId);
    if (new Set(ids).size !== ids.length) {
      throw new CtpInvariantError(
        "Una misma corrida aparece dos veces: sumá las cantidades en una sola línea.",
        "I4_SOBRE_ATRIBUCION_DESPACHO",
      );
    }
    for (const m of miembros) {
      if (Number(m.quantity) <= 0) {
        throw new CtpInvariantError("Una cantidad de miembro debe ser mayor a 0.", "I4_SOBRE_ATRIBUCION_DESPACHO", {
          produccionEntryId: m.produccionEntryId,
        });
      }
    }

    return prisma.$transaction(async (tx) => {
      const lote = await tx.forestProdLote.findFirst({
        where: { id: loteId, tenantId, deletedAt: null },
        select: { id: true, loteCode: true, status: true },
      });
      if (!lote) throw new Error("Lote no encontrado");
      if (lote.status !== "abierto") {
        throw new CtpInvariantError(
          `El lote ${lote.loteCode} está ${lote.status}: reabrilo para cambiar sus miembros.`,
          "CONGELADO",
          { status: lote.status },
        );
      }

      // Lock de las corridas — el recurso disputado (L1).
      if (ids.length > 0) {
        await tx.$queryRaw`
          SELECT "id" FROM "ForestCtpEntry"
          WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          ORDER BY "id"
          FOR UPDATE
        `;
      }

      const corridas = await tx.forestCtpEntry.findMany({
        where: { id: { in: ids }, tenantId, deletedAt: null, status: "registrado", section: "produccion" },
        select: { id: true, lineNo: true, quantity: true },
      });
      if (corridas.length !== ids.length) {
        const vistas = new Set(corridas.map((c) => c.id));
        throw new CtpInvariantError(
          "Alguna corrida citada no existe, fue anulada, no es de producción, o es de otra tienda.",
          "TENANT_MISMATCH",
          { faltantes: ids.filter((id) => !vistas.has(id)) },
        );
      }

      // L1 — Σ miembros por corrida ≤ producido, contando OTROS lotes vivos.
      const otros = await tx.forestProdLoteMiembro.groupBy({
        by: ["produccionEntryId"],
        where: {
          tenantId,
          produccionEntryId: { in: ids },
          loteId: { not: loteId },
          lote: { deletedAt: null, status: { not: "anulado" } },
        },
        _sum: { quantity: true },
      });
      const yaEnLotes = new Map(otros.map((o) => [o.produccionEntryId, Number(o._sum.quantity ?? 0)]));

      for (const m of miembros) {
        const corrida = corridas.find((c) => c.id === m.produccionEntryId)!;
        const producido = corrida.quantity ? Number(corrida.quantity) : 0;
        const disponible = producido - (yaEnLotes.get(m.produccionEntryId) ?? 0);
        if (r4(Number(m.quantity)) > r4(disponible)) {
          throw new CtpInvariantError(
            `La corrida #${corrida.lineNo} produjo ${r4(producido)} y sólo le quedan ${r4(disponible)} sin empaquetar; estás pidiendo ${r4(Number(m.quantity))}.`,
            "I5_SOBRE_SALIDA_PRODUCCION",
            { lineNo: corrida.lineNo, producido: r4(producido), disponible: r4(disponible), pedido: r4(Number(m.quantity)) },
          );
        }
      }

      const antes = await tx.forestProdLoteMiembro.findMany({
        where: { loteId, tenantId },
        include: { produccion: { select: { lineNo: true } } },
      });

      await tx.forestProdLoteMiembro.deleteMany({ where: { loteId, tenantId } });
      if (miembros.length > 0) {
        await tx.forestProdLoteMiembro.createMany({
          data: miembros.map((m) => ({
            tenantId,
            loteId,
            produccionEntryId: m.produccionEntryId,
            quantity: new Prisma.Decimal(m.quantity),
            createdBy: user,
          })),
        });
      }

      const result = await tx.forestProdLoteMiembro.findMany({
        where: { loteId, tenantId },
        include: { produccion: { select: { lineNo: true } } },
      });

      const fmt = (rows: { quantity: Prisma.Decimal; produccion: { lineNo: number } }[]) =>
        rows.length === 0 ? "(vacío)" : rows.map((r) => `corrida #${r.produccion.lineNo}: ${Number(r.quantity)}`).join(", ");
      auditCtp({
        tenantId,
        action: "ctp_lote_miembros_set",
        entity: "ForestProdLote",
        entityId: loteId,
        detail: `Miembros del lote ${lote.loteCode}: ${fmt(antes)} → ${fmt(result)}`,
        user,
      });

      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* best-effort */ }
      return result.map((r) => ({ produccionEntryId: r.produccionEntryId, quantity: Number(r.quantity), lineNo: r.produccion.lineNo }));
    }, CTP_TX_OPTS);
  }

  /** Cambia el estado del lote respetando las transiciones válidas. */
  static async updateStatus(tenantId: string, id: string, next: LoteStatus, user: string, reason?: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestProdLote.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, loteCode: true, status: true, miembros: { select: { id: true }, take: 1 } },
    });
    if (!lote) throw new Error("Lote no encontrado");
    const current = lote.status as LoteStatus;
    if (!TRANSICIONES[current].includes(next)) {
      throw new CtpInvariantError(
        `No se puede pasar un lote de "${current}" a "${next}".`,
        "TENANT_MISMATCH",
        { from: current, to: next },
      );
    }
    if ((next === "cerrado" || next === "despachado") && lote.miembros.length === 0) {
      throw new CtpInvariantError("Un lote vacío no se puede cerrar ni despachar.", "TENANT_MISMATCH");
    }
    if (next === "anulado" && (!reason || reason.trim().length < 3)) {
      throw new CtpInvariantError("Indicá el motivo de la anulación (mín. 3 caracteres).", "TENANT_MISMATCH");
    }

    const updated = await prisma.forestProdLote.update({
      where: { id },
      data: {
        status: next,
        ...(next === "cerrado" ? { closedAt: new Date() } : {}),
        ...(next === "anulado" ? { annulledReason: reason!.trim() } : {}),
      },
    });

    auditCtp({
      tenantId,
      action: "ctp_lote_status",
      entity: "ForestProdLote",
      entityId: id,
      detail: `Lote ${lote.loteCode}: ${current} → ${next}${reason ? ` · motivo: ${reason.trim()}` : ""}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* best-effort */ }
    return { ...updated, status: updated.status as LoteStatus };
  }

  /**
   * ¿La cadena de custodia del lote está completa? Hereda de las corridas: cada
   * miembro debe tener su materia prima atribuida (ForestCtpConsumo). Mismo gate
   * que el certificado del despacho (ADR-135 D3).
   */
  /**
   * La cadena de custodia completa del lote (ADR-315): guías → corridas →
   * despachos, con el balance.
   *
   * `trazabilidadLote` responde "¿está completa?"; esto responde "¿cuál es?".
   * Son dos preguntas distintas y las dos hacen falta: la primera gatea el
   * certificado, la segunda es la que se le muestra a un fiscalizador.
   */
  static async cadenaDeLote(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestProdLote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        miembros: {
          include: {
            produccion: {
              select: {
                id: true, lineNo: true, entryDate: true, productType: true,
                speciesCommon: true, lineaProduccion: true, quantity: true, unit: true,
              },
            },
          },
        },
      },
    });
    if (!lote) return null;

    const corridaIds = lote.miembros.map((m) => m.produccionEntryId);
    if (corridaIds.length === 0) {
      return { lote, cadena: construirCadenaLote([], [], []) };
    }

    // Las dos puntas de la cadena, en paralelo: de dónde vino y a dónde fue.
    const [consumos, origenes] = await Promise.all([
      prisma.forestCtpConsumo.findMany({
        where: { tenantId, ctpEntryId: { in: corridaIds } },
        select: {
          ctpEntryId: true,
          volumeM3: true,
          woodEntry: {
            select: {
              id: true, gtfNumber: true, serforNumeroRegistro: true,
              speciesCommonName: true, providerName: true, originCode: true, entryDate: true,
            },
          },
        },
      }),
      prisma.forestCtpDespachoOrigen.findMany({
        where: { tenantId, produccionEntryId: { in: corridaIds } },
        select: {
          despachoEntryId: true,
          produccionEntryId: true,
          quantity: true,
          despacho: { select: { lineNo: true, entryDate: true, gtfNumber: true, destino: true, deletedAt: true, status: true } },
        },
      }),
    ]);

    const cadena = construirCadenaLote(
      consumos.map((c) => ({
        produccionEntryId: c.ctpEntryId,
        woodEntryId: c.woodEntry.id,
        volumeM3: Number(c.volumeM3),
        gtfNumber: c.woodEntry.gtfNumber,
        serforNumeroRegistro: c.woodEntry.serforNumeroRegistro,
        especie: c.woodEntry.speciesCommonName,
        proveedor: c.woodEntry.providerName,
        originCode: c.woodEntry.originCode,
        entryDate: c.woodEntry.entryDate.toISOString(),
      })),
      lote.miembros.map((m) => ({
        produccionEntryId: m.produccionEntryId,
        lineNo: m.produccion.lineNo,
        fecha: m.produccion.entryDate.toISOString(),
        productType: m.produccion.productType,
        especie: m.produccion.speciesCommon,
        lineaProduccion: m.produccion.lineaProduccion,
        quantity: Number(m.produccion.quantity ?? 0),
        enElLote: Number(m.quantity),
        unit: m.produccion.unit,
      })),
      // Un despacho anulado no sacó nada del patio: contarlo mostraría el lote
      // como despachado cuando la madera sigue acá.
      //
      // ⚠️ Hacen falta LAS DOS condiciones: anular una línea pone
      // `status = "anulado"` y NO hace soft-delete. Con sólo `deletedAt` los 35
      // despachos anulados de este tenant aparecían como salidas del lote.
      origenes
        .filter((o) => !o.despacho.deletedAt && o.despacho.status === "registrado")
        .map((o) => ({
          despachoEntryId: o.despachoEntryId,
          produccionEntryId: o.produccionEntryId,
          lineNo: o.despacho.lineNo,
          fecha: o.despacho.entryDate.toISOString(),
          gtfNumber: o.despacho.gtfNumber,
          destino: o.despacho.destino,
          quantity: Number(o.quantity),
        })),
    );

    return { lote, cadena };
  }

  static async trazabilidadLote(tenantId: string, id: string): Promise<TrazabilidadLote | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestProdLote.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        miembros: {
          include: { produccion: { select: { id: true, lineNo: true } } },
        },
      },
    });
    if (!lote) return null;

    const corridaIds = lote.miembros.map((m) => m.produccionEntryId);
    const [consumos, guias] = await Promise.all([
      corridaIds.length
        ? prisma.forestCtpConsumo.groupBy({
            by: ["ctpEntryId"],
            where: { tenantId, ctpEntryId: { in: corridaIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      corridaIds.length
        ? prisma.forestCtpConsumo.findMany({
            where: { tenantId, ctpEntryId: { in: corridaIds } },
            select: { ctpEntryId: true, woodEntry: { select: { gtfNumber: true } } },
          })
        : Promise.resolve([]),
    ]);
    const conOrigen = new Set(consumos.filter((c) => c._count._all > 0).map((c) => c.ctpEntryId));

    const corridas = lote.miembros.map((m) => ({
      produccionEntryId: m.produccionEntryId,
      lineNo: m.produccion.lineNo,
      quantity: Number(m.quantity),
      guias: guias.filter((g) => g.ctpEntryId === m.produccionEntryId).map((g) => g.woodEntry.gtfNumber),
      sinOrigen: !conOrigen.has(m.produccionEntryId),
    }));

    const motivo: TrazabilidadLote["motivo"] =
      corridas.length === 0 ? "sin_miembros" : corridas.some((c) => c.sinOrigen) ? "corrida_sin_origen" : "ok";

    return {
      completa: motivo === "ok",
      totalCantidad: r4(corridas.reduce((a, c) => a + c.quantity, 0)),
      motivo,
      corridas,
    };
  }

  /** Soft-delete. No cascada: los miembros quedan pero el lote deja de contar. */
  static async softDelete(tenantId: string, id: string, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestProdLote.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true, loteCode: true } });
    if (!lote) throw new Error("Lote no encontrado");
    await prisma.forestProdLote.update({ where: { id }, data: { deletedAt: new Date() } });
    auditCtp({ tenantId, action: "ctp_lote_delete", entity: "ForestProdLote", entityId: id, detail: `Eliminó (soft) el lote ${lote.loteCode}`, user });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* best-effort */ }
  }

  /**
   * Verificación PÚBLICA de un lote — target del QR. Sin auth: el id es un cuid
   * no adivinable y sólo se expone la cadena de origen, NUNCA costos.
   */
  static async verificacionPublica(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const lote = await prisma.forestProdLote.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true, loteCode: true, status: true, productType: true,
        speciesCommon: true, speciesScientific: true, cites: true, unit: true, grade: true, createdAt: true,
      },
    });
    if (!lote) return null;
    const trazabilidad = await ForestLoteDB.trazabilidadLote(tenantId, id);
    return { lote: { ...lote, status: lote.status as LoteStatus }, trazabilidad };
  }
}
