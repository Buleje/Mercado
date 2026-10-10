"use client";

/**
 * Pestaña «En el televisor» de «Ver en otra pantalla» (Modo TV): el paso a
 * paso, la cajita del código que muestra el TV, el nombre, qué cámaras y por
 * cuánto tiempo. Debajo, las pantallas ya vinculadas.
 */

import { useState } from "react";
import { CheckCircle2, Loader2, Tv } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import {
  codigoTvValido,
  normalizarCodigoTv,
  TV_CODIGO_LARGO,
  TV_DURACIONES_HORAS,
  TV_RUTAS,
  type TvDuracionHoras,
} from "@/lib/camaras/pantallas-tv";
import { DURACION_TEXTO } from "./otra-pantalla-ui";
import PantallasVinculadas from "./PantallasVinculadas";
import type { PantallasTv } from "./use-pantallas-tv";

const CAMPO =
  "mt-1 h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const ETIQUETA = "text-sm font-bold text-[var(--text-secondary)]";

interface Props {
  camaras: readonly { id: string; nombre: string }[];
  origen: string;
  /** Viene del QR del TV (`?vincularTv=`): el código ya puesto. */
  codigoInicial?: string;
  p: PantallasTv;
}

export default function OtraPantallaTv({ camaras, origen, codigoInicial = "", p }: Props) {
  const [codigo, setCodigo] = useState(normalizarCodigoTv(codigoInicial));
  const [nombre, setNombre] = useState("Televisor");
  const [todas, setTodas] = useState(true);
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set());
  const [horas, setHoras] = useState<TvDuracionHoras>(8);
  const [listo, setListo] = useState<string | null>(null);

  const limpio = normalizarCodigoTv(codigo);
  const valido = codigoTvValido(limpio);
  const camarasOk = todas || elegidas.size > 0;
  const puede = valido && nombre.trim().length > 0 && camarasOk && !p.guardando;

  const alternar = (id: string) =>
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const vincular = async () => {
    setListo(null);
    const n = nombre.trim();
    const ok = await p.vincular({ codigo: limpio, nombre: n, camaras: todas ? null : [...elegidas], horas });
    if (ok) {
      setListo(`Listo: «${n}» ya muestra las cámaras.`);
      setCodigo("");
    }
  };

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--text-primary)]">
        <li>
          En el navegador de tu Smart TV abre{" "}
          <span className="break-all font-mono font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {origen ? `${origen}${TV_RUTAS.pagina}` : TV_RUTAS.pagina}
          </span>
        </li>
        <li>Escribe aquí el código que aparece en la pantalla y vincúlalo.</li>
      </ol>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (puede) void vincular();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ETIQUETA}>Código del televisor</span>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="ABC-234"
              maxLength={TV_CODIGO_LARGO + 2}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={limpio.length === TV_CODIGO_LARGO && !valido}
              className={`${CAMPO} font-mono text-lg tracking-widest uppercase`}
            />
            {limpio.length === TV_CODIGO_LARGO && !valido && (
              <span className="mt-1 block text-xs text-[var(--data-error-ink)]">
                Ese código no es de un TV: no lleva 0, O, 1, I ni L.
              </span>
            )}
          </label>
          <label className="block">
            <span className={ETIQUETA}>Nombre de la pantalla</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} className={CAMPO} />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className={ETIQUETA}>Cámaras</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-primary)]">
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="radio" name="tv-camaras" checked={todas} onChange={() => setTodas(true)} />
              Todas (también las que agregues después)
            </label>
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="radio" name="tv-camaras" checked={!todas} onChange={() => setTodas(false)} />
              Elegir
            </label>
          </div>
          {!todas && (
            <ul className="grid gap-1 sm:grid-cols-2">
              {camaras.map((c) => (
                <li key={c.id}>
                  <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 text-sm text-[var(--text-primary)]">
                    <input type="checkbox" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} />
                    <span className="min-w-0 truncate">{c.nombre}</span>
                  </label>
                </li>
              ))}
              {camaras.length === 0 && (
                <li className="text-sm text-[var(--text-tertiary)]">Todavía no hay cámaras.</li>
              )}
            </ul>
          )}
        </fieldset>

        <div className="space-y-1">
          <span className={`${ETIQUETA} block`}>Por cuánto tiempo</span>
          <SegmentedControl<string>
            value={String(horas)}
            onChange={(v) => setHoras(Number(v) as TvDuracionHoras)}
            label="Por cuánto tiempo ve las cámaras"
            options={TV_DURACIONES_HORAS.map((h) => ({ value: String(h), label: DURACION_TEXTO[h] }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!puede}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-600,var(--accent))] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {p.guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Tv className="h-4 w-4" aria-hidden />}
            Vincular el televisor
          </button>
          {listo && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {listo}
            </span>
          )}
        </div>
        {p.error && (
          <p role="alert" className="text-sm text-[var(--data-error-ink)]">
            {p.error}
          </p>
        )}
      </form>

      <PantallasVinculadas camaras={camaras} p={p} />
    </div>
  );
}
