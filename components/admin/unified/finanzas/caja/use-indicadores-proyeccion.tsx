"use client";

/**
 * Los indicadores de la Proyección de caja, plegados en el botón de la
 * cabecera: el saldo de hoy (el punto de partida), cuántas semanas cierran
 * sanas, la semana más baja y cómo cierra la última. Todo sale del servidor
 * (`/api/finance/cashflow-rolling`); acá se elige, no se suma.
 *
 * Una cifra no se repite: si la semana más baja o el cierre son el mismo
 * saldo de hoy (nada se mueve), no van en otra tarjeta.
 */

import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import type { ProyeccionDeCaja, SemanaProyectada } from "@/hooks/use-caja-del-negocio";
import { limaDateKey } from "@/lib/utils";
import { montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { tarjetasDe, type Indicador } from "@/components/admin/unified/finanzas/movimientos/TarjetaIndicador";

export function useIndicadoresProyeccion(d: ProyeccionDeCaja | null) {
  const saldo = d?.saldoInicial;
  const montoHoy = d ? (saldo?.monto ?? d.startingBalance) : null;
  const hoy = montoTexto(montoHoy, { aproximado: saldo?.estimado ?? false });
  const semanas = d?.weeks ?? [];
  const sanas = semanas.filter((w) => !w.isNegative).length;
  const peor = semanas.reduce<SemanaProyectada | null>((m, w) => (!m || w.closingBalance < m.closingBalance ? w : m), null);
  const ultima = semanas[semanas.length - 1] ?? null;

  const tarjetas: Indicador[] = d
    ? [
        {
          rotulo: saldo?.fuente === "neto_30_dias" ? "Saldo de hoy, estimado" : "Saldo de hoy",
          valor: hoy,
          tono: "destacado",
          ayuda:
            saldo?.fuente === "neto_30_dias"
              ? "No hay cuentas cargadas en Tesorería: se estima con lo que vendiste menos lo que gastaste en los últimos 30 días. Es el punto de partida de las semanas."
              : "La suma de tus cuentas en Tesorería. Es el punto de partida de las semanas.",
        },
        {
          rotulo: "Semanas sanas",
          valor: `${sanas} de ${semanas.length}`,
          tono: sanas < semanas.length ? "rojo" : "neutro",
          ayuda: "Las semanas que cierran con saldo positivo.",
        },
        ...(peor && peor.closingBalance !== montoHoy
          ? [
              {
                rotulo: "La semana más baja",
                valor: montoTexto(peor.closingBalance),
                nota: `S${peor.weekNumber} · ${diaConNombre(limaDateKey(peor.weekStart))}`,
                tono: peor.closingBalance < 0 ? ("rojo" as const) : ("neutro" as const),
              },
            ]
          : []),
        ...(ultima && ultima !== peor && ultima.closingBalance !== montoHoy
          ? [
              {
                rotulo: `Al cierre de la semana ${ultima.weekNumber}`,
                valor: montoTexto(ultima.closingBalance),
                nota: `Hasta el ${diaConNombre(limaDateKey(ultima.weekEnd))}`,
              },
            ]
          : []),
      ]
    : [{ rotulo: "Saldo de hoy", valor: "—" }];

  return useKpisPlegables({
    claveMemoria: "plata-proyeccion-caja",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: !d,
    /* Corto: el botón no pasa de 24rem y el titular se corta a ~22 caracteres. */
    resumen: d ? (sanas < semanas.length ? `${semanas.length - sanas} ${semanas.length - sanas === 1 ? "semana" : "semanas"} en rojo` : `Hoy ${hoy}`) : undefined,
    tarjetas: tarjetasDe(tarjetas),
  });
}
