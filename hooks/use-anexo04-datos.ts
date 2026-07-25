"use client";

/**
 * use-anexo04-datos — cabecera y pie del ANEXO N° 04 persistidos por tenant.
 *
 * En el aserradero se emite guía tras guía: la razón social, el logo y el
 * firmante se cargan UNA vez y quedan. Las imágenes (logo/firma/sello) van en
 * claves propias porque los datos se guardan en cada tecla y un dataURL de
 * ~50 KB no puede viajar en cada una.
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

export function useAnexo04Datos(opts: {
  /** Precargas al abrir desde una línea del Libro (GTF y destino del despacho). */
  gtfInicial?: string;
  observacionesIniciales?: string;
  onError?: (msg: string) => void;
}): [DatosAnexo04, (patch: Partial<DatosAnexo04>) => void] {
  const [datos, setDatos] = useState<DatosAnexo04>(DATOS_ANEXO04_DEFAULT);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveDatos());
      const guardado = raw ? (JSON.parse(raw) as Partial<DatosAnexo04>) : {};
      const imagenes: Partial<DatosAnexo04> = {};
      for (const { campo, aspecto } of IMAGENES_ANEXO) {
        const src = localStorage.getItem(claveImagen(campo));
        if (!src) continue;
        const asp = Number(localStorage.getItem(`${claveImagen(campo)}-aspect`));
        Object.assign(imagenes, { [campo]: src, [aspecto]: asp > 0 ? asp : 1 });
      }
      setDatos({
        ...DATOS_ANEXO04_DEFAULT, ...guardado, ...imagenes,
        ...(opts.gtfInicial ? { gtf: opts.gtfInicial } : {}),
        ...(opts.observacionesIniciales ? { observaciones: opts.observacionesIniciales } : {}),
      });
    } catch { /* json corrupto → defaults */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar: después manda lo que edite el usuario
  }, []);

  const set = (patch: Partial<DatosAnexo04>) => {
    setDatos((d) => {
      const next = { ...d, ...patch };
      try {
        const resto: Partial<DatosAnexo04> = { ...next };
        for (const { campo, aspecto } of IMAGENES_ANEXO) {
          delete resto[campo]; delete resto[aspecto];
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
