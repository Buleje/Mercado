"use client";

/**
 * use-logos-titulares — de qué titular es cada logo, para encabezar sus papeles.
 *
 * La guía de ingreso se imprime con el membrete del TITULAR (la comunidad, la
 * concesión, la maderera que la emitió), no con el del aserradero. El logo vive
 * en el directorio, pero la guía sólo trae el nombre del titular y su documento:
 * este hook trae la lista corta de partes con logo —normalmente dos o tres— y
 * arma el índice para cruzarlas.
 *
 * ── Por qué el documento manda ──────────────────────────────────────────────
 * Primero se busca por RUC/DNI, que es lo que identifica a una empresa; el
 * nombre es el desempate. "MADERERA DEL ORIENTE SAC" y "Maderera del Oriente"
 * son la misma empresa escrita dos veces, y por eso el nombre se compara
 * normalizado (sin tildes, sin puntuación, en minúsculas). Aun así, dos
 * empresas distintas pueden llamarse casi igual: por documento no hay dudas.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

interface LogoDeParte {
  id: string;
  nombre: string;
  docNumero: string | null;
  logo: string;
}

/** "CC.NN. San Luis" y "CCNN SAN LUIS" tienen que dar la misma clave. */
const clave = (v: string): string =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();

const soloDigitos = (v: string): string => (v ?? "").replace(/\D/g, "");

export function useLogosTitulares(): {
  /** Logo del titular, o `null` si no hay ninguno cargado para él. */
  logoDe: (nombre?: string | null, documento?: string | null) => string | null;
  cargados: number;
} {
  const [logos, setLogos] = useState<LogoDeParte[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/directorio?logos=1", { credentials: "include", headers: csrfHeaders() })
      .then((r) => (r.ok ? r.json() : { logos: [] }))
      .then((j: { logos?: LogoDeParte[] }) => {
        if (vivo) setLogos(j.logos ?? []);
      })
      .catch((err) => {
        // Sin logos el documento sale con el monograma del libro: es una mejora
        // de presentación, nunca un motivo para no poder imprimir.
        logger.warn("[logos-titulares] no se pudieron leer", { error: String(err) });
      });
    return () => {
      vivo = false;
    };
  }, []);

  const logoDe = useCallback(
    (nombre?: string | null, documento?: string | null) => {
      if (logos.length === 0) return null;
      const doc = soloDigitos(documento ?? "");
      if (doc) {
        const porDoc = logos.find((l) => soloDigitos(l.docNumero ?? "") === doc);
        if (porDoc) return porDoc.logo;
      }
      const k = clave(nombre ?? "");
      if (!k) return null;
      return logos.find((l) => clave(l.nombre) === k)?.logo ?? null;
    },
    [logos],
  );

  return { logoDe, cargados: logos.length };
}
