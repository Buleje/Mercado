"use client";

/**
 * Confirmar que se vacía el Libro de Operaciones — entero o por alcance.
 *
 * Borra el registro que acredita el origen legal de la madera, así que la
 * pantalla no pregunta «¿seguro?» y ya: muestra QUÉ hay —contado contra la base,
 * no estimado, y recontado cada vez que cambia el alcance elegido— y pide
 * escribir la frase. Un botón de confirmar se aprieta sin leer; una frase hay
 * que copiarla mirando lo que dice arriba.
 *
 * Si hay períodos cerrados ni siquiera ofrece el botón, sea cual sea el
 * alcance: ese mes ya se presentó ante SERFOR y reabrirlo es otra decisión,
 * con su propio motivo y rastro.
 *
 * **Alcances (Brandon, 2026-09-01):** antes sólo existía "todo". Un lote de
 * prueba mal cargado casi nunca ensucia el libro entero — a veces son sólo las
 * trozas del patio, o unas corridas de producción sin declarar. Forzar a
 * borrar todo para arreglar eso tira historia real por la ventana.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Trash2, X } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";

type ScopeVaciado = "trozas_disponibles" | "madera_disponible" | "consumo" | "todo";

type Conteo = {
  ingresos: number;
  trozas: number;
  produccion: number;
  despachos: number;
  consumos: number;
  origenes: number;
  total: number;
  saltadas?: number;
};

const ALCANCES: { valor: ScopeVaciado; label: string; hint: string }[] = [
  {
    valor: "trozas_disponibles",
    label: "Sólo trozas disponibles",
    hint: "Piezas del patio sin consumir ni despachar. Los ingresos (GTF) quedan.",
  },
  {
    valor: "madera_disponible",
    label: "Sólo madera aserrada disponible",
    hint: "Corridas de producción con saldo, sin despacho ni reproceso encima.",
  },
  {
    valor: "consumo",
    label: "Sólo Consumo",
    hint: "Todas las corridas de producción sin despacho ni reproceso encima.",
  },
  { valor: "todo", label: "Todo en general", hint: "El libro entero: ingresos, trozas, producción y despachos." },
];

export default function VaciarLibroModal({ onClose, onVaciado }: { onClose: () => void; onVaciado?: () => void }) {
  const [scope, setScope] = useState<ScopeVaciado>("todo");
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [palabra, setPalabra] = useState("VACIAR LIBRO");
  const [escrito, setEscrito] = useState("");
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ conteo: Conteo; scope: ScopeVaciado } | null>(null);

  const contar = useCallback(async (s: ScopeVaciado) => {
    setCargando(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/forestal/ctp-purga?scope=${s}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "no se pudo consultar");
      setConteo(j.conteo);
      setPeriodos(j.periodos ?? []);
      if (j.palabra) setPalabra(j.palabra);
    } catch (e) {
      logger.error("[ctp-purga] no se pudo contar el libro", { error: String(e), scope: s });
      setErr("No se pudo leer el estado del libro.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void contar(scope);
  }, [scope, contar]);

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
        body: JSON.stringify({ confirmacion: escrito, scope }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.message ?? "No se pudo vaciar el libro.");
        return;
      }
      setHecho({ conteo: j.borrado, scope });
      onVaciado?.();
    } catch (e) {
      logger.error("[ctp-purga] falló el vaciado", { error: String(e), scope });
      setErr("No se pudo enviar. Revisá la conexión.");
    } finally {
      setBorrando(false);
    }
  }, [escrito, scope, onVaciado]);

  const bloqueado = periodos.length > 0;
  const vacio = conteo != null && conteo.total === 0;
  const esParcial = scope !== "todo";

  /** Filas del desglose "Se va a borrar", según el alcance elegido: mostrar
   *  columnas en 0 que ese alcance nunca toca (ej. "Despachos" en Consumo) es
   *  ruido, no información. */
  const filasConteo = (c: Conteo): [string, number][] => {
    if (scope === "trozas_disponibles") return [["Trozas disponibles", c.trozas]];
    if (scope === "madera_disponible" || scope === "consumo") {
      const filas: [string, number][] = [["Corridas de producción", c.produccion], ["Consumos atribuidos", c.consumos]];
      if (c.saltadas) filas.push(["Se salvan (con despacho/reproceso/lote)", c.saltadas]);
      return filas;
    }
    return [
      ["Ingresos", c.ingresos],
      ["Trozas", c.trozas],
      ["Corridas de producción", c.produccion],
      ["Despachos", c.despachos],
      ["Consumos atribuidos", c.consumos],
      ["Orígenes de despacho", c.origenes],
    ];
  };

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
          <SectionTitle as="h2" className="text-lg font-extrabold text-[var(--text-primary)]">Vaciar el Libro de Operaciones</SectionTitle>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5">
          {!hecho && (
            <div>
              <p className="text-base font-extrabold text-[var(--text-primary)]">Qué vaciar</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {ALCANCES.map((a) => (
                  <label
                    key={a.valor}
                    className={`cursor-pointer rounded-xl border-2 px-3 py-2.5 transition-colors ${
                      scope === a.valor
                        ? "border-[var(--accent)] bg-[var(--accent)]/8"
                        : "border-[var(--rule-base)] hover:border-[var(--rule-strong)]"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="alcance-vaciado"
                        value={a.valor}
                        checked={scope === a.valor}
                        onChange={() => { setScope(a.valor); setEscrito(""); setHecho(null); }}
                        disabled={borrando}
                        className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>
                        <span className="block text-sm font-bold text-[var(--text-primary)]">{a.label}</span>
                        <span className="block text-xs text-[var(--text-tertiary)]">{a.hint}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {cargando && <p className="text-base text-[var(--text-tertiary)]">Contando lo que hay…</p>}

          {hecho ? (
            <div className="rounded-xl bg-[var(--data-success)]/10 p-4">
              <p className="text-base font-extrabold text-[var(--text-primary)]">
                {hecho.scope === "todo" ? "El libro quedó vacío." : `Se vació el alcance «${ALCANCES.find((a) => a.valor === hecho.scope)?.label}».`}
              </p>
              <p className="mt-1 text-base text-[var(--text-secondary)]">
                {hecho.scope === "todo" ? (
                  <>
                    Se borraron {hecho.conteo.ingresos} ingresos, {hecho.conteo.trozas} trozas, {hecho.conteo.produccion}{" "}
                    corridas y {hecho.conteo.despachos} despachos. Quedó registrado en la auditoría.
                  </>
                ) : hecho.scope === "trozas_disponibles" ? (
                  <>Se borraron {hecho.conteo.trozas} trozas del patio. Quedó registrado en la auditoría.</>
                ) : (
                  <>
                    Se borraron {hecho.conteo.produccion} corridas de producción
                    {hecho.conteo.saltadas ? ` (${hecho.conteo.saltadas} se salvaron por tener despacho, reproceso o lote encima)` : ""}.
                    Quedó registrado en la auditoría.
                  </>
                )}
              </p>
            </div>
          ) : (
            !cargando &&
            conteo && (
              <>
                {vacio ? (
                  <p className="text-base text-[var(--text-secondary)]">
                    {esParcial ? "Ese alcance ya está vacío: no hay nada que borrar." : "El libro ya está vacío: no hay nada que borrar."}
                  </p>
                ) : (
                  <>
                    <div className="rounded-xl bg-[var(--data-error)]/10 p-4">
                      <p className="flex items-start gap-2 text-base font-extrabold text-[var(--data-error)]">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                        Esto borra {esParcial ? "lo de este alcance" : "el libro entero"} y no se puede deshacer.
                      </p>
                      <p className="mt-2 text-base text-[var(--text-secondary)]">
                        El Libro de Operaciones es lo que acredita el origen legal de tu madera ante SERFOR y OSINFOR.
                        {esParcial
                          ? " Lo que quede fuera de este alcance no se toca."
                          : " Si lo vaciás, hay que volver a cargarlo o importarlo del SNIFFS."}
                      </p>
                    </div>

                    <div>
                      <p className="text-base font-extrabold text-[var(--text-primary)]">Se va a borrar</p>
                      <dl className="mt-2 grid grid-cols-2 gap-2">
                        {filasConteo(conteo).map(([t, v]) => (
                          <div key={t} className="rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
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
              <Trash2 className="h-5 w-5" /> {borrando ? "Vaciando…" : `Vaciar ${esParcial ? "este alcance" : "el libro"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
