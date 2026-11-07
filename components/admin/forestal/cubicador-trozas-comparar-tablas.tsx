"use client";

/**
 * Las tres tablas del comparador de trozas: el cuadro de totales (A | B |
 * diferencia), las diferencias por grupo (especie, diámetro, largo) y troza por
 * troza cuando comparten códigos. Todo viene hecho de
 * `cubicacion-trozas-diferencias`: acá sólo se pinta. Diferencias B − A, con
 * los mismos colores y chips que el comparador de la madera aserrada.
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { fmtSoles } from "@/lib/forestal/cubicacion-formato";
import type {
  CambiosPorTroza, FilaDiferenciaTrozas, TotalesTrozasComparados,
} from "@/lib/forestal/cubicacion-trozas-diferencias";
import { numeroVolumen } from "@/lib/forestal/cubicacion-trozas-diferencias";
import { UNIDADES_FORMULA, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { formatNumber } from "@/lib/format";
import { conSigno, tonoDelta } from "./cubicador-detalle-ficha";

const NUM = "text-right font-mono tabular-nums whitespace-nowrap";

/** Desde cuánto una diferencia deja de ser «0» (lo que la tabla no muestra no pinta color). */
const EPSILON = { trozas: 0, m3: 0.0005, pt: 0.005, soles: 0.005 } as const;
const epsilonDe = (f: FormulaTrozas) => (f === "oxapampina" ? EPSILON.pt : EPSILON.m3);

function Delta({ v, fmt, epsilon, conFlecha }: { v: number; fmt: (n: number) => string; epsilon: number; conFlecha?: boolean }) {
  const efectivo = Math.abs(v) <= epsilon ? 0 : v;
  const Flecha = efectivo > 0 ? TrendingUp : TrendingDown;
  return (
    <td className={`${NUM} font-bold ${tonoDelta(efectivo)}`}>
      <span className="inline-flex items-center justify-end gap-1">
        {conFlecha && efectivo !== 0 && <Flecha className="h-4 w-4" aria-hidden />}
        {conSigno(v, fmt, epsilon)}
      </span>
    </td>
  );
}

const enteros = (v: number) => formatNumber(v);

/** El cuadro de arriba: un renglón por unidad del negocio, con los totales GUARDADOS de cada una. */
export function CuadroTotalesTrozas({ total, formula }: { total: TotalesTrozasComparados; formula: FormulaTrozas }) {
  const unidad = UNIDADES_FORMULA[formula].volumen;
  const vol = (v: number) => numeroVolumen(v, formula);
  const soles = (v: number | null) => (v === null ? "—" : fmtSoles(v));
  return (
    <DataTable className="w-full">
      <caption className="sr-only">Totales de A y B y su diferencia</caption>
      <thead>
        <tr>
          <th scope="col">Total</th>
          <th scope="col" className="text-right">A</th>
          <th scope="col" className="text-right">B</th>
          <th scope="col" className="text-right">Diferencia</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="text-left font-bold">Trozas</th>
          <td className={NUM}>{enteros(total.trozasA)}</td>
          <td className={NUM}>{enteros(total.trozasB)}</td>
          <Delta v={total.deltaTrozas} fmt={enteros} epsilon={EPSILON.trozas} conFlecha />
        </tr>
        <tr>
          <th scope="row" className="text-left font-bold">{unidad}</th>
          <td className={NUM}>{vol(total.volA)}</td>
          <td className={NUM}>{vol(total.volB)}</td>
          <Delta v={total.deltaVol} fmt={vol} epsilon={epsilonDe(formula)} conFlecha />
        </tr>
        {(total.montoA !== null || total.montoB !== null) && (
          <tr>
            <th scope="row" className="text-left font-bold">Valor S/</th>
            <td className={NUM}>{soles(total.montoA)}</td>
            <td className={NUM}>{soles(total.montoB)}</td>
            {total.deltaMonto === null
              ? <td className={`${NUM} text-[var(--text-tertiary)]`} title="Una de las dos se guardó sin valorizar">—</td>
              : <Delta v={total.deltaMonto} fmt={fmtSoles} epsilon={EPSILON.soles} conFlecha />}
          </tr>
        )}
      </tbody>
    </DataTable>
  );
}

function SoloEn({ lado }: { lado: "A" | "B" }) {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-md bg-[var(--data-info-50)] px-1.5 text-xs font-bold text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]">
      sólo en {lado}
    </span>
  );
}

/** Diferencias por grupo: trozas y volumen (A, B, dif.). */
export function TablaDiferenciasTrozas({ filas, total, primeraCol, formula, caption, vacio }: {
  filas: FilaDiferenciaTrozas[];
  total: FilaDiferenciaTrozas;
  primeraCol: string;
  formula: FormulaTrozas;
  caption: string;
  vacio: string;
}) {
  const vol = (v: number) => numeroVolumen(v, formula);
  const eps = epsilonDe(formula);
  const grupo = (label: string) => <th scope="colgroup" colSpan={3} className="text-center">{label}</th>;
  const celdas = (f: FilaDiferenciaTrozas) => (
    <>
      <td className={NUM}>{enteros(f.trozasA)}</td>
      <td className={NUM}>{enteros(f.trozasB)}</td>
      <Delta v={f.deltaTrozas} fmt={enteros} epsilon={EPSILON.trozas} />
      <td className={NUM}>{vol(f.volA)}</td>
      <td className={NUM}>{vol(f.volB)}</td>
      <Delta v={f.deltaVol} fmt={vol} epsilon={eps} />
    </>
  );
  return (
    <DataTable className="w-full min-w-[560px]" wrapperClassName="max-h-[60vh] overflow-y-auto" stickyHeader>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" rowSpan={2} className="align-bottom">{primeraCol}</th>
          {grupo("Trozas")}
          {grupo(UNIDADES_FORMULA[formula].volumen)}
        </tr>
        <tr>
          {["trozas", "vol"].flatMap((u) => [
            <th key={`${u}-a`} scope="col" className="text-right">A</th>,
            <th key={`${u}-b`} scope="col" className="text-right">B</th>,
            <th key={`${u}-d`} scope="col" className="text-right">Dif.</th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 ? (
          <tr><td colSpan={7} className="py-6 text-center text-[var(--text-secondary)]">{vacio}</td></tr>
        ) : filas.map((f) => (
          <tr key={f.clave}>
            <th scope="row" className="text-left font-bold">{f.label}{f.soloEn && <SoloEn lado={f.soloEn} />}</th>
            {celdas(f)}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold">
          <th scope="row" className="text-left text-[var(--accent-ink)] dark:text-[var(--accent)]">Total</th>
          {celdas(total)}
        </tr>
      </tfoot>
    </DataTable>
  );
}

const TIPO_CAMBIO = {
  cambiada: { label: "Cambió", clase: "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]" },
  soloB: { label: "Nueva en B", clase: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  soloA: { label: "Ya no está en B", clase: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
} as const;

/** Con cientos de trozas, la lista entera empuja todo: las primeras y «Ver todas». */
const PRIMERAS = 40;

/** Troza por troza: la misma troza (por su código) medida en A y en B. */
export function TablaTrozaPorTroza({ datos, formula }: { datos: CambiosPorTroza; formula: FormulaTrozas }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? datos.cambios : datos.cambios.slice(0, PRIMERAS);
  const vol = (v: number) => numeroVolumen(v, formula);
  if (datos.cambios.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-4 text-center text-sm text-[var(--text-secondary)]">
        Las {enteros(datos.enComun)} trozas que comparten tienen las mismas medidas.
      </p>
    );
  }
  return (
    <>
      <DataTable className="w-full min-w-[720px]" wrapperClassName="max-h-[60vh] overflow-y-auto" stickyHeader>
        <caption className="sr-only">Qué troza cambió de A a B</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Especie</th>
            <th scope="col">Qué pasó</th>
            <th scope="col">En A</th>
            <th scope="col">En B</th>
            <th scope="col">Qué cambió</th>
            <th scope="col" className="text-right">Dif. {UNIDADES_FORMULA[formula].volumen}</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((p) => (
            <tr key={`${p.tipo}-${p.codigo}`}>
              <td className="font-mono font-bold">{p.codigo}</td>
              <td>{p.especie || "Sin especie"}</td>
              <td>
                <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 text-xs font-bold ${TIPO_CAMBIO[p.tipo].clase}`}>{TIPO_CAMBIO[p.tipo].label}</span>
              </td>
              <td className="whitespace-nowrap font-mono tabular-nums">{p.antes ?? "—"}</td>
              <td className="whitespace-nowrap font-mono tabular-nums">{p.despues ?? "—"}</td>
              <td className="text-[var(--text-secondary)]">{p.detalle.join(" · ")}</td>
              <Delta v={p.deltaVol} fmt={vol} epsilon={epsilonDe(formula)} />
            </tr>
          ))}
        </tbody>
      </DataTable>
      {datos.cambios.length > PRIMERAS && (
        <button type="button" onClick={() => setTodas((v) => !v)} className={button({ variant: "link", className: "mt-2 text-[var(--accent-ink)] underline dark:text-[var(--accent)]" })}>
          {todas ? "Ver sólo las primeras" : `Ver las ${enteros(datos.cambios.length)} trozas con cambios`}
        </button>
      )}
    </>
  );
}
