"use client";

/**
 * La bitácora de cobranza de «Me deben»: gestiones anotadas, promesas de pago,
 * puntualidad de cada cliente, los mensajes por tramo y la meta del mes.
 *
 * Salió de `cobranza/CobranzaView` (10-10) porque ya no la usa una sola
 * pestaña: «Quién debe» pinta la última gestión y la promesa, «Por vencer»
 * ordena las promesas por fecha, los Indicadores cuentan las incumplidas y el
 * menú «Más» abre los mensajes y la meta. Sin un dueño único cada uno pedía
 * las gestiones por su lado.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency } from "@/lib/currency";
import { logger } from "@/lib/logger";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { porcentajeATiempo } from "@/lib/fiados/reliability";
import { tramoDe, ultimaGestionPorCliente, type Gestion } from "@/lib/fiados/gestion-cobranza";
import { armarMensaje, guardarPlantillas, leerPlantillas, type Plantillas } from "@/lib/fiados/plantillas-cobranza";
import type { DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import { limaDateKey } from "@/lib/utils";
import { cobradoDesde, primeroDelMes, promesasDeQuienDebe } from "./cifras-me-deben";
import type { Fiado } from "./tipos";

/** La meta vive en el navegador — del negocio, no del sistema, cambia mes a mes. */
const CLAVE_META = "buleje:fiados-cobranza-meta";

export function useCobranza(fiados: readonly Fiado[]) {
  const [gestiones, setGestiones] = useState<Gestion[]>([]);
  const [plantillas, setPlantillas] = useState<Plantillas>(leerPlantillas);
  const [meta, setMeta] = useState(0);
  const [verPlantillas, setVerPlantillas] = useState(false);
  const [verMeta, setVerMeta] = useState(false);

  useEffect(() => {
    try {
      setMeta(Number(window.localStorage.getItem(tenantCacheKey(CLAVE_META))) || 0);
    } catch {
      /* sin persistencia, sin meta: la lista funciona igual */
    }
  }, []);

  const cargarGestiones = useCallback(async () => {
    try {
      const r = await fetch("/api/fiados/gestiones", { credentials: "include" });
      setGestiones(r.ok ? await r.json() : []);
    } catch (e) {
      logger.warn("[fiados-cobranza] no se pudieron traer las gestiones", { error: String(e) });
    }
  }, []);
  useEffect(() => { void cargarGestiones(); }, [cargarGestiones]);

  /*
   * Una sola lista de promesas para Indicadores, «Por vencer», «Quién debe» y
   * la lista de cobro: sólo de quien todavía debe (revisión 10-10).
   */
  const promesas = useMemo(() => promesasDeQuienDebe(gestiones, fiados), [gestiones, fiados]);
  const ultimas = useMemo(() => ultimaGestionPorCliente(gestiones), [gestiones]);

  /** % histórico de puntualidad de cada cliente, con sus fiados de siempre. */
  const cumplimientos = useMemo(() => {
    const porCliente = new Map<string, Fiado[]>();
    for (const f of fiados) {
      const lista = porCliente.get(f.customerId) ?? [];
      lista.push(f);
      porCliente.set(f.customerId, lista);
    }
    const out = new Map<string, number | null>();
    for (const [id, lista] of porCliente) out.set(id, porcentajeATiempo(lista));
    return out;
  }, [fiados]);

  /*
   * Lo cobrado en el mes, con las cuotas de TODOS los fiados. La pestaña de
   * Cobranza lo contaba sólo con los abiertos: el cliente que terminaba de
   * pagar este mes desaparecía de «Recuperado» (main 10-10: Resumen decía
   * S/ 5.00 cobrado y Cobranza S/ 0.00 recuperado, el mismo mes). El mes es
   * el de Lima, con la misma regla que hoy y la semana (revisión 10-10).
   */
  const recuperado = useMemo(() => cobradoDesde(fiados, primeroDelMes(limaDateKey())), [fiados]);

  const mensajeDe = useCallback(
    (d: Pick<DeudorCobranza, "nombre" | "saldo" | "dias">) =>
      armarMensaje(plantillas[tramoDe(d.dias)], { nombre: d.nombre, saldo: formatCurrency(d.saldo), dias: d.dias }),
    [plantillas],
  );

  const anotarRapido = useCallback(async (customerId: string, tipo: string) => {
    try {
      await fetch("/api/fiados/gestiones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ customerId, tipo }),
      });
    } catch (e) {
      logger.error("[fiados-cobranza] no se pudo anotar la gestión", { error: String(e) });
    }
  }, []);

  const guardarMensajes = (p: Plantillas) => {
    setPlantillas(p);
    guardarPlantillas(p);
    setVerPlantillas(false);
  };

  const guardarMeta = (m: number) => {
    setMeta(m);
    try {
      window.localStorage.setItem(tenantCacheKey(CLAVE_META), String(m));
    } catch {
      /* sin persistencia, sin bug: la sesión igual la usa */
    }
    setVerMeta(false);
  };

  return {
    gestiones, promesas, ultimas, cumplimientos, recuperado, meta, plantillas,
    cargarGestiones, mensajeDe, anotarRapido,
    verPlantillas, setVerPlantillas, guardarMensajes,
    verMeta, setVerMeta, guardarMeta,
  };
}

export type Cobranza = ReturnType<typeof useCobranza>;
