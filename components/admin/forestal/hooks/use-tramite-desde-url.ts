"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DatosTramite } from "@/lib/forestal/tramites-catalogo";
import type { DatosDesdeGuias } from "@/lib/forestal/tramites-desde-guias";
import type { TramiteRegistro } from "@/lib/forestal/tramites-registro";

export type SumarGuias = { instancia: number; guiasJson: string; numeros: string[] };

type Args = {
  /** Resultado de `useTramiteDesdeGuias` (lo que pidió `?formato=&guias=`). */
  resultadoGuias: DatosDesdeGuias | null;
  formatoGuias: string | null;
  formatoId: string | null;
  instancia: number;
  setFormatoId: Dispatch<SetStateAction<string | null>>;
  setEditando: Dispatch<SetStateAction<TramiteRegistro | null>>;
  setSeedDatos: Dispatch<SetStateAction<DatosTramite | null>>;
  setPrellenado: Dispatch<SetStateAction<DatosTramite | null>>;
  setInstancia: Dispatch<SetStateAction<number>>;
  setVista: (v: "catalogo") => void;
};

/**
 * Llegó con guías elegidas: abre su formato con lo que traen (y otra vez si
 * pide incluir una anulada reemitida: «Incluirla igual» le suma las filas al
 * formulario abierto sin rearmarlo, lo tipeado queda).
 */
export function useTramiteDesdeUrl(a: Args): SumarGuias | null {
  const { resultadoGuias, formatoGuias, formatoId, instancia } = a;
  const { setFormatoId, setEditando, setSeedDatos, setPrellenado, setInstancia, setVista } = a;
  /** El resultado ya volcado y en qué montaje del formulario quedó. */
  const aplicadoGuias = useRef<{ resultado: DatosDesdeGuias; instancia: number } | null>(null);
  const [sumarGuias, setSumarGuias] = useState<SumarGuias | null>(null);

  useEffect(() => {
    if (!resultadoGuias || !formatoGuias) return;
    const previo = aplicadoGuias.current;
    if (previo?.resultado === resultadoGuias) return;
    if (previo && formatoId === formatoGuias && previo.instancia === instancia) {
      aplicadoGuias.current = { resultado: resultadoGuias, instancia };
      setSumarGuias({ instancia, guiasJson: resultadoGuias.datos.guiasJson ?? "", numeros: previo.resultado.reemitidasExcluidas });
      return;
    }
    aplicadoGuias.current = { resultado: resultadoGuias, instancia: instancia + 1 };
    setFormatoId(formatoGuias);
    setEditando(null);
    setSeedDatos(null);
    setPrellenado(resultadoGuias.datos);
    setInstancia(instancia + 1);
    setVista("catalogo");
  }, [resultadoGuias, formatoGuias, formatoId, instancia, setFormatoId, setEditando, setSeedDatos, setPrellenado, setInstancia, setVista]);

  return sumarGuias;
}
