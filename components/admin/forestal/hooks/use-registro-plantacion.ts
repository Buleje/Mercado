"use client";

/**
 * El registro de una plantación para la tala (ADR-459): sus especies con lo
 * que queda en pie, y los códigos de árbol ya usados para proponer el próximo.
 *
 * Sólo lee cuando el plan elegido ES una plantación (`esPlanDePlantacion`) y la
 * sección lo pide: para un PO/PMFI/DEMA no hace ninguna consulta.
 *
 * Tres lecturas en paralelo, recordadas 30 s por plan (el libro comparte un
 * tope de 100 consultas por minuto con el resto del formulario):
 *  · `GET /plan?balance=` — registrado y talado por especie, SÓLO de ese plan;
 *  · `GET /loth?available=trozado&planId=` — las talas del plan (correlativo);
 *  · `GET /loth?usoCenso=1` — las talas del negocio (T3 no deja repetir un
 *    código en ningún plan).
 * El detalle de la especie (científico, año, superficie) llega del formulario,
 * que ya lo leyó con el plan.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UsoArbolCenso } from "@/lib/forestal/loth-censo-uso";
import { esPlanDePlantacion, type PlanParaPoa } from "@/lib/forestal/loth-poa";
import {
  codigoPropuesto,
  especieDelRegistro,
  especiesDelRegistro,
  saldoConEstaTala,
  type EspecieDelPlanFila,
  type EspecieDelRegistro,
  type FilaBalanceRegistro,
  type SaldoDeTala,
} from "@/lib/forestal/loth-tala-plantacion";

interface Lectura {
  filas: FilaBalanceRegistro[];
  codigosPlan: string[];
  codigosNegocio: string[];
  /** Se pudieron leer los códigos: sin ellos la propuesta puede chocar (T3 lo dice al guardar). */
  codigosLeidos: boolean;
}

const VIGENCIA_MS = 30_000;
const lecturas = new Map<string, { at: number; promesa: Promise<Lectura> }>();

/** Lo que escribe en el libro lo llama: una tala nueva cambia el saldo y los códigos. */
export function olvidarRegistroPlantacion(): void {
  lecturas.clear();
}

async function leerRegistro(planId: string): Promise<Lectura> {
  const id = encodeURIComponent(planId);
  const [b, t, u] = await Promise.all([
    fetch(`/api/admin/forestal/plan?balance=${id}`, { credentials: "include" }),
    fetch(`/api/admin/forestal/loth?available=trozado&planId=${id}`, { credentials: "include" }),
    fetch("/api/admin/forestal/loth?usoCenso=1", { credentials: "include" }),
  ]);
  if (!b.ok) {
    throw new Error(
      b.status === 429
        ? "Demasiadas consultas seguidas: espera un minuto y vuelve a intentar."
        : `No se pudo leer el saldo del registro (error ${b.status}).`,
    );
  }
  const balance = (await b.json()) as { balance?: { rows?: FilaBalanceRegistro[] } };
  const talas = t.ok ? (((await t.json()) as { items?: { code: string | null }[] }).items ?? []) : [];
  const usos = u.ok ? (((await u.json()) as { usos?: UsoArbolCenso[] }).usos ?? []) : [];
  return {
    filas: balance.balance?.rows ?? [],
    codigosPlan: talas.map((x) => x.code).filter((c): c is string => Boolean(c)),
    codigosNegocio: usos.filter((x) => x.tala != null).map((x) => x.treeCode),
    codigosLeidos: t.ok && u.ok,
  };
}

function lecturaDe(planId: string): Promise<Lectura> {
  const previa = lecturas.get(planId);
  if (previa && Date.now() - previa.at < VIGENCIA_MS) return previa.promesa;
  const promesa = leerRegistro(planId);
  lecturas.set(planId, { at: Date.now(), promesa });
  // Un error —o una lectura sin los códigos— no se recuerda: el próximo intento vuelve a preguntar.
  const olvidar = () => {
    if (lecturas.get(planId)?.promesa === promesa) lecturas.delete(planId);
  };
  promesa.then((l) => (l.codigosLeidos ? undefined : olvidar()), olvidar);
  return promesa;
}

export interface RegistroPlantacion {
  /** El plan elegido es una plantación. */
  esPlantacion: boolean;
  especies: EspecieDelRegistro[];
  cargando: boolean;
  error: string | null;
  /** De qué plan es lo leído (null mientras no hay nada). */
  listoPara: string | null;
  recargar: () => void;
  /** La especie del registro que es `especie` (por clave), o `null`. */
  especie: (especie: string | null | undefined) => EspecieDelRegistro | null;
  /** El próximo código de árbol para la especie; `ademas` = recién usados que la lectura aún no trae. */
  codigoPara: (especie: string, ademas?: readonly string[]) => string;
  /** registrado − talado − lo que se mide, para la especie (null si no está en el registro). */
  saldo: (especie: string | null | undefined, medidoM3: number | null) => SaldoDeTala | null;
}

const VACIO: Lectura = { filas: [], codigosPlan: [], codigosNegocio: [], codigosLeidos: true };

export function useRegistroPlantacion(
  plan: (PlanParaPoa & { id: string }) | null,
  activo: boolean,
  especiesDelPlan: readonly EspecieDelPlanFila[],
): RegistroPlantacion {
  const esPlantacion = esPlanDePlantacion(plan);
  const planId = plan?.id ?? null;
  const leer = activo && esPlantacion && planId != null;
  const [lectura, setLectura] = useState<Lectura>(VACIO);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listoPara, setListoPara] = useState<string | null>(null);
  /** La respuesta de un plan anterior no pisa la del elegido. */
  const ultimo = useRef(0);

  const cargar = useCallback(async () => {
    const pedido = ++ultimo.current;
    if (!leer || !planId) {
      setLectura(VACIO);
      setCargando(false);
      setError(null);
      setListoPara(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const l = await lecturaDe(planId);
      if (pedido === ultimo.current) setLectura(l);
    } catch (e) {
      if (pedido === ultimo.current) {
        setLectura(VACIO);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (pedido === ultimo.current) {
        setCargando(false);
        setListoPara(planId);
      }
    }
  }, [leer, planId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const especies = useMemo(() => especiesDelRegistro(lectura.filas, especiesDelPlan), [lectura.filas, especiesDelPlan]);

  return {
    esPlantacion,
    especies,
    cargando,
    error,
    listoPara,
    recargar: () => {
      if (planId) lecturas.delete(planId);
      void cargar();
    },
    especie: (e) => especieDelRegistro(especies, e),
    codigoPara: (e, ademas = []) => codigoPropuesto(e, [...lectura.codigosPlan, ...ademas], lectura.codigosNegocio),
    saldo: (e, medidoM3) => {
      const reg = especieDelRegistro(especies, e);
      return reg ? saldoConEstaTala(reg, medidoM3) : null;
    },
  };
}
