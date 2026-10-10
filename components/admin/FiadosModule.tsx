"use client";

/**
 * «Me deben» (Fiados): quién te debe, cuánto y desde cuándo; cobrar y
 * recordar en un toque. Casa única: Ventas y caja › Me deben (plan «panel
 * unificado», ola 3), donde el cajero cobra el fiado a la caja abierta. Mi
 * Plata muestra el total y enlaza acá; el riesgo de cada cliente («A quién
 * fiarle») vive en Mi Plata y el menú «Más» enlaza allá.
 *
 * 10-10 (Brandon: «cada pestaña cumple su tarea, sin repeticiones»; «sección
 * para pasar de una a otra»): las cuatro pestañas (Resumen, Deudores,
 * Cobranza, Análisis) repetían la lista de quién debe tres veces y las cifras
 * otras tres. Quedan cuatro secciones que no se pisan —Quién debe · Por vencer
 * · Cobrado · Cada fiado— en la fila del título, con las cifras en
 * «Indicadores» y lo de cada tanto en «Más». Mapa en `fiados/secciones.ts`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { SectionTitle } from "@buleje/design-system";
import { Download, FileText, Gauge, MapPin, MoreHorizontal, Plus, RefreshCw, Rows3, Settings2, Store, Target } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";
import { escapeDeLaPaginaConFijado } from "@/hooks/use-ventana-de-modal";
import { formatCurrency } from "@/lib/format";
import { logger } from "@/lib/logger";
import { tenantCacheKey } from "@/lib/tenant-cache";
import { deudoresDeCobranza, ordenarPorUrgencia, type DeudorCobranza } from "@/lib/fiados/urgencia-cobranza";
import ClienteFormModal from "./clientes/ClienteFormModal";
import { useFiados } from "./fiados/use-fiados";
import { useFiadoDerivados } from "./fiados/use-fiado-derivados";
import { useFiadoAcciones } from "./fiados/use-fiado-acciones";
import { useCobroMasivo } from "./fiados/use-cobro-masivo";
import { useClienteResumen } from "./fiados/use-cliente-resumen";
import { useCobranza } from "./fiados/use-cobranza";
import { useFiadoMarketplace } from "./fiados/use-fiado-marketplace";
import { useIndicadoresMeDeben } from "./fiados/use-indicadores-me-deben";
import { exportarDeudores, exportarListaDeCobro } from "./fiados/fiados-exportar";
import { ID_PANEL_ME_DEBEN, SECCIONES_ME_DEBEN, seccionMeDeben } from "./fiados/secciones";
import { FIADO_VISTAS, FIADO_VISTAS_ALIAS, estaAbierto, type Densidad, type Fiado, type FiadoTab } from "./fiados/tipos";

export type { Fiado } from "./fiados/tipos";

const FiadoFormModal = dynamic(() => import("./fiados/FiadoFormModal"), { ssr: false });
const FiadoTendenciaCobroChart = dynamic(() => import("./FiadoTendenciaCobroChart"), {
  ssr: false,
  loading: () => <div className="h-[248px] animate-pulse rounded-xl bg-[var(--color-muted)]" />,
});
const FiadoModals = dynamic(() => import("./fiados/FiadoModals"), { ssr: false });
const CreditRequestsPanel = dynamic(() => import("./fiados/CreditRequestsPanel"), { ssr: false });
const CobranzaView = dynamic(() => import("./fiados/cobranza/CobranzaView"), { ssr: false });
const AgendaCobros = dynamic(() => import("./fiados/AgendaCobros"), { ssr: false });
const CobradoView = dynamic(() => import("./fiados/CobradoView"), { ssr: false });
const FiadosDeudoresTabla = dynamic(() => import("./fiados/FiadosDeudoresTabla"), { ssr: false });
const FiadoDetalleSheet = dynamic(() => import("./fiados/FiadoDetalleSheet"), { ssr: false });
const PagoFiadoModal = dynamic(() => import("./fiados/PagoFiadoModal"), { ssr: false });
const PlantillasModal = dynamic(() => import("./fiados/cobranza/PlantillasModal"), { ssr: false });
const MetaModal = dynamic(() => import("./fiados/cobranza/MetaModal"), { ssr: false });

const DENSIDADES: { id: Densidad; label: string }[] = [
  { id: "compact", label: "Compacta" },
  { id: "normal", label: "Normal" },
  { id: "wide", label: "Amplia" },
];

/** Dónde vivía «A quién fiarle» antes de mudarse a Mi Plata › Por cobrar y pagar (plan, §2.2). */
const ORIGEN_A_QUIEN_FIARLE = ["plata", "scoring", "analytics-pro"] as const;

export default function FiadosModule() {
  const estado = useFiados();
  const { fiados, loading, fetchFiados } = estado;
  const der = useFiadoDerivados(fiados);
  const acc = useFiadoAcciones(fetchFiados);
  const masivo = useCobroMasivo(fiados, fetchFiados);
  const resumenCliente = useClienteResumen(acc.newForm.customerId, acc.showNew, fiados);
  const cob = useCobranza(fiados);
  const mk = useFiadoMarketplace();
  const kpis = useIndicadoresMeDeben(fiados, cob, loading);
  const veAQuienFiarle = usePermisoDe(ORIGEN_A_QUIEN_FIARLE);

  // La sección vive en `?sub=` (el hub ya usa `?vista=`); la memoria es por negocio.
  const { vista: activeTab, irA: setTab } = useSubvistaModulo<FiadoTab>(tenantCacheKey("fiados"), FIADO_VISTAS, "cobranza", undefined, { alias: FIADO_VISTAS_ALIAS });
  const seccion = seccionMeDeben(activeTab);

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

  const deudores = useMemo(() => ordenarPorUrgencia(deudoresDeCobranza(fiados.filter(estaAbierto))), [fiados]);
  const rotas = [...cob.promesas.values()].filter((p) => p.estado === "incumplio").length;
  const secciones = SECCIONES_ME_DEBEN.map((s) => ({ clave: s.clave, rotulo: s.rotulo, cuenta: s.clave === "agenda" ? rotas : undefined }));
  const cobrarCliente = (d: DeudorCobranza) => acc.abrirCobro({ tipo: "cliente", telefono: d.telefono, nombre: d.nombre, saldo: d.saldo });
  const nuevoFiado = () => { acc.setCreateError(null); acc.setShowNew(true); };

  const acciones: MenuAccion[] = [
    { id: "lista", label: "Lista de cobro (PDF)", hint: "Para salir a cobrar: atraso, promesa y casilla", icon: FileText, onSelect: () => { exportarListaDeCobro(deudores, cob.ultimas, cob.promesas).catch((err) => logger.error("[fiados] no se pudo armar la lista de cobro", { error: String(err) })); }, disabled: deudores.length === 0, seccion: "Cobrar" },
    { id: "mensajes", label: "Mensajes por tramo", hint: "Qué se le escribe a cada tramo de atraso", icon: Settings2, onSelect: () => cob.setVerPlantillas(true), seccion: "Cobrar" },
    { id: "meta", label: "Meta de cobro del mes", hint: "La barra de «Cobrado este mes» en Indicadores", icon: Target, meta: cob.meta > 0 ? formatCurrency(cob.meta) : undefined, onSelect: () => cob.setVerMeta(true), seccion: "Cobrar" },
    { id: "mapa", label: "Mapa de deudores", hint: "Dónde viven los que te deben", icon: MapPin, onSelect: () => setShowDebtorsMap(true), seccion: "Ver" },
    ...(veAQuienFiarle
      ? [{ id: "fiarle", label: "A quién fiarle", hint: "En Mi Plata: qué tan seguro es fiarle a cada cliente", icon: Gauge, onSelect: () => { irAEnlace("/admin?tab=plata&vista=scoring"); }, seccion: "Ver" } satisfies MenuAccion]
      : []),
    { id: "excel", label: "Exportar deudores", hint: "Excel con saldos y días", icon: Download, onSelect: () => exportarDeudores(fiados), seccion: "Ver" },
    {
      id: "marketplace", label: "«Acepta fiado» en el marketplace", icon: Store, activo: mk.enabled, busy: mk.saving, disabled: mk.loading || !mk.hasStore,
      hint: mk.hasStore ? "Tu tienda sale con la insignia y en el filtro «Acepta fiado» de /tiendas" : "Publica tu tienda en el marketplace para activarlo",
      onSelect: () => void mk.alternar(), seccion: "Ajustes",
    },
    ...(activeTab === "deudores"
      ? DENSIDADES.map((d): MenuAccion => ({ id: `densidad-${d.id}`, label: `Tabla ${d.label.toLowerCase()}`, icon: Rows3, activo: estado.densidad === d.id, onSelect: () => estado.setDensidad(d.id), seccion: "Ajustes" }))
      : []),
    { id: "actualizar", label: "Actualizar", hint: "Volver a traer fiados y gestiones", icon: RefreshCw, onSelect: () => { void fetchFiados(); void cob.cargarGestiones(); }, seccion: "Ajustes" },
  ];

  const titulo = acc.cobrando?.tipo === "fiado" ? (acc.cobrando.fiado.customerName || acc.cobrando.fiado.customerId) : acc.cobrando?.nombre ?? "";
  const saldoACobrar = acc.cobrando?.tipo === "fiado" ? acc.cobrando.fiado.saldo : acc.cobrando?.saldo ?? 0;

  return (
    <div className="space-y-4">
      {/* Una fila: título · secciones · Indicadores · Nuevo fiado · Más (medido a 1280: 964 px de fila; con
          «Nuevo fiado» y «Más» en texto, Indicadores bajaba a una segunda fila sola). Desde xl no se parte:
          el titular de Indicadores se recorta con «…». En el celular las secciones bajan a su fila. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Me deben</SectionTitle>
          <InfoTip title={seccion.rotulo} what={seccion.ayuda.what} affects={seccion.ayuda.affects} example={seccion.ayuda.example} />
        </div>
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto xl:shrink-0">
          <BarraDeSecciones secciones={secciones} activa={activeTab} onCambiar={setTab} etiqueta="Secciones de Me deben" idPanel={ID_PANEL_ME_DEBEN} />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          {/* Hasta 2xl, sólo el ícono (el nombre va en title y al lector de pantalla). */}
          <button type="button" onClick={nuevoFiado} title="Nuevo fiado" className={button({ variant: "primary", className: "shrink-0 rounded-xl max-2xl:w-12 max-2xl:px-0" })}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="max-2xl:sr-only">Nuevo fiado</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Lista de cobro, mensajes, meta, mapa y ajustes" />
        </div>
      </div>

      {/* Solicitudes de línea de fiado del vecino: sólo aparece si hay pendientes. */}
      <CreditRequestsPanel />

      {kpis.panel}

      {estado.error && fiados.length === 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 py-1 pl-4 pr-1 text-sm font-semibold text-[var(--data-error-ink)]">
          No se pudieron cargar los fiados.
          <button type="button" onClick={() => void fetchFiados()} className="ml-auto h-12 rounded-xl px-4 font-bold hover:bg-[var(--data-error-500)]/10">Reintentar</button>
        </div>
      )}

      <div role="tabpanel" id={ID_PANEL_ME_DEBEN} aria-labelledby={idPestanaDeSeccion(ID_PANEL_ME_DEBEN, activeTab)}>
        {activeTab === "cobranza" && <CobranzaView fiados={fiados} loading={loading} cob={cob} onCobrar={cobrarCliente} onRecordado={fetchFiados} />}
        {activeTab === "agenda" && <AgendaCobros fiados={fiados} cob={cob} onCobrarCliente={cobrarCliente} onVerFiado={acc.openDetail} onRecordado={fetchFiados} />}
        {activeTab === "cobrado" && (
          <CobradoView fiados={fiados} pagosEstaSemana={der.pagosEstaSemana} mejorPagadorMes={der.mejorPagadorMes}
            promedioDiario={der.proyeccionCobro.promedioDiario} diasRestantes={der.proyeccionCobro.diasRestantes}
            onVerFiado={acc.openDetail} Tendencia={FiadoTendenciaCobroChart} />
        )}
        {activeTab === "deudores" && (
          <FiadosDeudoresTabla estado={estado}
            selectedIds={masivo.selectedIds} toggleSelect={masivo.toggleSelect} openDetail={acc.openDetail}
            onNuevo={nuevoFiado} onRecordado={fetchFiados} />
        )}
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

      {cob.verPlantillas && <PlantillasModal plantillas={cob.plantillas} onClose={() => cob.setVerPlantillas(false)} onGuardar={cob.guardarMensajes} />}
      {cob.verMeta && <MetaModal meta={cob.meta} recuperado={cob.recuperado} onClose={() => cob.setVerMeta(false)} onGuardar={cob.guardarMeta} />}

      {/* Alta rápida de cliente desde «Nuevo fiado» (precarga el teléfono tipeado). */}
      <ClienteFormModal isOpen={showQuickClient} onClose={() => setShowQuickClient(false)} onSaved={() => setShowQuickClient(false)} initialFormat="simple" initialPhone={acc.newForm.customerId.trim()} />
    </div>
  );
}
