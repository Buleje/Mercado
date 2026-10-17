"use client";

/**
 * Datos de la ficha del repartidor (17-10, P24/P41/P42): lee
 * `GET /api/delivery/partners/:id/ficha?period=` y crea, a pedido, una tarea de
 * revisión en «Tareas del equipo». Nada se crea solo: la tarea sale sólo si
 * alguien aprieta el botón.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { tenantFetch } from "@/lib/tenant-fetch";
import { formatCurrency } from "@/lib/format";
import type { PeriodoRanking } from "@/lib/delivery/ranking-reparto";
import type { ResumenFicha } from "@/lib/delivery/ficha-repartidor";

export interface EntregaFicha {
  id: string;
  orderId: string;
  status: string;
  fee: number;
  propina: number;
  notes: string | null;
  cliente: string | null;
  createdAt: string;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  minutos: number | null;
}

export interface RetiroFicha {
  id: string;
  amount: number;
  status: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface FichaRepartidor {
  repartidor: {
    id: string;
    name: string;
    phone: string;
    zone: string | null;
    vehicleType: string;
    isActive: boolean;
    fee: number;
  };
  resumen: ResumenFicha;
  abiertas: number;
  pagado: { cantidad: number; monto: number };
  porPagar: { cantidad: number; monto: number };
  entregas: EntregaFicha[];
  retiros: RetiroFicha[];
  periodo: PeriodoRanking;
  desde: string | null;
  hasta: string;
}

export function useFichaRepartidor(id: string, periodo: PeriodoRanking) {
  const [ficha, setFicha] = useState<FichaRepartidor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creandoTarea, setCreandoTarea] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    tenantFetch(`/api/delivery/partners/${encodeURIComponent(id)}/ficha?period=${periodo}`, { credentials: "include" })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as (FichaRepartidor & { error?: string }) | null;
        if (!vivo) return;
        if (!r.ok || !body) {
          setError(body?.error ?? `No pudimos leer la ficha (error ${r.status}).`);
          setFicha(null);
          return;
        }
        setFicha(body);
      })
      .catch(() => {
        if (vivo) setError("Sin conexión: no pudimos leer la ficha.");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [id, periodo]);

  /**
   * «Revisar el reparto de X» en Tareas del equipo, con las cifras del período
   * en la descripción y, si se eligió, su responsable. Devuelve si se creó.
   */
  const crearTarea = useCallback(
    async (rotuloPeriodo: string, responsable: string, queRevisar: string): Promise<boolean> => {
      if (!ficha) return false;
      const { repartidor: r, resumen: s } = ficha;
      setCreandoTarea(true);
      try {
        const res = await tenantFetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: `Revisar el reparto de ${r.name}`.slice(0, 200),
            description:
              (queRevisar.trim() ? `${queRevisar.trim()}\n\n` : "") +
              `Ficha del repartidor (${rotuloPeriodo}): ${s.entregadas} entregas de ${s.asignadas} asignadas, ` +
              `${s.noEntregadas} no entregadas, ganado ${formatCurrency(s.ganado)}, ` +
              `pagado en retiros ${formatCurrency(ficha.pagado.monto)}, por pagar ${formatCurrency(ficha.porPagar.monto)}.`,
            priority: "media",
            assignedTo: responsable.trim() || undefined,
            module: "reparto",
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? (res.status === 403 ? "Tu rol no puede crear tareas." : `No se creó la tarea (error ${res.status}).`));
        }
        toast.success("Pasó a Tareas del equipo", { description: `Revisar el reparto de ${r.name}` });
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se creó la tarea.");
        return false;
      } finally {
        setCreandoTarea(false);
      }
    },
    [ficha],
  );

  return { ficha, cargando, error, creandoTarea, crearTarea };
}
