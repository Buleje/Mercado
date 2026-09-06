"use client";

/**
 * Bajar el expediente: uno, algunos o todos, en PDF o Excel.
 *
 * La pantalla muestra un lote por vez porque eso es lo que se mira; los
 * archivos aceptan varios porque eso es lo que se audita. Nadie revisa un lote
 * suelto: se revisa el trimestre, o los de una especie, o los tres que
 * alimentaron una guía. Bajar de a uno y pegar a mano es donde se pierden filas.
 *
 * Las historias se piden al abrir el panel, no al cargar la pestaña: el tramo
 * de salida hace dos saltos contra la base por lote, y no se paga hasta que
 * alguien de verdad va a descargar.
 */

import { useCallback, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2 } from "@buleje/design-system/icons";
import { Btn } from "../ctp-shared";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import type { HistoriaLote } from "@/lib/forestal/historia-lote";
import { exportarHistoriasExcel, exportarHistoriasPDF } from "@/lib/forestal/historia-lote-export";

export interface LoteElegible {
  id: string;
  code: string;
  status: string;
  piezas: number;
}

/**
 * Tope de lotes por descarga.
 *
 * Cada uno es un pedido con dos saltos extra contra la base; treinta en
 * paralelo es una descarga cómoda y un pico que el pooler aguanta. Más que eso
 * no se bloquea: se avisa y se pide acotar, que es lo que un operador con 200
 * lotes va a querer hacer igual.
 */
const TOPE = 30;

export default function DescargarLotes({
  lotes,
  loteActual,
}: {
  lotes: readonly LoteElegible[];
  /** Viene tildado al abrir: es el que la persona está mirando. */
  loteActual: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  /**
   * `null` = «todavía no eligió nada»: entonces vale el lote que está mirando.
   *
   * Con un `useState` sembrado del lote actual no alcanzaba: el inicializador
   * corre en el PRIMER render, y ahí `loteActual` todavía es `null` porque el
   * lote se elige recién cuando llega el listado. El panel abría con cero
   * tildados y un «Elegí al menos un lote» encima del lote que la persona tenía
   * en pantalla. En cuanto toca un checkbox, manda su selección.
   */
  const [elegidosManual, setElegidos] = useState<Set<string> | null>(null);
  const [bajando, setBajando] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegidos = useMemo(
    () => elegidosManual ?? new Set(loteActual ? [loteActual] : []),
    [elegidosManual, loteActual],
  );

  const alternar = (id: string) => {
    const s = new Set(elegidos);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setElegidos(s);
  };

  const todos = elegidos.size === lotes.length && lotes.length > 0;
  const orden = useMemo(() => lotes.filter((l) => elegidos.has(l.id)), [lotes, elegidos]);

  const bajar = useCallback(
    async (formato: "pdf" | "excel") => {
      if (orden.length === 0) return;
      setBajando(formato);
      setError(null);
      try {
        /* En paralelo y en el ORDEN de la lista, no el de llegada: un PDF cuyas
           páginas salen en el orden en que respondió la red no se puede citar
           («está en la hoja 4») ni comparar contra otra descarga. */
        const historias = await Promise.all(
          orden.map((l) =>
            ctpGet<{ historia: HistoriaLote }>(
              `/api/admin/forestal/lotes-aserrio?historia=${encodeURIComponent(l.id)}`,
            ).then((r) => r.historia),
          ),
        );
        if (formato === "pdf") await exportarHistoriasPDF(historias);
        else await exportarHistoriasExcel(historias);
        setAbierto(false);
      } catch (e) {
        /* Se dice qué falló y NO se descarga nada a medias: medio expediente
           con las páginas que sí llegaron es peor que ninguno — se firma igual
           y nadie nota las que faltan. */
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBajando(null);
      }
    },
    [orden],
  );

  return (
    <div className="relative">
      <Btn variant="secondary" size="md" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <Download className="h-4 w-4" /> Descargar
      </Btn>

      {abierto && (
        <div className="absolute right-0 z-30 mt-2 w-[22rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]">
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
              Qué lotes bajar
            </CardTitle>
            <button
              type="button"
              onClick={() => setElegidos(todos ? new Set() : new Set(lotes.map((l) => l.id)))}
              className="text-xs font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
            >
              {todos ? "Ninguno" : `Todos (${lotes.length})`}
            </button>
          </div>

          <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
            {lotes.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">
                  <input
                    type="checkbox"
                    checked={elegidos.has(l.id)}
                    onChange={() => alternar(l.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="font-mono font-bold text-[var(--text-primary)]">{l.code}</span>
                  <span className="text-[var(--text-tertiary)]">
                    {l.status}
                    {l.piezas > 0 && ` · ${l.piezas} pz`}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {elegidos.size > TOPE && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Son {elegidos.size} lotes: cada uno es una consulta con su cadena de salida. Bajá de a {TOPE} o menos para
              que no se caiga a mitad.
            </p>
          )}
          {error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> No se pudo armar la descarga: {error}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Btn variant="dark" size="md" className="flex-1" onClick={() => void bajar("pdf")} disabled={elegidos.size === 0 || bajando !== null}>
              {bajando === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
            </Btn>
            <Btn variant="secondary" size="md" className="flex-1" onClick={() => void bajar("excel")} disabled={elegidos.size === 0 || bajando !== null}>
              {bajando === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
            </Btn>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            {elegidos.size === 0
              ? "Elegí al menos un lote."
              : `${elegidos.size} ${elegidos.size === 1 ? "lote" : "lotes"} · el PDF sale con uno por página; el Excel, en cuatro hojas.`}
          </p>
        </div>
      )}
    </div>
  );
}
