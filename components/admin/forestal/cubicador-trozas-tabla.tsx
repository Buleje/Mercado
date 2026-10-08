"use client";

/**
 * La tabla del patio del Cubicador de trozas: las medidas se corrigen en la
 * celda y la troza se recubica sola. Con un Ø hay una sola columna de
 * diámetro; con dos, menor y mayor. Las unidades salen de la fórmula del lote.
 *
 * Ventaneo (`use-tabla-ventaneada`): el patio de un camión grande son cientos
 * de trozas, y montarlas todas de una es el mismo cuelgue que sufrió el
 * cubicador de aserrada con 683 filas. Debajo del umbral no cambia nada.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Volume2 } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { empiezaBloque, numeroDeFila, type OrdenFilas } from "@/lib/forestal/cubicador-bloques-especie";
import {
  diametroUnico, UNIDADES_FORMULA, volumenDe, type DiametrosPorTroza, type FormulaTrozas,
} from "@/lib/forestal/cubicacion-trozas-formula";
import type { TrozaCubicada } from "@/lib/forestal/cubicacion-trozas";
import { useTablaVentaneada } from "@/hooks/use-tabla-ventaneada";
import { formatNumber } from "@/lib/format";

export interface FilaTroza extends TrozaCubicada {
  sospechosa?: boolean;
}
/** Qué medida se corrige: `d` = el Ø único (pone las dos puntas iguales). */
export type CampoTroza = "d" | "d1" | "d2" | "largo";

/** Alto del visor de la tabla del patio, en px. Constante mientras se scrollea. */
const ALTO_VISOR_PATIO = 600;

export default function TablaPatioTrozas({
  rows, formula, diametros, verEspecie, verVolumen, ordenFilas, total, lastAddedId, leyendoId, onEditar, onBorrar, onLeerDesde,
}: {
  rows: FilaTroza[];
  formula: FormulaTrozas;
  diametros: DiametrosPorTroza;
  verEspecie: boolean;
  verVolumen: boolean;
  ordenFilas: OrdenFilas;
  total: number;
  lastAddedId?: string;
  leyendoId?: string | null;
  onEditar: (id: string, campo: CampoTroza, valor: number) => void;
  onBorrar: (id: string) => void;
  onLeerDesde: (id: string) => void;
}) {
  const u = UNIDADES_FORMULA[formula];
  const ventana = useTablaVentaneada(rows, { altoVisor: ALTO_VISOR_PATIO });
  const propsTabla = useMemo(() => {
    const q: Record<string, unknown> = { ...ventana.propsContenedor };
    q.className = "rounded-xl";
    return q as React.HTMLAttributes<HTMLDivElement>;
  }, [ventana.propsContenedor]);
  /** Columnas antes del total — el pie las abarca todas; con Especie oculta un colSpan fijo quedaba corto o largo. */
  const colSpanTotales = 2 /* # + Largo */ + diametros + (verEspecie ? 1 : 0);
  /** Columnas vivas — para el colSpan de los `<tr>` colchón. */
  const colsTotales = colSpanTotales + (verVolumen ? 1 : 0) + 1;
  const TH = "px-3 py-2";

  return (
    <DataTable className="w-full min-w-[640px] text-sm" wrapperProps={propsTabla}>
      <thead>
        <tr className="bg-[var(--surface-sunken)] text-left text-[length:var(--ts-xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          <th className={TH}>#</th>
          {diametros === 1 ? (
            <th className={TH}>Ø ({u.diametro})</th>
          ) : (
            <><th className={TH}>Ø menor ({u.diametro})</th><th className={TH}>Ø mayor ({u.diametro})</th></>
          )}
          <th className={TH}>Largo ({u.largo})</th>
          {verEspecie && <th className={TH}>Especie</th>}
          {verVolumen && <th className={`${TH} text-right`}>{u.volumen}</th>}
          <th className={TH} />
        </tr>
      </thead>
      <tbody>
        {/* Colchón: reserva el alto de lo que no está montado, para que el
            scrollbar mida lo mismo que con todas las filas. */}
        {ventana.colchonSuperior > 0 && (
          <tr aria-hidden="true">
            <td colSpan={colsTotales} style={{ height: ventana.colchonSuperior, padding: 0, border: 0 }} />
          </tr>
        )}
        {ventana.filasEnVentana.map((r, iVentana) => {
          /* La posición REAL, no la de la ventana: el «#» y el rótulo de los
             botones siguen siendo el número de la troza en el patio. Con «más
             nuevas primero» cada troza conserva su número (`numeroDeFila`). */
          const i = ventana.inicioVentana + iVentana;
          const n = numeroDeFila(i, rows.length, ordenFilas);
          /* Agrupado por especie, una raya más marcada separa los bloques (con
             `!`: `DataTable` pinta el borde de todas las filas con un selector
             descendiente que le gana a la clase). */
          const inicioBloque = ordenFilas === "especie" && empiezaBloque(r, rows[i - 1]);
          return (
            <tr
              key={r.id}
              id={`troza-row-${r.id}`}
              ref={iVentana === 0 ? ventana.primeraFilaRef : undefined}
              className={`${inicioBloque ? "border-t-2! border-t-[var(--rule-strong)]!" : "border-t border-[var(--rule-soft)]"} ${
                leyendoId === r.id
                  ? "bg-primary/10 outline outline-2 -outline-offset-2 outline-[var(--accent)]"
                  : r.sospechosa
                    ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12"
                    : lastAddedId === r.id
                      ? "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/10"
                      : ""
              }`}
            >
              <td className="px-3 py-2 font-mono tabular-nums text-[var(--text-tertiary)]">{n}</td>
              {diametros === 1 ? (
                <td className="px-3 py-2"><CeldaNum value={diametroUnico(r)} onChange={(v) => onEditar(r.id, "d", v)} etiqueta={`Diámetro de la troza ${n}`} /></td>
              ) : (
                <>
                  <td className="px-3 py-2"><CeldaNum value={r.d1} onChange={(v) => onEditar(r.id, "d1", v)} etiqueta={`Diámetro 1 de la troza ${n}`} /></td>
                  <td className="px-3 py-2"><CeldaNum value={r.d2} onChange={(v) => onEditar(r.id, "d2", v)} etiqueta={`Diámetro 2 de la troza ${n}`} /></td>
                </>
              )}
              <td className="px-3 py-2"><CeldaNum value={r.largo} onChange={(v) => onEditar(r.id, "largo", v)} etiqueta={`Largo de la troza ${n}`} /></td>
              {verEspecie && <td className="px-3 py-2 text-[var(--text-secondary)]">{r.especie ?? "—"}</td>}
              {verVolumen && (
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {formatNumber(volumenDe(r, formula), u.decimales)}
                </td>
              )}
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1.5">
                  {/* Leer DESDE acá: se cortó a mitad del patio y no hay por qué
                      escuchar de nuevo lo ya cotejado. */}
                  <button
                    type="button"
                    onClick={() => onLeerDesde(r.id)}
                    aria-label={`Leer en voz alta desde la troza ${n}`}
                    title="Leer en voz alta desde esta troza en adelante"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onBorrar(r.id)} aria-label={`Borrar troza ${n}`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
        {ventana.colchonInferior > 0 && (
          <tr aria-hidden="true">
            <td colSpan={colsTotales} style={{ height: ventana.colchonInferior, padding: 0, border: 0 }} />
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-[var(--rule-base)] bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <td className="px-3 py-2.5" colSpan={colSpanTotales}>Total · {rows.length} {rows.length === 1 ? "troza" : "trozas"}</td>
          {verVolumen && <td className="px-3 py-2.5 text-right font-mono text-base tabular-nums text-[var(--accent)]">{formatNumber(total, u.decimales)} {u.volumen}</td>}
          <td />
        </tr>
      </tfoot>
    </DataTable>
  );
}

/**
 * Buffer de texto LOCAL, no `type="number"`: con el valor atado directo a la
 * medida, seleccionar todo y borrar para tipear de nuevo hacía que el campo
 * VOLVIERA solo al valor viejo a mitad de tecleo. Acá el buffer manda mientras
 * la celda tiene el foco; se sincroniza con el valor de afuera al perderlo
 * (mismo arreglo que `Num` en CubicadorMadera.tsx).
 */
function CeldaNum({ value, onChange, etiqueta }: { value: number; onChange: (v: number) => void; etiqueta?: string }) {
  const [texto, setTexto] = useState(String(value));
  const enfocado = useRef(false);
  useEffect(() => { if (!enfocado.current) setTexto(String(value)); }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={etiqueta}
      value={texto}
      onFocus={(e) => { enfocado.current = true; e.currentTarget.select(); }}
      onBlur={() => { enfocado.current = false; setTexto(String(value)); }}
      onChange={(e) => {
        const limpio = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
        setTexto(limpio);
        const n = Number(limpio);
        if (limpio !== "" && Number.isFinite(n) && n > 0) onChange(n);
      }}
      className="h-8 w-20 rounded-xl border border-[var(--rule-base)] bg-transparent px-2 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
    />
  );
}
