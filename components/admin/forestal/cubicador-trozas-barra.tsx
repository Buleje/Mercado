"use client";

/**
 * Cabecera de la tabla del patio: título + Importar, especies, orden,
 * columnas, leer, CSV y vaciar. Las columnas opcionales (Especie y el volumen
 * de la fórmula) quedan guardadas por tenant hasta que se vuelvan a tocar.
 */
import { useEffect, useState } from "react";
import { Columns3, Square, Table, Upload, Volume2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { esOrdenFilas, type OrdenFilas } from "@/lib/forestal/cubicador-bloques-especie";
import { CtpEspeciesBoton } from "./ctp-especie-campo";

export type ColOpcionalTroza = "especie" | "m3";
export const COLS_DEFAULT_TROZA: Record<ColOpcionalTroza, boolean> = { especie: true, m3: true };

const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

export default function BarraPatioTrozas({
  total, etiquetaVolumen, onImportar, onEspecies, ordenFilas, hayQueOrdenar, hayQueAgrupar, onOrden,
  colsVisibles, onCols, leyendo, onLeer, onCsv, onVaciar,
}: {
  total: number;
  /** «m³» o «PT»: la columna de volumen se llama como la unidad del lote. */
  etiquetaVolumen: string;
  /** Sin `onImportar` no se ofrece (el Excel de la plantilla viene en cm). */
  onImportar?: () => void;
  onEspecies: () => void;
  ordenFilas: OrdenFilas;
  hayQueOrdenar: boolean;
  hayQueAgrupar: boolean;
  onOrden: (o: OrdenFilas) => void;
  colsVisibles: Record<ColOpcionalTroza, boolean>;
  onCols: (c: Record<ColOpcionalTroza, boolean>) => void;
  leyendo: boolean;
  onLeer: () => void;
  onCsv: () => void;
  onVaciar: () => void;
}) {
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  useEffect(() => {
    if (!colsMenuOpen) return;
    const cerrar = () => setColsMenuOpen(false);
    window.addEventListener("click", cerrar);
    return () => window.removeEventListener("click", cerrar);
  }, [colsMenuOpen]);
  const opcionales: { key: ColOpcionalTroza; label: string }[] = [
    { key: "especie", label: "Especie" },
    { key: "m3", label: etiquetaVolumen },
  ];

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Table className="h-4 w-4 text-[var(--accent)]" /> Trozas del patio ({total})
      </CardTitle>
      <div className="flex flex-wrap gap-2">
        {onImportar && (
          <button type="button" onClick={onImportar} className={`${BTN} hover:border-[var(--accent)]`}>
            <Upload className="h-3.5 w-3.5" /> Importar
          </button>
        )}
        <CtpEspeciesBoton onClick={onEspecies} />
        {hayQueOrdenar && (
          <select
            value={ordenFilas}
            onChange={(e) => { if (esOrdenFilas(e.target.value)) onOrden(e.target.value); }}
            aria-label="Orden de las trozas"
            title="Como se dictó: en el orden en que entraron. Más nuevas primero: la última que dictaste arriba, y cada troza conserva su número. Por especie: el patio en bloques, y lo que dictes después cae al final de su bloque."
            className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] outline-none hover:border-[var(--accent)] focus:border-[var(--accent)]"
          >
            <option value="dictado">Orden: como se dictó</option>
            <option value="recientes">Orden: más nuevas primero</option>
            {hayQueAgrupar && <option value="especie">Orden: por especie</option>}
          </select>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setColsMenuOpen((v) => !v); }}
            title="Elegir columnas visibles de la tabla"
            aria-label="Elegir columnas visibles"
            aria-expanded={colsMenuOpen}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${colsMenuOpen ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"}`}
          >
            <Columns3 className="h-3.5 w-3.5" /> Columnas
          </button>
          {colsMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-full z-20 mt-1 min-w-[170px] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]"
            >
              <p className="px-2 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Columnas visibles</p>
              {opcionales.map(({ key, label }) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                  <input
                    type="checkbox"
                    checked={colsVisibles[key]}
                    onChange={(e) => onCols({ ...colsVisibles, [key]: e.target.checked })}
                    className="h-4 w-4 rounded border border-[var(--rule-base)] accent-[var(--color-primary)]"
                  />
                  {label}
                </label>
              ))}
              <div className="mt-1 border-t border-[var(--rule-soft)] pt-1">
                <button
                  type="button"
                  onClick={() => onCols(COLS_DEFAULT_TROZA)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-bold text-[var(--accent)] hover:bg-primary/10"
                >
                  Restablecer todas
                </button>
              </div>
            </div>
          )}
        </div>
        {total > 0 && (
          <>
            <button
              type="button"
              onClick={onLeer}
              title="Leer las trozas en voz alta, una por una"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${leyendo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {leyendo ? <><Square className="h-3.5 w-3.5" /> Detener</> : <><Volume2 className="h-3.5 w-3.5" /> Leer el patio</>}
            </button>
            <button type="button" onClick={onCsv} title={`Descarga el patio en ${etiquetaVolumen} (se abre en Excel)`} className={BTN}>CSV</button>
            <button type="button" onClick={onVaciar} className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/12">Vaciar</button>
          </>
        )}
      </div>
    </div>
  );
}
