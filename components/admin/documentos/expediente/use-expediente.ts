"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DbDocument } from "@/lib/types/documents";
import type { FilaDelIndice, PlanExpediente } from "@/lib/documents/expediente-indice";

/**
 * Datos de «Armar expediente» (22-10): el plan (qué papeles entran, lo pide
 * al servidor con los permisos de quien arma), el armado y la vista previa
 * del PDF que salió (blob URL: el visor no depende de X-Frame-Options).
 */

/** De dónde salen los papeles: una carpeta, una selección o una etiqueta (la ficha de una entidad). */
export type FuenteDelModal =
  | { tipo: "carpeta"; folderId: string; nombre: string }
  | { tipo: "ids"; ids: string[]; nombre?: string; etiqueta?: string; customerId?: string; supplierId?: string }
  | { tipo: "tag"; tag: string; nombre?: string };

export interface ExpedienteListo {
  document: DbDocument;
  paginas: number;
  indice: FilaDelIndice[];
}

const URL_EXPEDIENTE = "/api/admin/documents/expediente";

function cuerpo(f: FuenteDelModal, incluirSubcarpetas: boolean): Record<string, unknown> {
  if (f.tipo === "carpeta") return { folderId: f.folderId, incluirSubcarpetas };
  if (f.tipo === "ids") {
    return {
      ids: f.ids,
      ...(f.etiqueta ? { etiqueta: f.etiqueta } : {}),
      // Las fichas de cliente/proveedor listan por la columna: así el PDF aparece al recargar.
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    };
  }
  return { tag: f.tag };
}

/** El motivo que el servidor escribió, o uno en castellano según el código. */
async function motivo(r: Response): Promise<string> {
  const j = (await r.json().catch(() => null)) as { mensaje?: string } | null;
  if (j?.mensaje) return j.mensaje;
  if (r.status === 429) return "Armaste varios seguidos: espera unos minutos y vuelve a intentar.";
  if (r.status === 401) return "Hay que volver a entrar al panel.";
  if (r.status === 403) return "La sesión venció: recarga la página.";
  return `El servidor no pudo armarlo (${r.status}).`;
}

async function pedir(body: Record<string, unknown>): Promise<Response> {
  return fetch(URL_EXPEDIENTE, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

export function useExpediente(fuente: FuenteDelModal, incluirSubcarpetas: boolean) {
  const [plan, setPlan] = useState<PlanExpediente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorPlan, setErrorPlan] = useState<string | null>(null);
  const [armando, setArmando] = useState(false);
  const [errorArmar, setErrorArmar] = useState<string | null>(null);
  const [listo, setListo] = useState<ExpedienteListo | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const pedido = useRef(0);
  const clave = JSON.stringify(cuerpo(fuente, incluirSubcarpetas));

  const cargarPlan = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    setErrorPlan(null);
    try {
      const r = await pedir({ ...JSON.parse(clave), soloPlan: true });
      if (n !== pedido.current) return; // llegó tarde: ya se pidió otro plan (cambió «subcarpetas»)
      if (!r.ok) {
        setPlan(null);
        setErrorPlan(await motivo(r));
        return;
      }
      setPlan((await r.json()) as PlanExpediente);
    } catch {
      if (n === pedido.current) setErrorPlan("Se cortó la conexión. Vuelve a intentar.");
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [clave]);

  useEffect(() => {
    void cargarPlan();
  }, [cargarPlan]);

  const armar = useCallback(
    async (titulo: string): Promise<ExpedienteListo | null> => {
      if (armando) return null;
      setArmando(true);
      setErrorArmar(null);
      try {
        const r = await pedir({ ...JSON.parse(clave), titulo: titulo.trim() || undefined });
        if (!r.ok) {
          setErrorArmar(await motivo(r));
          return null;
        }
        const res = (await r.json()) as ExpedienteListo;
        setListo(res);
        // La vista previa se baja aparte: si falla, el expediente igual quedó guardado.
        fetch(`/api/admin/documents/${encodeURIComponent(res.document.id)}/raw`, { credentials: "include" })
          .then((raw) => (raw.ok ? raw.blob() : null))
          .then((blob) => {
            if (blob) setVistaPrevia(URL.createObjectURL(blob));
          })
          .catch((err) => console.warn("[expediente] vista previa", String(err)));
        return res;
      } catch {
        setErrorArmar("Se cortó la conexión mientras se armaba. Revisa el Archivo antes de reintentar: puede haber quedado guardado.");
        return null;
      } finally {
        setArmando(false);
      }
    },
    [armando, clave],
  );

  // El blob vive en memoria del navegador hasta que se suelta.
  useEffect(() => () => {
    if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
  }, [vistaPrevia]);

  return { plan, cargando, errorPlan, recargar: cargarPlan, armar, armando, errorArmar, listo, vistaPrevia };
}
