"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Loader2, PackageCheck, PackageOpen, Scissors, ArrowDownRight } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import CtpRetrozarModal, { type TrozaParaCortar } from "./CtpRetrozarModal";
import CtpRecepcionTrozas from "./CtpRecepcionTrozas";
import { balanceRecepcion } from "@/lib/forestal/recepcion-trozas";

/**
 * La lista de trozas que amparó este ingreso (ADR-312).
 *
 * Vive aparte del modal porque se pide por red y sólo existe para los ingresos
 * cargados desde SERFOR: si la sección viviera adentro, el modal tendría que
 * cargar siempre algo que la mitad de los ingresos no tiene.
 *
 * Cuando no hay trozas no renderiza NADA —ni un "sin datos"—: un ingreso viejo
 * cargado a mano no tiene por qué mostrar un hueco.
 */

type Troza = {
  id: string;
  orden: number;
  codificacion: string | null;
  especieComun: string | null;
  dimensiones: string | null;
  largoM: number | null;
  diametroCm: number | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  cantidad: number | null;
  volumenM3: number | null;
  descarte?: boolean;
  observaciones?: string | null;
  /** Recepción física en patio (ADR-325). */
  parcela?: string | null;
  codigoPlanta?: string | null;
  noRecepcionada?: boolean;
  recepcionObs?: string | null;
  trozaOrigenId?: string | null;
  /** Los pedazos en que se cortó (ADR-313). Cuelgan de su madre, no van sueltos. */
  retrozos?: Troza[];
};

export default function CtpTrozasDeIngreso({
  entryId,
  volumenDelIngreso = null,
}: {
  entryId: string;
  /** m³ con que está registrado el ingreso, para contrastarlo con lo recibido. */
  volumenDelIngreso?: number | null;
}) {
  const [trozas, setTrozas] = useState<Troza[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cortando, setCortando] = useState<TrozaParaCortar | null>(null);
  const [recibiendo, setRecibiendo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/forestal/trozas?woodEntryId=${encodeURIComponent(entryId)}`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTrozas(((await r.json()).trozas ?? []) as Troza[]);
    } catch {
      setTrozas([]);
    } finally {
      setCargando(false);
    }
  }, [entryId]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando la lista de trozas…
      </div>
    );
  }
  if (!trozas || trozas.length === 0) return null;

  if (recibiendo) {
    return (
      <CtpRecepcionTrozas
        entryId={entryId}
        trozas={trozas}
        volumenDelIngreso={volumenDelIngreso}
        onCerrar={() => setRecibiendo(false)}
        onGuardado={() => { setRecibiendo(false); void cargar(); }}
      />
    );
  }

  const total = trozas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0);
  const balance = balanceRecepcion(trozas);

  return (
    <section className="@container overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-soft)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <PackageOpen className="h-4 w-4" />
          </span>
          <CardTitle as="h3" className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
            Lista de trozas · {trozas.length} pieza{trozas.length === 1 ? "" : "s"}
          </CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {balance.faltantes > 0 && (
            <span className="rounded-lg bg-[var(--data-error-50)] px-2 py-1 text-xs font-bold text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]">
              {balance.faltantes} no llegó al patio
            </span>
          )}
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{total.toFixed(4)} m³</span>
          <button
            type="button"
            onClick={() => setRecibiendo(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-primary)] hover:border-primary"
            title="Anotar código de planta, parcela de corta y qué trozas no llegaron"
          >
            <PackageCheck className="h-3.5 w-3.5" aria-hidden /> Recepción
          </button>
        </div>
      </div>

      {/* 9 columnas necesitan ~56rem. El umbral se mide contra el CONTENEDOR y no
          contra el viewport porque esto vive dentro del modal de detalle del
          ingreso: en una tablet a 768px el modal deja ~700px y `sm:` (640px)
          mostraba igual la tabla, apretada. */}
      <div className="hidden overflow-x-auto @4xl:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <th className="px-4 py-2 font-bold">Codificación</th>
              <th className="px-4 py-2 font-bold">Cód. planta</th>
              <th className="px-4 py-2 font-bold">Parcela</th>
              <th className="px-4 py-2 font-bold">Especie</th>
              <th className="px-4 py-2 font-bold">Dimensiones (guía)</th>
              <th className="px-4 py-2 text-right font-bold">Largo</th>
              <th className="px-4 py-2 text-right font-bold">Diám.</th>
              <th className="px-4 py-2 text-right font-bold">Volumen</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {trozas.map((t) => {
              const pedazos = t.retrozos ?? [];
              const cortado = pedazos.reduce((a, r) => a + (r.volumenM3 ?? 0), 0);
              const libre = (t.volumenM3 ?? 0) - cortado;
              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-[var(--rule-soft)]">
                    <td className="px-4 py-2.5 font-mono font-bold text-[var(--text-primary)]">
                      {t.codificacion ?? "—"}
                      {t.noRecepcionada && (
                        <span
                          title={t.recepcionObs ?? "Declarada en la guía pero no llegó al patio"}
                          className="ml-1.5 rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-transparent dark:text-[var(--data-error-500)]"
                        >
                          NO LLEGÓ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{t.codigoPlanta ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text-secondary)]">{t.parcela ?? "—"}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
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
                    <td className="px-2 py-2.5 text-right">
                      {/* Sólo se ofrece cortar si queda madera: con la troza ya
                          repartida el botón abriría un modal que sólo puede fallar. */}
                      {libre > 0.001 && (
                        <button
                          type="button"
                          onClick={() => setCortando({
                            id: t.id, codificacion: t.codificacion, especieComun: t.especieComun,
                            dimensiones: t.dimensiones, largoM: t.largoM, diametroCm: t.diametroCm,
                            d1Cm: t.d1Cm ?? t.diametroCm, d2Cm: t.d2Cm ?? t.diametroCm,
                            volumenM3: t.volumenM3,
                            retrozos: pedazos.map((r) => ({ volumenM3: r.volumenM3, largoM: r.largoM, descarte: r.descarte })),
                          })}
                          title={`Cortar ${t.codificacion ?? "la troza"} en pedazos`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)]"
                        >
                          <Scissors className="h-3.5 w-3.5" /> Retrozar
                        </button>
                      )}
                    </td>
                  </tr>

                  {pedazos.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60">
                      <td className="py-2 pl-8 pr-4 font-mono text-xs font-bold text-[var(--text-secondary)]">
                        <ArrowDownRight className="mr-1 inline h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />
                        {r.codificacion ?? "—"}
                        {r.descarte && (
                          <span className="ml-2 rounded-full bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                            descarte
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-[var(--text-tertiary)]">{r.observaciones ?? ""}</td>
                      <td className="px-4 py-2 font-mono text-xs text-[var(--text-tertiary)]">{r.dimensiones ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                        {r.largoM != null ? `${r.largoM.toFixed(2)} m` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                        {r.diametroCm != null ? `${r.diametroCm.toFixed(1)} cm` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                        {r.volumenM3 != null ? `${r.volumenM3.toFixed(4)} m³` : "—"}
                      </td>
                      <td />
                    </tr>
                  ))}

                  {pedazos.length > 0 && (
                    <tr className="border-b border-[var(--rule-soft)] last:border-0">
                      <td colSpan={9} className="px-4 py-1.5 pl-8 text-xs text-[var(--text-tertiary)]">
                        Cortado {cortado.toFixed(4)} m³ · quedan {Math.max(0, libre).toFixed(4)} m³ sin cortar
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)] @4xl:hidden">
        {trozas.map((t) => (
          <li key={t.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? "—"}</span>
              <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {t.volumenM3 != null ? `${t.volumenM3.toFixed(4)} m³` : "—"}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{t.especieComun ?? "—"}</p>
            <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">{t.dimensiones ?? "—"}</p>
          </li>
        ))}
      </ul>
      {cortando && (
        <CtpRetrozarModal
          troza={cortando}
          onClose={() => setCortando(null)}
          onSaved={() => { setCortando(null); void cargar(); }}
        />
      )}
    </section>
  );
}
