"use client";

/**
 * Compras › Órdenes y recepción › Recepciones: lo que llegó de cada proveedor,
 * con o sin orden, y «Recibir mercadería». Partido el 10-10 (887 líneas → piezas
 * en `ordenes-compra/recepciones/`) con la misma lógica y el mismo guardado;
 * la vista sigue el patrón del panel: cabecera en una fila, indicadores
 * plegables, filtros en una fila pegada a la tabla.
 */
import { useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, PackageCheck, RotateCcw, ScanLine } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { exportToCSV } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import AvisoCreditoRecepcion from "@/components/admin/cuentas-por-pagar/AvisoCreditoRecepcion";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import CabeceraOrdenes from "@/components/admin/ordenes-compra/CabeceraOrdenes";
import { STATUS_MAP, type Reception } from "@/components/admin/ordenes-compra/recepciones/tipos";
import { useRecepciones } from "@/components/admin/ordenes-compra/recepciones/use-recepciones";
import { useNuevaRecepcion } from "@/components/admin/ordenes-compra/recepciones/use-nueva-recepcion";
import RecepcionesFiltros from "@/components/admin/ordenes-compra/recepciones/RecepcionesFiltros";
import RecepcionesTabla from "@/components/admin/ordenes-compra/recepciones/RecepcionesTabla";
import RecepcionDetalle from "@/components/admin/ordenes-compra/recepciones/RecepcionDetalle";
import NuevaRecepcion from "@/components/admin/ordenes-compra/recepciones/NuevaRecepcion";

const AYUDA = {
  title: "Recepciones",
  what: "Cada vez que llegó mercadería: de quién, contra qué orden, quién la revisó y qué llegó mal o no llegó.",
  affects: "Recibir suma al stock con su costo y, si es contra una orden, la pasa a parcial o recibida. Lo dañado, vencido o faltante baja de lo que le debes al proveedor.",
  example: "Llegaron 37 de 40 atunes y 2 abollados: «Recibir mercadería», eliges la orden y marcas 35 OK + 2 dañados + 3 faltantes.",
};

const TARJETAS = [
  { clave: "scheduled", rotulo: "Programadas", icono: ClipboardList },
  { clave: "inProgress", rotulo: "En proceso", icono: ScanLine },
  { clave: "accepted", rotulo: "Aceptadas", icono: CheckCircle2 },
  { clave: "totalNonConf", rotulo: "No conformidades", icono: AlertTriangle },
] as const;

export default function ReceivingTab({ barra }: { barra?: ReactNode }) {
  const r = useRecepciones();
  const { receptions, setReceptions, loading, stats, ordenRecepciones, proveedorIdDe, products, supplierNames } = r;
  const n = useNuevaRecepcion(setReceptions);
  const { setShowNew, showNew, avisoCredito, setAvisoCredito } = n;

  const [detail, setDetail] = useState<Reception | null>(null);
  const detailTitleId = useId();
  const detailPanelRef = useRef<HTMLDivElement>(null);
  useModalAccesible(detailPanelRef, { onCerrar: () => setDetail(null), activo: !!detail });
  const ventanaDetalle = useVentanaDeModal(!!detail, { ref: detailPanelRef, aplicarTranslate: true, claveMemoria: "recepcion-detalle" });

  const kpis = useKpisPlegables({
    claveMemoria: "compras-recepciones",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && receptions.length === 0,
    /* Lo que pide mirar: las no conformidades; sin ninguna, cuántas hay. Corto: la fila del título va llena. */
    resumen: stats.totalNonConf > 0 ? `${stats.totalNonConf} con NC` : `${receptions.length} recepciones`,
    tarjetas: TARJETAS.map(({ clave, rotulo, icono: Icono }) => (
      <div key={clave} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        </div>
        <p className={`text-lg font-extrabold tabular-nums ${clave === "totalNonConf" && stats.totalNonConf > 0 ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]"}`}>
          {stats[clave]}
        </p>
      </div>
    )),
  });

  const acciones: MenuAccion[] = [
    {
      id: "csv",
      label: "Descargar CSV",
      hint: `${receptions.length} recepciones`,
      icon: Download,
      disabled: receptions.length === 0,
      onSelect: () => exportToCSV(receptions.map(rec => ({
        ref: rec.ref, oc: rec.orderRef, proveedor: rec.supplier,
        programada: rec.scheduledDate, recibida: rec.receivedDate ?? "-",
        estado: STATUS_MAP[rec.status].label, inspector: rec.inspector,
        items: rec.items.length, fotos: rec.photos, no_conformidades: rec.nonConformities,
      })), "recepciones"),
    },
    {
      id: "columnas",
      label: "Restablecer columnas",
      hint: "El orden de siempre (arrastraste un título)",
      icon: RotateCcw,
      disabled: !ordenRecepciones.cambiado,
      onSelect: ordenRecepciones.restablecer,
    },
  ];

  return (
    <div className="space-y-4">
      <CabeceraOrdenes
        barra={barra}
        ayuda={AYUDA}
        indicadores={kpis.boton}
        principal={
          <button type="button" onClick={() => setShowNew(true)} title="Recibir mercadería, con o sin orden" className={button({ variant: "primary", className: "shrink-0 rounded-xl px-4" })}>
            <PackageCheck className="h-4 w-4" aria-hidden /> Recibir
          </button>
        }
        acciones={acciones}
        tituloMenu="Descargar CSV y restablecer columnas"
      />

      {kpis.panel}

      {avisoCredito && <AvisoCreditoRecepcion credito={avisoCredito} proveedor={avisoCredito.proveedor} onCerrar={() => setAvisoCredito(null)} />}

      <RecepcionesFiltros r={r} />

      <RecepcionesTabla r={r} onVer={setDetail} />

      {detail && (
        <RecepcionDetalle
          detail={detail}
          setDetail={setDetail}
          detailPanelRef={detailPanelRef}
          detailTitleId={detailTitleId}
          ventanaDetalle={ventanaDetalle}
          proveedorIdDe={proveedorIdDe}
        />
      )}

      {showNew && <NuevaRecepcion n={n} products={products} supplierNames={supplierNames} />}
    </div>
  );
}
