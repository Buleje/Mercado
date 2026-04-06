import { useEffect } from "react";
import type { CheckoutDispatch } from "./useCheckoutState";

/**
 * useDniLookup — consulta RENIEC con debounce de 450ms.
 * Cuando el DNI alcanza 8 dígitos, busca el nombre completo y lo
 * autocompleta en el state. Maneja cancelación con AbortController.
 */

type Args = {
  dni: string;
  dispatch: CheckoutDispatch;
};

const DEBOUNCE_MS = 450;

export function useDniLookup({ dni, dispatch }: Args) {
  useEffect(() => {
    const normalized = dni.replace(/\D/g, "").slice(0, 8);

    if (!normalized) {
      dispatch({
        type: "SET_DNI_LOOKUP",
        patch: {
          status: "idle",
          message: "Escribe 8 números y traeremos el nombre desde RENIEC.",
        },
      });
      return;
    }

    if (normalized.length < 8) {
      dispatch({
        type: "SET_DNI_LOOKUP",
        patch: {
          status: "idle",
          message: `Faltan ${8 - normalized.length} dígitos para consultar RENIEC.`,
        },
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        dispatch({
          type: "SET_DNI_LOOKUP",
          patch: { status: "loading", message: "Buscando nombre en RENIEC..." },
        });

        const res = await fetch(`/api/reniec/dni/${normalized}`, {
          method: "GET",
          signal: controller.signal,
        });

        const data = (await res.json()) as {
          nombreCompleto?: string;
          error?: string;
        };

        if (!res.ok || !data.nombreCompleto) {
          const fallbackMsg =
            res.status === 503
              ? "RENIEC no disponible ahora. Escribe el nombre manualmente."
              : res.status === 502
                ? "No pudimos conectar con RENIEC. Escribe el nombre manualmente."
                : data.error || "No encontramos datos para este DNI.";
          dispatch({
            type: "SET_DNI_LOOKUP",
            patch: { status: "error", message: fallbackMsg },
          });
          return;
        }

        dispatch({ type: "SET_CUSTOMER", patch: { name: data.nombreCompleto } });
        dispatch({
          type: "SET_DNI_LOOKUP",
          patch: {
            status: "success",
            message: "Nombre completado automáticamente desde RENIEC.",
          },
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        dispatch({
          type: "SET_DNI_LOOKUP",
          patch: {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo consultar RENIEC.",
          },
        });
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [dni, dispatch]);
}
