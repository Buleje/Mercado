"use client";

/**
 * «Descontar adelantos» desde RRHH › Lo ganado (OPER-2).
 *
 * No hay regla nueva: trae los adelantos ABIERTOS de la persona y abre el
 * mismo `DescuentoPlanillaModal` de Adelantos con el período que estás mirando
 * ya puesto. Qué se descuenta lo decide `proponerDescuentos` (sólo modalidad
 * «descuento por planilla», con saldo y dados) — la misma función del modal.
 *
 * Si la persona tiene adelantos abiertos pero ninguno es de planilla (en Blas
 * los 6 abiertos son «cuenta corriente»), abrir el modal vacío era un callejón:
 * se avisa y se ofrece liquidar su cuenta, que es por donde se cruzan esos.
 */

import { useCallback, useRef, useState } from "react";
import { proponerDescuentos } from "@/lib/adelantos/planilla-lote";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { periodoDelDescuento } from "@/lib/rrhh/descuentos-planilla";
import { sinDato } from "@/lib/errores/sin-dato";

export interface PersonaADescontar {
  nombre: string;
  beneficiarioId: string;
}

export interface DescuentoAbierto {
  persona: PersonaADescontar;
  adelantos: DbAdelanto[];
  periodo: string;
  /** Lo que queda de lo ganado del período para descontar: el tope inicial del modal. */
  tope?: number;
}

export interface SinPlanilla {
  persona: PersonaADescontar;
  /** Cuántos adelantos abiertos tiene, ninguno de planilla. */
  abiertos: number;
}

export function useDescontarAdelantos() {
  const [abierto, setAbierto] = useState<DescuentoAbierto | null>(null);
  const [sinPlanilla, setSinPlanilla] = useState<SinPlanilla | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Dos clics seguidos en personas distintas: sólo vale la respuesta del último. */
  const ultimo = useRef(0);

  const descontar = useCallback(async (persona: PersonaADescontar, desde: string, hasta: string, tope?: number) => {
    const este = ++ultimo.current;
    setCargando(persona.beneficiarioId);
    setError(null);
    setSinPlanilla(null);
    try {
      const q = new URLSearchParams({ beneficiarioId: persona.beneficiarioId, status: "ABIERTO" });
      const r = await fetch(`/api/adelantos?${q.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error(r.status === 403 ? "Tu rol no puede ver los adelantos." : "No se pudieron traer sus adelantos.");
      const adelantos = (await r.json()) as DbAdelanto[];
      if (este !== ultimo.current) return;
      if (proponerDescuentos(adelantos).length === 0) {
        setSinPlanilla({ persona, abiertos: adelantos.length });
      } else {
        setAbierto({ persona, adelantos, periodo: periodoDelDescuento(desde, hasta), tope });
      }
    } catch (err) {
      sinDato("RRHH descontar adelantos")(err);
      if (este === ultimo.current) setError(err instanceof Error ? err.message : "No se pudieron traer sus adelantos.");
    } finally {
      if (este === ultimo.current) setCargando(null);
    }
  }, []);

  const cerrar = useCallback(() => setAbierto(null), []);
  const olvidarAviso = useCallback(() => { setSinPlanilla(null); setError(null); }, []);

  return { abierto, sinPlanilla, cargando, error, descontar, cerrar, olvidarAviso };
}
