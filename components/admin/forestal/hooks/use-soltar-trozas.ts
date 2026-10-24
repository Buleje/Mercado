"use client";

/**
 * use-soltar-trozas — los datos de «Soltar trozas de una corrida» (ADR-447 §6).
 *
 *  · La corrida con sus piezas y sus m³ por guía (`GET ?soltar=`), al abrir.
 *  · La vista previa —materia prima y rendimiento antes y después, lotes, el
 *    56 %— sale al instante de `vistaPreviaDeSoltar`, la MISMA cuenta con la
 *    que decide el servidor. El cliente sólo previsualiza.
 *  · Qué corridas quedan listas para vincular (`GET ?soltar=&simular=1`) lo
 *    mide el servidor con el diagnóstico de la bandeja: una vez al abrir (la
 *    sugerencia) y otra cuando la selección se queda quieta.
 *  · Soltar (`POST { accion: "soltar" }`), con el motivo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp, pedirJsonCtp } from "@/lib/forestal/ctp-fetch";
import {
  MAX_TROZAS_SIMULAR,
  MOTIVO_MIN_SOLTAR,
  vistaPreviaDeSoltar,
  type QueDestraba,
  type ResultadoSoltarTrozas,
  type SimulacionDeSoltar,
  type VistaDeSoltar,
} from "@/lib/forestal/soltar-trozas";

const RUTA = "/api/admin/forestal/ctp/vincular-trozas";
/** Lo que espera la selección quieta antes de pedir la simulación. */
const QUIETA_MS = 700;

type Soltadas = Extract<ResultadoSoltarTrozas, { ok: true }>;

export function useSoltarTrozas(corridaId: string) {
  const [vista, setVista] = useState<VistaDeSoltar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [motivo, setMotivo] = useState("");
  /** `null` = todavía se calcula. */
  const [sugerencia, setSugerencia] = useState<{ ya: string[]; conLlegada: string[]; guias: string[] } | null>(null);
  const [destraba, setDestraba] = useState<QueDestraba | null>(null);
  const [midiendo, setMidiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setVista(await pedirJsonCtp<VistaDeSoltar>(`${RUTA}?soltar=${encodeURIComponent(corridaId)}`, "las trozas de la corrida"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [corridaId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* La sugerencia, una vez: con toda la madera en el patio, qué tomarían las que esperan. */
  useEffect(() => {
    let vivo = true;
    pedirJsonCtp<SimulacionDeSoltar>(`${RUTA}?soltar=${encodeURIComponent(corridaId)}&simular=1`, "la sugerencia")
      .then((s) => {
        if (vivo) setSugerencia({ ya: s.sugeridas, conLlegada: s.sugeridasConLlegada ?? [], guias: s.guiasALlegar ?? [] });
      })
      .catch(() => {
        if (vivo) setSugerencia({ ya: [], conLlegada: [], guias: [] });
      });
    return () => {
      vivo = false;
    };
  }, [corridaId]);

  /* Qué destraba la selección, cuando se queda quieta. Un turno por pedido: la
     respuesta vieja no pisa a la nueva. */
  useEffect(() => {
    const t = ++turno.current;
    setDestraba(null);
    if (marcadas.size === 0 || marcadas.size > MAX_TROZAS_SIMULAR) {
      setMidiendo(false);
      return;
    }
    setMidiendo(true);
    const id = window.setTimeout(() => {
      const trozas = [...marcadas].sort().join(",");
      pedirJsonCtp<SimulacionDeSoltar>(
        `${RUTA}?soltar=${encodeURIComponent(corridaId)}&simular=1&trozas=${encodeURIComponent(trozas)}`,
        "qué corridas quedan listas",
      )
        .then((s) => {
          if (t === turno.current) setDestraba(s.destraba);
        })
        .catch(() => {
          if (t === turno.current) setDestraba(null);
        })
        .finally(() => {
          if (t === turno.current) setMidiendo(false);
        });
    }, QUIETA_MS);
    return () => window.clearTimeout(id);
  }, [corridaId, marcadas]);

  const previa = useMemo(
    () => (vista ? vistaPreviaDeSoltar(vista.corrida, vista.piezas, vista.consumos, marcadas) : null),
    [vista, marcadas],
  );

  const alternar = useCallback((id: string) => {
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const marcar = useCallback((ids: readonly string[]) => setMarcadas(new Set(ids)), []);

  const faltaMotivo = motivo.trim().length < MOTIVO_MIN_SOLTAR;
  const bloqueo = !previa
    ? "Cargando…"
    : marcadas.size === 0
      ? "Marca las trozas que vuelven al patio."
      : previa.imposible
        ? previa.despues.piezas === 0
          ? "Aun sin trozas, la corrida declara madera que no alcanza para lo producido: corrige su materia prima en la ficha."
          : "Lo que queda no alcanza para lo producido: deja más trozas o suéltalas todas."
        : previa.sobreAtribuido
          ? "Las guías quedarían con más m³ que la madera: corrige primero la atribución de la corrida."
          : vista?.corrida.congelado
            ? "La corrida tiene el costo congelado: su madera ya no se cambia."
            : vista?.corrida.mesCerrado
              ? `${vista.corrida.mesCerrado} está cerrado: reabre el período para corregir.`
              : null;

  /** Suelta las marcadas. Devuelve el resultado, o `null` si el servidor dijo que no (queda en `errorEnvio`). */
  const soltar = useCallback(async (): Promise<Soltadas | null> => {
    setErrorEnvio(null);
    setEnviando(true);
    try {
      const r = await fetch(RUTA, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ accion: "soltar", corridaId, trozaIds: [...marcadas], motivo: motivo.trim() }),
      });
      const j = (await r.json().catch(() => null)) as ResultadoSoltarTrozas | null;
      if (!r.ok || !j || !j.ok) {
        setErrorEnvio(j && !j.ok ? j.message : `El servidor respondió ${r.status}.`);
        /* Otra pantalla las soltó primero: la lista vieja ya no vale, se relee.
           Con cualquier otro «no» la selección queda para corregirla. */
        if (j && !j.ok && j.error === "PROPUESTA_DESACTUALIZADA") {
          setMarcadas(new Set());
          void cargar();
        }
        return null;
      }
      invalidarCtp();
      return j;
    } catch (e) {
      setErrorEnvio(`Sin conexión: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setEnviando(false);
    }
  }, [corridaId, marcadas, motivo, cargar]);

  return {
    vista,
    error,
    cargar,
    marcadas,
    alternar,
    marcar,
    previa,
    sugerencia,
    destraba,
    midiendo,
    motivo,
    setMotivo,
    faltaMotivo,
    bloqueo,
    soltar,
    enviando,
    errorEnvio,
  };
}
