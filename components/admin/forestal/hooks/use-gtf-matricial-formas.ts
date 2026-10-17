"use client";

/**
 * useFormasTalonario — las acciones sobre las «formas» del talonario (Brandon
 * 16-10): elegir otra, crear una copia de la que se ve, renombrar, borrar y
 * copiar las hojas de otra. El estado de la forma abierta vive en
 * `useGtfMatricial`; acá sólo se habla con el servidor y se le avisa.
 *
 * También el tipo `InfoTalonario` y `conForma`: los usan los dos hooks.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { DisposicionTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import type { FormaResuelta, OrigenDisposicion, ResumenForma } from "@/lib/forestal/gtf-matricial-formas";
import type { EstadoGtfMatricial } from "./use-gtf-matricial";

export const RUTA_TALONARIO = "/api/admin/forestal/loth/gtf-matricial";
const RUTA_FORMAS = `${RUTA_TALONARIO}/formas`;

/** Qué forma del talonario se edita y por qué (lo decide el servidor con la guía, o se elige a mano). */
export interface InfoTalonario {
  /** El titular de la guía (encabezado de la hoja). null = guía sin titular. */
  titular: { clave: string; nombre: string } | null;
  /** La que se edita y se imprime. null = el dueño todavía no tiene la suya: la crea el primer «Guardar». */
  forma: ResumenForma | null;
  coincide: FormaResuelta["coincide"];
  /** Sin forma: con qué nombre se creará y de cuál arranca. */
  nueva: FormaResuelta["nueva"];
  origen: OrigenDisposicion;
  /** Todas las del negocio, las del dueño de la guía arriba. */
  formas: ResumenForma[];
}

const RANGO: Record<string, number> = { exacta: 0, titular: 1, permiso: 2 };
const rango = (f: ResumenForma): number => RANGO[f.coincide ?? ""] ?? 9;

/** El mismo orden que el servidor: las del dueño arriba (exacta → titular → permiso), después por nombre. */
export const ordenarFormas = (fs: ResumenForma[]): ResumenForma[] =>
  [...fs].sort((a, b) => rango(a) - rango(b) || a.nombre.localeCompare(b.nombre, "es"));

/** La forma que se ve pasa a ser `forma` (recién guardada o creada) y queda al día en la lista. */
export function conForma(i: InfoTalonario, forma: ResumenForma): InfoTalonario {
  const formas = i.formas.some((x) => x.id === forma.id) ? i.formas.map((x) => (x.id === forma.id ? forma : x)) : [...i.formas, forma];
  const coincide = i.forma?.id === forma.id ? i.coincide : (forma.coincide ?? "elegida");
  return { ...i, forma, coincide, origen: "forma", nueva: null, formas: ordenarFormas(formas) };
}

/**
 * La que tomaría la guía si se borra `sin`: la mejor coincidencia que queda
 * (empate = la guardada más reciente, como el servidor). null = ninguna: arranca
 * de la de la empresa y el próximo «Guardar» crea la suya.
 */
export function siguienteForma(formas: readonly ResumenForma[], sin: string): ResumenForma | null {
  const quedan = formas.filter((f) => f.id !== sin && f.coincide);
  if (!quedan.length) return null;
  const mejor = Math.min(...quedan.map(rango));
  return quedan.filter((f) => rango(f) === mejor).reduce((m, f) => ((f.actualizado ?? "") > (m.actualizado ?? "") ? f : m));
}

async function pedir<T>(url: string, init: RequestInit, fallo: string): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  let j: (T & { message?: string; error?: string }) | null = null;
  try {
    j = (await r.json()) as T & { message?: string; error?: string };
  } catch {
    j = null;
  }
  if (!r.ok || !j) throw new Error(j?.message ?? `${fallo} (${r.status})`);
  return j;
}

type Ocupado = "elegir" | "nueva" | "renombrar" | "borrar" | `copiar:${string}`;

export function useFormasTalonario(gtfId: string, t: EstadoGtfMatricial) {
  const [ocupado, setOcupado] = useState<Ocupado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const correr = useCallback(async (cual: Ocupado, fn: () => Promise<void>): Promise<boolean> => {
    setOcupado(cual);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setOcupado(null);
    }
  }, []);

  /** Abre otra forma (lo que se ve sin guardar se pierde: quien llama lo pregunta antes). */
  const elegir = useCallback(
    (formaId: string) =>
      correr("elegir", async () => {
        if (!(await t.cargar(formaId))) throw new Error("No se pudo abrir esa forma.");
      }),
    [correr, t],
  );

  /** «Nueva forma (copia de esta)»: con lo que se ve, aunque no esté guardado. Sin nombre, el automático. */
  const nueva = useCallback(
    (nombre?: string) =>
      correr("nueva", async () => {
        const d = t.disp;
        if (!d) return;
        const j = await pedir<{ forma: ResumenForma; disposicion: DisposicionTalonario }>(
          RUTA_FORMAS,
          {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ gtfId, ...(nombre?.trim() && { nombre: nombre.trim() }), guia: d.guia, lista: d.lista }),
          },
          "No se pudo crear la forma",
        );
        t.adoptar(j.forma, j.disposicion);
      }),
    [correr, gtfId, t],
  );

  const renombrar = useCallback(
    (nombre: string) =>
      correr("renombrar", async () => {
        const formaId = t.formaId;
        if (!formaId) return;
        const j = await pedir<{ forma: ResumenForma }>(
          RUTA_FORMAS,
          { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ gtfId, formaId, nombre: nombre.trim() }) },
          "No se pudo renombrar",
        );
        t.renombrada(j.forma);
      }),
    [correr, gtfId, t],
  );

  /** Borra la que se ve y abre la que la guía elige sola sin ella. */
  const borrar = useCallback(
    () =>
      correr("borrar", async () => {
        const formaId = t.formaId;
        if (!formaId) return;
        const q = new URLSearchParams({ forma: formaId, gtf: gtfId });
        await pedir<{ forma: ResumenForma }>(`${RUTA_FORMAS}?${q.toString()}`, { method: "DELETE", headers: csrfHeaders() }, "No se pudo borrar");
        await t.cargar();
      }),
    [correr, gtfId, t],
  );

  /** Trae las dos hojas de otra forma: quedan sin guardar y se deshacen hoja por hoja. */
  const copiarDe = useCallback(
    (de: string) =>
      correr(`copiar:${de}`, async () => {
        const j = await pedir<{ disposicion?: DisposicionTalonario }>(
          `${RUTA_TALONARIO}?de=${encodeURIComponent(de)}`,
          {},
          "No se pudo traer esa forma",
        );
        if (!j.disposicion) throw new Error("No se pudo traer esa forma.");
        t.reemplazarTodo(j.disposicion);
      }),
    [correr, t],
  );

  return { ocupado, error, elegir, nueva, renombrar, borrar, copiarDe };
}

export type EstadoFormasTalonario = ReturnType<typeof useFormasTalonario>;
