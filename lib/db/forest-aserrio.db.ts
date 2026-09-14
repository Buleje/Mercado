import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp, auditCtpEsperando } from "@/lib/forestal/ctp-audit";
import { bloquesDeCorrida, corridaSinPt, cotizarAserrio, type ResultadoCobro } from "@/lib/forestal/tarifa-aserrio";
import {
  MOTIVO_SIN_DUENO,
  detalleAuditCobro,
  duenoDelPedido,
  motivoParteNoAceptable,
  planDeCobro,
  precioManualAUsar,
  precioManualDelDetalle,
  referenciaDeCorrida,
  MOTIVO_TANDA_SIN_TIEMPO,
  detalleAuditTanda,
  resumirTanda,
  type ResultadoDeTanda,
  type ResumenDeTanda,
} from "@/lib/forestal/aserrio-cobro";
import { CTP_TX_OPTS } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestCuentaDB } from "./forest-cuenta.db";
import { ForestTarifaAserrioDB } from "./forest-tarifa-aserrio.db";

/**
 * ForestAserrioDB — cobrar el aserrío por encargo de una corrida (ADR-412 §4).
 *
 * Es la única clase que escribe el cobro: la corrida (a quién, cuánto, la
 * cotización congelada) y el cargo en la cuenta corriente del dueño, en UNA
 * transacción. Si quedaran en dos, un corte a la mitad dejaría una corrida que
 * dice «cobrada» sin deuda en ninguna cuenta, o una deuda sin corrida que la
 * explique.
 *
 * Las decisiones (crear/actualizar/dar de baja, notas, acta del dueño) viven en
 * `aserrio-cobro.ts`, puras y con tests; acá sólo se lee, se bloquea y se escribe.
 *
 * `tenantId` 1er parámetro; todo write auditado — es plata de un tercero.
 */

/* El prefijo de la caché del libro (`CACHE_PREFIX` de forest-ctp.db). Va
   escrito y no importado: forest-ctp.db importa ESTE archivo al anular, y la
   dependencia tiene que ir en un solo sentido. */
const CACHE_LIBRO = "forest-ctp";

/**
 * Cuántas corridas se cobran a la vez en una tanda. El pool de Prisma tiene 5
 * conexiones (`lib/prisma.ts`) y cada cobro abre una transacción interactiva:
 * con 3 en paralelo quedan 2 para el resto del panel mientras la tanda corre.
 */
const TANDA_EN_PARALELO = 3;

/**
 * Tope de tiempo de una tanda. Pasado esto no se EMPIEZA ninguna corrida más
 * (las que están en curso terminan) y las que faltan vuelven con su motivo,
 * para cobrarlas en otra pasada: una tanda colgada no dice qué cobró.
 *
 * 20 s y no más: Vercel corta las rutas de `app/api` a los 30 s (`vercel.json`)
 * con un 504 sin cuerpo, y lo que esté en curso al llegar al tope todavía
 * tiene que terminar y escribir el resumen antes de ese corte.
 */
const TANDA_TOPE_MS = 20_000;

const sinCobro = (motivo: string, extra: Partial<ResultadoCobro> = {}): ResultadoCobro => ({
  cobrado: false,
  importe: null,
  parteNombre: null,
  movimientoId: null,
  motivo,
  cotizacion: null,
  accion: "nada",
  importeDadoDeBaja: null,
  ...extra,
});

const num = (v: Prisma.Decimal | null) => (v != null ? Number(v) : null);

const esChoqueUnico = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** Lo cobrado cambia la tabla de corridas Y el saldo de la cuenta: se invalidan las dos. */
function invalidarLibroYCuenta(tenantId: string): void {
  ForestCuentaDB.invalidar(tenantId);
  try {
    invalidateByPrefix(`${CACHE_LIBRO}:${tenantId}`);
  } catch (err) {
    logger.error("[forest-aserrio] no se pudo invalidar la caché del libro", { error: String(err), tenantId });
  }
}

/**
 * Sacar a la madera de la cuenta de alguien: la corrida deja de tener a quién
 * cobrarle y el cargo vivo se da de baja (baja lógica, ADR-322 — un movimiento
 * de plata que se borra deja el saldo sin explicar).
 *
 * El dueño del LIBRO (`duenoMadera`/`titularNombre`) no se toca: es el acta de
 * quién era la madera, y dejar de cobrarle a alguien no cambia de quién era.
 */
async function dejarDeCobrar(
  tenantId: string,
  corrida: { id: string; lineNo: number | null; duenoParteId: string | null },
  user: string,
): Promise<ResultadoCobro> {
  const vivo = await prisma.forestCuentaMov.findFirst({
    where: { tenantId, ctpEntryId: corrida.id, deletedAt: null },
    select: { id: true, monto: true, parteNombre: true },
  });
  /* Nada que deshacer: la madera del centro que se declara como tal. */
  if (!corrida.duenoParteId && !vivo) return sinCobro(MOTIVO_SIN_DUENO);

  await prisma.$transaction([
    prisma.forestCtpEntry.update({
      where: { id: corrida.id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { duenoParteId: null, aserrioImporte: null, aserrioDetalle: Prisma.DbNull },
    }),
    prisma.forestCuentaMov.updateMany({
      where: { tenantId, ctpEntryId: corrida.id, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
  ]);
  invalidarLibroYCuenta(tenantId);

  auditCtp({
    tenantId,
    action: "ctp_aserrio_quitar",
    entity: "ForestCtpEntry",
    entityId: corrida.id,
    detail:
      `Dejó de cobrar el aserrío de la ${referenciaDeCorrida(corrida.lineNo)}` +
      (vivo
        ? `: dio de baja el cargo de S/ ${Number(vivo.monto).toFixed(2)} a ${vivo.parteNombre}`
        : " (no tenía cargo en la cuenta)"),
    user,
  });
  return sinCobro(MOTIVO_SIN_DUENO, vivo ? { accion: "baja", importeDadoDeBaja: Number(vivo.monto) } : {});
}

export const ForestAserrioDB = {
  /**
   * Le cobra a `duenoParteId` el aserrío de una corrida de producción, o deja
   * de cobrárselo a quien fuera (`duenoParteId: null`).
   *
   * Nunca tira por reglas del negocio —corrida anulada, parte que no existe,
   * sin precio—: devuelve `cobrado: false` con el motivo, porque lo llama la
   * declaración y el asiento del libro ya se guardó. Tira sólo por fallas de
   * verdad (base caída), y el route las ataja.
   */
  async cobrarCorrida(
    tenantId: string,
    entryId: string,
    /** Ausente = mantener lo que la corrida tiene; `null` = quitar / tarifa. */
    pedido: { duenoParteId?: string | null; precioManualPt?: number | null },
    user = "unknown",
  ): Promise<ResultadoCobro> {
    if (!tenantId) throw new Error("tenantId is required");
    const corrida = await prisma.forestCtpEntry.findFirst({
      where: { id: entryId, tenantId, deletedAt: null },
      select: {
        id: true,
        lineNo: true,
        section: true,
        status: true,
        entryDate: true,
        duenoParteId: true,
        aserrioDetalle: true,
      },
    });
    if (!corrida) return sinCobro("Esa corrida no existe.");
    const ref = referenciaDeCorrida(corrida.lineNo);
    if (corrida.section !== "produccion") {
      return sinCobro("Sólo se cobra el aserrío de una corrida de producción.");
    }
    if (corrida.status !== "registrado") return sinCobro(`La ${ref} está ${corrida.status}: no se le cobra.`);

    const dueno = duenoDelPedido(pedido.duenoParteId, corrida.duenoParteId);
    if (dueno.accion === "quitar") return dejarDeCobrar(tenantId, corrida, user);
    /* Sin dueño pedido ni en la corrida —p. ej. sólo se tocó el precio—: no hay
       a quién cobrarle y no se escribe nada. */
    if (dueno.accion === "nada") return sinCobro(MOTIVO_SIN_DUENO);

    /* Se lee la parte aunque esté dada de baja o inactiva: decide
       `motivoParteNoAceptable` (el mismo dueño sí, uno nuevo no). `getParte`
       no sirve acá — sólo mira `deletedAt` y dejaba pasar a un inactivo. */
    const fila = await prisma.forestParty.findFirst({
      where: { id: dueno.parteId, tenantId },
      select: { id: true, nombre: true, activo: true, deletedAt: true },
    });
    const rechazo = motivoParteNoAceptable(fila, dueno.parteId === corrida.duenoParteId);
    if (rechazo || !fila) return sinCobro(rechazo ?? "Esa parte no está en el directorio: elige otra.");
    const parte = { id: fila.id, nombre: fila.nombre };

    /* `undefined` mantiene el trato actual; `null` es la tarifa; un número, a mano. */
    const precioManualPt = precioManualAUsar(pedido.precioManualPt, corrida);
    /* La tarifa que regía EN LA FECHA de la corrida, no la de hoy (ADR-412 §2).
       Y el cierre: un mes cerrado se cobra igual, pero su acta no se reescribe. */
    const [version, cerrado] = await Promise.all([
      ForestTarifaAserrioDB.vigente(tenantId, corrida.entryDate),
      ForestCtpCierreDB.closedPeriodOf(tenantId, corrida.entryDate),
    ]);

    const escribir = () =>
      prisma.$transaction(async (tx) => {
        /* Lock sobre la corrida: dos pedidos que la cobran a la vez (declarar
           y cobrar desde la fila, dos pestañas) se ordenan acá. Sin esto el
           último en escribir la corrida y el último en escribir el cargo
           podían ser pedidos distintos, y la corrida diría un importe y la
           cuenta otro. Mismo patrón que `ampliarProduccion`. */
        const bloqueada = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "ForestCtpEntry"
          WHERE "id" = ${entryId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
          FOR UPDATE
        `;
        if (bloqueada.length === 0) return null;

        /* Los paquetes se leen DESPUÉS del lock: una ampliación que terminó
           mientras esperábamos tiene que entrar en la cotización. */
        const actual = await tx.forestCtpEntry.findFirst({
          where: { id: entryId, tenantId },
          select: {
            lineNo: true,
            status: true,
            speciesCommon: true,
            productType: true,
            quantity: true,
            unit: true,
            titularNombre: true,
            duenoParteId: true,
            paquetes: {
              where: { deletedAt: null },
              orderBy: { codigo: "asc" },
              select: { codigo: true, productType: true, volumenM3: true, espesorCm: true, anchoCm: true, largoM: true },
            },
          },
        });
        if (!actual || actual.status !== "registrado") return null;

        const cotizacion = cotizarAserrio(
          version,
          bloquesDeCorrida(
            {
              lineNo: actual.lineNo,
              speciesCommon: actual.speciesCommon,
              productType: actual.productType,
              quantity: num(actual.quantity),
              unit: actual.unit,
            },
            actual.paquetes.map((p) => ({
              codigo: p.codigo,
              productType: p.productType,
              volumenM3: Number(p.volumenM3),
              espesorCm: num(p.espesorCm),
              anchoCm: num(p.anchoCm),
              largoM: num(p.largoM),
            })),
          ),
          { precioManualPt },
        );

        /* Monto y parte también: la auditoría y la respuesta dicen qué había
           antes de actualizarlo o darlo de baja. */
        const vivo = await tx.forestCuentaMov.findFirst({
          where: { tenantId, ctpEntryId: entryId, deletedAt: null },
          select: { id: true, monto: true, parteNombre: true },
        });

        const plan = planDeCobro({
          corrida: {
            lineNo: actual.lineNo,
            speciesCommon: actual.speciesCommon,
            titularNombre: actual.titularNombre,
            duenoParteId: actual.duenoParteId,
            declarada: actual.quantity != null,
            sinPt: corridaSinPt(actual.unit, actual.paquetes.length > 0),
          },
          parte: { id: parte.id, nombre: parte.nombre },
          cotizacion,
          precioManualPt,
          hayMovimientoVivo: Boolean(vivo),
          periodoCerrado: Boolean(cerrado),
          ahora: new Date().toISOString(),
        });

        await tx.forestCtpEntry.update({
          where: { id: entryId, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
          data: {
            duenoParteId: plan.corrida.duenoParteId,
            aserrioImporte:
              plan.corrida.aserrioImporte != null ? new Prisma.Decimal(plan.corrida.aserrioImporte) : null,
            aserrioDetalle: plan.corrida.aserrioDetalle as unknown as Prisma.InputJsonValue,
            ...(plan.corrida.duenoMadera ? { duenoMadera: plan.corrida.duenoMadera } : {}),
            ...(plan.corrida.titularNombre ? { titularNombre: plan.corrida.titularNombre } : {}),
          },
        });

        let movimientoId: string | null = null;
        const m = plan.movimiento;
        if (m && plan.accion === "crear") {
          const creado = await tx.forestCuentaMov.create({
            data: {
              tenantId,
              ctpEntryId: entryId,
              parteId: m.parteId,
              parteNombre: m.parteNombre,
              fecha: corrida.entryDate,
              tipo: "cargo",
              concepto: "aserrio_prestado",
              monto: new Prisma.Decimal(m.monto),
              moneda: "PEN",
              referencia: m.referencia,
              notas: m.notas,
              createdBy: user || "unknown",
            },
            select: { id: true },
          });
          movimientoId = creado.id;
        } else if (m && vivo && plan.accion === "actualizar") {
          /* Tipo y concepto también: si alguien lo editó a mano desde la
             cuenta, el cargo de una corrida vuelve a decir lo que es. */
          await tx.forestCuentaMov.update({
            where: { id: vivo.id },
            data: {
              parteId: m.parteId,
              parteNombre: m.parteNombre,
              fecha: corrida.entryDate,
              tipo: "cargo",
              concepto: "aserrio_prestado",
              monto: new Prisma.Decimal(m.monto),
              referencia: m.referencia,
              notas: m.notas,
            },
          });
          movimientoId = vivo.id;
        } else if (vivo && plan.accion === "baja") {
          await tx.forestCuentaMov.update({ where: { id: vivo.id }, data: { deletedAt: new Date() } });
        }
        const anterior = vivo ? { parteNombre: vivo.parteNombre, monto: Number(vivo.monto) } : null;
        return { plan, cotizacion, movimientoId, lineNo: actual.lineNo, anterior };
      }, CTP_TX_OPTS);

    let hecho: Awaited<ReturnType<typeof escribir>>;
    try {
      hecho = await escribir();
    } catch (err) {
      if (!esChoqueUnico(err)) throw err;
      /* Otro pedido creó el cargo de esta corrida entre la lectura y el insert
         y el índice único parcial lo frenó. Se escribe otra vez: ahora el
         cargo está vivo y se actualiza en vez de duplicarse. */
      hecho = await escribir();
    }
    if (!hecho) return sinCobro(`La ${ref} ya no está registrada: no se le cobra.`);

    const { plan, cotizacion, movimientoId, lineNo, anterior } = hecho;
    invalidarLibroYCuenta(tenantId);
    auditCtp({
      tenantId,
      action: plan.accion === "baja" ? "ctp_aserrio_quitar" : "ctp_aserrio_cobrar",
      entity: "ForestCtpEntry",
      entityId: entryId,
      detail:
        detalleAuditCobro(plan, parte.nombre, lineNo, anterior) + (movimientoId ? ` · movimiento ${movimientoId}` : ""),
      user,
    });

    return {
      cobrado: plan.accion === "crear" || plan.accion === "actualizar",
      importe: plan.corrida.aserrioImporte,
      parteNombre: parte.nombre,
      movimientoId,
      motivo: plan.motivo,
      cotizacion,
      accion: plan.accion,
      importeDadoDeBaja: plan.accion === "baja" ? (anterior?.monto ?? null) : null,
    };
  },

  /**
   * Si la corrida ya se le cobraba a alguien, lo vuelve a cobrar sobre lo que
   * tiene AHORA (ampliar suma paquetes; corregir cambia cantidad o especie).
   * Con el mismo trato: si se cobró a mano, a mano; si no, con la tarifa de su
   * fecha. `null` = no se le cobraba a nadie, no hay nada que recalcular.
   */
  async cobrarTanda(
    tenantId: string,
    ids: readonly string[],
    /** Mismo contrato que `cobrarCorrida`: lo ausente mantiene lo de cada corrida. */
    pedido: { duenoParteId?: string | null; precioManualPt?: number | null },
    user = "unknown",
    opts: { topeMs?: number } = {},
  ): Promise<{ resultados: ResultadoDeTanda[]; resumen: ResumenDeTanda }> {
    if (!tenantId) throw new Error("tenantId is required");
    const unicos = [...new Set(ids)];
    /* Una lectura para todas: el N° de cada corrida y el filtro de tenant. Una
       corrida ajena (o borrada) no llega a `cobrarCorrida`: es «no existe». */
    const filas = await prisma.forestCtpEntry.findMany({
      where: { tenantId, id: { in: unicos }, deletedAt: null },
      select: { id: true, lineNo: true },
    });
    const lineNoDe = new Map(filas.map((f) => [f.id, f.lineNo]));

    const sinCobrar = (id: string, motivo: string): ResultadoDeTanda => ({
      id,
      lineNo: lineNoDe.get(id) ?? null,
      cobrado: false,
      importe: null,
      parteNombre: null,
      motivo,
      accion: "nada",
      importeDadoDeBaja: null,
    });
    /* Todas arrancan «sin tiempo»: la que ningún trabajador llegue a tocar ya
       dice por qué, en vez de volver como un hueco en la lista. */
    const resultados: ResultadoDeTanda[] = unicos.map((id) => sinCobrar(id, MOTIVO_TANDA_SIN_TIEMPO));
    const inicio = Date.now();
    const tope = opts.topeMs ?? TANDA_TOPE_MS;
    let siguiente = 0;

    /* Cada corrida en SU transacción (la de `cobrarCorrida`): la que falla no
       deshace a las otras, y el resultado lo dice corrida por corrida. */
    const trabajador = async () => {
      while (siguiente < unicos.length) {
        const i = siguiente++;
        const id = unicos[i];
        if (!lineNoDe.has(id)) {
          resultados[i] = sinCobrar(id, "Esa corrida no existe.");
          continue;
        }
        if (Date.now() - inicio > tope) {
          resultados[i] = sinCobrar(id, MOTIVO_TANDA_SIN_TIEMPO);
          continue;
        }
        try {
          const r = await this.cobrarCorrida(tenantId, id, pedido, user);
          resultados[i] = {
            id,
            lineNo: lineNoDe.get(id) ?? null,
            cobrado: r.cobrado,
            importe: r.importe,
            parteNombre: r.parteNombre,
            motivo: r.motivo,
            accion: r.accion ?? "nada",
            importeDadoDeBaja: r.importeDadoDeBaja ?? null,
          };
        } catch (err) {
          logger.error("[forest-aserrio.tanda] no se pudo cobrar una corrida", {
            error: String(err),
            tenantId,
            entryId: id,
          });
          resultados[i] = sinCobrar(id, "No se pudo cobrar esta corrida: inténtalo de nuevo.");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(TANDA_EN_PARALELO, unicos.length) }, trabajador));

    const resumen = resumirTanda(resultados);
    /* Se espera: es el renglón que dice qué hizo la tanda entera, y en Vercel
       lo que corre después de responder puede no terminar. No tira — un fallo
       de auditoría no deshace cobros que ya se escribieron. */
    await auditCtpEsperando({
      tenantId,
      action: "ctp_aserrio_cobrar_tanda",
      entity: "ForestCtpLibro",
      entityId: tenantId,
      detail: `${detalleAuditTanda(resultados, resumen)} · ${Date.now() - inicio} ms`,
      user,
    });
    return { resultados, resumen };
  },

  async recotizarSiCobrada(tenantId: string, entryId: string, user = "unknown"): Promise<ResultadoCobro | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const c = await prisma.forestCtpEntry.findFirst({
      where: { id: entryId, tenantId, deletedAt: null },
      select: { duenoParteId: true, aserrioDetalle: true },
    });
    if (!c?.duenoParteId) return null;
    return this.cobrarCorrida(
      tenantId,
      entryId,
      { duenoParteId: c.duenoParteId, precioManualPt: precioManualDelDetalle(c.aserrioDetalle) },
      user,
    );
  },

  /**
   * La corrida se anuló o se borró: su aserrío deja de deberse. Baja lógica del
   * cargo vivo; lo cobrado queda escrito en la corrida como historia.
   * Devuelve si había algo que dar de baja.
   */
  async alAnular(tenantId: string, entryId: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const vivo = await prisma.forestCuentaMov.findFirst({
      where: { tenantId, ctpEntryId: entryId, deletedAt: null },
      select: { id: true, monto: true, parteNombre: true, referencia: true },
    });
    if (!vivo) return false;
    const { count } = await prisma.forestCuentaMov.updateMany({
      where: { id: vivo.id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) return false;
    ForestCuentaDB.invalidar(tenantId);
    auditCtp({
      tenantId,
      action: "ctp_aserrio_quitar",
      entity: "ForestCtpEntry",
      entityId: entryId,
      detail:
        `Dio de baja el cargo de aserrío de S/ ${Number(vivo.monto).toFixed(2)} a ${vivo.parteNombre}` +
        ` (${vivo.referencia ?? "corrida"}): la corrida se anuló o se borró`,
      user,
    });
    return true;
  },
};
