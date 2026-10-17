"use client";

/**
 * useUbicacionEnVivo — la ubicación del cliente en tiempo real (GPS del celular)
 * para que el negocio sepa adónde llevar el pedido. Contrato en
 * `lib/tienda-cliente/contrato.ts`.
 *
 * - `pedir()` abre el permiso del navegador y empieza a seguir la posición con
 *   `watchPosition` (alta precisión). Llamarlo desde un clic: Safari y Chrome
 *   piden el permiso mejor cuando viene de un gesto.
 * - `detener()` deja de seguir (la última lectura queda en `ubicacion`).
 * - Al desmontar se limpia solo.
 * - Fuera de `https://` (salvo localhost) el navegador no da GPS → `no-soportada`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EstadoUbicacion, UbicacionEnVivo } from "@/lib/tienda-cliente/contrato";

/** `https://maps.google.com/?q=<lat>,<lng>` con 6 decimales (~10 cm). */
export function enlaceMapaDe(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export interface UsoUbicacionEnVivo {
  estado: EstadoUbicacion;
  ubicacion: UbicacionEnVivo | null;
  /** true mientras el GPS sigue mandando lecturas (entre `pedir` y `detener`). */
  siguiendo: boolean;
  pedir: () => void;
  detener: () => void;
}

const OPCIONES_GPS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 20_000,
};

export function useUbicacionEnVivo(): UsoUbicacionEnVivo {
  const [estado, setEstado] = useState<EstadoUbicacion>("inactiva");
  const [ubicacion, setUbicacion] = useState<UbicacionEnVivo | null>(null);
  const [siguiendo, setSiguiendo] = useState(false);
  const watchId = useRef<number | null>(null);

  const detener = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    setSiguiendo(false);
    setEstado((e) => (e === "pidiendo" ? "inactiva" : e));
  }, []);

  const pedir = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("no-soportada");
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setEstado("no-soportada");
      return;
    }
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    setEstado((e) => (e === "ok" ? "ok" : "pidiendo"));
    setSiguiendo(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setUbicacion({
          lat,
          lng,
          precision: Math.round(accuracy),
          enlaceMapa: enlaceMapaDe(lat, lng),
          leidaEn: pos.timestamp || Date.now(),
        });
        setEstado("ok");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
          setSiguiendo(false);
          setEstado("denegada");
          return;
        }
        // TIMEOUT / POSITION_UNAVAILABLE: si ya hay una lectura, se conserva y se sigue mirando.
        setEstado((e) => (e === "ok" ? "ok" : "error"));
      },
      OPCIONES_GPS,
    );
  }, []);

  useEffect(
    () => () => {
      if (watchId.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      watchId.current = null;
    },
    [],
  );

  return { estado, ubicacion, siguiendo, pedir, detener };
}
