"use client";

import { useState, useMemo } from "react";
import {
  FileText, Download, Search, Eye, X, CheckCircle2,
  XCircle, Clock, Send, AlertTriangle, Receipt, Loader2,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DocType = "boleta" | "factura" | "nota-credito" | "nota-debito";
type DocStatus = "emitido" | "aceptado" | "rechazado" | "anulado" | "pendiente";

type EDocument = {
  id: string;
  serie: string;
  number: string;
  date: string;
  type: DocType;
  status: DocStatus;
  clientName: string;
  clientRUC: string;
  subtotal: number;
  igv: number;
  total: number;
  items: number;
  sunatResponse: string;
  pdfUrl?: string | null;
  relatedDoc?: string;
};

type EmitForm = {
  orderId: string;
  tipoDoc: "01" | "03";
  clienteNombre: string;
  clienteDni: string;
  clienteRuc: string;
  clienteDireccion: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const TYPE_META: Record<DocType, { label: string; color: string; bg: string }> = {
  boleta:         { label: "Boleta",          color: "text-blue-600",     bg: "bg-blue-100 dark:bg-blue-900/30" },
  factura:        { label: "Factura",         color: "text-emerald-600",  bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  "nota-credito": { label: "Nota de crédito", color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  "nota-debito":  { label: "Nota de débito",  color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-900/30" },
};

const STATUS_META: Record<DocStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  emitido:   { label: "Emitido",   color: "text-blue-600",    icon: Send },
  aceptado:  { label: "Aceptado",  color: "text-emerald-600", icon: CheckCircle2 },
  rechazado: { label: "Rechazado", color: "text-red-600",     icon: XCircle },
  anulado:   { label: "Anulado",   color: "text-gray-500",    icon: XCircle },
  pendiente: { label: "Pendiente", color: "text-amber-600",   icon: Clock },
};

const EMPTY_FORM: EmitForm = {
  orderId: "",
  tipoDoc: "03",
  clienteNombre: "",
  clienteDni: "",
  clienteRuc: "",
  clienteDireccion: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function EInvoiceTab() {
  const [docs, setDocs] = useState<EDocument[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<DocType | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<DocStatus | "todos">("todos");
  const [detail, setDetail] = useState<EDocument | null>(null);

  // Emisión
  const [emitForm, setEmitForm] = useState<EmitForm | null>(null);
  const [emitLoading, setEmitLoading] = useState(false);
  const [emitError, setEmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...docs];
    if (filterType !== "todos") list = list.filter(d => d.type === filterType);
    if (filterStatus !== "todos") list = list.filter(d => d.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.clientName.toLowerCase().includes(q) ||
        d.number.includes(q) ||
        d.serie.toLowerCase().includes(q),
      );
    }
    return list;
  }, [docs, filterType, filterStatus, search]);

  const stats = useMemo(() => {
    const totalEmitted = docs.filter(d => !["anulado"].includes(d.status)).reduce((s, d) => s + d.total, 0);
    const totalIGV = docs.filter(d => !["anulado"].includes(d.status)).reduce((s, d) => s + d.igv, 0);
    const pending = docs.filter(d => d.status === "pendiente").length;
    const rejected = docs.filter(d => d.status === "rechazado").length;
    return { totalEmitted, totalIGV, pending, rejected, total: docs.length };
  }, [docs]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function openEmitModal(orderId = "") {
    setEmitError(null);
    setEmitForm({ ...EMPTY_FORM, orderId });
  }

  async function handleEmitir() {
    if (!emitForm) return;
    setEmitLoading(true);
    setEmitError(null);

    const res = await fetch("/api/invoices/emit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: emitForm.orderId,
        tipoDoc: emitForm.tipoDoc,
        clienteNombre: emitForm.clienteNombre,
        clienteDni: emitForm.clienteDni || undefined,
        clienteRuc: emitForm.clienteRuc || undefined,
        clienteDireccion: emitForm.clienteDireccion || undefined,
      }),
    });

    const data = await res.json() as {
      ok?: boolean;
      pdfUrl?: string | null;
      xmlUrl?: string | null;
      hash?: string | null;
      error?: string;
    };

    setEmitLoading(false);

    if (!res.ok || !data.ok) {
      setEmitError(data.error ?? "Error al emitir el comprobante");
      return;
    }

    // Agregar el documento emitido a la tabla local
    const tipo: DocType = emitForm.tipoDoc === "01" ? "factura" : "boleta";
    const serie = emitForm.tipoDoc === "01" ? "F001" : "B001";
    const newDoc: EDocument = {
      id: `${serie}-${Date.now()}`,
      serie,
      number: String(Math.floor(Date.now() / 1000) % 99999999).padStart(8, "0"),
      date: new Date().toLocaleDateString("es-PE"),
      type: tipo,
      status: "emitido",
      clientName: emitForm.clienteNombre,
      clientRUC: emitForm.tipoDoc === "01" ? (emitForm.clienteRuc || "—") : (emitForm.clienteDni || "—"),
      subtotal: 0,
      igv: 0,
      total: 0,
      items: 0,
      sunatResponse: data.hash ? `Hash: ${data.hash}` : "Emitido vía Nubefact",
      pdfUrl: data.pdfUrl,
    };
    setDocs(prev => [newDoc, ...prev]);
    setEmitForm(null);

    showToast("Comprobante emitido correctamente");

    if (data.pdfUrl) {
      window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {toast}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Facturación Electrónica
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Comprobantes electrónicos SUNAT — Boletas, facturas, notas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEmitModal()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Send className="h-4 w-4" /> Emitir comprobante
          </button>
          <button
            onClick={() => exportToCSV(docs.map(d => ({ serie: d.serie, numero: d.number, fecha: d.date, tipo: TYPE_META[d.type].label, estado: STATUS_META[d.status].label, cliente: d.clientName, ruc: d.clientRUC, subtotal: d.subtotal, igv: d.igv, total: d.total })), "e-facturacion")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
          >
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total emitido", value: fmt(stats.totalEmitted), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "IGV acumulado", value: fmt(stats.totalIGV), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Pendientes SUNAT", value: String(stats.pending), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Rechazados", value: String(stats.rejected), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* IGV summary card */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5">
        <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-primary" /> Resumen tributario del mes
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-sm">
          <div><p className="text-xs text-gray-400">Boletas emitidas</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "boleta").length}</p></div>
          <div><p className="text-xs text-gray-400">Facturas emitidas</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "factura").length}</p></div>
          <div><p className="text-xs text-gray-400">Notas de crédito</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "nota-credito").length}</p></div>
          <div><p className="text-xs text-gray-400">Notas de débito</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "nota-debito").length}</p></div>
        </div>
      </div>

      {stats.rejected > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Hay {stats.rejected} comprobante(s) rechazados por SUNAT</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">Revise los errores y reenvíe los documentos corregidos antes de la declaración mensual.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cliente, serie, número..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground"
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value as DocType | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {(Object.keys(TYPE_META) as DocType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as DocStatus | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as DocStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Documents table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        {docs.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-muted text-sm">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Sin comprobantes emitidos</p>
            <p className="text-xs mt-1">Usa el botón &quot;Emitir comprobante&quot; para registrar el primer comprobante electrónico.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface">
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Serie-Nro</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Fecha</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Tipo</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Cliente</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Total</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const StatusIcon = STATUS_META[d.status].icon;
                  return (
                    <tr key={d.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20 transition-colors">
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono font-bold text-gray-800 dark:text-foreground">{d.serie}-{d.number}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500">{d.date}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", TYPE_META[d.type].bg, TYPE_META[d.type].color)}>
                          {TYPE_META[d.type].label}
                        </span>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 dark:text-foreground">
                        {d.clientName}<br />
                        <span className="text-xs text-gray-400">{d.clientRUC}</span>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{fmt(d.total)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <span className={cn("flex items-center gap-1 text-xs font-bold", STATUS_META[d.status].color)}>
                          <StatusIcon className="h-3 w-3" />{STATUS_META[d.status].label}
                        </span>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2">
                        <button onClick={() => setDetail(d)} className="text-primary hover:underline text-xs font-bold">
                          <Eye className="h-3.5 w-3.5 inline" />
                        </button>
                        {d.pdfUrl && (
                          <a
                            href={d.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-emerald-600 hover:underline"
                            title="Ver PDF"
                          >
                            PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.serie}-{detail.number}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {([
                ["Tipo", TYPE_META[detail.type].label],
                ["Fecha", detail.date],
                ["Cliente", detail.clientName],
                ["RUC/DNI", detail.clientRUC],
                ["Subtotal", fmt(detail.subtotal)],
                ["IGV (18%)", fmt(detail.igv)],
                ["Total", fmt(detail.total)],
                ["Items", String(detail.items)],
                ["Estado", STATUS_META[detail.status].label],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-bold text-gray-800 dark:text-foreground">{v}</p></div>
              ))}
              {detail.relatedDoc && (
                <div><p className="text-xs text-gray-400">Doc. relacionado</p><p className="font-bold text-gray-800 dark:text-foreground">{detail.relatedDoc}</p></div>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Respuesta SUNAT</p>
              <p className="text-sm text-gray-700 dark:text-foreground bg-gray-50 dark:bg-surface rounded-xl p-3 font-mono text-xs">{detail.sunatResponse}</p>
            </div>
            {detail.pdfUrl && (
              <a
                href={detail.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                <Download className="h-4 w-4" /> Descargar PDF
              </a>
            )}
          </div>
        </div>
      )}

      {/* Emit modal */}
      {emitForm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !emitLoading && setEmitForm(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" /> Emitir comprobante SUNAT
              </h3>
              {!emitLoading && (
                <button onClick={() => setEmitForm(null)}>
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              {/* Tipo de comprobante */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1 block">Tipo de comprobante</label>
                <select
                  value={emitForm.tipoDoc}
                  onChange={e => setEmitForm(f => f && { ...f, tipoDoc: e.target.value as "01" | "03" })}
                  className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
                >
                  <option value="03">Boleta (B001)</option>
                  <option value="01">Factura (F001)</option>
                </select>
              </div>

              {/* ID del pedido */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1 block">ID del pedido</label>
                <input
                  value={emitForm.orderId}
                  onChange={e => setEmitForm(f => f && { ...f, orderId: e.target.value })}
                  placeholder="ej. cm3abc123..."
                  className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
                />
              </div>

              {/* Nombre del cliente */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1 block">Nombre del cliente</label>
                <input
                  value={emitForm.clienteNombre}
                  onChange={e => setEmitForm(f => f && { ...f, clienteNombre: e.target.value })}
                  placeholder="Nombre o razón social"
                  className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
                />
              </div>

              {/* DNI o RUC según tipo */}
              {emitForm.tipoDoc === "03" ? (
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1 block">DNI <span className="font-normal">(opcional)</span></label>
                  <input
                    value={emitForm.clienteDni}
                    onChange={e => setEmitForm(f => f && { ...f, clienteDni: e.target.value })}
                    placeholder="12345678"
                    maxLength={8}
                    className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1 block">RUC</label>
                  <input
                    value={emitForm.clienteRuc}
                    onChange={e => setEmitForm(f => f && { ...f, clienteRuc: e.target.value })}
                    placeholder="20123456789"
                    maxLength={11}
                    className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
                  />
                </div>
              )}

              {/* Dirección */}
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted mb-1 block">Dirección <span className="font-normal">(opcional)</span></label>
                <input
                  value={emitForm.clienteDireccion}
                  onChange={e => setEmitForm(f => f && { ...f, clienteDireccion: e.target.value })}
                  placeholder="Av. Centenario 123, Pucallpa"
                  className="w-full text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground"
                />
              </div>
            </div>

            {emitError && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-3 text-xs text-red-700 dark:text-red-400 font-semibold flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {emitError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEmitForm(null)}
                disabled={emitLoading}
                className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-card-border text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmitir}
                disabled={emitLoading || !emitForm.orderId.trim() || !emitForm.clienteNombre.trim()}
                className="flex-1 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {emitLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo...</>
                ) : (
                  <><Send className="h-4 w-4" /> Emitir</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
