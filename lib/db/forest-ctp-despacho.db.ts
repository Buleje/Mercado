/**
 * forest-ctp-despacho.db — atribución N:M despacho → corridas de producción,
 * el ÚLTIMO tramo de la cadena de custodia (ADR-135).
 *
 * Con `ForestCtpConsumo` (ingreso → producción) más esta tabla se puede
 * responder de punta a punta "¿de qué árbol salió esta tabla que despaché?",
 * que es lo que exige EUDR y lo que pregunta un fiscalizador. Antes de esto el
 * despacho se ataba por TEXTO y la cadena se cortaba en el último paso.
 *
 * ── Por qué I4/I5 se AGREGAN y no reemplazan a I3 (ADR-135 D2) ──────────────
 * No es una opinión: se midió construyendo los dos escenarios.
 *
 *   I3 · Σ despachado(producto) ≤ Σ producido(producto)   ← el ACTA, agregado
 *   I4 · Σ origenes(despacho)   ≤ despacho.quantity       ← ÍNDICE (≅ I1)
 *   I5 · Σ origenes(corrida)    ≤ produccion.quantity     ← ÍNDICE (≅ I2)
 *
 *   A) despacho de 100 contra una producción de 6.2, SIN atribuir:
 *      I3 rechaza · I5 CIEGO (Σ=0 ≤ 6.2 — con atribución parcial es vacua).
 *   B) 2 corridas (6.2+10), 2 despachos, ambos citando la MISMA corrida:
 *      I3 CIEGO (16.2−16.2=0, el agregado cuadra) · I5 ATRAPA (16.2 sobre 6.2).
 *
 * Cada una ve lo que la otra deja pasar. B *es* la pregunta de EUDR: el total
 * cuadra mientras una corrida sostiene 2.6× su producción. I5 no es un segundo
 * stock — es el techo de UNA fila; el stock sigue siendo uno solo (el acta).
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { ForestCtpFichaDB } from "./forest-ctp-ficha.db";
import { CtpInvariantError, ForestCtpConsumoDB, CTP_TX_OPTS } from "./forest-ctp-consumo.db";

const CACHE_PREFIX = "forest-ctp";
/** 4 decimales — precisión forestal (volúmenes/cantidades). */
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** 2 decimales — plata. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Un origen sólo cuenta si su línea de despacho sigue viva (espejo de CONSUMO_VIGENTE). */
export const ORIGEN_VIGENTE = {
  despacho: { deletedAt: null, status: "registrado" },
} as const;

export interface OrigenInput {
  produccionEntryId: string;
  quantity: number | string;
}

export interface CogsDespacho {
  /** Costo de lo que salió. null = no se puede saber (falta factura / monedas mezcladas). NUNCA 0. */
  cogs: number | null;
  /** Costo por unidad despachada — el número con el que se compara el precio de venta. */
  costoUnitario: number | null;
  moneda: string | null;
  /** Por qué es null, para que la UI lo explique en vez de mostrar "—". */
  motivo: "ok" | "sin_atribucion" | "falta_costo" | "monedas_mezcladas" | "sin_cantidad";
  /** Lo despachado que NO tiene corrida atribuida: su costo es desconocido por definición. */
  sinAtribuir: number;
  detalle: {
    lineNo: number;
    quantity: number;
    /** S/ por unidad de esa corrida (ya incluye materia prima ponderada + proceso). */
    costoUnitario: number | null;
    costo: number | null;
    congelado: boolean;
  }[];
}

export interface TrazabilidadDespacho {
  /** Sin huecos: cada unidad despachada tiene una corrida y un ingreso detrás. */
  completa: boolean;
  declarado: number;
  atribuido: number;
  sinAtribuir: number;
  /** Por qué NO está completa, para que la UI lo explique en vez de sólo negar. */
  motivo: "ok" | "sin_atribucion" | "atribucion_parcial" | "corrida_sin_origen";
  corridas: {
    produccionEntryId: string;
    lineNo: number;
    quantity: number;
    /** Guías de ingreso que alimentaron esa corrida (ADR-134). */
    guias: string[];
    /** La corrida no tiene su propia materia prima atribuida ⇒ la cadena se corta ahí. */
    sinOrigen: boolean;
  }[];
}

export class ForestCtpDespachoDB {
  /**
   * Reemplaza el set de orígenes de un despacho, validando I4 + I5 + tenant +
   * orientación dentro de UNA transacción.
   *
   * LOCKEA LAS CORRIDAS, no el despacho. El recurso disputado es la producción:
   * dos despachos distintos citando la misma corrida lockean líneas distintas,
   * no se bloquean, y bajo READ COMMITTED los dos leen el mismo saldo ⇒ ambos
   * pasan I5. Es el mismo TOCTOU que ya nos comió en I2, invertido. Ordenadas
   * por id para que dos transacciones tomen las mismas corridas en el mismo
   * orden y no se deadlockeen.
   */
  static async setOrigenes(
    tenantId: string,
    despachoEntryId: string,
    origenes: OrigenInput[],
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!despachoEntryId) throw new Error("despachoEntryId is required");
    if (!user?.trim()) throw new Error("user is required");

    const ids = origenes.map((o) => o.produccionEntryId);
    if (new Set(ids).size !== ids.length) {
      throw new CtpInvariantError(
        "Una misma corrida aparece dos veces: sumá las cantidades en una sola línea.",
        "I4_SOBRE_ATRIBUCION_DESPACHO",
      );
    }
    for (const o of origenes) {
      if (Number(o.quantity) <= 0) {
        throw new CtpInvariantError("Un origen debe ser mayor a 0.", "I4_SOBRE_ATRIBUCION_DESPACHO", {
          produccionEntryId: o.produccionEntryId,
        });
      }
    }
    if (ids.includes(despachoEntryId)) {
      throw new CtpInvariantError("Una línea no puede salir de sí misma.", "TENANT_MISMATCH");
    }

    return prisma.$transaction(async (tx) => {
      // 1. La línea destino existe, es de este tenant y ES un despacho.
      const despacho = await tx.forestCtpEntry.findFirst({
        where: { id: despachoEntryId, tenantId, deletedAt: null },
        select: { id: true, section: true, quantity: true, unit: true, productType: true, speciesCommon: true, lineNo: true },
      });
      if (!despacho) throw new Error("Línea de despacho no encontrada");
      if (despacho.section !== "despacho") {
        throw new CtpInvariantError(
          "Sólo una línea de despacho puede tener orígenes de producción.",
          "TENANT_MISMATCH",
          { section: despacho.section },
        );
      }

      // 2. Lock de las CORRIDAS — el recurso disputado (ver cabecera).
      if (ids.length > 0) {
        await tx.$queryRaw`
          SELECT "id" FROM "ForestCtpEntry"
          WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          ORDER BY "id"
          FOR UPDATE
        `;
      }

      // 3. Las corridas citadas: de este tenant, vivas, y de sección producción.
      //    El FK de Postgres no garantiza ni el tenant ni la ORIENTACIÓN (aceptaría
      //    un despacho citando a otro despacho) — ADR-135 D5.
      const corridas = await tx.forestCtpEntry.findMany({
        where: { id: { in: ids }, tenantId, deletedAt: null, status: "registrado" },
        select: { id: true, lineNo: true, section: true, quantity: true, unit: true, productType: true, speciesCommon: true },
      });
      if (corridas.length !== ids.length) {
        const vistas = new Set(corridas.map((c) => c.id));
        throw new CtpInvariantError(
          "Alguna corrida citada no existe, fue anulada, o pertenece a otra tienda.",
          "TENANT_MISMATCH",
          { faltantes: ids.filter((id) => !vistas.has(id)) },
        );
      }
      const noProduccion = corridas.filter((c) => c.section !== "produccion");
      if (noProduccion.length > 0) {
        throw new CtpInvariantError(
          "Un despacho sale de corridas de producción, no de otros despachos.",
          "TENANT_MISMATCH",
          { lineas: noProduccion.map((c) => c.lineNo) },
        );
      }

      // 4. Mismo producto y misma unidad: atribuir tablones a un despacho de
      //    leña, o m³ contra kg, sería un número que no significa nada.
      const distinto = corridas.filter(
        (c) =>
          (c.productType ?? "").trim().toLowerCase() !== (despacho.productType ?? "").trim().toLowerCase() ||
          (c.speciesCommon ?? "").trim().toLowerCase() !== (despacho.speciesCommon ?? "").trim().toLowerCase() ||
          (c.unit ?? "") !== (despacho.unit ?? ""),
      );
      if (distinto.length > 0) {
        throw new CtpInvariantError(
          `El despacho es de ${despacho.productType ?? "—"} · ${despacho.speciesCommon ?? "—"} (${despacho.unit ?? "—"}); ` +
            `la corrida #${distinto[0].lineNo} es de ${distinto[0].productType ?? "—"} · ${distinto[0].speciesCommon ?? "—"} (${distinto[0].unit ?? "—"}).`,
          "TENANT_MISMATCH",
          { lineas: distinto.map((c) => c.lineNo) },
        );
      }

      // 5. I4 — Σ atribuido ≤ lo que el despacho declara haber sacado.
      const declarado = despacho.quantity ? Number(despacho.quantity) : null;
      const totalAtribuido = origenes.reduce((a, o) => a + Number(o.quantity), 0);
      if (declarado != null && r4(totalAtribuido) > r4(declarado)) {
        throw new CtpInvariantError(
          `Estás atribuyendo ${r4(totalAtribuido)} pero el despacho declara ${r4(declarado)}.`,
          "I4_SOBRE_ATRIBUCION_DESPACHO",
          { atribuido: r4(totalAtribuido), declarado: r4(declarado) },
        );
      }

      // 6. I5 — ninguna corrida despachada por encima de lo que produjo,
      //    contando lo que YA sacan OTROS despachos. Esto es lo que I3 no ve.
      const otros = await tx.forestCtpDespachoOrigen.groupBy({
        by: ["produccionEntryId"],
        where: {
          tenantId,
          produccionEntryId: { in: ids },
          despachoEntryId: { not: despachoEntryId },
          ...ORIGEN_VIGENTE, // un despacho anulado no sigue reservando la corrida
        },
        _sum: { quantity: true },
      });
      const yaSalido = new Map(otros.map((o) => [o.produccionEntryId, Number(o._sum.quantity ?? 0)]));

      for (const o of origenes) {
        const corrida = corridas.find((c) => c.id === o.produccionEntryId)!;
        const producido = corrida.quantity ? Number(corrida.quantity) : 0;
        const disponible = producido - (yaSalido.get(o.produccionEntryId) ?? 0);
        if (r4(Number(o.quantity)) > r4(disponible)) {
          throw new CtpInvariantError(
            `La corrida #${corrida.lineNo} produjo ${r4(producido)} y sólo le quedan ${r4(disponible)} sin despachar; estás pidiendo ${r4(Number(o.quantity))}.`,
            "I5_SOBRE_SALIDA_PRODUCCION",
            { lineNo: corrida.lineNo, producido: r4(producido), disponible: r4(disponible), pedido: r4(Number(o.quantity)) },
          );
        }
      }

      // 7. Estado anterior — para que el audit diga de qué a qué (no "cambió").
      const antes = await tx.forestCtpDespachoOrigen.findMany({
        where: { despachoEntryId, tenantId },
        include: { produccion: { select: { lineNo: true } } },
      });

      // 8. Reemplazo atómico. El acta (gtfNumber/destino) no se toca nunca.
      await tx.forestCtpDespachoOrigen.deleteMany({ where: { despachoEntryId, tenantId } });
      if (origenes.length > 0) {
        await tx.forestCtpDespachoOrigen.createMany({
          data: origenes.map((o) => ({
            tenantId,
            despachoEntryId,
            produccionEntryId: o.produccionEntryId,
            quantity: new Prisma.Decimal(o.quantity),
            createdBy: user,
          })),
        });
      }

      const result = await tx.forestCtpDespachoOrigen.findMany({
        where: { despachoEntryId, tenantId },
        include: { produccion: { select: { lineNo: true, productType: true, speciesCommon: true } } },
      });

      const fmt = (rows: { quantity: Prisma.Decimal; produccion: { lineNo: number } }[]) =>
        rows.length === 0 ? "(sin atribución)" : rows.map((r) => `corrida #${r.produccion.lineNo}: ${Number(r.quantity)}`).join(", ");
      auditCtp({
        tenantId,
        action: "ctp_origenes_set",
        entity: "ForestCtpEntry",
        entityId: despachoEntryId,
        detail: `Origen del despacho #${despacho.lineNo}: ${fmt(antes)} → ${fmt(result)}`,
        user,
      });

      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      return result;
    }, CTP_TX_OPTS);
  }

  /** Orígenes de un despacho, con la corrida de cada uno. */
  static async listByDespacho(tenantId: string, despachoEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestCtpDespachoOrigen.findMany({
      where: { tenantId, despachoEntryId },
      orderBy: { createdAt: "asc" },
      include: {
        produccion: {
          select: {
            id: true, lineNo: true, entryDate: true, productType: true,
            speciesCommon: true, quantity: true, unit: true,
          },
        },
      },
    });
  }

  /**
   * COGS — cuánto costó la madera que salió en este despacho (ADR-135 D7).
   *
   *   COGS = Σ (origen.quantity × costoUnitario(corrida))
   *
   * El puente NO tiene costo propio a propósito: un 2º snap acá serían dos
   * relojes de congelado desincronizándose, y el COGS dependería de cuál se
   * leyó. Se deriva de la corrida, que ya congela al cierre (ADR-134 D6).
   *
   * Doble ponderación encadenada: cada corrida ya promedió sus guías por
   * volumen, y acá se promedian las corridas por lo despachado de cada una.
   *
   * Misma regla de oro: **falta un costo ⇒ null, NUNCA 0** (un 0 fingiría
   * margen 100%, que es peor que no saber). Y lo despachado sin corrida
   * atribuida hace el COGS desconocido por definición: no se puede costear lo
   * que no se sabe de dónde salió.
   */
  static async cogsDeDespacho(tenantId: string, despachoEntryId: string): Promise<CogsDespacho> {
    if (!tenantId) throw new Error("tenantId is required");

    const [despacho, origenes] = await Promise.all([
      prisma.forestCtpEntry.findFirst({
        where: { id: despachoEntryId, tenantId, deletedAt: null },
        select: { quantity: true, moneda: true },
      }),
      ForestCtpDespachoDB.listByDespacho(tenantId, despachoEntryId),
    ]);
    if (!despacho) throw new Error("Línea de despacho no encontrada");

    const declarado = despacho.quantity ? Number(despacho.quantity) : 0;
    const atribuido = r4(origenes.reduce((a, o) => a + Number(o.quantity), 0));
    const sinAtribuir = r4(Math.max(0, declarado - atribuido));
    const base = { sinAtribuir, moneda: despacho.moneda ?? "PEN" };

    if (origenes.length === 0) {
      return { ...base, cogs: null, costoUnitario: null, motivo: "sin_atribucion", detalle: [] };
    }

    // El costo de cada corrida ya viene ponderado por sus guías (ADR-134 D6).
    const costos = await Promise.all(
      origenes.map((o) => ForestCtpConsumoDB.costoDeLinea(tenantId, o.produccionEntryId)),
    );

    const detalle = origenes.map((o, i) => {
      const c = costos[i];
      const unit = c.costoUnitario;
      return {
        lineNo: o.produccion.lineNo,
        quantity: Number(o.quantity),
        costoUnitario: unit,
        costo: unit != null ? r2(unit * Number(o.quantity)) : null,
        congelado: c.congelado,
      };
    });

    const monedas = new Set(costos.map((c) => c.moneda ?? "PEN"));
    if (monedas.size > 1) {
      return { ...base, cogs: null, costoUnitario: null, motivo: "monedas_mezcladas", detalle };
    }
    // Una sola corrida sin costo envenena el total: sumar las demás daría un
    // COGS que parece completo y no lo es.
    if (detalle.some((d) => d.costo == null)) {
      return { ...base, cogs: null, costoUnitario: null, motivo: "falta_costo", detalle };
    }
    // Y si hay volumen sin atribuir, tampoco se puede afirmar el costo del
    // despacho entero — sólo el de la parte que sí tiene origen.
    if (sinAtribuir > 0) {
      return { ...base, cogs: null, costoUnitario: null, motivo: "sin_atribucion", detalle };
    }

    const cogs = r2(detalle.reduce((a, d) => a + (d.costo ?? 0), 0));
    return {
      ...base,
      moneda: [...monedas][0],
      cogs,
      costoUnitario: declarado > 0 ? r2(cogs / declarado) : null,
      motivo: declarado > 0 ? "ok" : "sin_cantidad",
      detalle,
    };
  }

  /**
   * ¿La cadena de custodia de este despacho está completa (ADR-135 D3)?
   *
   * El LIBRO admite huecos (I4 es `≤`): forzar atribución total haría que el
   * operador invente un origen para poder guardar. El CERTIFICADO no: acá se
   * mueve el gate. Esto NO bloquea el guardado — bloquea afirmar cumplimiento.
   *
   * Completa = el despacho atribuye el 100% a corridas Y cada una de esas
   * corridas tiene su propia materia prima atribuida (si no, la cadena se corta
   * un eslabón más atrás y el certificado mentiría igual).
   */
  static async trazabilidadCompleta(tenantId: string, despachoEntryId: string): Promise<TrazabilidadDespacho> {
    if (!tenantId) throw new Error("tenantId is required");

    const despacho = await prisma.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId, deletedAt: null },
      select: { quantity: true },
    });
    if (!despacho) throw new Error("Línea de despacho no encontrada");

    const origenes = await ForestCtpDespachoDB.listByDespacho(tenantId, despachoEntryId);
    const declarado = despacho.quantity ? Number(despacho.quantity) : 0;
    const atribuido = r4(origenes.reduce((a, o) => a + Number(o.quantity), 0));
    const sinAtribuir = r4(Math.max(0, declarado - atribuido));

    // Un eslabón más atrás: ¿cada corrida sabe de qué ingresos salió?
    const consumos = origenes.length
      ? await prisma.forestCtpConsumo.groupBy({
          by: ["ctpEntryId"],
          where: { tenantId, ctpEntryId: { in: origenes.map((o) => o.produccionEntryId) } },
          _count: { _all: true },
        })
      : [];
    const conOrigen = new Set(consumos.filter((c) => c._count._all > 0).map((c) => c.ctpEntryId));

    const guiasPorCorrida = origenes.length
      ? await prisma.forestCtpConsumo.findMany({
          where: { tenantId, ctpEntryId: { in: origenes.map((o) => o.produccionEntryId) } },
          select: { ctpEntryId: true, woodEntry: { select: { gtfNumber: true } } },
        })
      : [];

    const corridas = origenes.map((o) => ({
      produccionEntryId: o.produccionEntryId,
      lineNo: o.produccion.lineNo,
      quantity: Number(o.quantity),
      guias: guiasPorCorrida.filter((g) => g.ctpEntryId === o.produccionEntryId).map((g) => g.woodEntry.gtfNumber),
      sinOrigen: !conOrigen.has(o.produccionEntryId),
    }));

    const motivo: TrazabilidadDespacho["motivo"] =
      origenes.length === 0
        ? "sin_atribucion"
        : sinAtribuir > 0
          ? "atribucion_parcial"
          : corridas.some((c) => c.sinOrigen)
            ? "corrida_sin_origen"
            : "ok";

    return { completa: motivo === "ok", declarado, atribuido, sinAtribuir, motivo, corridas };
  }

  /**
   * Agregado del período para el panel Cumplimiento: cuántos despachos NO
   * podrían emitir su certificado (ADR-135 D3).
   *
   * Mismos criterios que `trazabilidadCompleta()` — sin atribución, atribución
   * parcial o corrida citada sin materia prima propia. Si el panel y la ficha
   * usaran predicados distintos, el módulo se contradeciría en la cifra que ve
   * un fiscalizador (la misma lección que ya dejó el fuera-de-plazo).
   */
  static async trazabilidadDelPeriodo(
    tenantId: string,
    period?: { fromDate?: Date; toDate?: Date },
  ): Promise<{ total: number; incompletos: number; lineas: number[] }> {
    if (!tenantId) throw new Error("tenantId is required");

    const despachos = await prisma.forestCtpEntry.findMany({
      where: {
        tenantId,
        section: "despacho",
        status: "registrado",
        deletedAt: null,
        ...(period?.fromDate || period?.toDate
          ? {
              entryDate: {
                ...(period.fromDate && { gte: period.fromDate }),
                ...(period.toDate && { lte: period.toDate }),
              },
            }
          : {}),
      },
      select: { id: true, lineNo: true, quantity: true },
    });
    if (despachos.length === 0) return { total: 0, incompletos: 0, lineas: [] };

    const ids = despachos.map((d) => d.id);
    const [sumas, vinculos] = await Promise.all([
      prisma.forestCtpDespachoOrigen.groupBy({
        by: ["despachoEntryId"],
        where: { tenantId, despachoEntryId: { in: ids } },
        _sum: { quantity: true },
      }),
      prisma.forestCtpDespachoOrigen.findMany({
        where: { tenantId, despachoEntryId: { in: ids } },
        select: { despachoEntryId: true, produccionEntryId: true },
      }),
    ]);

    // Un eslabón más atrás (igual que trazabilidadCompleta): corridas sin consumo propio.
    const corridaIds = [...new Set(vinculos.map((v) => v.produccionEntryId))];
    const consumos = corridaIds.length
      ? await prisma.forestCtpConsumo.groupBy({
          by: ["ctpEntryId"],
          where: { tenantId, ctpEntryId: { in: corridaIds } },
          _count: { _all: true },
        })
      : [];
    const corridasConOrigen = new Set(consumos.filter((c) => c._count._all > 0).map((c) => c.ctpEntryId));

    const atribuidoPor = new Map(sumas.map((s) => [s.despachoEntryId, r4(Number(s._sum.quantity ?? 0))]));
    const corridasPor = new Map<string, string[]>();
    for (const v of vinculos) {
      const arr = corridasPor.get(v.despachoEntryId) ?? [];
      arr.push(v.produccionEntryId);
      corridasPor.set(v.despachoEntryId, arr);
    }

    const lineas: number[] = [];
    for (const d of despachos) {
      const corridas = corridasPor.get(d.id) ?? [];
      const declarado = d.quantity ? Number(d.quantity) : 0;
      const sinAtribuir = r4(Math.max(0, declarado - (atribuidoPor.get(d.id) ?? 0)));
      const incompleto =
        corridas.length === 0 || sinAtribuir > 0 || corridas.some((c) => !corridasConOrigen.has(c));
      if (incompleto) lineas.push(d.lineNo);
    }
    lineas.sort((a, b) => a - b);
    return { total: despachos.length, incompletos: lineas.length, lineas };
  }

  /**
   * Verificación PÚBLICA de un despacho — target del QR del certificado
   * (ADR-135 D3). Sin auth: el id es un cuid no adivinable y solo se expone
   * la cadena de origen, NUNCA costos ni precios (mismo criterio que
   * /verificar/[code] de trozas). Anulado ⇒ se dice, no se esconde.
   */
  static async verificacionPublica(tenantId: string, despachoEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");

    const despacho = await prisma.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId, section: "despacho", deletedAt: null },
      select: {
        id: true, lineNo: true, entryDate: true, status: true,
        productType: true, speciesCommon: true, speciesScientific: true, cites: true,
        quantity: true, unit: true, pieces: true, gtfNumber: true, destino: true,
      },
    });
    if (!despacho) return null;

    const trazabilidad = await ForestCtpDespachoDB.trazabilidadCompleta(tenantId, despachoEntryId);
    return { despacho, trazabilidad };
  }

  /**
   * Emite la GTF de SALIDA formal de un despacho: le asigna serie + correlativo
   * a partir de la **serie autorizada por la ARFFS** (ficha del CTP), en lugar
   * del texto libre que se tipeaba en `gtfNumber`. El CTP está habilitado a
   * emitir su propia GTF de salida (FAQ GTF SERFOR); esto le da número trazable.
   *
   * El correlativo se saca DENTRO de la tx con LOCK sobre los despachos del
   * tenant (el recurso disputado) para que dos emisiones concurrentes no repitan
   * número — mismo patrón que `lineNo` (forest-ctp) y `loteCode` (forest-lote).
   * Se deriva del MÁXIMO correlativo existente de esa serie (parseado del propio
   * `gtfNumber`), así no hace falta una columna nueva ni una migración.
   *
   * Idempotente: si el despacho ya tiene una GTF de esta serie, la devuelve sin
   * re-numerar (`yaEmitida:true`). NO exige cadena completa: la GTF ampara el
   * transporte; el gate de trazabilidad total vive en el certificado (ADR-135 D3).
   */
  static async emitirGtf(
    tenantId: string,
    despachoEntryId: string,
    user: string,
  ): Promise<
    | { ok: true; gtf: string; serie: string; correlativo: number; yaEmitida: boolean }
    | { ok: false; reason: "serie_no_configurada" | "no_despacho" | "anulado" }
  > {
    if (!tenantId) throw new Error("tenantId is required");
    if (!despachoEntryId) throw new Error("despachoEntryId is required");
    if (!user?.trim()) throw new Error("user is required");

    const ficha = await ForestCtpFichaDB.get(tenantId);
    const serie = ficha.gtfSerie.trim();
    if (!serie) return { ok: false, reason: "serie_no_configurada" };
    // Escapar la serie: va a un RegExp y podría traer metacaracteres.
    const escaped = serie.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}-(\\d{6})$`);

    return prisma.$transaction(async (tx) => {
      const desp = await tx.forestCtpEntry.findFirst({
        where: { id: despachoEntryId, tenantId, deletedAt: null },
        select: { id: true, section: true, status: true, lineNo: true, gtfNumber: true, productType: true, speciesCommon: true },
      });
      if (!desp || desp.section !== "despacho") return { ok: false as const, reason: "no_despacho" as const };
      if (desp.status !== "registrado") return { ok: false as const, reason: "anulado" as const };

      // Ya tiene una GTF formal de esta serie ⇒ devolverla, no re-numerar.
      const already = desp.gtfNumber?.match(re);
      if (already) {
        return { ok: true as const, gtf: desp.gtfNumber!, serie, correlativo: parseInt(already[1], 10), yaEmitida: true };
      }

      // Lock de los despachos del tenant = serializa la asignación del correlativo.
      await tx.$queryRaw`
        SELECT "id" FROM "ForestCtpEntry"
        WHERE "tenantId" = ${tenantId} AND "section" = 'despacho' AND "deletedAt" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `;
      const rows = await tx.forestCtpEntry.findMany({
        where: { tenantId, section: "despacho", deletedAt: null, gtfNumber: { startsWith: `${serie}-` } },
        select: { gtfNumber: true },
      });
      let maxN = 0;
      for (const r of rows) {
        const m = r.gtfNumber?.match(re);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxN) maxN = n;
        }
      }
      const correlativo = maxN + 1;
      const gtf = `${serie}-${String(correlativo).padStart(6, "0")}`;

      await tx.forestCtpEntry.updateMany({
        where: { id: despachoEntryId, tenantId },
        data: { gtfNumber: gtf },
      });

      auditCtp({
        tenantId,
        action: "ctp_gtf_emitir",
        entity: "ForestCtpEntry",
        entityId: despachoEntryId,
        detail: `Emitió la GTF de salida ${gtf} para el despacho #${desp.lineNo} (${desp.speciesCommon ?? "—"} · ${desp.productType ?? "—"})`,
        user,
      });
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      return { ok: true as const, gtf, serie, correlativo, yaEmitida: false };
    }, CTP_TX_OPTS);
  }
}
