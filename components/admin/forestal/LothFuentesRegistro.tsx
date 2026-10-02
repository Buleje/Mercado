"use client";

/**
 * Una especie del registro en la lista de «Nueva línea · Tala» de una
 * PLANTACIÓN (ADR-459): elegirla llena la línea; «Varios» abre la planilla de
 * la tala en tanda con N árboles de esa especie (Brandon 02-10: en una
 * plantación sin censo había que registrar árbol por árbol).
 */

import { useState } from "react";
import { Axe, Layers, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { SourceItem } from "./LothFuentesLista";
import { CitesPill } from "./loth-entry-form-ui";
import { CantidadArboles } from "./LothTalaTandaRegistro";

/** Una especie del registro: «Bolaina · Guazuma crinita · quedan 118.250 de 120.500 m³». */
export default function FilaRegistro({
  it,
  onElegir,
  varios,
}: {
  it: SourceItem;
  onElegir: (it: SourceItem) => void;
  /** «Varios»: abrir la planilla con N filas de esta especie. */
  varios: { abierto: boolean; onAbrir: (abrir: boolean) => void; onTalar: (n: number) => void } | null;
}) {
  const r = it.registro;
  const pasa = r != null && r.enPieM3 < 0;
  const [n, setN] = useState(2);
  const especie = it.species ?? "";
  return (
    <div data-especie-registro={especie}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => onElegir(it)}
          className="flex min-h-10 min-w-0 flex-1 items-center justify-between gap-3 px-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <span className="min-w-[4.5rem] truncate text-sm font-bold text-[var(--text-primary)]">{especie}</span>
            {it.scientific && <span className="hidden truncate text-sm italic text-[var(--text-tertiary)] sm:inline">{it.scientific}</span>}
            {it.cites && <CitesPill />}
          </span>
          {r && (
            <span
              className={`shrink-0 font-mono text-xs tabular-nums ${pasa ? "font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`}
            >
              {pasa ? (
                `pasa por ${fmtM3(-r.enPieM3)} m³`
              ) : varios ? (
                <>
                  quedan {fmtM3(r.enPieM3)}
                  {/* A 400 px, con «Varios» al lado, el «de X» apretaba el nombre a «B…». */}
                  <span className="hidden sm:inline"> de {fmtM3(r.registradoM3)}</span> m³
                </>
              ) : (
                `quedan ${fmtM3(r.enPieM3)} de ${fmtM3(r.registradoM3)} m³`
              )}
            </span>
          )}
        </button>
        {varios && (
          <button
            type="button"
            onClick={() => varios.onAbrir(!varios.abierto)}
            aria-expanded={varios.abierto}
            aria-label={`Talar varios árboles de ${especie}`}
            title={`Talar varios árboles de ${especie} en una planilla`}
            className="mr-1 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
          >
            {varios.abierto ? <X className="h-4 w-4" aria-hidden="true" /> : <Layers className="h-4 w-4" aria-hidden="true" />}
            Varios
          </button>
        )}
      </div>
      {varios?.abierto && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{especie} ×</span>
          <CantidadArboles valor={n} onValor={setN} especie={especie} />
          <button
            type="button"
            onClick={() => varios.onTalar(n)}
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--accent-dark)] px-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
          >
            <Axe className="h-4 w-4" aria-hidden="true" /> Talar {n === 1 ? "1 árbol" : `${n} árboles`}
          </button>
        </div>
      )}
    </div>
  );
}
