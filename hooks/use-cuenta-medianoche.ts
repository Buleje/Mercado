"use client";

import { useEffect, useState } from "react";
import { limaDateKey } from "@/lib/utils";

/**
 * Cuenta regresiva a la medianoche de LIMA (no a la del navegador: un vecino
 * con el celular en otra zona veía otra hora de cierre). Perú no tiene horario
 * de verano, así que la medianoche de hoy es «<día de Lima>T00:00-05:00» + 24 h.
 *
 * Devuelve `null` hasta montar: el servidor no sabe la hora del cliente y un
 * texto distinto entre SSR y cliente rompe la hidratación.
 */
export interface CuentaMedianoche {
  horas: number;
  minutos: number;
  segundos: number;
  /** «05:12:33», para pintar con tabular-nums. */
  texto: string;
  /** «5 h 12 min»: lo que lee el lector de pantalla (cambia una vez por minuto). */
  resumen: string;
}

const DIA_MS = 86_400_000;

function medianocheDeLima(ahora: number): number {
  const hoy = limaDateKey(ahora); // «2026-10-10» en America/Lima
  return Date.parse(`${hoy}T00:00:00-05:00`) + DIA_MS;
}

/** Pura, para el test: cuánto falta desde `ahora` (ms) a la medianoche de Lima. */
export function calcularCuentaMedianoche(ahora: number): CuentaMedianoche {
  const falta = Math.max(0, medianocheDeLima(ahora) - ahora);
  const horas = Math.floor(falta / 3_600_000);
  const minutos = Math.floor((falta % 3_600_000) / 60_000);
  const segundos = Math.floor((falta % 60_000) / 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return {
    horas,
    minutos,
    segundos,
    texto: `${dos(horas)}:${dos(minutos)}:${dos(segundos)}`,
    resumen: horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`,
  };
}

export function useCuentaMedianoche(activa = true): CuentaMedianoche | null {
  const [cuenta, setCuenta] = useState<CuentaMedianoche | null>(null);

  useEffect(() => {
    if (!activa) return;
    // Se recalcula desde Date.now() en cada tic: si el navegador frena el
    // intervalo con la pestaña oculta, al volver la cifra ya es la correcta.
    const tic = () => setCuenta(calcularCuentaMedianoche(Date.now()));
    tic();
    const id = window.setInterval(tic, 1000);
    return () => window.clearInterval(id);
  }, [activa]);

  return activa ? cuenta : null;
}
