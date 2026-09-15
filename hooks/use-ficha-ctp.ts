"use client";

/**
 * use-ficha-ctp — la identidad legal del CTP (razón social, representante, RUC,
 * código SERFOR, títulos habilitantes) que ya vive en la Ficha del Libro.
 *
 * El ANEXO N° 04 y la GTF de salida piden esos mismos datos: tipearlos otra vez en
 * cada guía es pedir que un papel salga a nombre de algo distinto a lo registrado
 * ante la ARFFS. Acá se leen una vez y el consumidor los usa para completar y para
 * cotejar.
 *
 * `Partial<CtpFicha>` a propósito: la ficha de un CTP recién habilitado está a
 * medio llenar, así que todo campo se lee defensivo. Es el single source de
 * "leer la ficha desde un componente cliente" — no re-implementar el fetch.
 */
import { useEffect, useState } from "react";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";

export type FichaCtp = Partial<CtpFicha>;

export function useFichaCtp(): FichaCtp | null {
  const [ficha, setFicha] = useState<FichaCtp | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/ctp-ficha", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { ficha: null }))
      .then((j: { ficha?: FichaCtp | null }) => { if (vivo) setFicha(j.ficha ?? null); })
      // Sin ficha (o sin el módulo CTP) el anexo se llena a mano, como antes.
      .catch(() => { if (vivo) setFicha(null); })
      .finally(() => { /* sin estado de carga: es un autocompletado, no un bloqueo */ });
    return () => { vivo = false; };
  }, []);

  return ficha;
}
