"use client";

/**
 * usePlantillasGuia — las plantillas de «Datos de la guía» del despacho con
 * guía (16-10-2026): guardar bloques con nombre y rellenar otra guía de una vez.
 *
 * La lógica vive en `lib/forestal/gtf-plantillas.ts` (qué se guarda, qué llena,
 * qué pisa, si el permiso sigue vivo); acá sólo la red y el ORDEN al aplicar:
 *
 * Una plantilla de OTRO permiso pasa por el mismo cambio de plan que el
 * selector (`loth-guia-cambio-de-plan`): primero `setPlanId`, el despacho
 * re-siembra la guía con lo que dicta el permiso nuevo (`setDatos(final)`, un
 * valor, no una función) y RECIÉN DESPUÉS va la plantilla encima. Aplicarla en
 * el mismo clic la pisaba la siembra: los efectos del hijo corren antes que los
 * del padre. Por eso se espera a ver `datos` cambiar con el plan nuevo puesto.
 * Si la siembra no llega (sin talonario) se aplica igual a los `ESPERA_SIEMBRA_MS`,
 * y si el plan ya no es el de la plantilla (lo cambiaron a mano) se descarta:
 * nunca queda colgada para caer sobre la próxima edición.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import {
  aplicarPlantilla,
  bloquesDe,
  contenidoDesdeDatos,
  estadoDelPermiso,
  tituloQueNoVa,
  type BloquePlantilla,
  type CambioPlantilla,
  type ContenidoPlantilla,
  type EstadoPermiso,
  type PermisoDeLaGuia,
  type PlanesDeLaGuia,
  type PlantillaGuia,
} from "@/lib/forestal/gtf-plantillas";
import { propietarioTitular } from "@/lib/forestal/loth-guia-despacho";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import type { DespachoGuiaLoth } from "./use-despacho-guia-loth";

const URL = "/api/admin/forestal/loth/gtf-plantillas";
/** La siembra del plan nuevo corre en el mismo commit que el cambio: pasado esto, no viene. */
export const ESPERA_SIEMBRA_MS = 400;

/** Lo que muestra la ventana «Usar» antes de rellenar. */
export interface VistaPreviaPlantilla {
  estado: EstadoPermiso;
  llena: CambioPlantilla[];
  pisa: CambioPlantilla[];
  saltados: BloquePlantilla[];
  /** El N° escrito a mano que se pierde al cambiar de talonario. */
  numeroQueSePierde: string | null;
}


type Plan = NonNullable<DespachoGuiaLoth["plan"]>;
export const etiquetaDelPlan = (p: Pick<Plan, "planNumber" | "planType" | "titularName">): string =>
  [p.planNumber || p.planType, p.titularName].filter(Boolean).join(" · ");

async function pedir(init: RequestInit & { query?: string } = {}): Promise<{ plantillas: PlantillaGuia[]; plantilla?: PlantillaGuia | null }> {
  const { query, ...resto } = init;
  const res = await fetch(`${URL}${query ?? ""}`, { cache: "no-store", ...resto });
  const json = (await res.json().catch(() => null)) as { plantillas?: PlantillaGuia[]; plantilla?: PlantillaGuia | null; message?: string } | null;
  if (!res.ok || !json?.plantillas) throw new Error(json?.message ?? "No se pudo hablar con el servidor. Prueba otra vez.");
  return { plantillas: json.plantillas, plantilla: json.plantilla };
}

const put = (body: unknown) =>
  pedir({ method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });

export function usePlantillasGuia(g: DespachoGuiaLoth) {
  const [plantillas, setPlantillas] = useState<PlantillaGuia[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  /** «Rellené con…» / «Guardé…»: la línea de «listo» al lado del menú. */
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    try {
      setPlantillas((await pedir()).plantillas);
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : String(err));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const { prep, plan, planId, identidad, planesConTrozas } = g;
  const planes: PlanesDeLaGuia = useMemo(() => {
    /* El selector de la guía sólo ofrece los planes con trozas (+ el de ahora):
       pasarse a otro dejaba la guía con 0 trozas sin decir nada. */
    const conTrozas = new Set(planesConTrozas.map((p) => p.id));
    return {
      planIdActual: planId,
      planes: (prep?.planes ?? []).map((p) => ({ id: p.id, etiqueta: etiquetaDelPlan(p) })),
      vigenciaDe: (id: string) => prep?.permisos[id]?.vigenciaHasta ?? null,
      hoy: hoyEnLima(),
      conTrozas: (id: string) => conTrozas.has(id),
    };
  }, [prep, planId, planesConTrozas]);
  const permiso: PermisoDeLaGuia = useMemo(() => ({ planId, etiqueta: plan ? etiquetaDelPlan(plan) : "" }), [plan, planId]);
  const delTitular = identidad ? propietarioTitular(identidad) : null;

  const estado = useCallback((p: PlantillaGuia) => estadoDelPermiso(p.contenido, planes), [planes]);

  const vistaPrevia = useCallback(
    (p: PlantillaGuia): VistaPreviaPlantilla => {
      const est = estado(p);
      const r = aplicarPlantilla(g.datos, p.contenido, { permiso: est, planIdActual: planId, propietarioDelTitular: delTitular });
      /* Con otro permiso, el título lo dicta el plan nuevo: no se lista campo por campo. */
      const fuera = (c: CambioPlantilla) => est.tipo !== "cambia" || c.bloque !== "titulo";
      return {
        estado: est,
        llena: r.llena.filter(fuera),
        pisa: r.pisa.filter(fuera),
        saltados: r.saltados,
        numeroQueSePierde: est.tipo === "cambia" ? g.numeroQueSePierde(est.planId) : null,
      };
    },
    [estado, g, planId, delTitular],
  );

  /* ── Aplicar ── */
  const pendiente = useRef<{ p: PlantillaGuia; planId: string; datosAntes: GtfDatos; desde: number } | null>(null);

  const aplicar = useCallback(
    (p: PlantillaGuia, est: EstadoPermiso) => {
      const opts = { permiso: est, planIdActual: planId, propietarioDelTitular: delTitular };
      const r = aplicarPlantilla(g.datos, p.contenido, opts);
      g.setDatos((prev) => aplicarPlantilla(prev, p.contenido, opts).datos);
      const n = r.llena.length + r.pisa.length;
      const motivo = r.saltados.includes("titulo") ? tituloQueNoVa(est, planId) : null;
      setAviso(`Rellené con «${p.nombre}»${n ? `: ${n} casillero${n === 1 ? "" : "s"}` : ""}${motivo ? ` (el título no: ${motivo})` : ""}.`);
      put({ accion: "usar", id: p.id })
        .then((x) => setPlantillas(x.plantillas))
        .catch((err) => logger.warn("[plantillas-guia] marcar usada failed", { error: String(err) }));
    },
    [g, planId, delTitular],
  );

  const usar = useCallback(
    (p: PlantillaGuia) => {
      const est = estado(p);
      if (est.tipo !== "cambia") return aplicar(p, est);
      pendiente.current = { p, planId: est.planId, datosAntes: g.datos, desde: Date.now() };
      g.setPlanId(est.planId);
    },
    [estado, aplicar, g],
  );

  /* La siembra del plan nuevo ya pasó (datos cambió con el plan puesto): ahora sí.
     Otro plan = la cambiaron a mano: se descarta. Sin siembra: al tope, igual. */
  useEffect(() => {
    const x = pendiente.current;
    if (!x) return;
    if (g.planId !== x.planId) {
      pendiente.current = null;
      return;
    }
    const ahora = () => {
      if (pendiente.current !== x) return;
      pendiente.current = null;
      aplicar(x.p, { tipo: "mismo", etiqueta: "" });
    };
    if (g.datos !== x.datosAntes) return ahora();
    const t = setTimeout(ahora, Math.max(0, x.desde + ESPERA_SIEMBRA_MS - Date.now()));
    return () => clearTimeout(t);
  }, [g.planId, g.datos, aplicar]);

  /* ── Guardar y gestionar ── */
  const conLista = useCallback(async (paso: Promise<{ plantillas: PlantillaGuia[]; plantilla?: PlantillaGuia | null }>) => {
    const r = await paso;
    setPlantillas(r.plantillas);
    return r.plantilla ?? null;
  }, []);

  const contenidoDeAhora = useCallback(
    (bloques: readonly BloquePlantilla[]): ContenidoPlantilla => contenidoDesdeDatos(g.datos, bloques, permiso),
    [g.datos, permiso],
  );

  return {
    plantillas,
    errorCarga,
    recargar: cargar,
    permiso,
    estado,
    vistaPrevia,
    usar,
    aviso,
    setAviso,
    contenidoDeAhora,
    guardarNueva: (nombre: string, bloques: readonly BloquePlantilla[]) =>
      conLista(put({ accion: "crear", nombre, contenido: contenidoDeAhora(bloques) })),
    /** Sus mismos bloques (o los que se marquen) con lo que dice la guía ahora. */
    actualizarConAhora: (p: PlantillaGuia, bloques: readonly BloquePlantilla[] = bloquesDe(p.contenido)) =>
      conLista(put({ accion: "actualizar", id: p.id, contenido: contenidoDeAhora(bloques) })),
    renombrar: (p: PlantillaGuia, nombre: string) => conLista(put({ accion: "renombrar", id: p.id, nombre })),
    duplicar: (p: PlantillaGuia) => conLista(put({ accion: "duplicar", id: p.id })),
    borrar: (p: PlantillaGuia) =>
      conLista(pedir({ method: "DELETE", headers: csrfHeaders(), query: `?id=${encodeURIComponent(p.id)}` })),
  };
}

export type PlantillasGuia = ReturnType<typeof usePlantillasGuia>;
