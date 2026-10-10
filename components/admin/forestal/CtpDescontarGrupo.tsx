"use client";

/**
 * Una especie de «Descontar la madera usada» (ficha del permiso): sus corridas
 * sin materia prima, lo que le tocaría a cada una y lo que la frena.
 *
 *  · Hay un lote abierto con trozas aptas del permiso → «Vincular N».
 *  · No hay lote pero hay trozas libres aptas → «Armar lote y vincular N», con
 *    las que alcanzan al 56 % ya tildadas (se cambian en «Elegir trozas»).
 *  · Lo que no se puede (troza recibida después de la corrida, anotada en la
 *    fila de otra especie, que pasa lo que declara su fila) NO tiene botón: se
 *    dice en una línea con el camino para arreglarlo (revisión 25-09).
 *
 * El lote se arma por el camino de la pestaña Lotes (`POST` + `PATCH agregar`)
 * y lo que el servidor rechaza se muestra con su motivo, nunca en silencio.
 */

import { useEffect, useMemo, useState } from "react";
import { Boxes, ChevronDown, Layers, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { codigoDeTroza, repartoDelGrupo, type GrupoAVincular } from "@/lib/forestal/vincular-desde-permiso";
import { ddmm, lineasDeFreno } from "@/lib/forestal/vincular-desde-permiso-frenos";
import { fechaIngresoDeTroza } from "@/lib/forestal/consumo-trozas";
import type { TrozaRechazada } from "./hooks/use-lotes-aserrio-tipos";
import { Btn } from "./ctp-shared";
import { ChipsDelReparto, LineasDeFreno } from "./CtpDescontarPartes";
import { fechaDelLibro, plural } from "./permiso-volumen-ui";

const DATO = "font-mono tabular-nums text-[var(--text-primary)]";
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export default function CtpDescontarGrupo({
  grupo: g,
  ocupado,
  onVincular,
  onArmar,
}: {
  grupo: GrupoAVincular;
  /** Otra especie está escribiendo: una cosa por vez contra el mismo libro. */
  ocupado: boolean;
  onVincular: (loteId: string) => void;
  /** Arma el lote y abre la vinculación. Lanza con el mensaje del servidor. */
  onArmar: (trozaIds: string[]) => Promise<{ rechazadas: TrozaRechazada[] }>;
}) {
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(g.sugeridas));
  /* Si el patio se relee y la propuesta cambia, la selección arranca de la
     nueva — por clave de texto, no por la referencia que cambia en cada render. */
  const sugKey = g.sugeridas.join("|");
  useEffect(() => {
    setElegidas(new Set(sugKey ? sugKey.split("|") : []));
  }, [sugKey]);
  const [verTrozas, setVerTrozas] = useState(false);
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazadas, setRechazadas] = useState<TrozaRechazada[]>([]);

  const lote = g.origen === "lote" ? (g.lotes[0] ?? null) : null;
  /* Con libres, el reparto que se muestra es el de las trozas TILDADAS: lo que
     se ve es lo que se va a armar. Con lote, el del lote. */
  const reparto = useMemo(
    () =>
      lote
        ? g.reparto
        : repartoDelGrupo(g.corridas, g.especie, g.libres.filter((t) => elegidas.has(t.id)), undefined, {
            desde: g.trozasDesde,
            hayAptas: g.libres.length > 0,
          }).reparto,
    [lote, g, elegidas],
  );
  const ofrecibles = reparto.filter((r) => r.frena == null).length;
  const lineas = useMemo(() => lineasDeFreno({ ...g, reparto }), [g, reparto]);
  const elegidasM3 = r4(g.libres.filter((t) => elegidas.has(t.id)).reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0));
  const idCheck = (id: string) => `descontar-${g.clave}-${id}`.replace(/\s+/g, "-");
  const verbo = ofrecibles === 1 ? "Vincular 1 corrida" : `Vincular ${ofrecibles} corridas`;

  const armar = async () => {
    setArmando(true);
    setError(null);
    setRechazadas([]);
    try {
      const r = await onArmar(g.libres.filter((t) => elegidas.has(t.id)).map((t) => t.id));
      setRechazadas(r.rechazadas);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setArmando(false);
    }
  };

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  return (
    <li className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-base font-bold text-[var(--text-primary)]">{g.especie}</span>
        <span className="text-sm text-[var(--text-secondary)]">
          {plural(g.corridas.length, "corrida", "corridas")} · <span className={DATO}>{fmtM3(g.declaradoM3)}</span> m³ aserrada
        </span>
        <InfoTip
          title={`Corridas de ${g.especie}`}
          what={`Para no pasar el techo del 56 % hacen falta ≈ ${fmtM3(g.necesarioM3)} m³ de troza (lo declarado ÷ 0,56). A cada corrida sólo le toca troza que ya estaba en el patio ese día.`}
          ancho="w-80"
          body={g.corridas.slice(0, 12).map((c) => (
            <span key={c.id} className="block font-mono text-xs tabular-nums">
              N° {c.lineNo ?? "—"} · {fechaDelLibro(c.fecha)} · {fmtM3(c.producidoM3)} m³
            </span>
          ))}
        />
        <span className="ml-auto text-sm text-[var(--text-secondary)]">
          necesita ≈ <span className={DATO}>{fmtM3(g.necesarioM3)}</span> m³ de troza
        </span>
      </div>

      {(lote || g.libres.length > 0) && <ChipsDelReparto reparto={reparto} />}
      <LineasDeFreno lineas={lineas} />

      {lote && ofrecibles > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
            Lote <b className="font-mono text-[var(--text-primary)]">{lote.code}</b> ·{" "}
            {plural(lote.piezas, "troza apta", "trozas aptas")} · <span className={DATO}>{fmtM3(lote.m3)}</span> m³
          </p>
          <Btn variant="primary" disabled={ocupado} onClick={() => onVincular(lote.id)}>
            <Layers className="h-4 w-4" aria-hidden />
            {verbo}
          </Btn>
        </div>
      )}

      {/* Sin nada que ofrecer (todo frenado por fecha o fila) no hay lote que
          armar: la fila de «Elegir trozas» sería ruido junto al motivo. */}
      {!lote && g.libres.length > 0 && g.ofrecibles.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
              Lote con <span className={DATO}>{elegidas.size}</span> de{" "}
              {plural(g.libres.length, "troza apta", "trozas aptas")} · <span className={DATO}>{fmtM3(elegidasM3)}</span> m³
            </p>
            <button
              type="button"
              onClick={() => setVerTrozas((v) => !v)}
              aria-expanded={verTrozas}
              className="inline-flex h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              Elegir trozas
              <ChevronDown className={`h-4 w-4 transition-transform ${verTrozas ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {ofrecibles > 0 && (
              <Btn variant="primary" disabled={ocupado || armando || elegidas.size === 0} onClick={() => void armar()}>
                {armando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Boxes className="h-4 w-4" aria-hidden />}
                {armando ? "Armando el lote…" : `Armar lote y ${verbo.toLowerCase()}`}
              </Btn>
            )}
          </div>

          {verTrozas && (
            <ul className="grid gap-1 sm:grid-cols-2" aria-label={`Trozas aptas de ${g.especie} del permiso`}>
              {g.libres.map((t) => {
                const f = fechaIngresoDeTroza(t);
                return (
                  <li key={t.id}>
                    <label
                      htmlFor={idCheck(t.id)}
                      className="relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--rule-soft)] px-2.5 py-1.5 text-sm hover:border-[var(--accent)]"
                    >
                      {/* `relative` en el label: el sr-only no se escapa a la página. */}
                      <span className="sr-only">Troza</span>
                      <input
                        id={idCheck(t.id)}
                        type="checkbox"
                        checked={elegidas.has(t.id)}
                        onChange={() => alternar(t.id)}
                        disabled={armando}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-mono font-bold text-[var(--text-primary)]">
                            {codigoDeTroza(t) ?? "sin código"}
                          </span>
                          <span className={DATO}>{fmtM3(Number(t.volumenM3 ?? 0))} m³</span>
                        </span>
                        <span className="block truncate text-xs text-[var(--text-tertiary)]">
                          {[
                            t.gtfNumber ? `GTF ${t.gtfNumber}` : null,
                            f ? `en patio desde ${ddmm(f)}` : null,
                            t.largoM != null ? `${Number(t.largoM).toFixed(2)} m` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "sin guía ni largo"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {rechazadas.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-2.5 py-2">
          {rechazadas.map((r) => (
            <li key={r.id} className="text-sm text-[var(--text-secondary)]">
              <span className="font-mono font-bold">{r.codigo ?? r.id}</span> no entró: {r.motivo}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2.5 py-2 text-sm text-[var(--data-error-ink)]">
          {error}
        </p>
      )}
    </li>
  );
}
