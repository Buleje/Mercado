"use client";

/**
 * «Esta producción no dice de qué madera salió» — vincularle su lote (ADR-408).
 *
 * La corrida nació en «Producir sin lote»: la sierra cortó, el parte se anotó y
 * el lote se armó después. Acá se le pone el origen que le falta, y NO se firma
 * a ciegas: antes de escribir, la pantalla corre las cinco reglas acordadas
 * (especie, volumen, largo, fecha y disponibilidad) y muestra qué pasa con ESTAS
 * trozas contra ESTA corrida.
 *
 * Los **errores** bloquean el botón; los **avisos** se leen y se firma igual. Un
 * error dice «esto no puede haber pasado»; un aviso, «esto puede haber pasado y
 * hay que poder explicarlo».
 *
 * La escritura la hace el MISMO endpoint que usa Consumos (`sumar-corrida`): los
 * consumos por guía, el volumen de entrada y el marcado de las trozas viven en
 * un solo lugar, con sus locks y sus invariantes. Acá no hay una segunda forma
 * de atribuir materia prima.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Layers, Loader2, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { piezasLibres, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  largoMaxEnMetros,
  revisarVinculacion,
  type CorridaAVincular,
  type TrozaAVincular,
} from "@/lib/forestal/vincular-produccion";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { Btn } from "./ctp-shared";

const TH = "px-2 py-1.5 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

/** Sin tildes ni mayúsculas — la misma comparación que usa el resto del módulo. */
const norma = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function CtpVincularMateriaPrimaModal({
  corrida,
  lotes,
  onCerrar,
  onListo,
}: {
  corrida: CorridaAVincular & { id: string };
  /** Los lotes del tenant (ya vienen con sus trozas del hook). */
  lotes: LoteAserrio[];
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  /* Sólo lotes abiertos y de la MISMA especie: ofrecer los otros es ofrecer un
     error que la revisión va a rechazar dos clics después. */
  const candidatos = useMemo(
    () => lotes.filter(
      (l) => l.status === "abierto" &&
        (!corrida.especie || norma(l.speciesCommon) === norma(corrida.especie)) &&
        piezasLibres(l).length > 0,
    ),
    [lotes, corrida.especie],
  );
  const [loteId, setLoteId] = useState<string>("");
  const lote = candidatos.find((l) => l.id === loteId) ?? null;
  const libres = useMemo(() => (lote ? piezasLibres(lote) : []), [lote]);

  /* Al elegir lote se tildan TODAS sus piezas libres: el caso normal es «este
     lote entero fue el que se aserró». Destildar es más rápido que tildar 40. */
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  useEffect(() => { setElegidas(new Set(libres.map((t) => t.id))); }, [libres]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  useModalAccesible(cajaRef, { onCerrar: guardando ? undefined : onCerrar });

  /**
   * El largo de la pieza más larga sale de los PAQUETES de la corrida, que el
   * listado del libro no trae. Sin esto la regla del largo sólo podría avisar
   * «no se puede comprobar» — y es justo la que impide declarar que de una
   * troza de 3 m salió una tabla de 6.
   */
  const [largoMaxM, setLargoMaxM] = useState<number | null>(corrida.largoMaxPiezaM);
  useEffect(() => {
    let vivo = true;
    ctpGet<{ corridas?: { id: string; paquetes?: { largoM?: number | null }[] }[] }>(
      "/api/admin/forestal/ctp?disponibles=1",
    )
      .then((j) => {
        if (!vivo) return;
        const c = (j.corridas ?? []).find((x) => x.id === corrida.id);
        if (c?.paquetes?.length) setLargoMaxM(largoMaxEnMetros(c.paquetes));
      })
      .catch(() => { /* sin paquetes la regla avisa, que es lo honesto */ });
    return () => { vivo = false; };
  }, [corrida.id]);

  const trozas: TrozaAVincular[] = useMemo(
    () => libres.filter((t) => elegidas.has(t.id)).map((t) => ({
      id: t.id,
      codigo: t.codigoPlanta ?? t.codificacion,
      volumenM3: Number(t.volumenM3 ?? 0),
      largoM: t.largoM == null ? null : Number(t.largoM),
      /* El hook ya filtró las consumidas; lo que llegue acá está libre. Si el
         servidor ve otra cosa (T1, cierre, congelado), manda él. */
      noDisponible: null,
    })),
    [libres, elegidas],
  );

  const revision = useMemo(
    () => (lote
      ? revisarVinculacion(
          { ...corrida, largoMaxPiezaM: largoMaxM },
          { code: lote.code, especie: lote.speciesCommon, status: lote.status },
          trozas,
        )
      : null),
    [corrida, lote, trozas, largoMaxM],
  );

  const vincular = async () => {
    if (!lote || !revision?.puedeVincular) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/lotes-aserrio", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          accion: "sumar-corrida",
          loteId: lote.id,
          corridaId: corrida.id,
          trozaIds: trozas.map((t) => t.id),
          fecha: corrida.fecha.slice(0, 10),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string; volumenM3?: number };
      if (!r.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);
      invalidarCtp();
      onListo(
        `Materia prima vinculada: ${trozas.length} troza(s) · ${fmtM3(revision.trozaM3)} m³ del lote ${lote.code} ` +
          `quedaron atribuidas a la corrida N° ${corrida.lineNo ?? "—"}` +
          (revision.rendimientoPct != null ? ` · rendimiento ${revision.rendimientoPct} %` : "") + ".",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const errores = revision?.hallazgos.filter((h) => h.severidad === "error") ?? [];
  const avisos = revision?.hallazgos.filter((h) => h.severidad === "aviso") ?? [];

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Vincular materia prima"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--rule-base)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-display text-lg text-[var(--text-primary)]">
              <Layers className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Vincular materia prima
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              Corrida N° {corrida.lineNo ?? "—"} · {corrida.especie ?? "sin especie"} ·{" "}
              <span className="font-mono">{fmtM3(corrida.producidoM3)} m³</span> declarados el {corrida.fecha.slice(0, 10)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Lote de aserrío
            </span>
            <select
              value={loteId}
              onChange={(e) => setLoteId(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Elegí el lote que entró a la sierra…</option>
              {candidatos.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.speciesCommon} · {piezasLibres(l).length} trozas libres
                </option>
              ))}
            </select>
            {candidatos.length === 0 && (
              <span className="mt-1 block text-xs text-[var(--text-tertiary)]">
                No hay lotes abiertos de {corrida.especie ?? "esa especie"} con trozas libres. Armá el lote
                primero en <b>Lotes</b> y volvé.
              </span>
            )}
          </label>

          {lote && (
            <>
              <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
                <table className="w-full">
                  <caption className="sr-only">Trozas del lote {lote.code}</caption>
                  <thead className="bg-[var(--surface-sunken)]">
                    <tr>
                      <th scope="col" className={`${TH} w-8 text-center`}>
                        <input
                          type="checkbox"
                          checked={elegidas.size === libres.length && libres.length > 0}
                          onChange={() =>
                            setElegidas((prev) => (prev.size === libres.length ? new Set() : new Set(libres.map((t) => t.id))))
                          }
                          aria-label="Elegir todas las trozas"
                          className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                        />
                      </th>
                      <th scope="col" className={TH}>Troza</th>
                      <th scope="col" className={`${TH} text-right`}>m³</th>
                      <th scope="col" className={`${TH} text-right`}>Largo (m)</th>
                      <th scope="col" className={TH}>Guía</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libres.map((t) => (
                      <tr key={t.id} className="border-t border-[var(--rule-soft)]">
                        <td className={`${TD} text-center`}>
                          <input
                            type="checkbox"
                            checked={elegidas.has(t.id)}
                            onChange={() =>
                              setElegidas((prev) => {
                                const next = new Set(prev);
                                if (next.has(t.id)) next.delete(t.id);
                                else next.add(t.id);
                                return next;
                              })
                            }
                            aria-label={`Elegir la troza ${t.codigoPlanta ?? t.codificacion ?? t.id}`}
                            className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                          />
                        </td>
                        <td className={`${TD} font-mono text-[var(--text-primary)]`}>
                          {t.codigoPlanta ?? t.codificacion ?? "—"}
                        </td>
                        <td className={NUM}>{fmtM3(Number(t.volumenM3 ?? 0))}</td>
                        <td className={NUM}>{t.largoM == null ? "—" : Number(t.largoM).toFixed(2)}</td>
                        <td className={`${TD} text-[length:var(--ts-2xs)]`}>{t.gtfNumber ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <td className={TD} />
                      <th scope="row" className={`${TD} text-left`}>
                        {elegidas.size} de {libres.length} trozas
                      </th>
                      <td className={NUM}>{fmtM3(revision?.trozaM3 ?? 0)}</td>
                      <td className={NUM} colSpan={2}>
                        {revision?.rendimientoPct != null ? `rendimiento ${revision.rendimientoPct} %` : ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* La revisión: lo que impide firmar y lo que hay que poder explicar. */}
              {errores.length > 0 && (
                <ul className="space-y-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 p-3">
                  {errores.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>{h.mensaje}</span>
                    </li>
                  ))}
                </ul>
              )}
              {avisos.length > 0 && (
                <ul className="space-y-1.5 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
                  {avisos.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
                      <span>{h.mensaje}</span>
                    </li>
                  ))}
                </ul>
              )}
              {errores.length === 0 && avisos.length === 0 && elegidas.size > 0 && (
                <p className="flex items-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                  <Check className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
                  Especie, volumen, largo, fechas y disponibilidad: las cinco cuadran.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--rule-base)] px-4 py-3">
          <Btn onClick={onCerrar} disabled={guardando}>Cancelar</Btn>
          <button
            type="button"
            onClick={() => void vincular()}
            disabled={guardando || !revision?.puedeVincular || elegidas.size === 0}
            title={
              revision?.puedeVincular
                ? "Escribe los consumos, marca las trozas y deja la corrida con su origen"
                : "Hay algo que no cuadra: mirá los avisos rojos"
            }
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Layers className="h-4 w-4" aria-hidden />}
            {guardando ? "Vinculando…" : "Vincular al lote"}
          </button>
        </div>
      </div>
    </div>
  );
}
