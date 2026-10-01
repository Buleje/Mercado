"use client";

/**
 * LothContextoPanel — el CONTEXTO del plano: las referencias del territorio
 * (centros poblados, campamentos, punto de ingreso) y el cuadro "ACCESO A LA
 * UMF" (tramo · tiempo · movilidad) que lleva todo plano forestal oficial.
 *
 * Sin esto el plano ubica el polígono pero no dice cómo se llega — que es
 * justamente lo primero que mira quien va a fiscalizar. Se edita acá y se
 * imprime en la lámina de dispersión (Mapa 2, menú «Exportar» del mapa).
 *
 * Cada lista trae su propio «agregar» (marcar, trazar, tramo) en vez de un
 * botón suelto en la cabecera: lo que se agrega se agrega donde se lee. Marcar
 * y trazar suben al mapa, que es donde se toca.
 */

import { useState } from "react";
import { Check, Loader2, MapPin, Plus, Route, Save, Trash2 } from "@buleje/design-system/icons";
import {
  MOVILIDADES,
  REFERENCIA_TIPOS,
  VIA_TIPOS,
  type LothAcceso,
  type LothCartografia,
  type LothReferencia,
  type LothVia,
} from "@/lib/forestal/loth-cartografia";
import { formatDistance, formatMeters, lineLengthM, toUtm } from "@/lib/forestal/loth-utm";

/** Cuántas referencias, vías y tramos hay, para la cabecera del bloque plegado. */
export function resumenContexto(c: LothCartografia): string {
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
  return [
    n(c.referencias.length, "referencia", "referencias"),
    n(c.vias.length, "vía o río", "vías o ríos"),
    n(c.accesos.length, "tramo de acceso", "tramos de acceso"),
  ].join(" · ");
}

const INPUT =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm text-[var(--text-primary)]";
const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

interface Props {
  cartografia: LothCartografia;
  markMode: boolean;
  /** Hay una vía trazándose en el mapa. */
  trazando: boolean;
  saving: boolean;
  onChange: (next: LothCartografia) => void;
  onSave: () => void;
  onToggleMark: () => void;
  onTrazarVia: () => void;
}

export default function LothContextoPanel({
  cartografia,
  markMode,
  trazando,
  saving,
  onChange,
  onSave,
  onToggleMark,
  onTrazarVia,
}: Props) {
  const [saved, setSaved] = useState(false);
  const { referencias, accesos } = cartografia;

  const patchRef = (id: string, patch: Partial<LothReferencia>) =>
    onChange({ ...cartografia, referencias: referencias.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const delRef = (id: string) => onChange({ ...cartografia, referencias: referencias.filter((r) => r.id !== id) });

  const patchVia = (id: string, patch: Partial<LothVia>) =>
    onChange({ ...cartografia, vias: cartografia.vias.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  const delVia = (id: string) => onChange({ ...cartografia, vias: cartografia.vias.filter((v) => v.id !== id) });

  const patchAcc = (id: string, patch: Partial<LothAcceso>) =>
    onChange({ ...cartografia, accesos: accesos.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const delAcc = (id: string) => onChange({ ...cartografia, accesos: accesos.filter((a) => a.id !== id) });
  const addAcc = () =>
    onChange({
      ...cartografia,
      accesos: [...accesos, { id: `acc-${accesos.length + 1}-${accesos.length}`, lugar: "", tiempo: "", movilidad: MOVILIDADES[0] }],
    });

  const guardar = () => {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {/* Referencias */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Referencias ({referencias.length})</p>
            <button
              type="button"
              onClick={onToggleMark}
              aria-pressed={markMode}
              className={markMode ? `${BTN} border-transparent bg-[var(--brand-ink)] text-white hover:bg-[var(--brand-ink)]` : BTN}
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {markMode ? "Toca el mapa…" : "Marcar en el mapa"}
            </button>
          </div>
          {referencias.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
              Toca <b>Marcar en el mapa</b> y haz click donde está el centro poblado, el campamento o el ingreso a la UMF.
            </p>
          ) : (
            <ul className="space-y-2">
              {referencias.map((r) => {
                const u = toUtm(r.lat, r.lng);
                return (
                  <li key={r.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                    {/* Grilla y no flex-wrap: `min-w-*` no hace nada en este panel
                        (hay un `* { min-width: 0 }` sin capa) y cada campo caía en
                        su propio renglón. */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
                      <input
                        value={r.nombre}
                        onChange={(e) => patchRef(r.id, { nombre: e.target.value })}
                        aria-label="Nombre de la referencia"
                        className={`${INPUT} font-bold`}
                      />
                      <select
                        value={r.tipo}
                        onChange={(e) => patchRef(r.id, { tipo: e.target.value as LothReferencia["tipo"] })}
                        aria-label="Tipo de referencia"
                        className={`${INPUT} max-sm:order-last max-sm:col-span-2`}
                      >
                        {REFERENCIA_TIPOS.map((t) => (
                          <option key={t.tipo} value={t.tipo}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => delRef(r.id)}
                        aria-label={`Borrar ${r.nombre}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-700)] hover:bg-[var(--surface-raised)] dark:text-[var(--data-error-500)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                      {u.zone}
                      {u.band} · E {formatMeters(u.easting, 0)} · N {formatMeters(u.northing, 0)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Vías */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Vías y ríos ({cartografia.vias.length})</p>
            <button type="button" onClick={onTrazarVia} disabled={trazando} className={BTN}>
              <Route className="h-3.5 w-3.5" aria-hidden="true" /> {trazando ? "Trazando…" : "Trazar en el mapa"}
            </button>
          </div>
          {cartografia.vias.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
              Toca <b>Trazar en el mapa</b> (o <b>Dibujar → Vía o río</b> en la barra del mapa) para la carretera, la trocha de arrastre o el río.
            </p>
          ) : (
            <ul className="space-y-2">
              {cartografia.vias.map((v) => (
                <li key={v.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
                    <input
                      value={v.nombre}
                      onChange={(e) => patchVia(v.id, { nombre: e.target.value })}
                      aria-label="Nombre de la vía"
                      className={`${INPUT} font-bold`}
                    />
                    <select
                      value={v.tipo}
                      onChange={(e) => patchVia(v.id, { tipo: e.target.value as LothVia["tipo"] })}
                      aria-label="Tipo de vía"
                      className={`${INPUT} max-sm:order-last max-sm:col-span-2`}
                    >
                      {VIA_TIPOS.map((t) => (
                        <option key={t.tipo} value={t.tipo}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => delVia(v.id)}
                      aria-label={`Borrar ${v.nombre}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-700)] hover:bg-[var(--surface-raised)] dark:text-[var(--data-error-500)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                    {v.puntos.length} punto(s) · {formatDistance(lineLengthM(v.puntos))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cuadro de acceso: a lo ancho, un tramo por renglón como en el plano */}
        <div className="space-y-2 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Acceso a la UMF</p>
            <button type="button" onClick={addAcc} className={BTN}>
              <Plus className="h-3.5 w-3.5" /> Tramo
            </button>
          </div>
          {accesos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
              Agrega los tramos como en el expediente: <b>Puerto Bermúdez — C.P. Unión Siria · 30 min · auto-camioneta</b>.
            </p>
          ) : (
            <ul className="space-y-2">
              {accesos.map((a) => (
                <li
                  key={a.id}
                  className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 sm:grid-cols-[minmax(0,1fr)_6rem_11rem_auto]"
                >
                  <input
                    value={a.lugar}
                    onChange={(e) => patchAcc(a.id, { lugar: e.target.value })}
                    placeholder="Desde — Hasta"
                    aria-label="Tramo"
                    className={`${INPUT} max-sm:col-span-3`}
                  />
                  <input
                    value={a.tiempo}
                    onChange={(e) => patchAcc(a.id, { tiempo: e.target.value })}
                    placeholder="30 min"
                    aria-label="Tiempo"
                    className={INPUT}
                  />
                  <select
                    value={a.movilidad}
                    onChange={(e) => patchAcc(a.id, { movilidad: e.target.value })}
                    aria-label="Movilidad"
                    className={INPUT}
                  >
                    {MOVILIDADES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => delAcc(a.id)}
                    aria-label="Borrar tramo"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--data-error-700)] hover:bg-[var(--surface-raised)] dark:text-[var(--data-error-500)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-soft)] px-4 py-3">
        <button
          type="button"
          onClick={guardar}
          disabled={saving}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : saved ? <Check className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saved ? "Guardado" : "Guardar referencias y accesos"}
        </button>
      </div>
    </div>
  );
}
