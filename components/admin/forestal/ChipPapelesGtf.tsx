"use client";

/**
 * «Papeles 3/4» en la fila de una GTF del Libro TH (ADR-482): cuántos papeles
 * de ley tiene (factura, guía de remisión, GTF, lista de trozas firmada).
 * Tocarlo abre «Documentos del permiso» de esa guía, con los casilleros.
 * Fuera de `PapelesGuiasProvider` o sin medir, no dibuja nada.
 */

import { useState } from "react";
import { PastillaPapeles } from "./ctp-documentos-guia-contexto";
import { permisoDeLaGuiaGtf } from "./gtf-acciones-menu";
import type { Gtf } from "./gtf-tabla-columnas";
import GtfDocumentosModal from "./GtfDocumentosModal";
import { usePapelesGuias } from "./papeles-guias-contexto";

export default function ChipPapelesGtf({ g }: { g: Gtf }) {
  const ctx = usePapelesGuias();
  const [abierto, setAbierto] = useState(false);
  const faltan = ctx?.faltan[g.gtfNumber];
  /* Una anulada no recibe papeles (el servidor responde 404 al subir): sin pastilla. */
  if (!faltan || g.status === "anulada" || g.deletedAt) return null;
  return (
    <>
      <PastillaPapeles
        gtf={g.gtfNumber}
        faltan={faltan}
        onClick={() => setAbierto(true)}
        className="mt-0.5"
      />
      {abierto && (
        <GtfDocumentosModal
          planId={g.planId ?? null}
          permiso={permisoDeLaGuiaGtf(g)}
          gtfNumber={g.gtfNumber}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}
