"use client";

/**
 * CtpTrozasIndividuales — el libro de ingresos leído por PIEZA.
 *
 * La tabla de Ingresos lista GUÍAS: una guía del inventario trae veinte trozas,
 * así que quien subió 60 piezas veía 9 filas y creía que se habían perdido 51.
 * Acá cada fila ES una troza, con lo que el papel declara de ella: sus dos
 * códigos (el del bosque y el que marcó la planta), las TRES dimensiones
 * (D1 · D2 · largo), el diámetro con el que se cubica, su volumen y en qué
 * estado está.
 *
 * No agrupa por nada. El total del pie es de TODO el período —no de la página—
 * porque es el número que se cuadra contra el Excel del SNIFFS.
 */

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Download, Loader2, PackageOpen, Search } from "@buleje/design-system/icons";
import { LABEL_BLOQUEO, motivoBloqueo } from "@/lib/forestal/consumo-trozas";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import EspecieFoto from "./EspecieFoto";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";

export interface TrozaIndividual {
  id: string;
  orden: number;
  codificacion: string | null;
  codigoPlanta: string | null;
  parcela: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  dimensiones: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  diametroCm: number | null;
  volumenM3: number | null;
  noRecepcionada?: boolean | null;
  descarte?: boolean | null;
  trozaOrigenId?: string | null;
  consumidaEnId?: string | null;
  retrozos?: number;
  ingreso: { id: string; gtfNumber: string; providerName: string; entryDate: string };
}

const n = (v: number | null | undefined, dec = 2) => (v == null ? "—" : v.toFixed(dec));
const TH = "px-3 py-2.5 text-left align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-3 py-2.5 align-middle";
const NUM = "text-right font-mono tabular-nums";

/** Qué se puede decir de la pieza en una palabra. */
function estado(t: TrozaIndividual): { label: string; cls: string } {
  const m = motivoBloqueo({
    id: t.id,
    woodEntryId: t.ingreso.id,
    codificacion: t.codificacion,
    especieComun: t.especieComun,
    volumenM3: t.volumenM3,
    consumidaEnId: t.consumidaEnId,
    noRecepcionada: t.noRecepcionada,
    descarte: t.descarte,
    trozaOrigenId: t.trozaOrigenId,
    retrozos: t.retrozos,
  });
  if (m === null) return { label: "En patio", cls: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" };
  if (m === "ya_consumida") return { label: "Aserrada", cls: "text-[var(--text-tertiary)]" };
  return { label: LABEL_BLOQUEO[m], cls: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" };
}

export default function CtpTrozasIndividuales({ period }: { period: CtpPeriod }) {
  const [datos, setDatos] = useState<{ trozas: TrozaIndividual[]; total: number; volumenM3: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const { indice: fotosEspecie } = useEspeciesFotos();

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const params = new URLSearchParams({ listado: "1", limite: "1000" });
    if (period.from) params.set("from", period.from);
    if (period.to) params.set("to", period.to);
    fetch(`/api/admin/forestal/trozas?${params}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (vivo) { setDatos(j); setError(null); } })
      .catch((e) => { if (vivo) { setError(e instanceof Error ? e.message : String(e)); setDatos(null); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [period.from, period.to]);

  /** El buscador filtra en el cliente: ya está todo el período en memoria. */
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !datos) return datos?.trozas ?? [];
    return datos.trozas.filter((x) =>
      [x.codificacion, x.codigoPlanta, x.especieComun, x.ingreso.gtfNumber, x.parcela]
        .some((v) => (v ?? "").toLowerCase().includes(t)),
    );
  }, [q, datos]);

  const sumaVisible = filtradas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0);

  const exportar = () => {
    const cab = ["N°", "Codigo troza", "Codigo planta", "Parcela", "Especie", "Cientifico", "D1(cm)", "D2(cm)", "Largo(m)", "Diametro(cm)", "Volumen(m3)", "GTF", "Fecha", "Estado"];
    const filas = filtradas.map((t, i) => [
      i + 1, t.codificacion ?? "", t.codigoPlanta ?? "", t.parcela ?? "", t.especieComun ?? "", t.especieCientifica ?? "",
      t.d1Cm ?? "", t.d2Cm ?? "", t.largoM ?? "", t.diametroCm ?? "", t.volumenM3 ?? "",
      t.ingreso.gtfNumber, String(t.ingreso.entryDate).slice(0, 10), estado(t).label,
    ]);
    /* `;` y coma decimal: el mismo criterio que el resto del libro, que es lo
       que espera el Excel en es-PE. */
    const cel = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [cab, ...filas].map((f) => f.map((v) => cel(typeof v === "number" ? String(v).replace(".", ",") : v)).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `trozas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (cargando) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-6 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo las trozas del período…
      </p>
    );
  }
  if (error) {
    return <p className="rounded-2xl border-2 border-[var(--data-error-500)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">No se pudieron leer las trozas: {error}</p>;
  }
  if (!datos || datos.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-12 text-center">
        <PackageOpen className="h-8 w-8 text-[var(--text-tertiary)]" />
        <p className="text-base font-bold text-[var(--text-primary)]">Ninguna guía del período trae lista de piezas</p>
        <p className="max-w-md text-sm text-[var(--text-tertiary)]">
          Importá el inventario de rolliza en patio (menú <b>Importar libro</b>) o cargá las trozas desde la ficha de un ingreso.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código, especie o GTF…"
            aria-label="Buscar una troza"
            className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">{filtradas.length}</b>
            {filtradas.length !== datos.total && <> de {datos.total}</>} trozas · {sumaVisible.toFixed(4)} m³
          </span>
          <button type="button" onClick={exportar} className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]">
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <DataTable className="w-full min-w-[1000px] text-sm">
          <caption className="sr-only">Trozas del período, una fila por pieza</caption>
          <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
            <tr>
              <th scope="col" className={`${TH} w-12 text-right`}>N°</th>
              <th scope="col" className={TH}>Código troza</th>
              <th scope="col" className={TH} title="El que marcó este centro al recibirla">Código planta</th>
              <th scope="col" className={TH}>Especie</th>
              <th scope="col" className={`${TH} text-right`} title="Diámetro de un extremo">D1 cm</th>
              <th scope="col" className={`${TH} text-right`} title="Diámetro del otro extremo">D2 cm</th>
              <th scope="col" className={`${TH} text-right`}>Largo m</th>
              <th scope="col" className={`${TH} text-right`} title="Promedio de D1 y D2: el que se usa para cubicar">Ø cm</th>
              <th scope="col" className={`${TH} text-right`}>Volumen m³</th>
              <th scope="col" className={TH}>GTF</th>
              <th scope="col" className={TH}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((t, i) => {
              const e = estado(t);
              return (
                <tr key={t.id} className="border-t border-[var(--rule-soft)] transition-colors even:bg-[var(--surface-canvas)]/50 hover:bg-primary/5">
                  <td className={`${TD} ${NUM} text-[var(--text-tertiary)]`}>{i + 1}</td>
                  <td className={`${TD} font-mono font-bold text-[var(--text-primary)]`}>
                    {t.codificacion ?? "—"}
                    {t.parcela && <span className="ml-1.5 text-xs font-normal text-[var(--text-tertiary)]">parcela {t.parcela}</span>}
                    {t.trozaOrigenId && <span className="ml-1.5 text-xs font-normal text-[var(--text-tertiary)]">retrozo</span>}
                  </td>
                  <td className={`${TD} font-mono text-[var(--text-secondary)]`}>{t.codigoPlanta ?? "—"}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={22} />
                      <span className="min-w-0">
                        <span className="block truncate">{t.especieComun ?? "—"}</span>
                        {t.especieCientifica && <span className="block truncate text-xs italic text-[var(--text-tertiary)]">{t.especieCientifica}</span>}
                      </span>
                    </span>
                  </td>
                  <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{n(t.d1Cm, 0)}</td>
                  <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{n(t.d2Cm, 0)}</td>
                  <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{n(t.largoM, 2)}</td>
                  <td className={`${TD} ${NUM} text-[var(--text-tertiary)]`}>{n(t.diametroCm, 1)}</td>
                  <td className={`${TD} ${NUM} font-bold text-[var(--text-primary)]`}>{n(t.volumenM3, 4)}</td>
                  <td className={`${TD} font-mono text-xs text-[var(--text-secondary)]`}>
                    {t.ingreso.gtfNumber}
                    <span className="block text-[var(--text-tertiary)]">
                      {new Date(t.ingreso.entryDate).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })}
                    </span>
                  </td>
                  <td className={`${TD} text-xs font-bold ${e.cls}`}>{e.label}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-[var(--surface-raised)]">
            <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <th scope="row" colSpan={8} className={`${TD} text-left`}>
                Total · {filtradas.length} {filtradas.length === 1 ? "troza" : "trozas"}
                {filtradas.length !== datos.total && <span className="font-normal"> (de {datos.total} del período)</span>}
              </th>
              <td className={`${TD} ${NUM}`}>{sumaVisible.toFixed(4)}</td>
              <td className={TD} colSpan={2} />
            </tr>
          </tfoot>
        </DataTable>
      </div>
    </div>
  );
}
