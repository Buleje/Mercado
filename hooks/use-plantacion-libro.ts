"use client";

/**
 * use-plantacion-libro — lo que el Libro TH sabe de una plantación, para el
 * trámite de actualización del registro (ADR-459, ronda 3).
 *
 * Sólo lee cuando se pide (`activo`): el trámite no consulta el libro hasta que
 * la persona toca «Traer lo del Libro TH». Reúsa los endpoints del libro —no hay
 * uno nuevo—: la lista de planes, y del plan elegido sus especies
 * (`/plan?planId=`) y su saldo SÓLO de ese plan (`/plan?balance=&solo=1`,
 * `ForestPlanDB.balanceExtraccion` sin las líneas sin plan).
 *
 * Una respuesta vieja nunca pisa la del plan elegido después (contador de
 * pedidos): elegir A y enseguida B mostraba lo de A si A tardaba más.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  especiesDelLibro,
  plantacionesDelLibro,
  type BalanceDelLibro,
  type EspecieDelLibro,
  type EspecieDelRegistroLibro,
  type PlanDelLibro,
} from "@/lib/forestal/plantacion-libro";

type Estado = "idle" | "cargando" | "listo" | "error";

const URL_PLAN = "/api/admin/forestal/plan";

async function mensajeDe(res: Response, que: string): Promise<string> {
  if (res.status === 403) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (j.error === "specialization_disabled") return "El Libro TH no está habilitado en este negocio: no hay de dónde traer lo talado.";
    return "Tu usuario no puede leer el Libro TH.";
  }
  if (res.status === 429) return "Demasiadas consultas seguidas: espera un minuto y vuelve a intentar.";
  return `No se pudo leer ${que} (error ${res.status}).`;
}

export function usePlantacionLibro(activo: boolean) {
  const [planes, setPlanes] = useState<PlanDelLibro[]>([]);
  const [estadoPlanes, setEstadoPlanes] = useState<Estado>("idle");
  const [errorPlanes, setErrorPlanes] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [especies, setEspecies] = useState<EspecieDelLibro[] | null>(null);
  const [estadoDetalle, setEstadoDetalle] = useState<Estado>("idle");
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const pedido = useRef(0);

  const cargarPlanes = useCallback(async () => {
    setEstadoPlanes("cargando");
    setErrorPlanes(null);
    try {
      const res = await fetch(URL_PLAN, { credentials: "include" });
      if (!res.ok) throw new Error(await mensajeDe(res, "los planes del libro"));
      const { plans } = (await res.json()) as { plans?: PlanDelLibro[] };
      setPlanes(plantacionesDelLibro(plans ?? []));
      setEstadoPlanes("listo");
    } catch (err) {
      setErrorPlanes(err instanceof Error ? err.message : String(err));
      setEstadoPlanes("error");
    }
  }, []);

  useEffect(() => {
    if (activo && estadoPlanes === "idle") void cargarPlanes();
  }, [activo, estadoPlanes, cargarPlanes]);

  const elegir = useCallback(async (id: string | null) => {
    const n = ++pedido.current;
    setPlanId(id);
    setEspecies(null);
    setErrorDetalle(null);
    if (!id) {
      setEstadoDetalle("idle");
      return;
    }
    setEstadoDetalle("cargando");
    try {
      const q = encodeURIComponent(id);
      const [d, b] = await Promise.all([
        fetch(`${URL_PLAN}?planId=${q}`, { credentials: "include" }),
        // `solo=1`: lo que se declara como de esta plantación no incluye líneas sin plan.
        fetch(`${URL_PLAN}?balance=${q}&solo=1`, { credentials: "include" }),
      ]);
      if (!d.ok) throw new Error(await mensajeDe(d, "el registro de la plantación"));
      if (!b.ok) throw new Error(await mensajeDe(b, "lo talado de la plantación"));
      const { species } = (await d.json()) as { species?: EspecieDelRegistroLibro[] };
      const { balance } = (await b.json()) as { balance?: BalanceDelLibro | null };
      if (n !== pedido.current) return;
      setEspecies(especiesDelLibro(species ?? [], balance ?? null));
      setEstadoDetalle("listo");
    } catch (err) {
      if (n !== pedido.current) return;
      setErrorDetalle(err instanceof Error ? err.message : String(err));
      setEstadoDetalle("error");
    }
  }, []);

  return { planes, estadoPlanes, errorPlanes, cargarPlanes, planId, elegir, especies, estadoDetalle, errorDetalle };
}
