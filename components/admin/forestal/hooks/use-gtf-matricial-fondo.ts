"use client";

/**
 * La foto o el escaneo del talonario vacío, de fondo en el diseñador. Es sólo
 * una ayuda para alinear a ojo: no se imprime y no viaja al servidor. Se
 * guarda en ESTE navegador (achicada a 1600 px en JPEG para que entre en el
 * almacenamiento local), una por hoja («guía» / «lista»).
 */

import { useCallback, useEffect, useState } from "react";
import type { FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import type { FondoHoja } from "../gtf-matricial-hoja";

const clave = (f: FormatoTalonario) => `gtf-matricial-fondo:${f}`;
const LADO_MAX = 1600;

interface Guardado {
  src: string | null;
  opacidad: number;
  cuadricula: boolean;
}

const VACIO: Guardado = { src: null, opacidad: 0.5, cuadricula: true };

function leer(f: FormatoTalonario): Guardado {
  try {
    const raw = localStorage.getItem(clave(f));
    if (!raw) return VACIO;
    const j = JSON.parse(raw) as Partial<Guardado>;
    return {
      src: typeof j.src === "string" && j.src.startsWith("data:image/") ? j.src : null,
      opacidad: typeof j.opacidad === "number" ? Math.min(1, Math.max(0.05, j.opacidad)) : VACIO.opacidad,
      cuadricula: typeof j.cuadricula === "boolean" ? j.cuadricula : VACIO.cuadricula,
    };
  } catch {
    return VACIO;
  }
}

/** Achica la imagen a `LADO_MAX` y la devuelve como `data:` JPEG. */
function achicar(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

export function useFondoTalonario(formato: FormatoTalonario) {
  const [fondo, setFondo] = useState<Guardado>(VACIO);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => setFondo(leer(formato)), [formato]);

  const guardar = useCallback(
    (nuevo: Guardado) => {
      setFondo(nuevo);
      try {
        localStorage.setItem(clave(formato), JSON.stringify(nuevo));
        setAviso(null);
      } catch {
        setAviso("La imagen se ve ahora, pero este navegador no la pudo guardar para la próxima vez.");
      }
    },
    [formato],
  );

  const subir = useCallback(
    async (archivo: File) => {
      try {
        guardar({ ...fondo, src: await achicar(archivo) });
      } catch (err) {
        setAviso(err instanceof Error ? err.message : String(err));
      }
    },
    [fondo, guardar],
  );

  const valor: FondoHoja = fondo;
  return {
    fondo: valor,
    aviso,
    subir,
    quitar: () => guardar({ ...fondo, src: null }),
    setOpacidad: (opacidad: number) => guardar({ ...fondo, opacidad }),
    setCuadricula: (cuadricula: boolean) => guardar({ ...fondo, cuadricula }),
  };
}
