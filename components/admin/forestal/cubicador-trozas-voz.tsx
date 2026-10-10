"use client";

/**
 * Panel de carga del Cubicador de trozas: fórmula, micrófono, especie, el
 * caption en vivo agrupado en PARES (un Ø) o TRÍOS (dos Ø), la última troza
 * con «Deshacer» y la carga a mano. Las unidades salen de la fórmula del lote.
 */
import { useMemo, useState } from "react";
import { Check, Mic, MicOff, Plus, RotateCcw, Ruler, Settings2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { numerosDeTroza } from "@/lib/forestal/cubicacion";
import { prepararPitido } from "@/lib/forestal/pitido";
import {
  diametroUnico, UNIDADES_FORMULA, volumenDe, type DiametrosPorTroza, type FormulaTrozas,
} from "@/lib/forestal/cubicacion-trozas-formula";
import type { VozContinua } from "@/hooks/use-voz-continua";
import { formatNumber } from "@/lib/format";
import FormulaTrozasControl from "./cubicador-trozas-formula";
import type { FilaTroza } from "./cubicador-trozas-tabla";

/** Cómo se dicta, con un ejemplo en palabras — por fórmula y por cantidad de Ø. */
const EJEMPLO: Record<FormulaTrozas, Record<DiametrosPorTroza, { dicho: string; quiere: string }>> = {
  smalian: {
    1: { dicho: "cuarenta tres punto cinco", quiere: "Ø 40 cm al medio · largo 3.5 m" },
    2: { dicho: "cuarenta cuarenta y cinco tres punto cinco", quiere: "Ø menor 40 cm · Ø mayor 45 cm · largo 3.5 m" },
  },
  oxapampina: {
    1: { dicho: "veinte doce", quiere: "Ø 20″ al medio · largo 12 pies" },
    2: { dicho: "dieciocho veintidós doce", quiere: "Ø 18″ y 22″ (se promedian) · largo 12 pies" },
  },
};

export default function PanelVozTrozas({
  voz, paused, formula, onFormula, diametros, onDiametros, especie, onEspecie, especiesCatalogo, onAbrirEspecies,
  lastAdded, onDeshacer, onAgregar,
}: {
  voz: VozContinua;
  paused: boolean;
  formula: FormulaTrozas;
  onFormula: (f: FormulaTrozas) => void;
  diametros: DiametrosPorTroza;
  onDiametros: (d: DiametrosPorTroza) => void;
  especie: string;
  onEspecie: (e: string) => void;
  especiesCatalogo: readonly string[];
  onAbrirEspecies: () => void;
  lastAdded: FilaTroza | null;
  onDeshacer: () => void;
  onAgregar: (d1: number, d2: number, largo: number) => void;
}) {
  const u = UNIDADES_FORMULA[formula];
  const paso = diametros === 1 ? 2 : 3;
  const ejemplo = EJEMPLO[formula][diametros];

  /* Caption en vivo agrupado como se va a guardar: pares o tríos. */
  const liveGroups = useMemo(() => {
    if (!voz.listening || !voz.liveText) return null;
    const nums = numerosDeTroza(voz.liveText);
    const grupos: number[][] = [];
    let i = 0;
    for (; i + paso <= nums.length; i += paso) grupos.push(nums.slice(i, i + paso));
    return { grupos, resto: nums.slice(i) };
  }, [voz.listening, voz.liveText, paso]);
  const faltan = liveGroups ? paso - liveGroups.resto.length : 0;

  const [manual, setManual] = useState({ d1: "", d2: "", largo: "" });
  const addManual = () => {
    const d1 = Number(manual.d1), l = Number(manual.largo);
    const d2 = diametros === 1 ? d1 : Number(manual.d2) || d1;
    if (!(d1 > 0 && l > 0)) return;
    onAgregar(d1, d2, l);
    setManual({ d1: "", d2: "", largo: "" });
  };

  const medidasUltima = lastAdded
    ? diametros === 1
      ? `Ø${diametroUnico(lastAdded)}${u.diametroCorto}`
      : `Ø${lastAdded.d1}/${lastAdded.d2}${u.diametroCorto}`
    : "";

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Ruler className="h-4 w-4 text-[var(--accent)]" /> Cubicador de trozas (rolliza · {u.nombre})
        </CardTitle>
        <FormulaTrozasControl formula={formula} onFormula={onFormula} diametros={diametros} onDiametros={onDiametros} />
      </div>
      {voz.supported ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={() => { prepararPitido(); voz.toggle(); }}
            aria-pressed={voz.listening}
            aria-label={voz.listening ? "Detener el dictado" : "Empezar a dictar"}
            className={`inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 transition ${voz.listening ? "animate-pulse border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]" : "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:brightness-95"}`}
          >
            {voz.listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </button>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {paused ? "⏸ En pausa — di «continúa» para seguir" : voz.listening ? "Escuchando… dicta cada troza y una micro-pausa la guarda" : "Toca el micrófono y dicta las trozas"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              {diametros === 1 ? "Dos" : "Tres"} números por troza: <span className="font-semibold text-[var(--text-secondary)]">&ldquo;{ejemplo.dicho}&rdquo;</span> = {ejemplo.quiere}.
            </p>
            <label className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Especie</span>
              <select value={especie} onChange={(ev) => onEspecie(ev.target.value)} className="bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none">
                <option value="">Sin especie</option>
                {especiesCatalogo.map((s) => <option key={s} value={s}>{s}</option>)}
                {/* Lo ya elegido no se pierde si el catálogo dejó de ofrecerlo. */}
                {especie && !especiesCatalogo.includes(especie) && <option value={especie}>{especie}</option>}
              </select>
              {/* El catálogo se edita acá: la troza rara aparece en el patio, no en otra pantalla. */}
              <button
                type="button"
                onClick={onAbrirEspecies}
                aria-label="Especies del aserradero: crear, renombrar, quitar"
                title="Especies del aserradero: crear, renombrar, quitar"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
              >
                <Settings2 className="h-4 w-4" aria-hidden />
              </button>
            </label>
            {voz.listening && (
              <div className="mt-2 min-h-[2.75rem] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
                {liveGroups && (liveGroups.grupos.length > 0 || liveGroups.resto.length > 0) ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {liveGroups.grupos.map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md bg-[var(--data-success-100)] px-2 py-0.5 font-mono text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
                        {t.join(" · ")}
                      </span>
                    ))}
                    {liveGroups.resto.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--data-warning-500)] px-2 py-0.5 font-mono text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                        {liveGroups.resto.join(" · ")}<span className="ml-1 opacity-60">· falta{faltan === 1 ? " 1" : `n ${faltan}`}</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--text-tertiary)]">escuchando…</div>
                )}
              </div>
            )}
            {voz.errMsg && (
              <p className="mt-2 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                {voz.errMsg}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          Este navegador no soporta dictado por voz (usa Chrome). Puedes cargar las trozas a mano abajo.
        </p>
      )}

      {lastAdded && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2 dark:bg-[var(--data-success-500)]/12">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            <Check className="h-4 w-4" />
            Agregada: {medidasUltima} × {lastAdded.largo} {u.largo}{lastAdded.especie ? ` · ${lastAdded.especie}` : ""}
            <span className="font-mono">= {formatNumber(volumenDe(lastAdded, formula), u.decimales)} {u.volumen}</span>
          </span>
          <button type="button" onClick={onDeshacer} className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95 dark:text-[var(--data-success-500)]">
            <RotateCcw className="h-3.5 w-3.5" /> Deshacer
          </button>
        </div>
      )}

      {/* Carga manual */}
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--rule-soft)] pt-3">
        {diametros === 1 ? (
          <CampoNum label={`Ø al medio (${u.diametro})`} value={manual.d1} onChange={(v) => setManual({ ...manual, d1: v })} />
        ) : (
          <>
            <CampoNum label={`Ø menor (${u.diametro})`} value={manual.d1} onChange={(v) => setManual({ ...manual, d1: v })} />
            <CampoNum label={`Ø mayor (${u.diametro})`} value={manual.d2} onChange={(v) => setManual({ ...manual, d2: v })} placeholder="= menor" />
          </>
        )}
        <CampoNum label={`Largo (${u.largo})`} value={manual.largo} onChange={(v) => setManual({ ...manual, largo: v })} />
        <button type="button" onClick={addManual} className="inline-flex h-10 items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
          <Plus className="h-4 w-4" /> Agregar a mano
        </button>
      </div>
    </div>
  );
}

function CampoNum({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 w-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
    </label>
  );
}
