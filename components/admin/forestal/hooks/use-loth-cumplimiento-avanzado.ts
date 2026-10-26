"use client";

/**
 * Los chequeos avanzados del «Chequeo del libro» (26-10): guías repetidas, fuera
 * de vigencia o sin transporte, árboles fuera del censo o bajo el DMC, bloques
 * pasados, plan y papeles, preliminares viejas y fechas fuera de orden. Los
 * calcula el servidor (`/api/admin/forestal/loth/chequeo`, `chequeoAvanzado`)
 * y se suman a los de siempre en `computeLothCompliance({ extra })`: el panel,
 * el puntaje y el PDF siguen saliendo del MISMO resultado.
 *
 * Los ajustes (desde qué día avisar una preliminar, si pedir la licencia del
 * conductor) se recuerdan en este equipo, sin schema.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { LothCheck } from "@/lib/forestal/loth-compliance";
import { PLAZO_REGISTRO_DIAS } from "@/lib/forestal/loth-constants";
import { AJUSTES_CHEQUEO_DEFECTO, type AjustesChequeo } from "@/lib/forestal/loth-chequeo-tipos";

/** El aviso de una preliminar va antes de que venza: del día 1 al 14 de los 15. */
export const DIAS_PRELIMINAR_MAX = PLAZO_REGISTRO_DIAS - 1;

/** Lo guardado puede venir de otra versión o a mano: lo que no cuadra vuelve a lo de fábrica. */
export function ajustesSanos(a: Partial<AjustesChequeo> | null | undefined): AjustesChequeo {
  const d = Number(a?.diasPreliminar);
  return {
    diasPreliminar: Number.isInteger(d) && d >= 1 && d <= DIAS_PRELIMINAR_MAX ? d : AJUSTES_CHEQUEO_DEFECTO.diasPreliminar,
    pedirLicencia: typeof a?.pedirLicencia === "boolean" ? a.pedirLicencia : AJUSTES_CHEQUEO_DEFECTO.pedirLicencia,
  };
}

/** Vacío estable: un `[]` nuevo en cada render recalcularía el veredicto en cada render. */
const VACIO: never[] = [];

interface Avanzado {
  checks: LothCheck[];
  /** Lo que el servidor no pudo leer: esos chequeos no salen (ni en rojo ni «en orden»). */
  sinLeer: string[];
}

/**
 * La respuesta con el plan y los ajustes que la pidieron (reviewer 26-10: al
 * pasar de PO 12 a PO 1 quedaban ~3 s los casos de PO 12, y si la recarga
 * fallaba, «el último cálculo» era de OTRO plan). Sólo vale si `clave` es la
 * de ahora; si no, «no listo».
 */
interface Respuesta {
  clave: string;
  datos: Avanzado | null;
  error: string | null;
}

/** El plan y los ajustes que cambian lo que contesta el servidor. */
export const claveDelChequeo = (planId: string | null, a: AjustesChequeo) => `${planId ?? ""}|${a.diasPreliminar}|${a.pedirLicencia ? 1 : 0}`;

export function useLothCumplimientoAvanzado({
  planId,
  listo,
  reloadSignal,
}: {
  /** Con un plan elegido en el libro, el chequeo es de ESE plan. */
  planId: string | null;
  /** El permiso del libro ya se sabe (si no, se pediría dos veces). */
  listo: boolean;
  reloadSignal?: number;
}) {
  const [guardados, setGuardados] = useLocalStorage<AjustesChequeo>("loth:chequeo:ajustes", AJUSTES_CHEQUEO_DEFECTO);
  const ajustes = useMemo(() => ajustesSanos(guardados), [guardados]);
  const [resp, setResp] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  /* Una respuesta vieja de la MISMA clave (dos recargas seguidas) no pisa a la nueva. */
  const turno = useRef(0);

  const { diasPreliminar, pedirLicencia } = ajustes;
  const clave = claveDelChequeo(planId, ajustes);
  const load = useCallback(async () => {
    if (!listo) return;
    const mio = ++turno.current;
    const pedida = claveDelChequeo(planId, { diasPreliminar, pedirLicencia });
    setCargando(true);
    const q = new URLSearchParams({ diasPreliminar: String(diasPreliminar), licencia: pedirLicencia ? "1" : "0" });
    if (planId) q.set("planId", planId);
    try {
      const res = await fetch(`/api/admin/forestal/loth/chequeo?${q}`, { credentials: "include" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.message ?? d.error ?? `HTTP ${res.status}`);
      if (mio !== turno.current) return;
      setResp({ clave: pedida, datos: { checks: Array.isArray(d.checks) ? d.checks : [], sinLeer: Array.isArray(d.sinLeer) ? d.sinLeer : [] }, error: null });
    } catch (err) {
      if (mio !== turno.current) return;
      const error = err instanceof Error ? err.message : String(err);
      /* Una recarga fallida conserva el último cálculo sólo si es de este mismo plan y ajustes. */
      setResp((prev) => ({ clave: pedida, datos: prev?.clave === pedida ? prev.datos : null, error }));
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [listo, planId, diasPreliminar, pedirLicencia]);

  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  const guardar = useCallback((a: AjustesChequeo) => setGuardados(ajustesSanos(a)), [setGuardados]);

  /* Lo de otro plan u otros ajustes no se muestra: hasta que contesten los de ahora, «no listo». */
  const actual = resp?.clave === clave ? resp : null;
  return {
    checks: actual?.datos?.checks ?? VACIO,
    sinLeer: actual?.datos?.sinLeer ?? VACIO,
    leido: Boolean(actual?.datos),
    cargando: cargando || (listo && actual === null),
    /** Ya contestó (bien o mal) para ESTA clave: sin esto, el veredicto saldría sin los avanzados. */
    terminado: actual !== null,
    error: actual?.error ?? null,
    load,
    ajustes,
    guardar,
  };
}
