"use client";

/**
 * LothContextoPanel — el CONTEXTO del plano: las referencias del territorio
 * (centros poblados, campamentos, punto de ingreso) y el cuadro "ACCESO A LA
 * UMF" (tramo · tiempo · movilidad) que lleva todo plano forestal oficial.
 *
 * Sin esto el plano ubica el polígono pero no dice cómo se llega — que es
 * justamente lo primero que mira quien va a fiscalizar. Se edita acá y se
 * imprime en la lámina de dispersión (Mapa 2).
 */

import { useState } from "react";
import { Check, Loader2, MapPin, Plus, Printer, Save, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
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

const INPUT =
  "h-10 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 text-sm text-[var(--text-primary)]";
const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

interface Props {
  cartografia: LothCartografia;
  markMode: boolean;
  saving: boolean;
  onChange: (next: LothCartografia) => void;
  onSave: () => void;
  onToggleMark: () => void;
  onPrintDispersion: () => void;
}

export default function LothContextoPanel({
  cartografia,
  markMode,
  saving,
  onChange,
  onSave,
  onToggleMark,
  onPrintDispersion,
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
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <CardTitle as="h3" className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Contexto del plano · referencias y accesos
          </CardTitle>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
            Centros poblados, campamentos y el punto de ingreso, más el cuadro de cómo se llega a la UMF
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMark}
            aria-pressed={markMode}
            className={
              markMode
                ? "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-transparent bg-[var(--brand-ink)] px-3 text-xs font-bold text-white"
                : BTN
            }
          >
            <MapPin className="h-3.5 w-3.5" /> {markMode ? "Tocá el mapa…" : "Marcar en el mapa"}
          </button>
          <button type="button" onClick={guardar} disabled={saving} className={BTN}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? "Guardado" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onPrintDispersion}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
          >
            <Printer className="h-3.5 w-3.5" /> Mapa 2 · dispersión
          </button>
        </div>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {/* Referencias */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Referencias ({referencias.length})
          </p>
          {referencias.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
              Tocá <b>Marcar en el mapa</b> y hacé click donde está el centro poblado, el campamento o el ingreso a la UMF.
            </p>
          ) : (
            <ul className="space-y-2">
              {referencias.map((r) => {
                const u = toUtm(r.lat, r.lng);
                return (
                  <li key={r.id} className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={r.nombre}
                        onChange={(e) => patchRef(r.id, { nombre: e.target.value })}
                        aria-label="Nombre de la referencia"
                        className={`${INPUT} flex-1 min-w-[8rem] font-bold`}
                      />
                      <select
                        value={r.tipo}
                        onChange={(e) => patchRef(r.id, { tipo: e.target.value as LothReferencia["tipo"] })}
                        aria-label="Tipo de referencia"
                        className={`${INPUT} w-40`}
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--data-error-700)] hover:bg-[var(--surface-raised)] dark:text-[var(--data-error-500)]"
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
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Vías y ríos ({cartografia.vias.length})
          </p>
          {cartografia.vias.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
              Usá <b>Trazar vía</b> arriba del mapa para dibujar la carretera, la trocha de arrastre o el río.
            </p>
          ) : (
            <ul className="space-y-2">
              {cartografia.vias.map((v) => (
                <li key={v.id} className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={v.nombre}
                      onChange={(e) => patchVia(v.id, { nombre: e.target.value })}
                      aria-label="Nombre de la vía"
                      className={`${INPUT} min-w-[8rem] flex-1 font-bold`}
                    />
                    <select
                      value={v.tipo}
                      onChange={(e) => patchVia(v.id, { tipo: e.target.value as LothVia["tipo"] })}
                      aria-label="Tipo de vía"
                      className={`${INPUT} w-44`}
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
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--data-error-700)] hover:bg-[var(--surface-raised)] dark:text-[var(--data-error-500)]"
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

        {/* Cuadro de acceso */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Acceso a la UMF</p>
            <button type="button" onClick={addAcc} className={BTN}>
              <Plus className="h-3.5 w-3.5" /> Tramo
            </button>
          </div>
          {accesos.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-sm text-[var(--text-tertiary)]">
              Agregá los tramos como en el expediente: <b>Puerto Bermúdez — C.P. Unión Siria · 30 min · auto-camioneta</b>.
            </p>
          ) : (
            <ul className="space-y-2">
              {accesos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-2.5">
                  <input
                    value={a.lugar}
                    onChange={(e) => patchAcc(a.id, { lugar: e.target.value })}
                    placeholder="Desde — Hasta"
                    aria-label="Tramo"
                    className={`${INPUT} min-w-[10rem] flex-1`}
                  />
                  <input
                    value={a.tiempo}
                    onChange={(e) => patchAcc(a.id, { tiempo: e.target.value })}
                    placeholder="30 min"
                    aria-label="Tiempo"
                    className={`${INPUT} w-24`}
                  />
                  <select
                    value={a.movilidad}
                    onChange={(e) => patchAcc(a.id, { movilidad: e.target.value })}
                    aria-label="Movilidad"
                    className={`${INPUT} w-44`}
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--data-error-700)] hover:bg-[var(--surface-raised)] dark:text-[var(--data-error-500)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
