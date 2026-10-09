"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { limaDateKey } from "@/lib/utils";
import { REGLA_GENERAL, type Rango, type ReglaComision, type ResultadoComisiones } from "@/lib/comisiones/calcular";

export type Periodo = "semana" | "mes" | "mes-anterior" | "fechas";

export const PERIODOS: { id: Periodo; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "mes-anterior", label: "Mes anterior" },
  { id: "fechas", label: "Elegir fechas" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Desde/hasta (YYYY-MM-DD, día de Lima) de cada período. */
export function rangoDelPeriodo(p: Periodo, hoy: string, propio: { desde: string; hasta: string }): { desde: string; hasta: string } {
  const [y, m, d] = hoy.split("-").map(Number);
  if (p === "semana") {
    const fecha = new Date(Date.UTC(y, m - 1, d));
    fecha.setUTCDate(fecha.getUTCDate() - ((fecha.getUTCDay() + 6) % 7));
    return { desde: fecha.toISOString().slice(0, 10), hasta: hoy };
  }
  if (p === "mes-anterior") {
    const fin = new Date(Date.UTC(y, m - 1, 0));
    return { desde: `${fin.getUTCFullYear()}-${pad(fin.getUTCMonth() + 1)}-01`, hasta: fin.toISOString().slice(0, 10) };
  }
  if (p === "fechas" && propio.desde && propio.hasta) return propio;
  return { desde: `${y}-${pad(m)}-01`, hasta: hoy };
}

type Usuario = { username: string; name?: string };

/** Porcentajes que la pantalla vieja guardaba sólo en ESTA computadora. */
const CLAVE_LOCAL = "commission_rates";
type TasasLocales = { defaultRate?: number; customRates?: Record<string, number> };

export function useComisiones() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [propio, setPropio] = useState({ desde: "", hasta: "" });
  const [datos, setDatos] = useState<ResultadoComisiones | null>(null);
  const [reglas, setReglas] = useState<ReglaComision[]>([]);
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locales, setLocales] = useState<TasasLocales | null>(null);
  const pedido = useRef(0);

  const rango = useMemo(() => rangoDelPeriodo(periodo, limaDateKey(), propio), [periodo, propio]);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setLoading(true);
    setError(null);
    try {
      const [rc, rr] = await Promise.all([
        fetch(`/api/commissions/calculo?from=${rango.desde}&to=${rango.hasta}`),
        fetch("/api/commission-rules"),
      ]);
      const cuerpo = await rc.json().catch(() => null);
      if (!rc.ok) throw new Error(typeof cuerpo?.error === "string" ? cuerpo.error : `No se pudo calcular (error ${rc.status}).`);
      const listaReglas: unknown = rr.ok ? await rr.json() : [];
      if (n !== pedido.current) return;
      setDatos(cuerpo as ResultadoComisiones);
      setReglas(Array.isArray(listaReglas) ? (listaReglas as ReglaComision[]).map((r) => ({ ...r, minSales: Number(r.minSales), maxSales: r.maxSales == null ? null : Number(r.maxSales), rate: Number(r.rate) })) : []);
    } catch (err) {
      if (n === pedido.current) setError(err instanceof Error ? err.message : "Sin conexión con el servidor.");
    } finally {
      if (n === pedido.current) setLoading(false);
    }
  }, [rango.desde, rango.hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin-users")
      .then((r) => (r.ok ? r.json() : []))
      .then((u: unknown) => { if (vivo && Array.isArray(u)) setEquipo(u as Usuario[]); })
      .catch((err) => console.warn("[useComisiones] admin-users", err));
    try {
      const crudo = localStorage.getItem(CLAVE_LOCAL);
      if (crudo) setLocales(JSON.parse(crudo) as TasasLocales);
    } catch (err) {
      console.warn("[useComisiones] tasas locales ilegibles", err);
    }
    return () => { vivo = false; };
  }, []);

  const nombreDe = useCallback(
    (id: string) => (id === REGLA_GENERAL ? "Todo el equipo" : equipo.find((u) => u.username === id)?.name || id),
    [equipo],
  );

  async function enviar(url: string, init: RequestInit): Promise<string | null> {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...csrfHeaders() } });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return typeof body?.error === "string" ? body.error : `Error ${res.status}`;
  }

  const agregarRegla = async (r: { cashierId: string; minSales: number; maxSales: number | null; rate: number }) => {
    const label = r.cashierId === REGLA_GENERAL ? "General" : nombreDe(r.cashierId);
    const err = await enviar("/api/commission-rules", { method: "POST", body: JSON.stringify({ ...r, label }) });
    if (!err) await cargar();
    return err;
  };

  const borrarRegla = async (id: string) => {
    const err = await enviar(`/api/commission-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!err) await cargar();
    return err;
  };

  /** Pasa al sistema los porcentajes que estaban sólo en esta computadora (no borra el local). */
  const pasarLocales = async () => {
    if (!locales) return null;
    const altas: { cashierId: string; rate: number }[] = [];
    if (typeof locales.defaultRate === "number") altas.push({ cashierId: REGLA_GENERAL, rate: locales.defaultRate });
    for (const [id, rate] of Object.entries(locales.customRates ?? {})) if (id !== "unknown" && typeof rate === "number") altas.push({ cashierId: id, rate });
    for (const a of altas) {
      const err = await enviar("/api/commission-rules", {
        method: "POST",
        body: JSON.stringify({ cashierId: a.cashierId, label: a.cashierId === REGLA_GENERAL ? "General" : nombreDe(a.cashierId), minSales: 0, maxSales: null, rate: a.rate }),
      });
      if (err) return err;
    }
    setLocales(null);
    await cargar();
    return null;
  };

  /**
   * Paga el período de la cifra que se vio (`datos.desde/hasta`, no el que se
   * está cargando) con el monto que se vio: si cambió, el servidor responde 409.
   * Con error también recarga: el 409 trae otra cifra o un cruce que mostrar.
   */
  const pagar = async (cashierId: string, paymentMethod: string, periodoVisto: Rango, montoVisto: number) => {
    const err = await enviar("/api/commissions/pagar", {
      method: "POST",
      body: JSON.stringify({ cashierId, from: periodoVisto.desde, to: periodoVisto.hasta, paymentMethod, montoVisto }),
    });
    await cargar();
    return err;
  };

  /** «Ver del 01/09 al 28/09»: los días que un pago cruzado deja libres. */
  const verRango = (r: Rango) => {
    setPropio(r);
    setPeriodo("fechas");
  };

  return {
    periodo, setPeriodo, propio, setPropio, rango, datos, reglas, equipo, loading, error, cargar,
    nombreDe, agregarRegla, borrarRegla, pagar, verRango,
    // Sólo ofrece pasarlos si el sistema todavía no tiene reglas propias.
    // La pantalla vieja escribía {defaultRate: 2, customRates: {}} en toda
    // computadora que la abría: eso no es una regla de nadie, no se ofrece.
    localesPendientes:
      reglas.length === 0 && locales && (Object.keys(locales.customRates ?? {}).length > 0 || (locales.defaultRate ?? 2) !== 2)
        ? locales
        : null,
    pasarLocales,
  };
}
