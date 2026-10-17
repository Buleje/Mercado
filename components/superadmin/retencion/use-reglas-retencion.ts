"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { ORDEN_SEVERIDAD, type Severidad } from "@/lib/churn/playbook-catalog";

/** Espeja `GET /api/superadmin/churn/playbooks`. */
export interface Regla {
  id: string;
  name: string;
  triggerSignal: string;
  triggerSeverity: string;
  action: string;
  templateId: string | null;
  discountPercent: number | null;
  discountDays: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface GrupoAbierto {
  signalType: string;
  severity: string;
  total: number;
}

interface Datos {
  playbooks: Regla[];
  autorun: boolean;
  abiertas: { grupos: GrupoAbierto[]; ultimaSenalAt: string | null };
}

export type CambiosRegla = Partial<
  Pick<Regla, "triggerSignal" | "triggerSeverity" | "action" | "templateId" | "discountPercent" | "discountDays" | "isActive">
>;

const URL = "/api/superadmin/churn/playbooks";

const nivel = (s: string) => ORDEN_SEVERIDAD[s as Severidad] ?? 0;

/**
 * Alertas abiertas hoy que ESTA regla atendería. Igual que el motor
 * (`elegirPlaybook`): de las reglas activas de la misma señal gana la de umbral
 * más alto que la alerta alcanza; una regla pausada cuenta como si se activara.
 */
export function alertasQueLeTocan(
  regla: Pick<Regla, "id" | "triggerSignal" | "triggerSeverity">,
  grupos: GrupoAbierto[],
  reglas: Pick<Regla, "id" | "triggerSignal" | "triggerSeverity" | "isActive">[],
): number {
  const candidatas = reglas.filter((r) => r.triggerSignal === regla.triggerSignal && (r.isActive || r.id === regla.id));
  return grupos
    .filter((g) => g.signalType === regla.triggerSignal)
    .reduce((suma, g) => {
      const ganadora = candidatas
        .filter((r) => nivel(g.severity) >= nivel(r.triggerSeverity))
        .sort((a, b) => nivel(b.triggerSeverity) - nivel(a.triggerSeverity))[0];
      return ganadora?.id === regla.id ? suma + g.total : suma;
    }, 0);
}

async function leerError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `No se pudo guardar (HTTP ${res.status})`;
}

export function useReglasRetencion() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetchSuperadmin(URL);
      if (!res.ok) {
        setError(`No se pudieron leer las reglas (HTTP ${res.status})`);
        return;
      }
      setDatos((await res.json()) as Datos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Devuelve `null` si guardó, o el mensaje de error. */
  const guardar = useCallback(async (id: string, cambios: CambiosRegla): Promise<string | null> => {
    setGuardando(id);
    try {
      const res = await fetchSuperadmin(URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...cambios }),
      });
      if (!res.ok) return await leerError(res);
      const { playbook } = (await res.json()) as { playbook: Regla };
      setDatos((d) => (d ? { ...d, playbooks: d.playbooks.map((p) => (p.id === id ? playbook : p)) } : d));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Error de red";
    } finally {
      setGuardando(null);
    }
  }, []);

  const crear = useCallback(async (nueva: Required<CambiosRegla> & { name: string }): Promise<string | null> => {
    setGuardando("nueva");
    try {
      const res = await fetchSuperadmin(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nueva),
      });
      if (!res.ok) return await leerError(res);
      const { playbook } = (await res.json()) as { playbook: Regla };
      setDatos((d) => (d ? { ...d, playbooks: [...d.playbooks, playbook] } : d));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Error de red";
    } finally {
      setGuardando(null);
    }
  }, []);

  return { datos, cargando, error, guardando, cargar, guardar, crear };
}
