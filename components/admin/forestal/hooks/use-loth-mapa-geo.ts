"use client";

/**
 * useLothMapaGeo — el ÁREA y la CARTOGRAFÍA del mapa del Libro TH, por permiso
 * (ADR-462, 02-10-2026). Salió de `use-loth-mapa-datos` cuando dejaron de ser
 * «del negocio»: cada permiso tiene su documento y el mapa muestra el del
 * permiso de la banda (`loth-mapa-alcance`).
 *
 * El estado vive POR ALCANCE (`porClave`): una vía trazada sin guardar en un
 * permiso sigue ahí al volver a él, y la respuesta que llega tarde de otro
 * permiso cae en el suyo, nunca en el que se está mirando. Antes había un solo
 * estado y no se releía al cambiar de permiso justamente para no borrar lo
 * pendiente.
 *
 * `leido`: el PUT de la cartografía y el de la parcela REEMPLAZAN el documento
 * entero. Sin una lectura buena del alcance no se escribe: tras un 429 la
 * pantalla quedaba vacía y el primer «Guardar» borraba lo guardado (prueba del
 * 2026-09-18).
 */

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { emptyParcela, normalizeParcela, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { emptyCartografia, normalizeCartografia, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import {
  areasDeTodos,
  cartoDifiere,
  cartografiaDeTodos,
  claveAlcance,
  leerRespuestaCartografia,
  leerRespuestaParcela,
  planIdDelPut,
  queryCartografia,
  queryParcela,
  type AlcanceMapa,
  type AreaDePermiso,
} from "../loth-mapa-alcance";

type Json = Record<string, unknown> & { message?: string; error?: string; code?: string };

/** El mensaje del servidor si lo manda; si no, el status. */
export async function mensajeDeError(r: Response): Promise<string> {
  const cuerpo = await leerJson<Json>(r);
  return typeof cuerpo?.message === "string" && cuerpo.message ? cuerpo.message : `HTTP ${r.status}`;
}

/**
 * Lo que devuelve guardar la cartografía. `conflicto` = otro guardó el plano
 * desde que se leyó (409): ya se recargó lo último, que viene acá para que
 * quien guarda decida (el planificador vuelve a mezclar sobre eso).
 */
export type ResultadoGuardarCarto = { ok: true; cartografia: LothCartografia } | { ok: false; conflicto: LothCartografia | null };

/** Lo que ve quien tocó «Guardar» cuando otro guardó antes. */
export const MENSAJE_PLANO_CAMBIO = "Alguien cambió el plano: recargué lo último, revisa y vuelve a guardar.";

/** Con «Todos» nada se escribe sin decir en qué permiso (ADR-462 §3). */
export const MENSAJE_ELIGE_PERMISO = "Con «Todos» no se guarda el plano: elige su permiso en la banda y vuelve a guardar.";

interface EstadoGeo {
  parcela: LothParcela;
  /** El permiso no tiene área propia: se ve la del negocio. */
  heredada: boolean;
  carto: LothCartografia;
  /** La última cartografía que el servidor confirmó: contra ella se mide lo pendiente. */
  cartoGuardada: LothCartografia;
  leido: { parcela: boolean; carto: boolean };
  /** Con «Todos»: las áreas de cada permiso (la del negocio va en `parcela`). */
  otras: AreaDePermiso[];
  cargando: boolean;
}

const VACIO: EstadoGeo = {
  parcela: emptyParcela(),
  heredada: false,
  carto: emptyCartografia(),
  cartoGuardada: emptyCartografia(),
  leido: { parcela: false, carto: false },
  otras: [],
  cargando: true,
};
const SIN_OTRAS: AreaDePermiso[] = [];

const alcanceDe = (tipo: AlcanceMapa["tipo"], planId: string | null): AlcanceMapa =>
  tipo === "plan" && planId ? { tipo: "plan", planId } : tipo === "todos" ? { tipo: "todos" } : { tipo: "negocio" };

export function useLothMapaGeo(alcance: AlcanceMapa, onError: (m: string | null) => void) {
  const tipo = alcance.tipo;
  const planId = alcance.tipo === "plan" ? alcance.planId : null;
  const clave = claveAlcance(alcance);
  /* El aviso de error por ref, no en las dependencias: un `onError` nuevo en cada
     render (una flecha inline) relanzaba los efectos en bucle — fetch → estado →
     render → otra flecha — y una prueba llegó a 9 GB (02-10-2026). */
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });
  const [porClave, setPorClave] = useState<Record<string, EstadoGeo>>({});
  /** La cartografía del negocio, que con un permiso elegido se pinta tenue como contexto. */
  const [contexto, setContexto] = useState<LothCartografia | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCarto, setSavingCarto] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [releer, setReleer] = useState(0);
  const actual = porClave[clave] ?? VACIO;

  const editar = useCallback((k: string, f: (e: EstadoGeo) => EstadoGeo) => setPorClave((m) => ({ ...m, [k]: f(m[k] ?? VACIO) })), []);

  useEffect(() => {
    const a = alcanceDe(tipo, planId);
    const k = claveAlcance(a);
    let vigente = true;
    editar(k, (e) => ({ ...e, cargando: true }));
    void (async () => {
      try {
        const [pRes, cRes, xRes] = await Promise.all([
          fetch(`/api/admin/forestal/loth/parcela${queryParcela(a)}`, { credentials: "include" }),
          fetch(`/api/admin/forestal/loth/cartografia${queryCartografia(a)}`, { credentials: "include" }),
          a.tipo === "plan" ? fetch("/api/admin/forestal/loth/cartografia", { credentials: "include" }) : Promise.resolve(null),
        ]);
        const pj = pRes.ok ? leerRespuestaParcela(await pRes.json()) : null;
        const cj = cRes.ok ? leerRespuestaCartografia(await cRes.json()) : null;
        const xj = xRes?.ok ? leerRespuestaCartografia(await xRes.json()) : null;
        if (!vigente) return;
        const todos = pj && a.tipo === "todos" ? areasDeTodos(pj) : null;
        const carto = cj ? (a.tipo === "todos" ? cartografiaDeTodos(cj) : cj.cartografia) : null;
        editar(k, (e) => ({
          ...e,
          cargando: false,
          ...(pj ? { parcela: todos ? todos.negocio : pj.parcela, heredada: a.tipo === "plan" && pj.heredada, otras: todos ? todos.otras : SIN_OTRAS } : {}),
          /* Con algo sin guardar (y una lectura buena debajo), la cartografía no se pisa. */
          ...(carto && (!e.leido.carto || !cartoDifiere(e.carto, e.cartoGuardada)) ? { carto, cartoGuardada: carto } : {}),
          leido: { parcela: e.leido.parcela || pj != null, carto: e.leido.carto || carto != null },
        }));
        if (xj) setContexto(xj.cartografia);
        else if (a.tipo === "negocio" && carto) setContexto(carto);
        if (!pRes.ok || !cRes.ok) {
          const que = [!pRes.ok && `el polígono (${await mensajeDeError(pRes)})`, !cRes.ok && `la cartografía (${await mensajeDeError(cRes)})`]
            .filter(Boolean)
            .join(" ni ");
          if (vigente) onErrorRef.current(`No se pudo leer ${que}. Recarga la página antes de guardar: guardar ahora borraría lo que ya está.`);
        }
      } catch (err) {
        if (!vigente) return;
        editar(k, (e) => ({ ...e, cargando: false }));
        onErrorRef.current(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      vigente = false;
    };
  }, [tipo, planId, releer, editar]);

  const setCarto: Dispatch<SetStateAction<LothCartografia>> = useCallback(
    (v) => editar(clave, (e) => ({ ...e, carto: typeof v === "function" ? v(e.carto) : v })),
    [clave, editar],
  );

  const persistParcela = useCallback(
    async (next: { vertices: LatLng[]; nota: string; deforestacionCero: boolean }) => {
      if (tipo === "todos") {
        onErrorRef.current("Con «Todos» no se guarda ningún área: elige su permiso en la banda.");
        return;
      }
      if (!actual.leido.parcela) {
        onErrorRef.current("El polígono no se pudo leer del servidor: recarga la página antes de guardarlo.");
        return;
      }
      const k = clave;
      const pid = planIdDelPut(alcanceDe(tipo, planId));
      setSaving(true);
      onErrorRef.current(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/parcela", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(pid ? { ...next, planId: pid } : next),
        });
        if (!r.ok) throw new Error(await mensajeDeError(r));
        const p = normalizeParcela((await r.json()).parcela);
        editar(k, (e) => ({ ...e, parcela: p, heredada: false }));
      } catch (err) {
        onErrorRef.current(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [tipo, planId, clave, actual.leido.parcela, editar, onError],
  );

  /**
   * Guarda contra la versión leída (`baseUpdatedAt`, por permiso): si otro
   * guardó en el medio, el servidor responde 409 con lo último, se recarga y
   * —salvo `avisarConflicto: false`— se avisa. `base` fuerza la versión (el
   * planificador reintenta sobre la que le devolvió el 409, antes del
   * re-render). `siguiente` guarda un estado recién armado sin esperar al
   * re-render (el dibujo del predio). El cuerpo lleva TODOS los campos: con una
   * lista escrita a mano el predio se perdía en cada guardado.
   */
  const guardarCartografia = useCallback(
    async (siguiente?: LothCartografia, opts: { base?: string | null; avisarConflicto?: boolean } = {}): Promise<ResultadoGuardarCarto> => {
      if (tipo === "todos") {
        onErrorRef.current(MENSAJE_ELIGE_PERMISO);
        return { ok: false, conflicto: null };
      }
      if (!actual.leido.carto) {
        onErrorRef.current("La cartografía no se pudo leer del servidor: recarga la página antes de guardar referencias, vías o el predio.");
        return { ok: false, conflicto: null };
      }
      const k = clave;
      const pid = planIdDelPut(alcanceDe(tipo, planId));
      const cuerpo = siguiente ?? actual.carto;
      setSavingCarto(true);
      onErrorRef.current(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/cartografia", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            referencias: cuerpo.referencias,
            vias: cuerpo.vias,
            accesos: cuerpo.accesos,
            predio: cuerpo.predio,
            nota: cuerpo.nota,
            baseUpdatedAt: opts.base !== undefined ? opts.base : actual.cartoGuardada.updatedAt,
            ...(pid ? { planId: pid } : {}),
          }),
        });
        if (r.status === 409) {
          const c = normalizeCartografia((await leerJson<{ cartografia?: unknown }>(r))?.cartografia);
          editar(k, (e) => ({ ...e, carto: c, cartoGuardada: c }));
          if (opts.avisarConflicto !== false) onErrorRef.current(MENSAJE_PLANO_CAMBIO);
          return { ok: false, conflicto: c };
        }
        if (!r.ok) throw new Error(await mensajeDeError(r));
        const c = normalizeCartografia((await r.json()).cartografia);
        editar(k, (e) => ({ ...e, carto: c, cartoGuardada: c }));
        if (!pid) setContexto(c);
        return { ok: true, cartografia: c };
      } catch (err) {
        onErrorRef.current(err instanceof Error ? err.message : String(err));
        return { ok: false, conflicto: null };
      } finally {
        setSavingCarto(false);
      }
    },
    [tipo, planId, clave, actual.leido.carto, actual.carto, actual.cartoGuardada.updatedAt, editar, onError],
  );

  /**
   * «Pasar a este permiso»: COPIA el área del negocio al permiso (idempotente;
   * el servidor nunca pisa un permiso que ya tenga la suya). La del negocio
   * queda donde estaba.
   */
  const copiarAlPermiso = useCallback(async () => {
    if (tipo !== "plan" || !planId) return;
    const k = clave;
    setCopiando(true);
    onErrorRef.current(null);
    try {
      const r = await fetch("/api/admin/forestal/loth/parcela/copiar", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ planId }),
      });
      if (r.status === 409) {
        onErrorRef.current("Este permiso ya tiene su área: te muestro la suya.");
        setReleer((n) => n + 1);
        return;
      }
      if (r.status === 404) {
        const j = await leerJson<Json>(r);
        const codigo = j?.error ?? j?.code;
        throw new Error(
          codigo === "sin_area_del_negocio"
            ? "El negocio no tiene un área que pasar: dibújala para este permiso."
            : codigo === "plan_not_found"
              ? "Ese permiso ya no está vivo: elige otro en la banda."
              : (j?.message ?? "HTTP 404"),
        );
      }
      if (!r.ok) throw new Error(await mensajeDeError(r));
      const p = normalizeParcela((await r.json()).parcela);
      editar(k, (e) => ({ ...e, parcela: p, heredada: false, leido: { ...e.leido, parcela: true } }));
    } catch (err) {
      onErrorRef.current(err instanceof Error ? err.message : String(err));
    } finally {
      setCopiando(false);
    }
  }, [tipo, planId, clave, editar]);

  return {
    alcance,
    parcela: actual.parcela,
    heredada: actual.heredada,
    carto: actual.carto,
    setCarto,
    cartoSinGuardar: cartoDifiere(actual.carto, actual.cartoGuardada),
    /** Con «Todos»: las áreas de cada permiso con área propia. */
    areasOtras: tipo === "todos" ? actual.otras : SIN_OTRAS,
    /** Con un permiso elegido: las referencias y vías del negocio, para pintarlas tenues. */
    contexto: tipo === "plan" ? contexto : null,
    /** El alcance que se mira ya se leyó (lo usa «¿En qué permiso?» para arrancar a dibujar). */
    geoListo: porClave[clave] != null && !actual.cargando,
    saving,
    savingCarto,
    copiando,
    persistParcela,
    guardarCartografia,
    copiarAlPermiso,
  };
}
