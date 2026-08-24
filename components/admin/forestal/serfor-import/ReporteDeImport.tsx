"use client";

/**
 * El reporte de lo que pasó al importar.
 *
 * Los problemas van agrupados POR CAUSA, no por fila: cuarenta filas rotas
 * suelen ser un solo error repetido, y verlas como cuarenta líneas distintas
 * esconde justamente eso. Cada grupo dice qué filas afecta y qué hacer.
 *
 * Se puede bajar como CSV para abrirlo al lado del Excel y corregir.
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, CheckCircle, Download } from "@buleje/design-system/icons";
import { TITULO_FORMATO } from "@/lib/forestal/ctp-formatos-serfor";
import { reporteACsv, tituloDelReporte, type ReporteImport } from "@/lib/forestal/ctp-reporte-import";

export default function ReporteDeImport({
  reporte,
  nombreArchivo,
  escrito,
}: {
  reporte: ReporteImport;
  nombreArchivo?: string | null;
  /** true si fue una importación de verdad; false si sólo se revisó. */
  escrito: boolean;
}) {
  const [bajando, setBajando] = useState(false);

  const bajar = () => {
    setBajando(true);
    try {
      const url = URL.createObjectURL(new Blob([reporteACsv(reporte, nombreArchivo ?? undefined)], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-import-libro-CTP.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBajando(false);
    }
  };

  const hayQueRevisar = reporte.problemas.length > 0 || reporte.incompletas.length > 0 || reporte.avisosDeCadena.length > 0;

  return (
    <div className="space-y-3 rounded-xl border-2 border-[var(--rule-base)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-extrabold text-[var(--text-primary)]">
            {reporte.limpio ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-[var(--data-success)]" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning)]" aria-hidden />
            )}
            {escrito
              ? reporte.totalConError === 0
                ? `Listo — ${tituloDelReporte(reporte)}`
                : tituloDelReporte(reporte)
              : `Revisión: ${tituloDelReporte(reporte)}`}
          </p>
          {reporte.creados.length > 0 && (
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              {reporte.creados.map((c) => `${TITULO_FORMATO[c.formato]}: ${c.cantidad}`).join(" · ")}
            </p>
          )}
        </div>
        <button
          onClick={bajar}
          disabled={bajando}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-4 text-base font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <Download className="h-5 w-5" /> Bajar el reporte
        </button>
      </div>

      {/* La tabla de lo que entró: el número solo no deja verificar contra el
          archivo. Con la sección al lado, se cuadra de un vistazo. */}
      {escrito && reporte.creados.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--data-success)]/30">
          <DataTable className="w-full text-base">
            <thead className="bg-[var(--data-success)]/10 text-sm">
              <tr>
                <th className="px-3 py-2 text-left font-bold text-[var(--text-secondary)]">Sección</th>
                <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">Registros creados</th>
              </tr>
            </thead>
            <tbody>
              {reporte.creados.map((c) => (
                <tr key={c.formato} className="border-t border-[var(--rule-base)]">
                  <td className="px-3 py-2 font-semibold text-[var(--text-primary)]">{TITULO_FORMATO[c.formato]}</td>
                  <td className="px-3 py-2 text-right font-extrabold tabular-nums text-[var(--text-primary)]">
                    {c.cantidad}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <td className="px-3 py-2 font-extrabold text-[var(--text-primary)]">Total</td>
                <td className="px-3 py-2 text-right font-extrabold tabular-nums text-[var(--text-primary)]">
                  {reporte.totalCreados}
                </td>
              </tr>
            </tbody>
          </DataTable>
        </div>
      )}

      {reporte.limpio && escrito && (
        <p className="text-base font-semibold text-[var(--data-success)]">
          Terminó sin errores. Ya podés cerrar esta ventana: los datos están en el libro.
        </p>
      )}
      {reporte.limpio && !escrito && (
        <p className="text-base text-[var(--data-success)]">
          No quedó nada por revisar: el libro entró completo y la cadena cierra.
        </p>
      )}

      {/* ── Lo que quedó afuera, agrupado por causa ─────────────────────── */}
      {reporte.problemas.map((p, i) => (
        <div key={`${p.formato}-${i}`} className="rounded-lg bg-[var(--data-error)]/5 p-3">
          <p className="text-base font-extrabold text-[var(--data-error)]">
            {p.filas.length} fila{p.filas.length === 1 ? "" : "s"} · {TITULO_FORMATO[p.formato]}
          </p>
          <p className="mt-0.5 text-base text-[var(--text-secondary)]">{p.ejemplo}</p>
          {p.filas.length > 0 && (
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              {/* Los números de fila son los del Excel: sin ellos hay que
                  buscar a ojo en un archivo de trescientas líneas. */}
              Filas: <span className="tabular-nums">{p.filas.slice(0, 25).join(", ")}</span>
              {p.filas.length > 25 && ` y ${p.filas.length - 25} más`}
            </p>
          )}
          {p.comoArreglar && (
            <p className="mt-2 text-base font-semibold text-[var(--text-primary)]">→ {p.comoArreglar}</p>
          )}
        </div>
      ))}

      {/* ── Filas incompletas, detectadas antes de mandar nada ──────────── */}
      {reporte.incompletas.length > 0 && (
        <div className="rounded-lg bg-[var(--data-warning)]/5 p-3">
          <p className="text-base font-extrabold text-[var(--data-warning)]">
            {reporte.incompletas.length} fila{reporte.incompletas.length === 1 ? "" : "s"} incompleta
            {reporte.incompletas.length === 1 ? "" : "s"} en el archivo
          </p>
          {reporte.incompletas.slice(0, 8).map((inc, i) => (
            <p key={i} className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {TITULO_FORMATO[inc.formato]}, fila <span className="tabular-nums">{inc.fila}</span>:{" "}
              {inc.motivos.join(" · ")}
            </p>
          ))}
          {reporte.incompletas.length > 8 && (
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              y {reporte.incompletas.length - 8} más — están todas en el CSV.
            </p>
          )}
        </div>
      )}

      {/* ── Lo que un fiscalizador levantaría ───────────────────────────── */}
      {reporte.avisosDeCadena.length > 0 && (
        <div className="rounded-lg bg-[var(--surface-sunken)] p-3">
          <p className="text-base font-extrabold text-[var(--text-primary)]">Revisar en el libro</p>
          {reporte.avisosDeCadena.slice(0, 8).map((a, i) => (
            <p
              key={i}
              className={`mt-0.5 text-sm font-semibold ${
                a.nivel === "error" ? "text-[var(--data-error)]" : "text-[var(--data-warning)]"
              }`}
            >
              {a.lote !== "—" && <strong>Lote {a.lote}: </strong>}
              {a.mensaje}
            </p>
          ))}
        </div>
      )}

      {hayQueRevisar && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Bajá el reporte, corregí el archivo y volvé a subirlo: lo que ya entró no se duplica.
        </p>
      )}
    </div>
  );
}
