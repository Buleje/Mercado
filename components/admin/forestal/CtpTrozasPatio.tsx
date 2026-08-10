"use client";

/**
 * CtpTrozasPatio — el panorama del patio, pieza por pieza.
 *
 * Consumos cuenta metros cúbicos por guía: cuánta madera de qué GTF entró a qué
 * corrida. Acá la unidad es **la troza**, que es como se trabaja en el patio: se
 * señala un tronco, no un porcentaje de una guía. Responde lo que Consumos no
 * puede: cuántas piezas hay paradas, cuáles se pueden llevar a la sierra hoy,
 * cuáles están apartadas para otra corrida, cuáles nunca bajaron del camión y
 * —lo que cuesta plata— **hace cuánto que están ahí**.
 *
 * La madera en troza se mancha y se raja: el tramo de antigüedad es el aviso de
 * que hay que aserrar eso primero (FIFO).
 *
 * Presentacional: los datos llegan por props desde `use-trozas-patio`, para que
 * el resumen y la lista de abajo nunca cuenten cosas distintas.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { Boxes, Clock, RefreshCw, Trees } from "@buleje/design-system/icons";
import {
  antiguedadDelPatio,
  ESTADO_META,
  resumirPatio,
  type EstadoTroza,
} from "@/lib/forestal/trozas-patio";
import type { PatioMeta, TrozaPatioAPI } from "./hooks/use-trozas-patio";

const n2 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** Color por tono, con los tokens del DS (siguen el tema). */
const TONO = {
  ok: { texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", punto: "var(--data-success-500)" },
  info: { texto: "text-[var(--accent-ink)] dark:text-[var(--accent)]", punto: "var(--data-6)" },
  warn: { texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", punto: "var(--data-warning-500)" },
  danger: { texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", punto: "var(--data-error-500)" },
  muted: { texto: "text-[var(--text-secondary)]", punto: "var(--rule-strong)" },
} as const;

export type TonoPatio = keyof typeof TONO;
export const puntoDeTono = (t: TonoPatio) => TONO[t].punto;

export interface CtpTrozasPatioProps {
  trozas: readonly TrozaPatioAPI[];
  meta: PatioMeta;
  cargando: boolean;
  onRecargar: () => void;
  /** El estado que la lista de abajo está mostrando, para marcarlo acá. */
  estadoFiltro: EstadoTroza | null;
  onEstadoFiltro: (e: EstadoTroza | null) => void;
  /** El tramo de antigüedad elegido (`key` de `TRAMOS_ANTIGUEDAD`). */
  tramoFiltro: string | null;
  onTramoFiltro: (k: string | null) => void;
}

export default function CtpTrozasPatio({
  trozas, meta, cargando, onRecargar, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro,
}: CtpTrozasPatioProps) {
  const resumen = useMemo(() => resumirPatio(trozas), [trozas]);
  /* `hoy` fijo mientras no cambien los datos: recalcularlo en cada pintada hace
     que la antigüedad se mueva sola a mitad de una sesión larga. */
  const edad = useMemo(() => antiguedadDelPatio(trozas, new Date()), [trozas]);

  const libres = resumen.porEstado.find((e) => e.estado === "libre");
  const maxEspecie = Math.max(1, ...resumen.porEspecie.map((e) => e.m3));
  const tonoEdad: TonoPatio =
    edad.masVieja == null ? "muted" : edad.masVieja >= 60 ? "danger" : edad.masVieja >= 30 ? "warn" : "ok";
  /* Mientras se lee, las cifras muestran «…» y no 0: un cero se lee como un
     patio vacío, que es la afirmación más cara de esta pantalla. */
  const leyendo = cargando && trozas.length === 0;
  const cifra = (v: number | string) => (leyendo ? "…" : String(v));

  return (
    <div className="space-y-3">
      {/* ── Lo que hay parado ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Trees className="h-4 w-4 text-[var(--accent)]" /> El patio, pieza por pieza
          </CardTitle>
          <button
            type="button" onClick={onRecargar} disabled={cargando}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} /> Actualizar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cifra label="Paradas en patio" valor={cifra(resumen.enPatio.piezas)} nota={leyendo ? "leyendo el patio…" : `${n2(resumen.enPatio.m3)} m³ ocupando cancha`} icono={Boxes} />
          <Cifra label="Listas para sierra" valor={cifra(libres?.piezas ?? 0)} nota={leyendo ? "" : `${n2(libres?.m3 ?? 0)} m³ sin apartar`} tono="ok" />
          <Cifra
            label="La más vieja"
            valor={cifra(edad.masVieja != null ? `${edad.masVieja} d` : "—")}
            nota={edad.masVieja != null && edad.masVieja >= 60 ? "riesgo de mancha" : "días parada"}
            tono={tonoEdad}
            icono={Clock}
          />
          <Cifra
            label="Piezas registradas"
            valor={cifra(resumen.total.piezas)}
            nota={meta.truncado ? `de ${meta.total} que hay` : "de todas las guías"}
            tono={meta.truncado ? "warn" : "muted"}
          />
        </div>

        {resumen.sinCodificar > 0 && (
          <p className="mt-2 rounded-lg bg-[var(--data-warning-500)]/12 px-2.5 py-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {resumen.sinCodificar} {resumen.sinCodificar === 1 ? "pieza no tiene" : "piezas no tienen"} codificación: no se pueden pedir por su código en una fiscalización.
          </p>
        )}
        {meta.truncado && (
          <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
            Se leyeron {meta.devueltas} de {meta.total} piezas — los totales de esta pantalla son sobre lo leído, no sobre el patio entero.
          </p>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {/* ── En qué anda cada pieza ─────────────────────────────────────── */}
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
          <CardTitle as="h3" className="mb-2 text-sm font-bold text-[var(--text-primary)]">En qué anda cada pieza</CardTitle>
          <ul className="space-y-1">
            {resumen.porEstado.map(({ estado, piezas, m3 }) => {
              const m = ESTADO_META[estado];
              const tono = TONO[m.tono];
              const activo = estadoFiltro === estado;
              return (
                <li key={estado}>
                  <button
                    type="button"
                    onClick={() => onEstadoFiltro(activo ? null : estado)}
                    aria-pressed={activo}
                    title={`${m.hint} · tocá para ver sólo estas en la lista`}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${activo ? "bg-primary/10 ring-2 ring-[var(--accent)] dark:bg-[var(--accent)]/12" : "bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)]"}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tono.punto }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-[var(--text-primary)]">{m.label}</span>
                      <span className="block truncate text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{m.hint}</span>
                    </span>
                    {/* El conteo va en el token de texto y NO en el color del
                        estado: medido, `--data-warning-700` da 3.68:1 en light
                        y el número queda ilegible. El color ya está en el punto
                        de la izquierda, que es una marca y no un dato. */}
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">{piezas}</span>
                      <span className="block font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">{n2(m3)} m³</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {resumen.porEstado.length === 0 && !cargando && (
              <li className="rounded-lg border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-xs text-[var(--text-secondary)]">
                Todavía no hay trozas cargadas. Llegan con el alta de la guía desde SERFOR.
              </li>
            )}
          </ul>
        </div>

        {/* ── Hace cuánto están ahí + qué especies ───────────────────────── */}
        <div className="space-y-3">
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
            <CardTitle as="h3" className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <Clock className="h-4 w-4 text-[var(--accent)]" /> Hace cuánto están paradas
            </CardTitle>
            <ul className="space-y-1">
              {edad.tramos.map((t) => {
                const tono = TONO[t.tono];
                const pct = resumen.enPatio.piezas > 0 ? (t.piezas / resumen.enPatio.piezas) * 100 : 0;
                const activo = tramoFiltro === t.key;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => onTramoFiltro(activo ? null : t.key)}
                      aria-pressed={activo}
                      disabled={t.piezas === 0}
                      title="Tocá para ver sólo estas en la lista"
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors disabled:cursor-default disabled:opacity-60 ${activo ? "bg-primary/10 ring-2 ring-[var(--accent)] dark:bg-[var(--accent)]/12" : "bg-[var(--surface-sunken)] enabled:hover:bg-[var(--surface-canvas)]"}`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tono.punto }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-left text-xs font-bold text-[var(--text-primary)]">{t.label}</span>
                      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--rule-base)]">
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tono.punto }} />
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">{t.piezas}</span>
                        <span className="ml-1.5 font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">{n2(t.m3)} m³</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]">
              Cuenta desde que la pieza bajó del camión (o desde el asiento de su guía) y sólo mira lo que sigue parado
              {edad.sinFecha > 0 && <> · {edad.sinFecha} sin fecha, fuera del reparto</>}.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
            <CardTitle as="h3" className="mb-2 text-sm font-bold text-[var(--text-primary)]">Por especie</CardTitle>
            <ul className="max-h-52 space-y-1 overflow-y-auto">
              {resumen.porEspecie.slice(0, 12).map((e) => (
                <li key={e.especie} className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-bold text-[var(--text-primary)]">{e.especie}</span>
                    <span className="shrink-0 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)]">
                      {e.piezas} pz · {n2(e.m3)} m³
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rule-base)]">
                      <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(e.m3 / maxEspecie) * 100}%` }} />
                    </span>
                    <span className="shrink-0 font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      {n2(e.m3Libres)} m³ libres
                    </span>
                  </div>
                </li>
              ))}
              {resumen.porEspecie.length === 0 && !cargando && (
                <li className="rounded-lg border-2 border-dashed border-[var(--rule-base)] p-4 text-center text-xs text-[var(--text-secondary)]">Sin especies para mostrar.</li>
              )}
            </ul>
            {resumen.porEspecie.length > 12 && (
              <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">y {resumen.porEspecie.length - 12} especies más</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cifra({ label, valor, nota, tono = "muted", icono: Icono }: {
  label: string; valor: string; nota: string; tono?: TonoPatio; icono?: typeof Boxes;
}) {
  const t = TONO[tono];
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
        {Icono && <Icono className="h-3.5 w-3.5" />}{label}
      </p>
      <p className={`font-mono text-xl font-bold leading-tight tabular-nums ${tono === "muted" ? "text-[var(--text-primary)]" : t.texto}`}>{valor}</p>
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{nota}</p>
    </div>
  );
}
