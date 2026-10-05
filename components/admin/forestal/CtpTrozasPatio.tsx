"use client";

/**
 * Los indicadores del patio, pieza por pieza — plegables (Brandon 05-10: «los
 * KPIs para poder ocultar y mostrar, que no ocupen mucho espacio»; y después,
 * el mismo día: «mejora y agrega más KPIs»).
 *
 * Consumos cuenta metros cúbicos por guía; acá la unidad es **la troza**.
 *
 * Es un HOOK y no un panel: devuelve el botón «Indicadores», que va en la
 * cabecera de la vista junto a las demás acciones, y el panel, que la vista
 * pone debajo. Cerrado, el botón lleva el titular en una línea (plegar no es
 * esconder el dato). Abierto, en orden de pregunta:
 *   · arriba, lo que hay y hace cuánto (las dos cifras con su desglose, cuyas
 *     pastillas filtran la lista) y, en la nota de «La más vieja», cuánto falta
 *     para que algo entre a riesgo de mancha (30 d);
 *   · abajo, cinco tarjetas para DECIDIR: qué llevar a la sierra (y cuántos pt
 *     daría, estimado con el rendimiento real del libro), cuánto vale lo
 *     parado, a qué ritmo rota la cancha, de qué grosor es la pila y qué tan
 *     lista está para una fiscalización.
 * La cuenta vive en `lib/forestal/trozas-patio-kpis.ts` (puro, con tests).
 * «Sin título declarado» no vive acá como cifra suelta: es deuda, tiene su
 * botón con su tabla (`CtpTrozasSinTituloModal`); acá es una fila del chequeo.
 *
 * Los filtros de especie/guía/título recortan estas cifras (ADR-400): es el
 * MISMO `filtrarPatio` que la lista. Estado y tramo NO, porque son el desglose
 * que estas mismas cifras ofrecen.
 */

import { useMemo, type ReactNode } from "react";
import { Kicker } from "@buleje/design-system";
import { Boxes, Clock, Sigma } from "@buleje/design-system/icons";
import {
  antiguedadDelPatio,
  ESTADO_META,
  filtrarPatio,
  resumirPatio,
  SIN_TITULO,
  type EstadoTroza,
} from "@/lib/forestal/trozas-patio";
import { cifrasExtraPatio } from "@/lib/forestal/trozas-patio-medidas";
import {
  clasesDiametricas,
  DIAS_RIESGO,
  fiscalizacionDelPatio,
  flujoDelPatio,
  primeroALaSierra,
  ptEstimados,
  riesgoDelPatio,
  valorDelPatio,
  type FilaFiscal,
} from "@/lib/forestal/trozas-patio-kpis";
import CtpKpi from "./CtpKpi";
import { useKpisPlegables } from "./kpis-plegables";
import { CifraPatio, n2, Pastilla, puntoDeTono, type TonoPatio } from "./ctp-trozas-ui";
import { TarjetaRotacion, TarjetaSierra, TarjetaValor } from "./ctp-trozas-kpi-decidir";
import { TarjetaCalibre, TarjetaFiscal } from "./ctp-trozas-kpi-pila";
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
  /** Imprimir las etiquetas de estas piezas (las del patio sin `etiquetadaEn`). */
  onImprimirEtiquetas?: (ids: string[]) => void;
  /** Abrir la planilla «Anotar D1/D2» con estas piezas. Sin él, la fila no es botón. */
  onAnotarMedidas?: (ids: string[]) => void;
  /** Mostrar en la lista sólo las piezas sin título declarado. */
  onVerSinTitulo?: () => void;
}

export function useIndicadoresPatio({
  trozas, meta, cargando, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro, especie, guia, titulo,
  onImprimirEtiquetas, onAnotarMedidas, onVerSinTitulo,
}: IndicadoresPatioProps): { boton: ReactNode; panel: ReactNode } {
  /* `hoy` fijo mientras no cambien los datos: si no, la antigüedad se mueve sola. */
  const hoy = useMemo(() => new Date(), [trozas]); // eslint-disable-line react-hooks/exhaustive-deps
  const delFiltro = useMemo(() => filtrarPatio(trozas, { especie, guia, titulo }, hoy), [trozas, especie, guia, titulo, hoy]);
  const resumen = useMemo(() => resumirPatio(delFiltro), [delFiltro]);
  const edad = useMemo(() => antiguedadDelPatio(delFiltro, hoy), [delFiltro, hoy]);
  const extra = useMemo(() => cifrasExtraPatio(delFiltro), [delFiltro]);
  const kpis = useMemo(
    () => ({
      valor: valorDelPatio(delFiltro),
      flujo: flujoDelPatio(delFiltro, hoy),
      clases: clasesDiametricas(delFiltro).clases,
      fisc: fiscalizacionDelPatio(delFiltro),
      primero: primeroALaSierra(delFiltro, hoy),
    }),
    [delFiltro, hoy],
  );
  const riesgo = riesgoDelPatio(edad.tramos, edad.masVieja);

  const hayApartadas = resumen.apartadas > 0;
  const tramosConPiezas = edad.tramos.filter((t) => t.piezas > 0);
  /* Las pastillas de especie hablan de lo LIBRE (lo que se puede aserrar hoy),
     no de lo registrado: al lado de «Paradas en patio», 28.64 m³ de Tornillo
     que incluían lo ya aserrado no sumaban con nada de lo que estaba arriba. */
  const maxEspecie = Math.max(0.001, ...resumen.porEspecie.map((e) => e.m3Libres));
  const especiesVisibles = resumen.porEspecie.slice(0, 6);
  const tonoEdad: TonoPatio =
    edad.masVieja == null ? "muted" : edad.masVieja >= 60 ? "danger" : edad.masVieja >= DIAS_RIESGO ? "warn" : "ok";
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

  const notaEdad =
    edad.masVieja == null
      ? "sin fecha en ninguna pieza"
      : riesgo.piezas > 0
        ? `${riesgo.piezas} con ${DIAS_RIESGO} d o más · ${n2(riesgo.m3)} m³ en riesgo de mancha`
        : `días parada · la primera entra a riesgo en ${riesgo.faltanDias} d`;

  const encabezado = (
    <div className="space-y-2.5">
      <div className="grid gap-2.5 lg:grid-cols-2">
        <CifraPatio
          heroe
          icono={Boxes}
          label={hayApartadas ? "Paradas en patio" : "En patio, listas"}
          valor={cifra(resumen.enPatio.piezas)}
          nota={
            leyendo
              ? "leyendo el patio…"
              : `${n2(resumen.enPatio.m3)} m³ ${hayApartadas ? "ocupando cancha" : "· ninguna apartada"} · de ${resumen.total.piezas} registradas`
          }
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
          nota={notaEdad}
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
          <Kicker as="span" title="Lo libre de cada especie: lo que se puede llevar a la sierra hoy">Libres por especie</Kicker>
          {especiesVisibles.map((e) => (
            <span
              key={e.especie}
              title={`${e.libres} libres (${n2(e.m3Libres)} m³) de ${e.piezas} registradas (${n2(e.m3)} m³, también las ya aserradas)`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5"
            >
              <span className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--rule-base)]" aria-hidden="true">
                <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${(e.m3Libres / maxEspecie) * 100}%` }} />
              </span>
              <span className="truncate text-xs font-bold text-[var(--text-primary)]">{e.especie}</span>
              <span className="font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)]">
                {e.libres} · {n2(e.m3Libres)} m³
              </span>
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
      {meta.truncado && (
        <p className="rounded-lg bg-[var(--data-warning-500)]/12 px-2.5 py-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Se leyeron {meta.devueltas} de {meta.total} piezas: los totales son sobre lo leído.
        </p>
      )}
    </div>
  );

  /* Qué hace cada fila incompleta del chequeo. Sin el callback, no es botón. */
  const onFila: Partial<Record<FilaFiscal["clave"], (ids: string[]) => void>> = {
    ...(onImprimirEtiquetas ? { etiqueta: onImprimirEtiquetas } : {}),
    ...(onAnotarMedidas ? { medidas: onAnotarMedidas } : {}),
    ...(onVerSinTitulo ? { titulo: () => onVerSinTitulo() } : {}),
  };
  const sinMedidas = kpis.fisc.filas.find((f) => f.clave === "medidas")?.faltan ?? [];

  const tarjetas: ReactNode[] = [
    <TarjetaSierra
      key="sierra"
      libres={libres}
      pt={ptEstimados(libres.m3, meta.rendimientoLibro?.pct)}
      rendimiento={meta.rendimientoLibro ?? null}
      primero={kpis.primero}
      filtrando={estadoFiltro.includes("libre")}
      onLibres={() => alternarEstado("libre")}
      onPrimero={(p) => {
        onEstadoFiltro(["libre"]);
        onTramoFiltro([p.tramo]);
      }}
    />,
    <TarjetaValor key="valor" valor={kpis.valor} />,
    <TarjetaRotacion key="rotacion" flujo={kpis.flujo} />,
    <TarjetaCalibre
      key="calibre"
      clases={kpis.clases}
      extra={extra}
      onAnotar={onAnotarMedidas && sinMedidas.length > 0 ? () => onAnotarMedidas(sinMedidas) : undefined}
    />,
    <TarjetaFiscal key="fiscal" fisc={kpis.fisc} onFila={onFila} />,
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
