"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { DatosRetiros, RetiroFila } from "./use-retiros";

/**
 * Los repartidores que aparecieron en la pestaña (por pagar o en el historial),
 * para el filtro «Repartidor» del historial. Se acumulan: al filtrar por uno, la
 * lista no se queda sólo con él.
 */
export function useRepartidoresVistos(datos: DatosRetiros | null): { id: string; name: string }[] {
  const [vistos, setVistos] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    if (!datos) return;
    setVistos((prev) => {
      let cambio = false;
      const sig = new Map(prev);
      for (const r of [...datos.porPagar, ...datos.historial]) {
        if (!sig.has(r.partnerId)) {
          sig.set(r.partnerId, r.partnerName);
          cambio = true;
        }
      }
      return cambio ? sig : prev;
    });
  }, [datos]);
  return useMemo(
    () => [...vistos].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [vistos],
  );
}

/**
 * Pagos «por confirmar» (17-10, P34): se mandó el pago y no volvió respuesta
 * (sin conexión o el servidor falló). La fila lo dice hasta que la lista se
 * relee: si el retiro ya no está por pagar, el pago SÍ quedó y se avisa para no
 * repetirlo; si sigue, reintentar es seguro (el servidor no paga dos veces).
 */
export function usePorConfirmar(datos: DatosRetiros | null, onResuelto: (texto: string) => void) {
  const pendientes = useRef(new Map<string, Pick<RetiroFila, "partnerName" | "amount">>());
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const aviso = useRef(onResuelto);
  useEffect(() => {
    aviso.current = onResuelto;
  });

  const marcar = useCallback((r: RetiroFila) => {
    pendientes.current.set(r.id, { partnerName: r.partnerName, amount: r.amount });
    setIds(new Set(pendientes.current.keys()));
  }, []);

  const quitar = useCallback((id: string) => {
    if (!pendientes.current.delete(id)) return;
    setIds(new Set(pendientes.current.keys()));
  }, []);

  useEffect(() => {
    if (!datos || pendientes.current.size === 0) return;
    const siguenPorPagar = new Set(datos.porPagar.map((r) => r.id));
    const pagados = new Set(datos.historial.filter((r) => r.status === "paid").map((r) => r.id));
    let cambio = false;
    for (const [id, r] of [...pendientes.current]) {
      if (siguenPorPagar.has(id)) continue;
      pendientes.current.delete(id);
      cambio = true;
      aviso.current(
        pagados.has(id)
          ? `Sí quedó: el pago de ${formatCurrency(r.amount)} a ${r.partnerName} está pagado. No lo repitas.`
          : `El retiro de ${r.partnerName} ya no está por pagar: míralo en el historial.`,
      );
    }
    if (cambio) setIds(new Set(pendientes.current.keys()));
  }, [datos]);

  return { ids, marcar, quitar };
}
