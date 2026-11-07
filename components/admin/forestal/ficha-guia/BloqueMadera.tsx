/**
 * «Madera» — qué trae la guía, especie por especie (casilleros 37a-37g).
 *
 * Una barra de proporción arriba (cuánto pesa cada especie en el volumen) y una
 * fila por asiento: la especie, lo declarado y las trozas que cuelgan de SU
 * fila (ADR-435). Si no coinciden, la cifra se pinta de aviso: es el mismo
 * cruce que hace un fiscalizador.
 */

import { Trees } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { repartoDeEspecies } from "@/lib/forestal/ficha-guia-resumen";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { ptDeLinea } from "@/lib/forestal/plata-de-guia";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { productLabel, StatusBadge, type WoodEntry } from "../ctp-shared";
import { BloqueFicha } from "./comun";

/** Colores de la barra: los acentos de dataviz, en orden fijo. */
const COLOR = [
  "bg-[var(--data-5)]",
  "bg-[var(--data-6)]",
  "bg-[var(--data-7)]",
  "bg-[var(--data-8)]",
  "bg-[var(--data-2)]",
  "bg-[var(--data-3)]",
] as const;
const color = (i: number) => COLOR[i % COLOR.length];

export default function BloqueMadera({
  guia,
  trozasPorFila,
  indice,
}: {
  guia: GuiaIngreso<WoodEntry>;
  /** Trozas que cuelgan de cada asiento; `null` mientras cargan. */
  trozasPorFila: Map<string, number> | null;
  indice: number;
}) {
  const filas = repartoDeEspecies(
    guia.lineas.map((l) => ({ ...l, comun: l.speciesCommonName, volumenM3: Number(l.volumeM3) || 0 })),
  );

  return (
    <BloqueFicha
      titulo="Madera"
      icono={Trees}
      indice={indice}
      info={
        <InfoTip
          title="Madera de la guía"
          what="Una fila por especie, como el casillero (37) de la GTF. La barra dice cuánto pesa cada especie en el volumen."
          affects="«Trozas» cuenta las piezas que cuelgan de ESA fila. Si no coincide con las piezas declaradas, se marca en aviso."
          example="Copaiba 9,065 m³ · 2 piezas declaradas y 2 trozas: cuadra."
        />
      }
      extra={
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {fmtM3(guia.volumenM3)} m³
        </span>
      }
    >
      {filas.length > 1 && (
        <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
          {filas.map((f, i) => (
            <span key={f.id} className={`${color(i)} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${f.pct}%` }} />
          ))}
        </div>
      )}
      <ul className="divide-y divide-[var(--rule-soft)]">
        {filas.map((l, i) => {
          const trozas = trozasPorFila?.get(l.id) ?? 0;
          const descuadra = trozasPorFila != null && trozas !== (l.pieces ?? 0);
          return (
            <li key={l.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-start gap-2">
                <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color(i)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold text-[var(--text-primary)]">{l.speciesCommonName}</span>
                    {l.speciesCites && (
                      <span className="rounded-full bg-[var(--data-error-500)]/12 px-1.5 text-xs font-bold text-[var(--data-error-ink)]">
                        CITES
                      </span>
                    )}
                    <span className="ml-auto font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtM3(Number(l.volumeM3) || 0)}
                      {filas.length > 1 && <span className="ml-1.5 text-xs font-semibold text-[var(--text-tertiary)]">{l.pct} %</span>}
                    </span>
                  </div>
                  {l.speciesScientificName && (
                    <p className="truncate text-xs italic text-[var(--text-tertiary)]">{l.speciesScientificName}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
                    {l.libroNro != null && (
                      <span className="font-mono tabular-nums text-[var(--text-tertiary)]" title="N° de registro del libro">
                        N° {l.libroNro}
                      </span>
                    )}
                    <span>{productLabel(l.productType)}</span>
                    <span className="font-mono tabular-nums">
                      {l.pieces ?? 0} pza ·{" "}
                      <span
                        className={descuadra ? "font-bold text-[var(--data-warning-ink)]" : undefined}
                        title="Trozas que cuelgan de esta fila, contra las piezas que declara"
                      >
                        {trozasPorFila == null ? "…" : trozas} trozas
                      </span>
                    </span>
                    <span className="font-mono tabular-nums">≈{formatNumber(ptDeLinea({ volumeM3: Number(l.volumeM3) || 0, productType: l.productType }))} pt</span>
                    <span className="ml-auto">
                      <StatusBadge status={l.status} />
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </BloqueFicha>
  );
}
