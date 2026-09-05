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
import { Boxes, Clock, RefreshCw, ShieldAlert, Trees } from "@buleje/design-system/icons";
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
  /* Decide si «en patio» y «listas para sierra» tienen algo distinto que decir. */
  const hayApartadas = resumen.apartadas > 0;
  /* Los tramos vacíos no se dibujan: una barra en cero con el botón apagado
     ocupa el mismo alto que un dato y no es uno. */
  const tramosConPiezas = useMemo(() => edad.tramos.filter((t) => t.piezas > 0), [edad.tramos]);
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

        {/*
          Las tarjetas se adaptan a lo que los datos tienen para decir.

          «Paradas en patio» (libre + apartada) y «Listas para sierra» (sólo
          libre) son cosas distintas, pero mientras no haya NADA apartado dicen
          el mismo número: dos tarjetas grandes repitiendo 57 · 27.52 m³ enseñan
          a no leerlas. Sin apartadas se muestra una sola, y el lugar que queda
          libre lo ocupa el dato que sí falta: cuántas piezas del patio no
          declaran título habilitante — el hueco de origen legal que el
          certificado no perdona.
        */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cifra
            label={hayApartadas ? "Paradas en patio" : "En patio, listas"}
            valor={cifra(resumen.enPatio.piezas)}
            nota={
              leyendo
                ? "leyendo el patio…"
                : hayApartadas
                  ? `${n2(resumen.enPatio.m3)} m³ ocupando cancha`
                  : `${n2(resumen.enPatio.m3)} m³ · ninguna apartada`
            }
            icono={Boxes}
            tono={hayApartadas ? "muted" : "ok"}
          />
          {hayApartadas && (
            <Cifra label="Listas para sierra" valor={cifra(libres?.piezas ?? 0)} nota={leyendo ? "" : `${n2(libres?.m3 ?? 0)} m³ sin apartar`} tono="ok" />
          )}
          <Cifra
            label="La más vieja"
            valor={cifra(edad.masVieja != null ? `${edad.masVieja} d` : "—")}
            nota={edad.masVieja != null && edad.masVieja >= 60 ? "riesgo de mancha" : "días parada"}
            tono={tonoEdad}
            icono={Clock}
          />
          {/* El hueco de origen legal sólo aparece cuando existe: una tarjeta en
              cero es ruido, y en verde sería una felicitación que nadie pidió. */}
          {resumen.sinTitulo.piezas > 0 && (
            <Cifra
              label="Sin título declarado"
              valor={cifra(resumen.sinTitulo.piezas)}
              nota={`${n2(resumen.sinTitulo.m3)} m³ sin origen legal`}
              tono="warn"
              icono={ShieldAlert}
            />
          )}
          <Cifra
            label="Piezas registradas"
            valor={cifra(resumen.total.piezas)}
            nota={meta.truncado ? `de ${meta.total} que hay` : "de todas las guías"}
            tono={meta.truncado ? "warn" : "muted"}
          />
        </div>

        {/*
          ── Una LÍNEA por dimensión, no un panel por dimensión ─────────────
          Antes esto eran dos tarjetas más debajo de los KPIs, en un grid de dos
          columnas: la de la izquierda se estiraba a la altura de la derecha y
          quedaba con un hueco vertical enorme, y la lista —lo único accionable—
          arrancaba fuera de pantalla. Son tres cortes del MISMO patio, así que
          van juntos y en línea: cada pastilla sigue filtrando la lista.
        */}
        <div className="mt-3 space-y-2 border-t-2 border-[var(--rule-soft)] pt-3">
          <Fila titulo="En qué anda">
            {resumen.porEstado.map(({ estado, piezas, m3 }) => {
              const m = ESTADO_META[estado];
              const activo = estadoFiltro === estado;
              return (
                <Pastilla
                  key={estado}
                  activo={activo}
                  punto={TONO[m.tono].punto}
                  titulo={m.hint}
                  onClick={() => onEstadoFiltro(activo ? null : estado)}
                  label={m.label}
                  piezas={piezas}
                  m3={m3}
                />
              );
            })}
            {resumen.porEstado.length === 0 && !cargando && (
              <span className="text-xs text-[var(--text-secondary)]">
                Todavía no hay trozas cargadas. Llegan con el alta de la guía desde SERFOR.
              </span>
            )}
          </Fila>

          <Fila
            titulo="Paradas hace"
            nota={
              edad.sinFecha > 0
                ? `desde que bajó del camión · ${edad.sinFecha} sin fecha`
                : "desde que bajó del camión"
            }
            explicacion="Cuenta desde que la pieza bajó del camión (o desde el asiento de su guía si no se sabe) y sólo mira lo que sigue parado."
          >
            {tramosConPiezas.map((t) => {
              const activo = tramoFiltro === t.key;
              return (
                <Pastilla
                  key={t.key}
                  activo={activo}
                  punto={TONO[t.tono].punto}
                  titulo="Tocá para ver sólo estas en la lista"
                  onClick={() => onTramoFiltro(activo ? null : t.key)}
                  label={t.label}
                  piezas={t.piezas}
                  m3={t.m3}
                />
              );
            })}
            {tramosConPiezas.length === 0 && (
              <span className="text-xs text-[var(--text-secondary)]">Nada parado.</span>
            )}
          </Fila>

          {/* Con UNA sola especie la barra siempre da 100 % y no dice nada: el
              dato ya está en la fila de estados. Se muestra desde dos. */}
          {resumen.porEspecie.length > 1 && (
            <Fila titulo="Especies" nota={resumen.porEspecie.length > 8 ? `${resumen.porEspecie.length} en total` : undefined}>
              {resumen.porEspecie.slice(0, 8).map((e) => (
                <span
                  key={e.especie}
                  title={`${n2(e.m3Libres)} m³ libres de ${n2(e.m3)} m³`}
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-1"
                >
                  <span
                    className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--rule-base)]"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-[var(--accent)]"
                      style={{ width: `${maxEspecie > 0 ? (e.m3 / maxEspecie) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="truncate text-xs font-bold text-[var(--text-primary)]">{e.especie}</span>
                  <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">
                    {e.piezas} pz
                  </span>
                </span>
              ))}
            </Fila>
          )}
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
    </div>
  );
}

/** Una dimensión del patio: su nombre a la izquierda, sus pastillas a la derecha. */
function Fila({ titulo, nota, explicacion, children }: {
  titulo: string; nota?: string; explicacion?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span
        title={explicacion}
        className="w-[7.5rem] shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]"
      >
        {titulo}
      </span>
      {children}
      {nota && (
        <span title={explicacion} className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {nota}
        </span>
      )}
    </div>
  );
}

/**
 * Un corte del patio, clickeable: filtra la lista de abajo.
 *
 * El punto de color lleva el tono y el número va en el token de texto — medido:
 * `--data-warning-700` da 3.68:1 en light y el número queda ilegible. El color
 * es una marca, no un dato.
 */
function Pastilla({ activo, punto, label, piezas, m3, titulo, onClick }: {
  activo: boolean; punto: string; label: string; piezas: number; m3: number; titulo?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-2 py-1 transition-colors ${
        activo
          ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-canvas)]"
      }`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: punto }} aria-hidden="true" />
      <span className="text-xs font-bold text-[var(--text-primary)]">{label}</span>
      <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">{piezas}</span>
      <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">{n2(m3)} m³</span>
    </button>
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
