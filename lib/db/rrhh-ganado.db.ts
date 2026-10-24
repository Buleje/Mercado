import "server-only";
import { prisma } from "@/lib/prisma";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { calcularGanado } from "@/lib/rrhh/ganado";
import { dateDeFechaKey, fechaKeyDeDate, sumarDias } from "@/lib/rrhh/fechas";
import { descuentoEsDelPeriodo } from "@/lib/rrhh/descuentos-planilla";
import { entregadoDelPago, filtroDeMarcas, llaveDeMarca, marcaDelPago, semanasEnterasDelPeriodo } from "@/lib/rrhh/pago-semana";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDateKey } from "@/lib/utils";
import type { EstadoAsistencia, FechaKey, GanadoDTO, Modalidad } from "@/lib/rrhh/tipos";

/**
 * GanadoDB — orquesta lo ganado de referencia de TODO el período (ADR-414 §5).
 *
 * Compone `ColaboradoresDB` (personas + tarifas), `AsistenciaDB` (marcas del
 * período) y `AdelantosDB` (saldo abierto y lo ya descontado por planilla del
 * período, que resta `calcularQuedaPorPagar`). Su única lectura propia: los
 * gastos del pago de la semana (comprobante `RRHH-<lunes>-<id>`), para restar lo
 * ya entregado el sábado (decisión 6 de `lib/rrhh/ganado.ts`). Llama
 * al puro `calcularGanado` con los MISMOS argumentos que usaría la vista
 * previa (lección ADR-412: nunca una función de cálculo con dos firmas).
 */

export interface PeriodoGanadoInput {
  desde: FechaKey;
  hasta: FechaKey;
  hoy: FechaKey;
  colaboradorId?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const GanadoDB = {
  async periodo(tenantId: string, input: PeriodoGanadoInput): Promise<GanadoDTO> {
    if (!tenantId) throw new Error("tenantId is required");

    const colaboradores = await ColaboradoresDB.listar(tenantId, { incluirCesados: true });
    const filtrados = input.colaboradorId ? colaboradores.filter((c) => c.id === input.colaboradorId) : colaboradores;
    const ids = filtrados.map((c) => c.id);
    if (ids.length === 0) return { desde: input.desde, hasta: input.hasta, hoy: input.hoy, personas: [], total: 0 };

    const beneficiarioIds = filtrados.flatMap((c) => (c.beneficiarioId ? [c.beneficiarioId] : []));
    // Las semanas ENTERAS del período: lo pagado el sábado de cada una.
    const marcasDePago = semanasEnterasDelPeriodo(input.desde, input.hasta).flatMap((lunes) =>
      ids.map((id) => ({ lunes, id, marca: marcaDelPago(lunes, id) })),
    );
    const [tarifasPorId, marcas, saldos, descuentos, pagos] = await Promise.all([
      ColaboradoresDB.tarifasDe(tenantId, ids),
      AsistenciaDB.delPeriodo(tenantId, input.desde, input.hasta, ids),
      AdelantosDB.saldosPorPersona(tenantId),
      // 45 días antes de `desde`: un descuento de este período anotado por
      // adelantado. El que se anota después (lo normal) no tiene tope.
      AdelantosDB.descuentosDePlanilla(tenantId, beneficiarioIds, dateDeFechaKey(sumarDias(input.desde, -45))),
      marcasDePago.length
        ? prisma.expense.findMany({
            where: { tenantId, documentNumber: filtroDeMarcas(marcasDePago.map((m) => m.marca)) },
            select: { amount: true, documentNumber: true },
          })
        : Promise.resolve([]),
    ]);
    const pagadoPorMarca = new Map(pagos.map((g) => [llaveDeMarca(g.documentNumber), toNumOrZero(g.amount)]));

    const marcasPorId = new Map<string, typeof marcas>();
    for (const m of marcas) {
      const lista = marcasPorId.get(m.colaboradorId) ?? [];
      lista.push(m);
      marcasPorId.set(m.colaboradorId, lista);
    }

    // Sólo ABIERTO en soles — mismo criterio que `agregarAdelantos` de
    // `cuenta-unificada.ts`: es lo único que pesa como "te debe" hoy.
    const saldosPorBeneficiario = new Map<string, { abiertosPen: number; abiertos: number }>();
    for (const g of saldos) {
      if (g.status !== "ABIERTO") continue;
      const acc = saldosPorBeneficiario.get(g.beneficiarioId) ?? { abiertosPen: 0, abiertos: 0 };
      acc.abiertos += g.cantidad;
      if ((g.moneda || "PEN") === "PEN") acc.abiertosPen = r2(acc.abiertosPen + g.saldoPendiente);
      saldosPorBeneficiario.set(g.beneficiarioId, acc);
    }

    // Lo ya descontado por planilla PARA ESTE PERÍODO: el adelanto que se
    // descontó dejó de estar abierto, y sin sumarlo acá «Queda por pagar» subía
    // al descontar (decisión 5 de `lib/rrhh/ganado.ts`).
    const descontadoPorBeneficiario = new Map<string, number>();
    const descuentosPorBeneficiario = new Map<string, typeof descuentos>();
    for (const d of descuentos) {
      const lista = descuentosPorBeneficiario.get(d.beneficiarioId) ?? [];
      lista.push(d);
      descuentosPorBeneficiario.set(d.beneficiarioId, lista);
      if (!descuentoEsDelPeriodo({ descripcion: d.descripcion, dia: limaDateKey(d.fecha) }, input.desde, input.hasta)) continue;
      descontadoPorBeneficiario.set(d.beneficiarioId, r2((descontadoPorBeneficiario.get(d.beneficiarioId) ?? 0) + d.valor));
    }

    // Lo entregado en mano por cada pago: lo pagado menos lo descontado para esa
    // semana (esos descuentos ya entran en `descontadoPen`).
    const pagadoDe = (colaboradorId: string, beneficiarioId: string | null): number => {
      let total = 0;
      for (const m of marcasDePago) {
        if (m.id !== colaboradorId) continue;
        const base = pagadoPorMarca.get(llaveDeMarca(m.marca));
        if (base == null) continue;
        const hasta = sumarDias(m.lunes, 6);
        const descontadoDeLaSemana = (beneficiarioId ? descuentosPorBeneficiario.get(beneficiarioId) ?? [] : [])
          .filter((d) => descuentoEsDelPeriodo({ descripcion: d.descripcion, dia: limaDateKey(d.fecha) }, m.lunes, hasta))
          .reduce((a, d) => a + d.valor, 0);
        total = r2(total + entregadoDelPago(base, descontadoDeLaSemana));
      }
      return total;
    };

    const personas = filtrados.map((c) => {
      const tarifas = (tarifasPorId.get(c.id) ?? []).map((t) => ({
        modalidad: t.modalidad as Modalidad,
        monto: t.monto,
        horasJornada: t.horasJornada,
        vigenteDesde: fechaKeyDeDate(t.vigenteDesde),
      }));
      const marcasDeLaPersona = (marcasPorId.get(c.id) ?? []).map((m) => ({
        fecha: fechaKeyDeDate(m.fecha),
        estado: m.estado as EstadoAsistencia,
        horas: m.horas,
      }));
      const ganado = calcularGanado({
        colaborador: {
          id: c.id,
          fechaIngreso: c.fechaIngreso ? fechaKeyDeDate(c.fechaIngreso) : null,
          fechaCese: c.fechaCese ? fechaKeyDeDate(c.fechaCese) : null,
        },
        tarifas,
        marcas: marcasDeLaPersona,
        desde: input.desde,
        hasta: input.hasta,
        hoy: input.hoy,
      });
      return {
        ...ganado,
        nombre: c.nombre,
        puesto: c.puesto?.nombre ?? null,
        beneficiarioId: c.beneficiarioId,
        pagado: pagadoDe(c.id, c.beneficiarioId),
        adelantos: c.beneficiarioId
          ? {
              ...(saldosPorBeneficiario.get(c.beneficiarioId) ?? { abiertosPen: 0, abiertos: 0 }),
              descontadoPen: descontadoPorBeneficiario.get(c.beneficiarioId) ?? 0,
            }
          : null,
      };
    });

    const total = r2(personas.reduce((a, p) => a + p.total, 0));
    return { desde: input.desde, hasta: input.hasta, hoy: input.hoy, personas, total };
  },
};
