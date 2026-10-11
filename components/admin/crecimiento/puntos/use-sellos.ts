"use client";

/**
 * Tarjeta de sellos en Campañas › Puntos (`/api/loyalty/sellos`): la config,
 * a quién le toca premio (para marcarlo en la lista) y la tarjeta del cliente
 * elegido. La cuenta la hace el servidor (`lib/loyalty/sellos.ts`).
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CanjeSellos, ConfigSellos, EstadoSellos } from "@/lib/loyalty/sellos";

export interface TarjetaDeCliente {
  phone: string;
  estado: EstadoSellos | null;
  canjes: CanjeSellos[];
}

const URL = "/api/loyalty/sellos";
const JSON_CSRF = () => csrfHeaders({ "Content-Type": "application/json" });

export function useSellos(phone: string | null) {
  const [config, setConfig] = useState<ConfigSellos | null>(null);
  const [premios, setPremios] = useState<Record<string, number>>({});
  const [tarjeta, setTarjeta] = useState<TarjetaDeCliente | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargarResumen = useCallback(async () => {
    const r = await fetch(URL).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { config: ConfigSellos | null; premios: Record<string, number> };
    setConfig(d.config);
    setPremios(d.premios ?? {});
  }, []);

  useEffect(() => { void cargarResumen(); }, [cargarResumen]);

  useEffect(() => {
    if (!phone) return;
    let vivo = true;
    setCargando(true);
    void fetch(`${URL}?phone=${encodeURIComponent(phone)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { estado: EstadoSellos | null; canjes: CanjeSellos[] } | null) => {
        if (vivo && d) setTarjeta({ phone, estado: d.estado, canjes: d.canjes ?? [] });
      })
      .catch(() => { if (vivo) setTarjeta(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [phone, config]);

  const guardar = async (nueva: ConfigSellos): Promise<string | null> => {
    const r = await fetch(URL, { method: "PUT", headers: JSON_CSRF(), body: JSON.stringify(nueva) }).catch(() => null);
    if (!r?.ok) return ((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar";
    setConfig(nueva);
    await cargarResumen();
    return null;
  };

  /** Marca el premio de `phone` canjeado. Devuelve el error para mostrar, o null. */
  const canjear = async (tel: string): Promise<string | null> => {
    const r = await fetch(URL, { method: "POST", headers: JSON_CSRF(), body: JSON.stringify({ phone: tel }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { error?: string; estado?: EstadoSellos } | null;
    if (!r?.ok || !d?.estado) return d?.error ?? "No se pudo marcar";
    const estado = d.estado;
    setTarjeta((t) => (t && t.phone === tel ? { ...t, estado } : t));
    await cargarResumen();
    return null;
  };

  return { config, premios, tarjeta: tarjeta && tarjeta.phone === phone ? tarjeta : null, cargando, guardar, canjear };
}

export type Sellos = ReturnType<typeof useSellos>;
