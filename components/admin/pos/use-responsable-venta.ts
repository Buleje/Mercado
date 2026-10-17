"use client";

/**
 * Quién responde por la venta (auditoría 15-10, H02/M02/M39).
 *
 * Una venta del mostrador queda a nombre de quien está logueado
 * (`Sale.cashierId = auth.username`, app/api/sales/route.ts) y por eso cuenta
 * para SU comisión, haya turno o no. El turno decide otra cosa: en qué cuadre
 * entra. El dueño ve el turno abierto de cualquiera (`/api/turnos/activo`), así
 * que «Turno abierto» podía ser el de la cajera mientras él vendía a su nombre.
 * Este hook junta las dos personas para que la barra las diga antes de vender.
 */

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";

export type ResponsableVenta = {
  /** `null` = todavía no se sabe. */
  turnoAbierto: boolean | null;
  /** Nombre de quien tiene el turno abierto. */
  turnoDe: string | null;
  /** ¿El turno abierto es de quien está logueado? */
  turnoEsMio: boolean;
  /** Primer nombre (o usuario) de quien está logueado: a quien queda la venta. */
  vendesComo: string | null;
};

type TurnoActivo = { turnoActivo?: boolean; turno?: { cajeroNombre?: string; esMio?: boolean } | null };

const primerNombre = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] || null;

export function useVendesComo(): string | null {
  const [yo, setYo] = useState<string | null>(null);
  useEffect(() => {
    cachedJson<{ name?: string | null; username?: string | null }>("/api/auth/me", 60_000)
      .then((d) => setYo(primerNombre(d?.name) ?? primerNombre(d?.username)))
      .catch(() => setYo(null));
  }, []);
  return yo;
}

/** `clave` = cuándo volver a preguntar (la sub-pestaña: se pudo abrir o cerrar un turno). */
export function useResponsableVenta(clave: string): ResponsableVenta {
  const vendesComo = useVendesComo();
  const [turno, setTurno] = useState<Omit<ResponsableVenta, "vendesComo">>({ turnoAbierto: null, turnoDe: null, turnoEsMio: false });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/turnos/activo", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<TurnoActivo>) : null))
      .then((d) => {
        if (!vivo || !d) return;
        const abierto = !!d.turnoActivo;
        setTurno({ turnoAbierto: abierto, turnoDe: abierto ? primerNombre(d.turno?.cajeroNombre) : null, turnoEsMio: abierto && !!d.turno?.esMio });
      })
      .catch((err) => console.warn("[pos] turno activo", err));
    return () => { vivo = false; };
  }, [clave, version]);

  // Abrir/cerrar desde Turnos: se refleja al instante y después se confirma de quién es.
  useEffect(() => {
    const alCambiar = (e: Event) => {
      const { abierto } = (e as CustomEvent<{ abierto: boolean }>).detail;
      setTurno((t) => ({ ...t, turnoAbierto: abierto }));
      setVersion((v) => v + 1);
    };
    window.addEventListener("buleje:turno-changed", alCambiar);
    return () => window.removeEventListener("buleje:turno-changed", alCambiar);
  }, []);

  return { ...turno, vendesComo };
}
