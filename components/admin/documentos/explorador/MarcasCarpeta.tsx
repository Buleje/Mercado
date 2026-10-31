"use client";

import { useMemo } from "react";
import { Link2, Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { esEsencial } from "@/lib/documentos/esenciales";
import { rotuloDeMarca, vinculosConMarca, type CarpetaParaVinculo } from "@/lib/documentos/vinculos-sistema";
import { useNombresVinculos } from "../terceros/use-nombres-vinculos";

/**
 * Las marcas chicas al lado del nombre de una carpeta (Brandon 24-10): una
 * estrella si es Esencial y un eslabón si está vinculada al sistema (a un
 * tercero, al plan del Libro TH o es la carpeta de un módulo). El ⓘ nativo
 * dice a quién: «Ligada a: Santa Rosa (Libro CTP)».
 *
 * `shrink-0`: el nombre de al lado es el que se trunca, nunca las marcas.
 */
export default function MarcasCarpeta({ carpeta, sinEsencial = false, className }: {
  carpeta: CarpetaParaVinculo;
  /** Dentro de Esenciales todo es esencial: la estrella sobra. */
  sinEsencial?: boolean;
  className?: string;
}) {
  const vinculos = useMemo(() => vinculosConMarca(carpeta), [carpeta]);
  const claves = useMemo(() => vinculos.filter((v) => v.origen === "ligado").map((v) => v.clave), [vinculos]);
  const nombres = useNombresVinculos(claves);
  const esencial = !sinEsencial && esEsencial(carpeta);
  if (!esencial && vinculos.length === 0) return null;
  const rotulo = vinculos.length > 0 ? rotuloDeMarca(vinculos, nombres) : "";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)} data-qa="marcas-carpeta">
      {esencial && (
        <span role="img" aria-label="Esencial" title="Esencial" className="inline-flex" data-qa="marca-esencial">
          <Star aria-hidden className="h-3.5 w-3.5 fill-current text-[var(--accent-ink)]" />
        </span>
      )}
      {vinculos.length > 0 && (
        <span role="img" aria-label={rotulo} title={rotulo} className="inline-flex" data-qa="marca-vinculo">
          <Link2 aria-hidden className="h-3.5 w-3.5 text-[var(--data-info-ink)]" />
        </span>
      )}
    </span>
  );
}
