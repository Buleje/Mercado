"use client";

/**
 * useLothPlanificador — el planificador de extracción en el mapa del Libro TH:
 * pide la geografía (ríos y caminos de OpenStreetMap, altitud) y la propuesta
 * (patio, campamento, trochas, camino de salida, orden de tala), la deja como
 * vista previa y, si se acepta, la agrega a la cartografía con el mismo PUT de
 * siempre — con «Deshacer».
 *
 *   · La geografía se pide una vez por plan y la comparten la capa «Ríos y
 *     caminos» y la propuesta: el planificador espera esa misma lectura para
 *     no salir dos veces a Overpass (tarda de 8 a 50 s la primera vez).
 *   · Mover el patio vuelve a pedir la propuesta con `patioLat`/`patioLng`,
 *     450 ms después de soltarlo; un pedido nuevo cancela el anterior.
 *   · Agregar reemplaza lo propuesto antes (ids `prop-…`) sin tocar lo
 *     dibujado; Deshacer quita lo recién agregado y devuelve lo de antes.
 *     Los dos guardan contra la versión leída: si otro guardó el plano en el
 *     medio (409), se vuelve a armar sobre lo último y se reintenta UNA vez.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import type { LatLng } from "@/lib/forestal/loth-geo";
import type { LothCartografia, LothReferencia, LothVia } from "@/lib/forestal/loth-cartografia";
import { PREFIJO_PROPUESTA } from "@/lib/forestal/loth-geografia";
import { mezclarPropuestaEnCartografia, PARAMETROS_PLAN } from "@/lib/forestal/loth-planificador";
import { avisarTapasDelMapa } from "../loth-mapa-etiquetas";
import type { ResultadoGuardarCarto } from "./use-loth-mapa-datos";
import type { GeografiaVista, RespuestaPlan } from "../loth-mapa-plan";

export interface ParamsPlan {
  /** Pendiente máxima de arrastre (%). */
  pendienteMax: number;
  fajaRio: number;
  fajaQuebrada: number;
  /** true = sólo los árboles por talar; false = también las trozas que siguen en el monte. */
  soloEnPie: boolean;
}

export const PARAMS_PLAN_INICIAL: ParamsPlan = {
  pendienteMax: PARAMETROS_PLAN.pendienteMaxArrastrePct,
  fajaRio: PARAMETROS_PLAN.fajaRioM,
  fajaQuebrada: PARAMETROS_PLAN.fajaQuebradaM,
  soloEnPie: false,
};

/** Lo que se agregó al plano la última vez: para deshacerlo. */
export interface AgregadoAlPlano {
  ids: ReadonlySet<string>;
  /** Lo propuesto que había antes y el agregado reemplazó. */
  antes: { referencias: LothReferencia[]; vias: LothVia[] };
  referencias: number;
  vias: number;
  omitidas: string[];
}

interface Deps {
  planId: string | null;
  carto: LothCartografia;
  guardarCartografia: (siguiente?: LothCartografia, opts?: { base?: string | null; avisarConflicto?: boolean }) => Promise<ResultadoGuardarCarto>;
  /** Encuadrar la propuesta al llegar (no al mover el patio: ahí manda el usuario). `derecha` = px que tapa el panel. */
  onEncuadrar: (pts: LatLng[], derecha?: number) => void;
}

const RETARDO_PATIO_MS = 450;

function mensaje(r: Response, cuerpo: { message?: unknown } | null): string {
  if (r.status === 429) return "Demasiados pedidos seguidos: espera un minuto.";
  return typeof cuerpo?.message === "string" && cuerpo.message ? cuerpo.message : `HTTP ${r.status}`;
}

export function useLothPlanificador({ planId, carto, guardarCartografia, onEncuadrar }: Deps) {
  const [abierto, setAbierto] = useState(false);
  const [params, setParams] = useState<ParamsPlan>(PARAMS_PLAN_INICIAL);
  const [mostrarOsm, setMostrarOsm] = useState(false);
  const [geo, setGeo] = useState<GeografiaVista | null>(null);
  const [geoCargando, setGeoCargando] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaPlan | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patioFijo, setPatioFijo] = useState<LatLng | null>(null);
  const [agregado, setAgregado] = useState<AgregadoAlPlano | null>(null);
  const [guardando, setGuardando] = useState(false);

  const geoPromesa = useRef<Promise<void> | null>(null);
  /** La lectura de geografía en curso: se aborta al cambiar de plan (su respuesta es de otra zona). */
  const geoPedido = useRef<AbortController | null>(null);
  /** En una ref: si fuera dependencia, cada render del mapa rehacía la capa de la propuesta. */
  const encuadrarRef = useRef(onEncuadrar);
  encuadrarRef.current = onEncuadrar;
  const pedido = useRef<AbortController | null>(null);
  const reloj = useRef<number | null>(null);

  // Otro plan = otra zona: lo leído y lo propuesto no sirven.
  useEffect(() => {
    geoPromesa.current = null;
    geoPedido.current?.abort();
    pedido.current?.abort();
    setGeo(null);
    setGeoError(null);
    setRespuesta(null);
    setPatioFijo(null);
    setAgregado(null);
  }, [planId]);
  useEffect(
    () => () => {
      pedido.current?.abort();
      geoPedido.current?.abort();
      if (reloj.current != null) window.clearTimeout(reloj.current);
    },
    [],
  );

  const cargarGeografia = useCallback(
    (refrescar = false): Promise<void> => {
      if (geoPromesa.current && !refrescar) return geoPromesa.current;
      geoPedido.current?.abort();
      const ac = new AbortController();
      geoPedido.current = ac;
      setGeoCargando(true);
      setGeoError(null);
      const q = new URLSearchParams();
      if (planId) q.set("planId", planId);
      if (refrescar) q.set("refrescar", "1");
      const p = fetch(`/api/admin/forestal/loth/geografia?${q}`, { credentials: "include", signal: ac.signal })
        .then(async (r) => {
          const c = await leerJson<GeografiaVista & { message?: string }>(r);
          if (!r.ok || !c || !Array.isArray(c.rios)) throw new Error(mensaje(r, c));
          if (!ac.signal.aborted) setGeo(c);
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          setGeoError(err instanceof Error ? err.message : String(err));
          // Que el próximo pedido lo vuelva a intentar.
          geoPromesa.current = null;
        })
        .finally(() => {
          if (!ac.signal.aborted) setGeoCargando(false);
        });
      geoPromesa.current = p;
      return p;
    },
    [planId],
  );

  // La capa y el panel necesitan los ríos y caminos: se piden al primero que los muestre.
  useEffect(() => {
    if ((abierto || mostrarOsm) && !geo && !geoPromesa.current && !geoError) void cargarGeografia();
  }, [abierto, mostrarOsm, geo, geoError, cargarGeografia]);

  // Abrir o cerrar el panel cambia lo que tapa el mapa.
  useEffect(() => {
    avisarTapasDelMapa();
  }, [abierto]);

  const pedirPropuesta = useCallback(
    async (patio: LatLng | null, encuadrar: boolean) => {
      pedido.current?.abort();
      const ac = new AbortController();
      pedido.current = ac;
      setCargando(true);
      setError(null);
      try {
        // La misma lectura de geografía que la capa: el servidor ya la tiene guardada.
        await cargarGeografia();
        if (ac.signal.aborted) return;
        const q = new URLSearchParams();
        if (planId) q.set("planId", planId);
        q.set("pendienteMax", String(params.pendienteMax));
        q.set("fajaRio", String(params.fajaRio));
        q.set("fajaQuebrada", String(params.fajaQuebrada));
        if (params.soloEnPie) q.set("soloEnPie", "1");
        if (patio) {
          q.set("patioLat", patio[0].toFixed(7));
          q.set("patioLng", patio[1].toFixed(7));
        }
        const r = await fetch(`/api/admin/forestal/loth/planificador?${q}`, { credentials: "include", signal: ac.signal });
        const c = await leerJson<RespuestaPlan & { message?: string }>(r);
        if (!r.ok || !c?.propuesta) throw new Error(mensaje(r, c));
        setRespuesta(c);
        setAgregado(null);
        const pr = c.propuesta;
        if (encuadrar && !pr.vacia) {
          const pts: LatLng[] = [
            ...pr.patios.slice(0, 1).map((x): LatLng => [x.lat, x.lng]),
            ...pr.trochas.lineas.flatMap((l) => l.puntos),
            ...(pr.caminoSalida?.puntos ?? []),
          ];
          // En la computadora el panel (23rem) tapa la derecha del mapa; en el celular va abajo.
          const derecha = typeof window !== "undefined" && window.innerWidth >= 640 ? 380 : 0;
          if (pts.length) encuadrarRef.current(pts, derecha);
        }
      } catch (err) {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!ac.signal.aborted) setCargando(false);
      }
    },
    [planId, params, cargarGeografia],
  );

  /** «Proponer»: con el patio que el usuario haya movido, si lo movió. */
  const proponer = useCallback(() => void pedirPropuesta(patioFijo, true), [pedirPropuesta, patioFijo]);

  /** Soltar el patio en otro lugar: se recalcula lo demás alrededor de él. */
  const moverPatio = useCallback(
    (p: LatLng) => {
      setPatioFijo(p);
      // Lo que se ve ya no es la propuesta de ESTE patio: «Agregar al plano»
      // espera la nueva (antes guardaba la del patio anterior, y la respuesta
      // que llegaba después borraba el «Deshacer»).
      pedido.current?.abort();
      setCargando(true);
      if (reloj.current != null) window.clearTimeout(reloj.current);
      reloj.current = window.setTimeout(() => {
        reloj.current = null;
        void pedirPropuesta(p, false);
      }, RETARDO_PATIO_MS);
    },
    [pedirPropuesta],
  );

  /** Volver al patio que elige el planificador. */
  const soltarPatio = useCallback(() => {
    // Un arrastre pendiente dispararía después con el patio fijado.
    if (reloj.current != null) window.clearTimeout(reloj.current);
    reloj.current = null;
    setPatioFijo(null);
    void pedirPropuesta(null, false);
  }, [pedirPropuesta]);

  const descartar = useCallback(() => {
    pedido.current?.abort();
    if (reloj.current != null) window.clearTimeout(reloj.current);
    setCargando(false);
    setRespuesta(null);
    setPatioFijo(null);
    setAgregado(null);
    setError(null);
  }, []);

  /**
   * Guarda lo que arma `armar` sobre la cartografía; si otro guardó en el medio
   * (409), lo vuelve a armar sobre lo último que devolvió el servidor y
   * reintenta UNA vez. Devuelve la base sobre la que quedó, o null.
   */
  const guardarSobreLoUltimo = useCallback(
    async (armar: (base: LothCartografia) => LothCartografia): Promise<LothCartografia | null> => {
      setGuardando(true);
      try {
        const primera = await guardarCartografia(armar(carto), { avisarConflicto: false });
        if (primera.ok) return carto;
        if (!primera.conflicto) return null;
        const base = primera.conflicto;
        const segunda = await guardarCartografia(armar(base), { base: base.updatedAt });
        return segunda.ok ? base : null;
      } finally {
        setGuardando(false);
      }
    },
    [carto, guardarCartografia],
  );

  const agregarAlPlano = useCallback(async () => {
    if (!respuesta || respuesta.propuesta.vacia || cargando || !respuesta.puedeGuardar) return;
    const prop = respuesta.propuesta;
    const base = await guardarSobreLoUltimo((c) => mezclarPropuestaEnCartografia(c, prop).cartografia);
    if (!base) return;
    // Lo que se agregó y lo que reemplazó, contado sobre la base que quedó guardada.
    const m = mezclarPropuestaEnCartografia(base, prop);
    const antes = {
      referencias: base.referencias.filter((r) => r.id.startsWith(PREFIJO_PROPUESTA)),
      vias: base.vias.filter((v) => v.id.startsWith(PREFIJO_PROPUESTA)),
    };
    const ids = new Set([...m.cartografia.referencias, ...m.cartografia.vias].map((x) => x.id).filter((id) => id.startsWith(PREFIJO_PROPUESTA)));
    setAgregado({ ids, antes, referencias: m.agregadas.referencias, vias: m.agregadas.vias, omitidas: m.omitidas });
  }, [respuesta, cargando, guardarSobreLoUltimo]);

  const deshacer = useCallback(async () => {
    if (!agregado) return;
    const quitar = (c: LothCartografia): LothCartografia => ({
      ...c,
      referencias: [...c.referencias.filter((r) => !agregado.ids.has(r.id)), ...agregado.antes.referencias.filter((r) => !c.referencias.some((x) => x.id === r.id))],
      vias: [...c.vias.filter((v) => !agregado.ids.has(v.id)), ...agregado.antes.vias.filter((v) => !c.vias.some((x) => x.id === v.id))],
    });
    // Si falla, el error (y el «alguien cambió el plano» de un segundo 409) lo muestra el mapa.
    if (await guardarSobreLoUltimo(quitar)) setAgregado(null);
  }, [agregado, guardarSobreLoUltimo]);

  const propuesta = respuesta?.propuesta ?? null;
  return {
    abierto,
    setAbierto,
    params,
    setParams,
    mostrarOsm,
    setMostrarOsm,
    geo,
    geoCargando,
    geoError,
    actualizarGeografia: () => void cargarGeografia(true).then(() => (respuesta ? pedirPropuesta(patioFijo, false) : undefined)),
    respuesta,
    cargando,
    error,
    patioFijo,
    proponer,
    moverPatio,
    soltarPatio,
    descartar,
    agregado,
    guardando,
    agregarAlPlano,
    deshacer,
    /** Ríos y caminos a la vista: la capa encendida o el panel abierto. */
    osmVisible: mostrarOsm || abierto,
    /** Lo que se dibuja punteado: con el panel abierto y mientras no esté en el plano. */
    vistaPrevia: abierto && !agregado && propuesta && !propuesta.vacia ? propuesta : null,
  };
}

export type LothPlanificador = ReturnType<typeof useLothPlanificador>;
