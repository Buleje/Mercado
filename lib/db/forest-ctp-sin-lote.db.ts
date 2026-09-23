import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { revisarDueno } from "@/lib/forestal/dueno-de-la-madera";
import { motivoParteNoAceptable } from "@/lib/forestal/aserrio-cobro";
import type { ProduccionSinLoteInput, ProduccionSinLoteRespuesta } from "@/lib/forestal/declarar-produccion";
import type { ResultadoCobro } from "@/lib/forestal/tarifa-aserrio";
import {
  MATERIA_PRIMA_SIN_LOTE,
  ProduccionSinLoteError,
  armarRespuesta,
  mensajeDuplicado,
  planDeProduccionSinLote,
  posiblesDuplicados,
  type CorridaPlan,
} from "@/lib/forestal/produccion-sin-lote";
import { CtpInvariantError, CTP_TX_OPTS } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestEspeciesDB } from "./forest-especies.db";
import { ForestContratoDB } from "./forest-contrato.db";
import { ForestAserrioDB } from "./forest-aserrio.db";

/**
 * ForestCtpSinLoteDB — declarar producción sin lote en UN pedido (ADR-429).
 *
 * Antes eran dos pedidos desde la pantalla (crear la corrida vacía y después
 * declararla) con un `DELETE` de rescate si el segundo fallaba: una corrida
 * vacía podía quedar en el libro, y el borrado lógico dejaba quemados su N° y
 * los códigos de paquete (el índice único de códigos también ve las borradas).
 *
 * Ahora TODAS las corridas —una por especie— y sus paquetes se escriben en UNA
 * transacción: o quedan todas o no queda ninguna, sin N° salteados ni códigos
 * tomados por un intento fallido. El cobro al tercero va DESPUÉS, corrida por
 * corrida y por la única vía que escribe cargos (`ForestAserrioDB.cobrarCorrida`):
 * si falla, el libro queda y la respuesta lo dice (ADR-412 §4).
 *
 * `tenantId` 1er parámetro; todo lo que se lee va con `tenantId` en el WHERE.
 */

/* El prefijo de la caché del libro (`CACHE_PREFIX` de forest-ctp.db). Escrito
   y no importado, igual que en forest-aserrio.db: no hace falta traer la clase
   entera del libro para invalidar. */
const CACHE_LIBRO = "forest-ctp";

const num = (v: Prisma.Decimal | null) => (v != null ? Number(v) : null);

/** Un choque del índice único: acá sólo lo tiene el código de paquete. */
const esChoqueUnico = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

const MOTIVO_COBRO_FALLIDO =
  "No se pudo cargar en la cuenta: la corrida quedó guardada, cóbrala de nuevo desde la corrida.";

/** El cobro no tumba la declaración: el libro es lo que se fiscaliza. */
async function cobrarSinTumbar(
  tenantId: string,
  entryId: string,
  pedido: { duenoParteId: string; precioManualPt: number | null },
  user: string,
): Promise<ResultadoCobro> {
  try {
    return await ForestAserrioDB.cobrarCorrida(tenantId, entryId, pedido, user);
  } catch (err) {
    logger.error("[ctp.produccion-sin-lote] la corrida se guardó pero el aserrío no se cargó en la cuenta", {
      error: String(err),
      tenantId,
      entryId,
    });
    return {
      cobrado: false,
      motivo: MOTIVO_COBRO_FALLIDO,
      importe: null,
      parteNombre: null,
      movimientoId: null,
      cotizacion: null,
    };
  }
}

function textoDelServicio(c: CorridaPlan, parte: { nombre: string } | null): string {
  if (parte) {
    return (
      `aserrío a ${parte.nombre}` +
      (c.precioManualPt != null ? ` a S/ ${c.precioManualPt} por PT (a mano)` : " con la tarifa")
    );
  }
  const precio = c.paquetes[0]?.precioVentaPt ?? null;
  return precio != null ? `madera propia a S/ ${precio} por PT` : "madera propia sin precio";
}

export const ForestCtpSinLoteDB = {
  async producirSinLote(
    tenantId: string,
    input: ProduccionSinLoteInput,
    user: string,
  ): Promise<ProduccionSinLoteRespuesta> {
    if (!tenantId) throw new Error("tenantId is required");
    const usuario = user?.trim() || "unknown";

    /* 1 · Lo que no depende de la base: especie, PT contra escuadría, códigos
       repetidos en el pedido, fecha y línea. Falla antes de abrir nada. */
    const plan = planDeProduccionSinLote(input);

    /* 2 · El mes cerrado es un acta: no se le agregan corridas (ADR-139). El
       congelado (`congeladoAt`) vive en los CONSUMOS, y una corrida sin lote no
       tiene ninguno: no hay nada que congelar todavía. */
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, plan.fecha);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede declarar producción con fecha de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    /* 3 · La cuenta del cliente, con el tenant en el WHERE: un id de otro
       tenant es «no existe», igual que uno inventado. Dada de baja o inactiva
       tampoco se acepta — es una corrida NUEVA, no hay dueño previo que
       respetar (`motivoParteNoAceptable` con `mismoDueno: false`). */
    let parte: { id: string; nombre: string } | null = null;
    if (input.servicio.tipo === "tercero") {
      const parteId = input.servicio.parteId;
      const fila = await prisma.forestParty.findFirst({
        where: { id: parteId, tenantId },
        select: { id: true, nombre: true, activo: true, deletedAt: true },
      });
      const motivo = motivoParteNoAceptable(fila, false);
      if (!fila || motivo) {
        throw new ProduccionSinLoteError(
          "PARTE_NO_EXISTE",
          motivo ?? "Esa cuenta no está en el directorio: elígela de nuevo o créala.",
          { parteId },
        );
      }
      parte = { id: fila.id, nombre: fila.nombre };
    }
    const dueno = revisarDueno(
      parte ? { dueno: "tercero", titularNombre: parte.nombre } : { dueno: "propia", titularNombre: null },
    ).normalizado;

    /* 4 · La especie como la escribe esta planta (ADR-410) y el permiso de
       trabajo (ADR-421). Fuera de la transacción: son lecturas cacheadas que
       no tienen por qué estirar el lock. */
    const [especies, contratoId] = await Promise.all([
      Promise.all(plan.corridas.map((c) => ForestEspeciesDB.resolverEspecie(tenantId, c.especie))),
      ForestContratoDB.idPorCodigo(tenantId, input.originCode ?? null),
    ]);

    const originCode = input.originCode?.trim() || null;
    const observations = input.observaciones?.trim() || null;

    /* 5 · Todo o nada. */
    let creadas: { id: string; lineNo: number; especie: string; plan: CorridaPlan }[];
    try {
      creadas = await prisma.$transaction(async (tx) => {
        /* Serializa las producciones sin lote del tenant: dos clics (o dos
           pestañas) con el mismo pedido no pasan los dos el aviso de
           duplicado. `$executeRaw` porque el lock no devuelve filas. */
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ctp-produccion-sin-lote:${tenantId}`}))`;

        if (!input.confirmarDuplicado) {
          const desde = plan.fecha;
          const hasta = new Date(desde.getTime() + 86_400_000);
          const delDia = await tx.forestCtpEntry.findMany({
            where: {
              tenantId,
              section: "produccion",
              status: "registrado",
              deletedAt: null,
              quantity: { not: null },
              entryDate: { gte: desde, lt: hasta },
            },
            select: {
              id: true,
              lineNo: true,
              speciesCommon: true,
              quantity: true,
              volumeInputM3: true,
              _count: { select: { consumos: true } },
            },
            take: 500,
          });
          const dups = posiblesDuplicados(
            plan.corridas,
            delDia.map((e) => ({
              id: e.id,
              lineNo: e.lineNo,
              speciesCommon: e.speciesCommon,
              quantity: num(e.quantity),
              sinLote: e._count.consumos === 0 && !(Number(e.volumeInputM3 ?? 0) > 0),
            })),
          );
          if (dups.length > 0) {
            throw new ProduccionSinLoteError("POSIBLE_DUPLICADO", mensajeDuplicado(dups, input.fecha), {
              duplicados: dups,
            });
          }
        }

        /* El código es único en la planta, borradas incluidas (el índice no
           filtra `deletedAt`). Se nombra la corrida que lo tiene: es lo único
           que permite resolverlo. */
        const codigos = plan.corridas.flatMap((c) => c.paquetes.map((p) => p.codigo));
        const choque = await tx.forestCtpPaquete.findFirst({
          where: { tenantId, OR: codigos.map((codigo) => ({ codigo: { equals: codigo, mode: "insensitive" as const } })) },
          select: { codigo: true, entry: { select: { id: true, lineNo: true, deletedAt: true } } },
        });
        if (choque) {
          throw new ProduccionSinLoteError(
            "PAQUETE_YA_DECLARADO",
            `El código de paquete «${choque.codigo}» ya está usado en la corrida N° ${choque.entry.lineNo}` +
              `${choque.entry.deletedAt ? " (borrada)" : ""}. El código no se repite en la planta: ` +
              "es lo que se busca en la pila y lo que se cita en la guía.",
            { codigo: choque.codigo, lineNo: choque.entry.lineNo, corridaId: choque.entry.id },
          );
        }

        const max = await tx.forestCtpEntry.aggregate({
          where: { tenantId, section: "produccion" },
          _max: { lineNo: true },
        });
        let lineNo = max._max.lineNo ?? 0;

        const out: { id: string; lineNo: number; especie: string; plan: CorridaPlan }[] = [];
        for (const [i, c] of plan.corridas.entries()) {
          lineNo += 1;
          const especie = especies[i];
          const entry = await tx.forestCtpEntry.create({
            data: {
              tenantId,
              section: "produccion",
              lineNo,
              entryDate: plan.fecha,
              materiaPrimaRef: MATERIA_PRIMA_SIN_LOTE,
              originCode,
              contratoId,
              duenoMadera: dueno.dueno,
              titularNombre: dueno.titularNombre,
              /* La cuenta del cliente queda escrita DENTRO de la transacción
                 (auditoría de seguridad, 22-09): antes sólo la escribía el
                 cobro, y si el cobro fallaba la corrida quedaba «de tercero»
                 sin cuenta y sin nada que la marcara para cobrarla después. */
              duenoParteId: parte?.id ?? null,
              speciesCommon: especie.nombre || c.especie,
              speciesScientific: especie.cientifico,
              cites: false,
              productType: c.productType,
              presentacion: c.presentacion,
              codigoProducto: c.codigoProducto,
              quantity: new Prisma.Decimal(c.quantity),
              unit: "m3",
              pieces: c.pieces,
              lineaProduccion: plan.lineaProduccion,
              observations,
              moneda: "PEN",
              status: "registrado",
              createdBy: usuario,
            },
            select: { id: true, lineNo: true, speciesCommon: true },
          });
          /* `createMany`: 500 paquetes en un INSERT, no en 500 — el tope de
             la transacción es de 20 s. */
          await tx.forestCtpPaquete.createMany({
            data: c.paquetes.map((p) => ({
              tenantId,
              ctpEntryId: entry.id,
              codigo: p.codigo,
              productType: p.productType,
              presentacion: p.presentacion,
              cantidad: p.cantidad,
              unit: "m3",
              volumenM3: new Prisma.Decimal(p.volumenM3),
              espesorCm: new Prisma.Decimal(p.espesorCm),
              anchoCm: new Prisma.Decimal(p.anchoCm),
              largoM: new Prisma.Decimal(p.largoM),
              pieTablar: new Prisma.Decimal(p.pieTablar),
              precioVentaPt: p.precioVentaPt != null ? new Prisma.Decimal(p.precioVentaPt) : null,
              createdBy: usuario,
            })),
          });
          out.push({ id: entry.id, lineNo: entry.lineNo, especie: entry.speciesCommon ?? c.especie, plan: c });
        }
        return out;
      }, CTP_TX_OPTS);
    } catch (err) {
      /* Otro camino (declarar, ampliar, importar) tomó uno de estos códigos
         entre la revisión y el INSERT: el índice lo frenó y la transacción ya
         deshizo todo. */
      if (esChoqueUnico(err)) {
        throw new ProduccionSinLoteError(
          "PAQUETE_YA_DECLARADO",
          "Uno de estos códigos de paquete se usó en otra corrida mientras se guardaba. No quedó nada registrado: " +
            "vuelve a abrir el modal para que proponga códigos libres.",
          { codigo: null, lineNo: null },
        );
      }
      throw err;
    }

    try {
      invalidateByPrefix(`${CACHE_LIBRO}:${tenantId}`);
    } catch (err) {
      logger.error("[ctp.produccion-sin-lote] no se pudo invalidar la caché del libro", {
        error: String(err),
        tenantId,
      });
    }

    for (const c of creadas) {
      auditCtp({
        tenantId,
        action: "ctp_linea_create",
        entity: "ForestCtpEntry",
        entityId: c.id,
        detail:
          `Registró la línea #${c.lineNo} de produccion · ${c.especie} · ${c.plan.productType} · ` +
          `${c.plan.quantity} m3 (producción sin lote, ADR-429)`,
        user: usuario,
      });
      auditCtp({
        tenantId,
        action: "ctp_linea_produccion_declarada",
        entity: "ForestCtpEntry",
        entityId: c.id,
        detail:
          `Declaró la producción de la corrida #${c.lineNo}: ${c.plan.quantity} m3 en ` +
          `${c.plan.paquetes.length} paquete(s) · ${c.plan.pt} PT · ${textoDelServicio(c.plan, parte)}`,
        user: usuario,
      });
    }

    /* 6 · El cargo al tercero, uno por corrida y de a uno: cada cobro abre su
       transacción con lock, y el pool tiene 5 conexiones. */
    const aserrio = new Map<string, ResultadoCobro>();
    if (parte) {
      for (const c of creadas) {
        aserrio.set(
          c.id,
          await cobrarSinTumbar(
            tenantId,
            c.id,
            { duenoParteId: parte.id, precioManualPt: c.plan.precioManualPt },
            usuario,
          ),
        );
      }
    }

    /* 7 · Los montos salen de lo GUARDADO, no del pedido (regla 6). */
    /* Si esta lectura falla, la producción YA quedó (la transacción cerró):
       devolver un 500 hacía creer que no se guardó (revisor, 22-09). Se
       responde con el plan, que es exactamente lo que se escribió. */
    let guardados: { ctpEntryId: string; volumenM3: Prisma.Decimal; pieTablar: Prisma.Decimal | null; precioVentaPt: Prisma.Decimal | null }[] | null = null;
    try {
      guardados = await prisma.forestCtpPaquete.findMany({
        where: { tenantId, ctpEntryId: { in: creadas.map((c) => c.id) }, deletedAt: null },
        select: { ctpEntryId: true, volumenM3: true, pieTablar: true, precioVentaPt: true },
      });
    } catch (err) {
      logger.error("[ctp.produccion-sin-lote] se registró pero no se pudo releer lo guardado", {
        tenantId,
        corridas: creadas.map((c) => c.id),
        error: String(err),
      });
    }
    return armarRespuesta(
      creadas.map((c) => ({
        id: c.id,
        lineNo: c.lineNo,
        especie: c.especie,
        paquetes: guardados
          ? guardados
              .filter((p) => p.ctpEntryId === c.id)
              .map((p) => ({
                volumenM3: Number(p.volumenM3),
                pieTablar: num(p.pieTablar),
                precioVentaPt: num(p.precioVentaPt),
              }))
          : c.plan.paquetes.map((p) => ({ volumenM3: p.volumenM3, pieTablar: p.pieTablar, precioVentaPt: p.precioVentaPt })),
        aserrio: parte ? (aserrio.get(c.id) ?? null) : null,
      })),
    );
  },
};
