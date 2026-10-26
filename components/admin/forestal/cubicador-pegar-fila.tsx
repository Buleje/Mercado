"use client";

/**
 * Una fila de la «tabla para pegar» del cubicador: siete celdas editables y, a
 * la derecha, lo que da la fila (PT y m³) o, si no se puede calcular, POR QUÉ.
 * Memo con props primitivas: tipear en una celda repinta sólo su fila, no las
 * 300 que se pegaron.
 */
import { memo } from "react";
import { AlertCircle, AlertTriangle } from "@buleje/design-system/icons";
import { clasificarCelda, COLUMNAS_NUMERICAS } from "./cubicador-pegar-tipo-dato";
import { COLUMNAS_PEGAR, type ColumnaPegar, type FilaLeida, type FilaPegar } from "@/lib/forestal/cubicacion-pegar";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";

export const GRILLA_PEGAR = "pegar-cubicador";
export const LISTA_ESPECIES_PEGAR = "pegar-cubicador-especies";

const NUMERICAS = COLUMNAS_NUMERICAS;
const NOMBRE_CORTO: Record<ColumnaPegar, string> = {
  cantidad: "Cant.", espesor: "Espesor", ancho: "Ancho", largo: "Largo", especie: "Especie", dueno: "Dueño", observacion: "Observación",
};

const CELDA =
  "h-10 w-full min-w-0 rounded-md border bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";
/** Error = borde lleno y fondo rojo; aviso = borde punteado (en oscuro el coral y el rojo se parecen: la forma los separa). */
const CON_ERROR = "border-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/15";
const CON_AVISO = "border-dashed border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15";
const NORMAL = "border-[var(--rule-soft)]";
const MARCADA = "bg-[var(--accent-muted)]";

export interface ManejoCeldas {
  onEscribir: (fila: number, col: number, valor: string) => void;
  onFoco: (fila: number, col: number) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLInputElement>) => void;
  onMouseEnter: (e: React.MouseEvent<HTMLInputElement>) => void;
}

function motivoDeLaFila(leida: FilaLeida): string | null {
  const errores = COLUMNAS_PEGAR.flatMap((c) => (leida.errores[c] ? [`${NOMBRE_CORTO[c]}: ${leida.errores[c]}`] : []));
  if (errores.length === 0) return null;
  return errores.length === 1 ? errores[0] : `${errores[0]} · +${errores.length - 1}`;
}

export const FilaParaPegar = memo(function FilaParaPegar({
  i, fila, leida, selC0, selC1, titulos, manejo,
}: {
  i: number;
  fila: FilaPegar;
  leida: FilaLeida;
  /** Columnas marcadas en esta fila (`-1` = ninguna). Sólo se pintan con 2+ celdas marcadas. */
  selC0: number;
  selC1: number;
  /** El nombre de cada columna con su unidad, para el lector de pantalla. */
  titulos: readonly string[];
  manejo: ManejoCeldas;
}) {
  const motivo = motivoDeLaFila(leida);
  return (
    <tr>
      <td className="text-center text-xs tabular-nums text-[var(--text-tertiary)]">{i + 1}</td>
      {COLUMNAS_PEGAR.map((c, k) => {
        /* Lo que dice el tipo de dato (letra en una medida, número en la especie) manda sobre el motivo de la fila. */
        const tipo = clasificarCelda(c, fila[c]);
        const error = tipo.tipo === "error" ? tipo.motivo : leida.errores[c];
        const aviso = tipo.tipo === "aviso" ? tipo.motivo : leida.avisos[c];
        const numerica = NUMERICAS.has(c);
        const tono = error ? CON_ERROR : aviso ? CON_AVISO : NORMAL;
        return (
          <td key={c} className="relative">
            <input
              type="text"
              inputMode={numerica ? "decimal" : "text"}
              autoComplete="off"
              spellCheck={false}
              value={fila[c]}
              placeholder={c === "cantidad" && !leida.vacia ? "1" : undefined}
              list={c === "especie" ? LISTA_ESPECIES_PEGAR : undefined}
              aria-label={`${titulos[k]}, fila ${i + 1}${error ? `: ${error}` : aviso ? `: ${aviso}` : ""}`}
              aria-invalid={error ? true : undefined}
              title={error ?? aviso}
              data-fila={i}
              data-col={k}
              onChange={(e) => manejo.onEscribir(i, k, e.target.value)}
              onFocus={() => manejo.onFoco(i, k)}
              onKeyDown={manejo.onKeyDown}
              onMouseDown={manejo.onMouseDown}
              onMouseEnter={manejo.onMouseEnter}
              className={`${CELDA} ${tono} ${numerica ? "text-right font-mono tabular-nums" : ""} ${error || aviso ? "pr-7" : ""} ${k >= selC0 && k <= selC1 ? MARCADA : ""}`}
            />
            {(error || aviso) && (
              <span aria-hidden="true" title={error ?? aviso} className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${error ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]"}`}>
                {error ? <AlertCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
            )}
          </td>
        );
      })}
      {leida.pieza ? (
        <>
          <td className="text-right font-mono tabular-nums">{fmtPt(leida.pieza.pieTablar)}</td>
          <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(leida.pieza.m3)}</td>
        </>
      ) : motivo ? (
        <td colSpan={2} className="text-xs font-semibold text-[var(--data-error-ink)]">
          <span className="line-clamp-2" title={motivo}>{motivo}</span>
        </td>
      ) : (
        <td colSpan={2} />
      )}
    </tr>
  );
});
