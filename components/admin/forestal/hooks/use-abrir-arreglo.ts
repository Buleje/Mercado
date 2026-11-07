"use client";

/**
 * use-abrir-arreglo — lo que piden los modales que YA existen para abrirse
 * desde la bandeja de «¿De qué trozas salió?» (ADR-447), leído recién al
 * apretar el botón (la bandeja no paga lecturas que nadie usa):
 *
 *  · las guías (`wood-entries?gtf=`, una lectura por guía) para «Corregir la
 *    recepción» (ADR-434) y «Recibir en bloque», resumidas como en Ingresos;
 *  · la corrida como la pide su editor (ADR-401), del día al que pertenece
 *    (`resumenJornadas`, la misma lectura de «Ver qué salió ese día»).
 *
 * Mientras lee, el botón dice «Abriendo…»; si falla, la línea dice por qué y
 * nada se abre a medias.
 */
import { useCallback, useRef, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { yaRecibida } from "@/lib/forestal/fecha-de-llegada";
import { claveDeGuia, resumirGuia, type GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import { faltaRecibirMadera } from "@/lib/forestal/recepcion-guias";
import type { DiagnosticoCorrida } from "@/lib/forestal/vincular-trozas";
import type { GuiaParaBloque } from "../CtpRecepcionBloqueModal";
import type { LineaEditable } from "../CtpEditarLineaModal";
import type { WoodEntry } from "../ctp-shared";
import { lineaEditableDe } from "../dia-de-produccion-puertas";
import { leerJornadasConPaquetes } from "./use-jornadas-con-paquetes";

export type ArregloAbierto =
  | { tipo: "corregir_llegada"; guias: GuiaIngreso<WoodEntry>[]; marcadas: string[] }
  | { tipo: "recibir_guia"; guias: GuiaParaBloque[]; preseleccion: string[] }
  | { tipo: "acomodar_trozas"; woodEntryIds: string[]; descripcion: string }
  | { tipo: "declarar_apertura"; corridas: DiagnosticoCorrida[] }
  | { tipo: "editar_corrida"; linea: LineaEditable }
  | { tipo: "ver_dia"; dia: string }
  /** «Soltar trozas» de la corrida que tomó la madera (ADR-447 §6), con las que la esperan. */
  | { tipo: "soltar_trozas"; corridaId: string; lineNo: number | null; esperan: DiagnosticoCorrida[] };

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Las guías con esos números, una fila por documento (serie + número), como las ve Ingresos. */
export async function leerGuias(gtfs: readonly string[]): Promise<GuiaIngreso<WoodEntry>[]> {
  const listas = await Promise.all(
    [...new Set(gtfs)].map((g) =>
      ctpGet<{ entries?: WoodEntry[] }>(`/api/admin/forestal/wood-entries?gtf=${encodeURIComponent(g)}&limit=100`),
    ),
  );
  const porClave = new Map<string, WoodEntry[]>();
  for (const e of listas.flatMap((l) => l.entries ?? [])) {
    const k = claveDeGuia(e);
    porClave.set(k, [...(porClave.get(k) ?? []), e]);
  }
  return [...porClave.values()].map((ls) => resumirGuia(ls)).sort((a, b) => a.gtfNumber.localeCompare(b.gtfNumber));
}

/** Una guía de Ingresos en la forma de «Recibir en bloque». */
export function paraBloque(g: GuiaIngreso<WoodEntry>): GuiaParaBloque {
  return {
    clave: g.clave,
    gtfNumber: g.gtfNumber,
    volumenM3: g.volumenM3,
    trozasM3: g.trozasM3,
    trozasCount: g.trozasCount,
    trozasDecididas: g.trozasDecididas,
    providerName: g.providerName,
    entryDate: g.entryDate,
    gtfDate: g.gtfDate,
    status: g.status,
    lineas: g.lineas,
  };
}

/** La corrida como la pide su editor, del día al que pertenece. */
export async function leerLineaEditable(corridaId: string, dia: string, especies: string[]): Promise<LineaEditable | null> {
  const d = await leerJornadasConPaquetes([dia]);
  const c = d.detalle.find((x) => x.id === corridaId);
  return c ? lineaEditableDe(c, especies) : null;
}

export function useAbrirArreglo() {
  const [abierto, setAbierto] = useState<ArregloAbierto | null>(null);
  /** Qué botón está leyendo (su clave) y el último error, por línea. */
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [error, setError] = useState<{ clave: string; texto: string } | null>(null);
  const turno = useRef(0);

  /** Lee lo que haga falta y abre; una segunda apertura deja sin efecto la primera. */
  const abrir = useCallback(async (clave: string, leer: () => Promise<ArregloAbierto | string>) => {
    const t = ++turno.current;
    setError(null);
    setAbriendo(clave);
    try {
      const r = await leer();
      if (t !== turno.current) return;
      if (typeof r === "string") setError({ clave, texto: r });
      else setAbierto(r);
    } catch (e) {
      if (t === turno.current) setError({ clave, texto: `No se pudo abrir: ${mensaje(e)}` });
    } finally {
      if (t === turno.current) setAbriendo(null);
    }
  }, []);

  const abrirYa = useCallback((a: ArregloAbierto) => {
    turno.current++;
    setError(null);
    setAbriendo(null);
    setAbierto(a);
  }, []);

  const cerrar = useCallback(() => setAbierto(null), []);

  /** «Corregir la llegada de N guías»: las recibidas, todas marcadas con la fecha de su guía. */
  const corregirLlegada = useCallback(
    (clave: string, gtfs: readonly string[]) =>
      abrir(clave, async () => {
        const guias = (await leerGuias(gtfs)).filter((g) => yaRecibida(g));
        if (guias.length === 0) return "Esas guías ya no figuran recibidas: recíbelas primero en Ingresos.";
        return { tipo: "corregir_llegada", guias, marcadas: guias.map((g) => g.clave) };
      }),
    [abrir],
  );

  /** «Recibir la guía»: las que todavía tienen madera por recibir, ya marcadas. */
  const recibirGuia = useCallback(
    (clave: string, gtfs: readonly string[]) =>
      abrir(clave, async () => {
        const guias = (await leerGuias(gtfs)).filter((g) => faltaRecibirMadera(g)).map(paraBloque);
        if (guias.length === 0) return "Esa guía ya está recibida: vuelve a revisar la lista.";
        return { tipo: "recibir_guia", guias, preseleccion: guias.map((g) => g.clave) };
      }),
    [abrir],
  );

  /** El editor de UNA corrida (permiso o especie): la decisión la toma el dueño adentro. */
  const editarCorrida = useCallback(
    (clave: string, c: Pick<DiagnosticoCorrida, "corridaId" | "fecha" | "lineNo">, especies: string[]) =>
      abrir(clave, async () => {
        const linea = await leerLineaEditable(c.corridaId, c.fecha, especies);
        return linea ? { tipo: "editar_corrida", linea } : `No se encontró la N.º ${c.lineNo ?? "—"} en su día: vuelve a revisar.`;
      }),
    [abrir],
  );

  return { abierto, abriendo, error, abrirYa, cerrar, corregirLlegada, recibirGuia, editarCorrida };
}
