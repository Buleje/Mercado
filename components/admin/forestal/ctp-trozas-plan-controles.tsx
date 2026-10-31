"use client";

/**
 * Lo que se elige del plan de aserrío: de qué especie y cuánto cortar hoy.
 *
 * Las especies vienen ordenadas por la troza libre más vieja (la 1.ª es la
 * sugerida); la meta recorre esa fila en orden hasta cumplirse.
 */

import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { OBJETIVO_META, type EspecieLibre, type ObjetivoPlan, type TipoObjetivo } from "@/lib/forestal/plan-aserrio";

const TIPOS: TipoObjetivo[] = ["piezas", "m3", "pt", "dias"];

const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const CHIP_ON = "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

export default function CtpTrozasPlanControles({
  especies,
  elegidas,
  onEspecies,
  objetivo,
  onObjetivo,
  hayRendimiento,
}: {
  especies: readonly EspecieLibre[];
  elegidas: readonly string[];
  onEspecies: (v: string[]) => void;
  objetivo: ObjetivoPlan;
  onObjetivo: (o: ObjetivoPlan) => void;
  hayRendimiento: boolean;
}) {
  const todas = elegidas.length === 0;
  const alternar = (e: string) =>
    onEspecies(elegidas.includes(e) ? elegidas.filter((x) => x !== e) : [...elegidas, e]);
  const meta = OBJETIVO_META[objetivo.tipo];

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">Especie (una corrida suele ser de una sola)</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={todas} onClick={() => onEspecies([])} className={`${CHIP} ${todas ? CHIP_ON : CHIP_OFF}`}>
            Todas
          </button>
          {especies.map((e) => {
            const on = elegidas.includes(e.especie);
            return (
              <button
                key={e.especie}
                type="button"
                aria-pressed={on}
                onClick={() => alternar(e.especie)}
                title={`${e.piezas} libres · ${fmtM3(e.m3)} m³${e.diasMax == null ? "" : ` · la más vieja lleva ${e.diasMax} días`}`}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {e.especie}
                <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  {e.piezas}
                  {e.diasMax == null ? "" : ` · ${e.diasMax} d`}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Meta de la jornada</span>
          <SegmentedControl<TipoObjetivo>
            label="Meta de la jornada"
            size="lg"
            value={objetivo.tipo}
            onChange={(tipo) => onObjetivo({ tipo, valor: OBJETIVO_META[tipo].inicial })}
            options={TIPOS.map((t) => ({
              value: t,
              label: OBJETIVO_META[t].label,
              disabled: t === "pt" && !hayRendimiento,
            }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span className="font-bold">{objetivo.tipo === "dias" ? "Todas las de" : "Hasta"}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={meta.paso}
            value={Number.isFinite(objetivo.valor) ? objetivo.valor : ""}
            onChange={(ev) => onObjetivo({ tipo: objetivo.tipo, valor: ev.target.value === "" ? 0 : Number(ev.target.value) })}
            aria-label={`Meta en ${meta.unidad}`}
            className="h-11 w-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-right font-mono text-base tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
          <span>{meta.unidad}</span>
        </label>
        {!hayRendimiento && (
          <span className="text-xs text-[var(--text-secondary)]">Pies tablares: falta rendimiento del libro.</span>
        )}
      </div>
    </div>
  );
}
