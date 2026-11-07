"use client";

/**
 * Las casillas «Distribuido», la firma del Anexo 04 (y, vía sus hooks, el
 * nombre de «Sin marcar» y los códigos) guardadas por negocio en el servidor:
 * lo que se marca en la oficina se ve en el celular del monte (Brandon,
 * 2026-10-19). Ver `lib/forestal/reparto-sync-cliente.ts`.
 *
 * `localStorage` pinta al instante y queda como respaldo sin señal; cuando
 * llega lo del servidor, manda eso (con lo que falte mandar encima).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { marcadasDe, type CambioReparto, type EstadoReparto } from "@/lib/forestal/reparto-marcas-sync";
import { clavesLocalesReparto, syncDelReparto, type DepsSync } from "@/lib/forestal/reparto-sync-cliente";

const sinSuscripcion = () => () => {};
const nada = () => null;

const depsDelNavegador = (): DepsSync => ({
  fetch: (url, init) => fetch(url, init),
  almacen: typeof window === "undefined" ? null : window.localStorage,
  cabeceras: (basicas) => csrfHeaders(basicas),
  avisar: (msg, datos) => logger.warn(msg, datos),
});

export interface RepartoServidor {
  /** Lo del servidor con la cola encima; `null` mientras no se sepa (o sin señal). */
  estado: EstadoReparto | null;
  encolar: (c: CambioReparto) => void;
}

/** `base` = `buleje-cubicacion-{slug}` (la misma de la hoja). */
export function useRepartoServidor(base: string): RepartoServidor {
  const sync = useMemo(() => (typeof window === "undefined" ? null : syncDelReparto(base, depsDelNavegador)), [base]);
  const estado = useSyncExternalStore(sync?.suscribir ?? sinSuscripcion, sync?.estado ?? nada, nada);
  useEffect(() => {
    if (!sync) return;
    sync.traer().catch((err: unknown) => logger.warn("[reparto] traer falló", { error: String(err) }));
  }, [sync]);
  const encolar = useCallback((c: CambioReparto) => sync?.encolar(c), [sync]);
  return { estado, encolar };
}

const mismas = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((k) => b.has(k));

function escribir(clave: string, valor: string | null): void {
  try {
    if (valor == null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch { /* quota */ }
}

/** Las casillas «Distribuido». `marcar(claves, estado?)`: `estado` fuerza el valor (para «todo el día»). */
export function useMarcasReparto(base: string, reparto: RepartoServidor) {
  const clave = clavesLocalesReparto(base).marcas;
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set());
  const ref = useRef(marcadas);
  ref.current = marcadas;

  /* Se lee tras montar: el servidor no ve localStorage. */
  useEffect(() => {
    try {
      const m = localStorage.getItem(clave);
      if (m) setMarcadas(new Set(JSON.parse(m) as string[]));
    } catch { /* ignore */ }
  }, [clave]);

  /* Llegó lo del servidor (o la cola cambió): manda eso. */
  useEffect(() => {
    if (!reparto.estado) return;
    const s = marcadasDe(reparto.estado);
    if (mismas(s, ref.current)) return;
    setMarcadas(s);
    escribir(clave, JSON.stringify([...s]));
  }, [reparto.estado, clave]);

  const { encolar } = reparto;
  const marcar = useCallback(
    (claves: string[], estado?: boolean) => {
      const prev = ref.current;
      const encender = estado ?? !claves.every((k) => prev.has(k));
      const next = new Set(prev);
      for (const k of claves) {
        if (encender) next.add(k); else next.delete(k);
      }
      ref.current = next;
      setMarcadas(next);
      escribir(clave, JSON.stringify([...next]));
      const at = Date.now();
      encolar({ marcas: Object.fromEntries(claves.map((k) => [k, { on: encender, at }])) });
    },
    [clave, encolar],
  );
  return { marcadas, marcar };
}

/** Nombre y cargo de quien firma el Anexo 04 (sale igual en cualquier dispositivo). */
export function useFirmaReparto(base: string, reparto: RepartoServidor) {
  const clave = clavesLocalesReparto(base).firma;
  const [firma, setFirma] = useState({ nombre: "", cargo: "" });
  const ref = useRef(firma);
  ref.current = firma;

  useEffect(() => {
    try {
      const f = localStorage.getItem(clave);
      if (f) {
        const j = JSON.parse(f) as { nombre?: string; cargo?: string };
        setFirma({ nombre: j.nombre ?? "", cargo: j.cargo ?? "" });
      }
    } catch { /* ignore */ }
  }, [clave]);

  const remota = reparto.estado?.firma;
  useEffect(() => {
    if (!remota) return;
    if (remota.nombre === ref.current.nombre && remota.cargo === ref.current.cargo) return;
    const f = { nombre: remota.nombre, cargo: remota.cargo };
    setFirma(f);
    escribir(clave, JSON.stringify(f));
  }, [remota, clave]);

  /* Se escribe al tiro del cambio, no desde un efecto que mira la firma: ese
     efecto corría en el mismo commit del montaje y pisaba lo leído con "" (auditoría 2026-08-17). */
  const { encolar } = reparto;
  const cambiar = useCallback(
    (parte: Partial<{ nombre: string; cargo: string }>) => {
      const f = { ...ref.current, ...parte };
      ref.current = f;
      setFirma(f);
      escribir(clave, JSON.stringify(f));
      encolar({ firma: { ...f, at: Date.now() } });
    },
    [clave, encolar],
  );
  return {
    firmaNombre: firma.nombre,
    firmaCargo: firma.cargo,
    guardarFirmaNombre: (nombre: string) => cambiar({ nombre }),
    guardarFirmaCargo: (cargo: string) => cambiar({ cargo }),
  };
}
