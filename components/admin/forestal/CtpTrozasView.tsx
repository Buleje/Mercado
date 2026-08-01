"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, PackageOpen, AlertTriangle } from "@buleje/design-system/icons";
import { CardTitle, EmptyState } from "@buleje/design-system";
import EspecieFoto from "./EspecieFoto";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";

/**
 * Buscador de trozas por codificación (ADR-312).
 *
 * Es la consulta de un fiscalizador de OSINFOR, hecha al revés: él llega con un
 * código de troza del POA del título habilitante y pregunta "¿esta pieza entró
 * acá?". Antes había que abrir guía por guía; ahora se escribe el código y sale
 * el ingreso, su GTF y su origen.
 *
 * Sólo lee. Las trozas se crean con su guía y no se editan: una lista de trozas
 * retocable dejaría de ser prueba de nada.
 */

type Troza = {
  id: string;
  orden: number;
  codificacion: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  cantidad: number | null;
  volumenM3: number | null;
  ingreso: {
    id: string;
    libroNro: number | null;
    gtfNumber: string;
    serforNumeroRegistro: string | null;
    entryDate: string;
    providerName: string;
    especie: string;
    status: string;
    originCode: string | null;
    origen: string | null;
  };
};

export default function CtpTrozasView() {
  const [q, setQ] = useState("");
  const [trozas, setTrozas] = useState<Troza[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Fotos de referencia por especie: una sola carga para toda la vista. */
  const { indice: fotosEspecie } = useEspeciesFotos();

  const buscar = useCallback(async (texto: string) => {
    const t = texto.trim();
    if (!t) { setTrozas(null); setError(null); return; }
    setCargando(true); setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/trozas?codificacion=${encodeURIComponent(t)}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTrozas(((await r.json()).trozas ?? []) as Troza[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTrozas(null);
    } finally {
      setCargando(false);
    }
  }, []);

  // Debounce: el operador tipea el código completo, no una letra por consulta.
  useEffect(() => {
    const id = setTimeout(() => void buscar(q), 350);
    return () => clearTimeout(id);
  }, [q, buscar]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  /** Una misma codificación puede repetirse entre guías: se agrupa por ingreso. */
  const porIngreso = useMemo(() => {
    if (!trozas) return [];
    const m = new Map<string, { ingreso: Troza["ingreso"]; trozas: Troza[] }>();
    for (const t of trozas) {
      const g = m.get(t.ingreso.id) ?? { ingreso: t.ingreso, trozas: [] };
      g.trozas.push(t);
      m.set(t.ingreso.id, g);
    }
    return [...m.values()];
  }, [trozas]);

  return (
    <div className="space-y-5">
      <div>
        <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Trozas ingresadas</CardTitle>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Buscá por la codificación que trae la guía y mirá con qué GTF entró esa pieza.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="106/C, 13/A, 52…"
          aria-label="Codificación de la troza"
          className="h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 pr-10 text-base font-mono text-[var(--text-primary)] transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
        />
        {cargando && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]" />}
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-[var(--data-error-500)]/10 px-3 py-2.5 text-sm font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> No se pudo buscar: {error}
        </p>
      )}

      {!q.trim() && !cargando && (
        <EmptyState
          icon={PackageOpen}
          title="Escribí un código de troza"
          description="Las trozas se guardan cuando la guía se registra desde SERFOR. Cada una conserva su codificación, sus dimensiones y el volumen que declara el documento."
        />
      )}

      {q.trim() && trozas?.length === 0 && !cargando && (
        <EmptyState
          icon={Search}
          title={`Ninguna troza con «${q.trim()}»`}
          description="Puede ser de una guía cargada a mano: las listas de trozas sólo llegan con el alta desde SERFOR."
        />
      )}

      {porIngreso.map((g) => (
        <div key={g.ingreso.id} className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3">
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
              {g.ingreso.libroNro != null && <span className="mr-2 text-[var(--text-tertiary)]">N° {g.ingreso.libroNro}</span>}
              GTF {g.ingreso.gtfNumber}
            </span>
            <span className="text-xs text-[var(--text-secondary)]">{g.ingreso.providerName}</span>
            {g.ingreso.origen && <span className="text-xs text-[var(--text-tertiary)]">{g.ingreso.origen}</span>}
            {g.ingreso.originCode && (
              <span className="font-mono text-xs text-[var(--text-tertiary)]">Título {g.ingreso.originCode}</span>
            )}
            <span className="ml-auto text-xs text-[var(--text-tertiary)]">
              {new Date(g.ingreso.entryDate).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
            </span>
          </div>

          {/* Desktop: tabla. Mobile: tarjetas — la grilla de 6 columnas es
              ilegible en un teléfono, que es donde se usa en el patio. */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <th className="px-4 py-2 font-bold">Codificación</th>
                  <th className="px-4 py-2 font-bold">Especie</th>
                  <th className="px-4 py-2 font-bold">Dimensiones (guía)</th>
                  <th className="px-4 py-2 text-right font-bold">Largo</th>
                  <th className="px-4 py-2 text-right font-bold">Diám.</th>
                  <th className="px-4 py-2 text-right font-bold">Volumen</th>
                </tr>
              </thead>
              <tbody>
                {g.trozas.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--rule-soft)] last:border-0">
                    <td className="px-4 py-2.5 font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                      <span className="flex items-center gap-2">
                        <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={24} />
                        {t.especieComun ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--text-tertiary)]">{t.dimensiones ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.largoM != null ? `${t.largoM.toFixed(2)} m` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {t.diametroCm != null ? `${t.diametroCm.toFixed(1)} cm` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {t.volumenM3 != null ? `${t.volumenM3.toFixed(4)} m³` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-[var(--rule-soft)] sm:hidden">
            {g.trozas.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                    {t.volumenM3 != null ? `${t.volumenM3.toFixed(4)} m³` : "—"}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={24} />
                  {t.especieComun ?? "—"}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">
                  {t.dimensiones ?? "—"}
                  {t.largoM != null && t.diametroCm != null && ` · ${t.largoM.toFixed(2)} m × ${t.diametroCm.toFixed(1)} cm`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
