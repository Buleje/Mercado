"use client";

/**
 * PlantacionVerticesTabla — cuadro de coordenadas UTM de un bloque de
 * plantación. Mismo lenguaje visual que `LothVerticesPanel` (VÉRTICE · ESTE ·
 * NORTE), pero editable: acá el operador recién está tipeando el bloque, no
 * viendo el resultado de un polígono ya dibujado.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "@buleje/design-system/icons";
import { vertexCode } from "@/lib/forestal/loth-utm";
import type { VerticeBloque } from "@/lib/forestal/plantacion-cartografia";

const inputCls =
  "h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20";

function renumerar(vertices: VerticeBloque[]): VerticeBloque[] {
  return vertices.map((v, i) => ({ ...v, orden: i }));
}

export default function PlantacionVerticesTabla({
  vertices,
  soloLectura,
  onChange,
}: {
  vertices: VerticeBloque[];
  soloLectura?: boolean;
  onChange: (vertices: VerticeBloque[]) => void;
}) {
  const ordenados = [...vertices].sort((a, b) => a.orden - b.orden);

  function agregar() {
    onChange([...ordenados, { orden: ordenados.length, zonaUtm: ordenados.at(-1)?.zonaUtm ?? "18S", este: 0, norte: 0 }]);
  }

  function editar(i: number, patch: Partial<VerticeBloque>) {
    onChange(ordenados.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }

  function eliminar(i: number) {
    onChange(renumerar(ordenados.filter((_, idx) => idx !== i)));
  }

  function mover(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= ordenados.length) return;
    const copia = [...ordenados];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onChange(renumerar(copia));
  }

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]">
      {ordenados.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">Sin vértices todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
                <th className="border-b border-[var(--rule-base)] px-2 py-1.5 text-left font-bold">Punto</th>
                <th className="border-b border-[var(--rule-base)] px-2 py-1.5 text-left font-bold">Zona UTM</th>
                <th className="border-b border-[var(--rule-base)] px-2 py-1.5 text-right font-bold">Este</th>
                <th className="border-b border-[var(--rule-base)] px-2 py-1.5 text-right font-bold">Norte</th>
                {!soloLectura && <th className="border-b border-[var(--rule-base)] px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {ordenados.map((v, i) => (
                <tr key={i} className="border-b border-[var(--rule-subtle)] last:border-0">
                  <td className="px-2 py-1.5 font-mono text-sm font-bold text-[var(--text-primary)]">{vertexCode(i)}</td>
                  <td className="px-2 py-1.5">
                    {soloLectura ? (
                      <span className="text-[var(--text-secondary)]">{v.zonaUtm || "—"}</span>
                    ) : (
                      <input
                        type="text"
                        value={v.zonaUtm ?? ""}
                        onChange={(e) => editar(i, { zonaUtm: e.target.value })}
                        placeholder="18S"
                        className={`${inputCls} w-20`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {soloLectura ? (
                      <span className="font-mono tabular-nums text-[var(--text-secondary)]">{v.este}</span>
                    ) : (
                      <input
                        type="number"
                        value={Number.isFinite(v.este) ? v.este : ""}
                        onChange={(e) => editar(i, { este: e.target.value === "" ? 0 : Number(e.target.value) })}
                        className={`${inputCls} text-right font-mono tabular-nums`}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {soloLectura ? (
                      <span className="font-mono tabular-nums text-[var(--text-secondary)]">{v.norte}</span>
                    ) : (
                      <input
                        type="number"
                        value={Number.isFinite(v.norte) ? v.norte : ""}
                        onChange={(e) => editar(i, { norte: e.target.value === "" ? 0 : Number(e.target.value) })}
                        className={`${inputCls} text-right font-mono tabular-nums`}
                      />
                    )}
                  </td>
                  {!soloLectura && (
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => mover(i, -1)}
                          disabled={i === 0}
                          title="Subir"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-30"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(i, 1)}
                          disabled={i === ordenados.length - 1}
                          title="Bajar"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-30"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminar(i)}
                          title="Eliminar vértice"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--data-error-600)] transition hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/12"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!soloLectura && (
        <div className="border-t border-[var(--rule-base)] p-2">
          <button
            type="button"
            onClick={agregar}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar vértice
          </button>
        </div>
      )}
    </div>
  );
}
