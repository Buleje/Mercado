"use client";

/**
 * Lo que se edita del puente de pantalla en «Conectar»: los tres ajustes del
 * modo vivo, el recorte y qué programa tiene abierto la PC (eso último sólo
 * cambia el comando que se copia).
 *
 * Los números se guardan como texto mientras se escriben: con `Number` directo,
 * borrar el «8» para poner «12» dejaba un 1 (el mínimo) en el medio.
 */

import { useState } from "react";
import type { CamaraConConexion } from "./ConectarCamaraModal";
import {
  acotarAjuste,
  ajustesConDefectos,
  camposPuente,
  esTodaLaImagen,
  mismoRecorte,
  VIVO_POR_DEFECTO,
  type AjustesVivo,
  type CamposPuente,
  type Recorte,
  type VentanaPuente,
} from "./puente-pc";

/** Vacío = el valor por defecto; lo demás, acotado al rango que acepta el servidor. */
function leerCampo(campo: keyof AjustesVivo, texto: string): number {
  const t = texto.trim().replace(",", ".");
  return t === "" ? VIVO_POR_DEFECTO[campo] : acotarAjuste(campo, Number(t));
}

export function useAjustesPuente(camara: CamaraConConexion) {
  /* El modal se monta por cámara (`key`): el estado inicial se lee una vez y
     una recarga de la lista mientras se escribe no pisa lo tipeado. */
  const previos = camposPuente(camara);
  const inicial = ajustesConDefectos(previos.vivo);
  const [umbral, setUmbral] = useState(String(inicial.umbralPct));
  const [cadaMin, setCadaMin] = useState(String(inicial.cadaMin));
  const [maxDia, setMaxDia] = useState(String(inicial.maxDia));
  const [recorte, setRecorte] = useState<Recorte | null>(previos.recorte ?? null);
  const [ventana, setVentana] = useState<VentanaPuente>("BlueStacks");

  const vivo: Required<AjustesVivo> = {
    umbralPct: leerCampo("umbralPct", umbral),
    cadaMin: leerCampo("cadaMin", cadaMin),
    maxDia: leerCampo("maxDia", maxDia),
  };
  const recorteFinal = esTodaLaImagen(recorte) ? null : recorte;
  const activo = previos.fuente === "puente_pc";
  const hayCambios =
    !activo ||
    vivo.umbralPct !== inicial.umbralPct ||
    vivo.cadaMin !== inicial.cadaMin ||
    vivo.maxDia !== inicial.maxDia ||
    !mismoRecorte(recorteFinal, previos.recorte ?? null);

  /** Lo que se manda al guardar: la fuente, los tres ajustes y el recorte (`null` = toda la imagen). */
  const datos = (): CamposPuente => ({ fuente: "puente_pc", vivo, recorte: recorteFinal });

  return {
    activo,
    /** El recorte que el servidor ya está aplicando: el cuadro que se ve viene así. */
    base: previos.recorte ?? null,
    umbral,
    setUmbral,
    cadaMin,
    setCadaMin,
    maxDia,
    setMaxDia,
    vivo,
    recorte,
    setRecorte,
    ventana,
    setVentana,
    hayCambios,
    datos,
  };
}

export type AjustesPuente = ReturnType<typeof useAjustesPuente>;
