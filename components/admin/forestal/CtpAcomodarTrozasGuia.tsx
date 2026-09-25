"use client";

/**
 * Una guía dentro de «Acomodar trozas en su especie» (ADR-435): el cuadre de
 * cada fila (trozas contra piezas declaradas, m³ de trozas contra m³
 * declarado) y qué troza pasa de qué fila a cuál. Lo que no se mueve va con su
 * porqué en una línea; la explicación larga, en el ⓘ del modal.
 */

import { ArrowRight, Check, TriangleAlert } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  nTrozas,
  porQueNoSeMueve,
  type CuadreDeFila,
  type LadoDelCuadre,
  type PlanDeGuia,
} from "@/lib/forestal/acomodar-trozas";

const TH = "px-2 py-1.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

const m3 = (v: number | null) => (v == null ? "—" : fmtM3(v));
const cuadra = (l: LadoDelCuadre) => l.piezasCuadran && l.cuadre === "cuadra";

/** «0 → 5 de 5»: hoy, cómo queda y lo que declara. En el resultado, sólo «5 de 5». */
function Celda({ antes, despues, declara, soloAhora }: { antes: string; despues: string; declara: string; soloAhora: boolean }) {
  if (soloAhora || antes === despues) {
    return (
      <>
        {despues} <span className="text-[var(--text-tertiary)]">de {declara}</span>
      </>
    );
  }
  return (
    <>
      <span className="text-[var(--text-tertiary)] line-through">{antes}</span>
      <ArrowRight className="mx-1 inline h-3 w-3 text-[var(--text-tertiary)]" aria-label="pasa a" />
      <b className="text-[var(--text-primary)]">{despues}</b> <span className="text-[var(--text-tertiary)]">de {declara}</span>
    </>
  );
}

function FilaDeCuadre({ f, soloAhora }: { f: CuadreDeFila; soloAhora: boolean }) {
  const ok = cuadra(soloAhora ? f.antes : f.despues);
  const lado = soloAhora ? f.antes : f.despues;
  return (
    <tr>
      <td className={`${TD} font-bold text-[var(--text-primary)]`}>{f.especie}</td>
      <td className={NUM}>
        <Celda antes={String(f.antes.trozas)} despues={String(lado.trozas)} declara={String(f.piezasDeclaradas)} soloAhora={soloAhora} />
      </td>
      <td className={NUM}>
        <Celda antes={m3(f.antes.m3)} despues={m3(lado.m3)} declara={fmtM3(f.m3Declarado)} soloAhora={soloAhora} />
      </td>
      <td className={TD}>
        {ok ? (
          <span className="inline-flex items-center gap-1 font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            <Check className="h-3.5 w-3.5" aria-hidden /> cuadra
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> no cuadra
          </span>
        )}
      </td>
    </tr>
  );
}

export default function CtpAcomodarTrozasGuia({
  guia,
  soloAhora,
  abierta,
}: {
  guia: PlanDeGuia;
  /** Después de acomodar: se muestra cómo quedó, sin el «hoy → queda». */
  soloAhora: boolean;
  /** La lista de trozas que se mueven, desplegada (una sola guía) o plegada (tanda). */
  abierta: boolean;
}) {
  const quedan = [...guia.quietas, ...guia.sinFila];
  return (
    <section className="rounded-xl border border-[var(--rule-base)]" aria-label={`Guía ${guia.gtf}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl bg-[var(--surface-sunken)] px-3 py-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">GTF {guia.gtf}</span>
        <span className="text-xs text-[var(--text-secondary)]">
          {soloAhora
            ? `${guia.filas.filter((f) => cuadra(f.antes)).length} de ${guia.filas.length} filas cuadran`
            : guia.mover.length > 0
              ? `${nTrozas(guia.mover.length)} pasan a su fila`
              : "todo en su fila"}
        </span>
      </header>
      <div className="space-y-2 p-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem]">
            <thead>
              <tr className="border-b border-[var(--rule-base)]">
                <th className={TH}>Especie</th>
                <th className={`${TH} text-right`}>Trozas</th>
                <th className={`${TH} text-right`}>m³ de trozas</th>
                <th className={TH}>Cuadre</th>
              </tr>
            </thead>
            <tbody>
              {guia.filas.map((f) => (
                <FilaDeCuadre key={f.id} f={f} soloAhora={soloAhora} />
              ))}
            </tbody>
          </table>
        </div>

        {!soloAhora && guia.mover.length > 0 && (
          <details open={abierta} className="text-sm">
            <summary className="cursor-pointer font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Qué troza pasa a qué fila ({guia.mover.length})
            </summary>
            <ul className="mt-1.5 space-y-1">
              {guia.mover.map((m) => (
                <li key={m.trozaId} className="flex flex-wrap items-center gap-x-2 text-[var(--text-secondary)]">
                  <b className="font-mono text-[var(--text-primary)]">{m.codigo ?? "sin código"}</b>
                  <span>{m.especie ?? "sin especie"}</span>
                  <span className="font-mono tabular-nums">{m3(m.m3)} m³</span>
                  <span className="inline-flex items-center gap-1">
                    fila {m.desde.especie} <ArrowRight className="h-3 w-3" aria-label="a" /> <b className="text-[var(--text-primary)]">{m.hacia.especie}</b>
                  </span>
                  {m.pedazos.length > 0 && <span className="text-xs text-[var(--text-tertiary)]">con sus {m.pedazos.length} pedazos</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {quedan.length > 0 && (
          <div className="rounded-lg bg-[var(--data-warning-500)]/12 px-2.5 py-1.5 text-sm">
            <p className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {quedan.length === 1 ? "1 troza se queda donde está" : `${quedan.length} trozas se quedan donde están`}
            </p>
            <ul className="mt-0.5 space-y-0.5 text-[var(--text-secondary)]">
              {quedan.map((q) => (
                <li key={q.trozaId}>
                  <b className="font-mono text-[var(--text-primary)]">{q.codigo ?? "sin código"}</b> {q.especie ?? ""} (fila {q.fila.especie}):{" "}
                  {porQueNoSeMueve(q)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
