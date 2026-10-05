"use client";

/**
 * CtpTrozasLista — cada troza del patio, una fila.
 *
 * Lo que ninguna otra pantalla del libro contesta: **dónde está y hace cuánto**
 * esta pieza concreta. Ingresos la lista por guía y por período; Consumos habla
 * en m³. Acá no hay período: es el patio de hoy, con el estado de cada tronco y
 * los días que lleva parado, que es lo que decide qué se asierra primero.
 *
 * Filtra en el cliente porque el patio ya está entero en memoria (una lectura,
 * la del panel de arriba): así el filtro responde mientras se tipea y los
 * totales de arriba y las filas de abajo salen siempre del mismo dato.
 *
 * ## Los filtros viven acá, pegados a lo que filtran
 *
 * En el escritorio, cada uno en la cabecera de SU columna (`CtpTrozasTabla`);
 * en el teléfono, donde no hay cabeceras, en la fila compacta de abajo. Antes
 * estaban en una banda gris sobre el panorama, con otro estilo y a dos pantallas
 * de las filas que recortaban. El ESTADO sigue siendo del padre (ADR-400): el
 * panorama y esta lista tienen que contar el mismo conjunto.
 *
 * Las filas van en una caja con scroll y cabecera pegajosa: 59 piezas estiraban
 * la página a cinco pantallas y medía, y los filtros de columna quedaban arriba
 * de todo, fuera de la vista.
 */

import { useCallback, useMemo, useState } from "react";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import {
  estadoDeTroza,
  filtrarPatio,
  opcionesDeOrigen,
  resumirPatio,
  type EstadoTroza,
} from "@/lib/forestal/trozas-patio";
import { faltanMedidas } from "@/lib/forestal/trozas-patio-medidas";
import { exportarTrozasCsv } from "./ctp-trozas-lista-shared";
import CtpTrozasBarra from "./CtpTrozasBarra";
import CtpTrozasCards from "./CtpTrozasCards";
import CtpTrozasFiltrosActivos from "./CtpTrozasFiltrosActivos";
import {
  alternarOrden, ORDEN_PRESETS, ordenarTrozas, presetDeOrden, type IdColumnaTroza, type OrdenColumnaTroza,
} from "./ctp-trozas-filtros-columnas";
import { useFiltrosTrozas } from "./ctp-trozas-filtros-hook";
import CtpTrozasFiltrosMovil from "./ctp-trozas-filtros-movil";
import CtpTrozasTabla from "./CtpTrozasTabla";
import { useEspeciesFotos } from "./hooks/use-especies-fotos";
import { usePlantaUbicacion } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";
import { formatNumber } from "@/lib/format";

/** Las columnas cuyo filtro vive acá (las otras cuatro son del padre). */
const COLUMNAS_PROPIAS: readonly IdColumnaTroza[] = ["proveedor", "parada", "d1", "d2", "largo", "volumen"];

/** El alto de la caja con scroll: entra en pantalla y deja ver lo que sigue. */
const ALTO_LISTA = "max-h-[62vh]";

export interface CtpTrozasListaProps {
  trozas: readonly TrozaPatioAPI[];
  /** Mientras se lee el patio la lista NO puede afirmar que está vacío. */
  cargando: boolean;
  estadoFiltro: readonly EstadoTroza[];
  onEstadoFiltro: (e: EstadoTroza[]) => void;
  tramoFiltro: readonly string[];
  onTramoFiltro: (k: string[]) => void;
  /** Abrir la historia de una pieza; `orden` = lo filtrado, para ‹ › en la ficha. */
  onVerFicha: (id: string, orden?: readonly string[]) => void;
  /**
   * Especie, guía y título habilitante: los gobierna el PADRE (ADR-400) para
   * que el panorama de arriba y esta lista describan el mismo conjunto.
   */
  especie: readonly string[];
  onEspecie: (v: string[]) => void;
  guia: readonly string[];
  onGuia: (v: string[]) => void;
  titulo: readonly string[];
  onTitulo: (v: string[]) => void;
  /**
   * Abrir la planilla «Anotar D1 y D2» con las piezas de ESTA lista (lo
   * filtrado) a las que les falta alguna punta; `inicial` va primero.
   */
  onAnotar: (ids: string[], inicial?: string) => void;
  /** Mandar las elegidas a un lote de aserrío. */
  onApartar: (piezas: { id: string; codigo: string | null; especie: string | null }[]) => void;
}

export default function CtpTrozasLista({
  trozas, cargando, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro,
  especie, onEspecie, guia, onGuia, titulo, onTitulo,
  onVerFicha, onApartar, onAnotar,
}: CtpTrozasListaProps) {
  const [texto, setTexto] = useState("");
  const [orden, setOrden] = useState<OrdenColumnaTroza>(ORDEN_PRESETS.antiguedad);
  const [tope, setTope] = useState(200);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const { indice: fotosEspecie } = useEspeciesFotos();
  /* Dónde está apilada su CARGA (el mapa ubica guías, no piezas). */
  const canchas = usePlantaUbicacion();

  /* Una sola marca de tiempo para filtrar y para pintar los días: si cada fila
     llama `new Date()`, dos filas de la misma pieza pueden caer en tramos
     distintos al cruzar la medianoche. */
  const hoy = useMemo(() => new Date(), [trozas]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Las opciones de los autofiltros, con cuántas piezas hay detrás de cada una
     — de TODA la pila, no de lo filtrado: si salieran de lo ya filtrado, quitar
     un filtro no se podría hacer desde el propio desplegable. */
  const resumen = useMemo(() => resumirPatio(trozas), [trozas]);
  const guiasFaceta = useMemo(
    () => opcionesDeOrigen(trozas, "guia").map((o) => ({ value: o.valor, count: o.piezas })),
    [trozas],
  );
  const titulosFaceta = useMemo(
    () => opcionesDeOrigen(trozas, "titulo").map((o) => ({ value: o.valor, count: o.piezas })),
    [trozas],
  );
  const especiesFaceta = useMemo(
    () => resumen.porEspecie.map((e) => ({ value: e.especie, count: e.piezas })),
    [resumen],
  );
  const estadosFaceta = useMemo(
    () => resumen.porEstado.map((e) => ({ value: e.estado, count: e.piezas })),
    [resumen],
  );
  /* Código, Proveedor y rangos: un estado para cabecera, teléfono y chips (AND con el padre). */
  const extra = useFiltrosTrozas(trozas, hoy, COLUMNAS_PROPIAS);
  const idsExtra = useMemo(
    () => (extra.activos > 0 ? new Set(extra.filtradas.map((t) => t.id)) : null),
    [extra.activos, extra.filtradas],
  );
  const filtradas = useMemo(() => {
    const base = filtrarPatio(trozas, { texto, estado: estadoFiltro, especie, tramo: tramoFiltro, guia, titulo }, hoy);
    return ordenarTrozas(idsExtra ? base.filter((t) => idsExtra.has(t.id)) : base, orden, hoy);
  }, [trozas, texto, estadoFiltro, especie, tramoFiltro, guia, titulo, idsExtra, orden, hoy]);
  const visibles = filtradas.slice(0, tope);
  const verFicha = (id: string) => onVerFicha(id, filtradas.map((t) => t.id));
  /* Sin sus dos puntas: el botón de la barra y el atajo de cada fila abren la MISMA planilla. */
  const sinMedidasIds = useMemo(() => filtradas.filter(faltanMedidas).map((t) => t.id), [filtradas]);
  const sumaVisible = filtradas.reduce((a, t) => a + (t.volumenM3 ?? 0), 0);

  /* Sólo lo LIBRE se puede apartar: lo apartado ya está en un lote y lo demás
     salió del patio. Ofrecer la casilla igual sería ofrecer un rechazo. */
  const apartables = useMemo(() => visibles.filter((t) => estadoDeTroza(t) === "libre"), [visibles]);
  const todasElegidas = apartables.length > 0 && apartables.every((t) => elegidas.has(t.id));
  /**
   * Las libres de TODO lo filtrado, no sólo de las 200 que se están mostrando.
   *
   * La casilla de la cabecera marca lo visible —es lo que el usuario ve y lo que
   * espera— pero con el patio grande eso se queda corto: filtrar por una guía que
   * trajo 800 piezas y querer apartarlas todas obligaba a «ver más» cuatro veces,
   * marcando de a 200. Cuando hay más detrás, se ofrece tomarlas todas de una.
   */
  const apartablesFiltradas = useMemo(
    () => filtradas.filter((t) => estadoDeTroza(t) === "libre"),
    [filtradas],
  );
  const hayMasParaElegir = todasElegidas && apartablesFiltradas.length > apartables.length;
  const piezasElegidas = useMemo(
    () => trozas.filter((t) => elegidas.has(t.id)).map((t) => ({ id: t.id, codigo: t.codificacion ?? t.codigoPlanta, especie: t.especieComun })),
    [trozas, elegidas],
  );
  const m3Elegidas = useMemo(
    () => trozas.filter((t) => elegidas.has(t.id)).reduce((a, t) => a + (t.volumenM3 ?? 0), 0),
    [trozas, elegidas],
  );

  const alternar = useCallback((id: string) => {
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const limpiar = () => {
    setTexto(""); onEspecie([]); onEstadoFiltro([]); onTramoFiltro([]); onGuia([]); onTitulo([]); extra.limpiar();
  };

  const exportar = useCallback(() => exportarTrozasCsv(filtradas, hoy, canchas), [filtradas, hoy, canchas]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <CtpTrozasBarra
        texto={texto} onTexto={setTexto}
        orden={presetDeOrden(orden)} onOrden={(v) => v !== "columna" && setOrden(ORDEN_PRESETS[v])}
        leyendo={cargando && trozas.length === 0}
        piezasFiltradas={filtradas.length}
        piezasTotales={trozas.length}
        m3Filtrados={sumaVisible}
        onExportar={exportar}
        sinMedidas={sinMedidasIds.length}
        onAnotarMedidas={() => onAnotar(sinMedidasIds)}
        especie={especie} onEspecie={onEspecie} especiesFaceta={especiesFaceta}
        titulo={titulo} onTitulo={onTitulo} titulosFaceta={titulosFaceta}
        guia={guia} onGuia={onGuia} guiasFaceta={guiasFaceta}
      />
      <CtpTrozasFiltrosMovil f={extra} />

      <CtpTrozasFiltrosActivos
        texto={texto} onTexto={setTexto}
        estadoFiltro={estadoFiltro} onEstadoFiltro={onEstadoFiltro}
        tramoFiltro={tramoFiltro} onTramoFiltro={onTramoFiltro}
        especie={especie} onEspecie={onEspecie}
        guia={guia} onGuia={onGuia}
        titulo={titulo} onTitulo={onTitulo}
        extra={extra}
        onLimpiar={limpiar}
      />

      {/* ── Lo elegido ──────────────────────────────────────────────────── */}
      {elegidas.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--accent)] bg-primary/10 px-3 py-2 dark:bg-[var(--accent)]/12">
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {elegidas.size} {elegidas.size === 1 ? "pieza elegida" : "piezas elegidas"}
            {" · "}
            <span className="font-mono tabular-nums">{formatNumber(m3Elegidas, { max: 2 })} m³</span>
          </span>
          <button
            type="button"
            onClick={() => onApartar(piezasElegidas)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-3 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Layers className="h-4 w-4" /> Apartar en un lote
          </button>
          {hayMasParaElegir && (
            <button
              type="button"
              onClick={() => setElegidas(new Set(apartablesFiltradas.map((t) => t.id)))}
              className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
            >
              Elegir las {apartablesFiltradas.length} que cumplen el filtro
            </button>
          )}
          <button type="button" onClick={() => setElegidas(new Set())} className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] underline">
            Soltar la selección
          </button>
        </div>
      )}

      {filtradas.length === 0 ? (
        <p className="flex items-center justify-center gap-2 p-8 text-center text-sm text-[var(--text-secondary)]">
          {cargando ? (
            /* Mientras carga no se afirma que el patio está vacío: un aserradero
               con 5.000 piezas leería «no hay trozas» durante dos segundos. */
            <><Loader2 className="h-4 w-4 animate-spin" /> Leyendo el patio…</>
          ) : trozas.length === 0 ? (
            "Todavía no hay trozas cargadas: llegan con el alta de la guía desde SERFOR."
          ) : (
            "Ninguna pieza cumple con eso. Prueba quitando un filtro."
          )}
        </p>
      ) : (
        <>
          <CtpTrozasTabla
            visibles={visibles}
            elegidas={elegidas}
            apartables={apartables}
            todasElegidas={todasElegidas}
            onElegirTodas={() => setElegidas(todasElegidas ? new Set() : new Set(apartables.map((t) => t.id)))}
            onAlternar={alternar}
            onVerFicha={verFicha}
            onAnotar={(id) => onAnotar(sinMedidasIds, id)}
            hoy={hoy}
            canchas={canchas}
            fotosEspecie={fotosEspecie}
            especie={especie} onEspecie={onEspecie} especiesFaceta={especiesFaceta}
            estadoFiltro={estadoFiltro} onEstadoFiltro={onEstadoFiltro} estadosFaceta={estadosFaceta}
            guia={guia} onGuia={onGuia} guiasFaceta={guiasFaceta}
            titulo={titulo} onTitulo={onTitulo} titulosFaceta={titulosFaceta}
            extra={extra}
            orden={orden} onOrdenar={(c) => setOrden((o) => alternarOrden(o, c))}
            altoClase={ALTO_LISTA}
          />
          <CtpTrozasCards
            visibles={visibles}
            elegidas={elegidas}
            onAlternar={alternar}
            onVerFicha={verFicha}
            hoy={hoy}
            canchas={canchas}
            fotosEspecie={fotosEspecie}
            altoClase={ALTO_LISTA}
          />

          {filtradas.length > visibles.length && (
            <div className="border-t border-[var(--rule-soft)] p-2.5 text-center">
              <button
                type="button"
                onClick={() => setTope((v) => v + 200)}
                className="h-9 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                Ver 200 más ({filtradas.length - visibles.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
