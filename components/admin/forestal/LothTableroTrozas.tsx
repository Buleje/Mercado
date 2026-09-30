"use client";

/**
 * Control del permiso — el tablero de las trozas.
 *
 * El libro ya tenía el dato, pero repartido: la troza nace en Trozado, sale en
 * Despacho y desaparece en Consumo. Para contestar «¿qué me queda?» había que
 * leer tres secciones y cruzar códigos a mano. Acá cada troza aparece una sola
 * vez, con su estado y su color, bajo los códigos del permiso que la ampara.
 *
 * Orden de la pantalla (ley de Brandon, 2026-09-19):
 *   h2  Control del permiso ───── qué contesta
 *       banda con los códigos del título habilitante
 *       [encabezado]  ← ficha del permiso, cuadre por guía, saldo por especie
 *                        (los montan otros componentes; acá sólo el lugar)
 *   h3  Estado de las trozas ──── las cifras, y cada una filtra
 *   h3  Trozas · filtros, columnas y Excel pegados a su tabla
 *
 * El estado se deriva del libro (`lib/forestal/loth-tablero-trozas.ts`): no hay
 * un contador aparte que se pueda desincronizar.
 */

import { useId, useMemo, useState, type ReactNode } from "react";
import { SectionTitle, CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Search, AlertTriangle, FileSpreadsheet, Loader2 } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  ESTADOS_META,
  construirTablero,
  especiesDelTablero,
  filtrarTablero,
  resumirTablero,
  type EstadoTroza,
} from "@/lib/forestal/loth-tablero-trozas";
import { ordenarTablero } from "@/lib/forestal/loth-tablero-columnas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { useTableroContexto } from "./hooks/use-tablero-contexto";
import { useTableroColumnas } from "./hooks/use-tablero-columnas";
import { BotonColumnas, DatoPermiso, PanelColumnas, TONO } from "./loth-tablero-partes";
import LothTableroTrozasTabla, { type NavTablero } from "./LothTableroTrozasTabla";

export interface CaratulaTablero {
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
  titularName?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
}

export default function LothTableroTrozas({
  entries,
  caratula,
  nav,
  encabezado,
}: {
  entries: LothEntryDTO[];
  caratula?: CaratulaTablero | null;
  nav?: NavTablero;
  /**
   * Lo que va entre la banda del permiso y «Estado de las trozas»: la ficha
   * del permiso, el cuadre por guía y el saldo por especie. El tablero no
   * sabe qué es; sólo le guarda el lugar.
   */
  encabezado?: ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const [estados, setEstados] = useState<EstadoTroza[]>([]);
  const [especie, setEspecie] = useState<string | null>(null);
  const [verColumnas, setVerColumnas] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);
  const panelId = useId();

  const { contexto, cargando, faltante } = useTableroContexto();
  const { visibles, alternar, restablecer, orden, ordenarPor } = useTableroColumnas();

  const filas = useMemo(() => construirTablero(entries, new Date(), contexto), [entries, contexto]);
  const resumen = useMemo(() => resumirTablero(filas), [filas]);
  const especies = useMemo(() => especiesDelTablero(filas), [filas]);
  const visiblesFilas = useMemo(
    () => ordenarTablero(filtrarTablero(filas, { texto, estados, especie }), orden),
    [filas, texto, estados, especie, orden],
  );

  const alternarEstado = (e: EstadoTroza) =>
    setEstados((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const m3Visibles = visiblesFilas.reduce((a, f) => a + (f.volumenM3 ?? 0), 0);

  const exportar = async () => {
    setExportando(true);
    setErrorExport(null);
    try {
      const { exportarTableroExcel } = await import("@/lib/forestal/loth-tablero-export");
      await exportarTableroExcel(filas, caratula);
    } catch (err) {
      console.error("[loth-tablero] export Excel falló", err);
      setErrorExport("No se pudo armar el Excel. Vuelve a intentarlo.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* El riel de arriba ya dice cómo se llama la vista; el título de la
          pantalla suma lo que contesta, en vez de repetir el nombre. */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SectionTitle className="text-[var(--text-primary)]">Control del permiso</SectionTitle>
          <InfoTip
            title="Control del permiso"
            what="Qué pasó con cada troza amparada por este título habilitante."
            affects="La que sigue en el patio, la que ya salió con GTF y la que se consumió adentro."
          />
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando || filas.length === 0 || cargando}
          title="Todas las trozas del permiso con todas las columnas, más una hoja resumen por estado"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exportando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 text-[var(--data-success-700)]" aria-hidden="true" />
          )}
          Exportar Excel
        </button>
      </header>
      {errorExport && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)]">
          {errorExport}
        </p>
      )}

      {/* Los códigos que amparan todo lo de abajo */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <DatoPermiso label="Título habilitante" valor={caratula?.tituloHabilitante} mono />
        <DatoPermiso label="N° registro del libro" valor={caratula?.registroNumber} mono />
        <DatoPermiso label="Tomo" valor={caratula?.tomo} mono />
        <DatoPermiso
          label="Doc. de gestión"
          valor={[caratula?.docGestionType, caratula?.docGestionName].filter(Boolean).join(" ") || null}
        />
        <DatoPermiso label="Resolución" valor={caratula?.resolucionNumber} mono />
        <DatoPermiso label="Titular" valor={caratula?.titularName} />
      </div>

      {/* Lugar para la ficha del permiso, el cuadre por guía y el saldo por especie */}
      {encabezado}

      {/* Cada cifra es también el filtro de su estado */}
      <section className="space-y-2">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Estado de las trozas
        </CardTitle>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {resumen.map((r) => {
            const activo = estados.includes(r.estado);
            return (
              <button
                key={r.estado}
                type="button"
                aria-pressed={activo}
                title={ESTADOS_META[r.estado].ayuda}
                onClick={() => alternarEstado(r.estado)}
                className={`rounded-2xl border-2 px-3 py-2.5 text-left transition-colors ${
                  activo ? TONO[r.estado].chip : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${TONO[r.estado].punto}`} />
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    {r.label}
                  </span>
                </span>
                <span className="mt-0.5 block font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">
                  {r.n}
                </span>
                <span className="block text-xs text-[var(--text-tertiary)]">
                  {fmtM3(r.m3)} m³
                  {r.sinVolumen > 0 && ` · ${r.sinVolumen} sin volumen`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* La lista, con sus filtros pegados */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
            Trozas{" "}
            <span className="font-normal text-[var(--text-tertiary)]">
              {visiblesFilas.length} de {filas.length} · {fmtM3(m3Visibles)} m³
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Código, árbol, especie, GTF o placa..."
                aria-label="Buscar trozas"
                className="h-10 w-56 max-w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-info-600)]"
              />
            </div>
            <select
              value={especie ?? ""}
              onChange={(e) => setEspecie(e.target.value || null)}
              aria-label="Filtrar por especie"
              className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-medium text-[var(--text-primary)] outline-none"
            >
              <option value="">Todas las especies</option>
              {especies.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <BotonColumnas abierto={verColumnas} onToggle={() => setVerColumnas((v) => !v)} n={visibles.length} panelId={panelId} />
          </div>
        </div>

        {verColumnas && (
          <PanelColumnas id={panelId} visibles={visibles} onAlternar={alternar} onRestablecer={restablecer} />
        )}

        {faltante && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--data-warning-700)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            No se pudieron leer {faltante}: esas columnas salen vacías.
          </p>
        )}

        <LothTableroTrozasTabla
          filas={visiblesFilas}
          hayTrozas={filas.length > 0}
          visibles={visibles}
          orden={orden}
          onOrdenar={ordenarPor}
          nav={nav}
        />
      </section>
    </div>
  );
}
