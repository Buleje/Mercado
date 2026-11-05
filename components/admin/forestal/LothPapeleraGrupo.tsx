"use client";

/**
 * LothPapeleraGrupo — un borrado de la papelera del libro: casilla (marca todas
 * sus líneas), cuándo y quién lo borró, cuánto fue por sección y, plegadas, las
 * líneas una por una para recuperar sólo algunas.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { formatDateNumeric, formatNumber } from "@/lib/format";
import { esLimpiezaDePruebas, type BorradoDelLibro } from "@/lib/forestal/loth-papelera";
import { nombreSeccion, pluralN } from "./loth-borrar-piezas";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const PARTES_LIMA = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** «7 de octubre de 2026 · 09:34», en hora de Lima. Sólo se toman los NÚMEROS del Intl: el mes va escrito a mano. */
export function fechaHoraLima(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "—";
  const p = Object.fromEntries(PARTES_LIMA.formatToParts(t).map((x) => [x.type, x.value]));
  const mes = MESES[Number(p.month) - 1] ?? p.month;
  return `${Number(p.day)} de ${mes} de ${p.year} · ${p.hour}:${p.minute}`;
}

export default function LothPapeleraGrupo({
  grupo,
  seleccion,
  deshabilitado,
  onAlternarGrupo,
  onAlternarLinea,
}: {
  grupo: BorradoDelLibro;
  seleccion: ReadonlySet<string>;
  deshabilitado: boolean;
  onAlternarGrupo: (g: BorradoDelLibro) => void;
  onAlternarLinea: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const casilla = useRef<HTMLInputElement>(null);

  const marcadas = grupo.lineas.filter((l) => seleccion.has(l.id)).length;
  const todas = marcadas === grupo.lineas.length;
  const cuando = fechaHoraLima(grupo.hasta);

  /* «Algunas»: la casilla del grupo queda a medias (no hay atributo HTML para eso). */
  useEffect(() => {
    if (casilla.current) casilla.current.indeterminate = marcadas > 0 && !todas;
  }, [marcadas, todas]);

  return (
    <li className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex items-start gap-1 p-2 sm:p-3">
        <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            ref={casilla}
            type="checkbox"
            checked={todas}
            disabled={deshabilitado}
            onChange={() => onAlternarGrupo(grupo)}
            aria-label={`Marcar todo lo borrado el ${cuando}`}
            className="h-5 w-5 accent-[var(--accent)]"
          />
        </label>

        <div className="min-w-0 flex-1 py-1.5">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{cuando}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {pluralN(grupo.lineas.length, "línea", "líneas")} · {formatNumber(grupo.m3, 3)} m³
            {grupo.por && <> · por {grupo.por}</>}
          </p>
          {esLimpiezaDePruebas(grupo.por) && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              Limpieza de datos de prueba: no lo devuelvas al libro.
            </p>
          )}
          <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Por sección">
            {grupo.porSeccion.map((s) => (
              <li
                key={s.section}
                className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-secondary)]"
              >
                {formatNumber(s.n)} {nombreSeccion(s.section)}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          {abierto ? "Ocultar" : "Ver líneas"}
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      {abierto && (
        <div className="border-t border-[var(--rule-base)] p-2 sm:p-3">
          <DataTable stickyHeader wrapperClassName="max-h-80 overflow-y-auto">
            <thead>
              <tr>
                <th className="w-10">
                  <span className="sr-only">Marcar</span>
                </th>
                <th>N.º</th>
                <th>Sección</th>
                <th>Código</th>
                <th>Especie</th>
                <th className="text-right">m³</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {grupo.lineas.map((l) => (
                <tr key={l.id}>
                  <td>
                    <label className="-m-3 flex cursor-pointer items-center justify-center p-3">
                      <input
                        type="checkbox"
                        checked={seleccion.has(l.id)}
                        disabled={deshabilitado}
                        onChange={() => onAlternarLinea(l.id)}
                        aria-label={`Marcar la línea N.º ${l.lineNo} de ${nombreSeccion(l.section)}`}
                        className="h-5 w-5 accent-[var(--accent)]"
                      />
                    </label>
                  </td>
                  <td className="tabular-nums">{l.lineNo}</td>
                  <td>{nombreSeccion(l.section)}</td>
                  <td className="font-mono">
                    {l.codigo ?? "—"}
                    {l.status === "anulado" && (
                      <span className="ml-2 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-sans text-xs font-semibold text-[var(--text-secondary)]">
                        anulada
                      </span>
                    )}
                  </td>
                  <td>{l.speciesCommon ?? "—"}</td>
                  <td className="text-right font-mono tabular-nums">
                    {l.volumeM3 != null ? formatNumber(l.volumeM3, 3) : "—"}
                  </td>
                  <td className="whitespace-nowrap tabular-nums">
                    {formatDateNumeric(l.entryDate, { soloFecha: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </li>
  );
}
