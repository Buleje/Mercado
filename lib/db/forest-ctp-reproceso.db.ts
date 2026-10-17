import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { CtpInvariantError } from "./forest-ctp-consumo.db";
import { tipoComercialDelProducto } from "@/lib/forestal/loctp-catalogos";
import { esConversionHabitual } from "@/lib/forestal/reproceso-reglas";
import { explicarSaldo, saldosDeCorridas } from "./forest-ctp-saldo-corrida";

/**
 * forest-ctp-reproceso.db — producto terminado que vuelve a la sierra (ADR-316).
 *
 * Una tabla que se re-asierra en tablillas, un cuartón que se parte. El producto
 * original **deja de existir como tal**: por eso el reproceso descuenta stock
 * igual que un despacho, y no como un lote (que sólo etiqueta).
 *
 * ── Invariante I6 ───────────────────────────────────────────────────────────
 *   Σ reprocesado(corrida) + Σ despachado(corrida) ≤ corrida.quantity
 *
 * Se valida app-level con **LOCK sobre las corridas de ORIGEN** —el recurso
 * disputado— ordenadas por id dentro de la tx, exactamente el patrón de I5. El
 * orden fijo evita el abrazo mortal entre dos reprocesos que comparten corridas.
 *
 * La cuenta la hace `saldosDeCorridas`, la misma que usa el despacho: dos
 * cálculos separados dejarían el hueco de reprocesar y despachar lo mismo.
 */

const r4 = (n: number) => Number(n.toFixed(4));
const CACHE_PREFIX = "forest-ctp";

export type LineaReproceso = { origenEntryId: string; quantity: number };

/**
 * Atribuye qué corridas alimentan un reproceso. Reemplaza las anteriores del
 * mismo destino (mismo contrato que `setOrigenes` del despacho).
 */
export async function setReprocesoOrigenes(
  tenantId: string,
  destinoEntryId: string,
  lineas: LineaReproceso[],
  usuario: string,
) {
  if (!tenantId) throw new Error("tenantId is required");
  if (!destinoEntryId) throw new Error("destinoEntryId is required");

  const limpias = lineas
    .map((l) => ({ origenEntryId: l.origenEntryId, quantity: r4(Number(l.quantity)) }))
    .filter((l) => l.origenEntryId && l.quantity > 0);

  const repetido = limpias.find((l, i) => limpias.findIndex((x) => x.origenEntryId === l.origenEntryId) !== i);
  if (repetido) {
    throw new CtpInvariantError(
      "Una corrida no puede aparecer dos veces en el mismo reproceso: suma las cantidades.",
      "I6_SOBRE_REPROCESO",
      { origenEntryId: repetido.origenEntryId },
    );
  }

  return prisma.$transaction(async (tx) => {
    const destino = await tx.forestCtpEntry.findFirst({
      where: { id: destinoEntryId, tenantId, deletedAt: null, status: "registrado" },
      select: { id: true, lineNo: true, section: true, quantity: true, unit: true, productType: true },
    });
    if (!destino) {
      throw new CtpInvariantError("Esa corrida no existe en este tenant.", "TENANT_MISMATCH", { destinoEntryId });
    }
    if (destino.section !== "produccion") {
      throw new CtpInvariantError(
        "El resultado de un reproceso es una corrida de producción, no un despacho.",
        "TENANT_MISMATCH",
        { lineNo: destino.lineNo },
      );
    }

    const ids = [...new Set(limpias.map((l) => l.origenEntryId))].sort();
    if (ids.includes(destinoEntryId)) {
      throw new CtpInvariantError(
        "Una corrida no puede reprocesarse a sí misma.",
        "I6_SOBRE_REPROCESO",
        { lineNo: destino.lineNo },
      );
    }

    if (ids.length > 0) {
      // LOCK sobre el recurso disputado, en orden fijo por id: dos reprocesos
      // que comparten corridas se serializan en vez de abrazarse.
      await tx.$queryRaw`
        SELECT "id" FROM "ForestCtpEntry"
        WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId}
        ORDER BY "id"
        FOR UPDATE
      `;
    }

    const corridas = await tx.forestCtpEntry.findMany({
      // `status: "registrado"` además de `deletedAt`: anular una línea NO hace
      // soft-delete, así que sin esto una corrida anulada podría alimentar un
      // reproceso. Mismo predicado que el despacho.
      where: { id: { in: ids }, tenantId, deletedAt: null, status: "registrado" },
      select: { id: true, lineNo: true, section: true, productType: true, speciesCommon: true, unit: true, quantity: true, codigoRaiz: true },
    });
    if (corridas.length !== ids.length) {
      throw new CtpInvariantError(
        "Alguna corrida de origen no existe en este tenant, está anulada o fue borrada.",
        "TENANT_MISMATCH",
        { pedidas: ids.length, encontradas: corridas.length },
      );
    }
    const noProduccion = corridas.filter((c) => c.section !== "produccion");
    if (noProduccion.length > 0) {
      throw new CtpInvariantError(
        "Un reproceso entra desde corridas de producción, no desde despachos.",
        "TENANT_MISMATCH",
        { lineas: noProduccion.map((c) => c.lineNo) },
      );
    }

    // La unidad SÍ tiene que coincidir; el producto NO: reprocesar es
    // justamente cambiar de producto (tabla → tablillas). Pero atribuir m³
    // contra kg daría un número que no significa nada.
    const otraUnidad = corridas.filter((c) => (c.unit ?? "") !== (destino.unit ?? ""));
    if (otraUnidad.length > 0) {
      throw new CtpInvariantError(
        `El reproceso está en ${destino.unit ?? "—"} y la corrida #${otraUnidad[0]!.lineNo} en ${otraUnidad[0]!.unit ?? "—"}: no se pueden sumar.`,
        "TENANT_MISMATCH",
        { lineas: otraUnidad.map((c) => c.lineNo) },
      );
    }

    // I6 — con el saldo COMPARTIDO con el despacho.
    const saldos = await saldosDeCorridas(tx, tenantId, ids, { reprocesoDestinoId: destinoEntryId });
    for (const l of limpias) {
      const corrida = corridas.find((c) => c.id === l.origenEntryId)!;
      const saldo = saldos.get(l.origenEntryId);
      const disponible = saldo?.disponible ?? 0;
      if (r4(l.quantity) > r4(disponible)) {
        throw new CtpInvariantError(
          `La corrida #${corrida.lineNo} produjo ${saldo?.producido ?? 0} y sólo le quedan ${r4(disponible)} disponibles` +
            (saldo ? explicarSaldo(saldo) : "") +
            `; estás pidiendo ${r4(l.quantity)}.`,
          "I6_SOBRE_REPROCESO",
          {
            lineNo: corrida.lineNo,
            producido: saldo?.producido ?? 0,
            disponible: r4(disponible),
            despachado: saldo?.despachado ?? 0,
            reprocesado: saldo?.reprocesado ?? 0,
            pedido: r4(l.quantity),
          },
        );
      }
    }

    // El código raíz se hereda del primer origen: un tablón hecho tablillas
    // sigue apuntando a la corrida de la que nació, por muchos reprocesos que
    // pasen. Si el origen no lo tiene, la raíz es el origen mismo.
    const primero = corridas.find((c) => c.id === limpias[0]?.origenEntryId);
    const codigoRaiz = primero ? (primero.codigoRaiz ?? `#${primero.lineNo ?? primero.id}`) : null;

    const antes = await tx.forestCtpReproceso.findMany({
      where: { destinoEntryId, tenantId },
      include: { origen: { select: { lineNo: true } } },
    });

    await tx.forestCtpReproceso.deleteMany({ where: { destinoEntryId, tenantId } });
    if (limpias.length > 0) {
      await tx.forestCtpReproceso.createMany({
        data: limpias.map((l) => ({
          tenantId,
          destinoEntryId,
          origenEntryId: l.origenEntryId,
          quantity: new Prisma.Decimal(l.quantity),
          createdBy: usuario,
        })),
      });
    }
    if (codigoRaiz) {
      await tx.forestCtpEntry.update({ where: { id: destinoEntryId }, data: { codigoRaiz } });
    }

    /* Las conversiones que el aserradero no hace (ADR-407) NO se rechazan: el
       Libro registra hechos que ya pasaron —una tabla hinchada que volvió a la
       sierra, una devolución— y rechazar el asiento no deshace el hecho, sólo
       empuja a falsear el tipo para poder anotarlo. Lo que sí queda es DICHO,
       acá y en las observaciones del asiento: es lo que se lee después. */
    const tipoDestino = tipoComercialDelProducto(destino.productType);
    const noHabituales = corridas
      .filter((c) => limpias.some((l) => l.origenEntryId === c.id))
      .filter((c) => !esConversionHabitual(tipoComercialDelProducto(c.productType), tipoDestino))
      .map((c) => `#${c.lineNo} ${tipoComercialDelProducto(c.productType) ?? c.productType} → ${tipoDestino ?? destino.productType}`);

    const detalleAntes = antes.map((a) => `#${a.origen.lineNo} ${Number(a.quantity)}`).join(", ") || "nada";
    const detalleAhora =
      limpias.map((l) => `#${corridas.find((c) => c.id === l.origenEntryId)?.lineNo} ${l.quantity}`).join(", ") || "nada";
    auditCtp({
      tenantId,
      action: "ctp_reproceso_set",
      entity: "ForestCtpEntry",
      entityId: destinoEntryId,
      detail:
        `Reproceso de la corrida #${destino.lineNo}: entra ${detalleAhora} (antes ${detalleAntes})` +
        (noHabituales.length > 0
          ? ` · conversión NO habitual: ${noHabituales.join(", ")}`
          : ""),
      user: usuario,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}

    /* `noHabituales` viaja al que llama: la pantalla lo usa para decirlo sin
       volver a calcular la regla (y para no afirmar que fue habitual). */
    return { destinoEntryId, lineas: limpias, codigoRaiz, noHabituales };
  });
}

/**
 * Corridas de producción con saldo para reprocesar.
 *
 * Mismo saldo que ve el despacho: lo ya despachado y lo ya reprocesado no se
 * ofrecen dos veces.
 */
export async function corridasReprocesables(tenantId: string, excluirDestinoId?: string) {
  if (!tenantId) throw new Error("tenantId is required");
  const corridas = await prisma.forestCtpEntry.findMany({
    where: {
      tenantId,
      section: "produccion",
      deletedAt: null,
      status: "registrado",
      ...(excluirDestinoId ? { id: { not: excluirDestinoId } } : {}),
    },
    select: {
      id: true, lineNo: true, entryDate: true, productType: true, speciesCommon: true,
      quantity: true, unit: true, codigoRaiz: true,
    },
    orderBy: { entryDate: "desc" },
    take: 300,
  });
  if (corridas.length === 0) return [];

  const saldos = await saldosDeCorridas(
    prisma,
    tenantId,
    corridas.map((c) => c.id),
    excluirDestinoId ? { reprocesoDestinoId: excluirDestinoId } : undefined,
  );

  return corridas
    .map((c) => {
      const s = saldos.get(c.id);
      return {
        id: c.id,
        lineNo: c.lineNo,
        fecha: c.entryDate.toISOString(),
        productType: c.productType,
        speciesCommon: c.speciesCommon,
        unit: c.unit,
        codigoRaiz: c.codigoRaiz,
        producido: s?.producido ?? 0,
        despachado: s?.despachado ?? 0,
        reprocesado: s?.reprocesado ?? 0,
        disponible: s?.disponible ?? 0,
      };
    })
    .filter((c) => c.disponible > 0);
}

/** Los orígenes de un reproceso, para mostrar de qué salió una corrida. */
export async function origenesDeReproceso(tenantId: string, destinoEntryId: string) {
  if (!tenantId) throw new Error("tenantId is required");
  return prisma.forestCtpReproceso.findMany({
    where: { tenantId, destinoEntryId },
    include: {
      origen: {
        select: { id: true, lineNo: true, entryDate: true, productType: true, speciesCommon: true, unit: true, codigoRaiz: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Los reprocesos declarados del período — el panel «qué volvió a la sierra».
 *
 * Se lee por DESTINO (una fila por reproceso) y no por línea de origen: dos
 * corridas que alimentan el mismo reproceso son un hecho, no dos. La merma y
 * las conversiones las deriva `lib/forestal/reprocesos-declarados.ts`, que es
 * puro y se testea sin base.
 *
 * El período filtra por la fecha del ASIENTO destino (`entryDate`), que es la
 * fecha con la que el reproceso figura en el libro — no por `createdAt`, que
 * es cuándo alguien lo tipeó.
 */
export async function reprocesosDeclarados(
  tenantId: string,
  opts?: { desde?: Date; hasta?: Date; limite?: number },
) {
  if (!tenantId) throw new Error("tenantId is required");

  const filas = await prisma.forestCtpReproceso.findMany({
    where: {
      tenantId,
      destino: {
        tenantId,
        deletedAt: null,
        status: "registrado",
        ...(opts?.desde || opts?.hasta
          ? {
              entryDate: {
                ...(opts.desde ? { gte: opts.desde } : {}),
                ...(opts.hasta ? { lte: opts.hasta } : {}),
              },
            }
          : {}),
      },
    },
    select: {
      quantity: true,
      destino: {
        select: {
          id: true, lineNo: true, entryDate: true, productType: true, speciesCommon: true,
          quantity: true, unit: true, observations: true, originCode: true,
        },
      },
      origen: {
        select: { id: true, lineNo: true, productType: true, speciesCommon: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts?.limite ?? 400, 1), 1000),
  });

  /* Una fila por destino: el Map preserva el orden de llegada, que ya viene
     del más nuevo al más viejo. */
  const porDestino = new Map<string, {
    destinoEntryId: string;
    lineNo: number | null;
    fecha: string;
    producto: string | null;
    especie: string | null;
    unidad: string | null;
    salio: number;
    observaciones: string | null;
    permiso: string | null;
    origenes: { entryId: string; lineNo: number | null; producto: string | null; especie: string | null; cantidad: number }[];
  }>();

  for (const f of filas) {
    const d = f.destino;
    const g = porDestino.get(d.id) ?? {
      destinoEntryId: d.id,
      lineNo: d.lineNo,
      fecha: d.entryDate.toISOString(),
      producto: d.productType,
      especie: d.speciesCommon,
      unidad: d.unit,
      salio: Number(d.quantity ?? 0),
      observaciones: d.observations,
      permiso: (d.originCode ?? "").trim() || null,
      origenes: [],
    };
    g.origenes.push({
      entryId: f.origen.id,
      lineNo: f.origen.lineNo,
      producto: f.origen.productType,
      especie: f.origen.speciesCommon,
      cantidad: Number(f.quantity),
    });
    porDestino.set(d.id, g);
  }

  return [...porDestino.values()];
}
