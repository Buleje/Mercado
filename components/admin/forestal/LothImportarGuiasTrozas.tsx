"use client";

/**
 * «Trozas y resumen» en la vista previa de «Importar guías despachadas»
 * (Brandon 07-10-2026: «el detalle de trozas, lista de trozas y resúmenes» en
 * su propia sección): la lista de trozas con su ≈pt, el resumen por especie
 * con el detalle del producto (37) declarado y la tala referencial que se
 * armaría (tenue si el interruptor de la tala está apagado).
 *
 * Sin ficha de SERFOR (sólo la lista de trozas) igual va el resumen por especie.
 */

import { useMemo } from "react";
import { BlockTitle } from "@buleje/design-system";
import type { TalaReferencial, TrozaImportada } from "@/lib/forestal/loth-importar-guia-tipos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import LothImportarGuiasBloques from "./LothImportarGuiasBloques";
import { TablaTalas, TablaTrozas } from "./LothImportarGuiasTablas";

/** El título de cada lista (el `BlockTitle` del DS) y su detalle en gris. */
const ROTULO = "px-3 pb-1 pt-3";
const DETALLE = "ml-2 font-normal text-[var(--text-secondary)]";

export default function LothImportarGuiasTrozas({
  ficha,
  trozas,
  talas,
  especies,
  conTala,
}: {
  ficha: GtfSerfor | null;
  trozas: TrozaImportada[];
  talas: TalaReferencial[];
  /** Las especies de la guía, para el rótulo de la lista. */
  especies: readonly string[];
  /** El interruptor de la tala del grupo: apagado, la tala se ve tenue y «no se arma». */
  conTala: boolean;
}) {
  const piezas = useMemo(
    () =>
      trozas.map((t) => ({
        comun: t.speciesCommon,
        cientifico: t.speciesScientific,
        m3: t.volumeM3,
      })),
    [trozas],
  );
  return (
    <div className="pb-1">
      {trozas.length > 0 && (
        <>
          <BlockTitle as="p" className={ROTULO}>
            Lista de trozas ({trozas.length})
            {especies.length > 0 && <span className={DETALLE}>· {especies.join(", ")}</span>}
          </BlockTitle>
          <TablaTrozas trozas={trozas} />
        </>
      )}
      <div className="px-3 pb-2 pt-2">
        <LothImportarGuiasBloques ficha={ficha} piezas={piezas} partes="resumen" />
      </div>
      {talas.length > 0 && (
        <div className={conTala ? "" : "opacity-60"}>
          <BlockTitle as="p" className={ROTULO}>
            Tala referencial ({talas.length} {talas.length === 1 ? "árbol" : "árboles"})
            {!conTala && <span className={DETALLE}>· no se arma</span>}
          </BlockTitle>
          <TablaTalas talas={talas} />
        </div>
      )}
    </div>
  );
}
