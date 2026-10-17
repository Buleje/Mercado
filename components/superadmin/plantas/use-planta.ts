"use client";

import { useCallback, useState } from "react";
import type { PlantaFichaResponse } from "@/lib/superadmin/plantas-forestales/tipos";
import { escribirSuperadmin, useCargaSuperadmin } from "./use-carga";
import { usePeriodo } from "./use-periodo";

const POR_ESTADO = { 404: "Ese negocio no es una planta forestal (no tiene el libro CTP activado) o ya no existe." };

/** Ficha de una planta: lectura, «Recalcular» y el interruptor «Planta de prueba». */
export function usePlanta(tenantId: string) {
  const periodo = usePeriodo();
  const q = new URLSearchParams({ desde: periodo.rango.desde, hasta: periodo.rango.hasta });
  const carga = useCargaSuperadmin<PlantaFichaResponse>(
    `/api/superadmin/plantas/${encodeURIComponent(tenantId)}?${q.toString()}`,
    POR_ESTADO,
  );
  const [ocupado, setOcupado] = useState<"recalcular" | "prueba" | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const { recargar } = carga;

  const correr = useCallback(
    async (cual: "recalcular" | "prueba", url: string, method: "POST" | "PATCH", body: unknown) => {
      setOcupado(cual);
      setErrorAccion(null);
      const err = await escribirSuperadmin(url, method, body);
      setOcupado(null);
      if (err) setErrorAccion(err);
      else recargar();
    },
    [recargar],
  );

  const recalcular = useCallback(
    () => correr("recalcular", "/api/superadmin/plantas/refrescar", "POST", { tenantId }),
    [correr, tenantId],
  );
  const marcarPrueba = useCallback(
    (esPrueba: boolean) => correr("prueba", "/api/superadmin/plantas/prueba", "PATCH", { tenantId, esPrueba }),
    [correr, tenantId],
  );

  return { ...carga, periodo, recalcular, marcarPrueba, ocupado, errorAccion };
}
