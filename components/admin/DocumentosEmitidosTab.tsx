'use client';

import { useState, useEffect, useCallback } from "react";
import {
  FileText, Search, Printer, MessageCircle, Eye, Filter, FileSignature, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────

interface Documento {
  id: string;
  tipo: string;
  numero: string;
  cliente: string;
  ruc?: string;
  total: number;
  fecha: string;
  estado: string;
  fuente: string;
}

interface KPIs {
  boletasMes: number;
  facturasMes: number;
  totalFacturado: number;
  docsHoy: number;
}

interface ContratoKPIs {
  total: number;
  activos: number;
  porVencer: number;
  vencidos: number;
  montoTotal: number;
}

type TipoFiltro = "todos" | "boleta" | "factura" | "cotizacion" | "proforma" | "grr" | "nc" | "contrato";

const TIPO_FILTERS: { id: TipoFiltro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "boleta", label: "Boletas" },
  { id: "factura", label: "Facturas" },
  { id: "cotizacion", label: "Cotizaciones" },
  { id: "proforma", label: "Proformas" },
  { id: "grr", label: "Guias" },
  { id: "nc", label: "NC" },
  { id: "contrato", label: "Contratos" },
];

const TIPO_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  boleta: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Boleta" },
  factura: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", label: "Factura" },
  cotizacion: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Cotizacion" },
  proforma: { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-400", label: "Proforma" },
  grr: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", label: "GRR" },
  nc: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "NC" },
  ticket: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-400", label: "Ticket" },
  contrato: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-400", label: "Contrato" },
};

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

// ── Main Component ──────────────────────────────────────────────────────

export default function DocumentosEmitidosTab() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [kpis, setKpis] = useState<KPIs>({ boletasMes: 0, facturasMes: 0, totalFacturado: 0, docsHoy: 0 });
  const [contratoKpis, setContratoKpis] = useState<ContratoKPIs>({ total: 0, activos: 0, porVencer: 0, vencidos: 0, montoTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Fetch contratos KPIs
  const fetchContratoKpis = useCallback(async () => {
    try {
      const res = await fetch("/api/contratos");
      if (res.ok) {
        const data = await res.json();
        if (data.kpis) {
          setContratoKpis(data.kpis);
        }
      }
    } catch {
      // silently fail
    }
  }, []);

  const fetchDocumentos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tipoFiltro !== "todos" && tipoFiltro !== "contrato") params.set("tipo", tipoFiltro);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);

      const res = await fetch(`/api/documentos-emitidos?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        let docs: Documento[] = data.documentos || [];

        // If viewing contratos, fetch from the contratos API
        if (tipoFiltro === "contrato") {
          const cParams = new URLSearchParams();
          if (search.trim()) cParams.set("search", search.trim());
          if (dateFrom) cParams.set("from", dateFrom);
          if (dateTo) cParams.set("to", dateTo);
          const cRes = await fetch(`/api/contratos?${cParams.toString()}`);
          if (cRes.ok) {
            const cData = await cRes.json();
            docs = (cData.contratos || []).map((c: Record<string, unknown>) => ({
              id: c.id,
              tipo: "contrato",
              numero: c.numero,
              cliente: c.clienteNombre,
              ruc: c.clienteDoc,
              total: Number(c.monto) || 0,
              fecha: c.fecha || c.createdAt,
              estado: String(c.estado || "ACTIVO").toLowerCase(),
              fuente: "contratos",
            }));
          }
        }

        setDocumentos(docs);
        setKpis(data.kpis || { boletasMes: 0, facturasMes: 0, totalFacturado: 0, docsHoy: 0 });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [tipoFiltro, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchDocumentos();
    fetchContratoKpis();
  }, [fetchDocumentos, fetchContratoKpis]);

  const handleWhatsApp = (doc: Documento) => {
    const text = `Documento: ${TIPO_BADGES[doc.tipo]?.label || doc.tipo} N° ${doc.numero}\nCliente: ${doc.cliente}\nTotal: ${fmt(doc.total)}\nFecha: ${new Date(doc.fecha).toLocaleDateString("es-PE")}\n\nBuleje - Pucallpa`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Documentos Emitidos
        </h2>
        <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
          Boletas, facturas, cotizaciones, contratos y mas — todo en un lugar
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Boletas del mes</p>
          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400">{kpis.boletasMes}</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Facturas del mes</p>
          <p className="text-xl font-extrabold text-purple-600 dark:text-purple-400">{kpis.facturasMes}</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Total facturado</p>
          <p className="text-xl font-extrabold text-primary">{fmt(kpis.totalFacturado)}</p>
        </div>
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3">
          <p className="text-[10px] font-bold text-gray-400 dark:text-muted uppercase tracking-wider">Documentos hoy</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">{kpis.docsHoy}</p>
        </div>
        {/* Contratos KPI */}
        <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl p-3">
          <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider">Contratos activos</p>
          <p className="text-xl font-extrabold text-violet-600 dark:text-violet-400">{contratoKpis.activos}</p>
          {contratoKpis.porVencer > 0 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-0.5 flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3" />
              {contratoKpis.porVencer} por vencer
            </p>
          )}
        </div>
      </div>

      {/* Contratos Alert Banner */}
      {contratoKpis.porVencer > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {contratoKpis.porVencer} contrato{contratoKpis.porVencer > 1 ? "s" : ""} por vencer en los proximos 30 dias
              </p>
            </div>
          </div>
          <button
            onClick={() => setTipoFiltro("contrato")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
          >
            Ver contratos <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3">
        {/* Type pills */}
        <div className="flex flex-wrap gap-1.5">
          {TIPO_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setTipoFiltro(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                tipoFiltro === f.id
                  ? f.id === "contrato"
                    ? "border-violet-400 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 ring-1 ring-violet-300"
                    : "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "border-gray-200 dark:border-card-border text-gray-400 dark:text-muted hover:border-gray-300"
              )}
            >
              {f.id === "contrato" && <FileSignature className="h-3 w-3 inline mr-1" />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Search + Date range */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por numero o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-sm text-gray-900 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-xs text-gray-700 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border text-xs text-gray-700 dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : documentos.length === 0 ? (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-8 text-center">
          <Filter className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-muted">No hay documentos emitidos para estos filtros</p>
          {tipoFiltro === "contrato" && (
            <p className="text-xs text-gray-400 dark:text-muted mt-1">
              Puedes crear contratos desde el modulo de Contratos
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-card-border bg-gray-50 dark:bg-surface/30">
                  <th className="text-left px-3 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-3 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wider">N Documento</th>
                  <th className="text-left px-3 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Cliente</th>
                  <th className="text-left px-3 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Fecha</th>
                  <th className="text-right px-3 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Total</th>
                  <th className="text-center px-3 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Estado</th>
                  <th className="text-center px-3 py-2.5 font-bold text-gray-500 dark:text-muted uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((doc) => {
                  const badge = TIPO_BADGES[doc.tipo] || TIPO_BADGES.ticket;
                  return (
                    <tr key={`${doc.fuente}-${doc.id}`} className="border-b border-gray-50 dark:border-card-border/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", badge.bg, badge.text)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-gray-900 dark:text-foreground">{doc.numero}</td>
                      <td className="px-3 py-2.5 text-gray-700 dark:text-foreground truncate max-w-[150px]">{doc.cliente}</td>
                      <td className="px-3 py-2.5 text-gray-500 dark:text-muted whitespace-nowrap">
                        {new Date(doc.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-foreground">{doc.total > 0 ? fmt(doc.total) : "-"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          doc.estado === "emitido" || doc.estado === "enviada" || doc.estado === "emitida" || doc.estado === "activo"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : doc.estado === "anulado" || doc.estado === "anulada"
                            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            : doc.estado === "vencido"
                            ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        )}>
                          {doc.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => window.print()}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-muted transition-colors"
                            title="Imprimir"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleWhatsApp(doc)}
                            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 transition-colors"
                            title="Enviar por WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
