import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { auditCtpEsperando } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { unificarCuentas } from "@/lib/adelantos/cuenta-unificada";
import { claveDia, estadoCuentaUnificado } from "@/lib/adelantos/estado-cuenta-unificado";
import { armarCuentaDeGuia, type CuentaDeGuiaDTO } from "@/lib/forestal/cuenta-en-la-guia";
import { duenoSugerido } from "@/lib/forestal/madera-de-servicio";
import {
  CATEGORIAS_GASTO_GUIA,
  CATEGORIA_GASTO_GUIA_LABEL,
  METODOS_PAGO,
  TOLERANCIA_SOLES,
  costoDetalleSchema,
  costoPuestoEnPatio,
  estadoDePagoDeGuias,
  guiasSinPagarPorParte,
  proveedorDeLaGuia,
  ptDeLinea,
  type CategoriaGastoGuia,
  type CostoDetalle,
  type EstadoPago,
  type EstadoPagoGuia,
  type GastoGuia,
  type GastoGuiaInput,
  type GuardarCompraInput,
  type GuardarPlataGuiaInput,
  type GuiasSinPagarDeParte,
  type LineaPlataDTO,
  type MetodoPagoGuia,
  type PlataDeGuiaDTO,
  type ResumenPersona,
} from "@/lib/forestal/plata-de-guia";
import { ForestCuentaDB } from "./forest-cuenta.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ingresosConCostoCongelado, mensajeCostoCongelado } from "./costo-congelado.db";
import { AdelantosDB } from "./adelantos.db";
import { ForestDirectorioDB } from "./forest-directorio.db";

/**
 * GuiaPlataDB — la plata de UNA guía de ingreso (ADR-437).
 *
 * Una guía = N asientos (`WoodEntry`, uno por especie, ADR-312) con el mismo
 * `gtfNumber`. Todo lo que se escribe acá se escribe **por guía y en una sola
 * transacción** con un advisory lock sobre (tenant, guía): la marca de servicio
 * nunca queda mezclada entre asientos, el costo de las especies cierra con la
 * factura, y el abono `madera` de la cuenta del proveedor sale en el mismo acto.
 *
 * Frenos de `WoodEntriesDB.setCosto` que se respetan: mes cerrado y costo
 * congelado en una corrida al cierre — sólo cuando el costo de un asiento
 * CAMBIA (anotar en la cuenta una guía de un mes cerrado no toca el libro).
 *
 * `tenantId` 1er parámetro. Nunca se enlaza por `providerDocument` (RUC de la ATFFS).
 */

const PREFIJOS_CACHE = ["wood-entries", "forest-contrato", "forest-cuenta"] as const;
const ESTADOS_MUERTOS = ["anulado", "rechazado"] as const;
const OPCIONES_TX = { timeout: 30_000, maxWait: 10_000 } as const;
/** Marca en `Expense.costCenter`: el gasto nació en una guía (además de `gtfNumber`). */
const CENTRO_DE_COSTO_GUIA = "forestal-guia";

export type CodigoPlataGuia =
  | "NO_ENCONTRADA"
  | "ES_MADERA_DE_SERVICIO"
  | "NO_ES_SERVICIO"
  | "TIENE_PAGOS"
  | "PERIODO_CERRADO"
  | "COSTO_CONGELADO"
  | "LINEAS_NO_COINCIDEN"
  | "CAMBIO_EN_EL_MEDIO"
  | "PARTE_NO_ENCONTRADA";

const STATUS_DE: Record<CodigoPlataGuia, 404 | 409 | 422> = {
  NO_ENCONTRADA: 404,
  ES_MADERA_DE_SERVICIO: 409,
  NO_ES_SERVICIO: 409,
  TIENE_PAGOS: 409,
  PERIODO_CERRADO: 409,
  COSTO_CONGELADO: 409,
  LINEAS_NO_COINCIDEN: 422,
  CAMBIO_EN_EL_MEDIO: 409,
  PARTE_NO_ENCONTRADA: 422,
};

/** Error de negocio con código y status HTTP: la ruta lo devuelve tal cual. */
export class PlataGuiaError extends Error {
  readonly status: 404 | 409 | 422;
  constructor(
    readonly code: CodigoPlataGuia,
    message: string,
  ) {
    super(message);
    this.name = "PlataGuiaError";
    this.status = STATUS_DE[code];
  }
}

export interface ActorPlata {
  username?: string | null;
}

type Tx = Prisma.TransactionClient;
type Visto = { id: string; antes: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | number | null | undefined): number | null => (v == null ? null : Number(v));
const dia = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "");
const usuarioDe = (a?: ActorPlata | null) => a?.username?.trim() || "unknown";

function leerDetalle(v: unknown): CostoDetalle | null {
  const p = costoDetalleSchema.safeParse(v);
  return p.success ? p.data : null;
}

function categoriaDe(category: string): CategoriaGastoGuia {
  const hit = CATEGORIAS_GASTO_GUIA.find((c) => CATEGORIA_GASTO_GUIA_LABEL[c] === category || c === category);
  return hit ?? "otro";
}

function metodoDe(v: string | null): MetodoPagoGuia | null {
  return v && (METODOS_PAGO as readonly string[]).includes(v) ? (v as MetodoPagoGuia) : null;
}

/**
 * Lock de la guía y, DESPUÉS, de las personas cuya cuenta se toca: la que ya
 * tiene el abono `madera` de la guía y las que se nombran (`partes`). Mismo
 * orden que la liquidación (guías → persona, `ForestCuentaDB.bloquear*EnTx`):
 * antes el modal tomaba sólo la guía y la liquidación sólo la persona, y un
 * pago podía validarse contra un abono que se estaba cambiando.
 */
async function lockGuia(tx: Tx, tenantId: string, gtfNumber: string, partes: ReadonlyArray<string | null | undefined> = []): Promise<void> {
  await ForestCuentaDB.bloquearGuiasEnTx(tx, tenantId, [gtfNumber]);
  const abono = await tx.forestCuentaMov.findFirst({
    where: { tenantId, gtfNumber, concepto: "madera", deletedAt: null },
    select: { parteId: true },
  });
  await ForestCuentaDB.bloquearPartesEnTx(tx, tenantId, [abono?.parteId, ...partes]);
}

/** Optimistic check: lo que el usuario vio sigue siendo lo que hay. */
function exigirVistos(vistos: readonly Visto[], actuales: ReadonlyArray<{ id: string; costoTotal: Prisma.Decimal | null }>): void {
  const porId = new Map(actuales.map((a) => [a.id, num(a.costoTotal)]));
  for (const v of vistos) {
    if (!porId.has(v.id)) continue;
    const hoy = porId.get(v.id) ?? null;
    const distinto = (hoy == null) !== (v.antes == null) || (hoy != null && v.antes != null && Math.abs(hoy - v.antes) > TOLERANCIA_SOLES);
    if (distinto) {
      throw new PlataGuiaError(
        "CAMBIO_EN_EL_MEDIO",
        "Alguien cambió el costo de esta guía mientras la mirabas. Vuelve a abrirla para ver lo último.",
      );
    }
  }
}

/** Frenos de `setCosto` para los asientos cuyo costo va a cambiar. */
async function exigirCostoEditable(
  tx: Tx,
  tenantId: string,
  gtfNumber: string,
  asientos: ReadonlyArray<{ id: string; entryDate: Date }>,
  cierres: CtpCierrePeriodo[],
): Promise<void> {
  for (const a of asientos) {
    const cerrado = closedPeriodOf(cierres, a.entryDate);
    if (cerrado) {
      throw new PlataGuiaError(
        "PERIODO_CERRADO",
        `El período ${cerrado.label} está cerrado: no se puede cambiar el costo de la guía ${gtfNumber}. Reabre el período para corregir.`,
      );
    }
  }
  const congelados = await ingresosConCostoCongelado(tx, tenantId, asientos.map((a) => a.id));
  if (congelados.size > 0) throw new PlataGuiaError("COSTO_CONGELADO", mensajeCostoCongelado(gtfNumber));
}

function invalidar(tenantId: string): void {
  for (const pref of PREFIJOS_CACHE) {
    try {
      invalidateByPrefix(`${pref}:${tenantId}`);
    } catch (err) {
      logger.warn("[guia-plata] no se pudo invalidar la caché", { error: String(err), pref });
    }
  }
}

function invalidarGastos(tenantId: string): void {
  // Mismo tag que `FinanceDB` (Mi Plata / flujo de caja): un gasto nuevo tiene que verse ahí.
  for (const tag of [`tenant:${tenantId}:expenses`, `tenant:${tenantId}:cash-flow`]) {
    import("next/cache")
      .then(({ revalidateTag }) => {
        try {
          revalidateTag(tag, "max");
        } catch {
          /* fuera de un request de Next (script/test): no hay caché que invalidar */
        }
      })
      .catch((err) => logger.warn("[guia-plata] revalidateTag falló", { error: String(err), tag }));
  }
}

function aGasto(r: Prisma.ExpenseGetPayload<Record<string, never>>): GastoGuia {
  return {
    id: r.id,
    gtfNumber: r.gtfNumber ?? "",
    categoria: categoriaDe(r.category),
    monto: Number(r.amount),
    fecha: dia(r.date),
    metodo: metodoDe(r.paymentMethod),
    pagado: r.paidAt != null,
    pagadoA: r.supplierName ?? null,
    notas: r.notes ?? null,
  };
}

export const GuiaPlataDB = {
  /**
   * Todo lo que el modal necesita de UNA guía. `null` si la guía no existe en
   * este tenant (ningún asiento vivo con ese número).
   */
  async leer(tenantId: string, gtfNumber: string): Promise<PlataDeGuiaDTO | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = gtfNumber.trim();
    if (!gtf) return null;

    const asientos = await prisma.woodEntry.findMany({
      where: { tenantId, gtfNumber: gtf, deletedAt: null },
      orderBy: [{ entryDate: "asc" }, { id: "asc" }],
    });
    if (asientos.length === 0) return null;
    const vivos = asientos.filter((a) => !(ESTADOS_MUERTOS as readonly string[]).includes(a.status));
    const base = vivos.length > 0 ? vivos : asientos;
    const contratoId = base.find((a) => a.contratoId)?.contratoId ?? null;

    const [contrato, cierres, congelados, partes, cuentaRow, fletes, gastos] = await Promise.all([
      contratoId
        ? prisma.forestContrato.findFirst({
            where: { id: contratoId, tenantId },
            select: { id: true, codigo: true, titularNombre: true, titularId: true },
          })
        : Promise.resolve(null),
      ForestCtpCierreDB.list(tenantId),
      ingresosConCostoCongelado(prisma, tenantId, base.map((a) => a.id)),
      prisma.forestParty.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, nombre: true, activo: true, condicionPago: true, diasCredito: true },
        take: 5000,
      }),
      prisma.forestCuentaMov.findFirst({ where: { tenantId, gtfNumber: gtf, concepto: "madera", deletedAt: null } }),
      prisma.forestFlete.findMany({ where: { tenantId, gtfNumber: gtf, deletedAt: null }, orderBy: { fecha: "asc" } }),
      prisma.expense.findMany({ where: { tenantId, gtfNumber: gtf }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    ]);

    const lineas: LineaPlataDTO[] = base.map((a) => ({
      id: a.id,
      speciesCommonName: a.speciesCommonName,
      productType: String(a.productType),
      volumeM3: Number(a.volumeM3),
      pieces: a.pieces,
      status: a.status,
      entryDate: dia(a.entryDate),
      costoTotal: num(a.costoTotal),
      costoDetalle: leerDetalle(a.costoDetalle),
      ptDerivado: ptDeLinea({ volumeM3: Number(a.volumeM3), productType: String(a.productType) }),
      congelado: congelados.has(a.id),
      periodoCerrado: closedPeriodOf(cierres, a.entryDate) != null,
    }));

    const servicio = base.some((a) => a.maderaDeTercero);
    const mezclada = servicio && base.some((a) => !a.maderaDeTercero);
    const conDueno = base.find((a) => a.maderaDeTercero && (a.duenoParteId || a.duenoNombre));
    const dueno = conDueno ? { parteId: conDueno.duenoParteId ?? null, nombre: conDueno.duenoNombre ?? "—" } : null;

    // Sugerencia de dueño: sólo si todavía no es de servicio y hay permiso.
    let sugerido: PlataDeGuiaDTO["duenoSugerido"] = null;
    if (!servicio && contratoId) {
      const [otras, corridas] = await Promise.all([
        prisma.woodEntry.findMany({
          where: {
            tenantId,
            contratoId,
            deletedAt: null,
            gtfNumber: { not: gtf },
            status: { notIn: [...ESTADOS_MUERTOS] },
          },
          select: { gtfNumber: true, maderaDeTercero: true, duenoParteId: true, duenoNombre: true },
          distinct: ["gtfNumber"],
          take: 2000,
        }),
        prisma.forestCtpEntry.findMany({
          where: { tenantId, contratoId, deletedAt: null, status: { not: "anulado" } },
          select: { duenoMadera: true, duenoParteId: true, titularNombre: true },
          take: 5000,
        }),
      ]);
      sugerido = duenoSugerido(otras, corridas);
    }

    const proveedor = servicio
      ? null
      : proveedorDeLaGuia(
          {
            enlaceParteId: base.find((a) => a.proveedorParteId)?.proveedorParteId ?? null,
            titularId: contrato?.titularId ?? null,
            providerName: base[0]?.providerName ?? null,
          },
          partes,
        );

    const requieren = servicio ? [] : vivos;
    const conCosto = requieren.filter((a) => a.costoTotal != null);
    const totalMadera = conCosto.length > 0 ? r2(conCosto.reduce((t, a) => t + Number(a.costoTotal), 0)) : null;
    const sinCosto = requieren.length - conCosto.length;

    const cuenta = cuentaRow
      ? {
          movimientoId: cuentaRow.id,
          parteId: cuentaRow.parteId,
          parteNombre: cuentaRow.parteNombre,
          monto: Number(cuentaRow.monto),
          fecha: cuentaRow.fecha.toISOString(),
        }
      : null;

    // Estado de pago: con TODA la cuenta de la parte (todas sus guías), porque
    // los pagos sin guía cubren por antigüedad. La MISMA lectura (sin tope de
    // filas) que el aviso «sin pagar» y el filtro de Ingresos.
    let pago: PlataDeGuiaDTO["pago"] = null;
    if (cuenta && !servicio) {
      const { estados } = await estadosDePagoDeTodasLasGuias(tenantId, [cuenta.parteId]);
      pago = estados.find((e) => e.gtfNumber === gtf) ?? null;
    }

    const personaParteId = cuenta?.parteId ?? (proveedor?.seguro ? proveedor.parteId : null);
    const persona = personaParteId ? await this.resumenPersona(tenantId, personaParteId).catch((err) => {
      logger.warn("[guia-plata] no se pudo armar la cuenta de la persona", { error: String(err), tenantId });
      return null;
    }) : null;

    const gastosDto = gastos.map(aGasto);
    const fletesDto = fletes.map((f) => ({
      id: f.id,
      fecha: dia(f.fecha),
      tipo: f.tipo,
      monto: num(f.monto),
      pagaQuien: f.pagaQuien,
      estadoPago: f.estadoPago,
      transportistaNombre: f.transportistaNombre ?? null,
      placa: f.placa ?? null,
    }));
    const volumen = vivos.reduce((t, a) => t + Number(a.volumeM3), 0);
    const costoPuesto = costoPuestoEnPatio({
      esServicio: servicio,
      madera: sinCosto === 0 ? totalMadera : null,
      volumenM3: volumen,
      fletes: fletesDto,
      gastos: gastosDto,
    });

    const cerrada = lineas.find((l) => l.periodoCerrado && !(ESTADOS_MUERTOS as readonly string[]).includes(l.status));
    /* Todos sus asientos anulados o rechazados: se muestran para leer, pero
       nada se guarda (el PUT respondería NO_ENCONTRADA y el modal ofrecía
       «Guardar el costo» sobre una guía muerta — QA 26-09). */
    const bloqueo: PlataDeGuiaDTO["bloqueo"] = vivos.length === 0
      ? {
          codigo: "GUIA_ANULADA",
          mensaje: "Esta guía está anulada: su plata se puede ver, pero no cambiar.",
        }
      : cerrada
      ? {
          codigo: "PERIODO_CERRADO",
          mensaje: `El mes de la guía está cerrado: el costo no se puede cambiar. Reabre el período para corregir.`,
        }
      : lineas.some((l) => l.congelado)
        ? { codigo: "COSTO_CONGELADO", mensaje: mensajeCostoCongelado(gtf) }
        : null;

    return {
      gtfNumber: gtf,
      tipo: servicio ? "servicio" : "compra",
      lineas,
      mezclada,
      dueno,
      duenoSugerido: sugerido,
      contrato: contrato
        ? { id: contrato.id, codigo: contrato.codigo, titularNombre: contrato.titularNombre, titularId: contrato.titularId ?? null }
        : null,
      proveedor,
      totalMadera: servicio ? null : totalMadera,
      sinCosto,
      cuenta,
      pago,
      persona,
      fletes: fletesDto,
      gastos: gastosDto,
      costoPuesto,
      bloqueo,
    };
  },

  /**
   * «¿Cuánto le debo?» con la MISMA cuenta que «Cuenta por persona»
   * (`unificarCuentas`, ADR-437 §5): mismas uniones por id y por documento.
   */
  async resumenPersona(tenantId: string, parteId: string): Promise<ResumenPersona | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const [beneficiarios, saldos, partes, movimientos] = await Promise.all([
      AdelantosDB.listBeneficiarios(tenantId),
      AdelantosDB.saldosPorPersona(tenantId),
      prisma.forestParty.findMany({
        where: { tenantId },
        select: { id: true, nombre: true, docNumero: true, telefono: true },
        take: 5000,
      }),
      /* Sin tope: «¿cuánto le debo?» no sale de una lista cortada en 2000. */
      ForestCuentaDB.movimientosDeParte(tenantId, parteId),
    ]);
    const filas = unificarCuentas({
      beneficiarios: beneficiarios.map((b) => ({
        id: b.id,
        nombre: b.nombre,
        documento: b.documento ?? null,
        telefono: b.telefono ?? null,
        forestPartyId: b.forestPartyId ?? null,
      })),
      adelantos: saldos.map((g) => ({
        beneficiarioId: g.beneficiarioId,
        status: g.status,
        saldoPendiente: g.saldoPendiente,
        moneda: g.moneda,
        cantidad: g.cantidad,
      })),
      partes,
      movimientos,
    });
    const fila = filas.find((f) => f.parteId === parteId);
    const nombre = fila?.nombre ?? partes.find((p) => p.id === parteId)?.nombre ?? "—";
    const madera = fila?.madera?.saldo ?? 0;
    const adel = fila?.adelantos ? r2(fila.adelantos.teDebe - fila.adelantos.aFavorSuyo) : null;
    return {
      parteId,
      nombre,
      porGuias: r2(-madera),
      deAdelantos: adel,
      neto: fila?.neto ?? r2(madera),
    };
  },

  /** Punto único de escritura del modal: servicio o compra. */
  async guardar(tenantId: string, input: GuardarPlataGuiaInput, auth: ActorPlata): Promise<PlataDeGuiaDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    if (input.tipo === "servicio") {
      return this.marcarServicio(tenantId, { gtfNumber: input.gtfNumber, duenoParteId: input.duenoParteId, vistos: input.vistos }, auth);
    }
    if (input.tipo === "quitar_servicio") {
      return this.quitarServicio(tenantId, { gtfNumber: input.gtfNumber, vistos: input.vistos }, auth);
    }
    return this.guardarCompra(tenantId, input, auth);
  },

  /**
   * Guarda el costo de una guía de COMPRA: el costo de cada asiento, su acta,
   * a quién se le paga y —si se pide— el abono `madera` en su cuenta. Todo o
   * nada, en una transacción.
   */
  async guardarCompra(tenantId: string, input: GuardarCompraInput, auth: ActorPlata): Promise<PlataDeGuiaDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = input.gtfNumber.trim();
    const usuario = usuarioDe(auth);
    const cierres = await ForestCtpCierreDB.list(tenantId);

    const proveedor = input.proveedorParteId
      ? await prisma.forestParty.findFirst({
          where: { id: input.proveedorParteId, tenantId, deletedAt: null },
          select: { id: true, nombre: true },
        })
      : null;
    if (input.proveedorParteId && !proveedor) {
      throw new PlataGuiaError("PARTE_NO_ENCONTRADA", "Esa persona no está en el directorio de este negocio.");
    }

    const r = await prisma.$transaction(async (tx) => {
      await lockGuia(tx, tenantId, gtf, [proveedor?.id]);
      const asientos = await tx.woodEntry.findMany({
        where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { notIn: [...ESTADOS_MUERTOS] } },
        orderBy: [{ entryDate: "asc" }, { id: "asc" }],
      });
      if (asientos.length === 0) throw new PlataGuiaError("NO_ENCONTRADA", `La guía ${gtf} no tiene asientos vivos.`);
      if (asientos.some((a) => a.maderaDeTercero)) {
        throw new PlataGuiaError(
          "ES_MADERA_DE_SERVICIO",
          `La guía ${gtf} es madera de servicio: no lleva costo. Quítale la marca de servicio si en realidad la compraste.`,
        );
      }
      const ids = new Set(asientos.map((a) => a.id));
      const pedidos = new Set(input.lineas.map((l) => l.woodEntryId));
      if (ids.size !== pedidos.size || [...pedidos].some((id) => !ids.has(id))) {
        throw new PlataGuiaError(
          "LINEAS_NO_COINCIDEN",
          "Las especies de la guía cambiaron desde que la abriste. Vuelve a abrirla: el costo tiene que cubrir todos sus asientos.",
        );
      }
      exigirVistos(input.vistos, asientos);

      const porId = new Map(asientos.map((a) => [a.id, a]));
      const cambian = input.lineas.filter((l) => {
        const a = porId.get(l.woodEntryId)!;
        const antes = num(a.costoTotal);
        return antes == null || Math.abs(antes - l.costoTotal) > TOLERANCIA_SOLES;
      });
      await exigirCostoEditable(
        tx,
        tenantId,
        gtf,
        cambian.map((l) => porId.get(l.woodEntryId)!),
        cierres,
      );

      for (const l of input.lineas) {
        const res = await tx.woodEntry.updateMany({
          where: { id: l.woodEntryId, tenantId, deletedAt: null, maderaDeTercero: false },
          data: {
            costoTotal: new Prisma.Decimal(l.costoTotal.toFixed(2)),
            moneda: "PEN",
            costoDetalle: l.detalle as Prisma.InputJsonValue,
            proveedorParteId: proveedor?.id ?? null,
          },
        });
        if (res.count !== 1) throw new Error(`No se pudo escribir el costo del asiento ${l.woodEntryId}`);
      }

      const total = r2(input.lineas.reduce((t, l) => t + l.costoTotal, 0));
      let cuenta: "anotada" | "actualizada" | "quitada" | "sin_cambio" = "sin_cambio";
      if (input.anotarEnCuenta && proveedor && total > 0) {
        const { antes } = await ForestCuentaDB.upsertMaderaDeGuiaEnTx(
          tx,
          tenantId,
          {
            gtfNumber: gtf,
            parteId: proveedor.id,
            parteNombre: proveedor.nombre,
            monto: total,
            fecha: asientos[0].entryDate,
            contratoId: asientos.find((a) => a.contratoId)?.contratoId ?? null,
          },
          usuario,
        );
        cuenta = antes ? "actualizada" : "anotada";
      } else {
        const bajas = await ForestCuentaDB.bajaMaderaDeGuiaEnTx(tx, tenantId, gtf, { exigirSinPagos: true });
        if (bajas > 0) cuenta = "quitada";
      }
      return { asientos, total, cuenta, cambian };
    }, OPCIONES_TX);

    const porId = new Map(r.asientos.map((a) => [a.id, a]));
    await Promise.all(
      r.cambian.map((l) => {
        const a = porId.get(l.woodEntryId)!;
        const antes = a.costoTotal != null ? `S/ ${Number(a.costoTotal).toFixed(2)}` : "sin costo";
        return auditCtpEsperando({
          tenantId,
          action: "ctp_ingreso_costo",
          entity: "WoodEntry",
          entityId: a.id,
          detail: `Valorizó el ingreso ${gtf} · ${a.speciesCommonName} · ${antes} → S/ ${l.costoTotal.toFixed(2)} (${l.detalle.modo === "especie" ? "precio por especie" : "reparto del total"}; factura S/ ${input.totalFactura.toFixed(2)})`,
          user: usuario,
        });
      }),
    );
    if (r.cuenta !== "sin_cambio") {
      await auditCtpEsperando({
        tenantId,
        action: r.cuenta === "quitada" ? "ctp_cuenta_delete" : r.cuenta === "anotada" ? "ctp_cuenta_create" : "ctp_cuenta_update",
        entity: "ForestCuentaMov",
        entityId: gtf,
        detail:
          r.cuenta === "quitada"
            ? `Quitó de la cuenta la madera de la guía ${gtf}`
            : `${r.cuenta === "anotada" ? "Anotó" : "Actualizó"} la madera de la guía ${gtf} en la cuenta de ${proveedor?.nombre ?? "—"}: S/ ${r.total.toFixed(2)}`,
        user: usuario,
      });
    }
    invalidar(tenantId);
    const dto = await this.leer(tenantId, gtf);
    if (!dto) throw new PlataGuiaError("NO_ENCONTRADA", `La guía ${gtf} no existe.`);
    return dto;
  },

  /**
   * Marca la guía como MADERA DE SERVICIO de `duenoParteId`: en TODOS sus
   * asientos vivos, en una transacción (nunca queda mezclada). El costo pasa a
   * `null` (nunca 0) y el abono `madera` de la cuenta se da de baja — salvo que
   * la guía tenga pagos imputados (409 `TIENE_PAGOS`). Si algún asiento tenía
   * costo, aplican los frenos de mes cerrado y congelado.
   *
   * La usa el script de migración de Blas (auditoría + invalidación incluidas).
   */
  async marcarServicio(
    tenantId: string,
    input: { gtfNumber: string; duenoParteId: string; vistos?: Visto[] },
    auth?: ActorPlata,
  ): Promise<PlataDeGuiaDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = input.gtfNumber.trim();
    const usuario = usuarioDe(auth);
    const dueno = await prisma.forestParty.findFirst({
      where: { id: input.duenoParteId, tenantId, deletedAt: null },
      select: { id: true, nombre: true },
    });
    if (!dueno) throw new PlataGuiaError("PARTE_NO_ENCONTRADA", "El dueño tiene que ser una ficha del directorio de este negocio.");
    const cierres = await ForestCtpCierreDB.list(tenantId);

    const r = await prisma.$transaction(async (tx) => {
      await lockGuia(tx, tenantId, gtf, [dueno.id]);
      const asientos = await tx.woodEntry.findMany({
        where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { notIn: [...ESTADOS_MUERTOS] } },
        select: { id: true, entryDate: true, costoTotal: true, maderaDeTercero: true, duenoParteId: true, speciesCommonName: true },
      });
      if (asientos.length === 0) throw new PlataGuiaError("NO_ENCONTRADA", `La guía ${gtf} no tiene asientos vivos.`);
      exigirVistos(input.vistos ?? [], asientos);
      const conCosto = asientos.filter((a) => a.costoTotal != null);
      if (conCosto.length > 0) await exigirCostoEditable(tx, tenantId, gtf, conCosto, cierres);
      const bajas = await ForestCuentaDB.bajaMaderaDeGuiaEnTx(tx, tenantId, gtf, { exigirSinPagos: true });
      const { count } = await tx.woodEntry.updateMany({
        where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { notIn: [...ESTADOS_MUERTOS] } },
        data: {
          maderaDeTercero: true,
          duenoParteId: dueno.id,
          duenoNombre: dueno.nombre,
          costoTotal: null,
          costoDetalle: Prisma.DbNull,
          proveedorParteId: null,
        },
      });
      if (count !== asientos.length) throw new Error(`La guía ${gtf} cambió durante el guardado; no se marcó.`);
      const yaEra = asientos.every((a) => a.maderaDeTercero && a.duenoParteId === dueno.id);
      return { asientos, bajas, conCosto, yaEra };
    }, OPCIONES_TX);

    if (!r.yaEra || r.bajas > 0 || r.conCosto.length > 0) {
      const costo = r.conCosto.length > 0
        ? ` · se quitó el costo de ${r.conCosto.length} asiento(s) (S/ ${r2(r.conCosto.reduce((t, a) => t + Number(a.costoTotal), 0)).toFixed(2)})`
        : "";
      await Promise.all(
        r.asientos.map((a) =>
          auditCtpEsperando({
            tenantId,
            action: "ctp_ingreso_update",
            entity: "WoodEntry",
            entityId: a.id,
            detail: `Marcó la guía ${gtf} (${a.speciesCommonName}) como madera de servicio de ${dueno.nombre}${costo}${r.bajas > 0 ? " · se quitó de la cuenta del proveedor" : ""}`,
            user: usuario,
          }),
        ),
      );
    }
    invalidar(tenantId);
    const dto = await this.leer(tenantId, gtf);
    if (!dto) throw new PlataGuiaError("NO_ENCONTRADA", `La guía ${gtf} no existe.`);
    return dto;
  },

  /**
   * Quita la marca de servicio (la guía era, en realidad, una compra). Queda sin
   * costo: se valoriza después como cualquier compra. No escribe costo, así que
   * no la frena el mes cerrado.
   */
  async quitarServicio(tenantId: string, input: { gtfNumber: string; vistos?: Visto[] }, auth?: ActorPlata): Promise<PlataDeGuiaDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = input.gtfNumber.trim();
    const usuario = usuarioDe(auth);
    const r = await prisma.$transaction(async (tx) => {
      await lockGuia(tx, tenantId, gtf);
      const asientos = await tx.woodEntry.findMany({
        where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { notIn: [...ESTADOS_MUERTOS] } },
        select: { id: true, costoTotal: true, maderaDeTercero: true, duenoNombre: true, speciesCommonName: true },
      });
      if (asientos.length === 0) throw new PlataGuiaError("NO_ENCONTRADA", `La guía ${gtf} no tiene asientos vivos.`);
      if (!asientos.some((a) => a.maderaDeTercero)) {
        throw new PlataGuiaError("NO_ES_SERVICIO", `La guía ${gtf} no está marcada como madera de servicio.`);
      }
      exigirVistos(input.vistos ?? [], asientos);
      await tx.woodEntry.updateMany({
        where: { tenantId, gtfNumber: gtf, deletedAt: null, status: { notIn: [...ESTADOS_MUERTOS] } },
        data: { maderaDeTercero: false, duenoParteId: null, duenoNombre: null },
      });
      return asientos;
    }, OPCIONES_TX);
    await Promise.all(
      r.map((a) =>
        auditCtpEsperando({
          tenantId,
          action: "ctp_ingreso_update",
          entity: "WoodEntry",
          entityId: a.id,
          detail: `Quitó la marca de madera de servicio de la guía ${gtf} (${a.speciesCommonName}; era de ${a.duenoNombre ?? "—"}): vuelve a pedir costo`,
          user: usuario,
        }),
      ),
    );
    invalidar(tenantId);
    const dto = await this.leer(tenantId, gtf);
    if (!dto) throw new PlataGuiaError("NO_ENCONTRADA", `La guía ${gtf} no existe.`);
    return dto;
  },

  // ── Gastos de la guía (estiba, descarga…): `Expense` con `gtfNumber` ──

  async listarGastos(tenantId: string, gtfNumber: string): Promise<GastoGuia[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.expense.findMany({
      where: { tenantId, gtfNumber: gtfNumber.trim() },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(aGasto);
  },

  /**
   * Alta o corrección de un gasto de la guía. Es un `Expense` de verdad: entra
   * al P&L y a Mi Plata como cualquier gasto — por eso NUNCA se suma al
   * `costoTotal` de la madera (doble conteo). `pagado` = salió de la caja ese día.
   */
  async guardarGasto(tenantId: string, input: GastoGuiaInput, auth: ActorPlata): Promise<GastoGuia> {
    if (!tenantId) throw new Error("tenantId is required");
    const gtf = input.gtfNumber.trim();
    const usuario = usuarioDe(auth);
    const guia = await prisma.woodEntry.findFirst({
      where: { tenantId, gtfNumber: gtf, deletedAt: null },
      select: { id: true, contratoId: true },
      orderBy: { entryDate: "asc" },
    });
    if (!guia) throw new PlataGuiaError("NO_ENCONTRADA", `La guía ${gtf} no existe en este negocio.`);
    const fecha = new Date(`${input.fecha}T12:00:00.000Z`);
    const label = CATEGORIA_GASTO_GUIA_LABEL[input.categoria];
    const datos = {
      category: label,
      description: `${label} · guía ${gtf}`,
      amount: new Prisma.Decimal(input.monto.toFixed(2)),
      date: fecha,
      recurring: false,
      paymentMethod: input.metodo,
      supplierName: input.pagadoA?.trim() || null,
      notes: input.notas?.trim() || null,
      costCenter: CENTRO_DE_COSTO_GUIA,
      gtfNumber: gtf,
      contratoId: guia.contratoId ?? null,
      paidAt: input.pagado ? fecha : null,
    };

    let row: Prisma.ExpenseGetPayload<Record<string, never>>;
    let antes: GastoGuia | null = null;
    if (input.id) {
      const actual = await prisma.expense.findFirst({ where: { id: input.id, tenantId, gtfNumber: { not: null } } });
      if (!actual) throw new PlataGuiaError("NO_ENCONTRADA", "Ese gasto no existe o no es de una guía.");
      antes = aGasto(actual);
      const res = await prisma.expense.updateMany({ where: { id: actual.id, tenantId }, data: datos });
      if (res.count !== 1) throw new PlataGuiaError("NO_ENCONTRADA", "Ese gasto ya no existe.");
      row = (await prisma.expense.findFirst({ where: { id: actual.id, tenantId } }))!;
    } else {
      row = await prisma.expense.create({ data: { tenantId, ...datos, createdBy: usuario } });
    }
    const gasto = aGasto(row);
    await auditCtpEsperando({
      tenantId,
      action: "ctp_ingreso_costo",
      entity: "WoodEntry",
      entityId: guia.id,
      detail: antes
        ? `Corrigió un gasto de la guía ${gtf} (gasto ${row.id}): ${CATEGORIA_GASTO_GUIA_LABEL[antes.categoria]} S/ ${antes.monto.toFixed(2)} → ${label} S/ ${gasto.monto.toFixed(2)}`
        : `Anotó un gasto de la guía ${gtf} (gasto ${row.id}): ${label} S/ ${gasto.monto.toFixed(2)}${gasto.pagado ? ` pagado (${gasto.metodo ?? "sin método"})` : " por pagar"}`,
      user: usuario,
    });
    invalidar(tenantId);
    invalidarGastos(tenantId);
    return gasto;
  },

  /** Borra un gasto de guía (los `Expense` no tienen baja lógica). `false` si no existía. */
  async eliminarGasto(tenantId: string, id: string, auth: ActorPlata): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const actual = await prisma.expense.findFirst({ where: { id, tenantId, gtfNumber: { not: null } } });
    if (!actual) return false;
    const res = await prisma.expense.deleteMany({ where: { id, tenantId, gtfNumber: { not: null } } });
    if (res.count !== 1) return false;
    const g = aGasto(actual);
    const guia = await prisma.woodEntry.findFirst({
      where: { tenantId, gtfNumber: g.gtfNumber, deletedAt: null },
      select: { id: true },
    });
    await auditCtpEsperando({
      tenantId,
      action: "ctp_ingreso_costo",
      entity: "WoodEntry",
      entityId: guia?.id ?? id,
      detail: `Borró un gasto de la guía ${g.gtfNumber} (gasto ${id}): ${CATEGORIA_GASTO_GUIA_LABEL[g.categoria]} S/ ${g.monto.toFixed(2)} del ${g.fecha}`,
      user: usuarioDe(auth),
    });
    invalidar(tenantId);
    invalidarGastos(tenantId);
    return true;
  },

  /**
   * «3 guías sin pagar a Nelly · S/ 12 400» (ADR-437 §10): una fila por parte
   * con guías de compra anotadas y no cubiertas. Sin tope de filas en los
   * movimientos de esas partes: un estado de pago no sale de una lista cortada.
   */
  async sinPagarPorParte(tenantId: string): Promise<GuiasSinPagarDeParte[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const { estados, partes } = await estadosDePagoDeTodasLasGuias(tenantId);
    return guiasSinPagarPorParte(estados, partes, limaDateKey(new Date()));
  },

  /**
   * El estado de pago de CADA guía de compra, por `gtfNumber` (el filtro
   * `pago=sin-pagar|pagada` de Ingresos, ADR-437 §10): MISMA cuenta que
   * `sinPagarPorParte`, sin recalcular nada — una guía de servicio nunca
   * aparece acá porque nunca tiene abono `madera`.
   */
  async estadoPagoPorGuia(tenantId: string): Promise<Map<string, EstadoPago>> {
    if (!tenantId) throw new Error("tenantId is required");
    const { estados } = await estadosDePagoDeTodasLasGuias(tenantId);
    return new Map(estados.map((e) => [e.gtfNumber, e.estado]));
  },

  /**
   * La cuenta del proveedor dentro del modal (pedido 26-09): el neto de
   * `unificarCuentas` (la fila de «Cuenta por persona», mismas uniones que
   * `resumenPersona`) y las líneas de `estadoCuentaUnificado` (el estado de
   * cuenta del PDF y el WhatsApp). Sólo lectura; sin tope en la cuenta
   * forestal. `null` = la parte no es de este negocio (ni ficha ni movimientos).
   */
  async cuentaDeParte(tenantId: string, parteId: string): Promise<CuentaDeGuiaDTO | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const [beneficiarios, saldos, partes, movimientos] = await Promise.all([
      AdelantosDB.listBeneficiarios(tenantId),
      AdelantosDB.saldosPorPersona(tenantId),
      /* La MISMA lista que «Cuenta por persona» (`/api/adelantos/cuentas`):
         con inactivos y sin las borradas. Con otra lista la unión podía juntar
         distinto y el neto del modal no ser el de esa fila. */
      ForestDirectorioDB.listarPartes(tenantId, { incluirInactivos: true }),
      ForestCuentaDB.movimientosDeParte(tenantId, parteId),
    ]);
    const ficha = partes.find((p) => p.id === parteId);
    if (!ficha && movimientos.length === 0) return null;
    const fila = unificarCuentas({
      beneficiarios: beneficiarios.map((b) => ({
        id: b.id,
        nombre: b.nombre,
        documento: b.documento ?? null,
        telefono: b.telefono ?? null,
        forestPartyId: b.forestPartyId ?? null,
      })),
      adelantos: saldos.map((g) => ({
        beneficiarioId: g.beneficiarioId,
        status: g.status,
        saldoPendiente: g.saldoPendiente,
        moneda: g.moneda,
        cantidad: g.cantidad,
      })),
      partes: partes.map((p) => ({ id: p.id, nombre: p.nombre, docNumero: p.docNumero, telefono: p.telefono })),
      movimientos,
    }).find((f) => f.parteId === parteId);
    const beneficiarioId = fila?.beneficiarioId ?? null;
    const adelantos = beneficiarioId ? await AdelantosDB.list(tenantId, { beneficiarioId }) : [];
    const lineas = estadoCuentaUnificado(
      adelantos.map((a) => ({
        status: a.status,
        codigoOperacion: a.codigoOperacion ?? null,
        fechaAdelanto: a.fechaAdelanto,
        montoAdelantado: a.montoAdelantado,
        moneda: a.moneda,
        entregas: a.entregas.map((e) => ({ fecha: e.fecha, descripcion: e.descripcion ?? null, valor: e.valor })),
      })),
      movimientos,
    );
    const maderaSaldo = r2(movimientos.reduce((t, m) => (m.moneda && m.moneda !== "PEN" ? t : t + (m.tipo === "cargo" ? m.monto : -m.monto)), 0));
    return armarCuentaDeGuia({
      parteId,
      nombre: fila?.nombre ?? ficha?.nombre ?? movimientos.at(-1)?.parteNombre ?? "—",
      beneficiarioId,
      neto: fila?.neto ?? maderaSaldo,
      adelantado: fila?.adelantos ? r2(fila.adelantos.teDebe - fila.adelantos.aFavorSuyo) : null,
      otrasMonedas: fila?.otrasMonedas ?? {},
      lineas,
      dia: claveDia,
    });
  },
};

/**
 * Lo que necesitan `sinPagarPorParte`, `estadoPagoPorGuia` y el modal de la
 * guía (`leer`, con `soloPartes`): un solo viaje a la cuenta, SIN tope de
 * filas. Una sola lectura para las tres pantallas: con dos (una con `take:
 * 2000`) el modal y la tira podían decir cosas distintas de la misma guía.
 */
async function estadosDePagoDeTodasLasGuias(
  tenantId: string,
  soloPartes?: readonly string[],
): Promise<{ estados: EstadoPagoGuia[]; partes: Array<{ id: string; nombre: string; condicionPago: string | null; diasCredito: number | null }> }> {
  const parteIds = soloPartes
    ? [...new Set(soloPartes)]
    : (
        await prisma.forestCuentaMov.findMany({
          where: { tenantId, concepto: "madera", tipo: "abono", deletedAt: null, gtfNumber: { not: null } },
          select: { parteId: true },
          distinct: ["parteId"],
        })
      ).map((m) => m.parteId);
  if (parteIds.length === 0) return { estados: [], partes: [] };
  const [movs, partes] = await Promise.all([
    prisma.forestCuentaMov.findMany({
      where: { tenantId, parteId: { in: parteIds }, deletedAt: null },
      select: { parteId: true, tipo: true, concepto: true, monto: true, gtfNumber: true, fecha: true },
    }),
    prisma.forestParty.findMany({
      where: { tenantId, id: { in: parteIds } },
      select: { id: true, nombre: true, condicionPago: true, diasCredito: true },
    }),
  ]);
  const lista = movs.map((m) => ({
    parteId: m.parteId,
    tipo: m.tipo as "cargo" | "abono",
    concepto: m.concepto,
    monto: Number(m.monto),
    gtfNumber: m.gtfNumber,
    fecha: dia(m.fecha),
  }));
  const guias = lista
    .filter((m) => m.concepto === "madera" && m.tipo === "abono" && m.gtfNumber)
    .map((m) => ({ gtfNumber: m.gtfNumber!, parteId: m.parteId, fecha: m.fecha, monto: m.monto }));
  return { estados: estadoDePagoDeGuias(guias, lista), partes };
}
