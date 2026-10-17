"use client";

/**
 * Una línea del modal «Llevar esta madera al cubicador», con su ESPECIE a la
 * vista (Brandon, 2026-10-02: «en los lotes ponle la especie … para que luego
 * se pase a distribución con la especie asignada»).
 *
 * Antes la especie viajaba en el bloque pero no se veía: «Lote 20-2026 ·
 * margen» no decía de qué madera era, y el operario no sabía con qué especie
 * iba a aparecer en la distribución hasta llegar allá.
 */

import { Leaf, Ruler, TreePine } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CandidatoDeCapacidad } from "@/lib/forestal/capacidad-a-bloques";

const norm = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * La etiqueta sin la especie del final, SÓLO para dibujarla: la del patio
 * termina en «· TORNILLO» y al lado va el chip «Tornillo». Lo que se siembra
 * sigue siendo la etiqueta entera.
 */
function etiquetaVisible(etiqueta: string, especie: string): string {
  const i = etiqueta.lastIndexOf(" · ");
  if (i < 0 || !especie.trim()) return etiqueta;
  return norm(etiqueta.slice(i + 3)) === norm(especie) ? etiqueta.slice(0, i) : etiqueta;
}

/** La especie como chip; vacía se dice en tono de aviso, no se esconde. */
export function ChipEspecie({ especie, bloques }: { especie: string; bloques?: number }) {
  const nombre = especie.trim();
  if (!nombre) {
    return (
      <span
        title="Llega sin especie: vas a tener que elegirla en la tabla de la distribución"
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--data-warning-500)]/15 px-2 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      >
        <Leaf className="h-3 w-3" aria-hidden /> Sin especie
        {bloques ? <span className="font-mono tabular-nums">· {bloques}</span> : null}
      </span>
    );
  }
  return (
    <span
      title={`Especie ${nombre}: así llega a la distribución`}
      className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
    >
      <Leaf className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{nombre}</span>
      {bloques ? <span className="font-mono tabular-nums">· {bloques}</span> : null}
    </span>
  );
}

export default function FilaCandidato({
  c,
  elegido,
  onAlternar,
  pct,
}: {
  c: CandidatoDeCapacidad;
  elegido: boolean;
  onAlternar: () => void;
  /** El % de la tarjeta, para el chip de la rolliza. */
  pct: number;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 hover:border-[var(--accent)]">
      <input
        type="checkbox"
        checked={elegido}
        onChange={onAlternar}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[var(--rule-base)] accent-[var(--accent)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
          {etiquetaVisible(c.etiqueta, c.especie)}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ChipEspecie especie={c.especie} />
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {c.fuenteLabel}
            {c.permiso ? ` · ${c.permiso}` : ""}
            {c.piezas > 0 ? ` · ${c.piezas} ${c.piezas === 1 ? "pieza" : "piezas"}` : ""}
          </span>
        </span>
      </span>
      {/* m³ arriba y la clase de madera abajo: en 400 px, puestos en fila, le
          dejaban a la etiqueta menos de 70 px. */}
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {fmtM3(c.m3)} m³
        </span>
        {/* El bloque de rolliza pasa por el %, el de aserrada ampara su propio m³. */}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${
            c.tipo === "rolliza"
              ? "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
              : "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          }`}
        >
          {c.tipo === "rolliza" ? (
            <>
              <TreePine className="h-3 w-3" aria-hidden /> Rolliza · {pct} %
            </>
          ) : (
            <>
              <Ruler className="h-3 w-3" aria-hidden /> Ya aserrada
            </>
          )}
        </span>
      </span>
    </label>
  );
}
