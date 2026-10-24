"use client";

import type { DbDocumentFolder } from "@/lib/types/documents";
import type { CarpetaEsencial } from "@/lib/documentos/esenciales";
import TarjetaEsencial, { type AccionesTarjeta } from "./TarjetaEsencial";

/** La grilla de tarjetas, con el lugar de cada una en «Mi orden» (para apagar mover en las puntas). */
export default function TarjetasEsenciales({ lista, ordenActual, elegidaId, ahora, acciones }: {
  lista: readonly CarpetaEsencial<DbDocumentFolder>[];
  ordenActual: readonly string[];
  elegidaId: string | null;
  ahora: number;
  acciones: AccionesTarjeta;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3" data-qa="esenciales-tarjetas">
      {lista.map((e) => {
        const i = ordenActual.indexOf(e.carpeta.id);
        return (
          <TarjetaEsencial
            key={e.carpeta.id}
            e={e}
            elegida={e.carpeta.id === elegidaId}
            ahora={ahora}
            puesto={{ primera: i <= 0, ultima: i === ordenActual.length - 1 }}
            acciones={acciones}
          />
        );
      })}
    </ul>
  );
}
