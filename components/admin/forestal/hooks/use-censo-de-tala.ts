"use client";

/**
 * El censo del plan cruzado con el libro, para la tala: qué árbol se puede
 * tumbar, cuál ya se tumbó (y qué salió de él) y cuál no se debe tocar.
 *
 * Tres lecturas en paralelo —censo, uso en el libro, parámetros del POA— y el
 * cruce en `prepararArboles` (puro). Las usan el modal «Ver censo», la lista
 * corta del formulario y la ficha del árbol: una sola carga para las tres.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  prepararArboles,
  type ArbolCensoTala,
  type ArbolParaElegir,
  type UsoArbolCenso,
} from "@/lib/forestal/loth-censo-uso";
import type { PoaConfig } from "@/lib/forestal/loth-poa";
import { CENSO_LIMITE } from "../loth-plan-shared";

/** Un árbol tal como lo manda el GET del censo (Decimal → texto). */
interface ArbolDelGet {
  id: string;
  treeCode: string;
  speciesCommon: string;
  speciesScientific?: string | null;
  speciesNative?: string | null;
  cites?: boolean;
  dapM?: string | number | null;
  alturaComercialM?: string | number | null;
  volumenEstimadoM3?: string | number | null;
  utmZona?: string | null;
  utmX?: string | number | null;
  utmY?: string | number | null;
  condicion?: string | null;
  notes?: string | null;
  estado: string;
}

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function aArbolCensoTala(t: ArbolDelGet): ArbolCensoTala {
  return {
    id: t.id,
    treeCode: t.treeCode,
    speciesCommon: t.speciesCommon,
    speciesScientific: t.speciesScientific?.trim() || null,
    speciesNative: t.speciesNative?.trim() || null,
    cites: Boolean(t.cites),
    dapM: num(t.dapM),
    hcM: num(t.alturaComercialM),
    volM3: num(t.volumenEstimadoM3),
    utmZona: t.utmZona ?? null,
    utmX: num(t.utmX),
    utmY: num(t.utmY),
    condicion: t.condicion?.trim() || null,
    notes: t.notes?.trim() || null,
    estadoCenso: t.estado,
  };
}

export interface CensoDeTala {
  arboles: ArbolParaElegir[];
  cargando: boolean;
  error: string | null;
  /** El censo tiene más árboles de los que se trajeron. */
  truncado: boolean;
  /** Se pudo cruzar con el libro. Sin esto, «disponible» es sólo lo que dice el censo. */
  usoLeido: boolean;
  /** De qué plan es lo que hay en `arboles` (null mientras no hay nada leído). */
  listoPara: string | null;
  recargar: () => void;
}

interface Lectura {
  arboles: ArbolParaElegir[];
  truncado: boolean;
  usoLeido: boolean;
}

/**
 * Lo leído por plan, 30 s. Abrir «Nueva línea», cerrarla y volver a abrirla
 * eran tres consultas más cada vez — y el libro en dev ya topaba el límite de
 * 100 por minuto (429) tras ~9 aperturas. La misma promesa sirve a la doble
 * corrida del modo estricto. Lo que escribe en el libro llama a
 * `olvidarCensoDeTala()`: una tala recién asentada no puede seguir «disponible».
 */
const VIGENCIA_MS = 30_000;
const lecturas = new Map<string, { at: number; promesa: Promise<Lectura> }>();

export function olvidarCensoDeTala(): void {
  lecturas.clear();
}

async function leerCenso(planId: string): Promise<Lectura> {
  const id = encodeURIComponent(planId);
  const [c, u, p] = await Promise.all([
    fetch(`/api/admin/forestal/plan/census?planId=${id}&limit=${CENSO_LIMITE}`, { credentials: "include" }),
    fetch("/api/admin/forestal/loth?usoCenso=1", { credentials: "include" }),
    fetch(`/api/admin/forestal/loth/poa?planId=${id}`, { credentials: "include" }),
  ]);
  /* Sin los parámetros del POA (DMC por especie, % de semilleros) la
     categoría sale con los de fábrica: medido 28-09 en QA, un 429 en esa
     consulta pintó 5 semilleros donde el plan dice 1. Mejor avisar y
     reintentar que mostrar otra reserva. 404 = el plan no fijó ninguno. */
  const fallo = !c.ok ? c.status : !p.ok && p.status !== 404 ? p.status : null;
  if (fallo != null) {
    throw new Error(
      fallo === 429
        ? "Demasiadas consultas seguidas: espera un minuto y vuelve a intentar."
        : `No se pudo leer el censo (error ${fallo}).`,
    );
  }
  const censo = (await c.json()) as { trees?: ArbolDelGet[]; truncado?: boolean };
  const usos: UsoArbolCenso[] = u.ok ? (((await u.json()) as { usos?: UsoArbolCenso[] }).usos ?? []) : [];
  const config: Partial<PoaConfig> | undefined = p.ok
    ? (((await p.json()) as { config?: PoaConfig }).config ?? undefined)
    : undefined;
  return {
    arboles: prepararArboles((censo.trees ?? []).map(aArbolCensoTala), usos, config),
    truncado: Boolean(censo.truncado),
    usoLeido: u.ok,
  };
}

function lecturaDe(planId: string): Promise<Lectura> {
  const previa = lecturas.get(planId);
  if (previa && Date.now() - previa.at < VIGENCIA_MS) return previa.promesa;
  const promesa = leerCenso(planId);
  lecturas.set(planId, { at: Date.now(), promesa });
  // Un error —o una lectura sin el cruce con el libro— no se recuerda: el
  // próximo intento vuelve a preguntar.
  const olvidar = () => {
    if (lecturas.get(planId)?.promesa === promesa) lecturas.delete(planId);
  };
  promesa.then((l) => (l.usoLeido ? undefined : olvidar()), olvidar);
  return promesa;
}

export function useCensoDeTala(planId: string | null, activo: boolean): CensoDeTala {
  const [arboles, setArboles] = useState<ArbolParaElegir[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [usoLeido, setUsoLeido] = useState(true);
  const [listoPara, setListoPara] = useState<string | null>(null);
  /** La respuesta de un plan anterior no pisa la del elegido. */
  const ultimo = useRef(0);

  const cargar = useCallback(async () => {
    const pedido = ++ultimo.current;
    if (!activo || !planId) {
      setArboles([]);
      setCargando(false);
      setListoPara(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const l = await lecturaDe(planId);
      if (pedido !== ultimo.current) return;
      setArboles(l.arboles);
      setTruncado(l.truncado);
      setUsoLeido(l.usoLeido);
    } catch (e) {
      if (pedido === ultimo.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (pedido === ultimo.current) {
        setCargando(false);
        setListoPara(planId);
      }
    }
  }, [planId, activo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return {
    arboles,
    cargando,
    error,
    truncado,
    usoLeido,
    listoPara,
    recargar: () => {
      if (planId) lecturas.delete(planId);
      void cargar();
    },
  };
}
