"use client";

/**
 * «Agregar al censo» desde «Qué falta hacer» (Por árbol): abre el MISMO alta de
 * árbol que el Plan de manejo, con el código y la especie de la tala ya escritos.
 *
 * El libro sólo conoce el censo en resumen (código, especie, DAP), y el alta
 * necesita el resto —especies autorizadas del plan, DMC, árboles completos para
 * no repetir código—, así que se piden al abrir, con los mismos endpoints que usa
 * `useLothPlan`. Mientras llegan no se dibuja nada; si fallan, se avisa y se
 * cierra (un alta sin especies autorizadas no avisaría de una especie fuera del plan).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import LothCensoArbolForm from "./LothCensoArbolForm";
import { ordenarPorCodigo, type ArbolCenso } from "./loth-censo-arbol";
import { CENSO_LIMITE, type Species, type Tree } from "./loth-plan-shared";

interface Datos {
  arboles: ArbolCenso[];
  especies: Species[];
  dmcOverrides: Record<string, number>;
}

export default function LothCensoAltaDesdeTrace({
  planId,
  arbol,
  onClose,
  onAgregado,
}: {
  /** null = sin plan activo: no hay censo donde dar el alta. */
  planId: string | null;
  /** El árbol a dar de alta; null = cerrado. */
  arbol: { treeCode: string; speciesCommon: string } | null;
  onClose: () => void;
  /** Tras guardar: el libro recarga el censo y el ítem de «Qué falta hacer» desaparece. */
  onAgregado: () => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const pedido = useRef(0);

  const cargar = useCallback(async (id: string): Promise<Datos | null> => {
    const [plan, censo, poa] = await Promise.all([
      fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(id)}`, { credentials: "include" }),
      fetch(`/api/admin/forestal/plan/census?planId=${encodeURIComponent(id)}&limit=${CENSO_LIMITE}`, { credentials: "include" }),
      fetch(`/api/admin/forestal/loth/poa?planId=${encodeURIComponent(id)}`, { credentials: "include" }),
    ]);
    if (!plan.ok || !censo.ok) return null;
    const especies = ((await plan.json()).species ?? []) as Species[];
    const trees = ((await censo.json()).trees ?? []) as Tree[];
    // La DMC fijada por el plan es opcional: sin ella el alta usa la de la norma.
    const dmc = poa.ok ? ((await poa.json()).config?.dmcOverrides ?? {}) : {};
    return { arboles: ordenarPorCodigo<ArbolCenso>(trees), especies, dmcOverrides: dmc as Record<string, number> };
  }, []);

  const abierto = arbol != null && planId != null;
  useEffect(() => {
    if (!abierto || !planId) {
      setDatos(null);
      return;
    }
    const mio = ++pedido.current;
    cargar(planId)
      .then((d) => {
        if (mio !== pedido.current) return;
        if (d) setDatos(d);
        else {
          toast.error("No se pudo leer el censo del plan — intenta de nuevo.");
          onClose();
        }
      })
      .catch((err) => {
        console.warn("[LothCensoAltaDesdeTrace] no se pudo leer el censo", err);
        if (mio !== pedido.current) return;
        toast.error("No se pudo leer el censo del plan — revisa tu conexión.");
        onClose();
      });
    // `onClose` cambia en cada render del libro: no debe repetir la lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, planId, cargar]);

  const autorizadas = useMemo(() => new Set((datos?.especies ?? []).map((s) => claveEspecie(s.speciesCommon))), [datos]);

  if (!arbol || !planId || !datos) return null;
  return (
    <LothCensoArbolForm
      key={arbol.treeCode}
      open
      onClose={onClose}
      planId={planId}
      arboles={datos.arboles}
      especiesPlan={datos.especies}
      autorizadas={autorizadas}
      dmcOverrides={datos.dmcOverrides}
      inicial={arbol}
      onAgregado={() => {
        // «Agregar y otro»: el siguiente alta ya ve este código como repetido.
        if (planId) void cargar(planId).then((d) => d && setDatos(d)).catch((err) => console.warn("[LothCensoAltaDesdeTrace] no se pudo releer el censo", err));
        onAgregado();
      }}
    />
  );
}
