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
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import { cambiarForma, type FormaMedicion } from "@/lib/forestal/loth-forma-medicion";
import {
  agregarArboles,
  calcularFila,
  editarFila,
  filaDeArbol,
  payloadDeFila,
  resultadoDeRespuesta,
  totalesTanda,
  type CambioFila,
  type ComunesTala,
  type FilaTala,
  type ResultadoFila,
} from "@/lib/forestal/loth-tala-tanda";
import type { ColaboradorMinDTO } from "@/lib/rrhh/tipos";
import { olvidarArbolEnElLibro } from "./use-arbol-en-el-libro";
import { olvidarCensoDeTala } from "./use-censo-de-tala";
import { useFormaMedicion } from "./use-forma-medicion";

/** Con qué arranca la planilla: lo marcado en «Ver censo» y lo que ya tenía la tala de a una. */
export interface TandaTalaInicial {
  planId: string | null;
  /** «Plan PO 12 — Maderera El Aguajal SAC». */
  planLabel: string | null;
  arboles: ArbolParaElegir[];
  comunes: ComunesTala;
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

  const calc = useMemo(() => filas.map((f) => calcularFila(f, forma, comunes.modo)), [filas, forma, comunes.modo]);
  const totales = useMemo(() => totalesTanda(filas, calc), [filas, calc]);

  const editar = useCallback((id: string, cambio: CambioFila) => {
    setFilas((fs) => fs.map((f) => (f.id === id ? editarFila(f, cambio) : f)));
  }, []);
  const quitar = useCallback((id: string) => setFilas((fs) => fs.filter((f) => f.id !== id || f.resultado?.estado === "guardada")), []);
  const agregar = useCallback((arboles: readonly ArbolParaElegir[]) => setFilas((fs) => agregarArboles(fs, arboles)), []);
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
    // Lo recordado del censo y de cada árbol ya no dice la verdad.
    olvidarCensoDeTala();
    olvidarArbolEnElLibro();
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

  return { filas, calc, totales, comunes, setComunes, forma, elegirForma, editar, quitar, agregar, guardar, avance, recargando };
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
