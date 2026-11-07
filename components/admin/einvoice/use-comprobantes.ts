"use client";

/**
 * Los comprobantes de Facturas y boletas tal como los manda el backend
 * (`/api/admin/comprobantes/lista`). La emisión vive en `use-emision.ts` y, al
 * terminar, vuelve a pedir la lista: ya no se arma una fila en el navegador con
 * un número inventado (auditoría de comprobantes B2, 17-10).
 */
import { useCallback, useState } from "react";
import { formatDateNumeric } from "@/lib/format";
import { logger } from "@/lib/logger";
import { textoFecha } from "@/lib/comprobantes/periodo";
import type { ResumenComprobantes } from "@/lib/comprobantes/resumen";
import type { DocStatus, DocType, EDocument } from "./tipos";

const TYPE_MAP: Record<string, DocType> = {
  factura: "factura",
  nota_credito: "nota-credito",
  "nota-credito": "nota-credito",
  nota_debito: "nota-debito",
  "nota-debito": "nota-debito",
  boleta: "boleta",
  baja: "baja",
};
/** `retrying` = en cola, el sistema lo reenvía solo: antes caía al default y se veía «Emitido» en verde (B1). */
const STATUS_MAP: Record<string, DocStatus> = {
  pending: "pendiente",
  retrying: "pendiente",
  accepted: "aceptado",
  rejected: "rechazado",
  voided: "anulado",
};

export type FilaApi = {
  id: string;
  orderId?: string | null;
  series?: string;
  number?: number | string;
  type?: string;
  sunatStatus?: string;
  customerName?: string;
  customerRuc?: string;
  subtotal?: number;
  igv?: number;
  total?: number;
  errorMessage?: string | null;
  pdfUrl?: string | null;
  createdAt?: string;
};

export function aDocumento(inv: FilaApi): EDocument {
  return {
    id: inv.id,
    orderId: inv.orderId ?? null,
    serie: inv.series || (inv.type === "factura" ? "F001" : "B001"),
    number: inv.number != null ? String(inv.number) : "0",
    /* «jueves 10/09» en la tabla; el Excel usa `creado` con la fecha completa. */
    date: inv.createdAt ? textoFecha(inv.createdAt) : "-",
    creado: inv.createdAt ? formatDateNumeric(inv.createdAt) : "",
    type: TYPE_MAP[inv.type ?? ""] ?? "boleta",
    status: STATUS_MAP[inv.sunatStatus ?? ""] ?? "emitido",
    clientName: inv.customerName || "-",
    clientRUC: inv.customerRuc || "-",
    subtotal: inv.subtotal ?? 0,
    igv: inv.igv ?? 0,
    total: inv.total ?? 0,
    items: 0,
    sunatResponse: inv.errorMessage || "-",
    pdfUrl: inv.pdfUrl,
  };
}

/** Lo que la lista y la emisión piden igual a la base. */
export async function pedirComprobantes(params: URLSearchParams, signal?: AbortSignal) {
  const res = await fetch(`/api/admin/comprobantes/lista?${params}`, { signal, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { data?: FilaApi[]; total?: number; resumen?: ResumenComprobantes; error?: string };
  return { ok: res.ok, status: res.status, docs: (body.data ?? []).map(aDocumento), total: body.total ?? 0, resumen: body.resumen ?? null, error: body.error ?? null };
}

/** Los comprobantes VIVOS de pedidos (aceptados o esperando a SUNAT), sin filtros de la tabla. */
const PARAMS_VIVOS = new URLSearchParams({ origen: "pedido", estado: "pending,retrying,accepted", limite: "2000" });

/**
 * La lista que usa la EMISIÓN para no emitir dos veces el mismo pedido y para
 * «¿quedó o no?» (F42). Va aparte de la tabla: los filtros de la tabla (período,
 * búsqueda) nunca deben esconderle a la emisión un comprobante vivo. Antes eran
 * los 100 últimos de la tabla: un pedido con su boleta más atrás se veía libre.
 * Se pide al abrir la emisión, no al montar la pestaña.
 */
export function useComprobantesVivos() {
  const [docs, setDocs] = useState<EDocument[]>([]);

  /** Devuelve la lista nueva (o `null` si falló): la emisión la usa para revisar un pedido. */
  const recargar = useCallback(async (): Promise<EDocument[] | null> => {
    try {
      const r = await pedirComprobantes(PARAMS_VIVOS);
      if (!r.ok) return null;
      setDocs(r.docs);
      return r.docs;
    } catch (e) {
      logger.warn("[comprobantes] no se pudo cargar la lista de vivos", { error: String(e) });
      return null;
    }
  }, []);

  return { docs, recargar };
}
