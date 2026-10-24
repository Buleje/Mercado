"use client";

/**
 * Caja › Historial › Por día: el cierre de cada día con el conteo real, armado
 * en el servidor (`/api/cash-registers/por-dia`). La pantalla no suma nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiaDeCaja, TotalesDeCaja } from "@/lib/caja/cierres-por-dia";

export type CajaPorDia = { desde: string; dias: DiaDeCaja[]; totales: TotalesDeCaja };

/** Dos meses por tanda; el servidor acepta hasta un año. */
const PASO = 60;
const TOPE = 366;

export function useCajaPorDia() {
  const [dias, setDias] = useState(PASO);
  const [data, setData] = useState<CajaPorDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  /* Sólo vale la respuesta del último pedido («Ver más días» dos veces seguidas). */
  const ultimo = useRef(0);

  const cargar = useCallback(async (n: number) => {
    const id = ++ultimo.current;
    setCargando(true);
    setError(false);
    try {
      const res = await fetch(`/api/cash-registers/por-dia?dias=${n}`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as CajaPorDia;
      if (id === ultimo.current) setData(json);
    } catch {
      if (id === ultimo.current) setError(true);
    } finally {
      if (id === ultimo.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(dias);
  }, [dias, cargar]);

  return {
    data,
    cargando,
    error,
    recargar: () => void cargar(dias),
    /** null cuando ya se ve el año entero. */
    masDias: dias < TOPE ? () => setDias((d) => Math.min(TOPE, d + PASO)) : null,
  };
}
