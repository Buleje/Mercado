"use client";

/**
 * use-liquidacion-cuenta — datos y acciones de «Liquidar cuenta» (ADR-413).
 *
 * DEPENDE DEL SERVIDOR (en paralelo, mismo ADR): `@/lib/cuentas/liquidacion`
 * (puro: tipos + `planLiquidacion`/`huellaDe`) y las rutas
 * `/api/adelantos/cuentas/{partidas,liquidaciones,liquidaciones/[id]}`. Hasta
 * que existan, `tsc`/`tsgo` marcan estos imports como módulo faltante — es
 * exactamente lo que el ADR pide programar contra el contrato, no algo para
 * arreglar acá.
 *
 * La vista previa (`previa`) llama a `planLiquidacion` LOCAL, sin red — es la
 * MISMA función pura que corre el servidor dentro de la transacción; el
 * servidor es quien manda de verdad (regla 6: totales en backend), esto es
 * sólo lo que se le muestra a Brandon antes de confirmar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  planLiquidacion,
  type IntencionLiquidacion,
  type PartidasDePersona,
  type ResultadoPlan,
} from "@/lib/cuentas/liquidacion";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";
import type { ResultadoMovimiento } from "@/lib/adelantos/movimiento-caja";

type PersonaId = { beneficiarioId: string | null; parteId: string | null };

const params = (p: PersonaId): string => {
  const sp = new URLSearchParams();
  if (p.beneficiarioId) sp.set("beneficiario", p.beneficiarioId);
  if (p.parteId) sp.set("parte", p.parteId);
  return sp.toString();
};

/** 409 `plan_cambio`: la cuenta cambió mientras se miraba la vista previa. */
export type PlanCambioInfo = { message: string; partidas: PartidasDePersona; huella: string };

export function useLiquidacionCuenta(persona: PersonaId) {
  const [partidas, setPartidas] = useState<PartidasDePersona | null>(null);
  const [huella, setHuella] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionDTO[]>([]);
  const [planCambio, setPlanCambio] = useState<PlanCambioInfo | null>(null);

  // Una sola vez por apertura del modal: éste es un hook fresco por mount
  // (el modal se desmonta al cerrar), así que `useState` inicial alcanza.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const cargarPartidas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/adelantos/cuentas/partidas?${params(persona)}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("No se pudieron traer las partidas de la cuenta");
      const data: { partidas: PartidasDePersona; huella: string } = await res.json();
      setPartidas(data.partidas);
      setHuella(data.huella);
      setPlanCambio(null);
    } catch {
      setError("No se pudo cargar la cuenta para liquidar");
    } finally {
      setLoading(false);
    }
  }, [persona.beneficiarioId, persona.parteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarLiquidaciones = useCallback(async () => {
    try {
      // `anuladas=1`: el historial muestra TODAS — sin esto la ruta oculta las
      // anuladas por defecto y una liquidación revertida desaparecía del
      // papel, como si nunca hubiera pasado.
      const res = await fetch(`/api/adelantos/cuentas/liquidaciones?${params(persona)}&anuladas=1`, { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data: { liquidaciones: LiquidacionDTO[] } = await res.json();
      setLiquidaciones(Array.isArray(data.liquidaciones) ? data.liquidaciones : []);
    } catch {
      // El historial es secundario: si falla, el flujo de liquidar sigue andando.
    }
  }, [persona.beneficiarioId, persona.parteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarPartidas();
    cargarLiquidaciones();
  }, [cargarPartidas, cargarLiquidaciones]);

  /** La vista previa: MISMA función pura que corre el servidor, sin red. */
  const previa = useCallback(
    (intencion: IntencionLiquidacion): ResultadoPlan => {
      if (!partidas) return { ok: false, errores: ["Todavía se está cargando la cuenta."] };
      return planLiquidacion(partidas, intencion);
    },
    [partidas],
  );

  const confirmar = useCallback(
    async (
      intencion: IntencionLiquidacion,
    ): Promise<
      | { ok: true; liquidacion: LiquidacionDTO; repetida: boolean; caja: ResultadoMovimiento | null }
      | { ok: false; error: string; planCambio?: PlanCambioInfo }
    > => {
      try {
        const res = await fetch("/api/adelantos/cuentas/liquidaciones", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            idempotencyKey,
            persona: { beneficiarioId: persona.beneficiarioId ?? undefined, parteId: persona.parteId ?? undefined },
            fecha: intencion.fecha,
            compensar: intencion.compensar,
            pago: intencion.pago,
            imputacion: intencion.imputacion,
            notas: intencion.notas,
            huella,
          }),
        });
        const body = await res.json().catch((err) => {
          logger.warn("[use-liquidacion-cuenta] respuesta sin JSON al confirmar", { error: String(err) });
          return null;
        });
        if (res.status === 409 && body?.error === "plan_cambio") {
          const info: PlanCambioInfo = { message: body.message ?? "La cuenta cambió mientras la mirabas.", partidas: body.partidas, huella: body.huella };
          setPlanCambio(info);
          setPartidas(info.partidas);
          setHuella(info.huella);
          return { ok: false, error: info.message, planCambio: info };
        }
        if (!res.ok) return { ok: false, error: body?.message ?? body?.error ?? "No se pudo liquidar la cuenta" };
        await cargarLiquidaciones();
        // `caja` NO se descarta (revisión de código): la pantalla de resultado
        // y el historial la muestran vía `liquidacion.caja.resultado` (misma
        // información ya persistida por el servidor, sin duplicar su lógica).
        return { ok: true, liquidacion: body.liquidacion, repetida: Boolean(body.repetida), caja: body.caja ?? null };
      } catch {
        return { ok: false, error: "No se pudo liquidar la cuenta" };
      }
    },
    [idempotencyKey, persona.beneficiarioId, persona.parteId, huella, cargarLiquidaciones],
  );

  const anular = useCallback(
    async (id: string, motivo: string, devolucionCaja: string | null): Promise<{ ok: true } | { ok: false; message: string }> => {
      const MENSAJE_GENERICO = "No se pudo anular la liquidación.";
      try {
        const res = await fetch(`/api/adelantos/cuentas/liquidaciones/${id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ action: "anular", motivo, devolucionCaja }),
        });
        if (!res.ok) {
          // El 409 trae el motivo real («Anula primero LIQ-…», «ya está
          // anulada»): un genérico acá esconde justo lo que el operador
          // necesita leer (revisión de código).
          const body = await res.json().catch((err) => {
            logger.warn("[use-liquidacion-cuenta] respuesta sin JSON al anular", { error: String(err) });
            return null;
          });
          return { ok: false, message: body?.message ?? MENSAJE_GENERICO };
        }
        await Promise.all([cargarLiquidaciones(), cargarPartidas()]);
        return { ok: true };
      } catch {
        return { ok: false, message: MENSAJE_GENERICO };
      }
    },
    [cargarLiquidaciones, cargarPartidas],
  );

  return useMemo(
    () => ({ partidas, huella, loading, error, planCambio, previa, confirmar, liquidaciones, anular, idempotencyKey, recargarPartidas: cargarPartidas }),
    [partidas, huella, loading, error, planCambio, previa, confirmar, liquidaciones, anular, idempotencyKey, cargarPartidas],
  );
}
