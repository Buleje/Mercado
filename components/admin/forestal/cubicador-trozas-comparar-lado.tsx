"use client";

/**
 * Un lado del comparador de trozas: el selector de la guardada y su tarjetita
 * con lo que la identifica (persona, fecha, GTF, estado) y sus cifras
 * congeladas al guardar. Las dos van lado a lado; en el celular, una debajo de
 * la otra.
 */
import { fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { esDeTrozas, numeroVolumen } from "@/lib/forestal/cubicacion-trozas-diferencias";
import { UNIDADES_FORMULA } from "@/lib/forestal/cubicacion-trozas-formula";
import { formatNumber } from "@/lib/format";
import { FichaDeGuardada } from "./cubicador-detalle-ficha";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";
import { datosDeTrozas } from "./cubicador-trozas-ficha";
import type { CubicacionTrozas } from "./hooks/use-cubicaciones-trozas";

const textoVol = (c: CubicacionTrozas) =>
  esDeTrozas(c.formula) ? `${numeroVolumen(c.volumen, c.formula)} ${UNIDADES_FORMULA[c.formula].volumen}` : String(c.volumen);

const opcion = (c: CubicacionTrozas) =>
  `${c.codigo} · ${c.personaNombre ?? "sin persona"} · ${fechaDeLaGuardada(c.fecha)} · ${textoVol(c)}`;

export function LadoDeLasTrozas({ letra, elegida, opciones, onElegir }: {
  letra: "A" | "B";
  elegida: CubicacionTrozas | null;
  opciones: readonly CubicacionTrozas[];
  onElegir: (id: string) => void;
}) {
  const formula = elegida && esDeTrozas(elegida.formula) ? elegida.formula : null;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
      <label className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-base font-extrabold ${letra === "A"
            ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
            : "bg-[var(--accent-dark)] text-white"}`}
        >
          {letra}
        </span>
        <span className="sr-only">Cubicación {letra}</span>
        <select
          value={elegida?.id ?? ""}
          onChange={(e) => onElegir(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent)]"
        >
          {!elegida && <option value="">Elige una guardada…</option>}
          {elegida && !opciones.some((c) => c.id === elegida.id) && <option value={elegida.id}>{opcion(elegida)}</option>}
          {opciones.map((c) => <option key={c.id} value={c.id}>{opcion(c)}</option>)}
        </select>
      </label>

      {elegida && formula && (
        <>
          <FichaDeGuardada datos={datosDeTrozas(elegida)} columnas={2} />
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-[var(--rule-soft)] text-center">
            {[
              { id: "trozas", label: "Trozas", valor: formatNumber(elegida.nTrozas) },
              { id: "vol", label: UNIDADES_FORMULA[formula].volumen, valor: numeroVolumen(elegida.volumen, formula) },
              { id: "valor", label: "Valor S/", valor: elegida.monto != null ? fmtSoles(elegida.monto) : "—" },
            ].map((d) => (
              <div key={d.id} className="min-w-0 bg-[var(--surface-sunken)] px-2 py-2">
                <dt className="text-xs font-semibold text-[var(--text-tertiary)]">{d.label}</dt>
                <dd className="truncate font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">{d.valor}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
