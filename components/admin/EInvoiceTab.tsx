"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, MoreHorizontal, Receipt, Search, Send } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { BotonRestablecerColumnas, useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { button } from "@/components/ui-system/button-variants";
import { exportToCSV } from "@/lib/utils";
import { ModalDetalleComprobante } from "./einvoice/ModalDetalleComprobante";
import { ModalEmitirComprobante } from "./einvoice/ModalEmitirComprobante";
import { TablaComprobantes } from "./einvoice/TablaComprobantes";
import {
  calcularStats, COLS_EINVOICE, STATUS_META, TYPE_META,
  type DocStatus, type DocType, type EDocument,
} from "./einvoice/tipos";
import { useComprobantes } from "./einvoice/use-comprobantes";
import { useEmision } from "./einvoice/use-emision";
import EstadoSunatLinea from "@/components/admin/sunat/EstadoSunatLinea";
import { useEstadoSunat } from "@/components/admin/sunat/use-estado-sunat";
import { useIndicadoresComprobantes } from "./einvoice/use-indicadores-comprobantes";

const FILTRO_EN_FILA = "mt-0! min-w-0 flex-1 sm:flex-none [&_summary]:h-12 [&_summary]:rounded-xl";

interface Props {
  /** Lo que el módulo padre suma al menú «Más» (enlaces a donde se mudaron otras pantallas). */
  accionesExtra?: MenuAccion[];
}

export default function EInvoiceTab({ accionesExtra = [] }: Props) {
  const { docs, cargando, recargar } = useComprobantes();
  // El estado de SUNAT se lee una vez: lo usan la línea de arriba y la ventana de emisión.
  const sunat = useEstadoSunat();
  const emision = useEmision(recargar);
  const { abrir: abrirEmision } = emision;

  // Otra pantalla (el «⋯» de un pedido) abre la emisión con `?emitir=<id>`: se lee una vez y se limpia.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("emitir");
    if (!id) return;
    abrirEmision(id);
    url.searchParams.delete("emitir");
    window.history.replaceState(window.history.state, "", url);
  }, [abrirEmision]);
  const [search, setSearch] = useState("");
  // Tipo y Estado: `[]` = todos, admite varios a la vez (Brandon 2026-09-24).
  const [filterType, setFilterType] = useState<DocType[]>([]);
  const [filterStatus, setFilterStatus] = useState<DocStatus[]>([]);
  const [detail, setDetail] = useState<EDocument | null>(null);
  const orden = useOrdenColumnas("einvoice-comprobantes", COLS_EINVOICE);

  const filtered = useMemo(() => {
    let list = [...docs];
    if (filterType.length > 0) list = list.filter(d => filterType.includes(d.type));
    if (filterStatus.length > 0) list = list.filter(d => filterStatus.includes(d.status));
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

  const stats = useMemo(() => calcularStats(docs), [docs]);
  const kpis = useIndicadoresComprobantes(stats, cargando && docs.length === 0);
  const cerrarDetail = useCallback(() => setDetail(null), []);

  const acciones: MenuAccion[] = [
    {
      id: "excel",
      label: "Exportar a Excel",
      hint: `${docs.length} comprobantes`,
      icon: Download,
      disabled: docs.length === 0,
      onSelect: () => exportToCSV(docs.map(d => ({ serie: d.serie, número: d.number, fecha: d.date, tipo: TYPE_META[d.type].label, estado: STATUS_META[d.status].label, cliente: d.clientName, ruc: d.clientRUC, subtotal: d.subtotal, igv: d.igv, total: d.total })), "e-facturacion"),
    },
    ...accionesExtra,
  ];

  const opcionesTipo = (Object.keys(TYPE_META) as DocType[]).map(t => ({ value: t, count: docs.filter(d => d.type === t).length }));
  const opcionesEstado = (Object.keys(STATUS_META) as DocStatus[]).map(s => ({ value: s, count: docs.filter(d => d.status === s).length }));

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Una fila: título · Indicadores · Emitir comprobante · Más. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Facturas y boletas</SectionTitle>
          <InfoTip
            title="Facturas y boletas"
            what="Las boletas, facturas y notas electrónicas que emitiste, con su estado en SUNAT."
            affects="«Pendientes SUNAT» son las que todavía no volvieron con su constancia; «Rechazados», las que SUNAT devolvió."
            example="Emites la factura F001-120 a Ferretería Ucayali por S/ 118: sale con S/ 18 de IGV y queda «Aceptado»."
            side="bottom"
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <button type="button" onClick={() => abrirEmision()} className={button({ variant: "primary", className: "rounded-xl shrink-0" })}>
            <Send className="h-4 w-4" aria-hidden /> Emitir comprobante
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Exportar y otras pantallas de comprobantes, impuestos y cuentas por pagar" />
        </div>
      </div>

      {/* La tarjeta «Modo SUNAT Oficial» completa vive en Configuración › Cobros y comprobantes. */}
      <EstadoSunatLinea carga={sunat} />

      {kpis.panel}

      {stats.rejected > 0 && (
        <div role="alert" className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
          <span className="text-sm font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            {stats.rejected} comprobante{stats.rejected === 1 ? "" : "s"} rechazado{stats.rejected === 1 ? "" : "s"} por SUNAT
          </span>
          <InfoTip what="Revisa los errores y reenvía los documentos corregidos antes de la declaración mensual." side="bottom" />
          <button
            type="button"
            onClick={() => setFilterStatus(["rechazado"])}
            className="ml-auto min-h-12 rounded-xl px-3 text-sm font-semibold text-[var(--data-error-ink)] hover:underline dark:text-[var(--data-error-500)]"
          >
            Ver solo esos
          </button>
        </div>
      )}

      {/* Buscador y filtros en UNA fila, pegados a la tabla que filtran. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cliente, serie, número..."
            aria-label="Buscar comprobante por cliente, serie o número"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)]"
          />
        </div>
        {docs.length > 0 && (
          <>
            <FiltroColumnaMulti label="Tipo" value={filterType} options={opcionesTipo} etiqueta={(v) => TYPE_META[v as DocType]?.label ?? v} onChange={(v) => setFilterType(v as DocType[])} placeholder="Tipo: todos" className={FILTRO_EN_FILA} />
            <FiltroColumnaMulti label="Estado" value={filterStatus} options={opcionesEstado} etiqueta={(v) => STATUS_META[v as DocStatus]?.label ?? v} onChange={(v) => setFilterStatus(v as DocStatus[])} placeholder="Estado: todos" className={FILTRO_EN_FILA} />
          </>
        )}
        <BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} className="h-12!" />
      </div>

      <div className="bg-[var(--surface-raised)] rounded-xl overflow-hidden">
        {docs.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-tertiary)] text-sm border border-[var(--rule-base)] rounded-xl">
            <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" aria-hidden />
            <p className="font-semibold">{cargando ? "Cargando comprobantes…" : "Sin comprobantes emitidos"}</p>
            {!cargando && <p className="mt-1">Con «Emitir comprobante» registras el primero.</p>}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-tertiary)] border border-[var(--rule-base)] rounded-xl">Ningún comprobante coincide con esos filtros.</p>
        ) : (
          <TablaComprobantes docs={filtered} orden={orden} onVer={setDetail} />
        )}
      </div>

      <ModalDetalleComprobante doc={detail} onCerrar={cerrarDetail} />
      <ModalEmitirComprobante emision={emision} docs={docs} sunat={sunat} />
    </div>
  );
}
