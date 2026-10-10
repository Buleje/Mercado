/**
 * «Último aviso recibido» dicho en una línea (2026-10-05). PURO.
 *
 * El aviso es la última vez que la CÁMARA tocó la puerta (con foto, alerta sin
 * foto o la señal de vida); la «última foto» puede ser una subida a mano o del
 * puente: sólo se agrega cuando es más nueva que el aviso, para no repetir.
 */

import type { ContactoCamara } from "@/lib/camaras/contacto";
import { limaDateKey } from "@/lib/utils";
import { diaLegible, horaODia } from "./camaras-ui";

/** «hace un momento», «hace 5 min», «hace 3 h», «el jueves 01/10». */
export function haceCuanto(iso: string, ahora: number = Date.now()): string {
  const ms = ahora - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `el ${diaLegible(limaDateKey(iso))}`;
}

const DE_QUE: Record<ContactoCamara["tipo"], string> = {
  foto: "",
  alerta: " (sin foto)",
  latido: " (señal de vida)",
};

export function lineaDeAviso(
  c: { ultimoAviso?: ContactoCamara | null; ultimaCapturaEn?: string | null },
  ahora: number = Date.now(),
): string {
  const aviso = c.ultimoAviso;
  const texto = aviso
    ? `último aviso de la cámara ${haceCuanto(aviso.at, ahora)}${DE_QUE[aviso.tipo]}`
    : "la cámara nunca avisó";
  const fotoMasNueva =
    c.ultimaCapturaEn && (!aviso || Date.parse(c.ultimaCapturaEn) > Date.parse(aviso.at) + 1000);
  return fotoMasNueva ? `${texto} · última foto ${horaODia(c.ultimaCapturaEn)}` : texto;
}
