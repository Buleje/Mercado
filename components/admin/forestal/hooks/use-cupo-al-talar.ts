"use client";

/**
 * El cupo de la especie en el formulario de tala (T9): el aviso antes de
 * guardar, la confirmación y el motivo.
 *
 * Dos fuentes para el aviso: la cuenta local (censo cruzado con el libro +
 * autorizado del plan) y la respuesta 422 de la ruta, que es la que decide y
 * además ve las talas de códigos fuera del censo. Ambas quedan atadas a lo que
 * se está cargando (árbol · especie · volumen): si cambia el número, lo
 * confirmado deja de valer — se confirmó «154 %», no «170 %».
 */

import { useMemo, useState } from "react";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import {
  avisoCupoAlTalar,
  entradaDesdeCensoCruzado,
  motivoCupoValido,
  type EspecieAutorizadaCupo,
} from "@/lib/forestal/loth-cupo-especie";

interface Opciones {
  activo: boolean;
  arboles: readonly ArbolParaElegir[];
  autorizadas: readonly EspecieAutorizadaCupo[];
  treeCode: string;
  especie: string;
  volumenM3: number | null;
}

export interface CupoAlTalar {
  /** El aviso a mostrar, o `null` si la tala no pasa el cupo. */
  mensaje: string | null;
  /**
   * El cupo es el AUTORIZADO del plan: casilla + motivo obligatorios (la ruta
   * responde 422 sin motivo). Contra el censo es sólo aviso: el motivo es opcional.
   */
  obligatorio: boolean;
  confirmado: boolean;
  setConfirmado: (v: boolean) => void;
  motivo: string;
  setMotivo: (v: string) => void;
  /** Aviso obligatorio y falta la casilla o el motivo: no se puede guardar. */
  falta: boolean;
  /** Lo que viaja a la ruta (`motivoSobreCupo`), o `null`. */
  motivoParaEnviar: string | null;
  /** La ruta respondió T9: su mensaje manda aunque la cuenta local no lo viera. */
  recibirDelServidor: (mensaje: string) => void;
  limpiar: () => void;
}

export function useCupoAlTalar({ activo, arboles, autorizadas, treeCode, especie, volumenM3 }: Opciones): CupoAlTalar {
  const clave = `${treeCode.trim()}|${especie.trim()}|${volumenM3 ?? ""}`;
  const local = useMemo(
    () =>
      activo
        ? avisoCupoAlTalar(entradaDesdeCensoCruzado(arboles, autorizadas), { treeCode: treeCode.trim() || null, speciesCommon: especie, volumeM3: volumenM3 })
        : null,
    [activo, arboles, autorizadas, treeCode, especie, volumenM3],
  );
  const [servidor, setServidor] = useState<{ clave: string; mensaje: string } | null>(null);
  const [confirmadoPara, setConfirmadoPara] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const delServidor = servidor?.clave === clave ? servidor.mensaje : null;
  const mensaje = activo ? (local?.mensaje ?? delServidor) : null;
  /* El 422 de la ruta sólo llega contra lo autorizado: si lo trajo, obliga. */
  const obligatorio = mensaje != null && (local ? local.exigeMotivo : delServidor != null);
  const confirmado = mensaje != null && confirmadoPara === mensaje;
  const motivoOk = motivoCupoValido(motivo);
  return {
    mensaje,
    obligatorio,
    confirmado,
    setConfirmado: (v) => setConfirmadoPara(v ? mensaje : null),
    motivo,
    setMotivo,
    falta: obligatorio && !(confirmado && motivoOk),
    motivoParaEnviar: mensaje == null || !motivoOk ? null : !obligatorio || confirmado ? motivo.trim() : null,
    recibirDelServidor: (m) => setServidor({ clave, mensaje: m }),
    limpiar: () => {
      setServidor(null);
      setConfirmadoPara(null);
      setMotivo("");
    },
  };
}
