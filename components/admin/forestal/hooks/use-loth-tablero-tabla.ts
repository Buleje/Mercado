"use client";

/**
 * useLothTableroTabla — los filtros, la tanda y el lector de etiquetas de la
 * tabla del Control del permiso (ADR-459).
 *
 *   · Filtros: estados (las tarjetas), especie, «en patio hace más de 15 días»
 *     y el buscador, que entiende la etiqueta leída con la pistola.
 *   · Tanda: sólo se eligen trozas DISPONIBLES; lo elegido se cruza siempre con
 *     lo que hay (tras despachar, las que salieron se caen solas).
 *   · Lector: al apretar Enter (la pistola lo manda al terminar) la troza leída
 *     se resalta, se muestra aunque un filtro la escondiera y, si está en el
 *     patio, queda elegida — así se arma el camión pasando la pistola.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ESTADOS_META,
  filtrarTablero,
  leerBusquedaTablero,
  resolverLectura,
  type EstadoTroza,
  type TrozaTablero,
} from "@/lib/forestal/loth-tablero-trozas";

export interface LecturaAviso {
  tono: "ok" | "aviso" | "error";
  texto: string;
}

export function useLothTableroTabla(filas: readonly TrozaTablero[], conPermiso: boolean) {
  const [texto, setTexto] = useState("");
  const [estados, setEstados] = useState<EstadoTroza[]>([]);
  const [especie, setEspecie] = useState<string | null>(null);
  const [soloViejas, setSoloViejas] = useState(false);
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaAviso | null>(null);

  const visibles = useMemo(
    () => filtrarTablero(filas, { texto, estados, especie, soloViejas }),
    [filas, texto, estados, especie, soloViejas],
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

  const alternarEstado = useCallback(
    (e: EstadoTroza) => setEstados((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])),
    [],
  );
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
  /** Al cambiar de permiso: lo elegido, la especie y la última lectura eran del anterior. */
  const reiniciar = useCallback(() => {
    setElegidas(new Set());
    setEspecie(null);
    setResaltada(null);
    setLectura(null);
  }, []);

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
    if (filtrarTablero([f], { estados, especie, soloViejas }).length === 0) {
      setEstados([]);
      setEspecie(null);
      setSoloViejas(false);
    }
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
  }, [filas, texto, conPermiso, estados, especie, soloViejas, elegidas, seleccion.length]);

  return {
    texto,
    setTexto,
    estados,
    alternarEstado,
    especie,
    setEspecie,
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
