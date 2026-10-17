"use client";

/**
 * Armar el lote que la propuesta necesita, por el camino de siempre (ADR-408).
 *
 * `sumar-corrida` sólo mueve piezas **de un lote**, y en el patio real no había
 * ninguno con piezas libres: el desplegable salía vacío y la vinculación no se
 * podía terminar nunca. Esto abre ese paso sin inventar una segunda forma de
 * crear lotes — usa los DOS endpoints que ya usa la pestaña Lotes:
 *
 *   1. `POST   /lotes-aserrio  { modo: "abierto" }`   → abre el lote
 *   2. `PATCH  /lotes-aserrio  { accion: "agregar" }` → le guarda las trozas
 *
 * Cuando las trozas propuestas ya tienen un lote abierto donde viven sus
 * hermanas, el paso 1 se salta: se agregan ahí. Repartir una vinculación entre
 * dos lotes no se puede deshacer —`sumar-corrida` admite una sola pasada por
 * corrida— así que juntarlas es lo único que la deja confirmable.
 *
 * Lo que el servidor rechaza SE DEVUELVE con su motivo. Una troza que no entró
 * en silencio es el error que descartó 51 trozas en el importador CTP.
 */

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { notaDelLote, type CorridaDelPlan, type PlanDeLote } from "@/lib/forestal/lote-desde-propuesta";

const API = "/api/admin/forestal/lotes-aserrio";

/** Una troza que el servidor no aceptó, con el motivo que dio. */
export interface TrozaRechazada {
  id: string;
  codigo: string | null;
  motivo: string;
}

export interface EstadoArmado {
  armando: boolean;
  error: string | null;
  rechazadas: TrozaRechazada[];
  armar: (plan: PlanDeLote, corrida: CorridaDelPlan) => Promise<void>;
}

/** El mensaje del servidor si lo mandó; si no, el status pelado. */
async function motivoDe(r: Response): Promise<string> {
  const j = await leerJson<{ message?: string; error?: string }>(r);
  return j?.message ?? j?.error ?? `El servidor respondió ${r.status}`;
}

export function useArmarLoteDePropuesta(
  onArmado: (lote: LoteAserrio) => void,
): EstadoArmado {
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazadas, setRechazadas] = useState<TrozaRechazada[]>([]);

  const armar = useCallback(
    async (plan: PlanDeLote, corrida: CorridaDelPlan) => {
      setArmando(true);
      setError(null);
      setRechazadas([]);
      try {
        let loteId = plan.loteId;

        if (plan.accion === "crear") {
          const r = await fetch(API, {
            method: "POST",
            credentials: "include",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              modo: "abierto",
              speciesCommon: plan.especie,
              /* El título habilitante derivado de las propias trozas (ADR-393):
                 acá SÍ se puede, porque las piezas ya están elegidas. */
              permiso: plan.permiso,
              tipoProductoConsumir: "rolliza",
              /* La sierra cortó el día de la corrida: la ventana del proceso
                 abre ahí, no hoy. El cierre lo pone el consumo. */
              inicioProceso: corrida.fecha.slice(0, 10),
              notes: notaDelLote(plan, corrida),
            }),
          });
          if (!r.ok) throw new Error(await motivoDe(r));
          const j = await leerJson<{ lote?: { id?: string } }>(r);
          loteId = j?.lote?.id ?? null;
          if (!loteId) throw new Error("El lote se creó pero el servidor no devolvió su identificador.");
        }

        const r2 = await fetch(API, {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ accion: "agregar", loteId, trozaIds: plan.trozaIds }),
        });
        if (!r2.ok) throw new Error(await motivoDe(r2));
        const guardadas = await leerJson<{ agregadas?: number; rechazadas?: TrozaRechazada[] }>(r2);
        const noEntraron = guardadas?.rechazadas ?? [];
        setRechazadas(noEntraron);

        /* El lote se relee del servidor, no se arma acá con lo que se mandó: lo
           que vale es lo que quedó escrito, incluidas las que no entraron. */
        invalidarCtp("lotes-aserrio");
        const { lotes } = await ctpGet<{ lotes: LoteAserrio[] }>(`${API}?status=abierto`);
        const lote = lotes.find((l) => l.id === loteId);
        if (!lote) {
          throw new Error(
            "El lote se armó, pero no se pudo volver a leer para elegirlo. Abre Lotes y confirma desde ahí.",
          );
        }
        onArmado(lote);
      } catch (e) {
        logger.warn("[armar-lote-propuesta] no se pudo armar el lote", { error: String(e) });
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setArmando(false);
      }
    },
    [onArmado],
  );

  return { armando, error, rechazadas, armar };
}
