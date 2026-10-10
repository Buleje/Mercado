"use client";

/**
 * Cotejo del patio contra la GTF — sólo en Smalian: la guía declara m³ y no
 * se compara pie tablar con metros cúbicos. En Oxapampina queda una línea con
 * ⓘ y el atajo para volver a Smalian.
 *
 * Las guías del libro, para cotejar contra el volumen DECLARADO de verdad: el
 * «según la GTF» se tipeaba a mano y el número contra el que se decide si un
 * camión llegó corto salía de la memoria del que carga, no del libro. Es sólo
 * LECTURA: mandar estas trozas al libro toca las invariantes del ingreso y
 * necesita su propio ADR.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Scale } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { compararConGtf } from "@/lib/forestal/cubicacion-trozas";
import { formatNumber } from "@/lib/format";

/** Lo que hace falta de un asiento del libro para cotejar contra su guía. */
interface GuiaLibro {
  id: string;
  gtfNumber: string;
  volumeM3: number | string;
  providerName?: string | null;
  speciesCommonName?: string | null;
  /** Cuántas trozas tiene ya cargadas — para no volver a medir lo medido. */
  trozasCount?: number | null;
}

const fmtM3 = (v: number) => formatNumber(v, 3);

/** Estado del cotejo: las guías del libro, la elegida y los m³ declarados (recordados por tenant). */
export function useCotejoGtf(claveBase: string, totalM3: number) {
  const [gtfM3, setGtfM3] = useState("");
  useEffect(() => {
    try { const g = localStorage.getItem(`${claveBase}-gtf`); if (g) setGtfM3(g); } catch { /* ignore */ }
  }, [claveBase]);
  useEffect(() => { try { localStorage.setItem(`${claveBase}-gtf`, gtfM3); } catch { /* ignore */ } }, [claveBase, gtfM3]);

  const [guias, setGuias] = useState<GuiaLibro[]>([]);
  const [guiaId, setGuiaId] = useState("");
  const [guiasError, setGuiasError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/wood-entries?limit=100", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { entries?: GuiaLibro[] }) => { if (vivo) setGuias(j.entries ?? []); })
      .catch((err) => {
        /* El cubicador funciona igual sin el libro: se sigue pudiendo tipear el
           volumen a mano. Se dice, no se traga. */
        if (vivo) setGuiasError(String(err instanceof Error ? err.message : err));
      });
    return () => { vivo = false; };
  }, []);
  const guiaElegida = useMemo(() => guias.find((g) => g.id === guiaId) ?? null, [guias, guiaId]);
  /* Al elegir una guía manda su volumen declarado; soltarla devuelve el campo. */
  useEffect(() => {
    if (guiaElegida) setGtfM3(String(Number(guiaElegida.volumeM3) || 0));
  }, [guiaElegida]);

  const cmpGtf = useMemo(() => compararConGtf(totalM3, Number(gtfM3) || 0), [totalM3, gtfM3]);
  return { gtfM3, setGtfM3, guias, guiaId, setGuiaId, guiasError, guiaElegida, cmpGtf };
}

export type CotejoGtf = ReturnType<typeof useCotejoGtf>;

export default function CotejoGtfBloque({ cotejo, oxapampina, onUsarSmalian }: {
  cotejo: CotejoGtf;
  oxapampina: boolean;
  onUsarSmalian: () => void;
}) {
  const { gtfM3, setGtfM3, guias, guiaId, setGuiaId, guiasError, guiaElegida, cmpGtf } = cotejo;

  if (oxapampina) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2.5 text-sm text-[var(--text-secondary)]">
        <Scale className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span>Sin cotejo con la GTF en Oxapampina</span>
        <InfoTip
          title="¿Por qué no se compara con la guía?"
          what={<span>La GTF declara m³ por Smalian (Ø en cm, largo en m). Este lote está en pie tablar Oxapampa, con otras medidas: no hay cuenta honesta que pase uno al otro.</span>}
          affects={<span>Para saber si el camión llegó corto, cubícalo en Smalian: es otro lote, éste no se pierde.</span>}
        />
        <button
          type="button"
          onClick={onUsarSmalian}
          className="ml-auto rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          Cotejar en Smalian
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Scale className="h-4 w-4 text-[var(--accent)]" /> Según la GTF
          </span>
          {/* Elegir la guía del libro en vez de tipear su volumen. */}
          {guias.length > 0 && (
            <select
              value={guiaId}
              onChange={(e) => setGuiaId(e.target.value)}
              aria-label="Guía del libro contra la que comparar"
              className="h-9 max-w-[18rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Escribir el volumen a mano</option>
              {guias.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.gtfNumber}
                  {g.providerName ? ` · ${g.providerName}` : ""} · {fmtM3(Number(g.volumeM3) || 0)} m³
                  {g.trozasCount ? ` · ${g.trozasCount} trozas ya cargadas` : ""}
                </option>
              ))}
            </select>
          )}
          <input
            type="number"
            inputMode="decimal"
            value={gtfM3}
            onChange={(e) => setGtfM3(e.target.value)}
            disabled={!!guiaElegida}
            placeholder="0.000"
            aria-label="Metros cúbicos declarados en la guía"
            className="h-9 w-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
          />
          <span className="text-sm text-[var(--text-tertiary)]">m³ declarados</span>
        </div>
        {cmpGtf ? (
          <div className="text-right">
            <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Patio vs. guía</div>
            <div className={`font-mono text-xl font-extrabold tabular-nums ${Math.abs(cmpGtf.deltaPct) <= 2 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : Math.abs(cmpGtf.deltaPct) <= 5 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>
              {cmpGtf.deltaM3 >= 0 ? "+" : ""}{fmtM3(cmpGtf.deltaM3)} m³ ({cmpGtf.deltaPct >= 0 ? "+" : ""}{cmpGtf.deltaPct}%)
            </div>
            <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{cmpGtf.deltaM3 < 0 ? "llegó menos de lo declarado" : "llegó más de lo declarado"}</div>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-tertiary)]">
            {guiasError
              ? "No se pudo leer el libro — escribe los m³ de la guía a mano para comparar."
              : "Elige la guía del libro (o escribe los m³) para comparar con lo cubicado."}
          </p>
        )}
      </div>

      {guiaElegida && (guiaElegida.trozasCount ?? 0) > 0 && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Esa guía ya tiene {guiaElegida.trozasCount} trozas cargadas en el libro: si las estás volviendo a
          medir, mira primero el detalle de la guía para no contar la misma madera dos veces.
        </p>
      )}
    </>
  );
}
