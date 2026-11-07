"use client";

import { useCallback, useEffect, useState } from "react";
import type { PresupuestoCompras } from "@/lib/compras/presupuesto-compras";

/**
 * Datos de Compras › Órdenes y recepción › Presupuesto (N02). Lee la cuenta ya
 * hecha en el servidor y guarda un techo con el PUT de Mi Plata (categoría
 * «compras:…»): un solo lugar donde vive el presupuesto.
 */
export function usePresupuestoCompras() {
  const [data, setData] = useState<PresupuestoCompras | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/compras/presupuesto", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "No tienes permiso para ver el presupuesto de compras." : "No se pudo traer el presupuesto.");
      setData((await res.json()) as PresupuestoCompras);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo traer el presupuesto.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Fija el techo (0 = quitarlo). Devuelve si se guardó. */
  const guardar = useCallback(
    async (category: string, monto: number, nombre: string): Promise<boolean> => {
      setGuardando(category);
      setError(null);
      setAviso(null);
      try {
        const res = await fetch("/api/expenses/presupuesto", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, montoMensual: monto }),
        });
        if (!res.ok) {
          throw new Error(
            res.status === 403
              ? "Sólo el dueño o el encargado puede fijar el presupuesto."
              : "No se pudo guardar el presupuesto.",
          );
        }
        setAviso(monto > 0 ? `Presupuesto de ${nombre} guardado.` : `Quitaste el presupuesto de ${nombre}.`);
        await cargar();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el presupuesto.");
        return false;
      } finally {
        setGuardando(null);
      }
    },
    [cargar],
  );

  return { data, cargando, error, aviso, guardando, cargar, guardar };
}
