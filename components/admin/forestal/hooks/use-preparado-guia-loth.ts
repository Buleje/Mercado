"use client";

/**
 * Lo que «Despachar con guía» del Libro TH trae de una vez del servidor:
 * carátula, planes, trozas que no salieron, los N° ya usados con su dueño y la
 * última guía del negocio y de cada plan. Salió de `use-despacho-guia-loth`
 * (revisión 09-10) sin cambiar el pedido ni la forma.
 */

import { useCallback, useEffect, useState } from "react";
import type { GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { PlantaPropia } from "@/lib/forestal/guia-th-al-ctp";
import type { CaratulaParaGuia, GtfUsadaLoth, PermisoParaGuia, PlanParaGuia, TrozaDelLibro } from "@/lib/forestal/loth-guia-despacho";

export interface PreparadoGuiaLoth {
  caratula: (CaratulaParaGuia & { id: string }) | null;
  planes: (PlanParaGuia & { id: string; isActive: boolean })[];
  permisos: Record<string, PermisoParaGuia | null>;
  trozas: TrozaDelLibro[];
  /** Los N° que ya gastaron un talonario (este libro + guías de SERFOR guardadas), con su dueño. */
  talonario: { usadas: GtfUsadaLoth[] };
  ultimaGuia: GtfDatos | null;
  ultimaGuiaNumero?: string | null;
  ultimasPorPlan?: Record<string, { gtfNumber: string; datos: GtfDatos }>;
  /** La planta propia (Ficha del CTP) si el negocio lleva Libro CTP: una guía a ese RUC pasa allá. */
  ctpPropio: PlantaPropia | null;
}

export function usePreparadoGuiaLoth() {
  const [prep, setPrep] = useState<PreparadoGuiaLoth | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/despacho-guia", { credentials: "include", cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Partial<PreparadoGuiaLoth> & { message?: string };
      if (!r.ok) throw new Error(j.message ?? `No se pudo preparar la guía (${r.status})`);
      setPrep({
        caratula: j.caratula ?? null,
        planes: j.planes ?? [],
        permisos: j.permisos ?? {},
        trozas: j.trozas ?? [],
        talonario: { usadas: j.talonario?.usadas ?? [] },
        ultimaGuia: j.ultimaGuia ?? null,
        ultimaGuiaNumero: j.ultimaGuiaNumero ?? null,
        ultimasPorPlan: j.ultimasPorPlan ?? {},
        ctpPropio: j.ctpPropio ?? null,
      });
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => void cargar(), [cargar]);

  return { prep, cargando, errorCarga, cargar };
}
