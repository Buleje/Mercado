"use client";

/**
 * Confirmar que se vacía el Libro de Operaciones.
 *
 * Borra el registro que acredita el origen legal de la madera, así que la
 * pantalla no pregunta «¿seguro?» y ya: muestra QUÉ hay —contado contra la base,
 * no estimado— y pide escribir la frase. Un botón de confirmar se aprieta sin
 * leer; una frase hay que copiarla mirando lo que dice arriba.
 *
 * Si hay períodos cerrados ni siquiera ofrece el botón: ese mes ya se presentó
 * ante SERFOR y reabrirlo es otra decisión, con su propio motivo y rastro.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "@buleje/design-system/icons";
import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";

type Conteo = {
  ingresos: number;
  trozas: number;
  produccion: number;
  despachos: number;
  consumos: number;
  origenes: number;
  total: number;
};

export default function VaciarLibroModal({ onClose, onVaciado }: { onClose: () => void; onVaciado?: () => void }) {
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [palabra, setPalabra] = useState("VACIAR LIBRO");
  const [escrito, setEscrito] = useState("");
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Conteo | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/forestal/ctp-purga", { credentials: "include" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "no se pudo consultar");
        setConteo(j.conteo);
        setPeriodos(j.periodos ?? []);
        if (j.palabra) setPalabra(j.palabra);
      } catch (e) {
        logger.error("[ctp-purga] no se pudo contar el libro", { error: String(e) });
        setErr("No se pudo leer el estado del libro.");
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const vaciar = useCallback(async () => {
    setBorrando(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp-purga", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ confirmacion: escrito }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.message ?? "No se pudo vaciar el libro.");
        return;
      }
      setHecho(j.borrado);
      onVaciado?.();
    } catch (e) {
      logger.error("[ctp-purga] falló el vaciado", { error: String(e) });
      setErr("No se pudo enviar. Revisá la conexión.");
    } finally {
      setBorrando(false);
    }
  }, [escrito, onVaciado]);

  const bloqueado = periodos.length > 0;
  const vacio = conteo != null && conteo.total === 0 && conteo.trozas === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Vaciar el Libro de Operaciones"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-3 pt-5">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">Vaciar el Libro de Operaciones</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
          {cargando && <p className="text-base text-[var(--text-tertiary)]">Contando lo que hay…</p>}

          {hecho ? (
            <div className="rounded-xl bg-[var(--data-success)]/10 p-4">
              <p className="text-base font-extrabold text-[var(--text-primary)]">El libro quedó vacío.</p>
              <p className="mt-1 text-base text-[var(--text-secondary)]">
                Se borraron {hecho.ingresos} ingresos, {hecho.trozas} trozas, {hecho.produccion} corridas y{" "}
                {hecho.despachos} despachos. Quedó registrado en la auditoría.
              </p>
            </div>
          ) : (
            conteo && (
              <>
                {vacio ? (
                  <p className="text-base text-[var(--text-secondary)]">El libro ya está vacío: no hay nada que borrar.</p>
                ) : (
                  <>
                    <div className="rounded-xl bg-[var(--data-error)]/10 p-4">
                      <p className="flex items-start gap-2 text-base font-extrabold text-[var(--data-error)]">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                        Esto borra el libro entero y no se puede deshacer.
                      </p>
                      <p className="mt-2 text-base text-[var(--text-secondary)]">
                        El Libro de Operaciones es lo que acredita el origen legal de tu madera ante SERFOR y OSINFOR.
                        Si lo vaciás, hay que volver a cargarlo o importarlo del SNIFFS.
                      </p>
                    </div>

                    <div>
                      <p className="text-base font-extrabold text-[var(--text-primary)]">Se va a borrar</p>
                      <dl className="mt-2 grid grid-cols-2 gap-2">
                        {[
                          ["Ingresos", conteo.ingresos],
                          ["Trozas", conteo.trozas],
                          ["Corridas de producción", conteo.produccion],
                          ["Despachos", conteo.despachos],
                          ["Consumos atribuidos", conteo.consumos],
                          ["Orígenes de despacho", conteo.origenes],
                        ].map(([t, v]) => (
                          <div key={String(t)} className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
                            <dt className="text-sm text-[var(--text-tertiary)]">{t}</dt>
                            <dd className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    {bloqueado ? (
                      <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning)]/10 px-4 py-3 text-base font-semibold text-[var(--data-warning)]">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                        <span>
                          No se puede vaciar: hay {periodos.length} período{periodos.length === 1 ? "" : "s"} cerrado
                          {periodos.length === 1 ? "" : "s"} ({periodos.join(", ")}). Ese mes ya se presentó ante SERFOR
                          — reabrilo desde el libro si de verdad hay que borrarlo.
                        </span>
                      </p>
                    ) : (
                      <div>
                        <label htmlFor="confirmar-purga" className="text-base font-semibold text-[var(--text-primary)]">
                          Escribí <strong className="font-mono">{palabra}</strong> para confirmar
                        </label>
                        <input
                          id="confirmar-purga"
                          value={escrito}
                          onChange={(e) => setEscrito(e.target.value)}
                          autoComplete="off"
                          placeholder={palabra}
                          className="mt-1 h-12 w-full rounded-xl bg-[var(--surface-sunken)] px-4 text-base font-bold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--data-error)]"
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )
          )}

          {err && (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--data-error)]/10 px-4 py-3 text-base font-semibold text-[var(--data-error)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {err}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 bg-[var(--surface-sunken)] px-6 py-4">
          <button
            onClick={onClose}
            className="h-12 rounded-xl px-5 text-base font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)]"
          >
            {hecho ? "Cerrar" : "Mejor no"}
          </button>
          {!hecho && !vacio && !bloqueado && conteo && (
            <button
              onClick={() => void vaciar()}
              disabled={borrando || escrito.trim().toUpperCase() !== palabra}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--data-error)] px-5 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Trash2 className="h-5 w-5" /> {borrando ? "Vaciando…" : "Vaciar el libro"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
