/**
 * Lo que comparten las fichas laterales de «Nueva línea» (Tala y Trozado): la
 * caja, los tonos de aviso y la cabecera del árbol con lo que dice el censo.
 * Sin estado ni efectos: se renderiza donde se use.
 */

import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import { CategoriaTag, CitesPill } from "./loth-plan-ui";

export const CAJA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3";
export const ROJO =
  "border-[var(--data-error-500)]/60 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]";
export const AMBAR =
  "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
/** El rótulo chico en mayúsculas de cada caja. */
export const KICKER = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

/** Número con decimales o «—». */
export const dec = (v: number | null, min: number, max: number) => (v == null ? "—" : formatNumber(v, { min, max }));

export function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--text-tertiary)]">{label}</dt>
      <dd className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

/** Código, especie, DAP/Hc/volumen estimado y condición: lo que el censo sabe del árbol. */
export function CabeceraArbol({ arbol }: { arbol: ArbolParaElegir }) {
  return (
    <div className={CAJA}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={KICKER}>Ficha del árbol</p>
          <p className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{arbol.treeCode}</p>
        </div>
        <CategoriaTag categoria={arbol.categoria ?? undefined} />
      </div>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
        {arbol.speciesCommon}
        {arbol.cites && <> <CitesPill /></>}
      </p>
      {(arbol.speciesScientific || arbol.speciesNative) && (
        <p className="text-xs text-[var(--text-secondary)]">
          {arbol.speciesScientific && <i>{arbol.speciesScientific}</i>}
          {arbol.speciesScientific && arbol.speciesNative && " · "}
          {arbol.speciesNative && <span title="Nombre en idioma nativo">{arbol.speciesNative}</span>}
        </p>
      )}
      <dl className="mt-2.5 grid grid-cols-3 gap-2">
        <Dato label="DAP">{dec(arbol.dapM, 2, 3)} m</Dato>
        <Dato label="Hc">{dec(arbol.hcM, 0, 2)} m</Dato>
        <Dato label="Vol. est.">{arbol.volM3 == null ? "—" : fmtM3(arbol.volM3)} m³</Dato>
      </dl>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        Condición del regente: <span className="font-semibold text-[var(--text-primary)]">{arbol.condicion || "—"}</span>
        {arbol.notes && <> · {arbol.notes}</>}
      </p>
    </div>
  );
}
