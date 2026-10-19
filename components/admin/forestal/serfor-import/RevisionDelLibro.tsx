"use client";

/**
 * Qué se va a importar y qué revisar antes: las secciones reconocidas (en el
 * orden en que se escriben), las hojas que no se reconocen, las primeras filas
 * incompletas con su archivo y fila, y los avisos —los de la cadena y los que
 * sólo aparecen ENTRE archivos (`ctp-import-entre-archivos.ts`)—.
 *
 * Todo sale del archivo, sin pedirle nada al servidor: se ve ANTES del botón.
 */

import { AlertTriangle, CheckCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TITULO_FORMATO, type FormatoCtp } from "@/lib/forestal/ctp-formatos-serfor";
import type { AvisoEntreArchivos } from "@/lib/forestal/ctp-import-entre-archivos";
import { etiquetaDe, type ArchivoCargado } from "./use-archivos-del-libro";

type AvisoDeCadena = { lote: string; nivel: string; mensaje: string };

export default function RevisionDelLibro({
  ordenados,
  ignoradas,
  variosArchivos,
  avisosDeCadena,
  avisosEntreArchivos,
}: {
  ordenados: readonly ArchivoCargado[];
  ignoradas: readonly string[];
  /** Con un solo archivo, nombrarlo en cada línea es ruido. */
  variosArchivos: boolean;
  avisosDeCadena: readonly AvisoDeCadena[];
  avisosEntreArchivos: readonly AvisoEntreArchivos[];
}) {
  if (ordenados.length === 0) return null;
  /* Una línea por sección aunque traiga varios archivos: el orden que importa es el de las secciones. */
  const secciones: { formato: FormatoCtp; listas: number; malas: number; archivos: number; faltan: Set<string> }[] = [];
  for (const a of ordenados) {
    let s = secciones.find((x) => x.formato === a.formato);
    if (!s) secciones.push((s = { formato: a.formato, listas: 0, malas: 0, archivos: 0, faltan: new Set() }));
    const listas = a.seccion.parseadas.filter((f) => f.problemas.length === 0).length;
    s.listas += listas;
    s.malas += a.seccion.parseadas.length - listas;
    s.archivos += 1;
    a.faltantes.forEach((x) => s.faltan.add(x));
  }
  const incompletas = ordenados
    .flatMap((a) => a.seccion.parseadas.filter((f) => f.problemas.length > 0).map((f) => ({ a, f })))
    .slice(0, 5);
  const avisos = [
    ...avisosEntreArchivos.map((a) => ({ nivel: a.nivel, lote: "—", mensaje: a.mensaje })),
    ...avisosDeCadena,
  ];

  return (
    <>
      <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4">
        <p className="text-base font-extrabold text-[var(--text-primary)]">
          {secciones.length === 1 ? "1 sección reconocida" : `${secciones.length} secciones reconocidas`}
          <span className="ml-2 text-sm font-semibold text-[var(--text-tertiary)]">· se importan en este orden</span>
        </p>
        {secciones.map((s, i) => (
          <div key={s.formato} className="flex flex-wrap items-baseline gap-2 text-base">
            <span className="w-5 shrink-0 text-sm font-bold tabular-nums text-[var(--text-tertiary)]">{i + 1}.</span>
            <CheckCircle className="h-4 w-4 shrink-0 text-[var(--data-success)]" aria-hidden />
            <strong className="text-[var(--text-primary)]">{TITULO_FORMATO[s.formato]}</strong>
            <span className="tabular-nums text-[var(--text-secondary)]">
              {s.listas} filas{s.archivos > 1 ? ` · ${s.archivos} archivos` : ""}
            </span>
            {s.malas > 0 && (
              <span className="tabular-nums font-semibold text-[var(--data-warning)]">
                · {s.malas} incompleta{s.malas === 1 ? "" : "s"}
              </span>
            )}
            {s.faltan.size > 0 && (
              <span className="text-sm font-semibold text-[var(--data-warning)]">· faltan columnas: {[...s.faltan].join(", ")}</span>
            )}
          </div>
        ))}

        {ignoradas.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-[var(--data-warning)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-warning)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex flex-wrap items-center gap-1.5">
              {ignoradas.length === 1 ? "Esta hoja tiene datos" : "Estas hojas tienen datos"} pero no reconozco su formato:{" "}
              <strong>{ignoradas.join(", ")}</strong>. No se van a importar.
              <InfoTip icono="ayuda" title="Hoja sin reconocer" what="Revisa que los nombres de las columnas sean los del SNIFFS." />
            </span>
          </p>
        )}

        {/* Las primeras filas con problema, con su número de Excel (y su
            archivo, si hay varios): sin eso hay que buscar a ojo. */}
        {incompletas.map(({ a, f }) => (
          <p key={`${a.id}-${f.fila}`} className="text-sm text-[var(--data-warning)]">
            {TITULO_FORMATO[a.formato]}
            {variosArchivos ? ` (${etiquetaDe(a)})` : ""}, fila {f.fila}: {f.problemas.join(" · ")}
          </p>
        ))}
      </div>

      {/* ── Lo que un fiscalizador levantaría, y los choques entre archivos ── */}
      {avisos.length > 0 && (
        <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4" data-avisos-import>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Revisa esto antes de importar</p>
          {avisos.slice(0, 8).map((a, i) => (
            <p
              key={`${a.lote}-${i}`}
              className={`flex items-start gap-2 text-sm font-semibold ${
                a.nivel === "error" ? "text-[var(--data-error)]" : "text-[var(--data-warning)]"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {a.lote !== "—" && <strong>Lote {a.lote}: </strong>}
                {a.mensaje}
              </span>
            </p>
          ))}
          {avisos.length > 8 && <p className="text-sm text-[var(--text-tertiary)]">y {avisos.length - 8} más…</p>}
        </div>
      )}
    </>
  );
}
