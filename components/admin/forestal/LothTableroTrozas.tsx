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
 *       [encabezado]  ← ficha del permiso, saldo por especie, cuadre por guía
 *                        (los monta el libro; acá sólo el lugar y los datos)
 *       sin encabezado: la banda con los códigos del título habilitante
 *   h3  Estado de las trozas ──── las cifras, y cada una filtra
 *   h3  Trozas · filtros, columnas y Excel pegados a su tabla
 *
 * El estado se deriva del libro (`lib/forestal/loth-tablero-trozas.ts`): no hay
 * un contador aparte que se pueda desincronizar.
 */

import { useId, useMemo, useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { Search, AlertTriangle } from "@buleje/design-system/icons";
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
import type { GtfRegistrada } from "@/lib/forestal/loth-cuadre-guias";
import type { PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import { ordenarTablero } from "@/lib/forestal/loth-tablero-columnas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { useTableroContexto } from "./hooks/use-tablero-contexto";
import { useTableroColumnas } from "./hooks/use-tablero-columnas";
import { BotonColumnas, DatoPermiso, PanelColumnas, TONO } from "./loth-tablero-partes";
import LothTableroTrozasTabla, { type NavTablero } from "./LothTableroTrozasTabla";
import LothEscanerTroza from "./LothEscanerTroza";
import LothTableroCabecera from "./LothTableroCabecera";

export interface CaratulaTablero {
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
  titularName?: string | null;
  docGestionType?: string | null;
  docGestionName?: string | null;
  resolucionNumber?: string | null;
}

/**
 * Lo que el tablero ya leyó y le presta a su encabezado, para que el cuadre por
 * guía y la ficha de cada plan no vuelvan a pedir lo mismo a la API.
 */
export interface DatosEncabezadoTablero {
  /** Todas las trozas del permiso, ya cruzadas (sin filtros de la tabla). */
  filas: readonly TrozaTablero[];
  /** Todas las GTF, anuladas incluidas; `null` = no se pudieron leer. */
  gtfs: readonly GtfRegistrada[] | null;
  /** Todos los planes no dados de baja; `null` = no se pudieron leer. */
  planes: readonly PlanFichaApi[] | null;
  cargando: boolean;
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
   * Lo que va entre el título y «Estado de las trozas»: la ficha del permiso,
   * el saldo por especie y el cuadre por guía. El tablero no sabe qué es; le
   * guarda el lugar y, si es función, le pasa lo que ya leyó.
   *
   * Con encabezado NO se dibuja la banda de códigos: la ficha del permiso trae
   * los mismos seis (título, registro · tomo, doc. de gestión, resolución,
   * titular) más la vigencia — dos veces el mismo código es ruido.
   */
  encabezado?: ReactNode | ((datos: DatosEncabezadoTablero) => ReactNode);
}) {
  const [texto, setTexto] = useState("");
  const [estados, setEstados] = useState<EstadoTroza[]>([]);
  const [especie, setEspecie] = useState<string | null>(null);
  const [verColumnas, setVerColumnas] = useState(false);
  /** 0 = escáner cerrado; cada «Escanear troza» lo sube y vuelve a abrir la cámara. */
  const [escaner, setEscaner] = useState(0);
  const panelId = useId();

  const { contexto, gtfs, planes, cargando, faltante } = useTableroContexto();
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

  return (
    <div className="space-y-4">
      <LothTableroCabecera
        filas={filas}
        caratula={caratula}
        cargando={cargando}
        onEscanear={() => setEscaner((n) => n + 1)}
      />
      {escaner > 0 && (
        <LothEscanerTroza
          filas={filas}
          entries={entries}
          tituloHabilitante={caratula?.tituloHabilitante}
          nav={nav}
          pedidoCamara={escaner}
          onVerEnTabla={(code) => {
            setTexto(code);
            setEstados([]);
            setEspecie(null);
          }}
          onCerrar={() => setEscaner(0)}
        />
      )}

      {/* Los códigos que amparan todo lo de abajo — sólo si nadie monta la ficha */}
      {encabezado == null && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
          <DatoPermiso label="Título habilitante" valor={caratula?.tituloHabilitante} mono />
          <DatoPermiso label="N° registro del libro" valor={caratula?.registroNumber} mono />
          <DatoPermiso label="Tomo" valor={caratula?.tomo} mono />
          <DatoPermiso
            label="Doc. de gestión"
            valor={
              [caratula?.docGestionType, caratula?.docGestionName].filter(Boolean).join(" ") || null
            }
          />
          <DatoPermiso label="Resolución" valor={caratula?.resolucionNumber} mono />
          <DatoPermiso label="Titular" valor={caratula?.titularName} />
        </div>
      )}

      {/* Lugar para la ficha del permiso, el saldo por especie y el cuadre por guía */}
      {typeof encabezado === "function"
        ? encabezado({ filas, gtfs, planes, cargando })
        : encabezado}

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
                  activo
                    ? TONO[r.estado].chip
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
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
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <BotonColumnas
              abierto={verColumnas}
              onToggle={() => setVerColumnas((v) => !v)}
              n={visibles.length}
              panelId={panelId}
            />
          </div>
        </div>

        {verColumnas && (
          <PanelColumnas
            id={panelId}
            visibles={visibles}
            onAlternar={alternar}
            onRestablecer={restablecer}
          />
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
