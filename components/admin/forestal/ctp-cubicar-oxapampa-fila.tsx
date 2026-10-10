"use client";

/**
 * Una fila de la planilla «Cubicar Oxapampa» y su cabecera (2026-09-26).
 *
 * Una sola fila en el DOM para los dos anchos: a ≥40rem de planilla va en
 * columnas como Excel (cabecera arriba); más angosta, la troza y su pt van
 * arriba y las celdas debajo, cada una con su rótulo adentro. Con una sola
 * fila, Enter/Tab recorren las MISMAS celdas en el teléfono y en la PC.
 */

import { memo } from "react";
import { AlertTriangle, Info } from "@buleje/design-system/icons";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { medidasDeFicha } from "@/lib/forestal/ficha-texto-troza";
import {
  CAMPOS_OXAPAMPA,
  faltaDeFila,
  ptVisibleDeFila,
  textoDeMedida,
  type BaseTrozaPlanilla,
  type CampoPlanilla,
  type FilaPlanilla,
} from "@/lib/forestal/planilla-oxapampa";
import type { TrozaDeFicha } from "./CtpGuiaFichaModal";

/**
 * Las columnas: iguales en la cabecera y en cada fila (clases literales para
 * Tailwind). Sin `display`: la fila es `grid` siempre; la cabecera, sólo ancha.
 */
const COLUMNAS = {
  sinCm:
    "grid-cols-3 gap-2 @min-[40rem]/planilla:items-center @min-[40rem]/planilla:grid-cols-[minmax(10rem,1fr)_5.5rem_5.5rem_5.5rem_6rem]",
  conCm:
    "grid-cols-3 gap-2 @min-[40rem]/planilla:items-center @min-[40rem]/planilla:grid-cols-[minmax(10rem,1fr)_5.5rem_5.5rem_5.5rem_6rem_5.5rem_5.5rem]",
} as const;

const ROTULO: Record<CampoPlanilla, { corto: string; largo: string }> = {
  d1: { corto: "D1″", largo: "D1 en pulgadas" },
  d2: { corto: "D2″", largo: "D2 en pulgadas" },
  largo: { corto: "L′", largo: "Largo en pies" },
  d1Cm: { corto: "D1 cm", largo: "D1 en centímetros" },
  d2Cm: { corto: "D2 cm", largo: "D2 en centímetros" },
};

const CLAVE_BASE = { d1: "oxD1Pulg", d2: "oxD2Pulg", largo: "oxLargoPies" } as const;

/** La cabecera de columnas (sólo ancha: angosta, cada celda lleva su rótulo). */
export function CabeceraPlanilla({ conCm }: { conCm: boolean }) {
  const th =
    "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
  return (
    <div
      role="row"
      className={`hidden px-3 py-2 @min-[40rem]/planilla:grid ${conCm ? COLUMNAS.conCm : COLUMNAS.sinCm}`}
    >
      <span role="columnheader" className={th}>
        Troza · la guía dice
      </span>
      {CAMPOS_OXAPAMPA.map((c) => (
        <span key={c} role="columnheader" className={`${th} text-right`}>
          {ROTULO[c].corto}
        </span>
      ))}
      <span role="columnheader" className={`${th} text-right`}>
        PT
      </span>
      {conCm && (
        <>
          <span role="columnheader" className={`${th} text-right`}>
            D1 cm
          </span>
          <span role="columnheader" className={`${th} text-right`}>
            D2 cm
          </span>
        </>
      )}
    </div>
  );
}

function Celda({
  troza,
  codigo,
  campo,
  valor,
  error,
  disabled,
  onSet,
  onTecla,
}: {
  troza: string;
  codigo: string;
  campo: CampoPlanilla;
  valor: string;
  error?: string;
  disabled: boolean;
  onSet: (id: string, campo: CampoPlanilla, texto: string) => void;
  onTecla: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div role="cell" className="order-3 min-w-0 @min-[40rem]/planilla:order-none">
      <label
        title={error}
        className={`flex h-11 min-w-0 items-center rounded-lg border bg-[var(--surface-raised)] transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)] ${
          error ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <span
          aria-hidden
          className="shrink-0 pl-2 text-xs font-bold text-[var(--text-tertiary)] @min-[40rem]/planilla:hidden"
        >
          {ROTULO[campo].corto}
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          data-celda={campo}
          value={valor}
          disabled={disabled}
          aria-label={`${ROTULO[campo].largo}, troza ${codigo}`}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onSet(troza, campo, e.target.value)}
          onKeyDown={onTecla}
          onFocus={(e) => e.currentTarget.select()}
          className="h-full w-full min-w-0 bg-transparent px-2 text-right font-mono text-base tabular-nums text-[var(--text-primary)] outline-none dark:bg-transparent disabled:cursor-not-allowed focus-visible:[box-shadow:none]! focus-visible:outline-none!"
        />
      </label>
    </div>
  );
}

/** El código con que se reconoce la troza en el patio: planta, si no el del bosque. */
export const codigoDeFila = (t: TrozaDeFicha) =>
  t.codigoPlanta?.trim() || t.codificacion?.trim() || "sin código";

export const FilaOxapampa = memo(function FilaOxapampa({
  n,
  troza,
  base,
  fila,
  errores,
  rechazos,
  conCm,
  onSet,
  onTecla,
}: {
  n: number;
  troza: TrozaDeFicha;
  base: BaseTrozaPlanilla;
  fila: FilaPlanilla;
  errores?: Partial<Record<CampoPlanilla, string>>;
  rechazos?: string[];
  conCm: boolean;
  onSet: (id: string, campo: CampoPlanilla, texto: string) => void;
  onTecla: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const codigo = codigoDeFila(troza);
  const noLlego = troza.noRecepcionada === true;
  const pt = ptVisibleDeFila(base, fila);
  const falta = pt == null ? faltaDeFila(fila) : null;
  const tocada = CAMPOS_OXAPAMPA.some((c) => fila[c] !== textoDeMedida(base[CLAVE_BASE[c]]));
  const faltaCm = { d1Cm: base.d1Cm == null, d2Cm: base.d2Cm == null };
  const celda = (campo: CampoPlanilla) => (
    <Celda
      key={campo}
      troza={troza.id}
      codigo={codigo}
      campo={campo}
      valor={fila[campo]}
      error={errores?.[campo]}
      disabled={noLlego}
      onSet={onSet}
      onTecla={onTecla}
    />
  );
  const cmFijo = (v: number | null | undefined, rotulo: string) => (
    <span
      role="cell"
      className="order-4 flex h-11 items-center justify-end gap-1 px-2 font-mono text-sm tabular-nums text-[var(--text-tertiary)] @min-[40rem]/planilla:order-none"
    >
      <span className="text-xs font-bold @min-[40rem]/planilla:hidden">{rotulo}</span>
      {v ?? "—"}
    </span>
  );

  return (
    <div
      role="row"
      className={`grid ${conCm ? COLUMNAS.conCm : COLUMNAS.sinCm} border-l-2 px-3 py-2.5 ${
        tocada ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-transparent"
      }`}
    >
      <div
        role="rowheader"
        className="order-1 col-span-2 flex min-w-0 items-start gap-2 @min-[40rem]/planilla:order-none @min-[40rem]/planilla:col-span-1"
      >
        <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          {n}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-mono text-sm font-bold text-[var(--text-primary)]">
            {codigo}
            {troza.especieComun && (
              <span className="ml-1.5 font-sans font-semibold text-[var(--text-secondary)]">
                {troza.especieComun}
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-1 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
            {medidasDeFicha(troza)}
            {troza.d1d2MedidoEnPlanta && (
              <span title="D1/D2 medidos en planta: la guía no los traía">
                <Info className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">D1 y D2 medidos en planta</span>
              </span>
            )}
          </span>
          {noLlego && (
            <span className="text-xs font-bold text-[var(--data-warning-ink)]">
              No llegó al patio: no se mide
            </span>
          )}
        </span>
      </div>
      {CAMPOS_OXAPAMPA.map(celda)}
      <span
        role="cell"
        title={pt != null ? `${formatNumber(pt, { max: 2 })} pt` : undefined}
        className={`order-2 flex h-11 items-center justify-end gap-1 font-mono text-lg font-bold tabular-nums @min-[40rem]/planilla:order-none ${
          pt == null
            ? "text-[var(--text-tertiary)]"
            : tocada
              ? "text-[var(--accent-ink)]"
              : "text-[var(--text-primary)]"
        }`}
      >
        {pt != null ? (
          <>
            {fmtPt(pt)}
            <span className="text-xs font-semibold text-[var(--text-tertiary)] @min-[40rem]/planilla:hidden">
              PT
            </span>
          </>
        ) : falta ? (
          /* Media medida = sin cubicar: con una sola punta no hay fórmula. */
          <span className="whitespace-nowrap font-sans text-sm font-bold text-[var(--data-warning-ink)]">
            {falta}
          </span>
        ) : (
          "—"
        )}
      </span>
      {conCm && (
        <>
          {faltaCm.d1Cm && !noLlego ? celda("d1Cm") : cmFijo(base.d1Cm, "D1 cm")}
          {faltaCm.d2Cm && !noLlego ? celda("d2Cm") : cmFijo(base.d2Cm, "D2 cm")}
        </>
      )}
      {rechazos && rechazos.length > 0 && (
        <div
          role="cell"
          className="order-5 col-span-full flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-ink)]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          No se guardó: {rechazos.join(" · ")}
        </div>
      )}
    </div>
  );
});
