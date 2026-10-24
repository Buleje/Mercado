"use client";

/**
 * Los datos de «Impuestos del mes» y de «El año»: régimen y RUC del negocio,
 * el IGV registrado del mes, los ingresos de Mi Plata y el estado de cada
 * declaración. Ninguna pantalla suma ventas en el navegador: los totales salen
 * de `/api/finanzas/igv-del-mes` y `/api/finanzas/monthly-summary`.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { RegimenTributario } from "@/lib/tax/obligaciones-peru";
import type { IgvDelMes } from "@/components/admin/unified/finanzas/resumen/igv";

const REGIMENES: readonly RegimenTributario[] = ["nrus", "rer", "rmt", "general"];
/** Avisa a la otra mitad de la vista (Impuestos ↔ El año) que cambió el régimen o el RUC. */
const EVENTO_CONFIG = "impuestos:config";

export type EstadoDeclaracion = "pendiente" | "presentada" | "pagada";
export interface Declaracion { periodo: string; tipo: string; estado: EstadoDeclaracion }
export interface IngresoMes { month: string; ingresos: number; ventas: number; pedidos: number }

/** Régimen y RUC viven en Settings: se comparten entre usuarios y equipos. */
export function useConfigTributaria() {
  const [regimen, setRegimenLocal] = useState<RegimenTributario>("rmt");
  const [ruc, setRucLocal] = useState("");
  const [lista, setLista] = useState(false);

  const leer = useCallback(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { regimenTributario?: string; ruc?: string } | null) => {
        if (s?.regimenTributario && (REGIMENES as readonly string[]).includes(s.regimenTributario)) {
          setRegimenLocal(s.regimenTributario as RegimenTributario);
        }
        if (s?.ruc) setRucLocal(String(s.ruc));
      })
      .catch((err) => logger.warn("[impuestos] settings load failed", { error: String(err) }))
      .finally(() => setLista(true));
  }, []);

  useEffect(() => {
    leer();
    window.addEventListener(EVENTO_CONFIG, leer);
    return () => window.removeEventListener(EVENTO_CONFIG, leer);
  }, [leer]);

  const guardar = useCallback(async (patch: { regimenTributario?: RegimenTributario; ruc?: string }) => {
    if (patch.regimenTributario) setRegimenLocal(patch.regimenTributario);
    if (patch.ruc !== undefined) setRucLocal(patch.ruc);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error("No se pudo guardar");
    window.dispatchEvent(new Event(EVENTO_CONFIG));
  }, []);

  return { regimen, ruc, lista, guardar };
}

/** Estado persistido de las declaraciones del año (Formulario 621, PLAME, anual). */
export function useDeclaraciones(anio: number) {
  const [declaraciones, setDeclaraciones] = useState<Declaracion[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/declaraciones?year=${anio}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (vivo) setDeclaraciones(Array.isArray(d) ? d : []); })
      .catch((err) => logger.warn("[impuestos] declaraciones load failed", { error: String(err) }));
    return () => { vivo = false; };
  }, [anio]);

  const estadoDe = useCallback(
    (periodo: string, tipo = "igv-renta"): EstadoDeclaracion =>
      declaraciones.find((d) => d.periodo === periodo && d.tipo === tipo)?.estado ?? "pendiente",
    [declaraciones],
  );

  const marcar = useCallback(async (periodo: string, estado: EstadoDeclaracion, montoDeclarado?: number) => {
    const antes = declaraciones;
    setDeclaraciones((prev) => [...prev.filter((d) => !(d.periodo === periodo && d.tipo === "igv-renta")), { periodo, tipo: "igv-renta", estado }]);
    const res = await fetch("/api/admin/declaraciones", {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ periodo, tipo: "igv-renta", estado, ...(montoDeclarado != null && { montoDeclarado }) }),
    }).catch(() => null);
    if (!res?.ok) {
      setDeclaraciones(antes);
      throw new Error("No se pudo guardar el estado de la declaración");
    }
  }, [declaraciones]);

  return { estadoDe, marcar };
}

type Carga<T> = { fase: "cargando" } | { fase: "error" } | { fase: "lista"; datos: T };

/** Los ingresos de cada mes del año hasta `mes` (inclusive): la base de la Renta. */
export function useIngresosDelAnio(mes: string, tick = 0): Carga<IngresoMes[]> {
  const [estado, setEstado] = useState<Carga<IngresoMes[]>>({ fase: "cargando" });
  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "cargando" });
    const meses = Number(mes.slice(5, 7));
    fetch(`/api/finanzas/monthly-summary?months=${meses}&hasta=${mes}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: IngresoMes[]) => { if (vivo) setEstado({ fase: "lista", datos: Array.isArray(d) ? d : [] }); })
      .catch((err) => {
        logger.warn("[impuestos] ingresos load failed", { error: String(err) });
        if (vivo) setEstado({ fase: "error" });
      });
    return () => { vivo = false; };
  }, [mes, tick]);
  return estado;
}

/** El IGV REGISTRADO del mes (mismo endpoint que el Resumen de Mi Plata). `null` = no se pudo leer. */
export function useIgvDelMes(mes: string, tick = 0): { cargando: boolean; igv: IgvDelMes | null } {
  const [estado, setEstado] = useState<{ cargando: boolean; igv: IgvDelMes | null }>({ cargando: true, igv: null });
  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, cargando: true }));
    fetch(`/api/finanzas/igv-del-mes?mes=${mes}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: IgvDelMes | null) => { if (vivo) setEstado({ cargando: false, igv: d }); })
      .catch((err) => {
        logger.warn("[impuestos] igv load failed", { error: String(err) });
        if (vivo) setEstado({ cargando: false, igv: null });
      });
    return () => { vivo = false; };
  }, [mes, tick]);
  return estado;
}
