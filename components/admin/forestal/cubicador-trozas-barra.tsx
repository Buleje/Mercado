"use client";

/**
 * Cabecera de la tabla del patio, en UNA fila a 1280 (como la del cubicador de
 * aserrada, `cubicador-acciones`): título · «Guardar en la cuenta» destacado ·
 * orden · columnas · leer en voz alta · menú «Patio» (Guardadas, la CUB de este
 * lote, Importar, Especies, CSV y Vaciar al fondo, en rojo). Hasta el 15-10 la
 * cuenta vivía al fondo de la tarjeta y la cabecera ocupaba 3 renglones (132 px)
 * con botones de 30 y 48 px mezclados. Las columnas opcionales (Especie, el
 * volumen de la fórmula y su equivalente en la otra) quedan guardadas por tenant.
 */
import { useEffect, useState } from "react";
import { Columns3, FileSpreadsheet, FolderOpen, MoreHorizontal, Square, Table, Trash2, Trees, Upload, Volume2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { esOrdenFilas, type OrdenFilas } from "@/lib/forestal/cubicador-bloques-especie";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { MenuAcciones, type AccionMenu } from "./cubicador-acciones";
import { BotonGuardarEnLaCuenta, type CuentaDelPatio } from "./cubicador-trozas-guardadas";

export type ColOpcionalTroza = "especie" | "m3" | "equiv";
export const COLS_DEFAULT_TROZA: Record<ColOpcionalTroza, boolean> = { especie: true, m3: true, equiv: true };

const ICONO = button({ variant: "secondary", size: "icon", className: "rounded-xl" });
const ACTIVO = "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";

export default function BarraPatioTrozas({
  total, etiquetaVolumen, etiquetaEquivalente, cuenta, onImportar, onEspecies, ordenFilas, hayQueOrdenar, hayQueAgrupar, onOrden,
  colsVisibles, onCols, leyendo, onLeer, onCsv, onVaciar,
}: {
  total: number;
  /** «m³» o «PT»: la columna de volumen se llama como la unidad del lote. */
  etiquetaVolumen: string;
  /** «≈ PT Oxapampina» o «≈ m³ Smalian»: la columna del equivalente en la otra fórmula. */
  etiquetaEquivalente: string;
  /** La cuenta del patio (`useCuentaDelPatio`): su botón va primero, sus guardadas al menú. */
  cuenta: CuentaDelPatio;
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
    { key: "equiv", label: etiquetaEquivalente },
  ];

  const menu: AccionMenu[] = [
    { key: "guardadas", label: "Guardadas", Icono: FolderOpen, hint: "Las cubicaciones ya guardadas: abrirlas, valorizarlas o anularlas", onClick: cuenta.verGuardadas },
    ...(cuenta.esteLote ? [{ key: "este", label: `Este patio: ${cuenta.esteLote.codigo}`, Icono: FolderOpen, hint: "La cubicación que se guardó de este patio", onClick: cuenta.esteLote.abrir }] : []),
    ...(onImportar ? [{ key: "importar", label: "Importar del Excel", Icono: Upload, onClick: onImportar }] : []),
    { key: "especies", label: "Especies del aserradero", Icono: Trees, hint: "Crear, renombrar o quitar especies", onClick: onEspecies },
    ...(total > 0 ? [
      { key: "csv", label: `Descargar CSV (${etiquetaVolumen})`, Icono: FileSpreadsheet, hint: "Se abre en Excel; trae el equivalente en la otra fórmula", onClick: onCsv },
      { key: "vaciar", label: "Vaciar el patio", Icono: Trash2, peligro: true, onClick: onVaciar },
    ] : []),
  ];

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Table className="h-4 w-4 text-[var(--accent)]" /> Trozas del patio ({total})
      </CardTitle>
      <div className="flex flex-wrap items-center gap-2">
        <BotonGuardarEnLaCuenta cuenta={cuenta} />
        {hayQueOrdenar && (
          <select
            value={ordenFilas}
            onChange={(e) => { if (esOrdenFilas(e.target.value)) onOrden(e.target.value); }}
            aria-label="Orden de las trozas"
            title="Como se dictó: en el orden en que entraron. Más nuevas primero: la última que dictaste arriba, y cada troza conserva su número. Por especie: el patio en bloques, y lo que dictes después cae al final de su bloque."
            className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-secondary)] outline-none hover:border-[var(--accent)] focus:border-[var(--accent)]"
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
            className={cn(ICONO, colsMenuOpen && ACTIVO)}
          >
            <Columns3 className="h-4 w-4" />
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
          <button
            type="button"
            onClick={onLeer}
            title={leyendo ? "Detener la lectura" : "Leer las trozas en voz alta, una por una"}
            aria-label={leyendo ? "Detener la lectura" : "Leer el patio en voz alta"}
            aria-pressed={leyendo}
            className={cn(ICONO, leyendo && ACTIVO)}
          >
            {leyendo ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
        <MenuAcciones etiqueta="Patio" Icono={MoreHorizontal} items={menu} alineacion="derecha" />
      </div>
    </div>
  );
}
