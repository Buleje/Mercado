"use client";

/**
 * Las dos vistas del modal «Conteos del patio» (`CtpConteosPatio`): el
 * historial —una fila por acta— y el detalle de un acta —qué faltó, qué sobró
 * y qué códigos no eran de ninguna troza—.
 */

import { AlertTriangle, ChevronRight, Loader2 } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { agruparFaltantes, diaDelConteo, fraseDelConteo } from "@/lib/forestal/conteo-patio-historial";
import { textoDias } from "@/lib/forestal/conteo-patio-pasos";
import type { ActaConteoDetalle, ResumenActaConteo } from "@/lib/forestal/conteo-patio-guardado";

const m3 = (v: number | null) => (v == null ? "—" : fmtM3(v));
/** «QA Admin» (nombre) y «qaadmin» (usuario) son la misma persona: no se repite. */
const mismaPersona = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9ñ]/g, "") === b.toLowerCase().replace(/[^a-z0-9ñ]/g, "");
const horas = (r: ResumenActaConteo) =>
  r.terminadoEn ? `${formatTime(r.iniciadoEn)} a ${formatTime(r.terminadoEn)}` : `desde ${formatTime(r.iniciadoEn)}`;

/** Una cifra que pide mirar (faltó o sobró algo) va en el color del aviso. */
const cifra = (n: number) =>
  cn("tabular-nums", n > 0 ? "font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]");

export function Cargando({ texto }: { texto: string }) {
  return (
    <p className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {texto}
    </p>
  );
}

export function ErrorConReintento({ error, onReintentar }: { error: string; onReintentar: () => void }) {
  return (
    <div className="space-y-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 p-3">
      <p className="flex items-start gap-2 text-sm font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
      </p>
      <button
        type="button"
        onClick={onReintentar}
        className="inline-flex h-10 items-center rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]"
      >
        Reintentar
      </button>
    </div>
  );
}

export function HistorialConteos({
  conteos,
  onVer,
}: {
  conteos: readonly ResumenActaConteo[];
  onVer: (id: string) => void;
}) {
  return (
    <>
      {/* ≥640 px: la tabla, una fila por acta. */}
      <DataTable wrapperClassName="hidden sm:block" data-historial-conteos>
        <thead>
          <tr>
            <th>Día</th>
            <th>Contó</th>
            <th className="text-right">Contadas</th>
            <th className="text-right">Faltan</th>
            <th className="text-right">Sobran</th>
            <th className="text-right">Sin troza</th>
            <th className="text-right">m³ contado</th>
            <th aria-label="Ver el acta" />
          </tr>
        </thead>
        <tbody>
          {conteos.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="block font-bold">{diaDelConteo(r.fecha)}</span>
                <span className="block text-[var(--text-secondary)]">{horas(r)}</span>
              </td>
              <td>{r.hechoPor || "—"}</td>
              <td className="text-right tabular-nums">
                {r.contadas} <span className="text-[var(--text-secondary)]">de {r.esperadas}</span>
              </td>
              <td className={cn("text-right", cifra(r.faltan))}>{r.faltan}</td>
              <td className={cn("text-right", cifra(r.sobrantes))}>{r.sobrantes}</td>
              <td className={cn("text-right", cifra(r.sorpresas))}>{r.sorpresas}</td>
              <td className="text-right tabular-nums">
                {m3(r.m3Contado)} <span className="text-[var(--text-secondary)]">de {m3(r.m3Esperado)}</span>
              </td>
              <td className="text-right">
                <button
                  type="button"
                  onClick={() => onVer(r.id)}
                  aria-label={`Ver el acta del ${diaDelConteo(r.fecha)}`}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2.5 font-bold text-[var(--text-primary)] hover:border-[var(--accent)]"
                >
                  Ver <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      {/* <640 px: una tarjeta por acta, toda tocable. */}
      <ul className="space-y-2 sm:hidden">
        {conteos.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onVer(r.id)}
              className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-left hover:border-[var(--accent)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text-primary)]">
                  {diaDelConteo(r.fecha)} · {r.hechoPor || "—"}
                </span>
                <span className="block text-sm tabular-nums text-[var(--text-secondary)]">
                  {r.contadas} de {r.esperadas} · {fraseDelConteo(r)}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Bloque({ titulo, n, children }: { titulo: string; n: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
        {titulo} <span className="tabular-nums text-[var(--text-secondary)]">({n})</span>
      </CardTitle>
      {n === 0 ? <p className="text-sm text-[var(--text-secondary)]">Ninguna.</p> : children}
    </section>
  );
}

const CHIP = "rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-sm tabular-nums text-[var(--text-primary)]";

export function DetalleConteo({ acta }: { acta: ActaConteoDetalle }) {
  const r = acta.resumen;
  const grupos = agruparFaltantes(acta.faltantes);
  return (
    <div className="space-y-4" data-detalle-conteo={r.id}>
      <div className="space-y-1">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Conteo del {diaDelConteo(r.fecha)}
        </CardTitle>
        <p className="text-sm text-[var(--text-secondary)]">
          {horas(r)} · contó {r.hechoPor || "—"}
          {r.registradoPor && mismaPersona(r.registradoPor, r.hechoPor) === false ? ` · lo subió ${r.registradoPor}` : ""}
        </p>
        <p className="text-sm tabular-nums text-[var(--text-primary)]">
          <b>{r.contadas}</b> de {r.esperadas} contadas · {m3(r.m3Contado)} de {m3(r.m3Esperado)} m³ ·{" "}
          <span className={cifra(r.faltan + r.sobrantes + r.sorpresas)}>{fraseDelConteo(r)}</span>
        </p>
        {r.truncado && (
          <p className="text-sm font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
            El patio era más grande de lo que la tablet trajo: algún sobrante puede ser una troza que sí estaba.
          </p>
        )}
        {r.notas && <p className="text-sm text-[var(--text-secondary)]">Notas: {r.notas}</p>}
      </div>

      <Bloque titulo="Faltaron" n={acta.faltantes.length}>
        <div className="space-y-2">
          {grupos.map((g) => (
            <div key={g.especie} className="rounded-xl border border-[var(--rule-base)] p-2.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-bold text-[var(--text-primary)]">
                <span>{g.especie}</span>
                <span className="tabular-nums text-[var(--text-secondary)]">
                  {g.piezas.length} · {fmtM3(g.m3)} m³
                </span>
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {g.piezas.map((p) => {
                  /* Cancha y días: actas desde el 05-10 (las anteriores no los guardaron). */
                  const donde = [p.cancha, textoDias(p.dias ?? null)].filter(Boolean).join(" · ");
                  return (
                    <li key={p.id} className={CHIP} title={p.gtfNumber ? `Guía ${p.gtfNumber}` : undefined}>
                      {p.codigo}
                      {donde && <span className="font-sans text-[var(--text-secondary)]"> · {donde}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Bloque>

      <Bloque titulo="Sobraron (el libro dice que no están)" n={acta.sobrantes.length}>
        <ul className="space-y-1.5">
          {acta.sobrantes.map((s) => (
            <li key={`${s.trozaId}-${s.en}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className={CHIP}>{s.codigo}</span>
              <span className="text-[var(--text-primary)]">
                {[s.especieComun, s.gtfNumber && `guía ${s.gtfNumber}`].filter(Boolean).join(" · ")}
              </span>
              <span className="font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">{s.motivoTexto}</span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Códigos que no son de ninguna troza" n={acta.sorpresas.length}>
        <ul className="flex flex-wrap gap-1.5">
          {acta.sorpresas.map((s) => (
            <li key={`${s.codigo}-${s.en}`} className={CHIP}>
              {s.codigo}
            </li>
          ))}
        </ul>
      </Bloque>
    </div>
  );
}
