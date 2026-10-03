"use client";

/**
 * «Datos de la guía» en la vista previa de «Importar guías despachadas»
 * (ADR-461). Desde el 02-10-2026 (Brandon: «todos los datos en bloques igual
 * como es para despachar, y un resumen por especie») son los bloques de
 * `LothImportarGuiasBloques`, de a dos por fila, en vez de la hoja de
 * casilleros del CTP.
 *
 * Plegable: con 20 guías en la vista previa, 20 grillas abiertas serían un muro.
 * Con pocas guías (`abiertaDeEntrada`) arranca abierta; se dibuja recién al
 * abrirla.
 */

import { useMemo, useState } from "react";
import { placasDeLaGuia, sinRaya } from "@/lib/forestal/loth-importar-guia";
import type { TrozaImportada } from "@/lib/forestal/loth-importar-guia-tipos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import LothImportarGuiasBloques from "./LothImportarGuiasBloques";

export default function LothImportarGuiasDatos({
  ficha,
  trozas,
  abiertaDeEntrada,
}: {
  ficha: GtfSerfor | null;
  trozas: readonly TrozaImportada[];
  abiertaDeEntrada: boolean;
}) {
  const [abierta, setAbierta] = useState(abiertaDeEntrada);
  const piezas = useMemo(
    () =>
      trozas.map((t) => ({
        comun: t.speciesCommon,
        cientifico: t.speciesScientific,
        m3: t.volumeM3,
      })),
    [trozas],
  );
  const placa = ficha ? placasDeLaGuia(ficha.placa).placa : "";
  const viaje = ficha
    ? [sinRaya(ficha.titular), sinRaya(ficha.destinatario)].filter(Boolean).join(" → ")
    : "";
  const resumen = [viaje, placa].filter(Boolean).join(" · ");
  return (
    <details
      className="border-t border-[var(--rule-soft)]"
      open={abierta}
      onToggle={(e) => setAbierta(e.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 px-3 py-1 text-sm font-semibold text-[var(--text-primary)]">
        {ficha ? "Datos de la guía" : "Resumen por especie"}
        {resumen && (
          <span className="min-w-0 font-normal text-[var(--text-secondary)] [overflow-wrap:anywhere]">
            · {resumen}
          </span>
        )}
      </summary>
      {abierta && (
        <div className="px-3 pb-3">
          <LothImportarGuiasBloques ficha={ficha} piezas={piezas} />
        </div>
      )}
    </details>
  );
}
