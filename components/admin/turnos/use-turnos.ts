"use client";

/**
 * Datos de la pestaña Turnos: el turno abierto, el historial (con nombre y
 * diferencia del servidor), las cajeras para asignar y las ventas EN VIVO del
 * turno abierto por medio de pago.
 *
 * «En vivo» existe porque `turno.ventasTotal` vale 0 hasta el cierre (el
 * servidor la suma al cerrar): la tarjeta del turno decía «Ventas S/ 0.00» toda
 * la jornada. GET /api/turnos/[id]/summary ya servía con el turno abierto.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { Cajero, ResumenServidor, Turno } from "./tipos";

const REFRESCO_EN_VIVO_MS = 60_000;

export function useTurnos() {
  const [turnoActivo, setTurnoActivo] = useState<Turno | null>(null);
  const [historial, setHistorial] = useState<Turno[]>([]);
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [cajerosLoading, setCajerosLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  /** Error al abrir (p. ej. 409 «ya tiene un turno abierto»): va en línea, no reemplaza la pantalla. */
  const [errorAbrir, setErrorAbrir] = useState<string | null>(null);
  const [enVivo, setEnVivo] = useState<ResumenServidor | null>(null);
  /** Reloj por minuto: el aviso de las 10 h y el «abierto hace» avanzan con la pestaña abierta toda la jornada. */
  const [ahora, setAhora] = useState(() => Date.now());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activoRes, histRes] = await Promise.all([
        fetch("/api/turnos/activo"),
        fetch("/api/turnos?status=CERRADO"),
      ]);
      if (activoRes.ok) {
        const { turno } = await activoRes.json();
        setTurnoActivo(turno ?? null);
      } else {
        setTurnoActivo(null);
      }
      if (histRes.ok) setHistorial((await histRes.json()) as Turno[]);

      // Cajeras para asignar: la lista es sólo de admin (403 para el resto → lista vacía).
      setCajerosLoading(true);
      try {
        const cajerosRes = await fetch("/api/admin-users");
        if (cajerosRes.ok) {
          const users = await cajerosRes.json();
          setCajeros(Array.isArray(users) ? users.filter((u: { active: boolean }) => u.active) : []);
        }
      } catch { /* sin lista: «Yo mismo» sigue disponible */ }
      setCajerosLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar turnos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Ventas en vivo del turno abierto (cada minuto mientras la pestaña está a la vista).
  const turnoActivoId = turnoActivo?.id ?? null;
  useEffect(() => {
    if (!turnoActivoId) { setEnVivo(null); return; }
    let cancelado = false;
    const cargar = () => {
      if (document.visibilityState === "hidden") return;
      fetch(`/api/turnos/${turnoActivoId}/summary`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ResumenServidor | null) => { if (!cancelado && d) setEnVivo(d); })
        .catch((err) => console.warn("[Turnos] ventas en vivo (la tarjeta sigue con la última cifra)", err));
    };
    cargar();
    const id = window.setInterval(cargar, REFRESCO_EN_VIVO_MS);
    return () => { cancelado = true; window.clearInterval(id); };
  }, [turnoActivoId]);

  useEffect(() => {
    if (!turnoActivoId) return;
    const id = window.setInterval(() => setAhora(Date.now()), REFRESCO_EN_VIVO_MS);
    return () => window.clearInterval(id);
  }, [turnoActivoId]);

  const abrirTurno = useCallback(async (monto: number, cajeroId: string): Promise<boolean> => {
    if (isNaN(monto) || monto < 0) return false;
    setOpening(true);
    setErrorAbrir(null);
    try {
      const body: Record<string, unknown> = { inicioEfectivo: monto };
      if (cajeroId) body.adminUserId = cajeroId;
      const res = await fetch("/api/turnos", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || "Error al abrir turno");
      }
      fetchData();
      window.dispatchEvent(new CustomEvent("buleje:turno-changed", { detail: { abierto: true } }));
      return true;
    } catch (e) {
      setErrorAbrir(e instanceof Error ? e.message : "Error");
      return false;
    } finally {
      setOpening(false);
    }
  }, [fetchData]);

  /** Alta de cajera sin salir de Turnos. Devuelve el id creado o lanza con el mensaje del servidor. */
  const crearCajera = useCallback(async (datos: { name: string; username: string; password: string }): Promise<string> => {
    const res = await fetch("/api/admin-users", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ...datos, role: "cajero" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Límite del plan 402, repetido 409, validación 400.
      const msg = typeof data?.error === "string" ? data.error : data?.error?.message ?? "No se pudo crear la cajera";
      throw new Error(msg);
    }
    const created = data as { id: string; username: string; name: string; role: string; active?: boolean };
    setCajeros((prev) => [...prev, { ...created, active: created.active ?? true }]);
    return created.id;
  }, []);

  return {
    turnoActivo, historial, cajeros, cajerosLoading, loading, error, errorAbrir, opening, enVivo, ahora,
    fetchData, abrirTurno, crearCajera,
  };
}
