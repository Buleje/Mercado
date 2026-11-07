"use client";

/**
 * useLothMapaRutas — las rutas y los puntos del plano (trochas, caminos,
 * patio, campamento…) dichos con sus coordenadas, y cuál está resaltado.
 * Lo leen el bloque «Rutas y puntos» debajo del mapa, la ficha que se abre al
 * tocar una ruta o un pin, y el canvas (halo de la elegida).
 *
 *   · La PENDIENTE sale del relieve que el planificador ya guardó de la zona
 *     (`/loth/geografia?soloCache=1`, que nunca sale a internet): si no hay
 *     relieve guardado, la columna dice «sin dato» y por qué.
 *   · Sin rutas guardadas pero con árboles, pide la propuesta del
 *     planificador (`/loth/planificador`, que tampoco sale a internet) y, si
 *     la geografía de la zona ya estaba guardada, la deja como VISTA PREVIA
 *     punteada —nada se guarda—. Sin geografía guardada, no la muestra: la
 *     pantalla ofrece «Proponer rutas», que sí la trae (tarda de 8 a 50 s).
 *   · Elegir desde la lista resalta y encuadra; tocar en el mapa, además,
 *     abre la ficha sobre el mapa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import type { LatLng } from "@/lib/forestal/loth-geo";
import type { LothCartografia } from "@/lib/forestal/loth-cartografia";
import type { GrillaElevacion } from "@/lib/forestal/loth-geografia";
import type { PropuestaPlan } from "@/lib/forestal/loth-planificador";
import { filasDePuntos, filasDeRutas, type FilaPunto, type FilaRuta } from "@/lib/forestal/loth-rutas-coordenadas";
import type { RespuestaPlan } from "../loth-mapa-plan";

/** «lista» = hay propuesta a la vista; «sinGeografia» = hay que traerla con «Proponer rutas». */
export type EstadoPrevia = "nada" | "cargando" | "lista" | "sinGeografia" | "error";
/** De dónde sale la pendiente: el relieve guardado de la zona. */
export type EstadoRelieve = "nada" | "cargando" | "listo" | "sinRelieve" | "error";

interface Deps {
  planId: string | null;
  carto: LothCartografia;
  /** 0 = el mapa todavía no terminó de cargar. */
  fitKey: number;
  /** Árboles del censo con coordenada (sin árboles no hay nada que proponer). */
  censoCount: number;
  onEncuadrar: (pts: LatLng[]) => void;
  onCentrar: (p: LatLng) => void;
}

const mensaje = (status: number, cuerpo: { message?: unknown } | null) =>
  status === 429 ? "Demasiados pedidos seguidos: espera un minuto." : typeof cuerpo?.message === "string" && cuerpo.message ? cuerpo.message : `HTTP ${status}`;

export function useLothMapaRutas({ planId, carto, fitKey, censoCount, onEncuadrar, onCentrar }: Deps) {
  const [elegida, setElegida] = useState<{ clave: string; ficha: boolean } | null>(null);
  const [grilla, setGrilla] = useState<GrillaElevacion | null>(null);
  const [relieve, setRelieve] = useState<EstadoRelieve>("nada");
  const [previa, setPrevia] = useState<PropuestaPlan | null>(null);
  const [estadoPrevia, setEstadoPrevia] = useState<EstadoPrevia>("nada");
  const [errorPrevia, setErrorPrevia] = useState<string | null>(null);
  const [previaOculta, setPreviaOculta] = useState(false);
  /** De qué plan (y versión del plano) se pidió el relieve: no en cada recarga. */
  const relieveDe = useRef<string | null>(null);

  const hayVias = carto.vias.length > 0;
  /** Un río solo no es una ruta: sin trochas ni caminos, se propone. */
  const hayRutas = carto.vias.some((v) => v.tipo !== "rio");
  const hayCenso = censoCount > 0;

  // ── El relieve guardado, para la pendiente de cada ruta ────────────────────
  // Otro plan = otra zona: el relieve leído no sirve, y la propuesta que se
  // ocultó en el plan anterior no queda oculta en éste.
  useEffect(() => {
    relieveDe.current = null;
    setGrilla(null);
    setRelieve("nada");
    setPreviaOculta(false);
  }, [planId]);
  // Una vez por plan; si no había relieve, se vuelve a mirar cuando cambia el
  // plano (el planificador lo trae y guarda al proponer, y después se agregan las rutas).
  const versionPlano = carto.updatedAt ?? "";
  useEffect(() => {
    if (!planId || fitKey === 0 || !hayVias || grilla) return;
    const k = `${planId}|${versionPlano}`;
    if (relieveDe.current === k) return;
    relieveDe.current = k;
    const ac = new AbortController();
    let terminado = false;
    setRelieve("cargando");
    fetch(`/api/admin/forestal/loth/geografia?planId=${encodeURIComponent(planId)}&soloCache=1`, { credentials: "include", signal: ac.signal })
      .then(async (r) => {
        const c = await leerJson<{ elevacion?: GrillaElevacion | null; message?: string }>(r);
        if (ac.signal.aborted) return;
        terminado = true;
        if (!r.ok) throw new Error(mensaje(r.status, c));
        const g = c?.elevacion;
        if (g && Array.isArray(g.valores) && g.nx > 1 && g.ny > 1) {
          setGrilla(g);
          setRelieve("listo");
        } else {
          setRelieve("sinRelieve");
        }
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        // Que la próxima carga lo intente de nuevo; mientras, la pendiente dice «sin dato».
        relieveDe.current = null;
        setRelieve("error");
      });
    return () => {
      // Cortado a mitad de vuelo (StrictMode monta dos veces, o cambió una
      // dependencia): la marca se suelta para que la próxima pasada lo pida.
      // Antes quedaba puesta y la pendiente se quedaba en «Leyendo el relieve…».
      ac.abort();
      if (!terminado && relieveDe.current === k) relieveDe.current = null;
    };
  }, [planId, fitKey, hayVias, grilla, versionPlano]);

  // ── Sin rutas guardadas: la propuesta del planificador como vista previa ───
  useEffect(() => {
    if (!planId || fitKey === 0 || hayRutas || !hayCenso) {
      setPrevia(null);
      setEstadoPrevia("nada");
      return;
    }
    let vivo = true;
    setEstadoPrevia("cargando");
    setErrorPrevia(null);
    fetch(`/api/admin/forestal/loth/planificador?planId=${encodeURIComponent(planId)}`, { credentials: "include" })
      .then(async (r) => {
        const c = await leerJson<RespuestaPlan & { message?: string }>(r);
        if (!vivo) return;
        if (!r.ok || !c?.propuesta) throw new Error(mensaje(r.status, c));
        const geo = c.geografia;
        const conGeografia = !!geo?.desdeCache && !!(geo.fuentes.osm || geo.fuentes.elevacion);
        if (!conGeografia) {
          setPrevia(null);
          setEstadoPrevia("sinGeografia");
        } else if (c.propuesta.vacia) {
          setPrevia(null);
          setEstadoPrevia("nada");
        } else {
          setPrevia(c.propuesta);
          setEstadoPrevia("lista");
        }
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        setPrevia(null);
        setEstadoPrevia("error");
        setErrorPrevia(err instanceof Error ? err.message : String(err));
      });
    return () => {
      vivo = false;
    };
  }, [planId, fitKey, hayRutas, hayCenso]);

  const rutas = useMemo<FilaRuta[]>(() => filasDeRutas(carto.vias, grilla), [carto.vias, grilla]);
  const puntos = useMemo<FilaPunto[]>(() => filasDePuntos(carto.referencias), [carto.referencias]);

  /** Tocar en el mapa: resalta y abre la ficha (null = tocar el mapa vacío). Estable: el canvas va en `memo`. */
  const elegirEnElMapa = useCallback((clave: string | null) => setElegida(clave ? { clave, ficha: true } : null), []);
  const cerrar = useCallback(() => setElegida(null), []);

  /** Desde la lista: resalta y la lleva a la vista (una ruta se encuadra entera; un punto se centra). */
  const verEnElMapa = useCallback(
    (clave: string) => {
      setElegida({ clave, ficha: false });
      const r = rutas.find((f) => f.clave === clave);
      if (r) return onEncuadrar(r.vertices.map((v): LatLng => [v.lat, v.lng]));
      const p = puntos.find((f) => f.clave === clave);
      if (p) onCentrar([p.punto.lat, p.punto.lng]);
    },
    [rutas, puntos, onEncuadrar, onCentrar],
  );

  // Lo elegido que ya no existe (se borró la vía) no queda resaltando nada.
  const rutaElegida = elegida ? (rutas.find((f) => f.clave === elegida.clave) ?? null) : null;
  const puntoElegido = elegida ? (puntos.find((f) => f.clave === elegida.clave) ?? null) : null;
  const clave = rutaElegida || puntoElegido ? (elegida?.clave ?? null) : null;

  return {
    rutas,
    puntos,
    relieve,
    /** La clave resaltada (`via:…` / `ref:…`), o null. */
    clave,
    /** La ficha sobre el mapa: sólo si se tocó en el mapa. */
    fichaRuta: elegida?.ficha ? rutaElegida : null,
    fichaPunto: elegida?.ficha ? puntoElegido : null,
    elegirEnElMapa,
    verEnElMapa,
    cerrar,
    /** La propuesta punteada, si no hay rutas y no se ocultó. */
    previa: previaOculta ? null : previa,
    estadoPrevia: previaOculta && estadoPrevia === "lista" ? ("nada" as const) : estadoPrevia,
    errorPrevia,
    ocultarPrevia: () => setPreviaOculta(true),
  };
}

export type LothMapaRutas = ReturnType<typeof useLothMapaRutas>;
