"use client";

/**
 * El saldo de UNA parte del Directorio y el de sus vinculados (ADR-430). Sólo
 * lectura: los cargos y abonos se anotan en su cuenta, no en la ficha.
 *
 * Las libretas no se mezclan: el servidor devuelve el saldo propio, cada
 * vinculado con el suyo, y un total que es sólo para mirar.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { SaldoConsolidado } from "@/lib/forestal/vinculos-parte";

export function useSaldoParte(parteId: string | null | undefined) {
  const [saldo, setSaldo] = useState<SaldoConsolidado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const id = parteId?.trim();
    const mio = ++pedido.current;
    if (!id) {
      setSaldo(null);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/forestal/directorio/saldo?parteId=${encodeURIComponent(id)}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      if (!r.ok) throw new Error(`No se pudo leer su saldo (${r.status})`);
      const j = (await r.json()) as { saldo?: SaldoConsolidado } & Partial<SaldoConsolidado>;
      /* Se acepta el saldo suelto o envuelto en `{ saldo }`: el contrato fija la
         forma, no el sobre. */
      const s = j.saldo ?? (j.propio ? (j as SaldoConsolidado) : null);
      if (mio === pedido.current) setSaldo(s);
    } catch (e) {
      if (mio === pedido.current) {
        setSaldo(null);
        setError(e instanceof Error ? e.message : String(e));
      }
      logger.warn("[saldo-parte] lectura fallida", { parteId: id, error: String(e) });
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, [parteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { saldo, cargando, error, recargar: cargar };
}
