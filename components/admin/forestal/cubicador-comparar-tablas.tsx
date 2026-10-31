"use client";

/**
 * Las tres tablas del comparador de guardadas: el cuadro de totales (A | B |
 * diferencia), las diferencias por grupo (piezas, PT, m³ y soles) y el pieza
 * por pieza cuando una salió de la otra. Todo viene hecho de
 * `cubicacion-diferencias`: acá sólo se pinta. Las diferencias se leen B − A.
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import type { CambiosPorPieza, FilaDiferencia, TotalesComparados } from "@/lib/forestal/cubicacion-diferencias";
import { fmtM3, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { button } from "@/components/ui-system/button-variants";
import { conSigno, tonoDelta } from "./cubicador-detalle-ficha";

const NUM = "text-right font-mono tabular-nums whitespace-nowrap";
const piezas = (v: number) => formatNumber(v);

/** Cómo se escribe cada unidad y desde cuánto una diferencia deja de ser «0» (lo que la tabla no muestra no pinta color). */
interface Unidad { fmt: (n: number) => string; epsilon: number }
const U = {
  piezas: { fmt: piezas, epsilon: 0 },
  pt: { fmt: fmtPt, epsilon: 0.5 },
  m3: { fmt: fmtM3, epsilon: 0.0005 },
  soles: { fmt: fmtSoles, epsilon: 0.005 },
  ptPieza: { fmt: (n: number) => formatNumber(n, 2), epsilon: 0.005 },
} satisfies Record<string, Unidad>;

function Delta({ v, u, conFlecha }: { v: number; u: Unidad; conFlecha?: boolean }) {
  const efectivo = Math.abs(v) <= u.epsilon ? 0 : v;
  const Flecha = efectivo > 0 ? TrendingUp : TrendingDown;
  return (
    <td className={`${NUM} font-bold ${tonoDelta(efectivo)}`}>
      <span className="inline-flex items-center justify-end gap-1">
        {conFlecha && efectivo !== 0 && <Flecha className="h-4 w-4" aria-hidden />}
        {conSigno(v, u.fmt, u.epsilon)}
      </span>
    </td>
  );
}

/** El cuadro de arriba: cuatro renglones, uno por unidad del negocio, con los totales GUARDADOS de cada una. */
export function CuadroTotales({ total }: { total: TotalesComparados }) {
  const soles = (v: number | null) => (v === null ? "—" : fmtSoles(v));
  const filas = [
    { id: "pt", label: "Pie tablar", a: fmtPt(total.ptA), b: fmtPt(total.ptB), d: total.deltaPt, u: U.pt },
    { id: "m3", label: "m³", a: fmtM3(total.m3A), b: fmtM3(total.m3B), d: total.deltaM3, u: U.m3 },
    { id: "piezas", label: "Piezas", a: piezas(total.piezasA), b: piezas(total.piezasB), d: total.deltaPiezas, u: U.piezas },
    ...(total.valorA !== null || total.valorB !== null
      ? [{ id: "soles", label: "Valor S/", a: soles(total.valorA), b: soles(total.valorB), d: total.deltaValor, u: U.soles }]
      : []),
  ];
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
        {filas.map((f) => (
          <tr key={f.id}>
            <th scope="row" className="text-left font-bold">{f.label}</th>
            <td className={NUM}>{f.a}</td>
            <td className={NUM}>{f.b}</td>
            {f.d === null
              ? <td className={`${NUM} text-[var(--text-tertiary)]`} title="Una de las dos se guardó sin precio">—</td>
              : <Delta v={f.d} u={f.u} conFlecha />}
          </tr>
        ))}
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

/** Diferencias por grupo: tres columnas por unidad (A, B, dif.) y la diferencia en soles. */
export function TablaDiferencias({ filas, total, primeraCol, conValor, caption, vacio }: {
  filas: FilaDiferencia[];
  total: FilaDiferencia;
  primeraCol: string;
  conValor: boolean;
  caption: string;
  vacio: string;
}) {
  const grupo = (label: string) => <th scope="colgroup" colSpan={3} className="text-center">{label}</th>;
  return (
    <DataTable className="w-full min-w-[760px]" wrapperClassName="max-h-[60vh] overflow-y-auto" stickyHeader>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" rowSpan={2} className="align-bottom">{primeraCol}</th>
          {grupo("Piezas")}
          {grupo("Pie tablar")}
          {grupo("m³")}
          {conValor && <th scope="col" rowSpan={2} className="text-right align-bottom">Dif. S/</th>}
        </tr>
        <tr>
          {["piezas", "pt", "m3"].flatMap((u) => [
            <th key={`${u}-a`} scope="col" className="text-right">A</th>,
            <th key={`${u}-b`} scope="col" className="text-right">B</th>,
            <th key={`${u}-d`} scope="col" className="text-right">Dif.</th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 ? (
          <tr>
            <td colSpan={conValor ? 11 : 10} className="py-6 text-center text-[var(--text-secondary)]">{vacio}</td>
          </tr>
        ) : filas.map((f) => (
          <tr key={f.clave}>
            <th scope="row" className="text-left font-bold">
              {f.label}
              {f.soloEn && <SoloEn lado={f.soloEn} />}
            </th>
            <td className={NUM}>{piezas(f.piezasA)}</td>
            <td className={NUM}>{piezas(f.piezasB)}</td>
            <Delta v={f.deltaPiezas} u={U.piezas} />
            <td className={NUM}>{fmtPt(f.ptA)}</td>
            <td className={NUM}>{fmtPt(f.ptB)}</td>
            <Delta v={f.deltaPt} u={U.pt} />
            <td className={NUM}>{fmtM3(f.m3A)}</td>
            <td className={NUM}>{fmtM3(f.m3B)}</td>
            <Delta v={f.deltaM3} u={U.m3} />
            {conValor && <Delta v={f.deltaValor} u={U.soles} />}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold">
          <th scope="row" className="text-left text-[var(--accent-ink)] dark:text-[var(--accent)]">Total</th>
          <td className={NUM}>{piezas(total.piezasA)}</td>
          <td className={NUM}>{piezas(total.piezasB)}</td>
          <Delta v={total.deltaPiezas} u={U.piezas} />
          <td className={NUM}>{fmtPt(total.ptA)}</td>
          <td className={NUM}>{fmtPt(total.ptB)}</td>
          <Delta v={total.deltaPt} u={U.pt} />
          <td className={NUM}>{fmtM3(total.m3A)}</td>
          <td className={NUM}>{fmtM3(total.m3B)}</td>
          <Delta v={total.deltaM3} u={U.m3} />
          {conValor && <Delta v={total.deltaValor} u={U.soles} />}
        </tr>
      </tfoot>
    </DataTable>
  );
}

const TIPO_CAMBIO = {
  cambiada: { label: "Cambió", clase: "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]" },
  agregada: { label: "Nueva en B", clase: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  quitada: { label: "Ya no está en B", clase: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
} as const;

/** Con cientos de piezas, la lista entera empuja todo: las primeras y «Ver todas». */
const PRIMERAS = 40;

/** Pieza por pieza: sólo cuando B salió de A (o al revés) y conservan sus piezas. */
export function TablaPiezaPorPieza({ datos }: { datos: CambiosPorPieza }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? datos.cambios : datos.cambios.slice(0, PRIMERAS);
  if (datos.cambios.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-4 text-center text-sm text-[var(--text-secondary)]">
        Las {formatNumber(datos.enComun)} filas que comparten tienen las mismas medidas.
      </p>
    );
  }
  return (
    <>
      <DataTable className="w-full min-w-[640px]" wrapperClassName="max-h-[60vh] overflow-y-auto" stickyHeader>
        <caption className="sr-only">Qué fila cambió de A a B</caption>
        <thead>
          <tr>
            <th scope="col" className="text-right">N° en A</th>
            <th scope="col" className="text-right">N° en B</th>
            <th scope="col">Qué pasó</th>
            <th scope="col">Antes</th>
            <th scope="col">Después</th>
            <th scope="col">Qué cambió</th>
            <th scope="col" className="text-right">Dif. PT</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((p) => (
            <tr key={`${p.tipo}-${p.id}`}>
              <td className={NUM}>{p.nA ?? "—"}</td>
              <td className={NUM}>{p.nB ?? "—"}</td>
              <td>
                <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 text-xs font-bold ${TIPO_CAMBIO[p.tipo].clase}`}>{TIPO_CAMBIO[p.tipo].label}</span>
              </td>
              <td className="whitespace-nowrap font-mono tabular-nums">{p.antes ?? "—"}</td>
              <td className="whitespace-nowrap font-mono tabular-nums">{p.despues ?? "—"}</td>
              <td className="text-[var(--text-secondary)]">{p.detalle.join(" · ")}</td>
              <Delta v={p.deltaPt} u={U.ptPieza} />
            </tr>
          ))}
        </tbody>
      </DataTable>
      {datos.cambios.length > PRIMERAS && (
        <button type="button" onClick={() => setTodas((v) => !v)} className={button({ variant: "link", className: "mt-2 text-[var(--accent-ink)] underline dark:text-[var(--accent)]" })}>
          {todas ? "Ver sólo las primeras" : `Ver las ${formatNumber(datos.cambios.length)} filas con cambios`}
        </button>
      )}
    </>
  );
}
