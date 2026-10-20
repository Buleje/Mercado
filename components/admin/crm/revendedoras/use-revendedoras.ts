"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type {
  ConfigRevendedoras,
  CotizacionRevendedora,
  ProductoPrecios,
  ResumenRevendedoras,
  RevendedoraFila,
} from "@/lib/revendedoras/reglas";

const RUTA = "/api/admin/revendedoras";

export interface DatosRevendedoras {
  config: ConfigRevendedoras;
  porDefecto: ConfigRevendedoras;
  categorias: string[];
  revendedoras: RevendedoraFila[];
  resumen: ResumenRevendedoras;
}

export interface CandidataRevendedora {
  customerId: string;
  nombre: string;
  celular: string;
  pueblo: string;
  listaPrecio: string | null;
}

export interface PedidoCotizado {
  cotizacion: CotizacionRevendedora;
  faltan: number[];
  revendedora: { nombre: string; celular: string } | null;
}

type Resultado = { ok: true } | { ok: false; error: string };

async function errorDe(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? `No se pudo (${res.status}).`;
}

async function postear(body: unknown): Promise<Response> {
  return fetch(RUTA, { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
}

/** La lista del mes, las reglas y las escrituras (marcar, quitar, guardar reglas). */
export function useRevendedoras() {
  const [datos, setDatos] = useState<DatosRevendedoras | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(RUTA, { cache: "no-store" });
      if (!res.ok) throw new Error(await errorDe(res));
      setDatos((await res.json()) as DatosRevendedoras);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const escribir = useCallback(
    async (hacer: () => Promise<Response>): Promise<Resultado> => {
      try {
        const res = await hacer();
        if (!res.ok) return { ok: false, error: await errorDe(res) };
        await recargar();
        return { ok: true };
      } catch {
        return { ok: false, error: "Sin conexión: no se guardó." };
      }
    },
    [recargar],
  );

  const guardarConfig = useCallback(
    (config: ConfigRevendedoras) =>
      escribir(() => fetch(RUTA, { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(config) })),
    [escribir],
  );
  const marcar = useCallback((customerId: string) => escribir(() => postear({ accion: "marcar", customerId })), [escribir]);
  const quitar = useCallback((customerId: string) => escribir(() => postear({ accion: "quitar", customerId })), [escribir]);

  return { datos, cargando, error, recargar, guardarConfig, marcar, quitar };
}

export async function buscarCandidatas(q: string): Promise<CandidataRevendedora[]> {
  const res = await fetch(`${RUTA}?vista=candidatas&q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await errorDe(res));
  return ((await res.json()) as { candidatas: CandidataRevendedora[] }).candidatas;
}

export async function leerPrecios(): Promise<{ config: ConfigRevendedoras; productos: ProductoPrecios[] }> {
  const res = await fetch(`${RUTA}?vista=precios`, { cache: "no-store" });
  if (!res.ok) throw new Error(await errorDe(res));
  return (await res.json()) as { config: ConfigRevendedoras; productos: ProductoPrecios[] };
}

/** El servidor cobra: precio y costo de la base, nivel con lo comprado en el mes. */
export async function cotizarPedido(customerId: string | null, items: { productId: number; cantidad: number }[]): Promise<PedidoCotizado> {
  const res = await postear({ accion: "cotizar", customerId, items });
  if (!res.ok) throw new Error(await errorDe(res));
  return (await res.json()) as PedidoCotizado;
}
