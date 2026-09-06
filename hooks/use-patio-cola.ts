"use client";

/**
 * use-patio-cola — estado de las anotaciones del patio (sin señal).
 *
 * Escucha `online`/`offline` y sincroniza sola al volver la conexión. También
 * reintenta cada tanto estando online: el `online` del navegador miente seguido
 * en el patio (wifi conectado, sin salida real a internet).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { contar, EVENTO_CAMBIO, listar, reintentar, sincronizar, type AnotacionPatio } from "@/lib/forestal/patio-cola";

/** Cada cuánto se reintenta estando online (ms). */
const LATIDO = 60_000;

export interface PatioColaState {
  online: boolean;
  lista: AnotacionPatio[];
  pendientes: number;
  rechazadas: number;
  sincronizando: boolean;
  /** Sube lo que se pueda ahora mismo. */ sincronizar: () => Promise<void>;
  /** Relee la bandeja (después de anotar algo nuevo). */ refrescar: () => Promise<void>;
  /** Vuelve a poner en cola una rechazada, tras corregir el libro. */ reencolar: (id: string) => Promise<void>;
}

export function usePatioCola(): PatioColaState {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [lista, setLista] = useState<AnotacionPatio[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [rechazadas, setRechazadas] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const corriendo = useRef(false);

  const refrescar = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([listar(), contar()]);
      setLista(l);
      setPendientes(c.pendientes);
      setRechazadas(c.rechazadas);
    } catch {
      // Sin IndexedDB (modo privado / navegador viejo) el patio no queda roto:
      // simplemente no hay bandeja y el formulario sigue exigiendo conexión.
    }
  }, []);

  const sync = useCallback(async () => {
    if (corriendo.current) return;
    corriendo.current = true;
    setSincronizando(true);
    try {
      await sincronizar();
      await refrescar();
    } catch {
      // Un fallo de sync no rompe la pantalla: queda para el próximo latido.
    } finally {
      corriendo.current = false;
      setSincronizando(false);
    }
  }, [refrescar]);

  const reencolar = useCallback(async (id: string) => {
    await reintentar(id);
    await sync();
  }, [sync]);

  useEffect(() => {
    void refrescar();
    const alVolver = () => { setOnline(true); void sync(); };
    const alCaerse = () => setOnline(false);
    const alAnotar = () => { void refrescar(); };
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alCaerse);
    window.addEventListener(EVENTO_CAMBIO, alAnotar);
    const t = setInterval(() => { if (navigator.onLine) void sync(); }, LATIDO);
    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alCaerse);
      window.removeEventListener(EVENTO_CAMBIO, alAnotar);
      clearInterval(t);
    };
  }, [refrescar, sync]);

  return { online, lista, pendientes, rechazadas, sincronizando, sincronizar: sync, refrescar, reencolar };
}
