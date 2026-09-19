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
 * ## Dos cifras, cada una con su desglose colgando
 *
 * Antes eran cuatro tarjetas arriba y tres filas de pastillas abajo, todas del
 * mismo peso: nada decía que «Libre en patio 45» es de qué está hecho el 45 de
 * la primera tarjeta, ni que los tramos de antigüedad explican «la más vieja».
 * Ahora cada desglose vive DENTRO de la cifra que explica y el resto —el hueco
 * de título, el tamaño de lo leído, las especies— baja a una línea de apoyo.
 *
 * Presentacional: los datos llegan por props desde `use-trozas-patio`, para que
 * el resumen y la lista de abajo nunca cuenten cosas distintas. Los CONTROLES
 * de especie/guía/título ya no viven acá sino pegados a la tabla que filtran
 * (siguen recortando estas cifras: el estado es del padre).
 */

import { useMemo } from "react";
import { Kicker } from "@buleje/design-system";
import { Boxes, Clock, ShieldAlert } from "@buleje/design-system/icons";
import {
  antiguedadDelPatio,
  ESTADO_META,
  filtrarPatio,
  resumirPatio,
  SIN_TITULO,
  type EstadoTroza,
} from "@/lib/forestal/trozas-patio";
import { CifraPatio, MicroCifra, n2, Pastilla, puntoDeTono, type TonoPatio } from "./ctp-trozas-ui";
import type { PatioMeta, TrozaPatioAPI } from "./hooks/use-trozas-patio";

export interface CtpTrozasPatioProps {
  trozas: readonly TrozaPatioAPI[];
  meta: PatioMeta;
  cargando: boolean;
  /** Los estados que la lista de abajo está mostrando, para marcarlos acá. */
  estadoFiltro: readonly EstadoTroza[];
  onEstadoFiltro: (e: EstadoTroza[]) => void;
  /** Los tramos de antigüedad elegidos (`key` de `TRAMOS_ANTIGUEDAD`). */
  tramoFiltro: readonly string[];
  onTramoFiltro: (k: string[]) => void;
  /**
   * Los filtros que RECORTAN el panorama (ADR-400): especie, guía y título.
   *
   * Llegan sólo para contar: se eligen en la cabecera de la tabla, que es la
   * que recortan. Estado y tramo quedan afuera a propósito — son el desglose
   * que estas mismas cifras ofrecen, y recortarse a sí mismas las dejaría en
   * cero.
   */
  especie: readonly string[];
  guia: readonly string[];
  titulo: readonly string[];
}

export default function CtpTrozasPatio({
  trozas, meta, cargando, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro, especie, guia, titulo,
}: CtpTrozasPatioProps) {
  /* `hoy` fijo mientras no cambien los datos: recalcularlo en cada pintada hace
     que la antigüedad se mueva sola a mitad de una sesión larga. */
  const hoy = useMemo(() => new Date(), [trozas]); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * La pila que describen las cifras: la entera, recortada por especie/guía/
   * título. Es el MISMO `filtrarPatio` que usa la lista de abajo — dos formas
   * de recortar la misma pila terminan contando distinto.
   */
  const delFiltro = useMemo(
    () => filtrarPatio(trozas, { especie, guia, titulo }, hoy),
    [trozas, especie, guia, titulo, hoy],
  );

  const resumen = useMemo(() => resumirPatio(delFiltro), [delFiltro]);
  const edad = useMemo(() => antiguedadDelPatio(delFiltro, hoy), [delFiltro, hoy]);

  /* Decide si «en patio» y «listas para sierra» tienen algo distinto que decir. */
  const hayApartadas = resumen.apartadas > 0;
  /* Los tramos vacíos no se dibujan: una barra en cero con el botón apagado
     ocupa el mismo alto que un dato y no es uno. */
  const tramosConPiezas = useMemo(() => edad.tramos.filter((t) => t.piezas > 0), [edad.tramos]);
  const maxEspecie = Math.max(1, ...resumen.porEspecie.map((e) => e.m3));
  /* Con UNA sola especie la barra siempre da 100 % y no dice nada. Se muestran
     las seis de más volumen; el resto se cuenta, que es lo que se pregunta. */
  const especiesVisibles = resumen.porEspecie.slice(0, 6);
  const tonoEdad: TonoPatio =
    edad.masVieja == null ? "muted" : edad.masVieja >= 60 ? "danger" : edad.masVieja >= 30 ? "warn" : "ok";
  /* Mientras se lee, las cifras muestran «…» y no 0: un cero se lee como un
     patio vacío, que es la afirmación más cara de esta pantalla. */
  const leyendo = cargando && trozas.length === 0;
  const cifra = (v: number | string) => (leyendo ? "…" : String(v));

  /* Qué recorte están mirando estas cifras. Los controles viven en la tabla,
     así que sin esta línea un «45» filtrado se leería como el patio entero —el
     número más caro de esta pantalla. */
  const recorte = [
    especie.length > 0 ? `especie: ${especie.join(" o ")}` : "",
    titulo.length > 0 ? `permiso: ${titulo.map((t) => (t === SIN_TITULO ? "sin título declarado" : t)).join(" o ")}` : "",
    guia.length > 0 ? `guía: ${guia.join(" o ")}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      {recorte && (
        <p className="mb-2 flex flex-wrap items-center gap-1.5">
          <Kicker as="span">Las cifras miran sólo</Kicker>
          <span className="text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{recorte}</span>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            — se quita desde la cabecera de la tabla
          </span>
        </p>
      )}
      <div className="grid gap-2.5 lg:grid-cols-2">
        <CifraPatio
          heroe
          icono={Boxes}
          label={hayApartadas ? "Paradas en patio" : "En patio, listas"}
          valor={cifra(resumen.enPatio.piezas)}
          nota={
            leyendo
              ? "leyendo el patio…"
              : hayApartadas
                ? `${n2(resumen.enPatio.m3)} m³ ocupando cancha`
                : `${n2(resumen.enPatio.m3)} m³ · ninguna apartada`
          }
          desglose="En qué anda"
          explicacion="De qué está hecho ese número: cada estado filtra la lista de abajo."
        >
          {resumen.porEstado.map(({ estado, piezas, m3 }) => {
            const m = ESTADO_META[estado];
            const activo = estadoFiltro.includes(estado);
            return (
              <Pastilla
                key={estado}
                activo={activo}
                punto={puntoDeTono(m.tono)}
                titulo={m.hint}
                /* Suma en vez de reemplazar: ver «libre + apartada» a la vez
                   es la pregunta real de «qué hay parado». */
                onClick={() =>
                  onEstadoFiltro(activo ? estadoFiltro.filter((x) => x !== estado) : [...estadoFiltro, estado])
                }
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
        </CifraPatio>

        <CifraPatio
          icono={Clock}
          label="La más vieja"
          valor={cifra(edad.masVieja != null ? `${edad.masVieja} d` : "—")}
          nota={
            edad.masVieja != null && edad.masVieja >= 60
              ? "riesgo de mancha"
              : edad.masVieja != null
                ? "días parada"
                : "sin fecha en ninguna pieza"
          }
          tono={tonoEdad}
          desglose="Paradas hace"
          explicacion="Cuenta desde que la pieza bajó del camión (o desde el asiento de su guía si no se sabe) y sólo mira lo que sigue parado."
        >
          {tramosConPiezas.map((t) => {
            const activo = tramoFiltro.includes(t.key);
            return (
              <Pastilla
                key={t.key}
                activo={activo}
                punto={puntoDeTono(t.tono)}
                titulo="Toca para ver sólo estas en la lista"
                onClick={() =>
                  onTramoFiltro(activo ? tramoFiltro.filter((x) => x !== t.key) : [...tramoFiltro, t.key])
                }
                label={t.label}
                piezas={t.piezas}
                m3={t.m3}
              />
            );
          })}
          {tramosConPiezas.length === 0 && <span className="text-xs text-[var(--text-secondary)]">Nada parado.</span>}
          {edad.sinFecha > 0 && (
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{edad.sinFecha} sin fecha</span>
          )}
        </CifraPatio>
      </div>

      {/* ── Lo de apoyo, en una línea ──────────────────────────────────────
          Tres cosas que hay que poder mirar pero que no compiten con las dos
          cifras de arriba: el hueco de origen legal, cuánto se leyó y de qué
          especies está hecha la pila. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--rule-soft)] pt-2.5">
        {/* El hueco de origen legal sólo aparece cuando existe: una cifra en
            cero es ruido, y en verde sería una felicitación que nadie pidió. */}
        {resumen.sinTitulo.piezas > 0 && (
          <MicroCifra
            icono={ShieldAlert}
            label="Sin título declarado"
            valor={cifra(resumen.sinTitulo.piezas)}
            nota={`${n2(resumen.sinTitulo.m3)} m³ sin origen legal`}
            tono="warn"
          />
        )}
        <MicroCifra
          conteoId="patio"
          label="Piezas registradas"
          valor={cifra(resumen.total.piezas)}
          nota={meta.truncado ? `de ${meta.total} que hay` : "de todas las guías"}
          tono={meta.truncado ? "warn" : "muted"}
        />
        {resumen.porEspecie.length > 1 && (
          <span className="flex flex-wrap items-center gap-1.5">
            <Kicker as="span">Especies</Kicker>
            {especiesVisibles.map((e) => (
              <span
                key={e.especie}
                title={`${n2(e.m3Libres)} m³ libres de ${n2(e.m3)} m³`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5"
              >
                <span className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--rule-base)]" aria-hidden="true">
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
            {resumen.porEspecie.length > especiesVisibles.length && (
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                +{resumen.porEspecie.length - especiesVisibles.length} más
              </span>
            )}
          </span>
        )}
      </div>

      {resumen.sinCodificar > 0 && (
        <p className="mt-2 rounded-lg bg-[var(--data-warning-500)]/12 px-2.5 py-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {resumen.sinCodificar} {resumen.sinCodificar === 1 ? "pieza no tiene" : "piezas no tienen"} codificación: no se pueden pedir por su código en una fiscalización.
        </p>
      )}
      {meta.truncado && (
        <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
          Se leyeron {meta.devueltas} de {meta.total} piezas — los totales de esta pantalla son sobre lo leído, no sobre el patio entero.
        </p>
      )}
    </section>
  );
}
