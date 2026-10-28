"use client";

/**
 * use-lote-desde-excel — el estado de «Pegar de Excel» en «Programar un lote»
 * (27-10): una grilla como la del cubicador (se pega desde una celda, se
 * corrige a mano), partida en un lote por cada N° de la columna «Lote». Cada
 * lote se cruza con el libro en el servidor medio segundo después del último
 * cambio; importar vuelve a cruzar allá: lo de acá es la vista previa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  COLUMNAS_LOTE,
  agruparPorLote,
  conSobra,
  filasDeGrilla,
  pegarEnGrilla,
  type FilaGrilla,
  type FilaLoteExcel,
} from "@/lib/forestal/lote-desde-excel";
import {
  esDiaValido,
  fechaFueraDeRango,
  type CruceLote,
  type FilaCruzada,
  type ResultadoImportarLote,
} from "@/lib/forestal/lote-desde-excel-cruce";
import { limaDateKey } from "@/lib/utils";

const API = "/api/admin/forestal/lotes-aserrio/importar";
const ESPERA_CRUCE_MS = 500;
const MAX_DESHACER = 50;

export interface LoteDelExcel {
  /** El N° de la columna «Lote» tal cual («» = sin columna). */
  clave: string;
  filas: FilaLoteExcel[];
  /** El N° con el que se guarda: el de la columna, o el que se escribió en la tarjeta. */
  code: string;
  /** Día del consumo, `AAAA-MM-DD`: el de la «Fecha del estado» del SNIFFS. */
  fecha: string;
  cruce: CruceLote | null;
  /** Hay cambios que el servidor todavía no cruzó. */
  cargando: boolean;
  error: string | null;
  /** El resultado, una vez importado. */
  hecho: string | null;
  /** El lote que quedó en el libro, una vez importado (para llevarlo a la Distribución). */
  loteId: string | null;
}

/** Un lote recién importado: lo que necesita quien quiera seguir trabajándolo. */
export interface LoteImportado {
  id: string;
  code: string;
  texto: string;
}

interface EstadoCruce {
  firma: string;
  cruce: CruceLote | null;
  cargando: boolean;
  error: string | null;
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
const firmaDe = (code: string, filas: readonly FilaLoteExcel[]) => JSON.stringify([code.trim(), filas]);

/** ¿Este lote se puede importar ya, tal como está en pantalla? */
export function loteListo(l: LoteDelExcel, hoy: string): boolean {
  return (
    !l.hecho &&
    !l.cargando &&
    l.cruce != null &&
    l.cruce.bloqueos.length === 0 &&
    fechaFueraDeRango(l.fecha, l.cruce.fechaMinima, hoy) == null
  );
}

export function useLoteDesdeExcel() {
  const [filas, setFilas] = useState<FilaGrilla[]>(() => conSobra([]));
  const filasRef = useRef(filas);
  filasRef.current = filas;
  const historial = useRef<FilaGrilla[][]>([]);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState<Record<string, { code?: string; fecha?: string }>>({});
  const [cruces, setCruces] = useState<Record<string, EstadoCruce>>({});
  const crucesRef = useRef(cruces);
  crucesRef.current = cruces;
  const [hechos, setHechos] = useState<Record<string, LoteImportado>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [importando, setImportando] = useState(false);
  /* La última consulta de cada lote: una respuesta vieja no pisa a la nueva. */
  const ultima = useRef(new Map<string, number>());
  const hoy = limaDateKey();

  const cambiar = useCallback((nuevas: FilaGrilla[]) => {
    historial.current = [...historial.current.slice(-(MAX_DESHACER - 1)), filasRef.current];
    setPuedeDeshacer(true);
    setFilas(conSobra(nuevas));
  }, []);

  const escribir = useCallback(
    (fila: number, col: number, valor: string) => {
      const clave = COLUMNAS_LOTE[col];
      if (!clave) return;
      cambiar(filasRef.current.map((f, i) => (i === fila ? { ...f, [clave]: valor } : f)));
    },
    [cambiar],
  );

  const pegar = useCallback(
    (texto: string, desde: { fila: number; col: number }) => {
      const r = pegarEnGrilla(filasRef.current, texto, desde);
      if (r.pegadas === 0) return;
      cambiar(r.filas);
      setAviso(
        `Pegaste ${r.pegadas} fila${r.pegadas === 1 ? "" : "s"}` +
          (r.conTitulos
            ? " con sus títulos: cada columna cayó en la suya."
            : r.porPosicion
              ? " sin títulos: se leyeron en el orden de la lista del SNIFFS."
              : " desde la celda donde hiciste clic."),
      );
    },
    [cambiar],
  );

  const deshacer = useCallback(() => {
    const anterior = historial.current.pop();
    if (!anterior) return;
    setFilas(anterior);
    setPuedeDeshacer(historial.current.length > 0);
  }, []);

  const vaciar = useCallback(() => {
    cambiar([]);
    setAjustes({});
    setHechos({});
    setErrores({});
    setAviso(null);
  }, [cambiar]);

  const poner = useCallback((clave: string, cambios: { code?: string; fecha?: string }) => {
    setAjustes((a) => ({ ...a, [clave]: { ...a[clave], ...cambios } }));
    setErrores((e) => {
      if (!(clave in e)) return e;
      const { [clave]: _quitado, ...resto } = e;
      return resto;
    });
  }, []);

  const filasLote = useMemo(() => filasDeGrilla(filas), [filas]);
  const grupos = useMemo(() => agruparPorLote(filasLote), [filasLote]);
  const codeDe = useCallback((clave: string, lote: string | null) => ajustes[clave]?.code ?? lote ?? "", [ajustes]);

  const previsualizar = useCallback(async (clave: string, grupo: FilaLoteExcel[], code: string, firma: string) => {
    const yo = (ultima.current.get(clave) ?? 0) + 1;
    ultima.current.set(clave, yo);
    setCruces((c) => ({ ...c, [clave]: { firma, cruce: c[clave]?.cruce ?? null, cargando: true, error: null } }));
    try {
      const { cruce } = await enviar<{ cruce: CruceLote }>({ modo: "previsualizar", code: code.trim() || null, filas: grupo });
      if (ultima.current.get(clave) === yo) setCruces((c) => ({ ...c, [clave]: { firma, cruce, cargando: false, error: null } }));
    } catch (e) {
      if (ultima.current.get(clave) === yo) {
        setCruces((c) => ({ ...c, [clave]: { firma, cruce: null, cargando: false, error: mensajeDe(e) } }));
      }
    }
  }, []);

  /* Medio segundo después del último cambio se cruza lo que cambió. */
  useEffect(() => {
    const t = setTimeout(() => {
      for (const g of grupos) {
        const clave = g.lote ?? "";
        if (hechos[clave]) continue;
        const code = codeDe(clave, g.lote);
        const firma = firmaDe(code, g.filas);
        if (crucesRef.current[clave]?.firma !== firma) void previsualizar(clave, g.filas, code, firma);
      }
    }, ESPERA_CRUCE_MS);
    return () => clearTimeout(t);
  }, [grupos, codeDe, hechos, previsualizar]);

  const lotes = useMemo<LoteDelExcel[]>(
    () =>
      grupos.map((g) => {
        const clave = g.lote ?? "";
        const code = codeDe(clave, g.lote);
        const c = cruces[clave];
        const vigente = c != null && c.firma === firmaDe(code, g.filas);
        return {
          clave,
          filas: g.filas,
          code,
          fecha: ajustes[clave]?.fecha ?? (esDiaValido(g.fecha) && g.fecha <= hoy ? g.fecha : hoy),
          cruce: c?.cruce ?? null,
          cargando: !vigente || c.cargando,
          error: errores[clave] ?? (vigente ? c.error : null),
          hecho: hechos[clave]?.texto ?? null,
          loteId: hechos[clave]?.id ?? null,
        };
      }),
    [grupos, codeDe, cruces, ajustes, errores, hechos, hoy],
  );

  /** Lo que el libro dice de cada fila de la grilla (sólo de cruces al día). */
  const estadoDeFila = useMemo(() => {
    const m = new Map<number, FilaCruzada | "importada">();
    for (const l of lotes) {
      if (l.hecho) {
        for (const f of l.filas) m.set(f.fila, "importada");
        continue;
      }
      if (l.cargando || !l.cruce) continue;
      for (const f of l.cruce.filas) m.set(f.fila, f);
    }
    return m;
  }, [lotes]);

  const listos = useMemo(() => lotes.filter((l) => loteListo(l, hoy)), [lotes, hoy]);

  /**
   * Importa los lotes listos, de a uno: cada uno es todo o nada en el
   * servidor, y si uno falla los otros siguen. Devuelve lo importado y si no
   * quedó ninguno pendiente.
   */
  const importar = useCallback(async (): Promise<{ importados: LoteImportado[]; todos: boolean }> => {
    setImportando(true);
    const importados: LoteImportado[] = [];
    let fallos = 0;
    for (const l of listos) {
      try {
        const r = await enviar<ResultadoImportarLote>({ modo: "importar", code: l.code.trim() || null, fecha: l.fecha, filas: l.filas });
        const texto =
          `Lote ${r.lote.code}${r.sumadoAExistente ? " (el que ya estaba programado)" : ""}: ${r.piezas} troza${r.piezas === 1 ? "" : "s"} · ` +
          `${fmtM3(r.volumenM3)} m³ en consumo · N° ${r.corrida.lineNo}, producción por declarar` +
          (r.medidas.guardadas > 0 ? ` · D1/D2 de ${r.medidas.guardadas}` : "") +
          (r.medidas.rechazadas > 0 ? ` · ${r.medidas.rechazadas} sin guardar D1/D2` : "");
        const importado = { id: r.lote.id, code: r.lote.code, texto };
        importados.push(importado);
        setHechos((h) => ({ ...h, [l.clave]: importado }));
      } catch (e) {
        fallos += 1;
        setErrores((x) => ({ ...x, [l.clave]: mensajeDe(e) }));
      }
    }
    setImportando(false);
    if (importados.length > 0) invalidarCtp("/forestal/");
    const pendientes = lotes.filter((l) => !l.hecho).length - importados.length;
    return { importados, todos: fallos === 0 && pendientes === 0 };
  }, [listos, lotes]);

  return {
    filas,
    escribir,
    pegar,
    deshacer,
    puedeDeshacer,
    vaciar,
    aviso,
    cerrarAviso: () => setAviso(null),
    lotes,
    estadoDeFila,
    listos,
    poner,
    importando,
    importar,
    hoy,
  };
}

export type LoteDesdeExcel = ReturnType<typeof useLoteDesdeExcel>;
