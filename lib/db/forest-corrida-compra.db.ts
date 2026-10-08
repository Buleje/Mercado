/**
 * ForestCorridaCompraDB — «Corrida con su compra» y «Especies aserradas sin
 * ingreso» (ADR-485).
 *
 * Lee lo que piden las funciones puras de `lib/forestal/corrida-compra.ts` y,
 * al confirmar, escribe POR EL MISMO CAMINO que «Editar atribución»:
 * `ForestCtpConsumoDB.setConsumos` (lock de la corrida y de los ingresos
 * `ORDER BY id`, I1, I2, mes cerrado, congelado, auditoría y caché). Esta clase
 * no tiene una segunda versión de esas reglas: sólo decide qué proponer.
 */
import { prisma } from "@/lib/prisma";
import { closedPeriodOf } from "@/lib/forestal/ctp-cierre-types";
import {
  consumosAlConfirmar,
  especiesSinIngreso,
  proponerCompraDeCorrida,
  type ConsumoActual,
  type EspecieSinIngreso,
  type IngresoParaCompra,
  type PropuestaCompra,
} from "@/lib/forestal/corrida-compra";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { permisoRef } from "@/lib/forestal/vincular-trozas";
import { CONSUMO_VIGENTE, CtpInvariantError, ForestCtpConsumoDB, type CostoDeLinea } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";

const MUERTOS = ["anulado", "rechazado"] as const;
const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

export class ForestCorridaCompraDB {
  /**
   * La propuesta para UNA corrida. `null` si la corrida no existe en este
   * tenant (o no es de producción): la ruta responde 404 sin decir más.
   */
  static async propuesta(tenantId: string, ctpEntryId: string): Promise<PropuestaCompra | null> {
    return (await ForestCorridaCompraDB.calcular(tenantId, ctpEntryId))?.propuesta ?? null;
  }

  /** La propuesta y los consumos que la corrida tenía cuando se calculó (lo que `ligar` escribe). */
  private static async calcular(tenantId: string, ctpEntryId: string): Promise<{ propuesta: PropuestaCompra; actuales: ConsumoActual[] } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!ctpEntryId) throw new Error("ctpEntryId is required");

    const corrida = await prisma.forestCtpEntry.findFirst({
      where: { id: ctpEntryId, tenantId, deletedAt: null, section: "produccion" },
      select: {
        id: true,
        lineNo: true,
        entryDate: true,
        speciesCommon: true,
        volumeInputM3: true,
        status: true,
        aperturaDeclaradaAt: true,
        duenoMadera: true,
        titularNombre: true,
        originCode: true,
        contratoId: true,
        contrato: { select: { codigo: true, deletedAt: true } },
        unit: true,
        /* Lo que entró desde otra corrida viva (reproceso, ADR-316): ya tiene origen. */
        reprocesosEntrada: {
          where: { origen: { deletedAt: null, status: "registrado" } },
          select: { quantity: true },
        },
      },
    });
    if (!corrida) return null;

    const [cierres, actuales, ingresos] = await Promise.all([
      ForestCtpCierreDB.list(tenantId),
      prisma.forestCtpConsumo.findMany({
        where: { tenantId, ctpEntryId },
        select: { woodEntryId: true, volumeM3: true, congeladoAt: true },
      }),
      prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { notIn: [...MUERTOS] } },
        select: {
          id: true,
          gtfNumber: true,
          entryDate: true,
          fechaRecepcion: true,
          speciesCommonName: true,
          status: true,
          volumeM3: true,
          costoTotal: true,
          moneda: true,
          maderaDeTercero: true,
          duenoNombre: true,
          originCode: true,
          contratoId: true,
          contrato: { select: { codigo: true, deletedAt: true } },
        },
      }),
    ]);

    /* Lo que ya consumen OTRAS corridas vivas, sólo de las guías de la especie
       (y de las que esta ya usa): el resto no entra a la propuesta. */
    const clave = claveEspecie(corrida.speciesCommon);
    const ids = ingresos
      .filter((i) => claveEspecie(i.speciesCommonName) === clave || actuales.some((a) => a.woodEntryId === i.id))
      .map((i) => i.id);
    const otros =
      ids.length > 0
        ? await prisma.forestCtpConsumo.groupBy({
            by: ["woodEntryId"],
            where: { tenantId, woodEntryId: { in: ids }, ctpEntryId: { not: ctpEntryId }, ...CONSUMO_VIGENTE },
            _sum: { volumeM3: true },
          })
        : [];
    const usado = new Map(otros.map((o) => [o.woodEntryId, num(o._sum.volumeM3)]));

    /* Sin ninguna fila de la especie, ¿entraron trozas suyas colgadas de la fila
       de otra? Es lo mismo que cuenta el aviso de Saldos (`especiesSinIngreso`):
       sin esto, la propuesta decía «no hay ningún ingreso» y Saldos no avisaba. */
    const trozasAjenas = new Map<string, Record<string, number>>();
    if (clave && !ingresos.some((i) => claveEspecie(i.speciesCommonName) === clave)) {
      const grupos = await prisma.woodEntryTroza.groupBy({
        by: ["woodEntryId", "especieComun"],
        where: { tenantId, especieComun: { not: null }, woodEntryId: { in: ingresos.map((i) => i.id) } },
        _count: { _all: true },
      });
      for (const g of grupos) {
        if (!g.especieComun || claveEspecie(g.especieComun) !== clave) continue;
        trozasAjenas.set(g.woodEntryId, { ...(trozasAjenas.get(g.woodEntryId) ?? {}), [g.especieComun]: g._count._all });
      }
    }

    const paraCompra: IngresoParaCompra[] = ingresos.map((i) => {
      const volumen = num(i.volumeM3);
      return {
        id: i.id,
        gtf: i.gtfNumber,
        llegada: i.fechaRecepcion ?? i.entryDate,
        especie: i.speciesCommonName,
        status: i.status,
        volumenM3: volumen,
        usadoPorOtrasM3: usado.get(i.id) ?? 0,
        costoUnitario: i.costoTotal != null && volumen > 0 ? Math.round((Number(i.costoTotal) / volumen) * 100) / 100 : null,
        moneda: i.moneda ?? "PEN",
        deTercero: i.maderaDeTercero,
        duenoNombre: i.duenoNombre,
        permiso: permisoRef(i.contratoId, i.contrato, i.originCode),
        trozasPorEspecie: trozasAjenas.get(i.id),
      };
    });

    const consumosActuales = actuales.map((a) => ({ woodEntryId: a.woodEntryId, volumeM3: num(a.volumeM3) }));
    const propuesta = proponerCompraDeCorrida(
      {
        id: corrida.id,
        lineNo: corrida.lineNo,
        fecha: corrida.entryDate,
        especie: corrida.speciesCommon,
        declaradoM3: corrida.volumeInputM3 != null ? Number(corrida.volumeInputM3) : null,
        status: corrida.status,
        aperturaDeclarada: corrida.aperturaDeclaradaAt != null,
        congelado: actuales.some((a) => a.congeladoAt != null),
        mesCerrado: closedPeriodOf(cierres, corrida.entryDate)?.label ?? null,
        permiso: permisoRef(corrida.contratoId, corrida.contrato, corrida.originCode),
        duenoMadera: corrida.duenoMadera,
        titularNombre: corrida.titularNombre,
        /* Sólo en m³: en pt o kg haría falta una conversión que el libro no inventa. */
        desdeReprocesoM3:
          /* `?? ""` como el listado del libro (`mpReprocesoM3`): los dos lectores restan lo mismo. */
          (corrida.unit ?? "").toLowerCase() === "m3" ? corrida.reprocesosEntrada.reduce((a, r) => a + num(r.quantity), 0) : 0,
      },
      paraCompra,
      consumosActuales,
    );
    return { propuesta, actuales: consumosActuales };
  }

  /**
   * Confirma la propuesta que el operador vio. El servidor la vuelve a
   * calcular: si cambió (otra corrida tomó esa guía, llegó un ingreso), no se
   * escribe una distinta de la que se aceptó — se pide mirarla de nuevo.
   * `null` = la corrida no existe en este tenant.
   */
  static async ligar(
    tenantId: string,
    ctpEntryId: string,
    firma: string,
    user: string,
  ): Promise<{ propuesta: PropuestaCompra; costo: CostoDeLinea } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!user?.trim()) throw new Error("user is required");
    const calculada = await ForestCorridaCompraDB.calcular(tenantId, ctpEntryId);
    if (!calculada) return null;
    const { propuesta, actuales } = calculada;
    if (propuesta.filas.length === 0) {
      throw new CtpInvariantError(propuesta.motivo ?? "No hay madera que ligar a esta corrida.", "VALIDACION", { estado: propuesta.estado });
    }
    if (propuesta.firma !== firma) {
      throw new CtpInvariantError(
        "El libro cambió desde que viste la propuesta: mírala de nuevo antes de confirmar.",
        "PROPUESTA_DESACTUALIZADA",
        { estado: propuesta.estado },
      );
    }
    /* Se escribe EXACTAMENTE lo que la propuesta firmada usó: los consumos que
       tenía la corrida al calcularla más sus filas. Releerlos acá hacía que un
       doble envío sumara las filas dos veces (el segundo leía lo que el primero
       ya había escrito); así el segundo reescribe el mismo conjunto (setConsumos
       reemplaza el set) y es idempotente. Revisión 08-10. */
    await ForestCtpConsumoDB.setConsumos(tenantId, ctpEntryId, consumosAlConfirmar(actuales, propuesta.filas), user);
    return { propuesta, costo: await ForestCtpConsumoDB.costoDeLinea(tenantId, ctpEntryId) };
  }

  /**
   * Las especies con corridas vivas y NINGÚN ingreso (guía viva o troza de una
   * guía viva) en todo el libro. Sin período: una guía del mes pasado sí
   * respalda la corrida de hoy.
   */
  static async especiesSinIngreso(tenantId: string): Promise<EspecieSinIngreso[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const [corridas, guias, trozas] = await Promise.all([
      prisma.forestCtpEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", section: "produccion" },
        select: {
          lineNo: true,
          speciesCommon: true,
          volumeInputM3: true,
          aperturaDeclaradaAt: true,
          _count: { select: { paquetes: { where: { deletedAt: null } } } },
        },
      }),
      prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { notIn: [...MUERTOS] } },
        select: { speciesCommonName: true },
        distinct: ["speciesCommonName"],
      }),
      prisma.woodEntryTroza.findMany({
        where: { tenantId, especieComun: { not: null }, entry: { deletedAt: null, status: { notIn: [...MUERTOS] } } },
        select: { especieComun: true },
        distinct: ["especieComun"],
      }),
    ]);
    return especiesSinIngreso(
      corridas.map((c) => ({
        lineNo: c.lineNo,
        especie: c.speciesCommon,
        m3Troza: c.volumeInputM3 != null ? Number(c.volumeInputM3) : null,
        paquetes: c._count.paquetes,
        aperturaDeclarada: c.aperturaDeclaradaAt != null,
      })),
      [...guias.map((g) => g.speciesCommonName), ...trozas.map((t) => t.especieComun)],
    );
  }
}
