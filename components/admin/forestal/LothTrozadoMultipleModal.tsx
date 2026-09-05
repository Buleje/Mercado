"use client";

/**
 * LothTrozadoMultipleModal — trozar un árbol en una sola pantalla.
 *
 * Un fuste se corta en cinco o seis trozas; registrarlas era abrir cinco veces
 * el formulario completo y volver a tipear árbol, especie y fecha cada vez. Acá
 * se elige el árbol una vez y se agregan renglones: el código sale solo (A, B,
 * C…), el volumen se calcula por Smalian renglón por renglón, y el total se
 * compara **contra lo que ese árbol declaró al talarse**, que es el control que
 * de verdad importa (el trozado no puede superar la tala).
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Loader2, Plus, Scissors, Trash2, X } from "@buleje/design-system/icons";
import { smalianVolume, type LothEntryDTO } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

interface Renglon {
  id: number;
  sufijo: string;
  diamMayor: string;
  diamMenor: string;
  largo: string;
  isRama: boolean;
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const nuevoRenglon = (i: number): Renglon => ({
  id: i,
  sufijo: LETRAS[i % LETRAS.length],
  diamMayor: "",
  diamMenor: "",
  largo: "",
  isRama: false,
});

const INPUT =
  "h-11 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-center font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function LothTrozadoMultipleModal({
  open,
  talas,
  onClose,
  onGuardar,
}: {
  open: boolean;
  /** Talas registradas: de acá sale el árbol, su especie y su volumen tumbado. */
  talas: LothEntryDTO[];
  onClose: () => void;
  onGuardar: (
    arbol: LothEntryDTO,
    trozas: { trozaCode: string; diamMayorM: number; diamMenorM: number; lengthM: number; volumeM3: number; isRama: boolean }[],
  ) => Promise<{ creadas: number; errores: string[] }>;
}) {
  const [arbolId, setArbolId] = useState<string>("");
  const [renglones, setRenglones] = useState<Renglon[]>([nuevoRenglon(0), nuevoRenglon(1)]);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ creadas: number; errores: string[] } | null>(null);

  const arbol = useMemo(() => talas.find((t) => t.id === arbolId) ?? null, [talas, arbolId]);
  const taladoM3 = arbol?.volumeM3 != null ? Number(arbol.volumeM3) : 0;

  const calculadas = renglones.map((r) => {
    const dM = Number(r.diamMayor);
    const dm = Number(r.diamMenor);
    const L = Number(r.largo);
    const vol = smalianVolume(dM, dm, L);
    return { ...r, dM, dm, L, vol, completo: vol > 0 };
  });
  const listas = calculadas.filter((r) => r.completo);
  const totalM3 = Math.round(listas.reduce((a, r) => a + r.vol, 0) * 10000) / 10000;
  // El trozado no puede superar lo tumbado: es el invariante que la analítica
  // reporta como error, y acá se ve ANTES de asentar.
  const excede = taladoM3 > 0 && totalM3 > taladoM3 * 1.005;
  const rendimiento = taladoM3 > 0 ? (totalM3 / taladoM3) * 100 : null;

  if (!open) return null;

  const guardar = async () => {
    if (!arbol) return;
    setGuardando(true);
    try {
      setResultado(
        await onGuardar(
          arbol,
          listas.map((r) => ({
            trozaCode: `${arbol.treeCode}-${r.sufijo}`,
            diamMayorM: r.dM,
            diamMenorM: r.dm,
            lengthM: r.L,
            volumeM3: r.vol,
            isRama: r.isRama,
          })),
        ),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Trozar un árbol"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[52rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]">
        <header className="flex items-start justify-between gap-3 border-b-2 border-[var(--rule-base)] px-5 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
              <Scissors className="h-4 w-4" /> Trozar un árbol
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
              Todas las trozas del mismo fuste, de una vez. El código y el volumen salen solos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
          {resultado ? (
            <div className="rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 p-4">
              <p className="text-base font-bold text-[var(--text-primary)]">
                Entraron {resultado.creadas} de {listas.length} trozas
              </p>
              {resultado.errores.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {resultado.errores.map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Árbol talado</span>
                <select
                  value={arbolId}
                  onChange={(e) => setArbolId(e.target.value)}
                  className="mt-1 h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-bold text-[var(--text-primary)] outline-none"
                >
                  <option value="">Elegí el árbol a trozar…</option>
                  {talas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.treeCode} · {t.speciesCommon ?? "sin especie"} · {t.volumeM3 ? `${fmtM3(Number(t.volumeM3))} m³` : "sin volumen"}
                    </option>
                  ))}
                </select>
              </label>

              {arbol && (
                <>
                  <div className="overflow-x-auto rounded-xl border-2 border-[var(--rule-base)]">
                    <DataTable className="w-full text-sm">
                      <thead className="bg-[var(--surface-sunken)] text-left">
                        <tr>
                          <th className="px-3 py-2 font-bold">Troza</th>
                          <th className="px-3 py-2 font-bold">Ø mayor (m)</th>
                          <th className="px-3 py-2 font-bold">Ø menor (m)</th>
                          <th className="px-3 py-2 font-bold">Largo (m)</th>
                          <th className="px-3 py-2 text-right font-bold">Volumen m³</th>
                          <th className="px-3 py-2 font-bold">Rama</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {calculadas.map((r, i) => (
                          <tr key={r.id} className="border-t border-[var(--rule-soft)]">
                            <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                              {arbol.treeCode}-{r.sufijo}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={r.diamMayor}
                                onChange={(e) => setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, diamMayor: e.target.value } : x)))}
                                className={INPUT}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={r.diamMenor}
                                onChange={(e) => setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, diamMenor: e.target.value } : x)))}
                                className={INPUT}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.1"
                                value={r.largo}
                                onChange={(e) => setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, largo: e.target.value } : x)))}
                                className={INPUT}
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                              {r.vol > 0 ? fmtM3(r.vol) : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={r.isRama}
                                onChange={(e) => setRenglones((rs) => rs.map((x, j) => (j === i ? { ...x, isRama: e.target.checked } : x)))}
                                aria-label={`La troza ${r.sufijo} viene de una rama`}
                                className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)]"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {renglones.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}
                                  aria-label={`Quitar la troza ${r.sufijo}`}
                                  className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </div>

                  <button
                    type="button"
                    onClick={() => setRenglones((rs) => [...rs, nuevoRenglon(rs.length)])}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    <Plus className="h-4 w-4" /> Agregar troza
                  </button>

                  {/* El control que importa: lo trozado contra lo tumbado. */}
                  <div
                    className={`rounded-xl border-2 p-3 ${
                      excede
                        ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10"
                        : "border-[var(--rule-base)] bg-[var(--surface-canvas)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {listas.length} troza{listas.length === 1 ? "" : "s"} ·{" "}
                        <span className="font-mono tabular-nums">{fmtM3(totalM3)} m³</span>
                      </span>
                      <span className="text-sm text-[var(--text-secondary)]">
                        de <span className="font-mono tabular-nums">{fmtM3(taladoM3)} m³</span> tumbados
                        {rendimiento != null && (
                          <b className="ml-2 font-mono tabular-nums text-[var(--text-primary)]">{rendimiento.toFixed(1)}%</b>
                        )}
                      </span>
                    </div>
                    {excede && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        Las trozas suman más que el árbol tumbado. Revisá las medidas: el libro lo va a marcar como error de invariante.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-[var(--rule-base)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)]"
          >
            {resultado ? "Cerrar" : "Cancelar"}
          </button>
          {!resultado && (
            <button
              type="button"
              onClick={guardar}
              disabled={!arbol || listas.length === 0 || guardando}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
              {guardando ? "Asentando…" : `Asentar ${listas.length} troza${listas.length === 1 ? "" : "s"}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
