"use client";

/**
 * «Ya recibidas en el aserradero» — la primera puerta de «Importar guías
 * despachadas» (ADR-461): las guías SERFOR que el Libro CTP ya recibió
 * (`WoodEntry.serforGtf`) y todavía no están en el Libro TH, agrupadas por el
 * título habilitante que dice la guía. Se eligen varias; la ficha guardada del
 * ingreso es la fuente (no se vuelve a consultar SERFOR).
 */

import { useEffect, useId, useMemo } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import type { GrupoCandidatas, GuiaCandidata } from "@/lib/forestal/loth-importar-guia-tipos";
import type { ImportarGuias } from "./hooks/use-importar-guias";
import { ChipPermiso } from "./LothImportarGuiasPermiso";
import { Btn } from "./ctp-shared";
import { DataTable } from "@buleje/design-system";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  useFiltrosTabla,
  type ColumnaFiltro,
} from "./filtros-tabla-forestal";

/** Una guía con el título del grupo del que sale: lo que filtra el embudo. */
type FilaRecibida = GuiaCandidata & { titulo: string };

const COLUMNAS: readonly ColumnaFiltro<FilaRecibida>[] = [
  { id: "titulo", label: "Título habilitante", tipo: "multi", valor: (x) => x.titulo },
  { id: "gtf", label: "N° de GTF", tipo: "texto", valor: (x) => x.gtfNumber },
  { id: "registro", label: "N° de registro", tipo: "texto", valor: (x) => x.numeroRegistro ?? "" },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (x) => x.fecha ?? "" },
  { id: "especie", label: "Especie", tipo: "multi", valor: (x) => (x.especies.length ? x.especies : ["—"]) },
  { id: "piezas", label: "Trozas", tipo: "rango", numero: (x) => x.piezas },
  { id: "m3", label: "m³", tipo: "rango", numero: (x) => x.volumenM3 ?? 0, unidad: "m³", paso: 0.0001 },
];

const CASILLA =
  "h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed";

export default function LothImportarGuiasRecibidas({ s }: { s: ImportarGuias }) {
  const { cargando, error, datos } = s.candidatas;
  const filas = useMemo<FilaRecibida[]>(
    () => (datos?.grupos ?? []).flatMap((g) => g.guias.map((x) => ({ ...x, titulo: g.titulo }))),
    [datos],
  );
  const f = useFiltrosTabla(filas, COLUMNAS);
  const visibles = useMemo(() => new Set(f.filtradas.map((x) => x.woodEntryId)), [f.filtradas]);
  const hayFiltro = f.filtradas.length !== filas.length;
  /* Lo que el filtro esconde sale de lo elegido: se importa sólo lo que se ve. */
  const escondidasElegidas = useMemo(
    () => filas.filter((x) => !visibles.has(x.woodEntryId) && s.elegidas.has(x.woodEntryId)).map((x) => x.woodEntryId),
    [filas, visibles, s.elegidas],
  );
  useEffect(() => {
    if (escondidasElegidas.length > 0) s.alternar(escondidasElegidas, false);
  }, [escondidasElegidas, s]);

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

  /* Cada grupo con sólo las guías que pasan el filtro; sus cifras se recalculan si hay filtro. */
  const grupos = datos.grupos
    .map((g) => {
      const guias = g.guias.filter((x) => visibles.has(x.woodEntryId));
      return hayFiltro
        ? { ...g, guias, piezas: guias.reduce((a, x) => a + x.piezas, 0), volumenM3: guias.reduce((a, x) => a + (x.volumenM3 ?? 0), 0) }
        : g;
    })
    .filter((g) => g.guias.length > 0);
  const todas = grupos.flatMap((g) => g.guias.filter((x) => !x.anulada).map((x) => x.woodEntryId));
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
          {elegidasTodas ? "Soltar todas" : `Elegir todas${hayFiltro ? " las que ves" : ""} (${todas.length})`}
        </Btn>
      </div>
      {filas.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-[var(--text-secondary)]">
          {COLUMNAS.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              {c.label}
              <FiltroEnCabecera id={c.id} f={f} compacto />
            </span>
          ))}
          <BarraFiltrosTabla f={f} sinConteo />
        </div>
      )}
      {hayFiltro && grupos.length === 0 && (
        <p className="p-3 text-sm text-[var(--text-secondary)]">Ninguna guía coincide con los filtros.</p>
      )}
      {grupos.map((g) => (
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
        <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
          <thead>
            <tr>
              <th className="w-10" data-label="Elegir">
                <span className="sr-only">Elegir</span>
              </th>
              <th className="whitespace-nowrap">N° de GTF</th>
              <th className="whitespace-nowrap">N° de registro</th>
              <th className="whitespace-nowrap">Fecha</th>
              <th>Especies</th>
              <th className="whitespace-nowrap text-right">Trozas</th>
              <th className="whitespace-nowrap text-right">m³</th>
            </tr>
          </thead>
          <tbody>
            {g.guias.map((x) => (
              <tr
                key={x.woodEntryId}
                className={`${x.anulada ? "opacity-60" : ""}`}
              >
                <td>
                  <input
                    type="checkbox"
                    className={CASILLA}
                    checked={s.elegidas.has(x.woodEntryId)}
                    disabled={x.anulada}
                    onChange={(e) => s.alternar([x.woodEntryId], e.target.checked)}
                    aria-label={`Elegir la guía ${x.gtfNumber}`}
                  />
                </td>
                <td className="whitespace-nowrap font-mono font-semibold">
                  {x.gtfNumber}
                </td>
                <td className="whitespace-nowrap font-mono text-[var(--text-secondary)]">
                  {x.numeroRegistro ?? "—"}
                </td>
                <td className="whitespace-nowrap text-[var(--text-secondary)]">
                  {x.fecha ? fechaConDia(x.fecha) : "—"}
                </td>
                <td className="whitespace-nowrap">
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
                <td className="whitespace-nowrap text-right tabular-nums">
                  {x.piezas}
                </td>
                <td className="whitespace-nowrap text-right font-mono tabular-nums">
                  {x.volumenM3 != null ? fmtM3(x.volumenM3) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </section>
  );
}
