"use client";

/**
 * use-registrar-produccion-sin-lote — el ÚNICO pedido de «Declarar producción» (ADR-429).
 *
 * Antes eran dos (crear la corrida, después declararla) con un DELETE de
 * rescate si el segundo fallaba. Ahora el servidor crea y declara todas las
 * corridas —una por especie— o ninguna, en una sola transacción.
 *
 * El posible duplicado (misma fecha, especie y m³ sin lote) vuelve como 409
 * `POSIBLE_DUPLICADO`: se pregunta con `useConfirm` y, si es otra jornada de
 * verdad, se reenvía con `confirmarDuplicado: true`. Es la mitad del arreglo
 * del doble cobro; la otra mitad es vaciar la libreta al registrar.
 */
import { useCallback, useRef, useState } from "react";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { csrfHeaders } from "@/lib/csrf-client";
import type {
  ProduccionSinLoteInput,
  ProduccionSinLoteRespuesta,
} from "@/lib/forestal/declarar-produccion";
import {
  duplicadosDelDetalle,
  explicarErrorDeRegistro,
  type DetalleError,
} from "./declarar-produccion-pantalla";

export const URL_PRODUCCION_SIN_LOTE = "/api/admin/forestal/ctp/produccion-sin-lote";

type Envio =
  | { ok: true; datos: ProduccionSinLoteRespuesta }
  | {
      ok: false;
      status: number;
      codigo: string | null;
      mensaje: string | null;
      detalle: DetalleError;
    };

async function enviar(pedido: ProduccionSinLoteInput): Promise<Envio> {
  const r = await fetch(URL_PRODUCCION_SIN_LOTE, {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(pedido),
  });
  const j = (await r.json().catch(() => null)) as
    | (Partial<ProduccionSinLoteRespuesta> & {
        error?: unknown;
        code?: unknown;
        message?: unknown;
        detail?: unknown;
      })
    | null;
  if (r.ok && j && Array.isArray(j.corridas) && j.total) {
    return { ok: true, datos: { corridas: j.corridas, total: j.total } };
  }
  /* Los endpoints del Libro responden `{ error: <código>, message }` en un 409
     (ver `trozas/retrozar`); se acepta también `code` por si acaso. */
  const codigo =
    typeof j?.error === "string" ? j.error : typeof j?.code === "string" ? j.code : null;
  const mensaje = typeof j?.message === "string" ? j.message : null;
  const detalle =
    j?.detail && typeof j.detail === "object" && !Array.isArray(j.detail)
      ? (j.detail as Record<string, unknown>)
      : null;
  if (r.ok)
    return {
      ok: false,
      status: r.status,
      codigo: null,
      mensaje: "El servidor respondió sin las corridas registradas.",
      detalle: null,
    };
  return { ok: false, status: r.status, codigo, mensaje, detalle };
}

export function useRegistrarProduccionSinLote() {
  const { confirm } = useConfirm();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* El estado llega un render tarde: dos clics seguidos mandarían dos pedidos. */
  const enVuelo = useRef(false);

  const registrar = useCallback(
    async (pedido: ProduccionSinLoteInput): Promise<ProduccionSinLoteRespuesta | null> => {
      if (enVuelo.current) return null;
      enVuelo.current = true;
      setGuardando(true);
      setError(null);
      try {
        let r = await enviar(pedido);
        if (!r.ok && r.codigo === "POSIBLE_DUPLICADO") {
          const dup = duplicadosDelDetalle(r.detalle);
          const cuales = dup.length
            ? `En el Libro ya está: ${dup.join("; ")} — misma fecha, especie y m³, sin lote.`
            : r.mensaje?.trim() ||
              "Ya hay una producción sin lote con la misma fecha, especie y m³.";
          const seguir = await confirm({
            title: "¿Ya registraste esta producción?",
            description: `${cuales} Si es otra jornada, regístrala igual; si es la misma, cancela y no se registra nada.`,
            intent: "warning",
            confirmLabel: "Es otra: registrar igual",
            cancelLabel: "No, revisar",
          });
          if (!seguir) {
            /* Sin esto, «No, revisar» no dejaba rastro: la libreta seguía llena
               y nada decía qué hacer (revisor, 22-09). */
            setError(
              `${cuales} No se registró nada. Si ya la tenías registrada, vacía lo cubicado desde el menú «Lote» de la tabla para no declararla dos veces.`,
            );
            return null;
          }
          r = await enviar({ ...pedido, confirmarDuplicado: true });
        }
        if (!r.ok) {
          setError(explicarErrorDeRegistro(r.codigo, r.mensaje, r.status, r.detalle));
          return null;
        }
        return r.datos;
      } catch (e) {
        /* Un corte de red no dice si el servidor llegó a guardar: no se promete
           nada. Reintentar es seguro — si ya había quedado, vuelve el 409 de
           posible duplicado y se pregunta. */
        setError(
          `No se pudo confirmar el registro (${e instanceof Error ? e.message : String(e)}). Reintenta: si ya había quedado, te avisa del duplicado.`,
        );
        return null;
      } finally {
        enVuelo.current = false;
        setGuardando(false);
      }
    },
    [confirm],
  );

  return { registrar, guardando, error, limpiarError: () => setError(null) };
}
