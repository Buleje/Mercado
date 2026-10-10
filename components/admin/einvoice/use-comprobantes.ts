"use client";

/**
 * Los comprobantes de Facturas y boletas: la lista que manda el backend y la
 * emisión. Misma lógica y mismos endpoints que tenía EInvoiceTab.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatDateNumeric } from "@/lib/format";
import { EMPTY_FORM, type DocStatus, type DocType, type EDocument, type EmitForm } from "./tipos";

const TYPE_MAP: Record<string, DocType> = {
  factura: "factura",
  nota_credito: "nota-credito",
  "nota-credito": "nota-credito",
  nota_debito: "nota-debito",
  "nota-debito": "nota-debito",
  boleta: "boleta",
};
const STATUS_MAP: Record<string, DocStatus> = {
  pending: "pendiente",
  accepted: "aceptado",
  rejected: "rechazado",
  voided: "anulado",
};

type FilaApi = {
  id: string;
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

export function useComprobantes() {
  const [docs, setDocs] = useState<EDocument[]>([]);
  const [cargando, setCargando] = useState(true);
  const [emitForm, setEmitForm] = useState<EmitForm | null>(null);
  const [emitLoading, setEmitLoading] = useState(false);
  const [emitError, setEmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetch("/api/admin/sunat/invoices?limit=100");
      if (!res.ok) return;
      const data = await res.json();
      // El endpoint devuelve { data: [...] } con campos en inglés
      // (series/number/type/sunatStatus/customerName). Verificado 2026-07-05.
      const invoices = (data.data ?? data.invoices ?? []) as FilaApi[];
      setDocs(invoices.map(inv => ({
        id: inv.id,
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
      })));
    } catch (e) {
      console.error("[EInvoiceTab] no se pudo cargar comprobantes", e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function abrirEmision(orderId = "") {
    setEmitError(null);
    setEmitForm({ ...EMPTY_FORM, orderId });
  }

  function avisar(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function emitir() {
    if (!emitForm) return;
    setEmitLoading(true);
    setEmitError(null);

    const res = await fetch("/api/admin/sunat/generate-invoice", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        orderId: emitForm.orderId,
        tipo: emitForm.tipoDoc === "01" ? "factura" : "boleta",
        clienteNombre: emitForm.clienteNombre,
        clienteDocumento: emitForm.clienteDni || emitForm.clienteRuc || undefined,
        clienteTipoDocumento: emitForm.tipoDoc === "01" ? "RUC" : "DNI",
      }),
    });

    let data: {
      ok?: boolean;
      pdfUrl?: string | null;
      xmlUrl?: string | null;
      hash?: string | null;
      error?: string;
      invoice?: { id: string; serie: string; número: string; total: number; subtotal: number; igv: number };
    };
    try {
      data = await res.json();
    } catch {
      data = { error: "Respuesta inválida del servidor" };
    }

    setEmitLoading(false);

    if (!res.ok || !data.ok) {
      setEmitError(data.error ?? "Error al emitir el comprobante");
      return;
    }

    // Agregar el documento emitido a la tabla local
    const tipo: DocType = emitForm.tipoDoc === "01" ? "factura" : "boleta";
    const serie = data.invoice?.serie || (emitForm.tipoDoc === "01" ? "F001" : "B001");
    const nuevo: EDocument = {
      id: data.invoice?.id || `${serie}-${Date.now()}`,
      serie,
      number: data.invoice?.número || String(Math.floor(Date.now() / 1000) % 99999999).padStart(8, "0"),
      date: formatDateNumeric(new Date()),
      type: tipo,
      status: "emitido",
      clientName: emitForm.clienteNombre,
      clientRUC: emitForm.tipoDoc === "01" ? (emitForm.clienteRuc || "—") : (emitForm.clienteDni || "—"),
      subtotal: data.invoice?.subtotal ?? 0,
      igv: data.invoice?.igv ?? 0,
      total: data.invoice?.total ?? 0,
      items: 0,
      sunatResponse: data.hash ? `Hash: ${data.hash}` : "Emitido vía Nubefact",
      pdfUrl: data.pdfUrl,
    };
    setDocs(prev => [nuevo, ...prev]);
    setEmitForm(null);
    avisar("Comprobante emitido correctamente");
    if (data.pdfUrl) window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
  }

  return { docs, cargando, emitForm, setEmitForm, emitLoading, emitError, toast, abrirEmision, emitir };
}
