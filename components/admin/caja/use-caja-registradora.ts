"use client";

/**
 * Datos de la pestaña Caja: las cajas del negocio, la abierta, sus cuentas
 * (las mismas de `cuentasDeCajaParaPantalla`, que usan el cierre y el correo)
 * y los ajustes (tolerancia y tope de efectivo). Salió de CashRegisterTab.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { cuentasDeCajaParaPantalla } from "@/lib/caja/cuentas-de-pantalla";
import { fmt, type CashRegister, type StatsCaja } from "./tipos";

export interface ItemLineaDeTiempo {
  time: string;
  type: string;
  description: string;
  amount: number;
  badge: string;
  method?: string;
  saleId?: string;
  movementId?: string;
}

const BADGE: Record<string, string> = { venta: "Venta", ingreso: "Ingreso", egreso: "Retiro", arqueo: "Arqueo" };

export function useCajaRegistradora() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  /** La carga falló: antes se tragaba el error y la pantalla decía «Caja cerrada». */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Mejora 12: tolerancia configurable (por equipo, en este navegador).
  const [cashTolerance, setCashToleranceState] = useState(() => {
    try {
      const v = localStorage.getItem("cash-tolerance");
      return v ? Number(v) : 5;
    } catch {
      return 5;
    }
  });
  const setCashTolerance = useCallback((v: number) => {
    const n = Math.max(0, Number(v) || 0);
    setCashToleranceState(n);
    try {
      localStorage.setItem("cash-tolerance", String(n));
    } catch (err) {
      logger.warn("[caja] no se pudo guardar la tolerancia", { error: String(err) });
    }
  }, []);

  // Umbral de alerta de exceso de efectivo: viene de Settings (cashAlertMax),
  // configurable en Configuración → Caja. Brandon 2026-06-20.
  const [cashAlertMax, setCashAlertMax] = useState<number>(500);
  useEffect(() => {
    let active = true;
    // credentials same-origin: /api/settings sólo devuelve cashAlertMax con sesión admin.
    fetch("/api/settings", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const v = Number(d?.cashAlertMax);
        if (active && Number.isFinite(v) && v > 0) setCashAlertMax(v);
      })
      .catch((err) => logger.error("[cash-alert-max] fetch settings failed", { error: String(err) }));
    return () => {
      active = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cash-registers");
      if (!res.ok) {
        setErrorCarga(`No pudimos leer la caja (error ${res.status}).`);
        return;
      }
      const data = await res.json();
      setRegisters(Array.isArray(data) ? data : (data?.items ?? data?.registers ?? []));
      setErrorCarga(null);
    } catch (err) {
      logger.warn("[caja] carga falló", { error: String(err) });
      setErrorCarga("Sin conexión con el servidor: lo que ves puede estar desactualizado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh cada 30 s, sólo con la pestaña a la vista (no gasta datos de fondo).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void fetchData();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const currentRegister = useMemo(() => registers.find((r) => r.status === "abierta") || null, [registers]);
  const closedRegisters = useMemo(() => registers.filter((r) => r.status === "cerrada"), [registers]);

  // Mejora 5: línea de tiempo del día (estado derivado).
  const timeline = useMemo<ItemLineaDeTiempo[]>(() => {
    if (!currentRegister) return [];
    const items: ItemLineaDeTiempo[] = [];
    // QA Brandon 2026-06-10 #7: la DB ya registra un movimiento «apertura»; el
    // sintético queda sólo para registros viejos sin ese movimiento.
    if (!currentRegister.movements.some((m) => m.type === "apertura")) {
      items.push({ time: currentRegister.openedAt, type: "apertura", description: "Apertura de turno", amount: currentRegister.openingAmount, badge: "Apertura" });
    }
    for (const m of currentRegister.movements) {
      items.push({
        time: m.createdAt,
        type: m.type,
        description: m.description || m.type,
        amount: m.amount,
        badge: BADGE[m.type] ?? m.type,
        method: m.method,
        saleId: m.saleId,
        movementId: m.id,
      });
    }
    items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return items;
  }, [currentRegister]);

  // Mejora 6: ventas por medio de pago (estado derivado).
  const paymentBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    if (!currentRegister) return breakdown;
    for (const s of currentRegister.movements.filter((m) => m.type === "venta")) {
      breakdown[s.method] = (breakdown[s.method] ?? 0) + s.amount;
    }
    return breakdown;
  }, [currentRegister]);

  const stats = useMemo<StatsCaja | null>(() => {
    if (!currentRegister) return null;
    const mvs = currentRegister.movements;
    /* LA cuenta del arqueo (`saldoEsperadoDeCaja`, la misma del cierre, del
       correo y del Resumen de Mi Plata): sólo efectivo. */
    const c = cuentasDeCajaParaPantalla(currentRegister.openingAmount, mvs, fmt);
    const hourlyData: number[] = Array.from({ length: 24 }, () => 0);
    for (const m of mvs) {
      if (m.type !== "venta") continue;
      const h = new Date(m.createdAt).getHours();
      if (Number.isFinite(h)) hourlyData[h] += m.amount;
    }
    return {
      salesEfectivo: c.salesEfectivo,
      salesDigital: c.salesDigital,
      totalIn: c.totalIn,
      totalOut: c.totalOut,
      salesCount: c.salesCount,
      expectedCash: c.expectedCash,
      fueraDelCajon: c.fueraDelCajon ?? null,
      hourlyData,
    };
  }, [currentRegister]);

  return {
    registers,
    loading,
    errorCarga,
    fetchData,
    currentRegister,
    closedRegisters,
    timeline,
    paymentBreakdown,
    stats,
    cashTolerance,
    setCashTolerance,
    cashAlertMax,
  };
}

export type DatosCaja = ReturnType<typeof useCajaRegistradora>;
