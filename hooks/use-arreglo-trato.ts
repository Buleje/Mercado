"use client";

/**
 * El aviso «el trato empieza después de la corrida» de UN cliente y su arreglo
 * de un clic (ADR-430, caso WASACO 23-09). La propuesta —qué corridas, cuántos
 * PT, cuánto se carga— la arma el servidor con la misma cotización que cobra;
 * acá sólo se lee y se manda.
 *
 * Tras arreglar se avisa `forestal:tratos-cliente`: la ficha, Declarar
 * producción y el cobro abiertos vuelven a leer el trato ya adelantado.
 *
 * `parteId` null = no se pide nada (una parte que no es cliente).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type {
  ArregloTratoInput,
  PropuestaDelTrato,
  ResultadoDelArreglo,
} from "@/lib/forestal/trato-sin-cobrar";
import { EVENTO_TRATOS_CLIENTE, avisarCambioDeTratos, type DetalleTratosCliente } from "./use-tarifas-cliente";

const URL_VIGENCIA = "/api/admin/forestal/tarifas-cliente/vigencia";

/**
 * Adelanta el trato y/o cobra lo que cubre. Tira con el `message` del servidor
 * (409 «el trato cambió», 422, 403 por rol) para que la pantalla lo muestre.
 */
export async function arreglarTrato(input: ArregloTratoInput): Promise<ResultadoDelArreglo> {
  const r = await fetch(URL_VIGENCIA, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const j = (await r.json().catch(() => ({}))) as Partial<ResultadoDelArreglo> & { message?: string; error?: string };
  if (r.status === 403 && !j.message) throw new Error("Sólo el dueño o un administrador puede cambiar el trato.");
  if (!r.ok) throw new Error(j.message ?? j.error ?? `No se pudo arreglar el trato (${r.status})`);
  avisarCambioDeTratos(input.parteId);
  return j as ResultadoDelArreglo;
}

/**
 * La propuesta del arreglo para un cliente. `desde` = para adelantar a ESA
 * fecha (la línea del trato); sin él, la de la ficha (la corrida más vieja).
 * `propuesta` es siempre la del pedido de AHORA: al cambiar de cliente o de
 * fecha se vacía hasta que llega la nueva — mostrar la de otro cliente junto a
 * un botón que cobra sería peor que no mostrar nada.
 */
export function useArregloTrato(parteId: string | null | undefined, opts: { desde?: string | null } = {}) {
  const [propuesta, setPropuesta] = useState<PropuestaDelTrato | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const pedido = useRef(0);
  const desde = opts.desde?.trim() || null;

  const cargar = useCallback(async () => {
    const id = parteId?.trim();
    const mio = ++pedido.current;
    if (!id) {
      setPropuesta(null);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setPropuesta((p) => (p && p.parteId === id && (p.desde ?? null) === desde ? p : null));
    try {
      const q = new URLSearchParams({ parteId: id });
      if (desde) q.set("desde", desde);
      const r = await fetch(`${URL_VIGENCIA}?${q.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`No se pudo revisar lo cobrado con su trato (${r.status})`);
      const j = (await r.json()) as PropuestaDelTrato;
      if (mio === pedido.current) {
        setPropuesta(j);
        setError(null);
      }
    } catch (e) {
      if (mio === pedido.current) setError(e instanceof Error ? e.message : String(e));
      logger.warn("[arreglo-trato] lectura fallida", { parteId: id, error: String(e) });
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, [parteId, desde]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* Se guardó, quitó o adelantó un trato de ESTE cliente (acá o en otra
     pantalla): la propuesta puede haber cambiado. */
  useEffect(() => {
    const alCambiar = (e: Event) => {
      const d = (e as CustomEvent<DetalleTratosCliente>).detail;
      if (d && d.parteId === parteId?.trim()) void cargar();
    };
    window.addEventListener(EVENTO_TRATOS_CLIENTE, alCambiar);
    return () => window.removeEventListener(EVENTO_TRATOS_CLIENTE, alCambiar);
  }, [cargar, parteId]);

  return { propuesta, error, cargando, recargar: cargar };
}
