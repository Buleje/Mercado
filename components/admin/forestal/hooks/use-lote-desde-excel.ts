"use client";

/**
 * use-lote-desde-excel — el estado de «Pegar de Excel» en «Programar un lote»
 * (27-10): lo pegado se lee en el navegador (`leerPegadoLote`), se parte en un
 * lote por cada N° de la columna «Lote» y el servidor cruza cada uno con el
 * libro. Importar vuelve a cruzar allá: lo de acá es la vista previa.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  agruparPorLote,
  leerPegadoLote,
  type FilaLoteExcel,
} from "@/lib/forestal/lote-desde-excel";
import {
  esDiaValido,
  fechaFueraDeRango,
  type CruceLote,
  type ResultadoImportarLote,
} from "@/lib/forestal/lote-desde-excel-cruce";
import { limaDateKey } from "@/lib/utils";

const API = "/api/admin/forestal/lotes-aserrio/importar";

export interface LoteDelExcel {
  clave: string;
  filas: FilaLoteExcel[];
  /** El N° de lote, editable; el cruce es del `codeCruzado`. */
  code: string;
  codeCruzado: string;
  /** Día del consumo, `AAAA-MM-DD`: el de la «Fecha del Estado» del SNIFFS. */
  fecha: string;
  cruce: CruceLote | null;
  cargando: boolean;
  error: string | null;
  /** El resultado, una vez importado. */
  hecho: string | null;
}

async function enviar<T>(body: unknown): Promise<T> {
  const r = await fetch(API, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.message ?? json?.error ?? `El servidor respondió ${r.status}`);
  return json as T;
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** ¿Este lote se puede importar ya, tal como está en pantalla? */
export function loteListo(l: LoteDelExcel, hoy: string): boolean {
  return (
    !l.hecho &&
    !l.cargando &&
    l.cruce != null &&
    l.cruce.bloqueos.length === 0 &&
    l.code.trim() === l.codeCruzado.trim() &&
    fechaFueraDeRango(l.fecha, l.cruce.fechaMinima, hoy) == null
  );
}

export function useLoteDesdeExcel() {
  const [lotes, setLotes] = useState<LoteDelExcel[]>([]);
  const [errorPegado, setErrorPegado] = useState<string | null>(null);
  const [conTitulos, setConTitulos] = useState(true);
  const [importando, setImportando] = useState(false);
  const hoy = limaDateKey();
  /* La última consulta de cada lote: una respuesta vieja (el N° cambió dos
     veces seguidas, o se volvió a pegar) no pisa a la nueva. */
  const ultima = useRef(new Map<string, number>());
  const pegadas = useRef(0);

  const poner = useCallback((clave: string, cambios: Partial<LoteDelExcel>) => {
    setLotes((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }, []);

  const previsualizar = useCallback(
    async (clave: string, filas: FilaLoteExcel[], code: string) => {
      const yo = (ultima.current.get(clave) ?? 0) + 1;
      ultima.current.set(clave, yo);
      poner(clave, { cargando: true, error: null, codeCruzado: code });
      try {
        const { cruce } = await enviar<{ cruce: CruceLote }>({
          modo: "previsualizar",
          code: code.trim() || null,
          filas,
        });
        if (ultima.current.get(clave) === yo) poner(clave, { cruce, cargando: false });
      } catch (e) {
        if (ultima.current.get(clave) === yo)
          poner(clave, { cruce: null, cargando: false, error: mensajeDe(e) });
      }
    },
    [poner],
  );

  const pegar = useCallback(
    (texto: string) => {
      const p = leerPegadoLote(texto);
      setErrorPegado(p.error);
      setConTitulos(p.conTitulos);
      pegadas.current += 1;
      const nuevos: LoteDelExcel[] = agruparPorLote(p.filas).map((g, i) => ({
        clave: `${pegadas.current}:${i}:${g.lote ?? ""}`,
        filas: g.filas,
        code: g.lote ?? "",
        codeCruzado: g.lote ?? "",
        fecha: esDiaValido(g.fecha) && g.fecha <= hoy ? g.fecha : hoy,
        cruce: null,
        cargando: true,
        error: null,
        hecho: null,
      }));
      setLotes(nuevos);
      for (const l of nuevos) void previsualizar(l.clave, l.filas, l.code);
    },
    [hoy, previsualizar],
  );

  /** El N° cambió: se vuelve a cruzar (puede ser un lote que ya existe). */
  const cruzarDeNuevo = useCallback(
    (clave: string) => {
      const l = lotes.find((x) => x.clave === clave);
      if (l && l.code.trim() !== l.codeCruzado.trim()) void previsualizar(clave, l.filas, l.code);
    },
    [lotes, previsualizar],
  );

  const limpiar = useCallback(() => {
    setLotes([]);
    setErrorPegado(null);
  }, []);

  const listos = useMemo(() => lotes.filter((l) => loteListo(l, hoy)), [lotes, hoy]);

  /**
   * Importa los lotes listos, de a uno: cada uno es todo o nada en el
   * servidor, y si uno falla los otros siguen. Devuelve lo hecho y si no
   * quedó ninguno pendiente.
   */
  const importar = useCallback(async (): Promise<{ hechos: string[]; todos: boolean }> => {
    setImportando(true);
    const hechos: string[] = [];
    let fallos = 0;
    for (const l of listos) {
      try {
        const r = await enviar<ResultadoImportarLote>({
          modo: "importar",
          code: l.code.trim() || null,
          fecha: l.fecha,
          filas: l.filas,
        });
        const texto =
          `Lote ${r.lote.code}${r.sumadoAExistente ? " (el que ya estaba programado)" : ""}: ${r.piezas} troza${r.piezas === 1 ? "" : "s"} · ` +
          `${fmtM3(r.volumenM3)} m³ consumidos · N° ${r.corrida.lineNo}, producción por declarar` +
          (r.medidas.guardadas > 0 ? ` · D1/D2 de ${r.medidas.guardadas}` : "") +
          (r.medidas.rechazadas > 0 ? ` · ${r.medidas.rechazadas} sin guardar D1/D2` : "");
        hechos.push(texto);
        poner(l.clave, { hecho: texto, error: null });
      } catch (e) {
        fallos += 1;
        poner(l.clave, { error: mensajeDe(e) });
      }
    }
    setImportando(false);
    if (hechos.length > 0) invalidarCtp("/forestal/");
    const pendientes = lotes.filter((l) => !l.hecho).length - hechos.length;
    return { hechos, todos: fallos === 0 && pendientes === 0 };
  }, [listos, lotes, poner]);

  return {
    lotes,
    errorPegado,
    conTitulos,
    importando,
    hoy,
    listos,
    pegar,
    poner,
    cruzarDeNuevo,
    limpiar,
    importar,
  };
}

export type LoteDesdeExcel = ReturnType<typeof useLoteDesdeExcel>;
