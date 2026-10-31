"use client";

/**
 * Un lado del comparador: el selector de la guardada y su tarjetita con lo
 * que la identifica en el patio (cliente, CCNN, fecha, GTF, especie) y sus
 * cifras congeladas al guardar. Las dos van lado a lado; en el celular, una
 * debajo de la otra.
 */
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { m3DesdePt } from "@/lib/forestal/cubicacion";
import { fmtM3, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { FichaDeGuardada, datosDeLaGuardada } from "./cubicador-detalle-ficha";
import { fechaDeLaGuardada } from "./cubicador-guardadas-tarjeta";

const opcion = (c: CubicacionRegistro) => `${c.nombre} · ${fechaDeLaGuardada(c.fecha)} · ${fmtPt(c.totales.pieTablar)} PT`;

export function LadoDeLaComparacion({ letra, elegida, opciones, onElegir }: {
  letra: "A" | "B";
  elegida: CubicacionRegistro | null;
  /** Todas las guardadas, la más reciente primero. */
  opciones: readonly CubicacionRegistro[];
  onElegir: (id: string) => void;
}) {
  const pt = elegida?.totales.pieTablar ?? 0;
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
          {opciones.map((c) => <option key={c.id} value={c.id}>{opcion(c)}</option>)}
        </select>
      </label>

      {elegida && (
        <>
          <FichaDeGuardada datos={datosDeLaGuardada(elegida)} columnas={2} />
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-[var(--rule-soft)] text-center sm:grid-cols-4">
            {[
              { id: "pt", label: "Pie tablar", valor: fmtPt(pt) },
              { id: "m3", label: "m³", valor: fmtM3(m3DesdePt(pt)) },
              { id: "piezas", label: "Piezas", valor: formatNumber(elegida.totales.piezas) },
              { id: "valor", label: "Valor S/", valor: elegida.valor > 0 ? fmtSoles(elegida.valor) : "—" },
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
