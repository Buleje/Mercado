"use client";

import { useCallback, useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { llamarCms, type ResultadoAccion } from "@/hooks/use-cms-pages";
import type { EstadoPagina } from "@/components/admin/cms/tipos";

export interface BloqueEditable {
  id: string;
  type: string;
  order: number;
  visible: boolean;
  props: Record<string, unknown>;
}

export interface PaginaEditable {
  id: string;
  slug: string;
  title: string;
  status: EstadoPagina;
  blocks: BloqueEditable[];
}

/** Una página y sus bloques: cada acción va al servidor y luego se vuelve a leer. */
export function useCmsPageEditor(id: string) {
  const [pagina, setPagina] = useState<PaginaEditable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/cms/pages/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? "no existe" : `HTTP ${res.status}`);
      setPagina((await res.json()) as PaginaEditable);
      setError(null);
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
      setError("No pudimos abrir esta página. Puede que ya no exista.");
    }
  }, [id]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const tras = useCallback(
    async (r: Promise<ResultadoAccion>) => {
      const res = await r;
      if (res.ok) await recargar();
      return res;
    },
    [recargar],
  );

  const base = `/api/cms/pages/${id}`;
  return {
    pagina,
    error,
    guardarDatos: (titulo: string, slug: string) => tras(llamarCms(base, "PUT", { title: titulo, slug })),
    publicar: () => tras(llamarCms(`${base}/publish`, "POST")),
    despublicar: () => tras(llamarCms(`${base}/publish`, "DELETE")),
    agregarBloque: (type: string, order: number) =>
      tras(llamarCms(`${base}/blocks`, "POST", { type, order, visible: true, props: {} })),
    eliminarBloque: (blockId: string) => tras(llamarCms(`${base}/blocks?blockId=${blockId}`, "DELETE")),
    cambiarVisible: (blockId: string, visible: boolean) =>
      tras(llamarCms(`${base}/blocks?blockId=${blockId}`, "PUT", { visible })),
    guardarProps: (blockId: string, props: Record<string, unknown>) =>
      tras(llamarCms(`${base}/blocks?blockId=${blockId}`, "PUT", { props })),
    /** Reescribe `order` como 0..n-1 en el orden recibido. */
    reordenar: (ids: string[]) =>
      tras(llamarCms(`${base}/blocks`, "POST", { action: "reorder", blockOrders: ids.map((bid, order) => ({ id: bid, order })) })),
  };
}
