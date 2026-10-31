"use client";

/**
 * use-pago-semana — los datos del pago del sábado (`/api/rrhh/pago-semana`).
 *
 * El servidor calcula todo (ganado, adelantos a descontar, neto, totales). La
 * pantalla sólo previsualiza el caso «falta definir su pago» con la MISMA
 * función pura (`calcularPagoSemana`) y manda el neto que vio: si el servidor
 * llega a otro (entró un adelanto mientras mirabas), contesta 409 con los
 * números nuevos y no paga.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { calcularPagoSemana, type CalculoPago, type FilaPagoSemanaDTO, type PagoSemanaDTO } from "@/lib/rrhh/pago-semana";
import { semanaDe } from "@/lib/rrhh/fechas";
import { limaDateKey } from "@/lib/utils";
import { sinDato } from "@/lib/errores/sin-dato";

export type MetodoPago = "efectivo" | "yape" | "plin" | "transferencia";

export interface ComoPagas {
  metodo: MetodoPago;
  saleDeCaja: boolean;
}

type Resultado = { ok: true; mensaje: string } | { ok: false; mensaje: string };

interface RespuestaError {
  error?: string;
  message?: string;
}

/** La cuenta que se ve: la del servidor, o la previa con el monto escrito si falta definir. */
export function calculoDeLaFila(fila: FilaPagoSemanaDTO, montoManual: number | null): CalculoPago {
  if (fila.tipo !== "falta_definir" || montoManual == null) return fila.calculo;
  return calcularPagoSemana({
    referencia: fila.referencia,
    ganado: fila.ganado,
    montoManual,
    descontadoPrevio: fila.descontadoPrevio,
    adelantos: fila.abiertos,
  });
}

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  const cuerpo = (await res.json().catch(() => ({}))) as RespuestaError;
  if (res.status === 403) return cuerpo.message ?? "Tu usuario no puede pagar al personal.";
  return cuerpo.message ?? porDefecto;
}

export function usePagoSemana(activo: boolean) {
  const [desde, setDesde] = useState<string>(() => semanaDe(limaDateKey()).desde);
  const [datos, setDatos] = useState<PagoSemanaDTO | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Una fila a la vez: el id del colaborador que se está pagando o deshaciendo. */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const ultimo = useRef(0);

  const recargar = useCallback(async () => {
    const este = ++ultimo.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/rrhh/pago-semana?semana=${desde}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(await mensajeDeError(res, "No se pudo leer el pago de la semana."));
      const d = (await res.json()) as PagoSemanaDTO;
      if (este === ultimo.current) setDatos(d);
    } catch (err) {
      sinDato("RRHH pago de la semana")(err);
      if (este === ultimo.current) setError(err instanceof Error ? err.message : "No se pudo leer el pago de la semana.");
    } finally {
      if (este === ultimo.current) setCargando(false);
    }
  }, [desde]);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  const pagar = useCallback(
    async (fila: FilaPagoSemanaDTO, como: ComoPagas, montoManual: number | null): Promise<Resultado> => {
      const calculo = calculoDeLaFila(fila, montoManual);
      setOcupado(fila.colaboradorId);
      try {
        const res = await fetch("/api/rrhh/pago-semana", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({
            colaboradorId: fila.colaboradorId,
            desde,
            montoManual: fila.tipo === "falta_definir" ? montoManual : null,
            metodo: como.metodo,
            saleDeCaja: como.metodo === "efectivo" && como.saleDeCaja,
            netoEsperado: calculo.neto,
          }),
        });
        if (!res.ok) {
          const mensaje = await mensajeDeError(res, "No se pudo anotar el pago.");
          // Con 409 (el neto cambió, ya pagado en otra pestaña) la tira se refresca sola.
          if (res.status === 409) void recargar();
          return { ok: false, mensaje };
        }
        const cuerpo = (await res.json()) as { repetido?: boolean; caja?: { sinCaja: boolean } | null };
        void recargar();
        if (cuerpo.repetido) return { ok: true, mensaje: `${fila.nombre} ya estaba pagado esta semana.` };
        const sinCaja = cuerpo.caja?.sinCaja ? " No había caja abierta: el retiro no se anotó." : "";
        return { ok: true, mensaje: `Pagado a ${fila.nombre}.${sinCaja}` };
      } catch {
        return { ok: false, mensaje: "Sin conexión: revisa tu internet e intenta de nuevo." };
      } finally {
        setOcupado(null);
      }
    },
    [desde, recargar],
  );

  const deshacer = useCallback(
    async (fila: FilaPagoSemanaDTO): Promise<Resultado> => {
      setOcupado(fila.colaboradorId);
      try {
        const res = await fetch("/api/rrhh/pago-semana", {
          method: "DELETE",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ colaboradorId: fila.colaboradorId, desde }),
        });
        if (!res.ok) return { ok: false, mensaje: await mensajeDeError(res, "No se pudo deshacer el pago.") };
        const r = (await res.json()) as { adelantosReabiertos: number; caja: { aviso: string | null } };
        void recargar();
        const reabiertos = r.adelantosReabiertos > 0 ? ` ${r.adelantosReabiertos} adelanto(s) vuelven a quedar por descontar.` : "";
        return { ok: true, mensaje: `Pago de ${fila.nombre} deshecho.${reabiertos}${r.caja.aviso ? ` ${r.caja.aviso}` : ""}` };
      } catch {
        return { ok: false, mensaje: "Sin conexión: revisa tu internet e intenta de nuevo." };
      } finally {
        setOcupado(null);
      }
    },
    [desde, recargar],
  );

  return { desde, setDesde, datos, cargando, error, ocupado, recargar, pagar, deshacer };
}

export type PagoSemana = ReturnType<typeof usePagoSemana>;
