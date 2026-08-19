import "server-only";
import { prisma } from "@/lib/prisma";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * Vaciar el Libro de Operaciones del CTP.
 *
 * Es la operación más destructiva del módulo: borra el registro que acredita el
 * origen legal de la madera. Existe porque un libro cargado mal —una importación
 * de prueba, un archivo equivocado— deja el saldo inservible y rehacerlo fila
 * por fila no es viable. Pero se trata como lo que es.
 *
 * TRES GUARDS, y ninguno es opcional:
 *
 * 1. **Los períodos cerrados no se tocan.** Un mes cerrado ya se presentó ante
 *    SERFOR; borrarlo deja al titular sin poder respaldar lo que declaró. Si hay
 *    alguno, la purga se niega y dice cuál — reabrirlo es una decisión aparte,
 *    con su propio rastro.
 * 2. **Siempre se cuenta antes de borrar**, y el conteo se le muestra al
 *    operador. Un «¿seguro?» sin números no es una confirmación informada.
 * 3. **Queda auditado** con el detalle de cuánto se borró de cada cosa. Un libro
 *    que desaparece sin rastro es exactamente lo que un fiscalizador buscaría.
 *
 * Las tablas puente (`ForestCtpConsumo`, `ForestCtpDespachoOrigen`,
 * `ForestCtpReproceso`) y las trozas caen por `onDelete: Cascade`. Se borran los
 * padres y la base se encarga del resto, que es lo único que garantiza no dejar
 * atribuciones huérfanas apuntando a corridas que ya no existen.
 */

export type ConteoDelLibro = {
  ingresos: number;
  trozas: number;
  produccion: number;
  despachos: number;
  consumos: number;
  origenes: number;
  total: number;
};

export class ForestCtpPurgaDB {
  /** Qué hay en el libro, para mostrarlo ANTES de borrar. */
  static async contar(tenantId: string): Promise<ConteoDelLibro> {
    if (!tenantId) throw new Error("tenantId is required");

    const [ingresos, trozas, entradas, consumos, origenes] = await Promise.all([
      prisma.woodEntry.count({ where: { tenantId } }),
      prisma.woodEntryTroza.count({ where: { tenantId } }),
      prisma.forestCtpEntry.groupBy({ by: ["section"], where: { tenantId }, _count: true }),
      prisma.forestCtpConsumo.count({ where: { tenantId } }),
      prisma.forestCtpDespachoOrigen.count({ where: { tenantId } }),
    ]);

    const porSeccion = (s: string) => entradas.find((e) => e.section === s)?._count ?? 0;
    const produccion = porSeccion("produccion");
    const despachos = porSeccion("despacho");

    return {
      ingresos,
      trozas,
      produccion,
      despachos,
      consumos,
      origenes,
      /* El total cuenta los REGISTROS del libro, no las filas puente: es el
         número que el operador reconoce como «lo que cargué». */
      total: ingresos + produccion + despachos,
    };
  }

  /** Los períodos cerrados que impiden vaciar. Vacío = se puede. */
  static async periodosQueBloquean(tenantId: string): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const cierres = await ForestCtpCierreDB.list(tenantId);
    /* Un cierre reabierto sigue en el historial pero ya no bloquea: reabrirlo
       fue una decisión explícita, con su motivo y su rastro. */
    return cierres.filter((c) => !c.reabierto).map((c) => c.label || c.periodKey);
  }

  /**
   * Vacía el libro entero.
   *
   * Devuelve lo que había, para poder decir exactamente qué se borró. Todo en
   * una transacción: media purga deja un libro peor que el que había —corridas
   * sin sus ingresos— y eso sí sería irrecuperable.
   */
  static async vaciar(
    tenantId: string,
    usuario: string,
  ): Promise<{ ok: true; borrado: ConteoDelLibro } | { ok: false; motivo: string; periodos: string[] }> {
    if (!tenantId) throw new Error("tenantId is required");

    const periodos = await ForestCtpPurgaDB.periodosQueBloquean(tenantId);
    if (periodos.length > 0) {
      return {
        ok: false,
        motivo:
          `Hay ${periodos.length} período${periodos.length === 1 ? "" : "s"} cerrado${periodos.length === 1 ? "" : "s"} ` +
          `(${periodos.join(", ")}). Un mes cerrado ya se presentó ante SERFOR: reabrilo primero si de verdad hay que borrarlo.`,
        periodos,
      };
    }

    const borrado = await ForestCtpPurgaDB.contar(tenantId);

    await prisma.$transaction(async (tx) => {
      /* Orden: primero lo que cuelga, después los padres. Las cascadas ya se
         encargarían, pero borrar explícitamente los puentes deja claro en el
         código qué se lleva la purga — y no depende de que nadie afloje un
         `onDelete` más adelante. */
      await tx.forestCtpDespachoOrigen.deleteMany({ where: { tenantId } });
      await tx.forestCtpConsumo.deleteMany({ where: { tenantId } });
      await tx.forestCtpReproceso.deleteMany({ where: { tenantId } });
      await tx.forestCtpEntry.deleteMany({ where: { tenantId } });
      /* Los retrozos primero: cuelgan de otra troza y borrar la madre antes
         dispararía la cascada sobre filas que ya no están. */
      await tx.woodEntryTroza.deleteMany({ where: { tenantId, trozaOrigenId: { not: null } } });
      await tx.woodEntryTroza.deleteMany({ where: { tenantId } });
      await tx.woodEntry.deleteMany({ where: { tenantId } });
    });

    auditCtp({
      tenantId,
      action: "ctp_libro_purga",
      entity: "ForestCtpLibro",
      entityId: tenantId,
      detail:
        `VACIÓ EL LIBRO DE OPERACIONES COMPLETO: ${borrado.ingresos} ingresos, ${borrado.trozas} trozas, ` +
        `${borrado.produccion} corridas, ${borrado.despachos} despachos, ${borrado.consumos} consumos atribuidos, ` +
        `${borrado.origenes} orígenes de despacho.`,
      user: usuario,
    });

    try {
      invalidateByPrefix(`forest-ctp:${tenantId}`);
      invalidateByPrefix(`wood-entries:${tenantId}`);
    } catch (e) {
      logger.error("[forest-ctp-purga] no se pudo invalidar el caché", { error: String(e) });
    }

    return { ok: true, borrado };
  }
}
