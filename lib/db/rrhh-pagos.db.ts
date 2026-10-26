import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import { conceptoDelPeriodo } from "@/lib/adelantos/planilla-lote";
import { invalidarVentasOverview } from "@/lib/caja/invalidar-ventas-overview";
import { etiquetaGasto, etiquetaGastoBorrado, idDevolucionDeGasto, idRetiroDeGasto } from "@/lib/caja/egreso-de-caja";
import { descuentoEsDelPeriodo, periodoDelDescuento } from "@/lib/rrhh/descuentos-planilla";
import { dateDeFechaKey, fechaKeyDeDate, semanaDe, sumarDias } from "@/lib/rrhh/fechas";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  TIPO_AVISO_PAGO_SABADO,
  calcularPagoSemana,
  diferenciaDelPago,
  filtroDeMarcas,
  llaveDeMarca,
  marcaDelPago,
  notaDelPago,
  prefijoDescuentosDelPago,
  textoDelAvisoDelSabado,
  tipoDePago,
  totalesDeLaSemana,
  type AdelantoDeLaSemanaDTO,
  type AdelantoParaPago,
  type CalculoPago,
  type FilaPagoSemanaDTO,
  type PagoHechoDTO,
  type PagoSemanaDTO,
} from "@/lib/rrhh/pago-semana";
import { tarifaVigente } from "@/lib/rrhh/ganado";
import { descuentoDelAdelanto, primerSabadoDesde, type DescuentoDelAdelanto } from "@/lib/rrhh/adelanto-rrhh";
import type { FechaKey, Modalidad } from "@/lib/rrhh/tipos";
import { AdelantosDB, DescuentoDePlanillaError } from "./adelantos.db";
import { CashRegistersMovementsDB } from "./cash-registers-movements.db";
import { anotarEnCajaAbiertaEnTx, GastoConCajaDB, revalidarTrasEgreso } from "./gasto-con-caja.db";
import { NotificationCenterDB, type ResultadoSincronizar } from "./notification-center.db";
import { GanadoDB } from "./rrhh-ganado.db";
import { ColaboradoresDB } from "./rrhh-colaboradores.db";

/**
 * PagosSemanaDB — el pago del sábado de RRHH › Asistencia (Brandon 24-10).
 *
 * Sin tabla nueva: el pago ES un gasto «Personal» de Mi Plata con la marca
 * `recibo RRHH-<lunes>-<colaboradorId>` (una por persona y semana), y cada
 * adelanto descontado es una entrega de planilla con la clave
 * `rrhh-pago:<gastoId>:<adelantoId>`. El gasto lleva lo ganado (el costo del
 * sueldo); el adelanto ya era un anticipo, así que descontarlo no es otro gasto.
 *
 * Orden de locks de `pagar` y `deshacer`: el colaborador (`FOR UPDATE`, turna
 * dos clics), sus adelantos (`FOR UPDATE`, por id) y la caja (`FOR SHARE`) al
 * final, pegada al commit — el mismo orden global de `lib/adelantos/movimiento-caja.ts`.
 *
 * Lo que la marca NO cubre (y pediría la tabla `PagoColaborador`, ver reporte
 * 24-10): un pago sin descuentos cuyo gasto se borra a mano en Mi Plata deja la
 * semana como «por pagar». Con descuentos, sí se detecta (`pago_sin_gasto`).
 */

/** Error de negocio del pago, con su código HTTP (la ruta lo pasa tal cual). */
export class PagoSemanaError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 422,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PagoSemanaError";
  }
}

export interface PagarInput {
  colaboradorId: string;
  /** El lunes de la semana. */
  desde: FechaKey;
  /** Sólo si le falta definir el pago (sin tarifa): el monto que escribió el dueño. */
  montoManual?: number | null;
  metodo: "efectivo" | "yape" | "plin" | "transferencia";
  /** `true` = el neto sale de la caja abierta (sólo efectivo). */
  saleDeCaja: boolean;
  /** El neto que la pantalla mostró: si el servidor calcula otro, 409 con los números nuevos. */
  netoEsperado: number;
}

export interface ResultadoPago {
  repetido?: true;
  gastoId: string;
  calculo: CalculoPago | null;
  caja: { sinCaja: boolean } | null;
}

export interface ResultadoDeshacer {
  gastoBorrado: boolean;
  adelantosReabiertos: number;
  caja: { retiro: "devuelto" | "cerrada" | "no_salio"; aviso: string | null };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const PREFIJO_PAGOS = "rrhh-pago:";

/** ¿Es un lunes válido? El pago va por semana entera, lunes a domingo. */
function semanaValida(desde: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(desde) && semanaDe(desde).desde === desde;
}

/** El gasto del pago, dentro de la tx (o fuera). Su marca sin mayúsculas, del tenant. */
async function gastoDelPagoEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  desde: FechaKey,
  colaboradorId: string,
) {
  return tx.expense.findFirst({
    where: { tenantId, documentNumber: { equals: marcaDelPago(desde, colaboradorId), mode: "insensitive" } },
    select: { id: true, amount: true },
  });
}

/** Los descuentos de planilla de ESTE período (bajo el lock de sus adelantos). */
async function descuentosDelPeriodoEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  beneficiarioId: string,
  desde: FechaKey,
  hasta: FechaKey,
) {
  const todos = await AdelantosDB.descuentosDePlanillaEnTx(tx, tenantId, beneficiarioId, dateDeFechaKey(sumarDias(desde, -45)));
  return todos.filter((d) => descuentoEsDelPeriodo({ descripcion: d.descripcion, dia: limaDateKey(d.fecha) }, desde, hasta));
}

/** El gasto de un pago a partir de la clave de un descuento suyo (`rrhh-pago:<gastoId>:<adelantoId>`). */
function gastoDeLaClave(clave: string | null): string | null {
  if (!clave?.startsWith(PREFIJO_PAGOS)) return null;
  const id = clave.slice(PREFIJO_PAGOS.length).split(":")[0];
  return id || null;
}

/**
 * El día (Lima) en que se dio un adelanto. Una fecha sola guardada como
 * medianoche UTC (`new Date("2026-10-24")`) es ESE día: pasarla por
 * `limaDateKey` la corría al anterior (memoria `dia-de-lima-en-sql-columnas-mixtas`).
 */
function diaDelAdelanto(iso: string): FechaKey {
  return /T00:00:00(\.0+)?Z$/.test(iso) ? iso.slice(0, 10) : limaDateKey(iso);
}

/** Ingreso y cese son fechas sin hora (`@db.Date`): se leen en UTC, como `GanadoDB`. */
function vigenteEnLaSemana(c: { estado: string; fechaIngreso: Date | null; fechaCese: Date | null }, desde: FechaKey, hasta: FechaKey): boolean {
  const ingreso = c.fechaIngreso ? fechaKeyDeDate(c.fechaIngreso) : null;
  const cese = c.fechaCese ? fechaKeyDeDate(c.fechaCese) : null;
  return !((ingreso && ingreso > hasta) || (c.estado === "CESADO" && cese && cese < desde));
}

export const PagosSemanaDB = {
  /** La semana que contiene `dia` (lunes a domingo). */
  semanaDelDia(dia: FechaKey): { desde: FechaKey; hasta: FechaKey } {
    return semanaDe(dia);
  },

  /**
   * El día en que el pago le descuenta un adelanto que se da HOY (25-10, «Dar
   * adelanto» desde la fila): el primer sábado desde hoy; el siguiente si esa
   * semana ya se le pagó (la marca del gasto); fin de mes si cobra por mes
   * (`lib/rrhh/adelanto-rrhh.ts`). Sólo lee: dos consultas, sin lock.
   */
  async fechaDelDescuento(tenantId: string, colaboradorId: string, hoy: FechaKey = limaDateKey()): Promise<DescuentoDelAdelanto> {
    if (!tenantId) throw new Error("tenantId is required");
    const sabado = primerSabadoDesde(hoy);
    const { desde } = semanaDe(sabado);
    const [tarifas, gasto] = await Promise.all([
      ColaboradoresDB.tarifasDe(tenantId, [colaboradorId]),
      prisma.expense.findFirst({
        where: { tenantId, documentNumber: { equals: marcaDelPago(desde, colaboradorId), mode: "insensitive" } },
        select: { id: true },
      }),
    ]);
    const vigente = tarifaVigente(
      (tarifas.get(colaboradorId) ?? []).map((t) => ({
        modalidad: t.modalidad as Modalidad,
        monto: t.monto,
        horasJornada: t.horasJornada,
        vigenteDesde: fechaKeyDeDate(t.vigenteDesde),
      })),
      sabado,
    );
    const tipo = tipoDePago(vigente ? { modalidad: vigente.modalidad, monto: vigente.monto } : null);
    return descuentoDelAdelanto({ hoy, tipo, semanaPagada: Boolean(gasto) });
  },

  /**
   * La tira del pago de la semana: por persona lo ganado, los adelantos a
   * descontar, el neto, y si ya se pagó. Los totales salen de acá.
   */
  async semana(tenantId: string, desde: FechaKey): Promise<PagoSemanaDTO> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!semanaValida(desde)) throw new PagoSemanaError(400, "semana_invalida", "La semana empieza un lunes (AAAA-MM-DD).");
    const hasta = sumarDias(desde, 6);
    const hoy = limaDateKey();
    // `hoy = domingo`: pagando el sábado, un sueldo semanal es la semana entera.
    const [ganado, colaboradores] = await Promise.all([
      GanadoDB.periodo(tenantId, { desde, hasta, hoy: hasta }),
      ColaboradoresDB.listar(tenantId, { incluirCesados: true }),
    ]);
    const porId = new Map(colaboradores.map((c) => [c.id, c]));
    const marcas = ganado.personas.map((p) => marcaDelPago(desde, p.colaboradorId));
    const beneficiarioIds = [...new Set(ganado.personas.flatMap((p) => (p.beneficiarioId ? [p.beneficiarioId] : [])))];

    const periodo = periodoDelDescuento(desde, hasta);
    const [gastos, planilla, clavesDePago] = await Promise.all([
      marcas.length
        ? prisma.expense.findMany({
            where: { tenantId, documentNumber: filtroDeMarcas(marcas) },
            select: { id: true, amount: true, documentNumber: true, paymentMethod: true, paidAt: true, date: true, createdBy: true },
          })
        : Promise.resolve([]),
      AdelantosDB.planillaDePersonas(tenantId, beneficiarioIds, {
        desde: dateDeFechaKey(sumarDias(desde, -1)),
        hasta: dateDeFechaKey(sumarDias(hasta, 2)),
      }),
      AdelantosDB.clavesDePagoDelConcepto(tenantId, beneficiarioIds, conceptoDelPeriodo(periodo)),
    ]);
    const gastosVivos = new Set(gastos.map((g) => g.id));
    /** Por persona: el gasto (ya borrado) de un pago cuyos descuentos siguen vivos. */
    const sinGastoPorPersona = new Map<string, string>();
    for (const k of clavesDePago) {
      const gastoId = gastoDeLaClave(k.idempotencyKey);
      if (gastoId && !gastosVivos.has(gastoId)) sinGastoPorPersona.set(k.beneficiarioId, gastoId);
    }
    const gastoPorMarca = new Map(gastos.map((g) => [llaveDeMarca(g.documentNumber), g]));
    const [descontadoPorPago, retiros] = await Promise.all([
      AdelantosDB.descontadoPorPrefijo(tenantId, gastos.map((g) => prefijoDescuentosDelPago(g.id))),
      GastoConCajaDB.retirosDeGastos(tenantId, gastos.map((g) => g.id)),
    ]);

    const planillaPorPersona = new Map<string, typeof planilla>();
    for (const a of planilla) {
      const lista = planillaPorPersona.get(a.beneficiarioId) ?? [];
      lista.push(a);
      planillaPorPersona.set(a.beneficiarioId, lista);
    }

    const filas: FilaPagoSemanaDTO[] = [];
    for (const p of ganado.personas) {
      const c = porId.get(p.colaboradorId);
      if (!c || !vigenteEnLaSemana(c, desde, hasta)) continue;

      const suyos = p.beneficiarioId ? planillaPorPersona.get(p.beneficiarioId) ?? [] : [];
      const abiertos: AdelantoParaPago[] = suyos
        .filter((a) => a.status === "ABIERTO")
        .map((a) => ({
          id: a.id, codigoOperacion: a.codigoOperacion, modalidad: a.modalidad, status: a.status,
          saldoPendiente: a.saldoPendiente, moneda: a.moneda, direccion: a.direccion, fechaAdelanto: a.fechaAdelanto,
        }));
      const adelantosDeLaSemana: AdelantoDeLaSemanaDTO[] = suyos
        .filter((a) => {
          const dia = diaDelAdelanto(a.fechaAdelanto);
          return dia >= desde && dia <= hasta;
        })
        .map((a) => ({ id: a.id, codigo: a.codigoOperacion, fecha: a.fechaAdelanto, monto: a.montoAdelantado, saldo: a.saldoPendiente, status: a.status, notas: a.notas }));

      const gasto = gastoPorMarca.get(llaveDeMarca(marcaDelPago(desde, p.colaboradorId))) ?? null;
      const descontadoPen = p.adelantos?.descontadoPen ?? 0;
      let pagado: PagoHechoDTO | null = null;
      let descontadoPrevio = descontadoPen;
      if (gasto) {
        const base = toNumOrZero(gasto.amount);
        const descontado = descontadoPorPago.get(prefijoDescuentosDelPago(gasto.id)) ?? 0;
        const retiro = retiros[gasto.id];
        // El neto entregado: el retiro de caja si salió del cajón; si no, lo
        // ganado menos todo lo descontado para esta semana (el pago y lo previo).
        const neto = retiro ? retiro.monto : r2(Math.max(0, base - descontadoPen));
        descontadoPrevio = r2(Math.max(0, descontadoPen - descontado));
        pagado = {
          gastoId: gasto.id, base, descontado, neto,
          metodo: gasto.paymentMethod,
          fecha: (gasto.paidAt ?? gasto.date).toISOString(),
          por: gasto.createdBy,
          salioDeCaja: Boolean(retiro),
          diferencia: diferenciaDelPago(tipoDePago(p.referencia), p.total, base),
        };
      }

      const calculo = calcularPagoSemana({ referencia: p.referencia, ganado: p.total, descontadoPrevio, adelantos: abiertos });
      // Lo que debe en cuenta corriente: no se descuenta del sueldo, va aparte.
      // Sale del mismo corte que «Queda por pagar» de Lo ganado (`saldosDelSueldo`).
      const otrasDeudas = p.adelantos?.cuentaCorrientePen ?? 0;
      // Personal de paso sin nada esa semana: no se lista (ADR-506).
      if (c.eventual && p.total <= 0 && !gasto && suyos.length === 0) continue;

      filas.push({
        colaboradorId: p.colaboradorId,
        nombre: p.nombre,
        puesto: p.puesto,
        estado: c.estado,
        beneficiarioId: p.beneficiarioId,
        tipo: calculo.tipo,
        referencia: p.referencia,
        ganado: p.total,
        // Sólo hasta hoy: el domingo que todavía no llegó no es un «sin marcar».
        sinMarcar: p.sinMarcar.filter((d) => d <= hoy).length,
        avisos: p.avisos,
        abiertos,
        descontadoPrevio,
        calculo,
        adelantosDeLaSemana,
        otrasDeudas,
        pagado,
        pagoSinGasto: !gasto && p.beneficiarioId ? sinGastoPorPersona.get(p.beneficiarioId) ?? null : null,
      });
    }

    return {
      desde,
      hasta,
      hoy,
      periodo,
      esDiaDePago: dateDeFechaKey(hoy).getUTCDay() === 6,
      filas,
      // Un pago con el gasto borrado no se suma: su neto sale mal hasta deshacerlo.
      totales: totalesDeLaSemana(filas.filter((f) => !f.pagoSinGasto)),
    };
  },

  /**
   * «Pagado»: el gasto en Mi Plata, el descuento de cada adelanto de planilla y
   * (si se eligió) el neto fuera de la caja, en UNA transacción. Dos clics: el
   * segundo espera el lock del colaborador, ve la marca y vuelve `repetido`.
   */
  async pagar(tenantId: string, input: PagarInput, usuario: string): Promise<ResultadoPago | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const { colaboradorId, desde } = input;
    if (!semanaValida(desde)) throw new PagoSemanaError(400, "semana_invalida", "La semana empieza un lunes (AAAA-MM-DD).");
    const hasta = sumarDias(desde, 6);
    if (desde > limaDateKey()) throw new PagoSemanaError(400, "semana_futura", "Esa semana todavía no empieza.");
    if (input.saleDeCaja && input.metodo !== "efectivo") {
      throw new PagoSemanaError(400, "solo_efectivo", "Sólo un pago en efectivo sale de la caja.");
    }

    const colab = await ColaboradoresDB.obtener(tenantId, colaboradorId);
    if (!colab) return null;
    if (!vigenteEnLaSemana(colab, desde, hasta)) {
      throw new PagoSemanaError(422, "fuera_de_periodo", "Esa semana no trabajaba en el negocio.");
    }
    // Lo ganado se lee antes (marcas y tarifas); el `netoEsperado` detecta si cambió.
    const ganado = await GanadoDB.periodo(tenantId, { desde, hasta, hoy: hasta, colaboradorId });
    const persona = ganado.personas[0];
    if (!persona) return null;
    const periodo = periodoDelDescuento(desde, hasta);
    const concepto = conceptoDelPeriodo(periodo);

    const r = await prisma.$transaction(
      async (tx) => {
        const bloqueado = await tx.$queryRaw<{ id: string; beneficiarioId: string | null }[]>`
          SELECT "id", "beneficiarioId" FROM "Colaborador"
           WHERE "id" = ${colaboradorId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL FOR UPDATE
        `;
        if (bloqueado.length === 0) return null;
        const ya = await gastoDelPagoEnTx(tx, tenantId, desde, colaboradorId);
        if (ya) return { repetido: true as const, gastoId: ya.id, calculo: null, sinCaja: null };

        const beneficiarioId = bloqueado[0].beneficiarioId;
        const adelantos = beneficiarioId ? await AdelantosDB.abiertosDePlanillaEnTx(tx, tenantId, beneficiarioId) : [];
        const descuentos = beneficiarioId ? await descuentosDelPeriodoEnTx(tx, tenantId, beneficiarioId, desde, hasta) : [];
        const huerfano = descuentos.map((d) => gastoDeLaClave(d.idempotencyKey)).find(Boolean);
        if (huerfano) {
          throw new PagoSemanaError(409, "pago_sin_gasto",
            "Esta semana ya tuvo un pago cuyo gasto se borró en Mi Plata y sus descuentos siguen. Deshaz ese pago antes de pagar de nuevo.",
            { gastoId: huerfano });
        }
        const calculo = calcularPagoSemana({
          referencia: persona.referencia,
          ganado: persona.total,
          montoManual: input.montoManual ?? null,
          descontadoPrevio: r2(descuentos.reduce((a, d) => a + d.valor, 0)),
          adelantos,
        });
        if (calculo.tipo === "mensual") {
          throw new PagoSemanaError(422, "cobra_por_mes", "Cobra por mes: su pago no es el del sábado.");
        }
        if (calculo.base == null) {
          throw new PagoSemanaError(422, "falta_monto", "Falta definir su pago: escribe cuánto se le paga esta semana.", { calculo });
        }
        if (calculo.base <= 0) {
          throw new PagoSemanaError(422, "sin_monto", "No tiene nada ganado esta semana.", { calculo });
        }
        if (Math.abs(calculo.neto - r2(input.netoEsperado)) > 0.005) {
          throw new PagoSemanaError(409, "neto_cambio",
            `El neto cambió: ahora es ${soles(calculo.neto)}. Revísalo y vuelve a pagar.`, { calculo });
        }

        const gasto = await tx.expense.create({
          data: {
            tenantId,
            // El valor del catálogo de gastos (`components/admin/gastos/categorias.ts`):
            // con «Personal» el resultado del negocio lo contaba dos veces.
            category: "personal",
            description: `Pago de la semana · ${colab.nombre}`,
            amount: calculo.base,
            date: new Date(),
            paidAt: new Date(),
            recurring: false,
            paymentMethod: input.metodo,
            supplierName: colab.nombre,
            documentType: "recibo",
            documentNumber: marcaDelPago(desde, colaboradorId),
            notes: notaDelPago(colab.nombre, periodo, calculo),
            createdBy: usuario,
          },
          select: { id: true },
        });
        const prefijo = prefijoDescuentosDelPago(gasto.id);
        for (const l of calculo.lineas) {
          // Bajo el lock del adelanto: si otro descuento entró entre la lectura y
          // acá, el saldo ya no alcanza y no se descuenta de más.
          const e = await AdelantosDB.registrarEntregaEnTx(tx, tenantId, l.adelantoId, {
            tipo: "LIBRE",
            valorManual: l.descuento,
            descripcion: concepto,
            idempotencyKey: `${prefijo}${l.adelantoId}`,
          }).catch((err: unknown) => {
            if (err instanceof DescuentoDePlanillaError) return null;
            throw err;
          });
          if (!e) throw new PagoSemanaError(409, "adelanto_cambio", "Un adelanto cambió mientras pagabas. Vuelve a abrir el pago.");
        }
        // La caja, ÚLTIMO lock.
        const caja = input.saleDeCaja && calculo.neto > 0
          ? await anotarEnCajaAbiertaEnTx(tx, tenantId, {
              id: idRetiroDeGasto(gasto.id),
              monto: calculo.neto,
              etiqueta: etiquetaGasto(`Pago de la semana · ${colab.nombre}`),
            })
          : null;
        return { repetido: undefined, gastoId: gasto.id, calculo, sinCaja: caja ? caja.sinCaja : null };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (!r) return null;
    if (r.repetido) return { repetido: true, gastoId: r.gastoId, calculo: null, caja: null };

    AdelantosDB.invalidarResultado(tenantId);
    revalidarTrasEgreso(tenantId, true);
    if (r.sinCaja === false) invalidarVentasOverview(tenantId);
    const c = r.calculo;
    logActivity(
      "rrhh_pago_semana",
      "colaborador",
      `Pago de ${colab.nombre} (${periodo}): ${soles(c?.base ?? 0)} − ${soles(c?.aDescontar ?? 0)} en adelantos = ${soles(c?.neto ?? 0)} neto`,
      colaboradorId,
      usuario,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[rrhh-pagos] auditoría del pago falló", { error: String(err) }));
    PagosSemanaDB.refrescarAvisoSiEsSabado(tenantId);
    return { gastoId: r.gastoId, calculo: r.calculo, caja: r.sinCaja == null ? null : { sinCaja: r.sinCaja } };
  },

  /**
   * Deshacer el pago (sólo admin o dueño, lo decide la ruta): los descuentos se
   * anulan (los adelantos vuelven a abrirse), el gasto se borra, y si el neto
   * salió de una caja que sigue abierta vuelve con un «Gasto borrado». Con la
   * caja ya cerrada no se toca y se avisa. También limpia un pago cuyo gasto
   * se borró a mano en Mi Plata (sus descuentos quedaban sueltos).
   */
  async deshacer(tenantId: string, colaboradorId: string, desde: FechaKey, usuario: string): Promise<ResultadoDeshacer | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!semanaValida(desde)) throw new PagoSemanaError(400, "semana_invalida", "La semana empieza un lunes (AAAA-MM-DD).");
    const hasta = sumarDias(desde, 6);
    const colab = await ColaboradoresDB.obtener(tenantId, colaboradorId);
    if (!colab) return null;

    const r = await prisma.$transaction(
      async (tx) => {
        const bloqueado = await tx.$queryRaw<{ id: string; beneficiarioId: string | null }[]>`
          SELECT "id", "beneficiarioId" FROM "Colaborador"
           WHERE "id" = ${colaboradorId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL FOR UPDATE
        `;
        if (bloqueado.length === 0) return null;
        const gasto = await gastoDelPagoEnTx(tx, tenantId, desde, colaboradorId);
        let gastoId = gasto?.id ?? null;
        if (!gastoId && bloqueado[0].beneficiarioId) {
          const descuentos = await descuentosDelPeriodoEnTx(tx, tenantId, bloqueado[0].beneficiarioId, desde, hasta);
          gastoId = descuentos.map((d) => gastoDeLaClave(d.idempotencyKey)).find((x): x is string => Boolean(x)) ?? null;
        }
        if (!gastoId) return { nada: true as const };

        const { adelantoIds } = await AdelantosDB.anularEntregasPorClaveEnTx(tx, tenantId, prefijoDescuentosDelPago(gastoId));
        const retiro = await tx.cashMovement.findFirst({
          where: { id: idRetiroDeGasto(gastoId), cashRegister: { tenantId } },
          select: { amount: true, cashRegisterId: true },
        });
        const borrado = gasto ? (await tx.expense.deleteMany({ where: { id: gastoId, tenantId } })).count > 0 : false;
        let caja: ResultadoDeshacer["caja"] = { retiro: "no_salio", aviso: null };
        if (retiro && borrado) {
          const monto = toNumOrZero(retiro.amount);
          // La caja, ÚLTIMO lock; releída bajo el lock por si la cerraron recién.
          const estado = await CashRegistersMovementsDB.bloquearCajaParaAnotarEnTx(tx, tenantId, retiro.cashRegisterId);
          if (estado?.status === "abierta") {
            await tx.cashMovement.create({
              data: {
                id: idDevolucionDeGasto(gastoId), cashRegisterId: retiro.cashRegisterId, type: "ingreso",
                amount: monto, method: "efectivo", description: etiquetaGastoBorrado(`Pago de la semana · ${colab.nombre}`),
              },
            });
            caja = { retiro: "devuelto", aviso: `Los ${soles(monto)} vuelven a la caja abierta.` };
          } else {
            caja = { retiro: "cerrada", aviso: `El retiro de ${soles(monto)} quedó en una caja ya cerrada: su arqueo no cambia.` };
          }
        }
        return { nada: false as const, gastoId, borrado, reabiertos: adelantoIds.length, caja };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    if (!r) return null;
    if (r.nada) throw new PagoSemanaError(404, "sin_pago", "Esa semana no tiene un pago anotado.");

    AdelantosDB.invalidarResultado(tenantId);
    revalidarTrasEgreso(tenantId, true);
    if (r.caja.retiro === "devuelto") invalidarVentasOverview(tenantId);
    logActivity(
      "rrhh_pago_semana_deshecho",
      "colaborador",
      `Pago de ${colab.nombre} (${periodoDelDescuento(desde, hasta)}) deshecho: ${r.reabiertos} adelanto(s) reabierto(s)`,
      colaboradorId,
      usuario,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[rrhh-pagos] auditoría de deshacer falló", { error: String(err) }));
    PagosSemanaDB.refrescarAvisoSiEsSabado(tenantId);
    return { gastoBorrado: r.borrado, adelantosReabiertos: r.reabiertos, caja: r.caja };
  },

  /** Los negocios con personal vivo (los que reciben el aviso del sábado). */
  async tenantsConPersonal(): Promise<string[]> {
    const filas = await prisma.colaborador.findMany({
      where: { deletedAt: null, estado: { not: "CESADO" } },
      select: { tenantId: true },
      distinct: ["tenantId"],
    });
    return filas.map((f) => f.tenantId);
  },

  /**
   * El aviso de la campana «Hoy se paga: …» de la semana de `hoy`. Sin nadie
   * por pagar, el aviso anterior queda resuelto (sincronizar con la lista vacía).
   */
  async sincronizarAvisoDelSabado(tenantId: string, hoy: FechaKey = limaDateKey()): Promise<ResultadoSincronizar> {
    if (!tenantId) throw new Error("tenantId is required");
    const { desde } = semanaDe(hoy);
    const s = await PagosSemanaDB.semana(tenantId, desde);
    const texto = textoDelAvisoDelSabado(s.totales);
    const avisos = texto
      ? [{
          type: TIPO_AVISO_PAGO_SABADO,
          severity: "MEDIUM",
          title: texto.title,
          body: texto.body,
          actionUrl: "/admin?tab=rrhh&vista=asistencia&pago=semana",
          actionLabel: "Pagar la semana",
          entityId: `pago-${desde}`,
        }]
      : [];
    return NotificationCenterDB.sincronizarAvisos(tenantId, [TIPO_AVISO_PAGO_SABADO], avisos);
  },

  /** El domingo el «Hoy se paga» ya no es de hoy: se resuelve (lo que quede por pagar sigue en la tira). */
  async cerrarAvisoDelSabado(tenantId: string): Promise<ResultadoSincronizar> {
    if (!tenantId) throw new Error("tenantId is required");
    return NotificationCenterDB.sincronizarAvisos(tenantId, [TIPO_AVISO_PAGO_SABADO], []);
  },

  /** Tras pagar o deshacer un sábado: el aviso baja o se resuelve sin esperar al cron. */
  refrescarAvisoSiEsSabado(tenantId: string): void {
    const hoy = limaDateKey();
    if (dateDeFechaKey(hoy).getUTCDay() !== 6) return;
    PagosSemanaDB.sincronizarAvisoDelSabado(tenantId, hoy).catch((err) =>
      logger.error("[rrhh-pagos] refrescar el aviso del sábado falló", { error: String(err), tenantId }),
    );
  },
};
