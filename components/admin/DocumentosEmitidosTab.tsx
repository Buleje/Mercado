'use client';

import { SectionTitle } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

import { useState, useEffect, useCallback } from "react";
import {
  FileText, Search, Printer, MessageCircle, Eye, Filter, FileSignature, ArrowRight, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────

interface Documento {
  id: string;
  tipo: string;
  número: string;
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
  boleta: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", label: "Boleta" },
  factura: { bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", label: "Factura" },
  cotizacion: { bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", text: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", label: "Cotizacion" },
  proforma: { bg: "bg-[var(--data-info-100)] dark:bg-[var(--data-info-500)]/30", text: "text-[var(--data-info-500)] dark:text-[var(--data-info-500)]", label: "Proforma" },
  grr: { bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", text: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", label: "GRR" },
  nc: { bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30", text: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]", label: "NC" },
  ticket: { bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)]", label: "Ticket" },
  contrato: { bg: "bg-[var(--surface-sunken)]", text: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", label: "Contrato" },
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
              número: c.número,
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
    const text = `Documento: ${TIPO_BADGES[doc.tipo]?.label || doc.tipo} N° ${doc.número}\nCliente: ${doc.cliente}\nTotal: ${fmt(doc.total)}\nFecha: ${new Date(doc.fecha).toLocaleDateString("es-PE")}\n\nBuleje - Pucallpa`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        icon={FileText}
        eyebrow="Ventas · Documentos SUNAT"
        title="Documentos emitidos"
        description="Boletas, facturas, cotizaciones, guías de remisión y contratos — todo en un solo lugar, listos para enviar al cliente."
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3">
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted">Boletas del mes</p>
          <p className="text-xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{kpis.boletasMes}</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3">
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted">Facturas del mes</p>
          <p className="text-xl font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{kpis.facturasMes}</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3">
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted">Total facturado</p>
          <p className="text-xl font-extrabold text-primary">{fmt(kpis.totalFacturado)}</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3">
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted">Documentos hoy</p>
          <p className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">{kpis.docsHoy}</p>
        </div>
        {/* Contratos KPI */}
        <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3">
          <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Contratos activos</p>
          <p className="text-xl font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">{contratoKpis.activos}</p>
          {contratoKpis.porVencer > 0 && (
            <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-bold mt-0.5 flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3" />
              {contratoKpis.porVencer} por vencer
            </p>
          )}
        </div>
      </div>

      {/* Contratos Alert Banner */}
      {contratoKpis.porVencer > 0 && (
        <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
            <div>
              <p className="text-sm font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                {contratoKpis.porVencer} contrato{contratoKpis.porVencer > 1 ? "s" : ""} por vencer en los proximos 30 dias
              </p>
            </div>
          </div>
          <button
            onClick={() => setTipoFiltro("contrato")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-xs font-bold hover:bg-[var(--data-warning-500)] dark:hover:bg-[var(--data-warning-500)]/50 transition-colors"
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
                    ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] ring-1 ring-[var(--rule-base)]"
                    : "border-primary bg-primary/10 text-primary ring-1 ring-primary/20"
                  : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-tertiary)] dark:text-muted hover:border-gray-300"
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-xs text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-xs text-[var(--text-primary)] dark:text-foreground bg-white dark:bg-card outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-[var(--surface-sunken)] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : documentos.length === 0 ? (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-8 text-center">
          <Filter className="h-8 w-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">No hay documentos emitidos para estos filtros</p>
          {tipoFiltro === "contrato" && (
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-1">
              Puedes crear contratos desde el modulo de Contratos
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] dark:border-card-border bg-[var(--surface-alt)] dark:bg-surface/30">
                  <th className="text-left px-3 py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">Tipo</th>
                  <th className="text-left px-3 py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">N Documento</th>
                  <th className="text-left px-3 py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">Cliente</th>
                  <th className="text-left px-3 py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
                  <th className="text-right px-3 py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">Total</th>
                  <th className="text-center px-3 py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                  <th className="text-center px-3 py-2.5 font-bold text-[var(--text-secondary)] dark:text-muted">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((doc) => {
                  const badge = TIPO_BADGES[doc.tipo] || TIPO_BADGES.ticket;
                  return (
                    <tr key={`${doc.fuente}-${doc.id}`} className="border-b border-gray-50 dark:border-card-border/50 hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 transition-colors">
                      <td className="px-3 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", badge.bg, badge.text)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-[var(--text-primary)] dark:text-foreground">{doc.número}</td>
                      <td className="px-3 py-2.5 text-[var(--text-primary)] dark:text-foreground truncate max-w-[150px]">{doc.cliente}</td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)] dark:text-muted whitespace-nowrap">
                        {new Date(doc.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-[var(--text-primary)] dark:text-foreground">{doc.total > 0 ? fmt(doc.total) : "-"}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold",
                          doc.estado === "emitido" || doc.estado === "enviada" || doc.estado === "emitida" || doc.estado === "activo"
                            ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                            : doc.estado === "anulado" || doc.estado === "anulada"
                            ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                            : doc.estado === "vencido"
                            ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                        )}>
                          {doc.estado}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => window.print()}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/10 text-[var(--text-secondary)] dark:text-muted transition-colors"
                            title="Imprimir"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleWhatsApp(doc)}
                            className="p-1.5 rounded-lg hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] transition-colors"
                            title="Enviar por WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded-lg hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] transition-colors"
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
