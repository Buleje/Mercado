"use client";

/**
 * Cifras derivadas de la lista de fiados para «Cobrado» y «Cada fiado» (vista
 * previa en el cliente: los saldos vienen del servidor, acá sólo se agrupan).
 * Salieron de FiadosModule al partirlo, sin cambiar las cuentas. El 10-10 se
 * fueron «fiado más antiguo» (es la primera fila de «Quién debe») y la
 * «tendencia de morosidad» (la reemplaza «Cobrado este mes» de Indicadores).
 */
import { useMemo } from "react";
import { limaDateKey } from "@/lib/utils";
import { diasEntre } from "@/lib/fiados/gestion-cobranza";
import { diaDelCobro, lunesDe, primeroDelMes } from "./cifras-me-deben";
import { estaAbierto, type Fiado } from "./tipos";

/*
 * Revisión 10-10: hoy, la semana y el mes son días de Lima y la semana empieza
 * el LUNES, igual que en Indicadores. Antes salían de la hora del navegador y
 * la semana arrancaba el domingo: «esta semana» decía una cosa acá y otra arriba.
 */
export function useFiadoDerivados(fiados: Fiado[]) {

  // Mejora P-9: Clientes que pagaron esta semana ────────────────────────────

  const pagosEstaSemana = useMemo(() => {
    const lunes = lunesDe(limaDateKey());
    const clientesPagaron = new Set<string>();
    for (const f of fiados) {
      if (f.cuotas.some((c) => diaDelCobro(c) >= lunes)) clientesPagaron.add(f.customerId);
    }
    const totalConFiado = new Set(fiados.filter(estaAbierto).map((f) => f.customerId)).size;
    return { pagaron: clientesPagaron.size, total: totalConFiado };
  }, [fiados]);

  // Mejora P-10: Mejor pagador del mes ─────────────────────────────────────

  const mejorPagadorMes = useMemo(() => {
    const desde = primeroDelMes(limaDateKey());
    const clientePagos = new Map<string, { nombre: string; total: number }>();
    for (const f of fiados) {
      for (const c of f.cuotas) {
        if (diaDelCobro(c) < desde) continue;
        const ex = clientePagos.get(f.customerId) || { nombre: f.customerName || f.customerId, total: 0 };
        ex.total += c.monto;
        clientePagos.set(f.customerId, ex);
      }
    }
    let best: { nombre: string; total: number } | null = null;
    for (const data of clientePagos.values()) {
      if (!best || data.total > best.total) best = data;
    }
    return best;
  }, [fiados]);

  // Mejora 19 (ronda 3): Proyección de cobro ─────────────────────────────────
  const proyeccionCobro = useMemo(() => {
    const hoy = limaDateKey();
    const lunes = lunesDe(hoy);
    /* Días de la semana que van, hoy incluido (lunes = 1). */
    const diasTranscurridos = diasEntre(lunes, hoy) + 1;

    let cobradoHoy = 0;
    let cobradoSemana = 0;
    let cobradoTotal = 0;
    let totalOriginal = 0;
    const totalPendiente = fiados.filter(estaAbierto).reduce((s, f) => s + f.saldo, 0);

    for (const f of fiados) {
      totalOriginal += f.total;
      for (const c of f.cuotas) {
        cobradoTotal += c.monto;
        const dia = diaDelCobro(c);
        if (dia >= hoy) cobradoHoy += c.monto;
        if (dia >= lunes) cobradoSemana += c.monto;
      }
    }

    const promedioDiario = cobradoSemana / diasTranscurridos;
    const diasRestantes = promedioDiario > 0 ? Math.ceil(totalPendiente / promedioDiario) : 0;
    const pctRecuperado = totalOriginal > 0 ? Math.round((cobradoTotal / totalOriginal) * 100) : 0;

    return { cobradoHoy, cobradoSemana, promedioDiario, diasRestantes, totalPendiente, pctRecuperado, cobradoTotal, totalOriginal };
  }, [fiados]);

  return { pagosEstaSemana, mejorPagadorMes, proyeccionCobro };
}
