"use client";

/**
 * Las guías que siguen sin fecha de llegada al patio (de todo el libro, fuera
 * de meses cerrados) y la recepción en bloque para recibirlas: el aviso «Sin
 * recepcionar» de Trozas.
 *
 * El conteo sale del servidor (`wood-entries?sinRecibir=1`, el mismo criterio
 * que el bloque). Al abrir, cada guía se lee entera con `leerGuias` —todas sus
 * especies y trozas— y va a `CtpRecepcionBloqueModal` tal cual lo usa
 * Ingresos: arranca SIN marcas, porque la fecha de llegada no se adivina.
 */

import { useCallback, useEffect, useState } from "react";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { GuiasSinRecibir } from "@/lib/forestal/recepcion-al-importar";
import { faltaRecibirMadera } from "@/lib/forestal/recepcion-guias";
import { logger } from "@/lib/logger";
import type { GuiaParaBloque } from "../CtpRecepcionBloqueModal";
import { leerGuias, paraBloque } from "./use-abrir-arreglo";

export const URL_SIN_RECIBIR = "/api/admin/forestal/wood-entries?sinRecibir=1";

export function useGuiasSinRecibir() {
  const [resumen, setResumen] = useState<GuiasSinRecibir | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [abriendo, setAbriendo] = useState(false);
  /** Las guías del bloque abierto; `null` = cerrado. */
  const [guias, setGuias] = useState<GuiaParaBloque[] | null>(null);

  useEffect(() => {
    let vivo = true;
    ctpGet<{ sinRecibir?: GuiasSinRecibir }>(URL_SIN_RECIBIR)
      .then((j) => {
        if (vivo) setResumen(j.sinRecibir ?? null);
      })
      .catch((err) => logger.error("[guias-sin-recibir] no se pudo leer el aviso", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, [vuelta]);

  const recargar = useCallback(() => {
    invalidarCtp(URL_SIN_RECIBIR);
    setVuelta((v) => v + 1);
  }, []);

  /** Lee las guías del aviso y abre el bloque. Devuelve el error para que la vista lo diga. */
  const abrir = useCallback(async (): Promise<string | null> => {
    if (!resumen || resumen.gtfs.length === 0) return null;
    setAbriendo(true);
    try {
      const leidas = await leerGuias(resumen.gtfs);
      const porRecibir = leidas.filter((g) => faltaRecibirMadera(g)).map(paraBloque);
      if (porRecibir.length === 0) {
        recargar();
        return "Esas guías ya se recibieron: actualicé el aviso.";
      }
      setGuias(porRecibir);
      return null;
    } catch (err) {
      logger.error("[guias-sin-recibir] no se pudieron leer las guías", { error: String(err) });
      return "No se pudieron leer las guías. Vuelve a intentar.";
    } finally {
      setAbriendo(false);
    }
  }, [resumen, recargar]);

  const cerrar = useCallback(() => setGuias(null), []);

  return { resumen, abriendo, guias, abrir, cerrar, recargar };
}
