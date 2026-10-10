"use client";

/**
 * useLothTableroTabla — los filtros, la tanda y el lector de etiquetas de la
 * tabla del Control del permiso (ADR-459).
 *
 *   · Filtros: el autofiltro de cada columna (Brandon 07-10; el de Estado es
 *     el mismo que tocan las cifras de «Estado de las trozas»), «en patio hace
 *     más de 15 días» y el buscador, que entiende la etiqueta leída con la
 *     pistola. El buscador va DESPUÉS de las columnas: así se sabe si la troza
 *     leída la esconde un filtro de columna o sólo el texto que se tipeó.
 *   · Tanda: sólo se eligen trozas DISPONIBLES; lo elegido se cruza siempre con
 *     lo que hay (tras despachar, las que salieron se caen solas).
 *   · Lector: al apretar Enter (la pistola lo manda al terminar) la troza leída
 *     se resalta, se muestra aunque un filtro la escondiera y, si está en el
 *     patio, queda elegida — así se arma el camión pasando la pistola.
 */

import { useCallback, useMemo, useState } from "react";
import type { ColumnaKey } from "@/lib/forestal/loth-tablero-columnas";
import {
  ESTADOS_META,
  filtrarTablero,
  leerBusquedaTablero,
  resolverLectura,
  type EstadoTroza,
  type TrozaTablero,
} from "@/lib/forestal/loth-tablero-trozas";
import { useFiltrosTabla } from "../filtros-tabla-forestal";
import { filtrosTablero } from "../loth-tablero-filtros";

const ESTADO_DE_LABEL = new Map(
  (Object.keys(ESTADOS_META) as EstadoTroza[]).map((e) => [ESTADOS_META[e].label, e] as const),
);

export interface LecturaAviso {
  tono: "ok" | "aviso" | "error";
  texto: string;
}

export function useLothTableroTabla(
  filas: readonly TrozaTablero[],
  conPermiso: boolean,
  /** Las columnas que se ven (las apagadas siguen filtrando desde el plegable). */
  columnasVisibles: readonly ColumnaKey[],
  /** Con «Todos»: el permiso de cada troza (columna extra, con su filtro). */
  permisoDe?: (planId: string | null) => string,
) {
  const [texto, setTexto] = useState("");
  const [soloViejas, setSoloViejas] = useState(false);
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaAviso | null>(null);

  const columnas = useMemo(() => filtrosTablero(columnasVisibles, permisoDe), [columnasVisibles, permisoDe]);
  const conViejas = useMemo(() => (soloViejas ? filtrarTablero(filas, { soloViejas }) : filas), [filas, soloViejas]);
  const filtros = useFiltrosTabla(conViejas, columnas);
  const visibles = useMemo(() => filtrarTablero(filtros.filtradas, { texto }), [filtros.filtradas, texto]);
  /** Las que pasan los filtros de columna (sin el buscador): ¿a la leída la esconde un filtro? */
  const pasanColumnas = useMemo(() => new Set(filtros.filtradas.map((x) => x.code)), [filtros.filtradas]);

  /* El estado elegido vive en el filtro de la columna Estado: las cifras de
     arriba lo leen y lo alternan, no llevan uno propio. */
  const elegidosEstado = filtros.facetas.estado;
  const estados = useMemo(
    () =>
      (Array.isArray(elegidosEstado) ? elegidosEstado : [])
        .map((l) => ESTADO_DE_LABEL.get(l))
        .filter((e): e is EstadoTroza => e != null),
    [elegidosEstado],
  );

  const disponibles = useMemo(() => new Map(filas.filter((f) => f.estado === "disponible").map((f) => [f.code, f])), [filas]);
  const seleccion = useMemo(
    () => [...elegidas].map((c) => disponibles.get(c)).filter((f): f is TrozaTablero => f != null),
    [elegidas, disponibles],
  );
  const elegiblesVisibles = useMemo(() => visibles.filter((f) => f.estado === "disponible"), [visibles]);
  /** Elegidas que el filtro de ahora esconde: «Despachar» las lleva igual, así que se dice cuántas son. */
  const ocultasElegidas = useMemo(() => {
    const vis = new Set(visibles.map((f) => f.code));
    return seleccion.filter((f) => !vis.has(f.code)).length;
  }, [visibles, seleccion]);
  const todasVisiblesElegidas = elegiblesVisibles.length > 0 && elegiblesVisibles.every((f) => elegidas.has(f.code));
  const algunaVisibleElegida = elegiblesVisibles.some((f) => elegidas.has(f.code));

  const { setFaceta, limpiar: limpiarColumnas } = filtros;
  const alternarEstado = useCallback(
    (e: EstadoTroza) => {
      const sig = estados.includes(e) ? estados.filter((x) => x !== e) : [...estados, e];
      setFaceta("estado", sig.length > 0 ? sig.map((x) => ESTADOS_META[x].label) : undefined);
    },
    [estados, setFaceta],
  );
  /** Sin ningún filtro (columnas y «más de 15 días»): para ver una troza puntual. */
  const mostrarTodo = useCallback(() => {
    limpiarColumnas();
    setSoloViejas(false);
  }, [limpiarColumnas]);
  const alternarElegida = useCallback((code: string) => {
    setElegidas((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }, []);
  const elegirVisibles = useCallback(
    (si: boolean) => {
      setElegidas((prev) => {
        const n = new Set(prev);
        for (const f of elegiblesVisibles) {
          if (si) n.add(f.code);
          else n.delete(f.code);
        }
        return n;
      });
    },
    [elegiblesVisibles],
  );
  const limpiarSeleccion = useCallback(() => setElegidas(new Set()), []);
  /** Al cambiar de permiso: lo elegido, los filtros de columna y la última lectura eran del anterior. */
  const reiniciar = useCallback(() => {
    setElegidas(new Set());
    limpiarColumnas();
    setResaltada(null);
    setLectura(null);
  }, [limpiarColumnas]);

  /** Enter en el buscador: lo que leyó la pistola (o un código exacto tipeado). */
  const alLeer = useCallback(() => {
    const r = resolverLectura(filas, texto);
    if (r.estado === "ignorar") {
      const b = leerBusquedaTablero(texto);
      /* Los renglones que siguen a `TROZA <código>` no buscan nada: se limpian
         para que el próximo escaneo arranque en un campo vacío. */
      if (b.tipo === "linea-ficha") setTexto("");
      if (b.tipo === "sin-codigo") {
        setTexto("");
        setLectura({ tono: "aviso", texto: "Esa etiqueta es de una troza sin código: búscala por árbol o especie." });
      }
      return;
    }
    setTexto("");
    if (r.estado === "ninguna") {
      setLectura({
        tono: "error",
        texto: `Ninguna troza con el código ${r.codigo}${conPermiso ? " en este permiso (prueba con «Todos los permisos»)" : ""}.`,
      });
      return;
    }
    const f = r.fila;
    setResaltada(f.code);
    /* Que se vea aunque un filtro la escondiera: se leyó para mirarla. */
    if (!pasanColumnas.has(f.code)) mostrarTodo();
    const yaElegida = elegidas.has(f.code);
    if (f.estado === "disponible" && !yaElegida) {
      setElegidas((prev) => new Set(prev).add(f.code));
    }
    const n = f.estado === "disponible" ? seleccion.length + (yaElegida ? 0 : 1) : seleccion.length;
    setLectura({
      tono: f.estado === "disponible" ? "ok" : "aviso",
      texto:
        f.estado === "disponible"
          ? `Troza ${f.code} · en el patio · ${yaElegida ? "ya estaba elegida" : "quedó elegida"} (${n} ${n === 1 ? "elegida" : "elegidas"})`
          : `Troza ${f.code} · ${ESTADOS_META[f.estado].label.toLowerCase()}${f.gtf ? ` con la GTF ${f.gtf}` : ""}: no se puede elegir`,
    });
  }, [filas, texto, conPermiso, pasanColumnas, mostrarTodo, elegidas, seleccion.length]);

  return {
    texto,
    setTexto,
    /** El autofiltro de cada columna (`FiltroEnCabecera`, `BarraFiltrosTabla`). */
    filtros,
    estados,
    alternarEstado,
    mostrarTodo,
    soloViejas,
    setSoloViejas,
    visibles,
    elegidas,
    seleccion,
    ocultasElegidas,
    alternarElegida,
    elegirVisibles,
    limpiarSeleccion,
    reiniciar,
    hayElegibles: elegiblesVisibles.length > 0,
    todasVisiblesElegidas,
    algunaVisibleElegida,
    resaltada,
    quitarResaltada: () => setResaltada(null),
    lectura,
    cerrarLectura: () => setLectura(null),
    alLeer,
  };
}

export type LothTableroTabla = ReturnType<typeof useLothTableroTabla>;
