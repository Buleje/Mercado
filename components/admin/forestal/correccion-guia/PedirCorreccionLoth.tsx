"use client";

/**
 * «Pedir corrección» de una guía del Libro TH: arma la lista de casilleros con
 * lo que dice hoy por el MISMO camino que la hoja impresa (`entradasDeLaGuia`),
 * así que necesita la carátula del libro (casilleros del titular). Mientras la
 * lee, el modal dice «Leyendo los casilleros…»; si no llega, los casilleros del
 * titular salen sin vista previa y el servidor los lee igual.
 */

import { useEffect, useMemo, useState } from "react";
import type { LothGtfCaratula } from "@/lib/forestal/loth-gtf-oficial";
import type { Gtf } from "../gtf-tabla-columnas";
import { useCorreccionesCtx } from "./contexto";
import { opcionesGuiaLoth } from "./opciones-de-la-guia";
import PedirCorreccionModal from "./PedirCorreccionModal";

export default function PedirCorreccionLoth({
  g,
  aboveModals = false,
  onClose,
}: {
  g: Gtf;
  aboveModals?: boolean;
  onClose: () => void;
}) {
  const ctx = useCorreccionesCtx();
  const [caratula, setCaratula] = useState<LothGtfCaratula | null | undefined>(undefined);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/forestal/loth/caratula", { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { active?: LothGtfCaratula | null } | null) => setCaratula(j?.active ?? null))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        console.warn("[correccion-guia] no se pudo leer la carátula", err);
        setCaratula(null);
      });
    return () => ac.abort();
  }, []);

  const opciones = useMemo(() => (caratula === undefined ? [] : opcionesGuiaLoth(g, caratula)), [g, caratula]);

  return (
    <PedirCorreccionModal
      guia={{ entityType: "loth_gtf", entityId: g.id, gtfNumber: g.gtfNumber }}
      opciones={opciones}
      cargando={caratula === undefined}
      aboveModals={aboveModals}
      onClose={onClose}
      onEnviada={(s) => {
        ctx?.agregar(s);
        onClose();
      }}
    />
  );
}
