"use client";

/**
 * Anexo04Historial — bandeja de anexos ya emitidos. Cada vez que se descarga el
 * PDF queda registrado el papel completo (N°, GTF, firmante y las medidas), así
 * que meses después se puede volver a imprimir EL MISMO documento: en una
 * fiscalización piden el anexo que se entregó, no la cubicación del día.
 *
 * La lista llega por props (`useAnexosEmitidos`, en el modal) porque el checklist
 * también la necesita — para avisar de un N° repetido o de una guía que ya tiene
 * anexo — y no puede depender de que alguien despliegue este panel.
 */
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, History, Loader2, Printer, RotateCcw, Search, Trash2 } from "@buleje/design-system/icons";
import {
  etiquetaEmision, filtrarEmisiones, mesesDeEmisiones, emisionesDelMes, etiquetaMes,
  type AnexoEmitido,
} from "@/lib/forestal/anexo04-registro";
import { fmtAnexo } from "@/lib/forestal/anexo04-serfor";
import { exportarBandejaAnexos } from "@/lib/forestal/anexo04-excel";

const fecha = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); }
  catch { return iso.slice(0, 10); }
};

const ICONO = "rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]";

export default function Anexo04Historial({
  lista, cargando, ctpEntryId, onCargar, onDescargar, onQuitar, onPdfLote, onError,
}: {
  lista: AnexoEmitido[];
  cargando: boolean;
  /** Despacho desde el que se abrió: sus emisiones van primero y marcadas. */
  ctpEntryId?: string;
  /** Trae esa emisión al formulario (datos + medidas) para revisarla o corregirla. */
  onCargar: (a: AnexoEmitido) => void;
  /** Re-descarga el PDF exactamente como se emitió. */
  onDescargar: (a: AnexoEmitido) => void;
  onQuitar: (id: string) => Promise<boolean>;
  /** Un solo PDF con todos los anexos que se están viendo (archivo del mes). */
  onPdfLote: (lista: AnexoEmitido[]) => void;
  onError?: (msg: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [mes, setMes] = useState("");
  const [borrando, setBorrando] = useState<string | null>(null);

  const meses = useMemo(() => mesesDeEmisiones(lista), [lista]);
  /** Las de ESTE despacho primero: es lo que el operario vino a buscar. */
  const visibles = useMemo(() => {
    const filtradas = filtrarEmisiones(emisionesDelMes(lista, mes), busqueda);
    if (!ctpEntryId) return filtradas;
    return [
      ...filtradas.filter((a) => a.ctpEntryId === ctpEntryId),
      ...filtradas.filter((a) => a.ctpEntryId !== ctpEntryId),
    ];
  }, [lista, busqueda, mes, ctpEntryId]);

  const borrar = async (a: AnexoEmitido) => {
    setBorrando(a.id);
    if (!(await onQuitar(a.id))) onError?.("No se pudo borrar del historial.");
    setBorrando(null);
  };

  if (cargando) {
    return (
      <p className="flex items-center gap-2 py-3 text-xs text-[var(--text-tertiary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando los anexos emitidos…
      </p>
    );
  }

  if (lista.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
        Todavía no emitiste ningún anexo. Al descargar el PDF queda registrado acá para re-imprimirlo igual.
      </p>
    );
  }

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          {visibles.length === lista.length
            ? `${lista.length} anexo${lista.length === 1 ? "" : "s"} emitido${lista.length === 1 ? "" : "s"}`
            : `${visibles.length} de ${lista.length}`}
        </span>
        <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPdfLote(visibles)}
          title="Un solo PDF con los anexos que estás viendo, para imprimir y archivar"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <Printer className="h-3.5 w-3.5" /> PDF
        </button>
        <button
          type="button"
          onClick={() => exportarBandejaAnexos(visibles).catch(() => onError?.("No se pudo generar el Excel de la bandeja."))}
          title="Bajar el libro de anexos emitidos (lo que estás viendo) para el archivo del regente"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
        </button>
        </div>
      </div>

      {(lista.length > 4 || meses.length > 1) && (
        <div className="mb-2 flex gap-1.5">
          <label className="flex flex-1 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por N°, GTF o firmante…"
              aria-label="Buscar en los anexos emitidos"
              className="h-9 min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none"
            />
          </label>
          {meses.length > 1 && (
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Filtrar por mes de emisión"
              className="h-9 shrink-0 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Todos los meses</option>
              {meses.map((m) => <option key={m} value={m}>{etiquetaMes(m)}</option>)}
            </select>
          )}
        </div>
      )}

      {visibles.length === 0 && (
        <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] px-3 py-3 text-center text-xs text-[var(--text-tertiary)]">
          Ningún anexo coincide con el filtro.
        </p>
      )}

      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {visibles.map((a) => (
          <li key={a.id} className={`rounded-xl border-2 px-3 py-2 ${ctpEntryId && a.ctpEntryId === ctpEntryId ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[var(--text-primary)]">
                  {ctpEntryId && a.ctpEntryId === ctpEntryId && <span className="mr-1 text-[var(--accent)]">★</span>}
                  {etiquetaEmision(a)}
                </p>
                <p className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {fecha(a.fecha)} · {a.hojas} hoja{a.hojas === 1 ? "" : "s"} · {a.totalPiezas} pzas · {fmtAnexo(a.totalM3)} m³
                  {a.firmante ? ` · ${a.firmante}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => onCargar(a)} title="Traer estos datos y medidas al formulario" aria-label="Cargar en el formulario" className={ICONO}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onDescargar(a)} title="Re-descargar el PDF tal como se emitió" aria-label="Re-descargar el PDF" className={ICONO}>
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => void borrar(a)} disabled={borrando === a.id} title="Quitar del historial" aria-label="Quitar del historial" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-tertiary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-700)] disabled:opacity-50">
                  {borrando === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Icono del panel, para el botón que lo despliega en el modal. */
export const ICONO_HISTORIAL = History;
