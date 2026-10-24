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
import { calcularDesdeDenominaciones, esDiferenciaAnormal, lineaCajaSigueAbierta, type Turno, type TurnoSummary } from "./tipos";
import { notaConteoCorregido } from "@/lib/pos/cierre-a-ciegas";
import { useCierreACiegas } from "./cierre-a-ciegas";

export const SIN_ESPERADO = "No se pudo calcular lo esperado en caja. Reintenta antes de cerrar.";

type EsperadoDelCierre = { esperado: number; fueraDelCajon: string | null };

/** Lo que trae `GET /api/cash-registers` de cada caja (sólo lo que usa el cierre). */
type CajaDelListado = {
  id: string;
  status: string;
  openingAmount: number;
  /** Lo suma el servidor sobre TODOS los movimientos de una caja abierta. */
  efectivoEsperado?: number;
  /** Sólo los últimos 100: sirven para la línea de Yape/tarjeta, no para el esperado. */
  movements?: Array<{ type: string; method: string; amount: number }>;
};

/**
 * El esperado del cierre, del servidor y por el MISMO camino que tomará
 * `POST /api/turnos/[id]/cerrar`:
 *  - turno con su caja abierta → `efectivoEsperado` de esa caja (el cierre la
 *    cierra con esa cuenta: apertura + ventas en efectivo + ingresos − egresos);
 *  - sin caja vinculada, o su caja ya cerrada → el cierre usa
 *    `inicio + ventas del turno`; las ventas, del resumen del servidor.
 * `null` = no se pudo saber. Antes caía a `inicio + ventasTotal`, y `ventasTotal`
 * vale 0 con el turno abierto: «Esperado S/ 50.00» con S/ 345.50 vendidos.
 */
export async function pedirEsperadoDelCierre(turno: Turno): Promise<EsperadoDelCierre | null> {
  if (turno.cashRegisterId) {
    const res = await fetch("/api/cash-registers");
    if (!res.ok) return null;
    const data = await res.json();
    const cajas: CajaDelListado[] = Array.isArray(data) ? data : (data?.items ?? []);
    const caja = cajas.find((r) => r.id === turno.cashRegisterId);
    if (caja?.status === "abierta") {
      if (typeof caja.efectivoEsperado !== "number") return null;
      /* LA cuenta del arqueo, la misma del cierre y de la pestaña Caja: aquí sólo da la línea de lo que no está en el cajón. */
      const cuentas = cuentasDeCajaParaPantalla(Number(caja.openingAmount || 0), caja.movements ?? [], formatCurrency);
      return { esperado: caja.efectivoEsperado, fueraDelCajon: cuentas.fueraDelCajon };
    }
  }
  const s = await pedirResumenServidor(turno.id);
  if (!s) return null;
  return { esperado: Math.round((turno.inicioEfectivo + s.totalVendido) * 100) / 100, fueraDelCajon: null };
}

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
  // Esperado del cierre, del SERVIDOR (ver `pedirEsperadoDelCierre`). `null` = cargando
  // o no se pudo saber (`esperadoFallo`): entonces no se muestra cifra ni se deja cerrar.
  const [esperadoCierre, setEsperadoCierre] = useState<EsperadoDelCierre | null>(null);
  const [esperadoFallo, setEsperadoFallo] = useState(false);
  const [intentoEsperado, setIntentoEsperado] = useState(0);
  const [conteoMode, setConteoMode] = useState<"denominacion" | "manual">("denominacion");
  const [denomCounts, setDenomCounts] = useState<Record<string, number>>({});
  const [showDiffConfirm, setShowDiffConfirm] = useState(false);
  // Audit M5 (2026-05-17): la causa de la diferencia alta tiene su PROPIO campo.
  const [notaDiffAnormal, setNotaDiffAnormal] = useState("");
  /* Cierre a ciegas (Configuración › Cobros): la ventana no muestra lo esperado.
     Si la diferencia alta lo revela y el cajero corrige, su primer conteo queda en la nota. */
  const { ciego } = useCierreACiegas();
  const [primerConteo, setPrimerConteo] = useState<number | null>(null);

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
    setPrimerConteo(null);
  }, []);

  const abrirCierre = useCallback(() => { setShowCierre(true); setCloseError(null); }, []);

  useEffect(() => {
    if (!showCierre || !turnoActivo) { setEsperadoCierre(null); setEsperadoFallo(false); return; }
    let cancelled = false;
    // Sin borrar la cifra que ya hay: un refresco del turno no la hace parpadear.
    setEsperadoFallo(false);
    pedirEsperadoDelCierre(turnoActivo).then((r) => {
      if (cancelled) return;
      setEsperadoCierre(r);
      setEsperadoFallo(r === null);
    }).catch((err) => {
      console.warn("[Turnos] esperado del cierre", err);
      if (!cancelled) { setEsperadoCierre(null); setEsperadoFallo(true); }
    });
    return () => { cancelled = true; };
  }, [showCierre, turnoActivo, intentoEsperado]);

  const esperado = turnoActivo ? esperadoCierre?.esperado ?? null : null;
  /* Otro turno abierto usa la misma caja: cerrar éste no la cierra y el esperado es el de toda la caja. */
  const cajaSigueAbierta = lineaCajaSigueAbierta(turnoActivo?.cajaCompartidaCon);
  const cajaFueraDelCajon = esperadoCierre?.fueraDelCajon ?? null;
  const reintentarEsperado = useCallback(() => setIntentoEsperado((n) => n + 1), []);

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
    // Sin el esperado del servidor no hay contra qué comparar: no se cierra a ciegas.
    if (esperado === null) {
      setCloseError(esperadoFallo ? SIN_ESPERADO : "Calculando lo esperado en caja…");
      return;
    }

    // Guarda de diferencia alta en la UI: el backend recibe cualquier monto.
    const anormal = esDiferenciaAnormal(monto - esperado, esperado);
    if (anormal && !opts?.confirmedAnormal) {
      if (ciego !== false) setPrimerConteo((p) => p ?? monto);
      setShowDiffConfirm(true);
      return;
    }
    if (anormal && opts?.confirmedAnormal && notaDiffAnormal.trim().length < 8) {
      setCloseError("Diferencia alta — describe brevemente la causa (mín. 8 caracteres)");
      setShowDiffConfirm(true);
      return;
    }

    setClosing(true);
    try {
      const body: Record<string, unknown> = { cierreEfectivo: monto };
      const notasBase = anormal && opts?.confirmedAnormal
        ? `[Diferencia anormal] ${notaDiffAnormal.trim()}${cierreNotas.trim() ? ` · Notas: ${cierreNotas.trim()}` : ""}`
        : cierreNotas.trim();
      const notasFinal = [notasBase, notaConteoCorregido(primerConteo, monto)].filter(Boolean).join(" · ");
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
      // Diferencia del servidor (movimientos reales de la caja); si no viniera, contra el esperado mostrado.
      const diferencia = Number(cerrado.diferencia ?? (monto - esperado));

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
        cajaLaUsan: Array.isArray(cerrado.cajaLaUsan) ? cerrado.cajaLaUsan.filter((x: unknown): x is string => typeof x === "string") : [],
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
    esperado, esperadoFallo, reintentarEsperado, cajaFueraDelCajon, cajaSigueAbierta, ciego,
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
