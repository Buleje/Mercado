"use client";

/**
 * CtpTrozasLista — cada troza del patio, una fila.
 *
 * Lo que ninguna otra pantalla del libro contesta: **dónde está y hace cuánto**
 * esta pieza concreta. Ingresos la lista por guía y por período; Consumos habla
 * en m³. Acá no hay período: es el patio de hoy, con el estado de cada tronco y
 * los días que lleva parado, que es lo que decide qué se asierra primero.
 *
 * Filtra en el cliente porque el patio ya está entero en memoria (una lectura,
 * la del panel de arriba): así el filtro responde mientras se tipea y los
 * totales de arriba y las filas de abajo salen siempre del mismo dato.
 */

import { useCallback, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Download, Loader2, Search, X } from "@buleje/design-system/icons";
import {
  diasParada,
  ESTADO_META,
  estadoDeTroza,
  filtrarPatio,
  resumirPatio,
  type EstadoTroza,
  type OrdenTrozas,
} from "@/lib/forestal/trozas-patio";
import EspecieFoto from "./EspecieFoto";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { puntoDeTono } from "./CtpTrozasPatio";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

const n = (v: number | null | undefined, dec = 2) => (v == null ? "—" : v.toFixed(dec));
const TH = "px-3 py-2 text-left align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]";
const TD = "px-3 py-2 align-middle";
const NUM = "text-right font-mono tabular-nums";

const ORDENES: { v: OrdenTrozas; label: string }[] = [
  { v: "antiguedad", label: "Más vieja primero" },
  { v: "volumen", label: "Mayor volumen" },
  { v: "codigo", label: "Código de troza" },
  { v: "especie", label: "Especie" },
];

/**
 * Los días, con el aviso en el FONDO y no en el texto.
 *
 * Medido en dark: ningún rojo del DS llega a 4.5:1 sobre la fila —el mejor,
 * `--data-error-500`, da 3.93— así que un «822 d» en rojo es exactamente el
 * dato que no se lee. El número va en el token de texto (14.3:1) y el color
 * queda en el tinte del fondo, que es señal y no información.
 */
const claseDias = (d: number | null) =>
  d == null ? "text-[var(--text-secondary)]"
    : d >= 60 ? "rounded-md bg-[var(--data-error-500)]/18 px-1.5 text-[var(--text-primary)]"
    : d >= 30 ? "rounded-md bg-[var(--data-warning-500)]/18 px-1.5 text-[var(--text-primary)]"
    : "text-[var(--text-secondary)]";

const tituloDias = (d: number | null) =>
  d == null ? "Sin fecha de recepción ni de asiento"
    : d >= 60 ? `${d} días parada: la troza se mancha y se raja, hay que aserrarla`
    : d >= 30 ? `${d} días parada: conviene programarla`
    : `${d} días desde que entró`;

export interface CtpTrozasListaProps {
  trozas: readonly TrozaPatioAPI[];
  /** Mientras se lee el patio la lista NO puede afirmar que está vacío. */
  cargando: boolean;
  estadoFiltro: EstadoTroza | null;
  onEstadoFiltro: (e: EstadoTroza | null) => void;
  tramoFiltro: string | null;
  onTramoFiltro: (k: string | null) => void;
}

export default function CtpTrozasLista({ trozas, cargando, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro }: CtpTrozasListaProps) {
  const [texto, setTexto] = useState("");
  const [especie, setEspecie] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenTrozas>("antiguedad");
  const [tope, setTope] = useState(200);
  const { indice: fotosEspecie } = useEspeciesFotos();

  /* Una sola marca de tiempo para filtrar y para pintar los días: si cada fila
     llama `new Date()`, dos filas de la misma pieza pueden caer en tramos
     distintos al cruzar la medianoche. */
  const hoy = useMemo(() => new Date(), [trozas]); // eslint-disable-line react-hooks/exhaustive-deps

  const especies = useMemo(() => resumirPatio(trozas).porEspecie.map((e) => e.especie), [trozas]);
  const filtradas = useMemo(
    () => filtrarPatio(trozas, { texto, estado: estadoFiltro, especie, tramo: tramoFiltro, orden }, hoy),
    [trozas, texto, estadoFiltro, especie, tramoFiltro, orden, hoy],
  );
  const visibles = filtradas.slice(0, tope);
  const sumaVisible = filtradas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0);
  const hayFiltro = Boolean(texto.trim() || estadoFiltro || especie || tramoFiltro);

  const limpiar = () => { setTexto(""); setEspecie(null); onEstadoFiltro(null); onTramoFiltro(null); };

  /** Lo que se está viendo, para cruzarlo en Excel contra el conteo del patio. */
  const exportar = useCallback(() => {
    const cel = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
    const cab = ["N°", "Codigo troza", "Codigo planta", "Especie", "Estado", "Dias parada", "D1(cm)", "D2(cm)", "Largo(m)", "Volumen(m3)", "GTF", "Proveedor", "Titulo", "Lote"];
    const filas = filtradas.map((t, i) => [
      i + 1, t.codificacion ?? "", t.codigoPlanta ?? "", t.especieComun ?? "",
      ESTADO_META[estadoDeTroza(t)].label, diasParada(t, hoy) ?? "",
      num(t.d1Cm), num(t.d2Cm), num(t.largoM), num(t.volumenM3),
      t.gtfNumber ?? "", t.proveedor ?? "", t.permiso ?? "", t.loteAserrioCode ?? "",
    ]);
    const csv = "﻿" + [cab, ...filas].map((f) => f.map(cel).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `patio-trozas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [filtradas, hoy]);

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
        <CardTitle as="h3" className="mr-1 text-sm font-bold text-[var(--text-primary)]">Piezas</CardTitle>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Código, especie, guía, proveedor, título…"
            aria-label="Buscar una troza"
            className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </div>
        <select
          value={especie ?? ""}
          onChange={(e) => setEspecie(e.target.value || null)}
          aria-label="Filtrar por especie"
          className="h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-medium text-[var(--text-primary)] focus:border-primary focus:outline-none"
        >
          <option value="">Todas las especies</option>
          {especies.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as OrdenTrozas)}
          aria-label="Ordenar por"
          className="h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-medium text-[var(--text-primary)] focus:border-primary focus:outline-none"
        >
          {ORDENES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <button
          type="button" onClick={exportar} disabled={filtradas.length === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>

      {/* ── Qué se está viendo ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2 text-[length:var(--ts-2xs)]">
        <span className="font-bold text-[var(--text-secondary)]">
          {cargando && trozas.length === 0 ? (
            "Leyendo el patio…"
          ) : (
            <>
              {filtradas.length === trozas.length
                ? `${filtradas.length} piezas`
                : `${filtradas.length} de ${trozas.length} piezas`}
              {" · "}
              <span className="font-mono tabular-nums">{sumaVisible.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³</span>
            </>
          )}
        </span>
        {estadoFiltro && <Chip label={ESTADO_META[estadoFiltro].label} onQuitar={() => onEstadoFiltro(null)} />}
        {tramoFiltro && <Chip label={tramoFiltro === "fresca" ? "Menos de 30 días" : tramoFiltro === "atencion" ? "30 a 59 días" : "60 días o más"} onQuitar={() => onTramoFiltro(null)} />}
        {especie && <Chip label={especie} onQuitar={() => setEspecie(null)} />}
        {texto.trim() && <Chip label={`«${texto.trim()}»`} onQuitar={() => setTexto("")} />}
        {hayFiltro && (
          <button type="button" onClick={limpiar} className="font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]">
            Ver todo
          </button>
        )}
      </div>

      {filtradas.length === 0 ? (
        <p className="flex items-center justify-center gap-2 p-8 text-center text-sm text-[var(--text-secondary)]">
          {cargando ? (
            /* Mientras carga no se afirma que el patio está vacío: un aserradero
               con 5.000 piezas leería «no hay trozas» durante dos segundos. */
            <><Loader2 className="h-4 w-4 animate-spin" /> Leyendo el patio…</>
          ) : trozas.length === 0 ? (
            "Todavía no hay trozas cargadas: llegan con el alta de la guía desde SERFOR."
          ) : (
            "Ninguna pieza cumple con eso. Probá quitando un filtro."
          )}
        </p>
      ) : (
        <>
          {/* Desktop: tabla. Mobile: tarjetas — nueve columnas no entran en el
              teléfono que se usa en el patio. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b-2 border-[var(--rule-base)]">
                <tr>
                  <th className={TH}>Código</th>
                  <th className={TH}>Especie</th>
                  <th className={TH}>Estado</th>
                  <th className={`${TH} text-right`} title="Días que lleva parada en el patio">Parada</th>
                  <th className={`${TH} text-right`}>D1 · D2 (cm)</th>
                  <th className={`${TH} text-right`}>Largo (m)</th>
                  <th className={`${TH} text-right`}>Volumen</th>
                  <th className={TH}>Guía / origen</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => {
                  const e = estadoDeTroza(t);
                  const m = ESTADO_META[e];
                  const d = diasParada(t, hoy);
                  return (
                    <tr key={t.id} className="border-b border-[var(--rule-soft)] last:border-0 hover:bg-[var(--surface-sunken)]">
                      <td className={TD}>
                        <span className="block font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</span>
                        {t.codigoPlanta && <span className="block font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">planta {t.codigoPlanta}</span>}
                      </td>
                      <td className={TD}>
                        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={24} />
                          {t.especieComun ?? "—"}
                        </span>
                      </td>
                      <td className={TD}>
                        <span className="flex items-center gap-1.5" title={m.hint}>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: puntoDeTono(m.tono) }} aria-hidden="true" />
                          <span className="text-xs font-bold text-[var(--text-secondary)]">{m.label}</span>
                        </span>
                        {t.loteAserrioCode && <span className="ml-3.5 block font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{t.loteAserrioCode}</span>}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        <span className={`inline-block font-bold ${claseDias(d)}`} title={tituloDias(d)}>
                          {d == null ? "—" : `${d} d`}
                        </span>
                      </td>
                      <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{n(t.d1Cm, 0)} · {n(t.d2Cm, 0)}</td>
                      <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{n(t.largoM)}</td>
                      <td className={`${TD} ${NUM} font-bold text-[var(--text-primary)]`}>{t.volumenM3 == null ? "—" : `${t.volumenM3.toFixed(4)} m³`}</td>
                      <td className={TD}>
                        <span className="block font-mono text-xs text-[var(--text-secondary)]">{t.gtfNumber ?? "—"}</span>
                        <span className="block truncate text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{t.permiso ?? t.proveedor ?? ""}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-[var(--rule-soft)] md:hidden">
            {visibles.map((t) => {
              const m = ESTADO_META[estadoDeTroza(t)];
              const d = diasParada(t, hoy);
              return (
                <li key={t.id} className="px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? t.codigoPlanta ?? "—"}</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      {t.volumenM3 == null ? "—" : `${t.volumenM3.toFixed(4)} m³`}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={24} />
                    {t.especieComun ?? "—"}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[length:var(--ts-2xs)]">
                    <span className="flex items-center gap-1 font-bold text-[var(--text-secondary)]">
                      <span className="h-2 w-2 rounded-full" style={{ background: puntoDeTono(m.tono) }} aria-hidden="true" />
                      {m.label}
                    </span>
                    <span className={`font-mono font-bold ${claseDias(d)}`} title={tituloDias(d)}>{d == null ? "sin fecha" : `${d} d parada`}</span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {n(t.d1Cm, 0)}·{n(t.d2Cm, 0)} cm · {n(t.largoM)} m · {t.gtfNumber ?? "—"}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>

          {filtradas.length > visibles.length && (
            <div className="border-t border-[var(--rule-soft)] p-3 text-center">
              <button
                type="button"
                onClick={() => setTope((v) => v + 200)}
                className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                Ver 200 más ({filtradas.length - visibles.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ label, onQuitar }: { label: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2 pr-1 font-bold text-[var(--accent-ink)] dark:bg-[var(--accent)]/12 dark:text-[var(--accent)]">
      {label}
      <button type="button" onClick={onQuitar} aria-label={`Quitar el filtro ${label}`} className="rounded-full p-0.5 hover:bg-[var(--surface-canvas)]">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
