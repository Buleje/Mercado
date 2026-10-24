"use client";

/**
 * El estado de «Talar varios árboles»: las filas de la planilla, lo que vale
 * para todos (fecha, motosierrista, hora, modo), la forma de anotar el Ø
 * (la MISMA clave que la tala de a una) y el guardado fila por fila.
 *
 * Se asienta de a una línea (el libro numera `lineNo` correlativo) y cada
 * respuesta cae en SU fila apenas llega: si una falla —bajo el DMC, ya talada,
 * mes cerrado— las demás siguen y la fallida queda marcada con el motivo del
 * libro para corregirla y volver a guardar sólo esa.
 *
 * En una plantación (ADR-459) también entran filas del REGISTRO: «Bolaina × 3»
 * con sus códigos propuestos (`agregarDelRegistro`), que se pueden cambiar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import { cambiarForma, type FormaMedicion } from "@/lib/forestal/loth-forma-medicion";
import type { PlanParaPoa } from "@/lib/forestal/loth-poa";
import type { EspecieDelPlanFila } from "@/lib/forestal/loth-tala-plantacion";
import {
  agregarArboles,
  calcularFila,
  cambiarCodigo as cambiarCodigoDe,
  codigosRepetidos,
  editarFila,
  filaDeArbol,
  filaDelRegistro,
  payloadDeFila,
  resultadoDeRespuesta,
  totalesTanda,
  type CambioFila,
  type ComunesTala,
  type EspecieParaFila,
  type FilaTala,
  type ResultadoFila,
} from "@/lib/forestal/loth-tala-tanda";
import type { ColaboradorMinDTO } from "@/lib/rrhh/tipos";
import { olvidarArbolEnElLibro } from "./use-arbol-en-el-libro";
import { olvidarCensoDeTala } from "./use-censo-de-tala";
import { useFormaMedicion } from "./use-forma-medicion";
import { olvidarRegistroPlantacion } from "./use-registro-plantacion";

/** Con qué arranca la planilla: lo marcado en «Ver censo» y lo que ya tenía la tala de a una. */
export interface TandaTalaInicial {
  planId: string | null;
  /** «Plan PO 12 — Maderera El Aguajal SAC». */
  planLabel: string | null;
  arboles: ArbolParaElegir[];
  comunes: ComunesTala;
  /**
   * El plan y sus especies, si quien abre la planilla ya los leyó (la tala de
   * a una). Sin esto la planilla los pide: así sabe si es una plantación.
   */
  plan?: (PlanParaPoa & { id: string }) | null;
  especiesDelPlan?: EspecieDelPlanFila[];
  /** Plantación (ADR-459): «Bolaina × 3» — filas de esa especie del registro con las que arranca. */
  porEspecie?: { especie: string; n: number }[];
}

export function useTalaEnTanda({
  inicial,
  caratulaId,
  onGuardadas,
}: {
  inicial: TandaTalaInicial;
  caratulaId: string | null;
  /** Después de asentar al menos una: la vista recarga el libro. */
  onGuardadas: () => Promise<void> | void;
}) {
  const [filas, setFilas] = useState<FilaTala[]>(() => inicial.arboles.map(filaDeArbol));
  const [comunes, setComunes] = useState<ComunesTala>(inicial.comunes);
  const [forma, setFormaGuardada] = useFormaMedicion();
  /** Mientras guarda: cuántas van de cuántas (el pie lo dice). */
  const [avance, setAvance] = useState<{ hecho: number; total: number } | null>(null);
  /**
   * Ya respondió el libro y la vista lo está releyendo. Aparte del avance:
   * medido 28-09, recargar el libro tardaba ~2 s y el pie seguía diciendo
   * «Guardando 1 de 1…» con todo ya asentado. «Trozar estos árboles» espera
   * esto (el trozado lista las talas del libro releído).
   */
  const [recargando, setRecargando] = useState(false);

  const calc = useMemo(() => {
    const repetidos = codigosRepetidos(filas);
    return filas.map((f) => calcularFila(f, forma, comunes.modo, repetidos));
  }, [filas, forma, comunes.modo]);
  const totales = useMemo(() => totalesTanda(filas, calc), [filas, calc]);
  /** Ids de las filas del registro: no hay árbol del censo que los dé. */
  const secuencia = useRef(0);

  const editar = useCallback((id: string, cambio: CambioFila) => {
    setFilas((fs) => fs.map((f) => (f.id === id ? editarFila(f, cambio) : f)));
  }, []);
  const quitar = useCallback((id: string) => setFilas((fs) => fs.filter((f) => f.id !== id || f.resultado?.estado === "guardada")), []);
  const agregar = useCallback((arboles: readonly ArbolParaElegir[]) => setFilas((fs) => agregarArboles(fs, arboles)), []);
  /** «Bolaina × N»: una fila por código propuesto (los calcula quien sabe del registro). */
  const agregarDelRegistro = useCallback((e: EspecieParaFila, codigos: readonly string[]) => {
    const nuevas = codigos.map((c) => filaDelRegistro(e, c, `registro-${++secuencia.current}`));
    setFilas((fs) => [...fs, ...nuevas]);
  }, []);
  const cambiarCodigo = useCallback((id: string, codigo: string) => {
    setFilas((fs) => fs.map((f) => (f.id === id ? cambiarCodigoDe(f, codigo) : f)));
  }, []);
  /** Cambiar de forma sin perder lo tipeado, en todas las filas (`cambiarForma`). */
  const elegirForma = useCallback(
    (f: FormaMedicion) => {
      setFilas((fs) => fs.map((x) => (x.resultado?.estado === "guardada" ? x : { ...x, medidas: cambiarForma(x.medidas, f) })));
      setFormaGuardada(f);
    },
    [setFormaGuardada],
  );

  const guardar = useCallback(async () => {
    const pendientes = filas.flatMap((f, i) => (calc[i].lista ? [{ f, c: calc[i] }] : []));
    if (pendientes.length === 0 || avance) return;
    setAvance({ hecho: 0, total: pendientes.length });
    let entraron = 0;
    for (const [i, { f, c }] of pendientes.entries()) {
      let r: ResultadoFila;
      try {
        const res = await fetch("/api/admin/forestal/loth", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(payloadDeFila(f, c, comunes, forma, { planId: inicial.planId, caratulaId })),
        });
        r = resultadoDeRespuesta(res.status, await res.json().catch(() => ({})));
      } catch (err) {
        logger.error("[useTalaEnTanda] POST failed", { error: String(err) });
        r = { estado: "fallida", codigo: "RED", mensaje: "Sin conexión con el servidor: vuelve a guardar cuando tengas señal." };
      }
      if (r.estado === "guardada") entraron += 1;
      setFilas((fs) => fs.map((x) => (x.id === f.id ? { ...x, resultado: r } : x)));
      setAvance({ hecho: i + 1, total: pendientes.length });
    }
    // Lo recordado del censo, del registro y de cada árbol ya no dice la verdad.
    // (La planilla NO relee su registro: las guardadas siguen descontando desde acá.)
    olvidarCensoDeTala();
    olvidarArbolEnElLibro();
    olvidarRegistroPlantacion();
    setAvance(null);
    if (entraron === 0) return;
    setRecargando(true);
    try {
      await onGuardadas();
    } catch (err) {
      logger.error("[useTalaEnTanda] recargar el libro failed", { error: String(err) });
    } finally {
      setRecargando(false);
    }
  }, [filas, calc, avance, comunes, forma, inicial.planId, caratulaId, onGuardadas]);

  return {
    filas,
    calc,
    totales,
    comunes,
    setComunes,
    forma,
    elegirForma,
    editar,
    quitar,
    agregar,
    agregarDelRegistro,
    cambiarCodigo,
    guardar,
    avance,
    recargando,
  };
}

// ─── El plan de la planilla ──────────────────────────────────────────────────

/**
 * El plan de la planilla y sus especies: los que trajo quien la abrió o, si no
 * (el mapa), los del plan pedidos acá. Con esto se sabe si es una plantación.
 */
export function usePlanDeLaTanda(inicial: TandaTalaInicial): {
  plan: (PlanParaPoa & { id: string }) | null;
  especiesDelPlan: EspecieDelPlanFila[];
  listo: boolean;
} {
  const traido = inicial.plan !== undefined;
  const [leido, setLeido] = useState<{ plan: (PlanParaPoa & { id: string }) | null; especies: EspecieDelPlanFila[] } | null>(null);
  const planId = inicial.planId;
  useEffect(() => {
    if (traido || !planId) return;
    let cancel = false;
    fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(planId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { plan?: (PlanParaPoa & { id: string }) | null; species?: EspecieDelPlanFila[] } | null) => {
        if (!cancel) setLeido({ plan: j?.plan ?? null, especies: (j?.species ?? []).filter((e) => (e.speciesCommon ?? "").trim()) });
      })
      .catch((err) => {
        logger.error("[usePlanDeLaTanda] failed", { error: String(err) });
        if (!cancel) setLeido({ plan: null, especies: [] });
      });
    return () => {
      cancel = true;
    };
  }, [traido, planId]);
  const especiesTraidas = inicial.especiesDelPlan;
  const especiesDelPlan = useMemo(() => (traido ? (especiesTraidas ?? []) : (leido?.especies ?? [])), [traido, especiesTraidas, leido]);
  if (traido) return { plan: inicial.plan ?? null, especiesDelPlan, listo: true };
  return { plan: leido?.plan ?? null, especiesDelPlan, listo: !planId || leido != null };
}

// ─── El motosierrista, de Recursos Humanos ───────────────────────────────────

export type Motosierrista = Pick<ColaboradorMinDTO, "id" | "nombre" | "apodo" | "puesto" | "estado">;

/** El personal activo, para elegir al motosierrista (o tipear un tercero). */
export function useMotosierristas(): Motosierrista[] {
  const [lista, setLista] = useState<Motosierrista[]>([]);
  useEffect(() => {
    let cancel = false;
    fetch("/api/rrhh/colaboradores?campos=min", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { colaboradores?: Motosierrista[] } | null) => {
        if (!cancel && j) setLista((j.colaboradores ?? []).filter((c) => c.estado !== "CESADO"));
      })
      // Sin permiso de RRHH o sin red: el nombre se tipea igual.
      .catch((err) => logger.error("[useMotosierristas] failed", { error: String(err) }));
    return () => {
      cancel = true;
    };
  }, []);
  return lista;
}

// ─── Foto de evidencia ───────────────────────────────────────────────────────

/** Sube la foto del tocón de una fila (mismo camino que la tala de a una). */
export async function subirFotoEvidencia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", "general");
  const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders({}), credentials: "include", body: fd });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error ?? `No se pudo subir la foto (error ${res.status}).`);
  return body.url;
}
