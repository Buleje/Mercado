"use client";

/**
 * La grilla de «Pegar de Excel» del lote (Brandon 27-10: «el formato de
 * importación quiero que sea tipo como esto», la tabla para pegar del
 * cubicador). Se usa como Excel: clic en una celda y Ctrl+V pega desde ahí;
 * con la fila de títulos del SNIFFS cada columna cae en la suya. Flechas y
 * Enter mueven, Ctrl+Z deshace. Las columnas van en el orden de la lista
 * del SNIFFS (28-10): se copia desde la columna A del Excel y se pega en la
 * primera celda. «En el libro» va pegada al N° de fila: con dieciséis
 * columnas, a la derecha quedaría fuera de vista (prueba e2e 27-10).
 */

import { memo, useCallback, useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { Eraser, Loader2, Undo2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { IconAction } from "@/components/admin/shared/module-primitives";
import { pareceTabla } from "@/lib/forestal/cubicacion-pegar";
import {
  COLUMNAS_LOTE,
  NUMERICAS_LOTE,
  TITULO_COLUMNA_LOTE,
  esFilaGrillaVacia,
  type ColumnaLote,
  type FilaGrilla,
} from "@/lib/forestal/lote-desde-excel";
import type { EstadoFilaLote, FilaCruzada } from "@/lib/forestal/lote-desde-excel-cruce";
import { useTecladoGrilla } from "./celdas-excel";
import { Btn } from "./ctp-shared";
import type { LoteDesdeExcel } from "./hooks/use-lote-desde-excel";

export const GRILLA_LOTE = "pegar-lote-sniffs";

const IDX = COLUMNAS_LOTE.map((_, k) => k);
const ANCHO: Record<ColumnaLote, string> = {
  contrato: "w-52",
  resolucion: "w-44",
  tipoDocumento: "w-24",
  gtf: "w-40",
  trozaPadre: "w-24",
  codigoTroza: "w-24",
  codigoPlanta: "w-28",
  especie: "w-56",
  lote: "w-24",
  d1Cm: "w-20",
  d2Cm: "w-20",
  largoM: "w-24",
  volumenM3: "w-28",
  tipoProducto: "w-44",
  estado: "w-32",
  fecha: "w-32",
};

const CELDA =
  "h-10 w-full min-w-0 rounded-md border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";

const OK = "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const MAL = "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const AVISO = "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const PASTILLA: Record<EstadoFilaLote | "importada", { texto: string; clase: string }> = {
  entra: { texto: "Entra", clase: OK },
  "ya-en-el-lote": { texto: "Ya en este lote", clase: OK },
  importada: { texto: "Importada", clase: OK },
  "no-entra": { texto: "No entra", clase: MAL },
  "no-encontrada": { texto: "No está", clase: MAL },
  ambigua: { texto: "Ambigua", clase: AVISO },
  repetida: { texto: "Repetida", clase: AVISO },
};

/** La celda «En el libro»: la pastilla y, debajo, el porqué o lo que cambia. */
function EnElLibro({ estado, conCodigo }: { estado: FilaCruzada | "importada" | undefined; conCodigo: boolean }) {
  if (!estado) {
    return conCodigo ? <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-label="Buscando en el libro" /> : null;
  }
  const clave = estado === "importada" ? "importada" : estado.estado;
  const p = PASTILLA[clave];
  const nota =
    estado === "importada"
      ? null
      : (estado.motivo ??
        ([
          estado.volumenDistinto && estado.volumenLibro != null ? `libro ${estado.volumenLibro} m³` : null,
          estado.completaD1 != null || estado.completaD2 != null ? "completa D1/D2" : null,
        ]
          .filter(Boolean)
          .join(" · ") ||
          null));
  return (
    <span className="block" title={nota ?? undefined}>
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${p.clase}`}>{p.texto}</span>
      {nota && <span className="line-clamp-2 text-xs text-[var(--text-secondary)]">{nota}</span>}
    </span>
  );
}

interface Manejo {
  onEscribir: (fila: number, col: number, valor: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const FilaDeLaGrilla = memo(function FilaDeLaGrilla({
  i,
  fila,
  estado,
  manejo,
}: {
  i: number;
  fila: FilaGrilla;
  estado: FilaCruzada | "importada" | undefined;
  manejo: Manejo;
}) {
  return (
    <tr>
      <td className="text-center text-xs tabular-nums text-[var(--text-tertiary)]">{i + 1}</td>
      <td>
        <EnElLibro estado={estado} conCodigo={Boolean(fila.codigoPlanta.trim() || fila.codigoTroza.trim())} />
      </td>
      {COLUMNAS_LOTE.map((c, k) => {
        const numerica = NUMERICAS_LOTE.has(c);
        return (
          <td key={c}>
            <input
              type="text"
              inputMode={numerica ? "decimal" : "text"}
              autoComplete="off"
              spellCheck={false}
              value={fila[c]}
              aria-label={`${TITULO_COLUMNA_LOTE[c]}, fila ${i + 1}`}
              data-fila={i}
              data-col={k}
              onChange={(e) => manejo.onEscribir(i, k, e.target.value)}
              onKeyDown={manejo.onKeyDown}
              className={`${CELDA} ${numerica ? "text-right font-mono tabular-nums" : ""}`}
            />
          </td>
        );
      })}
    </tr>
  );
});

/** La celda donde pasó el evento (`null` = fuera de una celda). */
function celdaDe(el: EventTarget) {
  if (!(el instanceof HTMLElement) || el.dataset.fila === undefined) return null;
  return { fila: Number(el.dataset.fila), col: Number(el.dataset.col) };
}

export default function CtpLoteExcelGrilla({ estado }: { estado: LoteDesdeExcel }) {
  const { filas, escribir, pegar, deshacer, puedeDeshacer, vaciar, aviso, cerrarAviso, estadoDeFila, importando } = estado;
  const navegar = useTecladoGrilla({ grilla: GRILLA_LOTE, totalFilas: filas.length, columnas: IDX });
  const manejo = useMemo<Manejo>(
    () => ({
      onEscribir: escribir,
      onKeyDown: (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          deshacer();
          return;
        }
        navegar(e);
      },
    }),
    [escribir, deshacer, navegar],
  );

  const alPegar = useCallback(
    (e: React.ClipboardEvent) => {
      const texto = e.clipboardData.getData("text/plain");
      // Un valor suelto en una celda: que lo pegue el navegador, como siempre.
      if (!texto || !pareceTabla(texto)) return;
      e.preventDefault();
      const vacia = filas.findIndex(esFilaGrillaVacia);
      pegar(texto, celdaDe(e.target) ?? { fila: vacia < 0 ? filas.length : vacia, col: 0 });
    },
    [filas, pegar],
  );

  const vacia = filas.every(esFilaGrillaVacia);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="flex min-w-0 flex-1 items-start gap-1.5 text-sm text-[var(--text-secondary)] max-sm:basis-full">
          {aviso ?? "Copia del Excel del SNIFFS desde la columna A (con o sin títulos), haz clic en la primera celda y pega con Ctrl+V: las columnas van en el mismo orden."}
          {aviso && <IconAction icon={X} tone="muted" label="Cerrar el aviso" onClick={cerrarAviso} />}
        </p>
        <InfoTip
          icono="ayuda"
          title="Pegar desde Excel"
          what="Copia del SNIFFS la lista de trozas del lote (con su fila de títulos) y pégala en cualquier celda: cada columna cae en la suya. Sin títulos, desde la celda donde hiciste clic hacia la derecha."
          affects="Cada fila se busca en el patio por su guía y su Código Planta; «En el libro» dice si entra. Se consume el volumen del libro (el de la guía); el D1/D2 del Excel sólo llena los vacíos."
          example="Contrato · Número Resolución · Documento de Ingreso · Troza Padre · Código Planta · Especie · Lote · D1(cm) · D2(cm) · Largo(m) · Volumen · Tipo de Producto · Estado Actual · Fecha del Estado"
        />
        <Btn variant="ghost" size="sm" onClick={deshacer} disabled={!puedeDeshacer || importando}>
          <Undo2 className="h-4 w-4" /> Deshacer
        </Btn>
        <Btn variant="ghost" size="sm" onClick={vaciar} disabled={vacia || importando}>
          <Eraser className="h-4 w-4" /> Vaciar
        </Btn>
      </div>
      <div
        tabIndex={-1}
        data-grilla={GRILLA_LOTE}
        onPaste={alPegar}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <DataTable
          planilla
          stickyHeader
          wrapperClassName="max-h-[min(52vh,560px)] overflow-auto"
          className="hoja-grilla min-w-[124rem] table-fixed [&_tbody_td]:!px-1 [&_tbody_td]:!py-1 [&_thead_th]:!px-1.5 [&_thead_th]:!py-1.5"
        >
          <thead>
            <tr>
              <th className="w-10 text-center">#</th>
              <th className="w-40">En el libro</th>
              {COLUMNAS_LOTE.map((c) => (
                <th key={c} className={`${ANCHO[c]} ${NUMERICAS_LOTE.has(c) ? "text-right" : ""}`}>
                  {TITULO_COLUMNA_LOTE[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <FilaDeLaGrilla key={i} i={i} fila={f} estado={estadoDeFila.get(i + 1)} manejo={manejo} />
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
