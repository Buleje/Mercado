"use client";

/**
 * «Ya recibidas en el aserradero» — la primera puerta de «Importar guías
 * despachadas» (ADR-461): las guías SERFOR que el Libro CTP ya recibió
 * (`WoodEntry.serforGtf`) y todavía no están en el Libro TH, agrupadas por el
 * título habilitante que dice la guía. Se eligen varias; la ficha guardada del
 * ingreso es la fuente (no se vuelve a consultar SERFOR).
 */

import { useId } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import type { GrupoCandidatas } from "@/lib/forestal/loth-importar-guia-tipos";
import type { ImportarGuias } from "./hooks/use-importar-guias";
import { ChipPermiso } from "./LothImportarGuiasPermiso";
import { Btn } from "./ctp-shared";

const CASILLA =
  "h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed";

export default function LothImportarGuiasRecibidas({ s }: { s: ImportarGuias }) {
  const { cargando, error, datos } = s.candidatas;

  if (cargando && !datos)
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las guías que ya recibió
        el aserradero…
      </p>
    );
  if (error)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"
      >
        {error}
        <Btn size="sm" variant="secondary" onClick={() => void s.cargarCandidatas()}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </Btn>
      </div>
    );
  if (!datos || datos.total === 0)
    return (
      <p className="p-4 text-sm text-[var(--text-secondary)]">
        No hay guías recibidas en el aserradero que falten en este libro
        {datos?.yaEnElLibro ? ` (${datos.yaEnElLibro} ya están)` : ""}
        {datos?.ilegibles ? `; ${datos.ilegibles} con la ficha de SERFOR dañada no se listan` : ""}. Trae otras por N° de
        registro o con una foto.
      </p>
    );

  const todas = datos.grupos.flatMap((g) =>
    g.guias.filter((x) => !x.anulada).map((x) => x.woodEntryId),
  );
  const elegidasTodas = todas.length > 0 && todas.every((id) => s.elegidas.has(id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span>
          <b className="text-[var(--text-primary)]">{datos.total}</b>{" "}
          {datos.total === 1 ? "guía recibida" : "guías recibidas"} sin pasar al libro
          {datos.yaEnElLibro > 0 && ` · ${datos.yaEnElLibro} ya están`}
          {(datos.ilegibles ?? 0) > 0 && ` · ${datos.ilegibles} con la ficha dañada (tráelas por N° de registro)`}
        </span>
        <InfoTip
          title="Guías ya recibidas"
          what="Las guías de SERFOR que el Libro CTP del aserradero ya recibió y que todavía no figuran como despacho en este Libro TH. Se agrupan por el título habilitante que dice la guía."
          affects="Al importarlas se asientan sus trozas, la tala referencial (si corresponde) y el despacho con esa guía, en el permiso que le toca."
          example="Las 21 guías de 10-HUA-PUE/PER-FMP-2026-007 entran juntas a ese PMFI."
        />
        <Btn
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => s.alternar(todas, !elegidasTodas)}
        >
          {elegidasTodas ? "Soltar todas" : `Elegir todas (${todas.length})`}
        </Btn>
      </div>
      {datos.grupos.map((g) => (
        <GrupoRecibidas key={g.titulo} g={g} s={s} />
      ))}
    </div>
  );
}

function GrupoRecibidas({ g, s }: { g: GrupoCandidatas; s: ImportarGuias }) {
  const id = useId();
  const ids = g.guias.filter((x) => !x.anulada).map((x) => x.woodEntryId);
  const marcadas = ids.filter((x) => s.elegidas.has(x)).length;
  const todas = ids.length > 0 && marcadas === ids.length;

  return (
    <section
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-labelledby={id}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--rule-soft)] px-3 py-2">
        <input
          type="checkbox"
          className={CASILLA}
          checked={todas}
          ref={(el) => {
            if (el) el.indeterminate = marcadas > 0 && !todas;
          }}
          disabled={ids.length === 0}
          onChange={() => s.alternar(ids, !todas)}
          aria-label={`Elegir las ${ids.length} guías de ${g.titulo}`}
        />
        <span
          id={id}
          className="font-mono text-sm font-bold text-[var(--text-primary)] [overflow-wrap:anywhere]"
        >
          {g.titulo}
        </span>
        <ChipPermiso permiso={g.permiso} />
        <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">{g.titular}</span>
        <span className="ml-auto text-sm tabular-nums text-[var(--text-secondary)]">
          {g.guias.length} {g.guias.length === 1 ? "guía" : "guías"} · {g.piezas} trozas ·{" "}
          <span className="font-mono">{fmtM3(g.volumenM3)} m³</span>
        </span>
      </header>
      {/* A 400 px la tabla sigue siendo tabla, con su propio scroll. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-[var(--text-tertiary)]">
              <th className="w-10 px-3 py-1.5" data-label="Elegir">
                <span className="sr-only">Elegir</span>
              </th>
              <th className="whitespace-nowrap px-2 py-1.5">N° de GTF</th>
              <th className="whitespace-nowrap px-2 py-1.5">N° de registro</th>
              <th className="whitespace-nowrap px-2 py-1.5">Fecha</th>
              <th className="px-2 py-1.5">Especies</th>
              <th className="whitespace-nowrap px-2 py-1.5 text-right">Trozas</th>
              <th className="whitespace-nowrap px-3 py-1.5 text-right">m³</th>
            </tr>
          </thead>
          <tbody>
            {g.guias.map((x) => (
              <tr
                key={x.woodEntryId}
                className={`border-t border-[var(--rule-soft)] ${x.anulada ? "opacity-60" : ""}`}
              >
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    className={CASILLA}
                    checked={s.elegidas.has(x.woodEntryId)}
                    disabled={x.anulada}
                    onChange={(e) => s.alternar([x.woodEntryId], e.target.checked)}
                    aria-label={`Elegir la guía ${x.gtfNumber}`}
                  />
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold text-[var(--text-primary)]">
                  {x.gtfNumber}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[var(--text-secondary)]">
                  {x.numeroRegistro ?? "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-[var(--text-secondary)]">
                  {x.fecha ? fechaConDia(x.fecha) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-[var(--text-primary)]">
                  {x.especies.join(", ") || "—"}
                  {x.anulada && (
                    <span className="ml-2 font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      Anulada en SERFOR
                    </span>
                  )}
                  {x.sinCodigo > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--data-warning-ink)]">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {x.sinCodigo} sin código
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {x.piezas}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono tabular-nums">
                  {x.volumenM3 != null ? fmtM3(x.volumenM3) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
