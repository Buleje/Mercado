"use client";

/**
 * useSemaforoPermiso — «cuánto le queda por producir» al permiso activo, para
 * el chip de la banda (`ContratoActivoChip`).
 *
 * Pide `?volumen=totales` (ADR-432, mismo cálculo que la ficha del permiso,
 * respuesta chica: sólo `{ totales }`) y lo pasa por `calcularSemaforoPermiso`
 * (`lib/forestal/semaforo-permiso.ts`, puro). El % que ve el operador sale de
 * las MISMAS dos cifras que la tarjeta «Saldo aserrable» de la ficha —
 * `saldoPt` sobre `aserrablePt` — nunca de una cuenta propia.
 *
 * Es información de apoyo, no un dato que bloquea nada: si el pedido falla,
 * el chip simplemente no muestra barra (sin barra ≠ error). Por eso no hay
 * `console.error` acá — un `logger.warn` alcanza para no perder el rastro sin
 * ensuciar la consola del operador.
 *
 * Se pide al montar, al cambiar el permiso activo (el `contratoId` que llega)
 * y al volver el foco a la pestaña — nunca bloquea el primer pintado del chip,
 * que ya se pinta con lo que trae `localStorage` (`contrato-activo-context`).
 *
 * Guarda contra carga vieja: si el operador cambia de permiso mientras el
 * pedido del anterior sigue en vuelo, esa respuesta llega igual pero se
 * descarta — pintar el semáforo de OTRO permiso bajo el código del actual es
 * peor que no mostrar nada (memoria `carga-vieja-pisa-lo-optimista`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import { calcularSemaforoPermiso, type SemaforoPermiso } from "@/lib/forestal/semaforo-permiso";
import type { TotalesDelPermiso } from "@/lib/forestal/volumen-del-permiso";

const BASE = "/api/admin/forestal/contratos";

export interface UseSemaforoPermisoResult {
  /** `null` mientras carga, si falló, o si el permiso no tiene ingreso (sin techo que medir). */
  semaforo: SemaforoPermiso | null;
  cargando: boolean;
}

export function useSemaforoPermiso(contratoId: string | null): UseSemaforoPermisoResult {
  const [semaforo, setSemaforo] = useState<SemaforoPermiso | null>(null);
  const [cargando, setCargando] = useState(false);
  /** Único contador: sólo la carga con el ticket más nuevo puede pintar. */
  const cargasRef = useRef(0);

  const cargar = useCallback(async (id: string) => {
    const esta = ++cargasRef.current;
    setCargando(true);
    try {
      const j = await ctpGet<{ totales?: TotalesDelPermiso }>(
        `${BASE}/${encodeURIComponent(id)}?volumen=totales`,
      );
      if (esta !== cargasRef.current) return;
      setSemaforo(j.totales ? calcularSemaforoPermiso(j.totales) : null);
    } catch (e) {
      if (esta !== cargasRef.current) return;
      // Sin barra y sin ruido: es apoyo, no un error del operador.
      setSemaforo(null);
      logger.warn("[use-semaforo-permiso] no se pudo cargar el semáforo del permiso", {
        contratoId: id,
        error: String(e),
      });
    } finally {
      if (esta === cargasRef.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!contratoId) {
      cargasRef.current += 1; // invalida cualquier pedido en vuelo del permiso anterior
      setSemaforo(null);
      setCargando(false);
      return;
    }
    // El permiso cambió: el semáforo del ANTERIOR no puede seguir pintado bajo
    // el código del nuevo mientras este carga (revisor 2026-09-25: quedaba el
    // "excedido" de A mostrado bajo el código de B). `cargar` invalida el
    // ticket del pedido en vuelo; esto limpia lo que ya está en pantalla.
    setSemaforo(null);
    void cargar(contratoId);

    const alVolverElFoco = () => {
      if (document.visibilityState === "visible") void cargar(contratoId);
    };
    window.addEventListener("focus", alVolverElFoco);
    document.addEventListener("visibilitychange", alVolverElFoco);
    return () => {
      window.removeEventListener("focus", alVolverElFoco);
      document.removeEventListener("visibilitychange", alVolverElFoco);
    };
  }, [contratoId, cargar]);

  return { semaforo, cargando };
}
