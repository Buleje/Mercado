import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { planearTitulo, type IngresoParaTitulo, type PlanTitulo } from "@/lib/forestal/titulo-de-guia";
import { ForestContratoDB } from "./forest-contrato.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { esProveedorDeRelleno, rescatarFuenteDelRelleno } from "@/lib/forestal/asignar-permiso-import";

/**
 * TituloGuiaDB — declarar el título habilitante de una guía ya asentada
 * (Brandon 05-10, modal «Sin título declarado» de Trozas).
 *
 * La regla vive en `planearTitulo` (pura, con test): sólo sobre vacío, el mes
 * cerrado manda, lo anulado no se toca. Acá va lo que no puede ser puro:
 *   · el permiso elegido tiene que ser de ESTE negocio (`contratoId` es una FK
 *     global — mismo hallazgo de ADR-442 que `contratoDelTenant`);
 *   · el UPDATE repite la condición «vacío» en el WHERE: si otra pantalla lo
 *     llenó entre la lectura y la escritura, queda el suyo (igual que el
 *     `COALESCE` de los D1/D2 de planta);
 *   · auditoría por ingreso y caché del libro invalidada.
 */

/** El mismo prefijo que `WoodEntriesDB`: la lista de ingresos y el patio se releen. */
const CACHE_WOOD_ENTRIES = "wood-entries";

export interface PedidoTituloGuia {
  gtfNumber: string;
  /** Un permiso de la lista (`ForestContrato`): da el código y la resolución. */
  contratoId?: string | null;
  /** O el código escrito a mano (si es de un permiso cargado, se vincula solo). */
  originCode?: string | null;
  originSourceNumber?: string | null;
  /** De dónde salió el dato, para el rastro («la ficha SERFOR (registro 1-19-0313629)»). */
  origen?: string | null;
}

export interface ResultadoTituloGuia {
  originCode: string;
  actualizados: { id: string; especie: string | null }[];
  omitidos: { id: string; especie: string | null; motivo: string }[];
}

/** El plan de una guía SIN escribir: lo que `declarar` haría (vista previa del import, ADR-503). */
export interface PlanTituloGuia {
  gtf: string;
  originCode: string;
  originSourceNumber: string | null;
  contratoId: string | null;
  ingresos: IngresoParaTitulo[];
  planes: PlanTitulo[];
}

export class TituloGuiaDB {
  /**
   * Lee la guía y arma el plan con `planearTitulo`, sin escribir nada. Es la
   * mitad de lectura de `declarar`; el importador del libro la usa para la
   * vista previa y para saber qué estado darle a cada fila (ADR-503).
   */
  static async planear(tenantId: string, pedido: PedidoTituloGuia): Promise<PlanTituloGuia> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = pedido.gtfNumber.trim();
    if (!gtf) throw new CtpInvariantError("Falta la guía.", "VALIDACION");

    /* El permiso: de la lista (y de ESTE negocio) o deducido del código escrito. */
    let originCode = (pedido.originCode ?? "").trim();
    let originSourceNumber = (pedido.originSourceNumber ?? "").trim() || null;
    let contratoId: string | null = null;
    if (pedido.contratoId) {
      const c = await ForestContratoDB.get(tenantId, pedido.contratoId);
      if (!c) {
        throw new CtpInvariantError("Ese permiso no está en tu lista de permisos. Elígelo de nuevo.", "VALIDACION");
      }
      contratoId = c.id;
      originCode = c.codigo;
      originSourceNumber = originSourceNumber ?? (c.resolucionNumero?.trim() || null);
    } else if (originCode) {
      contratoId = await ForestContratoDB.idPorCodigo(tenantId, originCode);
    }
    if (!originCode) throw new CtpInvariantError("Elige un permiso o escribe el código del título.", "VALIDACION");

    const [filas, cierres] = await Promise.all([
      prisma.woodEntry.findMany({
        where: { tenantId, gtfNumber: gtf },
        select: {
          id: true, speciesCommonName: true, status: true, deletedAt: true, entryDate: true,
          originCode: true, originSourceNumber: true, contratoId: true,
        },
        orderBy: { id: "asc" },
      }),
      ForestCtpCierreDB.list(tenantId),
    ]);
    if (filas.length === 0) throw new CtpInvariantError(`No hay ingresos con la guía ${gtf}.`, "VALIDACION");

    const ingresos: IngresoParaTitulo[] = filas.map((i) => ({
      id: i.id,
      especie: i.speciesCommonName,
      status: i.status,
      anulado: i.deletedAt != null,
      originCode: i.originCode,
      originSourceNumber: i.originSourceNumber,
      contratoId: i.contratoId,
      periodoCerrado: closedPeriodOf(cierres, i.entryDate)?.label ?? null,
    }));
    const planes = planearTitulo(ingresos, { originCode, originSourceNumber, contratoId });
    return { gtf, originCode, originSourceNumber, contratoId, ingresos, planes };
  }

  /**
   * `planPrevio` = el que el llamador ya leyó con `planear` para ESTA guía (el
   * importador lo lee para la vista previa): se reusa en vez de releer la guía,
   * el permiso y los cierres (reviewer 19-10: ~8 idas por guía). Es seguro
   * aunque haya quedado viejo: el UPDATE repite la condición «vacío».
   */
  static async declarar(
    tenantId: string,
    pedido: PedidoTituloGuia,
    usuario = "unknown",
    planPrevio?: PlanTituloGuia,
  ): Promise<ResultadoTituloGuia> {
    const { gtf, originCode, originSourceNumber, contratoId, planes } =
      planPrevio && planPrevio.gtf === pedido.gtfNumber.trim() ? planPrevio : await TituloGuiaDB.planear(tenantId, pedido);

    const aEscribir = planes.filter((p): p is PlanTitulo & { escribir: NonNullable<PlanTitulo["escribir"]> } => p.escribir != null);
    const escritos = new Set<string>();
    if (aEscribir.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const p of aEscribir) {
          /* Cada campo sólo si SIGUE vacío al escribir (la condición va en el SET
             y en el WHERE): lo que otra pantalla llenó en el medio no se pisa. */
          const n = await tx.$executeRaw`
            UPDATE "WoodEntry" SET
              "originCode" = CASE WHEN COALESCE(TRIM("originCode"), '') = '' THEN ${p.escribir.originCode ?? null}::text ELSE "originCode" END,
              "originSourceNumber" = CASE WHEN COALESCE(TRIM("originSourceNumber"), '') = '' AND ${p.escribir.originSourceNumber ?? null}::text IS NOT NULL
                THEN ${p.escribir.originSourceNumber ?? null}::text ELSE "originSourceNumber" END,
              "contratoId" = COALESCE("contratoId", ${p.escribir.contratoId ?? null}::text),
              "updatedAt" = NOW()
            WHERE "tenantId" = ${tenantId} AND "id" = ${p.id} AND "deletedAt" IS NULL
              AND (COALESCE(TRIM("originCode"), '') = ''
                OR (${p.escribir.originCode ?? null}::text IS NULL AND UPPER(TRIM("originCode")) = UPPER(${originCode}::text)))
          `;
          if (n > 0) escritos.add(p.id);
        }
      });
    }

    const actualizados = aEscribir.filter((p) => escritos.has(p.id)).map((p) => ({ id: p.id, especie: p.especie }));
    const omitidos = planes
      .filter((p) => !escritos.has(p.id))
      .map((p) => ({ id: p.id, especie: p.especie, motivo: p.motivo ?? "otra pantalla lo completó antes" }));

    for (const a of actualizados) {
      auditCtp({
        tenantId,
        action: "ctp_ingreso_titulo_declarado",
        entity: "WoodEntry",
        entityId: a.id,
        detail:
          `Declaró el título ${originCode}${originSourceNumber ? ` (Res. ${originSourceNumber})` : ""} ` +
          `en el ingreso de ${a.especie ?? "—"} de la guía ${gtf}, que no lo traía` +
          `${contratoId ? " · vinculado al permiso de la lista" : ""}` +
          `${pedido.origen?.trim() ? ` · tomado de ${pedido.origen.trim()}` : ""}.`,
        user: usuario,
      });
    }
    if (actualizados.length > 0) {
      try {
        invalidateByPrefix(`${CACHE_WOOD_ENTRIES}:${tenantId}`);
      } catch (err) {
        logger.error("[titulo-guia] invalidar caché failed", { error: String(err) });
      }
    }
    return { originCode, actualizados, omitidos };
  }

  /**
   * El TITULAR del permiso en lugar del proveedor de RELLENO de los ingresos ya
   * guardados de una guía (ADR-503, reviewer 19-10: la guía que ya estaba se
   * quedaba con «QA-503-003» de proveedor). La misma regla que el alta:
   *   · sólo el relleno del importador (`esProveedorDeRelleno`): un nombre real
   *     o la marca del inventario no se tocan;
   *   · su fuente («Origen X · GTF») se guarda antes de borrarla, en la
   *     resolución si está vacía o en las notas (`rescatarFuenteDelRelleno`);
   *   · `ids` = los ingresos que el plan deja con ESTE permiso (escritos o que ya
   *     lo tenían): el mes cerrado y lo anulado ya quedaron afuera ahí;
   *   · el WHERE repite proveedor, resolución y notas leídos: si otra pantalla
   *     los cambió en el medio, queda lo suyo.
   */
  static async completarProveedorDeRelleno(
    tenantId: string,
    gtfNumber: string,
    ids: readonly string[],
    titular: { nombre: string; ruc: string | null; codigo: string },
    usuario = "unknown",
  ): Promise<{ id: string; especie: string | null; fuente: string | null }[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = gtfNumber.trim();
    const nombre = titular.nombre.trim();
    if (!gtf || !nombre || ids.length === 0) return [];
    const filas = await prisma.woodEntry.findMany({
      where: { tenantId, gtfNumber: gtf, id: { in: [...ids] }, deletedAt: null },
      select: { id: true, speciesCommonName: true, providerName: true, originCode: true, originSourceNumber: true, notes: true },
      orderBy: { id: "asc" },
    });
    const hechos: { id: string; especie: string | null; fuente: string | null }[] = [];
    for (const f of filas) {
      if (!esProveedorDeRelleno(f.providerName, gtf)) continue;
      const r = rescatarFuenteDelRelleno(f);
      const n = await prisma.woodEntry.updateMany({
        where: {
          tenantId, id: f.id, deletedAt: null,
          providerName: f.providerName, originSourceNumber: f.originSourceNumber, notes: f.notes,
        },
        data: {
          providerName: nombre,
          ...(titular.ruc ? { providerDocument: titular.ruc, providerDocumentType: "RUC" as const } : {}),
          ...(r.guardadaEn === "resolucion" ? { originSourceNumber: r.originSourceNumber } : {}),
          ...(r.guardadaEn === "notas" ? { notes: r.notes } : {}),
        },
      });
      if (n.count === 0) continue;
      hechos.push({ id: f.id, especie: f.speciesCommonName, fuente: r.fuente });
      auditCtp({
        tenantId,
        action: "ctp_ingreso_titular_del_permiso",
        entity: "WoodEntry",
        entityId: f.id,
        detail:
          `Puso al titular del permiso ${titular.codigo} (${nombre}${titular.ruc ? `, RUC ${titular.ruc}` : ""}) como proveedor ` +
          `del ingreso de ${f.speciesCommonName ?? "—"} de la guía ${gtf}, en lugar de «${f.providerName}» (relleno del importador)` +
          `${r.guardadaEn === "resolucion" ? ` · su fuente «${r.fuente}» quedó como N° de fuente de origen` : ""}` +
          `${r.guardadaEn === "notas" ? ` · su fuente «${r.fuente}» quedó en las notas` : ""}.`,
        user: usuario,
      });
    }
    if (hechos.length > 0) {
      try {
        invalidateByPrefix(`${CACHE_WOOD_ENTRIES}:${tenantId}`);
      } catch (err) {
        logger.error("[titulo-guia] invalidar caché failed", { error: String(err) });
      }
    }
    return hechos;
  }
}
