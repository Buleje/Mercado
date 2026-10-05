"use client";

/**
 * Los indicadores del patio, pieza por pieza — plegables (Brandon 05-10: «los
 * KPIs para poder ocultar y mostrar, que no ocupen mucho espacio»).
 *
 * Consumos cuenta metros cúbicos por guía; acá la unidad es **la troza**:
 * cuántas hay paradas, cuáles se pueden llevar a la sierra hoy y —lo que cuesta
 * plata— hace cuánto que están ahí (la madera en troza se mancha y se raja).
 *
 * Es un HOOK y no un panel: devuelve el botón «Indicadores», que va en la
 * cabecera de la vista junto a las demás acciones, y el panel, que la vista
 * pone debajo. Cerrado, el botón lleva el titular en una línea (plegar no es
 * esconder el dato). Abierto:
 *   · las dos cifras con su desglose colgando (en qué anda · paradas hace), cuyas
 *     pastillas filtran la lista de abajo;
 *   · las tarjetas nuevas sobre datos que el endpoint YA traía y no se pintaban:
 *     listas para la sierra, calibre, largo, tamaño de pieza, etiquetas QR,
 *     cubicación Oxapampa y piezas leídas.
 * «Sin título declarado» ya no vive acá: es deuda, no un indicador, y tiene su
 * botón con su tabla (`CtpTrozasSinTituloModal`).
 *
 * Los filtros de especie/guía/título recortan estas cifras (ADR-400): es el
 * MISMO `filtrarPatio` que la lista. Estado y tramo NO, porque son el desglose
 * que estas mismas cifras ofrecen.
 */

import { useMemo, type ReactNode } from "react";
import { Kicker } from "@buleje/design-system";
import { Axe, Box, Boxes, Clock, QrCode, Ruler, Scale, Sigma } from "@buleje/design-system/icons";
import {
  antiguedadDelPatio,
  ESTADO_META,
  filtrarPatio,
  resumirPatio,
  SIN_TITULO,
  type EstadoTroza,
} from "@/lib/forestal/trozas-patio";
import { cifrasExtraPatio } from "@/lib/forestal/trozas-patio-medidas";
import CtpKpi from "./CtpKpi";
import { useKpisPlegables } from "./kpis-plegables";
import { CifraPatio, n2, Pastilla, puntoDeTono, type TonoPatio } from "./ctp-trozas-ui";
import type { PatioMeta, TrozaPatioAPI } from "./hooks/use-trozas-patio";

export interface IndicadoresPatioProps {
  trozas: readonly TrozaPatioAPI[];
  meta: PatioMeta;
  cargando: boolean;
  estadoFiltro: readonly EstadoTroza[];
  onEstadoFiltro: (e: EstadoTroza[]) => void;
  tramoFiltro: readonly string[];
  onTramoFiltro: (k: string[]) => void;
  /** Lo que recorta las cifras; se elige en la cabecera de la tabla. */
  especie: readonly string[];
  guia: readonly string[];
  titulo: readonly string[];
}

export function useIndicadoresPatio({
  trozas, meta, cargando, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro, especie, guia, titulo,
}: IndicadoresPatioProps): { boton: ReactNode; panel: ReactNode } {
  /* `hoy` fijo mientras no cambien los datos: si no, la antigüedad se mueve sola. */
  const hoy = useMemo(() => new Date(), [trozas]); // eslint-disable-line react-hooks/exhaustive-deps
  const delFiltro = useMemo(() => filtrarPatio(trozas, { especie, guia, titulo }, hoy), [trozas, especie, guia, titulo, hoy]);
  const resumen = useMemo(() => resumirPatio(delFiltro), [delFiltro]);
  const edad = useMemo(() => antiguedadDelPatio(delFiltro, hoy), [delFiltro, hoy]);
  const extra = useMemo(() => cifrasExtraPatio(delFiltro), [delFiltro]);

  const hayApartadas = resumen.apartadas > 0;
  const tramosConPiezas = edad.tramos.filter((t) => t.piezas > 0);
  const maxEspecie = Math.max(1, ...resumen.porEspecie.map((e) => e.m3));
  const especiesVisibles = resumen.porEspecie.slice(0, 6);
  const tonoEdad: TonoPatio =
    edad.masVieja == null ? "muted" : edad.masVieja >= 60 ? "danger" : edad.masVieja >= 30 ? "warn" : "ok";
  /* Mientras se lee: «…», nunca 0 — un cero se lee como un patio vacío. */
  const leyendo = cargando && trozas.length === 0;
  const cifra = (v: number | string) => (leyendo ? "…" : String(v));
  const libres = resumen.porEstado.find((e) => e.estado === "libre") ?? { piezas: 0, m3: 0 };
  const alternarEstado = (e: EstadoTroza) =>
    onEstadoFiltro(estadoFiltro.includes(e) ? estadoFiltro.filter((x) => x !== e) : [...estadoFiltro, e]);

  const recorte = [
    especie.length > 0 ? `especie: ${especie.join(" o ")}` : "",
    titulo.length > 0 ? `permiso: ${titulo.map((t) => (t === SIN_TITULO ? "sin título declarado" : t)).join(" o ")}` : "",
    guia.length > 0 ? `guía: ${guia.join(" o ")}` : "",
  ].filter(Boolean).join(" · ");

  const encabezado = (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 lg:grid-cols-2">
        <CifraPatio
          heroe
          icono={Boxes}
          label={hayApartadas ? "Paradas en patio" : "En patio, listas"}
          valor={cifra(resumen.enPatio.piezas)}
          nota={leyendo ? "leyendo el patio…" : `${n2(resumen.enPatio.m3)} m³ ${hayApartadas ? "ocupando cancha" : "· ninguna apartada"}`}
          desglose="En qué anda"
          explicacion="De qué está hecho ese número: cada estado filtra la lista de abajo."
        >
          {resumen.porEstado.map(({ estado, piezas, m3 }) => (
            <Pastilla
              key={estado}
              activo={estadoFiltro.includes(estado)}
              punto={puntoDeTono(ESTADO_META[estado].tono)}
              titulo={ESTADO_META[estado].hint}
              onClick={() => alternarEstado(estado)}
              label={ESTADO_META[estado].label}
              piezas={piezas}
              m3={m3}
            />
          ))}
          {resumen.porEstado.length === 0 && !cargando && (
            <span className="text-xs text-[var(--text-secondary)]">Todavía no hay trozas: llegan con el alta de la guía.</span>
          )}
        </CifraPatio>
        <CifraPatio
          icono={Clock}
          label="La más vieja"
          valor={cifra(edad.masVieja != null ? `${edad.masVieja} d` : "—")}
          nota={edad.masVieja == null ? "sin fecha en ninguna pieza" : edad.masVieja >= 60 ? "riesgo de mancha" : "días parada"}
          tono={tonoEdad}
          desglose="Paradas hace"
          explicacion="Desde que la pieza bajó del camión (o el asiento de su guía) y sólo lo que sigue parado."
        >
          {tramosConPiezas.map((t) => {
            const activo = tramoFiltro.includes(t.key);
            return (
              <Pastilla
                key={t.key}
                activo={activo}
                punto={puntoDeTono(t.tono)}
                titulo="Toca para ver sólo estas en la lista"
                onClick={() => onTramoFiltro(activo ? tramoFiltro.filter((x) => x !== t.key) : [...tramoFiltro, t.key])}
                label={t.label}
                piezas={t.piezas}
                m3={t.m3}
              />
            );
          })}
          {tramosConPiezas.length === 0 && <span className="text-xs text-[var(--text-secondary)]">Nada parado.</span>}
          {edad.sinFecha > 0 && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{edad.sinFecha} sin fecha</span>}
        </CifraPatio>
      </div>
      {resumen.porEspecie.length > 1 && (
        <p className="flex flex-wrap items-center gap-1.5">
          <Kicker as="span">Especies</Kicker>
          {especiesVisibles.map((e) => (
            <span
              key={e.especie}
              title={`${n2(e.m3Libres)} m³ libres de ${n2(e.m3)} m³`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5"
            >
              <span className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--rule-base)]" aria-hidden="true">
                <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(e.m3 / maxEspecie) * 100}%` }} />
              </span>
              <span className="truncate text-xs font-bold text-[var(--text-primary)]">{e.especie}</span>
              <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">{e.piezas} pz</span>
            </span>
          ))}
          {resumen.porEspecie.length > especiesVisibles.length && (
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">+{resumen.porEspecie.length - especiesVisibles.length} más</span>
          )}
        </p>
      )}
      {resumen.sinCodificar > 0 && (
        <p className="rounded-lg bg-[var(--data-warning-500)]/12 px-2.5 py-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {resumen.sinCodificar} {resumen.sinCodificar === 1 ? "pieza no tiene" : "piezas no tienen"} codificación: no se pueden pedir por su código en una fiscalización.
        </p>
      )}
    </div>
  );

  const sinMedir = extra.sinMedidas > 0 ? `${extra.sinMedidas} sin D1/D2` : "todas con D1/D2";
  const tarjetas: ReactNode[] = [
    <CtpKpi
      key="sierra"
      label="Listas para la sierra"
      value={cifra(libres.piezas)}
      subValue={`${n2(libres.m3)} m³ libres · toca para filtrar`}
      icon={Axe}
      emphasis="success"
      onClick={() => alternarEstado("libre")}
      filtrando={estadoFiltro.includes("libre")}
    />,
    <CtpKpi
      key="calibre"
      label="Calibre promedio"
      value={cifra(extra.calibrePromedioCm != null ? `${extra.calibrePromedioCm} cm` : "—")}
      subValue={extra.calibreMayorCm != null ? `la más gruesa ${extra.calibreMayorCm} cm · ${sinMedir}` : sinMedir}
      icon={Ruler}
      emphasis={extra.sinMedidas > 0 ? "warning" : "neutral"}
    />,
    <CtpKpi
      key="largo"
      label="Largo promedio"
      value={cifra(extra.largoPromedioM != null ? `${n2(extra.largoPromedioM)} m` : "—")}
      subValue={extra.largoMayorM != null ? `la más larga ${n2(extra.largoMayorM)} m` : "sin largos cargados"}
      icon={Scale}
      emphasis="neutral"
    />,
    <CtpKpi
      key="pieza"
      label="Volumen por troza"
      value={cifra(extra.m3PromedioPorPieza != null ? `${n2(extra.m3PromedioPorPieza)} m³` : "—")}
      subValue={extra.m3MayorPieza != null ? `la mayor ${n2(extra.m3MayorPieza)} m³` : "promedio de lo parado"}
      icon={Box}
      emphasis="neutral"
    />,
    <CtpKpi
      key="qr"
      label="Con etiqueta QR"
      value={cifra(`${extra.etiquetadas} de ${extra.enPatio}`)}
      subValue={extra.enPatio > 0 && extra.etiquetadas === extra.enPatio ? "todas con su chapa" : `${extra.enPatio - extra.etiquetadas} sin etiqueta en el patio`}
      icon={QrCode}
      emphasis={extra.etiquetadas < extra.enPatio ? "warning" : "success"}
    />,
    /* Una cifra en cero es ruido: Oxapampa sólo aparece cuando se cubicó algo. */
    ...(extra.cubicadasOx > 0
      ? [
          <CtpKpi
            key="ox"
            label="Cubicadas Oxapampa"
            value={cifra(extra.cubicadasOx)}
            subValue={`${n2(extra.ptOx)} pt para pagar`}
            icon={Sigma}
            emphasis="neutral"
          />,
        ]
      : []),
    <CtpKpi
      key="leidas"
      label="Piezas registradas"
      value={cifra(resumen.total.piezas)}
      subValue={meta.truncado ? `de ${meta.total} que hay: los totales son sobre lo leído` : "de todas las guías, también las ya aserradas"}
      icon={Boxes}
      emphasis={meta.truncado ? "warning" : "neutral"}
    />,
  ];

  const filtrosActivos = especie.length + guia.length + titulo.length;
  return useKpisPlegables({
    claveMemoria: "ctp-trozas",
    tarjetas,
    resumen: leyendo
      ? "leyendo el patio…"
      : `${resumen.enPatio.piezas} paradas · ${n2(resumen.enPatio.m3)} m³${edad.masVieja != null ? ` · la más vieja ${edad.masVieja} d` : ""}`,
    encabezado,
    filtros: recorte ? (
      <p className="flex flex-wrap items-center gap-1.5">
        <Kicker as="span">Las cifras miran sólo</Kicker>
        <span className="text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{recorte}</span>
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">— se quita desde la cabecera de la tabla</span>
      </p>
    ) : undefined,
    filtrosActivos,
    sinDatosAun: leyendo,
  });
}
