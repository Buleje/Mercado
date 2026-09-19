"use client";

/**
 * useLothMapaDatos — lo que el mapa del Libro TH lee y guarda en el servidor.
 *
 * Operaciones del libro, polígono del área, plan activo, carátula y
 * cartografía (predio, referencias, vías, accesos); y, colgando del plan, el
 * censo, las especies autorizadas y el POA. Salió de `LothMapaView` cuando la
 * vista pasó las mil líneas: la pantalla ordena, esto trae y guarda.
 *
 * `cartoSinGuardar`: una vía trazada, una referencia marcada o el contorno
 * copiado del área viven en memoria hasta que alguien toca «Guardar». Con los
 * bloques de datos plegados ese botón puede no verse, así que la vista tiene
 * que saber si hay algo pendiente para decirlo junto al mapa.
 *
 * `leido`: el PUT de la cartografía y el de la parcela REEMPLAZAN el documento
 * entero. Si la lectura falló (un 429 al recargar seguido, un 500), la pantalla
 * queda con listas vacías y el primer «Guardar» —o marcar «deforestación
 * cero», que manda los vértices que haya en memoria— borraba lo guardado sin un
 * solo aviso (visto en la prueba del 2026-09-18: tras un 429 el bloque decía
 * «0 referencias» con dos guardadas). Sin lectura buena, no se escribe.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { emptyParcela, normalizeParcela, type LatLng, type LothParcela } from "@/lib/forestal/loth-geo";
import { emptyCartografia, normalizeCartografia, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { defaultPoaConfig, type PoaConfig } from "@/lib/forestal/loth-poa";
import type { CensusTreeDTO } from "../loth-mapa-shared";

export interface PlanActivoMapa {
  id: string;
  areaHa: number | null;
  parcelaCorta: string | null;
  titularName: string | null;
  planNumber: string | null;
  tituloHabilitante: string | null;
  resolucionNumber: string | null;
  arffs: string | null;
  region: string | null;
}

export interface CaratulaMapa {
  id: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  titularName: string | null;
  tituloHabilitante: string | null;
}

export interface EspeciePlanMapa {
  speciesCommon: string;
  volumenAutorizadoM3: string | number;
  arbolesAutorizados: number | null;
}

type Json = Record<string, unknown> & { message?: string };

/** El mensaje del servidor si lo manda; si no, el status. */
async function mensajeDeError(r: Response): Promise<string> {
  const cuerpo = await leerJson<Json>(r);
  return typeof cuerpo?.message === "string" && cuerpo.message ? cuerpo.message : `HTTP ${r.status}`;
}

const txt = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function useLothMapaDatos() {
  const [raw, setRaw] = useState<LothEntryDTO[] | null>(null);
  const [trees, setTrees] = useState<CensusTreeDTO[]>([]);
  /** Especies autorizadas + parámetros del POA: pintan el censo por categoría. */
  const [planSpecies, setPlanSpecies] = useState<EspeciePlanMapa[]>([]);
  const [poaConfig, setPoaConfig] = useState<PoaConfig>(defaultPoaConfig());
  const [parcela, setParcela] = useState<LothParcela>(emptyParcela());
  const [plan, setPlan] = useState<PlanActivoMapa | null>(null);
  const [caratula, setCaratula] = useState<CaratulaMapa | null>(null);
  const [carto, setCarto] = useState<LothCartografia>(emptyCartografia());
  /** La última cartografía que el servidor confirmó: contra ella se mide lo pendiente. */
  const [cartoGuardada, setCartoGuardada] = useState<LothCartografia>(emptyCartografia());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCarto, setSavingCarto] = useState(false);
  /** Cambia cuando termina una carga: el canvas re-encuadra. */
  const [fitKey, setFitKey] = useState(0);
  /** Qué se leyó bien del servidor: sin eso, guardar pisaría lo que hay. */
  const [leido, setLeido] = useState({ parcela: false, carto: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eRes, pRes, plRes, cRes, gRes] = await Promise.all([
        fetch("/api/admin/forestal/loth?limit=500&includeAnnulled=1", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/parcela", { credentials: "include" }),
        fetch("/api/admin/forestal/plan?active=1", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/caratula", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/cartografia", { credentials: "include" }),
      ]);
      if (!eRes.ok) throw new Error(await mensajeDeError(eRes));
      setRaw(((await eRes.json()).entries ?? []) as LothEntryDTO[]);
      if (pRes.ok) setParcela(normalizeParcela((await pRes.json()).parcela));
      if (gRes.ok) {
        const c = normalizeCartografia((await gRes.json()).cartografia);
        setCarto(c);
        setCartoGuardada(c);
      }
      setLeido({ parcela: pRes.ok, carto: gRes.ok });
      if (!pRes.ok || !gRes.ok) {
        const que = [!pRes.ok && `el polígono (${await mensajeDeError(pRes)})`, !gRes.ok && `la cartografía (${await mensajeDeError(gRes)})`]
          .filter(Boolean)
          .join(" ni ");
        setError(`No se pudo leer ${que}. Recarga la página antes de guardar: guardar ahora borraría lo que ya está.`);
      }
      if (cRes.ok) {
        const a = (await cRes.json()).active as Json | null;
        setCaratula(
          a
            ? {
                id: txt(a.id),
                departamento: txt(a.departamento),
                provincia: txt(a.provincia),
                distrito: txt(a.distrito),
                titularName: txt(a.titularName),
                tituloHabilitante: txt(a.tituloHabilitante),
              }
            : null,
        );
      }
      if (plRes.ok) {
        const a = (await plRes.json()).active as Json | null;
        setPlan(
          a
            ? {
                id: String(a.id),
                areaHa: a.areaHa != null ? Number(a.areaHa) : null,
                parcelaCorta: txt(a.parcelaCorta),
                titularName: txt(a.titularName),
                planNumber: txt(a.planNumber),
                tituloHabilitante: txt(a.tituloHabilitante),
                resolucionNumber: txt(a.resolucionNumber),
                arffs: txt(a.arffs),
                region: txt(a.region),
              }
            : null,
        );
        // El censo y el POA cuelgan del plan activo: se piden en cascada (no
        // bloquean el primer render del mapa).
        if (a?.id) {
          const pid = encodeURIComponent(String(a.id));
          const [tRes, sRes, poaRes] = await Promise.all([
            fetch(`/api/admin/forestal/plan/census?planId=${pid}`, { credentials: "include" }),
            fetch(`/api/admin/forestal/plan?planId=${pid}`, { credentials: "include" }),
            fetch(`/api/admin/forestal/loth/poa?planId=${pid}`, { credentials: "include" }),
          ]);
          if (tRes.ok) setTrees((await tRes.json()).trees ?? []);
          if (sRes.ok) setPlanSpecies((await sRes.json()).species ?? []);
          if (poaRes.ok) setPoaConfig((await poaRes.json()).config ?? defaultPoaConfig());
        }
      }
      setFitKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persistParcela = useCallback(
    async (next: { vertices: LatLng[]; nota: string; deforestacionCero: boolean }) => {
      if (!leido.parcela) {
        setError("El polígono no se pudo leer del servidor: recarga la página antes de guardarlo.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/parcela", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(next),
        });
        if (!r.ok) throw new Error(await mensajeDeError(r));
        setParcela(normalizeParcela((await r.json()).parcela));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [leido.parcela],
  );

  /**
   * `siguiente` permite guardar un estado recién armado sin esperar al
   * re-render (lo usa el guardado del dibujo del predio).
   *
   * El cuerpo se arma con TODOS los campos y no con una lista escrita a mano:
   * cuando era `{referencias, vias, accesos, nota}` el predio se perdía en cada
   * guardado —el PUT reemplaza el documento entero— y sin un solo error.
   */
  const guardarCartografia = useCallback(
    async (siguiente?: LothCartografia) => {
      const cuerpo = siguiente ?? carto;
      if (!leido.carto) {
        setError("La cartografía no se pudo leer del servidor: recarga la página antes de guardar referencias, vías o el predio.");
        return;
      }
      setSavingCarto(true);
      setError(null);
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
          }),
        });
        if (!r.ok) throw new Error(await mensajeDeError(r));
        const c = normalizeCartografia((await r.json()).cartografia);
        setCarto(c);
        setCartoGuardada(c);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSavingCarto(false);
      }
    },
    [carto, leido.carto],
  );

  const cartoSinGuardar = useMemo(() => JSON.stringify(carto) !== JSON.stringify(cartoGuardada), [carto, cartoGuardada]);

  return {
    raw,
    trees,
    planSpecies,
    poaConfig,
    parcela,
    plan,
    caratula,
    setCaratula,
    carto,
    setCarto,
    cartoSinGuardar,
    loading,
    error,
    setError,
    saving,
    savingCarto,
    fitKey,
    persistParcela,
    guardarCartografia,
  };
}

export type LothMapaDatos = ReturnType<typeof useLothMapaDatos>;
