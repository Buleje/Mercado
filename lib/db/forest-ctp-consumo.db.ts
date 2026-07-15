/**
 * forest-ctp-consumo.db — atribución N:M de materia prima a las líneas del
 * Libro CTP, y el costeo que se deriva de ella (ADR-134).
 *
 * POR QUÉ ESTE ARCHIVO EXISTE, Y POR QUÉ LAS VALIDACIONES VIVEN ACÁ:
 * el ensayo de la migración probó empíricamente que Postgres acepta un consumo
 * cross-tenant y acepta consumir 999.999 m³ de un ingreso de 8.45. El aislamiento
 * de Buleje es app-level (no RLS) y las invariantes I1/I2 son agregadas — un
 * CHECK de Postgres no puede expresarlas. Si no se aplican acá, no se aplican en
 * ningún lado. Ver ADR-134 D3/D7.
 *
 *   I1 · Σ consumos(línea)   ≤ ForestCtpEntry.volumeInputM3   (coherencia)
 *   I2 · Σ consumos(ingreso) ≤ WoodEntry.volumeM3             (CRÍTICO: un
 *        ingreso consumido dos veces es el patrón de blanqueo que fiscaliza
 *        SERFOR — legitimar madera sin origen contra una guía real)
 *
 * Ambas son `≤`, no `==`: exigir atribución total obligaría al operador a
 * inventar un origen para poder guardar, o sea la regla fabricaría el fraude
 * que intenta prevenir. El faltante se reporta como `sinAtribuirM3`, explícito.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp, m3 } from "@/lib/forestal/ctp-audit";

const CACHE_PREFIX = "forest-ctp";

/** Redondeo a 4 decimales — precisión forestal (m³). */
const r4 = (n: number) => Math.round(n * 10000) / 10000;
/** Redondeo a 2 decimales — plata. */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ConsumoInput {
  woodEntryId: string;
  volumeM3: number | string;
}

/** Error de invariante: el caller lo mapea a 422, no a 500. */
export class CtpInvariantError extends Error {
  constructor(
    message: string,
    readonly code:
      | "I1_SOBRE_ATRIBUCION"
      | "I2_SOBRE_CONSUMO"
      /** Despachar producto que no se produjo — simétrico de I2 en la salida. */
      | "I3_SOBRE_DESPACHO"
      | "TENANT_MISMATCH"
      | "CONGELADO",
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CtpInvariantError";
  }
}

export interface CostoDeLinea {
  /** null = no se puede saber (falta factura o hay monedas mezcladas). NUNCA 0. */
  costoMateriaPrima: number | null;
  costoProceso: number | null;
  costoTotal: number | null;
  /** Costo por unidad producida — el número que el dueño realmente quiere. */
  costoUnitario: number | null;
  moneda: string | null;
  /** Por qué el costo es null, para que la UI lo explique en vez de mostrar "—". */
  motivo: "ok" | "sin_consumos" | "falta_factura" | "monedas_mezcladas" | "sin_produccion";
  congelado: boolean;
  atribuidoM3: number;
  sinAtribuirM3: number;
}

export class ForestCtpConsumoDB {
  /**
   * Reemplaza el set de consumos de una línea, validando I1 + I2 + tenant
   * dentro de UNA transacción.
   *
   * LOCKEA LOS INGRESOS, NO SÓLO LA LÍNEA. El recurso en disputa es el ingreso:
   * dos líneas DISTINTAS consumiendo la misma guía lockean líneas distintas, no
   * se bloquean entre sí, y bajo READ COMMITTED ambas leen el mismo "disponible"
   * antes de que la otra commitee ⇒ las dos pasan I2 y se consume el doble.
   *
   * No es teórico: reproducido 2026-07-15 con dos `setConsumos` en paralelo
   * sobre un ingreso de 10 m³ → 20 m³ consumidos, I2 burlada. El test de
   * concurrencia que lo detecta vive en `__tests__/forestal-ctp-consumo.test.ts`.
   *
   * Los ingresos se lockean ORDENADOS POR id: dos transacciones que consumen el
   * mismo par de guías las toman en el mismo orden ⇒ sin deadlock.
   */
  static async setConsumos(
    tenantId: string,
    ctpEntryId: string,
    consumos: ConsumoInput[],
    createdBy: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!ctpEntryId) throw new Error("ctpEntryId is required");
    if (!createdBy?.trim()) throw new Error("createdBy is required");

    // Un mismo ingreso 2 veces en el payload = el UNIQUE lo rechazaría con un
    // error críptico de Postgres; mejor decirlo claro (y sumar es del caller).
    const ids = consumos.map((c) => c.woodEntryId);
    if (new Set(ids).size !== ids.length) {
      throw new CtpInvariantError(
        "Un mismo ingreso aparece dos veces: sumá los m³ en una sola línea.",
        "I1_SOBRE_ATRIBUCION",
      );
    }
    for (const c of consumos) {
      if (Number(c.volumeM3) <= 0) {
        throw new CtpInvariantError(
          "Un consumo debe ser mayor a 0 m³.",
          "I1_SOBRE_ATRIBUCION",
          { woodEntryId: c.woodEntryId },
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      // 1. Lock de la línea. Placeholders $1/$2 — nunca interpolación (regla 11).
      const locked = await tx.$queryRaw<{ id: string; volumeInputM3: Prisma.Decimal | null }[]>`
        SELECT "id", "volumeInputM3" FROM "ForestCtpEntry"
        WHERE "id" = ${ctpEntryId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) throw new Error("Línea CTP no encontrada");

      // 2. Congelado ⇒ inmutable (el costo del período ya se reportó).
      const yaCongelado = await tx.forestCtpConsumo.count({
        where: { ctpEntryId, tenantId, congeladoAt: { not: null } },
      });
      if (yaCongelado > 0) {
        throw new CtpInvariantError(
          "Esta línea ya tiene el costo congelado: no se puede cambiar su atribución.",
          "CONGELADO",
        );
      }

      // 3. Lock de los INGRESOS — el recurso realmente disputado (ver cabecera).
      //    Ordenado por id para que dos transacciones concurrentes tomen las
      //    mismas guías en el mismo orden y no se deadlockeen entre sí.
      //    A partir de acá, cualquier otra tx que quiera estos ingresos espera,
      //    así que el cálculo de disponible de abajo ya no puede quedar viejo.
      //    (ids vacío = borrar toda la atribución: no hay nada que lockear, y
      //    `IN ()` sería SQL inválido.)
      if (ids.length > 0) {
        await tx.$queryRaw`
          SELECT "id" FROM "WoodEntry"
          WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          ORDER BY "id"
          FOR UPDATE
        `;
      }

      // 4. Los ingresos citados deben ser de ESTE tenant y estar vivos.
      //    El FK de Postgres no lo garantiza (D3) — probado en el ensayo.
      const ingresos = await tx.woodEntry.findMany({
        where: { id: { in: ids }, tenantId, deletedAt: null },
        select: { id: true, volumeM3: true, gtfNumber: true },
      });
      if (ingresos.length !== ids.length) {
        const vistos = new Set(ingresos.map((i) => i.id));
        throw new CtpInvariantError(
          "Algún ingreso citado no existe, fue borrado, o pertenece a otra tienda.",
          "TENANT_MISMATCH",
          { faltantes: ids.filter((id) => !vistos.has(id)) },
        );
      }

      // 5. I1 — Σ atribuido ≤ declarado en el acta.
      const declarado = locked[0].volumeInputM3 ? Number(locked[0].volumeInputM3) : null;
      const totalAtribuido = consumos.reduce((a, c) => a + Number(c.volumeM3), 0);
      if (declarado != null && r4(totalAtribuido) > r4(declarado)) {
        throw new CtpInvariantError(
          `Estás atribuyendo ${r4(totalAtribuido)} m³ pero la línea declara ${r4(declarado)} m³ consumidos.`,
          "I1_SOBRE_ATRIBUCION",
          { atribuido: r4(totalAtribuido), declarado: r4(declarado) },
        );
      }

      // 6. I2 — ningún ingreso consumido por encima de su volumen, contando lo
      //    que YA consumen OTRAS líneas (excluyendo esta, que se reemplaza).
      const otros = await tx.forestCtpConsumo.groupBy({
        by: ["woodEntryId"],
        where: { tenantId, woodEntryId: { in: ids }, ctpEntryId: { not: ctpEntryId } },
        _sum: { volumeM3: true },
      });
      const yaConsumido = new Map(otros.map((o) => [o.woodEntryId, Number(o._sum.volumeM3 ?? 0)]));

      for (const c of consumos) {
        const ingreso = ingresos.find((i) => i.id === c.woodEntryId)!;
        const disponible = Number(ingreso.volumeM3) - (yaConsumido.get(c.woodEntryId) ?? 0);
        if (r4(Number(c.volumeM3)) > r4(disponible)) {
          throw new CtpInvariantError(
            `La guía ${ingreso.gtfNumber} solo tiene ${r4(disponible)} m³ sin consumir; estás pidiendo ${r4(Number(c.volumeM3))} m³.`,
            "I2_SOBRE_CONSUMO",
            {
              gtfNumber: ingreso.gtfNumber,
              disponible: r4(disponible),
              pedido: r4(Number(c.volumeM3)),
              volumenIngreso: r4(Number(ingreso.volumeM3)),
            },
          );
        }
      }

      // 7. Estado ANTERIOR — para que la auditoría diga de qué a qué cambió la
      //    atribución. "Cambió el origen" no le sirve a nadie en una
      //    fiscalización; "de 001-0000120: 8.45 a 001-0000131: 8.45" sí.
      const antes = await tx.forestCtpConsumo.findMany({
        where: { ctpEntryId, tenantId },
        include: { woodEntry: { select: { gtfNumber: true } } },
      });

      // 8. Reemplazo atómico. Sin soft-delete: el consumo es detalle editable,
      //    no acta — el acta (volumeInputM3/gtfIngreso) no se toca nunca.
      await tx.forestCtpConsumo.deleteMany({ where: { ctpEntryId, tenantId } });
      if (consumos.length > 0) {
        await tx.forestCtpConsumo.createMany({
          data: consumos.map((c) => ({
            tenantId,
            ctpEntryId,
            woodEntryId: c.woodEntryId,
            volumeM3: new Prisma.Decimal(c.volumeM3),
            createdBy,
          })),
        });
      }

      const result = await tx.forestCtpConsumo.findMany({
        where: { ctpEntryId, tenantId },
        include: { woodEntry: { select: { gtfNumber: true, speciesCommonName: true } } },
      });

      const fmt = (rows: { volumeM3: Prisma.Decimal; woodEntry: { gtfNumber: string } }[]) =>
        rows.length === 0 ? "(sin atribución)" : rows.map((r) => `${r.woodEntry.gtfNumber}: ${m3(Number(r.volumeM3))}`).join(", ");
      auditCtp({
        tenantId,
        action: "ctp_consumos_set",
        entity: "ForestCtpEntry",
        entityId: ctpEntryId,
        detail: `Origen de la materia prima: ${fmt(antes)} → ${fmt(result)}`,
        user: createdBy,
      });

      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      return result;
    });
  }

  /** Consumos de una línea, con la guía y especie de cada ingreso. */
  static async listByEntry(tenantId: string, ctpEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestCtpConsumo.findMany({
      where: { tenantId, ctpEntryId },
      orderBy: { createdAt: "asc" },
      include: {
        woodEntry: {
          select: {
            id: true, gtfNumber: true, speciesCommonName: true,
            volumeM3: true, costoTotal: true, moneda: true, entryDate: true,
          },
        },
      },
    });
  }

  /**
   * Costo de una línea de producción (ADR-134 D6).
   *
   * costoUnitario_i = COALESCE(snap_i, wood.costoTotal / wood.volumeM3)
   * costoMateriaPrima = Σ (costoUnitario_i × consumo.volumeM3)
   *
   * Devuelve `null` (con `motivo`) si falta alguna factura o si se mezclan
   * monedas: no se suman peras con manzanas, y un 0 fingiría margen 100%.
   */
  static async costoDeLinea(tenantId: string, ctpEntryId: string): Promise<CostoDeLinea> {
    if (!tenantId) throw new Error("tenantId is required");

    const [linea, consumos] = await Promise.all([
      prisma.forestCtpEntry.findFirst({
        where: { id: ctpEntryId, tenantId, deletedAt: null },
        select: { volumeInputM3: true, quantity: true, unit: true, costoProceso: true, moneda: true },
      }),
      ForestCtpConsumoDB.listByEntry(tenantId, ctpEntryId),
    ]);
    if (!linea) throw new Error("Línea CTP no encontrada");

    const atribuidoM3 = r4(consumos.reduce((a, c) => a + Number(c.volumeM3), 0));
    const declarado = linea.volumeInputM3 ? Number(linea.volumeInputM3) : 0;
    const sinAtribuirM3 = r4(Math.max(0, declarado - atribuidoM3));
    const congelado = consumos.some((c) => c.congeladoAt != null);
    const costoProceso = linea.costoProceso != null ? Number(linea.costoProceso) : null;

    const base = {
      costoProceso,
      congelado,
      atribuidoM3,
      sinAtribuirM3,
      moneda: linea.moneda ?? "PEN",
    };

    if (consumos.length === 0) {
      return { ...base, costoMateriaPrima: null, costoTotal: null, costoUnitario: null, motivo: "sin_consumos" };
    }

    // Monedas: las del ingreso mandan; mezclarlas invalida la suma.
    const monedas = new Set(consumos.map((c) => c.woodEntry.moneda ?? "PEN"));
    if (monedas.size > 1) {
      return { ...base, costoMateriaPrima: null, costoTotal: null, costoUnitario: null, motivo: "monedas_mezcladas" };
    }

    let costoMateriaPrima = 0;
    for (const c of consumos) {
      // Congelado gana: es el costo con el que se reportó el período.
      const unitario =
        c.costoUnitarioSnap != null
          ? Number(c.costoUnitarioSnap)
          : c.woodEntry.costoTotal != null && Number(c.woodEntry.volumeM3) > 0
            ? Number(c.woodEntry.costoTotal) / Number(c.woodEntry.volumeM3)
            : null;
      // Sin factura ⇒ no se sabe. NULL honesto, no 0 (D6).
      if (unitario == null) {
        return { ...base, costoMateriaPrima: null, costoTotal: null, costoUnitario: null, motivo: "falta_factura" };
      }
      costoMateriaPrima += unitario * Number(c.volumeM3);
    }

    const costoTotal = r2(costoMateriaPrima + (costoProceso ?? 0));
    const producido = linea.quantity != null ? Number(linea.quantity) : 0;

    return {
      ...base,
      moneda: [...monedas][0],
      costoMateriaPrima: r2(costoMateriaPrima),
      costoTotal,
      costoUnitario: producido > 0 ? r2(costoTotal / producido) : null,
      motivo: producido > 0 ? "ok" : "sin_produccion",
    };
  }

  /**
   * Cierre de período: congela el costo unitario de cada consumo (D6/D8).
   * Rechaza si algún costo es desconocido — no se congela lo que no se sabe.
   *
   * `user` es obligatorio: congelar es irreversible (deja la línea inmutable) y
   * un evento irreversible sin autor no es auditable.
   */
  static async congelarCosto(tenantId: string, ctpEntryId: string, user: string) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!user?.trim()) throw new Error("user is required");

    return prisma.$transaction(async (tx) => {
      const consumos = await tx.forestCtpConsumo.findMany({
        where: { tenantId, ctpEntryId },
        include: { woodEntry: { select: { costoTotal: true, volumeM3: true, gtfNumber: true } } },
      });
      if (consumos.length === 0) throw new Error("La línea no tiene consumos que congelar");

      const sinFactura = consumos.filter(
        (c) => c.costoUnitarioSnap == null && c.woodEntry.costoTotal == null,
      );
      if (sinFactura.length > 0) {
        throw new CtpInvariantError(
          `No se puede congelar: falta la factura de ${sinFactura.map((c) => c.woodEntry.gtfNumber).join(", ")}.`,
          "CONGELADO",
          { sinFactura: sinFactura.map((c) => c.woodEntry.gtfNumber) },
        );
      }

      const now = new Date();
      const congelados: string[] = [];
      for (const c of consumos) {
        if (c.costoUnitarioSnap != null) continue; // ya congelado: no se repisa
        const unitario = r2(Number(c.woodEntry.costoTotal) / Number(c.woodEntry.volumeM3));
        await tx.forestCtpConsumo.update({
          where: { id: c.id },
          data: { costoUnitarioSnap: new Prisma.Decimal(unitario), congeladoAt: now },
        });
        congelados.push(`${c.woodEntry.gtfNumber} @ S/${unitario}/m³`);
      }

      // Irreversible: a partir de acá la línea no se puede reatribuir.
      auditCtp({
        tenantId,
        action: "ctp_costo_congelar",
        entity: "ForestCtpEntry",
        entityId: ctpEntryId,
        detail: congelados.length
          ? `Costo congelado al cierre — ${congelados.join(", ")}. La línea queda inmutable.`
          : "Congelado sin cambios: todos los consumos ya estaban congelados.",
        user,
      });

      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      return tx.forestCtpConsumo.findMany({ where: { tenantId, ctpEntryId } });
    });
  }
}
