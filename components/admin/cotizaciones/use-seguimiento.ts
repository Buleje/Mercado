"use client";

/**
 * Recordatorios a clientes (F31). El mensaje sale del WhatsApp de quien toca
 * «Recordar»; el servidor sólo anota quién y cuándo, para que nadie del equipo
 * le escriba dos veces el mismo día. Si ya se le recordó hace menos de 24 h,
 * primero se pregunta («Ya le recordó Ana hace 3 h. ¿Recordar igual?»).
 */
import { useCallback, useEffect, useState } from "react";
import { useMembrete } from "@/hooks/use-membrete";
import { recordatorioReciente, type Recordatorio } from "@/lib/cotizaciones/modelos";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { abrirWhatsApp, textoRecordatorio, type Cotizacion } from "./tipos";

type Confirmar = { c: Cotizacion; ultimo: Recordatorio };

/** «hace 3 h», «hace 2 días», «hace un rato». */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.max(0, Math.floor((ahora - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(min) || min < 60) return "hace un rato";
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export function useSeguimiento() {
  const membrete = useMembrete();
  const [recordatorios, setRecordatorios] = useState<Record<string, Recordatorio[]>>({});
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/cotizaciones/seguimiento", { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as { recordatorios?: Record<string, Recordatorio[]> };
        setRecordatorios(j.recordatorios && typeof j.recordatorios === "object" ? j.recordatorios : {});
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) logger.warn("[cotizaciones] seguimiento no disponible", { error: String(err) });
      });
    return () => ctrl.abort();
  }, []);

  const ultimoDe = useCallback((id: string): Recordatorio | null => recordatorios[id]?.at(-1) ?? null, [recordatorios]);

  const anotar = useCallback((c: Cotizacion, forzar: boolean) => {
    fetch("/api/cotizaciones/seguimiento", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ cotizacionId: c.id, ...(forzar ? { forzar: true } : {}) }),
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as { recordatorios?: Recordatorio[]; ultimo?: Recordatorio; error?: string };
        if (res.ok && Array.isArray(j.recordatorios)) {
          const lista = j.recordatorios;
          setRecordatorios((prev) => ({ ...prev, [c.id]: lista }));
          return;
        }
        // Otro del equipo lo recordó mientras tanto: se muestra quién, no se anota dos veces.
        if (res.status === 409 && j.ultimo) {
          const ultimo = j.ultimo;
          setRecordatorios((prev) => ({ ...prev, [c.id]: [...(prev[c.id] ?? []), ultimo] }));
        }
        setAviso(typeof j.error === "string" ? j.error : "No se pudo anotar el recordatorio.");
      })
      .catch((err: unknown) => {
        logger.warn("[cotizaciones] anotar recordatorio falló", { error: String(err) });
        setAviso("Se abrió WhatsApp, pero sin conexión no quedó anotado.");
      });
  }, []);

  /** Abre WhatsApp en el mismo toque (el navegador bloquea la ventana si espera al servidor). */
  const recordar = useCallback(
    (c: Cotizacion, forzar = false) => {
      setAviso(null);
      const reciente = recordatorioReciente(recordatorios[c.id] ?? []);
      if (reciente && !forzar) return setConfirmar({ c, ultimo: reciente });
      setConfirmar(null);
      abrirWhatsApp(textoRecordatorio(c, membrete), c.customerId ?? "");
      anotar(c, Boolean(reciente));
    },
    [recordatorios, membrete, anotar],
  );

  return { recordatorios, ultimoDe, recordar, confirmar, cancelar: () => setConfirmar(null), aviso, cerrarAviso: () => setAviso(null) };
}

export type Seguimiento = ReturnType<typeof useSeguimiento>;
