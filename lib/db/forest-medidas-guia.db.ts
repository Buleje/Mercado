import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import {
  planearMedidasDesdeGuia,
  relacionDeGuias,
  relacionPermiteAplicar,
  type EstadoGuiaMedidas,
  type PlanMedidasGuia,
  type TrozaDelLibro,
} from "@/lib/forestal/medidas-desde-guia";
import type { IngresoParaTitulo } from "@/lib/forestal/titulo-de-guia";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";

/**
 * MedidasGuiaDB — «Traer D1/D2 de la guía» (Brandon 05-10, ADR-469).
 *
 * La regla vive en `planearMedidasDesdeGuia` (pura, con test sobre la ficha
 * real). Acá va lo que no puede ser puro:
 *   · sólo el libro VIVO de ESTE negocio (`tenantId` en cada WHERE; lo anulado o
 *     rechazado no entra: si la guía se anuló y se registró de nuevo, sus códigos
 *     se duplicarían y todo saldría ambiguo);
 *   · el plan se rehace DENTRO de la transacción con las trozas bloqueadas, y el
 *     UPDATE repite «d1Cm IS NULL AND d2Cm IS NULL» en el WHERE: si otra pantalla
 *     anotó una punta en el medio, queda la suya;
 *   · la ficha que se guarda en el ingreso viene del SERVIDOR (`consultarGtfEnSerfor`),
 *     nunca del cliente (ADR-312), y sólo donde no había una;
 *   · auditoría y caché del libro (la lista de ingresos y el patio se releen).
 */

/** El mismo prefijo que `WoodEntriesDB`. */
const CACHE_WOOD_ENTRIES = "wood-entries";
/** Fuera del libro vivo. En el SQL crudo va como literal (es un enum de Postgres). */
const NO_VIVOS: ("anulado" | "rechazado")[] = ["anulado", "rechazado"];

export interface GuiaParaMedidas {
  gtfNumber: string;
  /** Ingresos vivos de la guía (uno por especie, ADR-312). */
  ingresos: number;
  trozas: TrozaDelLibro[];
  /** La ficha ya guardada en algún ingreso de la guía: se usa sin salir a la red. */
  ficha: { numeroRegistro: string | null; gtf: GtfSerfor } | null;
  /** Los ingresos con su título declarado: para decir si la ficha trae uno que falta. */
  ingresosTitulo: IngresoParaTitulo[];
}

export interface PedidoMedidasGuia {
  gtfNumber: string;
  numeroRegistro: string | null;
  ficha: GtfSerfor;
  /** true = la ficha vino recién de SERFOR y se guarda donde no había. */
  guardarFicha: boolean;
}

export interface ResultadoMedidasGuia {
  plan: PlanMedidasGuia;
  escritas: { id: string; codificacion: string }[];
  omitidas: { id: string; codificacion: string; motivo: string }[];
  fichaGuardadaEn: number;
}

const num = (v: unknown) => (v == null ? null : Number(v));
const esFicha = (v: unknown): v is GtfSerfor =>
  typeof v === "object" && v != null && Array.isArray((v as { trozas?: unknown }).trozas);

export class MedidasGuiaDB {
  /** Para la planilla: qué guías ya tienen la ficha guardada (van solas, sin red). */
  static async estadoDeGuias(tenantId: string, gtfNumbers: readonly string[]): Promise<EstadoGuiaMedidas[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtfs = [...new Set(gtfNumbers.map((g) => g.trim()).filter(Boolean))];
    if (gtfs.length === 0) return [];
    const filas = await prisma.$queryRaw<{ gtfNumber: string; ficha: boolean; registro: string | null }[]>`
      SELECT "gtfNumber", bool_or("serforGtf" IS NOT NULL) AS "ficha",
             max(NULLIF(TRIM("serforNumeroRegistro"), '')) AS "registro"
      FROM "WoodEntry"
      WHERE "tenantId" = ${tenantId} AND "gtfNumber" = ANY(${gtfs}::text[])
        AND "deletedAt" IS NULL AND "status" NOT IN ('anulado', 'rechazado')
      GROUP BY "gtfNumber"
    `;
    const por = new Map(filas.map((f) => [f.gtfNumber, f]));
    return gtfs.map((g) => ({
      gtfNumber: g,
      fichaGuardada: por.get(g)?.ficha ?? false,
      numeroRegistro: por.get(g)?.registro ?? null,
    }));
  }

  /** Las trozas vivas de la guía, con su mes cerrado, y la ficha guardada si la hay. */
  static async leerGuia(tenantId: string, gtfNumber: string): Promise<GuiaParaMedidas> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = gtfNumber.trim();
    if (!gtf) throw new CtpInvariantError("Falta la guía.", "VALIDACION");
    const [ingresos, cierres] = await Promise.all([
      prisma.woodEntry.findMany({
        where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { notIn: NO_VIVOS } },
        select: {
          id: true, entryDate: true, serforNumeroRegistro: true, serforGtf: true,
          speciesCommonName: true, status: true, originCode: true, originSourceNumber: true, contratoId: true,
        },
        orderBy: { id: "asc" },
      }),
      ForestCtpCierreDB.list(tenantId),
    ]);
    if (ingresos.length === 0) throw new CtpInvariantError(`No hay ingresos vivos con la guía ${gtf}.`, "VALIDACION");
    const cerrado = new Map(ingresos.map((i) => [i.id, closedPeriodOf(cierres, i.entryDate)?.label ?? null]));
    const trozas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, woodEntryId: { in: ingresos.map((i) => i.id) } },
      select: { id: true, woodEntryId: true, codificacion: true, d1Cm: true, d2Cm: true, largoM: true },
      orderBy: [{ woodEntryId: "asc" }, { orden: "asc" }],
    });
    const conFicha = ingresos.find((i) => esFicha(i.serforGtf));
    return {
      gtfNumber: gtf,
      ingresos: ingresos.length,
      trozas: trozas.map((t) => ({
        id: t.id,
        codificacion: t.codificacion,
        d1Cm: num(t.d1Cm),
        d2Cm: num(t.d2Cm),
        largoM: num(t.largoM),
        periodoCerrado: cerrado.get(t.woodEntryId) ?? null,
        anulada: false,
      })),
      ficha: conFicha
        ? {
            numeroRegistro: conFicha.serforNumeroRegistro?.trim() || (conFicha.serforGtf as unknown as GtfSerfor).numeroRegistro || null,
            gtf: conFicha.serforGtf as unknown as GtfSerfor,
          }
        : null,
      ingresosTitulo: ingresos.map((i) => ({
        id: i.id,
        especie: i.speciesCommonName,
        status: i.status,
        anulado: false,
        originCode: i.originCode,
        originSourceNumber: i.originSourceNumber,
        contratoId: i.contratoId,
        periodoCerrado: cerrado.get(i.id) ?? null,
      })),
    };
  }

  static async aplicar(tenantId: string, pedido: PedidoMedidasGuia, usuario = "unknown"): Promise<ResultadoMedidasGuia> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = pedido.gtfNumber.trim();
    const relacion = relacionDeGuias(gtf, pedido.ficha.gtfNumber);
    if (!relacionPermiteAplicar(relacion)) {
      throw new CtpInvariantError(
        `La ficha de SERFOR es de la guía ${pedido.ficha.gtfNumber ?? "(sin número)"}, no de la ${gtf}. Revisa el N° de registro.`,
        "VALIDACION",
      );
    }
    const cierres = await ForestCtpCierreDB.list(tenantId);

    const r = await prisma.$transaction(async (tx) => {
      /* Las piezas de la guía, bloqueadas en orden de id (dos tablets a la vez no
         se abrazan): el plan se decide con lo que hay AHORA, no con la vista previa. */
      const filas = await tx.$queryRaw<
        { id: string; codificacion: string | null; d1Cm: unknown; d2Cm: unknown; largoM: unknown; entryDate: Date }[]
      >`
        SELECT t."id", t."codificacion", t."d1Cm", t."d2Cm", t."largoM", e."entryDate"
        FROM "WoodEntryTroza" t
        JOIN "WoodEntry" e ON e."id" = t."woodEntryId"
        WHERE t."tenantId" = ${tenantId} AND e."tenantId" = ${tenantId} AND e."gtfNumber" = ${gtf}
          AND e."deletedAt" IS NULL AND e."status" NOT IN ('anulado', 'rechazado')
        ORDER BY t."id"
        FOR UPDATE OF t
      `;
      if (filas.length === 0) throw new CtpInvariantError(`No hay trozas vivas en la guía ${gtf}.`, "VALIDACION");
      const plan = planearMedidasDesdeGuia(
        filas.map((f) => ({
          id: f.id,
          codificacion: f.codificacion,
          d1Cm: num(f.d1Cm),
          d2Cm: num(f.d2Cm),
          largoM: num(f.largoM),
          periodoCerrado: closedPeriodOf(cierres, f.entryDate)?.label ?? null,
          anulada: false,
        })),
        pedido.ficha.trozas ?? [],
      );

      let escritasIds = new Set<string>();
      if (plan.llenar.length > 0) {
        /* `::numeric`/`::text` dentro del VALUES: Postgres no infiere el tipo de un parámetro ahí. */
        const valores = plan.llenar.map(
          (f) => Prisma.sql`(${f.id}::text, ${f.d1}::numeric, ${f.d2}::numeric, ${f.diametro}::numeric, ${f.dimensiones}::text, ${f.largo}::numeric)`,
        );
        const escritas = await tx.$queryRaw<{ id: string }[]>`
          UPDATE "WoodEntryTroza" AS t SET
            "d1Cm" = v.d1,
            "d2Cm" = v.d2,
            "diametroCm" = COALESCE(t."diametroCm", v.diam),
            "dimensiones" = CASE WHEN COALESCE(TRIM(t."dimensiones"), '') = '' THEN v.dim ELSE t."dimensiones" END,
            "largoM" = COALESCE(t."largoM", v.largo),
            -- La fuente es la guía, no la planta.
            "d1d2MedidoEnPlanta" = false
          FROM (VALUES ${Prisma.join(valores)}) AS v(id, d1, d2, diam, dim, largo)
          WHERE t."id" = v.id AND t."tenantId" = ${tenantId}
            AND t."d1Cm" IS NULL AND t."d2Cm" IS NULL
          RETURNING t."id"
        `;
        escritasIds = new Set(escritas.map((e) => e.id));
      }

      /* La ficha recién traída de SERFOR queda en los ingresos de la guía que no
         tenían una (y con el mes abierto): la próxima vez va sola, sin red. */
      let fichaGuardadaEn = 0;
      if (pedido.guardarFicha) {
        const abiertos = await tx.woodEntry.findMany({
          where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { notIn: NO_VIVOS } },
          select: { id: true, entryDate: true },
        });
        const ids = abiertos.filter((i) => !closedPeriodOf(cierres, i.entryDate)).map((i) => i.id);
        if (ids.length > 0) {
          fichaGuardadaEn = await tx.$executeRaw`
            UPDATE "WoodEntry" SET
              "serforGtf" = ${JSON.stringify(pedido.ficha)}::jsonb,
              "serforNumeroRegistro" = COALESCE(${pedido.numeroRegistro}::text, NULLIF(TRIM("serforNumeroRegistro"), '')),
              "updatedAt" = NOW()
            WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[])
              AND ("serforGtf" IS NULL OR (COALESCE(TRIM("serforNumeroRegistro"), '') = '' AND ${pedido.numeroRegistro}::text IS NOT NULL))
              /* Ficha y N° de registro van JUNTOS (security 05-10): nunca la ficha de un registro con otro. */
              AND (COALESCE(TRIM("serforNumeroRegistro"), '') = '' OR TRIM("serforNumeroRegistro") = ${pedido.numeroRegistro}::text)
          `;
        }
      }
      return { plan, escritasIds, fichaGuardadaEn };
    });

    const escritas = r.plan.llenar.filter((f) => r.escritasIds.has(f.id));
    const omitidas = r.plan.llenar
      .filter((f) => !r.escritasIds.has(f.id))
      .map((f) => ({ id: f.id, codificacion: f.codificacion, motivo: "otra pantalla le anotó una punta antes" }));

    if (escritas.length > 0 || r.fichaGuardadaEn > 0) {
      auditCtp({
        tenantId,
        action: "ctp_troza_d1d2_guia",
        entity: "WoodEntryTroza",
        entityId: escritas[0]?.id ?? gtf,
        detail:
          `Trajo de la ficha SERFOR de la guía ${gtf}` +
          `${pedido.numeroRegistro ? ` (registro ${pedido.numeroRegistro})` : ""} los D1/D2 de ${escritas.length} troza(s) que no los tenían` +
          (escritas.length
            ? ": " +
              escritas
                .slice(0, 40)
                .map((f) => `${f.codificacion}${f.coincidencia === "flexible" ? ` (= ${f.codigoGuia})` : ""} ${f.d1}×${f.d2} cm`)
                .join(", ") +
              (escritas.length > 40 ? ` y ${escritas.length - 40} más` : "")
            : "") +
          (r.fichaGuardadaEn > 0 ? ` · guardó la ficha de SERFOR en ${r.fichaGuardadaEn} ingreso(s)` : "") +
          ".",
        user: usuario,
      });
      try {
        invalidateByPrefix(`${CACHE_WOOD_ENTRIES}:${tenantId}`);
      } catch (err) {
        logger.error("[medidas-guia] invalidar caché failed", { error: String(err) });
      }
    }
    return {
      plan: r.plan,
      escritas: escritas.map((f) => ({ id: f.id, codificacion: f.codificacion })),
      omitidas,
      fichaGuardadaEn: r.fichaGuardadaEn,
    };
  }
}
