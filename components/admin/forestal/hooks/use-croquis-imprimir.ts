"use client";

/**
 * useCroquisImprimir — arma la hoja A4 apaisada del croquis (ADR-465) para
 * `CtpDocumentoVisor`: trae el plano como data URL, toma la identidad de la
 * Ficha del CTP y deja el documento listo para mirar, imprimir o bajar en PDF.
 *
 * El plano viaja como data URL y no por su URL firmada: el PDF se arma
 * fotografiando la hoja, y una imagen de otro origen sin CORS lo ensucia (el
 * plano saldría en blanco justo en el papel). Si no se puede traer, se usa la
 * URL igual: imprimir sigue andando.
 */

import { useCallback, useState } from "react";
import { useFichaCtp, type FichaCtp } from "@/hooks/use-ficha-ctp";
import { logger } from "@/lib/logger";
import type { ContenidoZona } from "@/lib/forestal/planta-croquis";
import { croquisDocumento, type EmpresaCroquis } from "@/lib/forestal/planta-croquis-print";
import type { PlantaCroquis, PlantaZona } from "@/lib/forestal/planta-zona-types";
import type { DocumentoImprimible } from "../CtpDocumentoVisor";

async function aDataUrl(url: string): Promise<string | null> {
  // Sin `credentials: "include"`: la firma redirige a otro origen que responde
  // `Access-Control-Allow-Origin: *`, y con credenciales el navegador lo rechaza.
  const r = await fetch(url);
  if (!r.ok) return null;
  const blob = await r.blob();
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(typeof fr.result === "string" ? fr.result : null);
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}

/** Cabecera de la hoja: nombre del CTP, razón social y RUC, código y ubicación. */
export function empresaDeFicha(f: FichaCtp | null): EmpresaCroquis {
  const nombre = f?.nombreCtp?.trim() || f?.razonSocial?.trim() || "Tu aserradero";
  const razon = f?.razonSocial?.trim() && f.razonSocial.trim() !== nombre ? f.razonSocial.trim() : null;
  return {
    nombre,
    meta: [
      [razon, f?.ruc?.trim() ? `RUC ${f.ruc.trim()}` : null].filter(Boolean).join(" · "),
      f?.codigoCtp?.trim() ? `CTP ${f.codigoCtp.trim()}` : "",
      [f?.distrito, f?.provincia, f?.region].map((x) => x?.trim()).filter(Boolean).join(" – "),
    ].filter(Boolean),
    logo: f?.logo ?? null,
  };
}

export function useCroquisImprimir(p: { croquis: PlantaCroquis | null; zonas: PlantaZona[]; contenido: Record<string, ContenidoZona> }) {
  const ficha = useFichaCtp();
  const [doc, setDoc] = useState<DocumentoImprimible | null>(null);
  const [armando, setArmando] = useState(false);
  const { croquis, zonas, contenido } = p;

  /** Devuelve el motivo si no se pudo armar (para el aviso de la vista). */
  const abrir = useCallback(async (): Promise<string | null> => {
    if (!croquis) return "Tu aserradero todavía no tiene croquis: configúralo para poder imprimirlo.";
    setArmando(true);
    try {
      let imagen: string | null = croquis.imagenUrl;
      if (croquis.imagenUrl) {
        imagen = await aDataUrl(croquis.imagenUrl).catch((err: unknown) => {
          logger.error("[croquis-imprimir] plano no se pudo traer", { error: String(err) });
          return null;
        }) ?? croquis.imagenUrl;
      }
      setDoc(croquisDocumento({ croquis, zonas, contenido, imagen, empresa: empresaDeFicha(ficha), fecha: new Date() }));
      return null;
    } finally {
      setArmando(false);
    }
  }, [croquis, zonas, contenido, ficha]);

  const cerrar = useCallback(() => setDoc(null), []);
  return { doc, armando, abrir, cerrar };
}
