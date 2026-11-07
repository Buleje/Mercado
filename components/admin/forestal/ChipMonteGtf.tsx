"use client";

/**
 * La pastilla «Por imprimir / Impresa / Confirmada / Observada» en la fila de
 * una GTF (16-10): cómo va su envío al monte. Tocarla abre el detalle con la
 * foto. Fuera de `ColaMonteProvider`, o si la guía nunca se mandó, no dibuja.
 */

import { useState } from "react";
import { ETIQUETA_ESTADO } from "@/lib/forestal/gtf-cola-monte";
import { useColaMonteCtx } from "./cola-monte-contexto";
import GtfEnvioMonteModal from "./GtfEnvioMonteModal";
import { PastillaEstadoMonte } from "./gtf-cola-monte-ui";
import type { Gtf } from "./gtf-tabla-columnas";

export default function ChipMonteGtf({ g }: { g: Pick<Gtf, "id"> }) {
  const ctx = useColaMonteCtx();
  const [abierto, setAbierto] = useState(false);
  const t = ctx?.porGuia.get(g.id);
  if (!ctx || !t) return null;
  const titulo = t.estado === "observada" && t.observacion ? `Observada: ${t.observacion}` : `En el monte: ${ETIQUETA_ESTADO[t.estado]}. Toca para ver la foto y el detalle.`;
  return (
    <>
      <PastillaEstadoMonte estado={t.estado} conFoto={!!t.fotoDocId} onClick={() => setAbierto(true)} titulo={titulo} />
      {abierto && <GtfEnvioMonteModal trabajo={t} cambiar={ctx.cambiar} onClose={() => setAbierto(false)} />}
    </>
  );
}
