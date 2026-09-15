"use client";

/**
 * use-cuentas-personas — Adelantos + cuenta corriente forestal, unidas por
 * persona (ADR-412 §5, `/api/adelantos/cuentas`).
 *
 * Vive en su propio hook (regla 2 de code-quality) porque `ResumenView` ya
 * carga los adelantos del módulo: esto es una consulta aparte, con su propio
 * loading/error, que no debe bloquear el resto de la pestaña Resumen si el
 * tenant no tiene la especialización forestal o la consulta falla.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";

type Estado = {
  forestal: boolean;
  personas: CuentaPersona[];
  /** La cuenta forestal tocó el tope de `ForestCuentaDB.listar` — puede faltar plata. */
  truncado: boolean;
  loading: boolean;
  error: string | null;
};

export function useCuentasPersonas() {
  const [estado, setEstado] = useState<Estado>({ forestal: false, personas: [], truncado: false, loading: true, error: null });

  const reload = useCallback(async () => {
    setEstado((e) => ({ ...e, loading: true, error: null }));
    try {
      // `no-store`: después de vincular una parte, este mismo `reload()` tiene
      // que traer la fila unida YA, no la de hace 30 s (revisión de código).
      const res = await fetch("/api/adelantos/cuentas", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("No se pudo cargar la cuenta por persona");
      const data: { forestal: boolean; personas: CuentaPersona[]; truncado?: boolean } = await res.json();
      setEstado({
        forestal: data.forestal,
        personas: Array.isArray(data.personas) ? data.personas : [],
        truncado: data.truncado === true,
        loading: false,
        error: null,
      });
    } catch {
      setEstado((e) => ({ ...e, loading: false, error: "No se pudo cargar la cuenta por persona" }));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Vincula (o desvincula con `null`) a un beneficiario con una parte del
   * directorio forestal. Devuelve `true` si guardó — el llamador recarga.
   * El error queda en `estado.error` para que la fila lo muestre sin un
   * segundo estado local por componente.
   */
  const vincularParte = useCallback(
    async (beneficiarioId: string, forestPartyId: string | null): Promise<boolean> => {
      try {
        const res = await fetch(`/api/adelantos/beneficiarios/${beneficiarioId}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ action: "vincular_parte", forestPartyId }),
        });
        if (!res.ok) {
          /* Sin .catch mudo: un cuerpo que no es JSON cae al catch de afuera, que
             ya dice «no se pudo vincular». El 409 trae `message` en palabras. */
          const body = (await res.json()) as { message?: string; error?: string } | null;
          setEstado((e) => ({ ...e, error: body?.message ?? body?.error ?? "No se pudo vincular la persona" }));
          return false;
        }
        await reload();
        return true;
      } catch {
        setEstado((e) => ({ ...e, error: "No se pudo vincular la persona" }));
        return false;
      }
    },
    [reload],
  );

  return { ...estado, reload, vincularParte };
}
