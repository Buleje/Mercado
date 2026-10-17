"use client";

/**
 * Los pedidos que se pueden elegir en «Emitir comprobante»: los últimos 100
 * del negocio, con buscador en el navegador (código, cliente, celular, monto,
 * fecha, producto). Reemplaza el campo «ID del pedido · ej. cm3abc123…» que
 * obligaba a copiar el id técnico (auditoría de comprobantes F04/M53, 17-10).
 */
import { useEffect, useMemo, useState } from "react";
import { logger } from "@/lib/logger";
import { aPedidoElegible, filtrarPedidos, type PedidoApi, type PedidoElegible } from "./emision-reglas";
import type { EDocument } from "./tipos";

const MOSTRAR = 40;

type Carga = { fase: "cargando" } | { fase: "error" } | { fase: "lista"; crudos: PedidoApi[] };

export function usePedidosParaEmitir(abierto: boolean, docs: readonly EDocument[], preelegidoId: string | null) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [busqueda, setBusqueda] = useState("");

  // Se pide cada vez que se abre: entre una emisión y otra entran pedidos nuevos.
  useEffect(() => {
    if (!abierto) return;
    const ac = new AbortController();
    setCarga({ fase: "cargando" });
    setBusqueda("");
    (async () => {
      const res = await fetch("/api/orders?limit=100", { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lista = (await res.json()) as PedidoApi[];
      // El pedido que pidió otra pantalla puede ser más viejo que los últimos 100.
      if (preelegidoId && !lista.some((o) => o.id === preelegidoId)) {
        const uno = await fetch(`/api/orders/${encodeURIComponent(preelegidoId)}`, { signal: ac.signal });
        if (uno.ok) lista.unshift((await uno.json()) as PedidoApi);
      }
      setCarga({ fase: "lista", crudos: Array.isArray(lista) ? lista : [] });
    })().catch((err: unknown) => {
      if (ac.signal.aborted) return;
      logger.warn("[comprobantes] pedidos para emitir", { error: String(err) });
      setCarga({ fase: "error" });
    });
    return () => ac.abort();
  }, [abierto, preelegidoId]);

  const pedidos = useMemo(
    () =>
      carga.fase === "lista"
        ? carga.crudos.map((o) => aPedidoElegible(o, docs)).filter((p): p is PedidoElegible => p !== null)
        : [],
    [carga, docs],
  );
  const coinciden = useMemo(() => filtrarPedidos(pedidos, busqueda), [pedidos, busqueda]);
  const preelegido = preelegidoId ? (pedidos.find((p) => p.id === preelegidoId) ?? null) : null;

  return {
    fase: carga.fase,
    busqueda,
    setBusqueda,
    visibles: coinciden.slice(0, MOSTRAR),
    coinciden: coinciden.length,
    total: pedidos.length,
    preelegido,
  };
}

export type PedidosParaEmitir = ReturnType<typeof usePedidosParaEmitir>;
