"use client";

/**
 * Los pedidos que se pueden asignar a un repartidor (17-10, P25/M47).
 *
 * Antes la ventana pedía escribir el «ID de orden» a mano (un código interno
 * que nadie conoce). Ahora se elige de esta lista: pedidos confirmados o en
 * preparación que todavía no tienen repartidor asignado, y los «en camino» que
 * salieron sin repartidor (el Tablero los marca «falta repartidor»).
 */
import { useCallback, useEffect, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import { responsableDe } from "@/components/admin/OrdersTab/siguiente-paso";
import type { DbOrder } from "@/lib/jsondb";

export interface PedidoPorRepartir {
  id: string;
  codigo: string;
  cliente: string;
  total: number;
  estado: (typeof ESTADOS)[number];
  creado: string;
}

interface OrdenApi {
  id: string;
  customer?: { name?: string } | null;
  total?: number | string;
  status?: string;
  createdAt?: string;
  riderName?: string | null;
}

const ESTADOS = ["confirmado", "preparando", "en_camino"] as const;

export function usePedidosPorRepartir(asignados: ReadonlySet<string>) {
  const [todos, setTodos] = useState<PedidoPorRepartir[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const listas = await Promise.all(
        ESTADOS.map(async (estado) => {
          const r = await tenantFetch(`/api/orders?status=${estado}&limit=50`);
          if (!r.ok) throw new Error(String(r.status));
          const d = (await r.json()) as unknown;
          const lista = (Array.isArray(d) ? d : []) as OrdenApi[];
          // «En camino» sólo si salió sin nadie que lo lleve.
          return estado === "en_camino" ? lista.filter((o) => !responsableDe(o as unknown as DbOrder)) : lista;
        }),
      );
      setTodos(
        listas
          .flat()
          .map((o) => ({
            id: o.id,
            codigo: `#${o.id.slice(-8)}`,
            cliente: o.customer?.name?.trim() || "Sin nombre",
            total: Number(o.total ?? 0),
            estado: (ESTADOS as readonly string[]).includes(o.status ?? "") ? (o.status as PedidoPorRepartir["estado"]) : "confirmado",
            creado: o.createdAt ?? "",
          }))
          // Los más viejos primero: son los que más esperan.
          .sort((a, b) => a.creado.localeCompare(b.creado)),
      );
    } catch {
      setTodos([]);
      setError("No se pudieron traer los pedidos por repartir.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const pedidos = todos.filter((p) => !asignados.has(p.id));
  return { pedidos, cargando, error, recargar: cargar };
}
