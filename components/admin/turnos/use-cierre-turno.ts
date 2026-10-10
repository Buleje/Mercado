"use client";

/**
 * Cierre del turno: conteo (por denominación o monto directo), esperado REAL
 * del cajón, guarda de diferencia alta con nota propia y el resumen final.
 * Movido tal cual de `TurnosModule.tsx` (los porqués siguen aquí).
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { cuentasDeCajaParaPantalla } from "@/lib/caja/cuentas-de-pantalla";
import { formatCurrency } from "@/lib/format";
import { pedirResumenServidor } from "./use-resumen-turno";
import { calcularDesdeDenominaciones, esDiferenciaAnormal, type Turno, type TurnoSummary } from "./tipos";

type Opciones = {
  turnoActivo: Turno | null;
  cajeroNombre: string;
  onCerrado: (r: TurnoSummary) => void;
  refrescar: () => void;
};

export function useCierreTurno({ turnoActivo, cajeroNombre, onCerrado, refrescar }: Opciones) {
  const [showCierre, setShowCierre] = useState(false);
  const [cierreEfectivo, setCierreEfectivo] = useState("");
  const [cierreNotas, setCierreNotas] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  // FIX 2026-07-08 (bug 6): esperado REAL del cajón = apertura + ventas en efectivo
  // + ingresos − egresos de la caja vinculada. `null` = cargando / sin caja (fallback legacy).
  const [cajaEsperado, setCajaEsperado] = useState<number | null>(null);
  const [cajaFueraDelCajon, setCajaFueraDelCajon] = useState<string | null>(null);
  const [conteoMode, setConteoMode] = useState<"denominacion" | "manual">("denominacion");
  const [denomCounts, setDenomCounts] = useState<Record<string, number>>({});
  const [showDiffConfirm, setShowDiffConfirm] = useState(false);
  // Audit M5 (2026-05-17): la causa de la diferencia alta tiene su PROPIO campo.
  const [notaDiffAnormal, setNotaDiffAnormal] = useState("");

  // Audit H1+H2: reset completo al cancelar o tras cerrar (no reabrir con el conteo viejo).
  const resetCierreState = useCallback(() => {
    setShowCierre(false);
    setShowDiffConfirm(false);
    setCierreEfectivo("");
    setCierreNotas("");
    setNotaDiffAnormal("");
    setDenomCounts({});
    setConteoMode("denominacion");
    setCloseError(null);
  }, []);

  const abrirCierre = useCallback(() => { setShowCierre(true); setCloseError(null); }, []);

  useEffect(() => {
    if (!showCierre || !turnoActivo) { setCajaEsperado(null); setCajaFueraDelCajon(null); return; }
    let cancelled = false;
    fetch("/api/cash-registers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const registers: Array<{
          id: string; status: string; openingAmount: number;
          movements?: Array<{ type: string; method: string; amount: number }>;
        }> = Array.isArray(data) ? data : (data.items ?? []);
        // La caja del turno; si es un turno legacy sin vínculo, la que esté abierta.
        const reg = registers.find((r) => r.id === turnoActivo.cashRegisterId)
          ?? registers.find((r) => r.status === "abierta");
        if (!reg) return;
        const movs = reg.movements ?? [];
        /* LA cuenta del arqueo, la misma del cierre y de la pestaña Caja (sólo efectivo). */
        const cuentas = cuentasDeCajaParaPantalla(Number(reg.openingAmount || 0), movs, formatCurrency);
        setCajaEsperado(cuentas.expectedCash);
        setCajaFueraDelCajon(cuentas.fueraDelCajon);
      })
      .catch((err) => {
        console.warn("[Turnos] caja del cierre (cae al esperado legacy)", err);
        if (!cancelled) { setCajaEsperado(null); setCajaFueraDelCajon(null); }
      });
    return () => { cancelled = true; };
  }, [showCierre, turnoActivo]);

  const esperado = turnoActivo ? cajaEsperado ?? (turnoActivo.inicioEfectivo + turnoActivo.ventasTotal) : 0;

  /** Cambia la cantidad de una denominación y recalcula el monto contado. */
  const cambiarDenominacion = useCallback((key: string, calcular: (actual: number) => number) => {
    setDenomCounts((prev) => {
      const next = { ...prev, [key]: Math.max(0, calcular(prev[key] || 0)) };
      setCierreEfectivo(String(calcularDesdeDenominaciones(next)));
      return next;
    });
    setCloseError(null);
  }, []);

  const handleCerrar = async (opts?: { confirmedAnormal?: boolean }) => {
    if (!turnoActivo) return;
    setCloseError(null);
    const monto = parseFloat(cierreEfectivo);
    if (isNaN(monto) || monto < 0) { setCloseError("Monto inválido"); return; }

    // Guarda de diferencia alta en la UI: el backend recibe cualquier monto.
    const anormal = esDiferenciaAnormal(monto - esperado, esperado);
    if (anormal && !opts?.confirmedAnormal) { setShowDiffConfirm(true); return; }
    if (anormal && opts?.confirmedAnormal && notaDiffAnormal.trim().length < 8) {
      setCloseError("Diferencia alta — describe brevemente la causa (mín. 8 caracteres)");
      setShowDiffConfirm(true);
      return;
    }

    setClosing(true);
    try {
      const body: Record<string, unknown> = { cierreEfectivo: monto };
      const notasFinal = anormal && opts?.confirmedAnormal
        ? `[Diferencia anormal] ${notaDiffAnormal.trim()}${cierreNotas.trim() ? ` · Notas: ${cierreNotas.trim()}` : ""}`
        : cierreNotas.trim();
      if (notasFinal) body.notas = notasFinal;

      const res = await fetch(`/api/turnos/${turnoActivo.id}/cerrar`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al cerrar turno");
      }
      const cerrado = await res.json();
      const ventasTotal = Number(cerrado.ventasTotal ?? turnoActivo.ventasTotal ?? 0);
      // Diferencia del servidor (movimientos reales de la caja); fallback al esperado del cajón.
      const diferencia = Number(cerrado.diferencia ?? (monto - (cajaEsperado ?? (turnoActivo.inicioEfectivo + ventasTotal))));

      // T6 (audit 2026-05-07): agregados del servidor, no de /api/sales en el cliente.
      const s = await pedirResumenServidor(turnoActivo.id);
      let cantidadVentas = s?.cantidadVentas ?? 0;
      if (cantidadVentas === 0 && ventasTotal > 0) cantidadVentas = 1;

      onCerrado({
        turnoId: turnoActivo.id,
        cajeroNombre,
        abrioEn: turnoActivo.abrioEn,
        cerroEn: typeof cerrado.cerroEn === "string" ? cerrado.cerroEn : new Date().toISOString(),
        totalVentas: ventasTotal,
        cantidadVentas,
        ticketPromedio: cantidadVentas > 0 ? ventasTotal / cantidadVentas : 0,
        inicioEfectivo: turnoActivo.inicioEfectivo,
        cierreEfectivo: monto,
        diferencia,
        metodosPago: s?.metodosPago ?? [],
        topProductos: (s?.topProductos ?? []).slice(0, 3),
        ventasPorHora: await ventasPorHoraDelTurno(turnoActivo),
        totalDescuentos: s?.totalDescuentos ?? 0,
      });
      resetCierreState();
      refrescar();
      window.dispatchEvent(new CustomEvent("buleje:turno-changed", { detail: { abierto: false } }));
    } catch (e) {
      setCloseError(e instanceof Error ? e.message : "Error");
    } finally {
      setClosing(false);
    }
  };

  return {
    showCierre, abrirCierre, resetCierreState,
    cierreEfectivo, setCierreEfectivo, cierreNotas, setCierreNotas,
    closing, closeError, setCloseError,
    esperado, cajaFueraDelCajon,
    conteoMode, setConteoMode, denomCounts, cambiarDenominacion,
    showDiffConfirm, setShowDiffConfirm, notaDiffAnormal, setNotaDiffAnormal,
    handleCerrar,
  };
}

/** Mejora M4 (tiempo muerto): ventas por hora del cajero desde que abrió (T11: filtro en el servidor). */
async function ventasPorHoraDelTurno(t: Turno): Promise<{ hora: string; total: number }[]> {
  const out: { hora: string; total: number }[] = [];
  try {
    const params = new URLSearchParams({ today: "1", cashierId: t.adminUserId, limit: "1000" });
    const res = await fetch(`/api/sales?${params.toString()}`);
    if (!res.ok) return out;
    const data = await res.json();
    const ventas: Array<Record<string, unknown>> = Array.isArray(data) ? data : data.ventas ?? [];
    const inicio = new Date(t.abrioEn);
    const fin = new Date();
    for (let h = inicio.getHours(); h <= fin.getHours(); h++) {
      const total = ventas
        .filter((s) => {
          const c = s.createdAt as string | undefined;
          if (!c) return false;
          const d = new Date(c);
          return d.getTime() >= inicio.getTime() && d.getHours() === h;
        })
        .reduce((acc, v) => acc + Number(v.total ?? 0), 0);
      out.push({ hora: `${String(h).padStart(2, "0")}:00`, total });
    }
  } catch { /* sin datos de horas: el bloque no se muestra */ }
  return out;
}
