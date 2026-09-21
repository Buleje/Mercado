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
 *   h3  Estado de las trozas ──── las cifras, y cada una filtra
 *   h3  Trozas · filtros pegados a su tabla
 *
 * El estado se deriva del libro (`lib/forestal/loth-tablero-trozas.ts`): no hay
 * un contador aparte que se pueda desincronizar.
 */

import { useMemo, useState } from "react";
import { SectionTitle, CardTitle, DataTable } from "@buleje/design-system";
import { Search, AlertTriangle, FileText } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  ESTADOS_META,
  construirTablero,
  especiesDelTablero,
  filtrarTablero,
  resumirTablero,
  type EstadoTroza,
  type TrozaTablero,
} from "@/lib/forestal/loth-tablero-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export interface CaratulaTablero {
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
  titularName?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
}

/** Cada estado con su color. Rojo = ya no está disponible (pedido de Brandon). */
const TONO: Record<EstadoTroza, { chip: string; punto: string }> = {
  disponible: {
    chip: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]",
    punto: "bg-[var(--data-success-500)]",
  },
  despachada: {
    chip: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]",
    punto: "bg-[var(--data-error-500)]",
  },
  consumida: {
    chip: "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
    punto: "bg-[var(--data-warning-500)]",
  },
  descartada: {
    chip: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
    punto: "bg-[var(--text-tertiary)]",
  },
  fantasma: {
    chip: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)]",
    punto: "bg-[var(--data-error-500)]",
  },
};

const TH = "px-3 py-2.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-3 py-2.5 align-middle";

export default function LothTableroTrozas({
  entries,
  caratula,
  nav,
}: {
  entries: LothEntryDTO[];
  caratula?: CaratulaTablero | null;
  nav?: { onVerCadena?: (code: string) => void; onVerGtf?: (gtf: string) => void };
}) {
  const [texto, setTexto] = useState("");
  const [estados, setEstados] = useState<EstadoTroza[]>([]);
  const [especie, setEspecie] = useState<string | null>(null);

  const filas = useMemo(() => construirTablero(entries), [entries]);
  const resumen = useMemo(() => resumirTablero(filas), [filas]);
  const especies = useMemo(() => especiesDelTablero(filas), [filas]);
  const visibles = useMemo(
    () => filtrarTablero(filas, { texto, estados, especie }),
    [filas, texto, estados, especie],
  );

  const alternar = (e: EstadoTroza) =>
    setEstados((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const m3Visibles = visibles.reduce((a, f) => a + (f.volumenM3 ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* El riel de arriba ya dice cómo se llama la vista; el título de la
          pantalla suma lo que contesta, en vez de repetir el nombre. */}
      <header className="space-y-0.5">
        <SectionTitle className="text-[var(--text-primary)]">Control del permiso</SectionTitle>
        <p className="text-sm text-[var(--text-tertiary)]">
          Qué pasó con cada troza amparada por este título habilitante: la que sigue en el patio, la que ya salió
          con GTF y la que se consumió adentro.
        </p>
      </header>

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
                onClick={() => alternar(r.estado)}
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
              {visibles.length} de {filas.length} · {fmtM3(m3Visibles)} m³
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="search"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Código, árbol, especie o GTF..."
                aria-label="Buscar trozas"
                className="h-10 w-56 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-info-600)]"
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
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <DataTable className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)]">
              <tr>
                <th className={TH}>Cód. troza</th>
                <th className={TH}>Árbol</th>
                <th className={TH}>Especie</th>
                <th className={`${TH} text-right`}>Vol. m³</th>
                <th className={TH}>Estado</th>
                <th className={TH}>GTF / salida</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--text-tertiary)]">
                    {filas.length === 0
                      ? "Todavía no hay trozas registradas en el libro."
                      : "Ninguna troza coincide con el filtro."}
                  </td>
                </tr>
              )}
              {visibles.map((f) => (
                <Fila key={f.code} f={f} nav={nav} />
              ))}
            </tbody>
          </DataTable>
        </div>
      </section>
    </div>
  );
}

function Fila({
  f,
  nav,
}: {
  f: TrozaTablero;
  nav?: { onVerCadena?: (code: string) => void; onVerGtf?: (gtf: string) => void };
}) {
  return (
    <tr className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]">
      <td className={TD}>
        <button
          type="button"
          onClick={() => nav?.onVerCadena?.(f.code)}
          className="font-mono font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
        >
          {f.code}
        </button>
        {f.cites && (
          <span className="ml-1.5 rounded bg-[var(--data-info-50)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)]">
            CITES
          </span>
        )}
      </td>
      <td className={`${TD} font-mono text-[var(--text-secondary)]`}>{f.treeCode ?? "—"}</td>
      <td className={`${TD} text-[var(--text-secondary)]`}>{f.especie ?? "—"}</td>
      <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-primary)]`}>
        {f.volumenM3 != null ? fmtM3(f.volumenM3) : <span className="text-[var(--text-tertiary)]">sin medir</span>}
      </td>
      <td className={TD}>
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-bold ${TONO[f.estado].chip}`}>
          {f.estado === "fantasma" && <AlertTriangle className="h-3 w-3" />}
          {ESTADOS_META[f.estado].label}
        </span>
        {f.estado === "disponible" && f.diasEnPatio != null && f.diasEnPatio > 0 && (
          <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">{f.diasEnPatio} d en patio</span>
        )}
      </td>
      <td className={TD}>
        {f.gtf ? (
          <button
            type="button"
            onClick={() => nav?.onVerGtf?.(f.gtf as string)}
            className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[var(--data-info-700)] underline-offset-2 hover:underline"
          >
            <FileText className="h-3 w-3" />
            {f.gtf}
          </button>
        ) : (
          <span className="text-xs text-[var(--text-tertiary)]">—</span>
        )}
      </td>
    </tr>
  );
}

function DatoPermiso({ label, valor, mono }: { label: string; valor?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className={`block truncate text-sm font-semibold text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>
        {valor?.trim() || "—"}
      </span>
    </div>
  );
}
