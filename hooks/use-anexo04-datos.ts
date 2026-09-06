"use client";

/**
 * use-anexo04-datos — las imágenes del ANEXO N° 04, persistidas por tenant.
 *
 * ── 2026-08: el anexo abre EN BLANCO (Brandon) ───────────────────────────────
 * Antes se guardaba todo —N°, GTF, razón social, firmante, documento, cargo,
 * observaciones— y cada anexo nuevo abría con lo de la guía anterior. En un
 * papel que es declaración jurada eso es peligroso al revés de lo que parece:
 * el campo lleno se lee como revisado, y el N° o la GTF del viaje pasado se
 * cuelan en el del viaje de hoy sin que nadie los mire.
 *
 * Sobreviven sólo dos cosas, y ninguna es un dato del documento:
 *  · las IMÁGENES (logo, firma, sello) — se cargan una vez y no se re-suben;
 *  · cómo se ARMA la hoja (unidad de la columna V y modo oficial/compacto).
 *
 * Las imágenes van en claves propias porque los datos se guardan en cada tecla
 * y un dataURL de ~50 KB no puede viajar en cada una.
 */
import { useEffect, useState } from "react";
import {
  DATOS_ANEXO04_DEFAULT, IMAGENES_ANEXO, type DatosAnexo04,
} from "@/lib/forestal/anexo04-serfor";

/** Clave por tenant de todo lo del anexo (datos, imágenes, emisores). */
export const claveTenant = (sufijo: string) => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-anexo04-${sufijo}${slug}`;
};
const claveDatos = () => claveTenant("");
const claveImagen = (campo: string) => claveTenant(`${campo}-`);

/**
 * Lo único que sobrevive de un anexo al siguiente. NO son datos del papel: son
 * cómo se dibuja la hoja. Todo lo que se declara (N°, GTF, razón social,
 * firmante, documento, cargo, observaciones) arranca vacío, a propósito.
 */
const PREFERENCIAS = ["unidadV", "modo"] as const;

export function useAnexo04Datos(opts: {
  onError?: (msg: string) => void;
} = {}): [DatosAnexo04, (patch: Partial<DatosAnexo04>) => void] {
  const [datos, setDatos] = useState<DatosAnexo04>(DATOS_ANEXO04_DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveDatos());
      const guardado = raw ? (JSON.parse(raw) as Partial<DatosAnexo04>) : {};
      const preferencias: Partial<DatosAnexo04> = {};
      for (const k of PREFERENCIAS) {
        if (guardado[k]) Object.assign(preferencias, { [k]: guardado[k] });
      }
      const imagenes: Partial<DatosAnexo04> = {};
      for (const { campo, aspecto } of IMAGENES_ANEXO) {
        const src = localStorage.getItem(claveImagen(campo));
        if (!src) continue;
        const asp = Number(localStorage.getItem(`${claveImagen(campo)}-aspect`));
        Object.assign(imagenes, { [campo]: src, [aspecto]: asp > 0 ? asp : 1 });
      }
      setDatos({ ...DATOS_ANEXO04_DEFAULT, ...preferencias, ...imagenes });
    } catch { /* json corrupto → defaults */ }
  }, []);

  const set = (patch: Partial<DatosAnexo04>) => {
    setDatos((d) => {
      const next = { ...d, ...patch };
      try {
        /* Sólo las preferencias de armado: lo que se declara en el papel no se
           guarda, así el próximo anexo abre en blanco (y de paso se limpia lo
           que hubiera quedado de la versión anterior). */
        const resto: Partial<DatosAnexo04> = {};
        for (const k of PREFERENCIAS) Object.assign(resto, { [k]: next[k] });
        for (const { campo, aspecto } of IMAGENES_ANEXO) {
          if (!(campo in patch)) continue;
          const src = next[campo], asp = next[aspecto];
          if (src) {
            localStorage.setItem(claveImagen(campo), src);
            localStorage.setItem(`${claveImagen(campo)}-aspect`, String(asp ?? 1));
          } else {
            localStorage.removeItem(claveImagen(campo));
            localStorage.removeItem(`${claveImagen(campo)}-aspect`);
          }
        }
        localStorage.setItem(claveDatos(), JSON.stringify(resto));
      } catch {
        // Lo único que puede llenar la cuota son las imágenes.
        opts.onError?.("No se pudo guardar la imagen (espacio del navegador lleno).");
      }
      return next;
    });
  };

  return [datos, set];
}
