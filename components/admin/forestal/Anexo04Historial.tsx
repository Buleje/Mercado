"use client";

/**
 * Anexo04Historial — bandeja de anexos ya emitidos. Cada vez que se descarga el
 * PDF queda registrado el papel completo (N°, GTF, firmante y las medidas), así
 * que meses después se puede volver a imprimir EL MISMO documento: en una
 * fiscalización piden el anexo que se entregó, no la cubicación del día.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, History, Loader2, RotateCcw, Trash2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { etiquetaEmision, type AnexoEmitido } from "@/lib/forestal/anexo04-registro";
import { fmtAnexo } from "@/lib/forestal/anexo04-serfor";

const fecha = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); }
  catch { return iso.slice(0, 10); }
};

export default function Anexo04Historial({
  recargarToken, onCargar, onDescargar, onError,
}: {
  /** Cambia cuando se emite un anexo nuevo: obliga a releer la bandeja. */
  recargarToken: number;
  /** Trae esa emisión al formulario (datos + medidas) para revisarla o corregirla. */
  onCargar: (a: AnexoEmitido) => void;
  /** Re-descarga el PDF exactamente como se emitió. */
  onDescargar: (a: AnexoEmitido) => void;
  onError?: (msg: string) => void;
}) {
  const [lista, setLista] = useState<AnexoEmitido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState<string | null>(null);

  const load = useCallback(() => {
    setCargando(true);
    fetch("/api/admin/forestal/anexos", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { anexos: [] }))
      .then((j: { anexos?: AnexoEmitido[] }) => setLista(j.anexos ?? []))
      .catch(() => setLista([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(load, [load, recargarToken]);

  const borrar = async (a: AnexoEmitido) => {
    setBorrando(a.id);
    try {
      const r = await fetch(`/api/admin/forestal/anexos?id=${encodeURIComponent(a.id)}`, {
        method: "DELETE", credentials: "include", headers: csrfHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLista((prev) => prev.filter((x) => x.id !== a.id));
    } catch { onError?.("No se pudo borrar del historial."); }
    finally { setBorrando(null); }
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
    <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
      {lista.map((a) => (
        <li key={a.id} className="rounded-xl border-2 border-[var(--rule-base)] px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[var(--text-primary)]">{etiquetaEmision(a)}</p>
              <p className="mt-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {fecha(a.fecha)} · {a.hojas} hoja{a.hojas === 1 ? "" : "s"} · {a.totalPiezas} pzas · {fmtAnexo(a.totalM3)} m³
                {a.firmante ? ` · ${a.firmante}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onCargar(a)} title="Traer estos datos y medidas al formulario" aria-label="Cargar en el formulario" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => onDescargar(a)} title="Re-descargar el PDF tal como se emitió" aria-label="Re-descargar el PDF" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
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
  );
}

/** Icono del panel, para el botón que lo despliega en el modal. */
export const ICONO_HISTORIAL = History;
