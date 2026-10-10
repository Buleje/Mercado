"use client";

/**
 * Cifras derivadas de la lista de fiados para Resumen y Análisis (vista
 * previa en el cliente: los saldos vienen del servidor, acá sólo se agrupan).
 * Salieron de FiadosModule al partirlo, sin cambiar las cuentas.
 */
import { useMemo } from "react";
import { estaAbierto, type Fiado } from "./tipos";

export function useFiadoDerivados(fiados: Fiado[]) {
  const totalSaldo = useMemo(() => fiados.filter(estaAbierto).reduce((s, f) => s + f.saldo, 0), [fiados]);

  // Mejora QW-7: Fiado activo mas antiguo ─────────────────────────────────

  const fiadoMasAntiguo = useMemo(() => {
    const activos = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");
    if (activos.length === 0) return null;
    const sorted = [...activos].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const oldest = sorted[0];
    const dias = Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 86400000);
    if (dias < 7) return null;
    return { ...oldest, dias };
  }, [fiados]);

  // Mejora P-9: Clientes que pagaron esta semana ────────────────────────────

  const pagosEstaSemana = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startTs = startOfWeek.getTime();

    const clientesPagaron = new Set<string>();
    for (const f of fiados) {
      for (const c of f.cuotas) {
        if (c.pagadoEn) {
          try {
            if (new Date(c.pagadoEn).getTime() >= startTs) clientesPagaron.add(f.customerId);
          } catch { /* ignore */ }
        }
      }
    }
    const totalConFiado = new Set(fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO").map(f => f.customerId)).size;
    return { pagaron: clientesPagaron.size, total: totalConFiado };
  }, [fiados]);

  // Mejora P-10: Mejor pagador del mes ─────────────────────────────────────

  const mejorPagadorMes = useMemo(() => {
    const now = new Date();
    const mesActual = now.getMonth();
    const anioActual = now.getFullYear();
    const clientePagos = new Map<string, { nombre: string; total: number }>();

    for (const f of fiados) {
      for (const c of f.cuotas) {
        if (!c.pagadoEn) continue;
        try {
          const d = new Date(c.pagadoEn);
          if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
            const key = f.customerId;
            const ex = clientePagos.get(key) || { nombre: f.customerName || f.customerId, total: 0 };
            ex.total += c.monto;
            clientePagos.set(key, ex);
          }
        } catch { /* ignore */ }
      }
    }
    if (clientePagos.size === 0) return null;
    let best: { nombre: string; total: number } | null = null;
    for (const data of clientePagos.values()) {
      if (!best || data.total > best.total) best = data;
    }
    return best;
  }, [fiados]);

  // Mejora 19 (ronda 3): Proyección de cobro ─────────────────────────────────
  const proyeccionCobro = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const startTs = startOfWeek.getTime();
    const todayTs = todayStart.getTime();
    const diasTranscurridos = Math.max(1, Math.floor((now.getTime() - startTs) / 86400000));

    let cobradoHoy = 0;
    let cobradoSemana = 0;
    let cobradoTotal = 0;
    let totalOriginal = 0;
    const totalPendiente = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO").reduce((s, f) => s + f.saldo, 0);

    for (const f of fiados) {
      totalOriginal += f.total;
      for (const c of f.cuotas) {
        cobradoTotal += c.monto;
        try {
          const t = new Date(c.createdAt).getTime();
          if (t >= todayTs) cobradoHoy += c.monto;
          if (t >= startTs) cobradoSemana += c.monto;
        } catch {}
      }
    }

    const promedioDiario = cobradoSemana / diasTranscurridos;
    const diasRestantes = promedioDiario > 0 ? Math.ceil(totalPendiente / promedioDiario) : 0;
    const pctRecuperado = totalOriginal > 0 ? Math.round((cobradoTotal / totalOriginal) * 100) : 0;

    return { cobradoHoy, cobradoSemana, promedioDiario, diasRestantes, totalPendiente, pctRecuperado, cobradoTotal, totalOriginal };
  }, [fiados]);

  // Mejora QW-8: Tendencia de morosidad ────────────────────────────────────

  const tendenciaMorosidad = useMemo(() => {
    const now = new Date();
    const mesActual = now.getMonth();
    const anioActual = now.getFullYear();

    let cobradoEsteMes = 0;
    let prestadoEsteMes = 0;

    for (const f of fiados) {
      try {
        const d = new Date(f.createdAt);
        if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
          prestadoEsteMes += f.total;
        }
      } catch { /* ignore */ }
      for (const c of f.cuotas) {
        try {
          const d = new Date(c.createdAt);
          if (d.getMonth() === mesActual && d.getFullYear() === anioActual) {
            cobradoEsteMes += c.monto;
          }
        } catch { /* ignore */ }
      }
    }

    return { cobradoEsteMes, prestadoEsteMes };
  }, [fiados]);

  const activosCount = fiados.filter((f) => f.status === "ACTIVO").length;
  const vencidosCount = fiados.filter((f) => f.status === "VENCIDO").length;
  const deudoresCount = fiados.filter(estaAbierto).length;
  // Vencidos de verdad: status VENCIDO o ACTIVO con la fecha ya pasada
  // (nada pasa un fiado a VENCIDO en la base: se deriva de fechaVence).
  const vencidosTotales = fiados.filter((f) => f.status === "VENCIDO" || (f.status === "ACTIVO" && f.fechaVence && new Date(f.fechaVence) < new Date())).length;

  return {
    totalSaldo, fiadoMasAntiguo, pagosEstaSemana, mejorPagadorMes, proyeccionCobro, tendenciaMorosidad,
    activosCount, vencidosCount, deudoresCount, vencidosTotales,
  };
}
