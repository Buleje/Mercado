"use client";

/**
 * Trámites abierto desde la vista GTF del Libro TH con guías elegidas
 * (`?formato=…&guias=…`, ver `tramite-guias-url`): pide esas guías al libro y
 * arma los casilleros del formato (`datosDesdeGuias`). El shell abre el
 * formulario con el resultado ENCIMA de lo que se llena solo: pisa el titular
 * de la Ficha con el de las guías (RUC y representante quedan los de la Ficha).
 *
 * Espera a `listo` (la Ficha CTP cargada): sin ella no se puede avisar que el
 * titular de las guías no es el de la ficha, y el formulario abriría sin RUC.
 */

import { useEffect, useMemo, useState } from "react";
import { datosDesdeGuias, type DatosDesdeGuias, type GuiaParaFormato } from "@/lib/forestal/tramites-desde-guias";
import { borrarPedidoGuias, leerPedidoGuias, type PedidoGuias } from "../tramite-guias-url";

export interface TramiteDesdeGuias {
  pedido: PedidoGuias | null;
  cargando: boolean;
  error: string | null;
  /** Las guías que llegaron (para contar y nombrar en el aviso). */
  guias: GuiaParaFormato[];
  /** Ids pedidos que el libro ya no tiene (borradas o de otro negocio). */
  faltan: number;
  resultado: DatosDesdeGuias | null;
  /** Mete en la relación las anuladas que también están emitidas (por defecto NO van). */
  incluirReemitidas: () => void;
  /** Cierra el aviso: lo traído ya está en el formulario. */
  descartar: () => void;
}

export function useTramiteDesdeGuias(listo: boolean, razonSocialFicha: string | null): TramiteDesdeGuias {
  /* Inicializador PURO (StrictMode lo llama dos veces): la URL se limpia en el efecto. */
  const [pedido, setPedido] = useState<PedidoGuias | null>(() => leerPedidoGuias());
  const [guias, setGuias] = useState<GuiaParaFormato[] | null>(null);
  const [faltan, setFaltan] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [incluir, setIncluir] = useState(false);

  useEffect(() => {
    if (!pedido) return;
    borrarPedidoGuias();
    const ac = new AbortController();
    const qs = new URLSearchParams({ ids: pedido.ids.join(",") });
    fetch(`/api/admin/forestal/gtf?${qs}`, { credentials: "include", cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { guias?: GuiaParaFormato[]; faltan?: number; message?: string };
        if (!r.ok) throw new Error(j.message ?? (r.status === 403 ? "El Libro TH no está habilitado en este negocio." : `No se pudieron leer las guías (HTTP ${r.status}).`));
        setGuias(j.guias ?? []);
        setFaltan(j.faltan ?? 0);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, [pedido]);

  const resultado = useMemo(
    () =>
      pedido && guias && listo
        ? datosDesdeGuias(pedido.formatoId, guias, { incluirAnuladasReemitidas: incluir, razonSocialFicha })
        : null,
    [pedido, guias, listo, incluir, razonSocialFicha],
  );

  return {
    pedido,
    cargando: Boolean(pedido) && guias === null && error === null,
    error,
    guias: guias ?? [],
    faltan,
    resultado,
    incluirReemitidas: () => setIncluir(true),
    descartar: () => {
      setPedido(null);
      setGuias(null);
      setError(null);
    },
  };
}
