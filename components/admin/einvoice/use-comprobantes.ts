"use client";

/**
 * Los comprobantes de Facturas y boletas: la lista tal como la manda el
 * backend. La emisión vive en `use-emision.ts` y, al terminar, vuelve a pedir
 * esta lista: ya no se arma una fila en el navegador con un número inventado
 * (auditoría de comprobantes B2, 17-10).
 */
import { useCallback, useEffect, useState } from "react";
import { formatDateNumeric } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { DocStatus, DocType, EDocument } from "./tipos";

const TYPE_MAP: Record<string, DocType> = {
  factura: "factura",
  nota_credito: "nota-credito",
  "nota-credito": "nota-credito",
  nota_debito: "nota-debito",
  "nota-debito": "nota-debito",
  boleta: "boleta",
};
/** `retrying` = en cola, el sistema lo reenvía solo: antes caía al default y se veía «Emitido» en verde (B1). */
const STATUS_MAP: Record<string, DocStatus> = {
  pending: "pendiente",
  retrying: "pendiente",
  accepted: "aceptado",
  rejected: "rechazado",
  voided: "anulado",
};

type FilaApi = {
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

function aDocumento(inv: FilaApi): EDocument {
  return {
    id: inv.id,
    orderId: inv.orderId ?? null,
    serie: inv.series || (inv.type === "factura" ? "F001" : "B001"),
    number: inv.number != null ? String(inv.number) : "0",
    date: inv.createdAt ? formatDateNumeric(inv.createdAt) : "-",
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

export function useComprobantes() {
  const [docs, setDocs] = useState<EDocument[]>([]);
  const [cargando, setCargando] = useState(true);

  /** Devuelve la lista nueva (o la de antes si falló): la emisión la usa para revisar un pedido. */
  const recargar = useCallback(async (): Promise<EDocument[] | null> => {
    try {
      setCargando(true);
      const res = await fetch("/api/admin/sunat/invoices?limit=100");
      if (!res.ok) return null;
      const data = await res.json();
      // El endpoint devuelve { data: [...] } con campos en inglés
      // (series/number/type/sunatStatus/customerName). Verificado 2026-07-05.
      const lista = ((data.data ?? data.invoices ?? []) as FilaApi[]).map(aDocumento);
      setDocs(lista);
      return lista;
    } catch (e) {
      logger.warn("[comprobantes] no se pudo cargar la lista", { error: String(e) });
      return null;
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar().catch((err: unknown) => logger.warn("[comprobantes] carga inicial", { error: String(err) }));
  }, [recargar]);

  return { docs, cargando, recargar };
}
