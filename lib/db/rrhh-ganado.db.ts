import "server-only";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { AsistenciaDB } from "@/lib/db/rrhh-asistencia.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { calcularGanado } from "@/lib/rrhh/ganado";
import { fechaKeyDeDate } from "@/lib/rrhh/fechas";
import type { EstadoAsistencia, FechaKey, GanadoDTO, Modalidad } from "@/lib/rrhh/tipos";

/**
 * GanadoDB — orquesta lo ganado de referencia de TODO el período (ADR-414 §5).
 *
 * Sin `prisma` propio: compone `ColaboradoresDB` (personas + tarifas),
 * `AsistenciaDB` (marcas del período) y `AdelantosDB` (saldo abierto, sólo
 * para mostrarlo AL LADO — nunca restado, ver `lib/rrhh/ganado.ts`) y llama
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

    const [tarifasPorId, marcas, saldos] = await Promise.all([
      ColaboradoresDB.tarifasDe(tenantId, ids),
      AsistenciaDB.delPeriodo(tenantId, input.desde, input.hasta, ids),
      AdelantosDB.saldosPorPersona(tenantId),
    ]);

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
        adelantos: c.beneficiarioId ? (saldosPorBeneficiario.get(c.beneficiarioId) ?? { abiertosPen: 0, abiertos: 0 }) : null,
      };
    });

    const total = r2(personas.reduce((a, p) => a + p.total, 0));
    return { desde: input.desde, hasta: input.hasta, hoy: input.hoy, personas, total };
  },
};
