"use client";

/**
 * «Me deben» (Fiados): quién te debe, cuánto y desde cuándo; cobrar y
 * recordar en un toque. Casa única: Ventas y caja › Me deben (plan «panel
 * unificado», ola 3), donde el cajero cobra el fiado a la caja abierta. Mi
 * Plata muestra el total y enlaza acá; el riesgo de cada cliente («A quién
 * fiarle») vive en Mi Plata y este módulo enlaza allá.
 *
 * Embebido en el hub, su barra (Resumen, Deudores, Cobranza, Análisis) es el
 * 2.º nivel en `?sub=`. AdminTabBar no dibuja el título de una barra anidada
 * (module-depth > 0), y la vista quedaba sin ninguno (medido: 0 h2): el título
 * va en su propia fila con las acciones, como la banda de un módulo con
 * cuatro pestañas (título … acciones / pestañas).
 *
 * 2026-10-08: partido de 1.449 líneas a este orquestador + `fiados/*`
 * (datos en hooks `use-*`, tabla, ficha, ventana de cobro). Ley de la vista:
 * un título, filtros pegados a la tabla, el resto en el menú.
 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { SectionTitle } from "@buleje/design-system";
import { Download, Gauge, MapPin, Plus, Printer, RefreshCw, Rows3 } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { CLASE_ENLACE_PANEL, EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { escapeDeLaPaginaConFijado } from "@/hooks/use-ventana-de-modal";
import { tenantCacheKey } from "@/lib/tenant-cache";
import ClienteFormModal from "./clientes/ClienteFormModal";
import { useFiados } from "./fiados/use-fiados";
import { useFiadoDerivados } from "./fiados/use-fiado-derivados";
import { useFiadoAcciones } from "./fiados/use-fiado-acciones";
import { useCobroMasivo } from "./fiados/use-cobro-masivo";
import { useClienteResumen } from "./fiados/use-cliente-resumen";
import { exportarDeudores, imprimirListaCobro } from "./fiados/fiados-exportar";
import { FIADO_VISTAS, FIADOS_MODULE_ID, type Densidad, type Fiado, type FiadoTab } from "./fiados/tipos";

export type { Fiado } from "./fiados/tipos";

const FiadoFormModal = dynamic(() => import("./fiados/FiadoFormModal"), { ssr: false });
const FiadoTendenciaCobroChart = dynamic(() => import("./FiadoTendenciaCobroChart"), {
  ssr: false,
  loading: () => <div className="h-[248px] animate-pulse rounded-xl bg-[var(--color-muted)]" />,
});
const FiadoModals = dynamic(() => import("./fiados/FiadoModals"), { ssr: false });
const FiadoStats = dynamic(() => import("./fiados/FiadoStats"), { ssr: false });
const FiadoMarketplaceToggle = dynamic(() => import("./fiados/FiadoMarketplaceToggle"), { ssr: false });
const CreditRequestsPanel = dynamic(() => import("./fiados/CreditRequestsPanel"), { ssr: false });
const FiadoCobranzaView = dynamic(() => import("./fiados/cobranza/CobranzaView"), { ssr: false });
const QuienTeDebe = dynamic(() => import("./fiados/QuienTeDebe"), { ssr: false });
const FiadosDeudoresTabla = dynamic(() => import("./fiados/FiadosDeudoresTabla"), { ssr: false });
const FiadoDetalleSheet = dynamic(() => import("./fiados/FiadoDetalleSheet"), { ssr: false });
const PagoFiadoModal = dynamic(() => import("./fiados/PagoFiadoModal"), { ssr: false });

const DENSIDADES: { id: Densidad; label: string }[] = [
  { id: "compact", label: "Compacta" },
  { id: "normal", label: "Normal" },
  { id: "wide", label: "Amplia" },
];

/** Dónde vivía «A quién fiarle» antes de mudarse a Mi Plata › Por cobrar y pagar (plan, §2.2). */
const ORIGEN_A_QUIEN_FIARLE = ["plata", "scoring", "analytics-pro"] as const;

const BOTON_ICONO = "flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]";

export default function FiadosModule() {
  const estado = useFiados();
  const { fiados, loading, fetchFiados } = estado;
  const der = useFiadoDerivados(fiados);
  const acc = useFiadoAcciones(fetchFiados);
  const masivo = useCobroMasivo(fiados, fetchFiados);
  const resumenCliente = useClienteResumen(acc.newForm.customerId, acc.showNew, fiados);

  // La sub-vista vive en `?sub=` (el hub ya usa `?vista=`); la memoria es por negocio.
  const { vista: activeTab, irA: setTab } = useSubvistaModulo<FiadoTab>(tenantCacheKey("fiados"), FIADO_VISTAS, "resumen");

  const [showQuickClient, setShowQuickClient] = useState(false);
  const [showDebtorsMap, setShowDebtorsMap] = useState(false);
  const [showCompromiso, setShowCompromiso] = useState(false);
  const [compromisoMonto, setCompromisoMonto] = useState("");
  const [compromisoFecha, setCompromisoFecha] = useState("");
  const firmaCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const abrirCompromiso = (f: Fiado) => {
    setShowCompromiso(true);
    setCompromisoMonto(Number(f.saldo).toFixed(2));
    const d = new Date(); d.setDate(d.getDate() + 7);
    setCompromisoFecha(d.toISOString().slice(0, 10));
  };

  // Escape central: cierra la ventana de más arriba primero.
  const { showRecibo, cobrando, showNew, selected } = acc;
  const { showCobroMasivo } = masivo;
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      /* Con un modal fijado y el foco en la página, el Escape es de la página (ADR-420). */
      if (e.key !== "Escape" || escapeDeLaPaginaConFijado()) return;
      if (showDebtorsMap) { setShowDebtorsMap(false); return; }
      if (showCompromiso) { setShowCompromiso(false); return; }
      if (showRecibo) { acc.setShowRecibo(false); return; }
      if (showCobroMasivo) { masivo.setShowCobroMasivo(false); return; }
      if (cobrando) { acc.setCobrando(null); return; }
      if (showNew) { acc.setShowNew(false); return; }
      if (selected) { acc.setSelected(null); return; }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los setters de los hooks son estables
  }, [showDebtorsMap, showCompromiso, showRecibo, showCobroMasivo, cobrando, showNew, selected]);

  const tabs: Array<{ id: FiadoTab; label: string; badge?: number }> = [
    { id: "resumen", label: "Resumen" },
    { id: "deudores", label: "Deudores", badge: der.deudoresCount || undefined },
    { id: "cobranza", label: "Cobranza", badge: der.vencidosTotales || undefined },
    { id: "analisis", label: "Análisis", badge: der.vencidosTotales || undefined },
  ];

  const acciones: MenuAccion[] = [
    { id: "lista", label: "Lista de cobro", hint: "Hoja para salir a cobrar", icon: Printer, onSelect: () => imprimirListaCobro(fiados), seccion: "Imprimir y exportar" },
    { id: "excel", label: "Exportar deudores", hint: "Excel con saldos y días", icon: Download, onSelect: () => exportarDeudores(fiados), seccion: "Imprimir y exportar" },
    { id: "mapa", label: "Mapa de deudores", hint: "Dónde viven los que te deben", icon: MapPin, onSelect: () => setShowDebtorsMap(true), seccion: "Ver" },
    ...(activeTab === "deudores"
      ? DENSIDADES.map((d): MenuAccion => ({ id: `densidad-${d.id}`, label: `Tabla ${d.label.toLowerCase()}`, icon: Rows3, activo: estado.densidad === d.id, onSelect: () => estado.setDensidad(d.id), seccion: "Densidad de la tabla" }))
      : []),
  ];

  const cabecera = (
    <>
      {/* El riesgo de cada cliente se mira en Mi Plata (ScoringCrediticio + riesgo IA).
          Sólo si quien mira puede entrar ahí: el origen de esa vista (regla R2). */}
      <PermisoDe origen={ORIGEN_A_QUIEN_FIARLE}>
        <EnlacePanel href="/admin?tab=plata&vista=scoring" title="En Mi Plata: qué tan seguro es fiarle a cada cliente"
          className={`${CLASE_ENLACE_PANEL} inline-flex min-h-12 items-center gap-1.5 px-1 text-sm`}>
          <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          A quién fiarle
        </EnlacePanel>
      </PermisoDe>
      <button type="button" onClick={fetchFiados} aria-label="Actualizar" title="Actualizar la lista" className={BOTON_ICONO}>
        <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </button>
      <ActionMenu label="Opciones" actions={acciones} soloIcono size="md" className="w-12" />
      {/* «primary» del DS: blanco sobre turquesa da 3,2:1. En el celular, sólo el ícono. */}
      <button type="button" onClick={() => { acc.setCreateError(null); acc.setShowNew(true); }} title="Nuevo fiado"
        className={button({ variant: "primary", className: "rounded-xl max-sm:w-12 max-sm:px-0" })}>
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="max-sm:sr-only">Nuevo fiado</span>
      </button>
    </>
  );

  const titulo = acc.cobrando?.tipo === "fiado" ? (acc.cobrando.fiado.customerName || acc.cobrando.fiado.customerId) : acc.cobrando?.nombre ?? "";
  const saldoACobrar = acc.cobrando?.tipo === "fiado" ? acc.cobrando.fiado.saldo : acc.cobrando?.saldo ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <SectionTitle>Lo que te deben</SectionTitle>
          <InfoTip
            title="Me deben"
            what="Los fiados de tus clientes: quién te debe, cuánto y desde cuándo; cobranza por tramos, riesgo de morosidad y proyección de cobros."
            affects="Cobrar un fiado con la caja abierta entra a esa caja como ingreso."
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">{cabecera}</div>
      </div>

      {/* Solicitudes de línea de fiado del vecino: sólo aparece si hay pendientes. */}
      <CreditRequestsPanel />

      <AdminTabBar moduleId={FIADOS_MODULE_ID} tabs={tabs} activeTab={activeTab} onTabChange={(id) => setTab(id as FiadoTab)} />

      <div role="tabpanel" id={`fiados-panel-${activeTab}`} aria-labelledby={`fiados-tab-${activeTab}`} className="space-y-5">
        {activeTab === "resumen" && !loading && (
          <QuienTeDebe fiados={fiados} onVerTodos={() => setTab("cobranza")} onRecordado={fetchFiados}
            onCobrar={(d) => acc.abrirCobro({ tipo: "cliente", telefono: d.telefono, nombre: d.nombre, saldo: d.saldo })} />
        )}

        <FiadoStats view={activeTab} fiados={fiados} loading={loading} totalSaldo={der.totalSaldo} tendenciaMorosidad={der.tendenciaMorosidad} proyeccionCobro={der.proyeccionCobro} fiadoMasAntiguo={der.fiadoMasAntiguo} pagosEstaSemana={der.pagosEstaSemana} mejorPagadorMes={der.mejorPagadorMes} openDetail={acc.openDetail} search={estado.search} setSearch={estado.setSearch} setSelected={acc.setSelected} statusFilter={estado.statusFilter} setStatusFilter={estado.setStatusFilter} FiadoTendenciaCobro={FiadoTendenciaCobroChart} />

        {activeTab === "cobranza" && <FiadoCobranzaView fiados={fiados} loading={loading} onRecordado={fetchFiados} />}

        {activeTab === "deudores" && (
          <FiadosDeudoresTabla estado={estado} totalSaldo={der.totalSaldo} activosCount={der.activosCount} vencidosCount={der.vencidosCount}
            selectedIds={masivo.selectedIds} toggleSelect={masivo.toggleSelect} openDetail={acc.openDetail}
            onNuevo={() => { acc.setCreateError(null); acc.setShowNew(true); }} onRecordado={fetchFiados} />
        )}

        {/* Configuración del marketplace: abajo del Resumen (se toca una vez, no a diario). */}
        {activeTab === "resumen" && <FiadoMarketplaceToggle />}
      </div>

      <FiadoDetalleSheet selected={acc.selected} onCerrar={() => acc.setSelected(null)} fiados={fiados} detailLoading={acc.detailLoading}
        onCobrar={(f) => acc.abrirCobro({ tipo: "fiado", fiado: f })} onCompromiso={abrirCompromiso} onRecordado={fetchFiados} />

      <PagoFiadoModal abierto={!!acc.cobrando} titulo={titulo} saldo={saldoACobrar} pagando={acc.paying} error={acc.pagoError}
        onCerrar={() => acc.setCobrando(null)} onCobrar={acc.cobrar} />

      <FiadoFormModal showNew={acc.showNew} setShowNew={acc.setShowNew} newForm={acc.newForm} setNewForm={acc.setNewForm} creating={acc.creating} createError={acc.createError} handleCreate={acc.handleCreate} setCreateError={acc.setCreateError} dniPhoto={acc.dniPhoto} setDniPhoto={acc.setDniPhoto} clienteResumen={resumenCliente.clienteResumen} clienteResumenLoading={resumenCliente.clienteResumenLoading} clienteEsNuevo={resumenCliente.clienteEsNuevo} onCrearCliente={() => setShowQuickClient(true)} />

      <FiadoModals
        selected={acc.selected}
        selectedIds={masivo.selectedIds} selectedFiados={masivo.selectedFiados} selectedTotal={masivo.selectedTotal}
        setSelectedIds={masivo.setSelectedIds} showCobroMasivo={masivo.showCobroMasivo} setShowCobroMasivo={masivo.setShowCobroMasivo}
        cobroMonto={masivo.cobroMonto} setCobroMonto={masivo.setCobroMonto} cobroPaying={masivo.cobroPaying}
        cobroError={masivo.cobroError} handleCobroMasivo={masivo.handleCobroMasivo} setCobroError={masivo.setCobroError}
        computeDistribution={masivo.computeDistribution}
        showRecibo={acc.showRecibo} setShowRecibo={acc.setShowRecibo} reciboData={acc.reciboData}
        showCompromiso={showCompromiso} setShowCompromiso={setShowCompromiso}
        compromisoMonto={compromisoMonto} setCompromisoMonto={setCompromisoMonto}
        compromisoFecha={compromisoFecha} setCompromisoFecha={setCompromisoFecha}
        firmaCanvasRef={firmaCanvasRef} isDrawing={isDrawing} setIsDrawing={setIsDrawing}
        showDebtorsMap={showDebtorsMap} setShowDebtorsMap={setShowDebtorsMap}
        fiados={fiados}
      />

      {/* Alta rápida de cliente desde «Nuevo fiado» (precarga el teléfono tipeado). */}
      <ClienteFormModal isOpen={showQuickClient} onClose={() => setShowQuickClient(false)} onSaved={() => setShowQuickClient(false)} initialFormat="simple" initialPhone={acc.newForm.customerId.trim()} />
    </div>
  );
}
