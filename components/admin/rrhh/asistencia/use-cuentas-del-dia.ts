"use client";

/**
 * Lo que la hoja del día cuenta (extraído de `HojaDelDia`, 20-10): quién trabaja
 * ese día, quién no y por qué, los eventuales sin marca (ADR-506: sólo salen en
 * la lista si vinieron), lo marcado, lo que falta y el horario de cada puesto
 * para sugerir la tardanza (ADR-417).
 */
import { useMemo } from "react";
import type { ColaboradorMinDTO, EstadoAsistencia, FechaKey, HojaAsistenciaDTO, PuestoDTO } from "@/lib/rrhh/tipos";
import { estaIncluidoEseDia } from "../rrhh-ui";

export function useCuentasDelDia(hoja: HojaAsistenciaDTO | null, fecha: FechaKey, puestos: readonly PuestoDTO[]) {
  const dia = useMemo(() => {
    const colaboradores = hoja?.colaboradores ?? [];
    const marcasDelDia = (hoja?.marcas ?? []).filter((m) => m.fecha === fecha);
    const tieneMarca = (c: ColaboradorMinDTO) => marcasDelDia.some((m) => m.colaboradorId === c.id);
    const delDia = colaboradores.filter((c) => estaIncluidoEseDia(c, fecha));
    /* Eventuales (ADR-506): en la lista sólo si vinieron; los demás, plegados aparte. */
    const incluidos = delDia.filter((c) => !c.eventual || tieneMarca(c));
    const eventualesSinMarca = delDia.filter((c) => c.eventual && !tieneMarca(c));
    const noIncluidos = colaboradores.filter((c) => !estaIncluidoEseDia(c, fecha));
    const marcadosIncluidos = incluidos.filter((c) => marcasDelDia.some((m) => m.colaboradorId === c.id));
    const sinMarcar = incluidos.filter((c) => !marcasDelDia.some((m) => m.colaboradorId === c.id));
    const conteo: Record<EstadoAsistencia, number> = { PRESENTE: 0, TARDANZA: 0, MEDIO_DIA: 0, FALTA: 0, PERMISO: 0, DESCANSO: 0, VACACIONES: 0 };
    for (const c of incluidos) {
      const m = marcasDelDia.find((x) => x.colaboradorId === c.id);
      if (m) conteo[m.estado] += 1;
    }
    return { incluidos, noIncluidos, eventualesSinMarca, marcasDelDia, marcadosIncluidos, sinMarcar, conteo };
  }, [hoja, fecha]);

  const horarioPorPuesto = useMemo(() => {
    const mapa = new Map<string, { horaEntrada: string; toleranciaMin: number }>();
    for (const p of puestos) {
      if (p.horaEntrada) mapa.set(p.id, { horaEntrada: p.horaEntrada, toleranciaMin: p.toleranciaMin });
    }
    return mapa;
  }, [puestos]);

  return { ...dia, horarioPorPuesto };
}
