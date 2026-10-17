"use client";

/**
 * Una fila de «Cubicar en Oxapampina» (GTF del Libro TH, K7), su cabecera y el
 * pie con los descuentos del lote.
 *
 * Como la planilla Oxapampa del CTP (`ctp-cubicar-oxapampa-fila`): una sola
 * fila en el DOM para los dos anchos. Ancha va en columnas como Excel; angosta,
 * la troza y su neto arriba y las seis celdas debajo, cada una con su rótulo.
 * Lo que vino de la guía se ve gris hasta que tipeas la cinta.
 */
import { memo } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import type { LineaEspecie } from "@/lib/forestal/cubicacion-cuenta";
import { UNIDADES_FORMULA, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { CAMPOS_DESCUENTO, CAMPOS_MEDIDA, fmtNum, type CalculoFila, type CampoCubicar, type FilaCubicar, type LoteTexto } from "./hooks/use-cubicar-guia-loth";

const COLUMNAS =
  "grid-cols-3 gap-1.5 @min-[46rem]/cubicar:items-center @min-[46rem]/cubicar:grid-cols-[minmax(9rem,1fr)_repeat(6,4.25rem)_5rem_5.5rem]";

function rotulos(formula: FormulaTrozas): Record<CampoCubicar, { corto: string; largo: string }> {
  const u = UNIDADES_FORMULA[formula];
  const d = u.diametro === "pulg" ? "″" : " cm";
  const l = u.largo === "pies" ? "′" : " m";
  return {
    d1: { corto: `D1${d}`, largo: `Diámetro mayor en ${u.diametro === "pulg" ? "pulgadas" : "centímetros"}` },
    d2: { corto: `D2${d}`, largo: `Diámetro menor en ${u.diametro === "pulg" ? "pulgadas" : "centímetros"}` },
    largo: { corto: `L${l}`, largo: `Largo en ${u.largo}` },
    hueco: { corto: `Hueco${d}`, largo: `Diámetro del hueco en ${u.diametro === "pulg" ? "pulgadas" : "centímetros"}` },
    menosLargo: { corto: `−L${l}`, largo: `Largo que no sirve, en ${u.largo}` },
    pct: { corto: "−%", largo: "Castigo en porcentaje" },
  };
}

const TH = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";

export function CabeceraCubicar({ formula }: { formula: FormulaTrozas }) {
  const r = rotulos(formula);
  const u = UNIDADES_FORMULA[formula].volumen;
  return (
    <div role="row" className={`hidden px-3 py-2 @min-[46rem]/cubicar:grid ${COLUMNAS}`}>
      <span role="columnheader" className={TH}>Troza · m³ de la guía</span>
      {[...CAMPOS_MEDIDA, ...CAMPOS_DESCUENTO].map((c) => (
        <span key={c} role="columnheader" className={`${TH} text-right`}>{r[c].corto}</span>
      ))}
      <span role="columnheader" className={`${TH} text-right`}>{u} bruto</span>
      <span role="columnheader" className={`${TH} text-right`}>{u} neto</span>
    </div>
  );
}

function Celda({
  i, campo, rotulo, valor, deLaGuia, error, codigo, onSet, onTecla,
}: {
  i: number;
  campo: CampoCubicar;
  rotulo: { corto: string; largo: string };
  valor: string;
  deLaGuia: boolean;
  error: boolean;
  codigo: string;
  onSet: (i: number, campo: CampoCubicar, texto: string) => void;
  onTecla: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const descuento = (CAMPOS_DESCUENTO as readonly string[]).includes(campo);
  return (
    <div role="cell" className={`${descuento ? "order-4" : "order-3"} min-w-0 @min-[46rem]/cubicar:order-none`}>
      <label
        title={deLaGuia ? "De la guía: tipea la cinta para cambiarla" : undefined}
        className={`flex h-11 min-w-0 items-center rounded-lg border bg-[var(--surface-raised)] transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)] ${
          error ? "border-[var(--data-error-500)]" : descuento ? "border-dashed border-[var(--rule-base)]" : "border-[var(--rule-base)]"
        }`}
      >
        <span aria-hidden className="shrink-0 pl-2 text-xs font-bold text-[var(--text-tertiary)] @min-[46rem]/cubicar:hidden">
          {rotulo.corto}
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          data-celda={campo}
          value={valor}
          placeholder={descuento ? "—" : undefined}
          aria-label={`${rotulo.largo}, troza ${codigo}${deLaGuia ? " (de la guía)" : ""}`}
          onChange={(e) => onSet(i, campo, e.target.value)}
          onKeyDown={onTecla}
          onFocus={(e) => e.currentTarget.select()}
          className={`h-full w-full min-w-0 bg-transparent px-2 text-right font-mono text-base tabular-nums outline-none placeholder:text-[var(--text-tertiary)] dark:bg-transparent focus-visible:[box-shadow:none]! focus-visible:outline-none! ${
            deLaGuia ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"
          }`}
        />
      </label>
    </div>
  );
}

export const FilaCubicarGuia = memo(function FilaCubicarGuia({
  i, fila, calculo, formula, onSet, onTecla,
}: {
  i: number;
  fila: FilaCubicar;
  calculo: CalculoFila;
  formula: FormulaTrozas;
  onSet: (i: number, campo: CampoCubicar, texto: string) => void;
  onTecla: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const r = rotulos(formula);
  const u = UNIDADES_FORMULA[formula];
  const codigo = fila.codigo ?? `#${i + 1}`;
  const tocada = CAMPOS_MEDIDA.some((c) => fila[c] !== fila.guia[c]) || CAMPOS_DESCUENTO.some((c) => fila[c].trim());
  const descontada = calculo.bruto != null && calculo.neto != null && calculo.neto < calculo.bruto;
  const vol = (v: number | null) => (v == null ? "—" : fmtNum(v, u.decimales));
  return (
    <div
      role="row"
      data-troza={codigo}
      className={`grid ${COLUMNAS} border-l-2 px-3 py-2 ${tocada ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-transparent"}`}
    >
      <div role="rowheader" className="order-1 col-span-2 flex min-w-0 items-start gap-2 @min-[46rem]/cubicar:order-none @min-[46rem]/cubicar:col-span-1">
        <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
        <span className="min-w-0">
          <span className="block truncate font-mono text-sm font-bold text-[var(--text-primary)]">{codigo}</span>
          <span className="block truncate text-xs text-[var(--text-secondary)]">
            {fila.especie}
            {fila.m3Guia != null && <span className="font-mono tabular-nums text-[var(--text-tertiary)]"> · {fmtNum(fila.m3Guia, 3)} m³</span>}
          </span>
        </span>
      </div>
      {[...CAMPOS_MEDIDA, ...CAMPOS_DESCUENTO].map((c) => (
        <Celda
          key={c}
          i={i}
          campo={c}
          rotulo={r[c]}
          valor={fila[c]}
          deLaGuia={(CAMPOS_MEDIDA as readonly string[]).includes(c) && fila[c] === fila.guia[c as (typeof CAMPOS_MEDIDA)[number]]}
          error={!!calculo.error}
          codigo={codigo}
          onSet={onSet}
          onTecla={onTecla}
        />
      ))}
      <span role="cell" className="hidden h-11 items-center justify-end font-mono text-sm tabular-nums text-[var(--text-tertiary)] @min-[46rem]/cubicar:flex">
        {descontada ? vol(calculo.bruto) : ""}
      </span>
      <span
        role="cell"
        className={`order-2 flex h-11 flex-col items-end justify-center font-mono text-base font-bold tabular-nums @min-[46rem]/cubicar:order-none ${
          calculo.neto == null ? "text-[var(--text-tertiary)]" : descontada ? "text-[var(--accent-ink)]" : "text-[var(--text-primary)]"
        }`}
      >
        <span>
          {calculo.falta ? <span className="font-sans text-sm text-[var(--data-warning-ink)]">Falta medida</span> : vol(calculo.neto)}
          <span className="ml-1 font-sans text-xs font-semibold text-[var(--text-tertiary)] @min-[46rem]/cubicar:hidden">{u.volumen}</span>
        </span>
        {descontada && (
          <span className="font-sans text-xs font-normal text-[var(--text-tertiary)] @min-[46rem]/cubicar:hidden">de {vol(calculo.bruto)}</span>
        )}
      </span>
      {calculo.error && (
        <div role="cell" className="order-5 col-span-full flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-ink)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {calculo.error}
        </div>
      )}
    </div>
  );
});

const CAMPO_PIE =
  "h-11 w-full min-w-0 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-base tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Descuentos del lote: por especie (−volumen y %) y al final el % general. Clave = la de `agruparPorEspecie`. */
export function PieDescuentos({
  formula, especies, lineas, lote, onLote,
}: {
  formula: FormulaTrozas;
  /** Por especie con el descuento de cada troza (antes del lote). */
  especies: readonly LineaEspecie[];
  /** Las mismas, con el descuento del lote. */
  lineas: readonly LineaEspecie[];
  lote: LoteTexto;
  onLote: (clave: string | null, campo: "pct" | "menos", texto: string) => void;
}) {
  const u = UNIDADES_FORMULA[formula];
  const neto = new Map(lineas.map((l) => [l.clave, l.volumen]));
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3" data-vista="descuentos-lote">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6rem] items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <span>Descuento del lote</span>
        <span className="text-right">− {u.volumen}</span>
        <span className="text-right">%</span>
        <span className="text-right">Neto</span>
      </div>
      <div className="space-y-1.5">
        {especies.map((l) => (
          <div key={l.clave} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6rem] items-center gap-2">
            <span className="min-w-0 truncate text-sm text-[var(--text-primary)]">
              {l.nombre} <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">· {l.n} · {fmtNum(l.volumen, u.decimales)}</span>
            </span>
            <input inputMode="decimal" aria-label={`${l.nombre}: ${u.volumen} que se descuentan`} placeholder="—" className={CAMPO_PIE}
              value={lote.porEspecie[l.clave]?.menos ?? ""} onChange={(e) => onLote(l.clave, "menos", e.target.value)} />
            <input inputMode="decimal" aria-label={`${l.nombre}: castigo en %`} placeholder="—" className={CAMPO_PIE}
              value={lote.porEspecie[l.clave]?.pct ?? ""} onChange={(e) => onLote(l.clave, "pct", e.target.value)} />
            <span className="text-right font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{fmtNum(neto.get(l.clave) ?? l.volumen, u.decimales)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_6rem] items-center gap-2 border-t border-[var(--rule-soft)] pt-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">General (a todo el lote)</span>
          <span aria-hidden />
          <input inputMode="decimal" aria-label="Castigo general en %" placeholder="—" className={CAMPO_PIE}
            value={lote.pct} onChange={(e) => onLote(null, "pct", e.target.value)} />
          <span aria-hidden />
        </div>
      </div>
    </div>
  );
}
