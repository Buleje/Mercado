"use client";

/**
 * Comprobantes › Facturas y boletas. UN alcance (F36: período, búsqueda,
 * tipo, estado, origen) manda sobre la tabla, las cifras y el Excel; el
 * buscador va a la base (F34), las cifras dicen su período y abren sus
 * documentos (F38), las acciones del «Más» se pueden fijar por persona (F33) y
 * «/» y «N» son atajos que sólo buscan o ABREN la emisión (F37).
 * La emisión revisa contra la lista de comprobantes vivos SIN filtro: un
 * filtro de la tabla nunca esconde una boleta ya emitida de un pedido.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, Keyboard, ListChecks, MoreHorizontal, Pin, Receipt, Scale, Send } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BotonesFijados, ElegirAccesosFijos } from "@/components/admin/shared/accesos-fijos/AccesosFijos";
import { useAccesosFijos } from "@/components/admin/shared/accesos-fijos/use-accesos-fijos";
import { BotonRestablecerColumnas, useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { button } from "@/components/ui-system/button-variants";
import EstadoSunatLinea from "@/components/admin/sunat/EstadoSunatLinea";
import { useEstadoSunat } from "@/components/admin/sunat/use-estado-sunat";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { esPeriodo, rangoDePeriodo } from "@/lib/comprobantes/periodo";
import { exportToCSV } from "@/lib/utils";
import { FiltrosComprobantes as BarraFiltros } from "./einvoice/FiltrosComprobantes";
import { ModalDetalleComprobante } from "./einvoice/ModalDetalleComprobante";
import { ModalEmitirComprobante } from "./einvoice/ModalEmitirComprobante";
import { TablaComprobantes } from "./einvoice/TablaComprobantes";
import { esAlcanceInicial, estadosDeParam, FILTROS_INICIALES, type FiltrosComprobantes } from "./einvoice/filtros-comprobantes";
import { useParamsDeUnaVez } from "./einvoice/param-de-url";
import { COLS_EINVOICE, STATUS_META, TYPE_META, type EDocument } from "./einvoice/tipos";
import { useAtajosComprobantes } from "./einvoice/use-atajos-comprobantes";
import { useComprobantesVivos } from "./einvoice/use-comprobantes";
import { useEmision } from "./einvoice/use-emision";
import { useIndicadoresComprobantes } from "./einvoice/use-indicadores-comprobantes";
import { FILAS_EXCEL, useFacetasComprobantes, useListaComprobantes } from "./einvoice/use-lista-comprobantes";

/** Otras pantallas abren esta con `?emitir=<pedido>`, `?buscar=`, `?estado=` o `?periodo=` (se leen una vez). */
const PARAMS_URL = ["emitir", "buscar", "estado", "periodo"] as const;
/** Lo que se puede fijar al lado del «Más» (las mudanzas llegan del módulo padre). */
const FIJABLES = ["excel", "pendientes", "conciliacion", "ir-compras-cuentas-por-pagar", "ir-plata-impuestos"] as const;
const ir = (params: Record<string, string>) => irAEnlace(hrefDeDestino({ tab: "facturacion", params }));

interface Props {
  /** Lo que el módulo padre suma al menú «Más» (enlaces a donde se mudaron otras pantallas). */
  accionesExtra?: MenuAccion[];
}

export default function EInvoiceTab({ accionesExtra = [] }: Props) {
  const [filtros, setFiltros] = useState<FiltrosComprobantes>(FILTROS_INICIALES);
  const lista = useListaComprobantes(filtros);
  const { recargar: recargarLista } = lista;
  const facetas = useFacetasComprobantes(filtros, lista.resumen);
  const { docs: vivos, recargar: recargarVivos } = useComprobantesVivos();
  // El estado de SUNAT se lee una vez: lo usan la línea de arriba y la ventana de emisión.
  const sunat = useEstadoSunat();
  /* La emisión revisa contra los vivos (sin filtro) y refresca también la tabla. */
  const recargarAmbas = useCallback(async () => {
    recargarLista();
    return recargarVivos();
  }, [recargarLista, recargarVivos]);
  const emision = useEmision(recargarAmbas);
  const { abrir: abrirEmision, abierto: emisionAbierta } = emision;
  useEffect(() => {
    if (emisionAbierta) void recargarVivos();
  }, [emisionAbierta, recargarVivos]);

  useParamsDeUnaVez(PARAMS_URL, (v) => {
    if (v.buscar || v.estado || v.periodo) {
      setFiltros({
        ...FILTROS_INICIALES,
        q: (v.buscar ?? "").slice(0, 80),
        estados: estadosDeParam(v.estado ?? null),
        /* Un documento puntual (desde la bandeja o un expediente) puede ser de otro mes. */
        periodo: esPeriodo(v.periodo) ? v.periodo : v.buscar ? "todo" : FILTROS_INICIALES.periodo,
      });
    }
    if (v.emitir) abrirEmision(v.emitir);
  });

  const [detail, setDetail] = useState<EDocument | null>(null);
  const [elegirFijos, setElegirFijos] = useState(false);
  const [avisoExcel, setAvisoExcel] = useState<string | null>(null);
  const orden = useOrdenColumnas("einvoice-comprobantes", COLS_EINVOICE);
  const fijos = useAccesosFijos("comprobantes-acciones-fijadas", FIJABLES, 3);
  const refBuscar = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const cerrarDetail = useCallback(() => setDetail(null), []);

  const enfocarBuscar = useCallback(() => {
    refBuscar.current?.focus();
    refBuscar.current?.select();
  }, []);
  const abrirNueva = useCallback(() => abrirEmision(), [abrirEmision]);
  const atajos = useAtajosComprobantes({ buscar: enfocarBuscar, emitir: abrirNueva }, raiz);

  const periodo = filtros.periodo;
  const rango = useMemo(() => rangoDePeriodo(periodo), [periodo]);
  const kpis = useIndicadoresComprobantes({
    resumen: lista.resumen,
    rango,
    sinDatosAun: lista.cargando && !lista.resumen,
    onAbrir: (a) => setFiltros((f) => ({ ...f, ...a })),
  });

  const exportar = async () => {
    setAvisoExcel(null);
    const filas = await lista.paraExcel();
    if (!filas) {
      setAvisoExcel("No se pudo traer los comprobantes para el Excel. Intenta de nuevo.");
      return;
    }
    exportToCSV(
      filas.map((d) => ({
        serie: d.serie, número: d.number, fecha: d.creado || d.date, tipo: TYPE_META[d.type].label, estado: STATUS_META[d.status].label,
        cliente: d.clientName, ruc: d.clientRUC, subtotal: d.subtotal, igv: d.igv, total: d.total, pedido: d.orderId ? `#${d.orderId.slice(-6)}` : "",
      })),
      `comprobantes-${periodo}`,
    );
  };

  const total = lista.total;
  const acciones: MenuAccion[] = [
    {
      id: "excel",
      label: "Exportar a Excel",
      hint: total > FILAS_EXCEL ? `Los ${FILAS_EXCEL} más recientes de ${total} del alcance` : `${total} del alcance (los mismos filtros de la tabla)`,
      icon: Download,
      disabled: total === 0,
      onSelect: () => void exportar(),
    },
    { id: "pendientes", label: "Pendientes de comprobantes", hint: "Rechazos, sin respuesta, borradores y pedidos sin boleta", icon: ListChecks, onSelect: () => ir({ vista: "seguimiento", sub: "pendientes" }) },
    { id: "conciliacion", label: "Conciliación del período", hint: "Lo vendido frente a lo facturado y lo cobrado", icon: Scale, onSelect: () => ir({ vista: "seguimiento", sub: "conciliacion" }) },
    ...accionesExtra,
    { id: "fijar", label: "Elegir accesos fijos", hint: "Hasta 3 a un clic, al lado de «Más»", icon: Pin, disabled: !fijos.listo, onSelect: () => setElegirFijos(true) },
    { id: "atajos", label: atajos.activos ? "Apagar atajos de teclado" : "Encender atajos de teclado", hint: "«/» busca · «N» abre Emitir", icon: Keyboard, onSelect: atajos.alternar },
  ];
  const fijables = acciones.filter((a) => (FIJABLES as readonly string[]).includes(a.id));

  const rechazados = facetas?.rechazados ?? 0;
  const soloRechazados = filtros.estados.length === 1 && filtros.estados[0] === "rechazado";
  const inicial = esAlcanceInicial(filtros);

  return (
    <div ref={raiz} className="space-y-3 sm:space-y-4">
      {/* Una fila: título · Indicadores · accesos fijos · Emitir comprobante · Más. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Facturas y boletas</SectionTitle>
          <InfoTip
            title="Facturas y boletas"
            what="Sólo comprobantes electrónicos (los que van a SUNAT). Las notas internas, las guías y los tickets del mostrador viven en sus pestañas y en el expediente, marcados «Interno»."
            affects="El período y los filtros mandan sobre la tabla, las cifras y el Excel. Atajos: «/» busca y «N» abre Emitir; ninguno emite."
            example="Emites la factura F001-120 a Ferretería Ucayali por S/ 118: sale con S/ 18 de IGV y queda «Aceptado»."
            side="bottom"
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <BotonesFijados acciones={fijables} fijados={fijos.fijados} prefijoQa="comprobantes" />
          <button
            type="button"
            onClick={() => abrirEmision()}
            aria-keyshortcuts={atajos.activos ? "n" : undefined}
            className={button({ variant: "primary", className: "rounded-xl shrink-0" })}
          >
            <Send className="h-4 w-4" aria-hidden /> Emitir comprobante
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Exportar, pendientes, conciliación y accesos fijos" />
        </div>
      </div>

      {/* La tarjeta «Modo SUNAT Oficial» completa vive en Configuración › Cobros y comprobantes. */}
      <EstadoSunatLinea carga={sunat} />

      {kpis.panel}

      {rechazados > 0 && (
        <div role="alert" className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
          <span className="text-sm font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            {rechazados} comprobante{rechazados === 1 ? "" : "s"} rechazado{rechazados === 1 ? "" : "s"} por SUNAT en este alcance
          </span>
          <InfoTip what="Revisa el motivo de cada uno y emite de nuevo el corregido antes de la declaración mensual. En Pendientes los ves agrupados por causa, con qué hacer." side="bottom" />
          <span className="ml-auto flex flex-wrap items-center gap-1">
            {!soloRechazados && (
              <button
                type="button"
                onClick={() => setFiltros((f) => ({ ...f, estados: ["rechazado"], tipos: [] }))}
                className="min-h-12 rounded-xl px-3 text-sm font-semibold text-[var(--data-error-ink)] hover:underline dark:text-[var(--data-error-500)]"
              >
                Ver solo esos
              </button>
            )}
            <button
              type="button"
              onClick={() => ir({ vista: "seguimiento", sub: "pendientes" })}
              className="min-h-12 rounded-xl px-3 text-sm font-semibold text-[var(--data-error-ink)] hover:underline dark:text-[var(--data-error-500)]"
            >
              Por causa
            </button>
          </span>
        </div>
      )}

      {/* Buscador y filtros pegados a la tabla que filtran; debajo, lo puesto como chips. */}
      <BarraFiltros
        filtros={filtros}
        onCambiar={setFiltros}
        facetas={facetas}
        refBuscar={refBuscar}
        usuario={fijos.usuario}
        extra={<BotonRestablecerColumnas cambiado={orden.cambiado} onRestablecer={orden.restablecer} className="h-12!" />}
      />

      {(lista.error || avisoExcel) && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          {lista.error ?? avisoExcel}
        </p>
      )}

      <div className="overflow-hidden rounded-xl bg-[var(--surface-raised)]" aria-busy={lista.cargando}>
        {lista.cargando && lista.docs.length === 0 ? (
          <LoadingState message="Trayendo los comprobantes…" />
        ) : lista.docs.length === 0 ? (
          <div className="rounded-xl border border-[var(--rule-base)] py-10 text-center text-sm text-[var(--text-tertiary)]" data-qa="comprobantes-vacio">
            <Receipt className="mx-auto mb-2 h-8 w-8 opacity-30" aria-hidden />
            <p className="font-semibold">{inicial ? "Sin comprobantes este mes" : "Ningún comprobante en este alcance"}</p>
            <button
              type="button"
              onClick={() => setFiltros(inicial ? { ...FILTROS_INICIALES, periodo: "todo" } : FILTROS_INICIALES)}
              className={button({ variant: "secondary", className: "mt-3 rounded-xl" })}
            >
              {inicial ? "Ver todos los períodos" : "Restablecer alcance"}
            </button>
          </div>
        ) : (
          <div className={lista.cargando ? "opacity-60 transition-opacity" : undefined}>
            <TablaComprobantes docs={lista.docs} orden={orden} onVer={setDetail} />
            {total > lista.docs.length && (
              <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">
                Se ven los {lista.docs.length} más recientes de {total}: afina el filtro o baja el Excel (hasta {FILAS_EXCEL}).
              </p>
            )}
          </div>
        )}
      </div>

      <ModalDetalleComprobante doc={detail} onCerrar={cerrarDetail} />
      <ModalEmitirComprobante emision={emision} docs={vivos} sunat={sunat} />
      {elegirFijos && (
        <ElegirAccesosFijos
          open
          onClose={() => setElegirFijos(false)}
          titulo="Accesos fijos de Comprobantes"
          tope={3}
          opciones={fijables}
          fijados={fijos.fijados}
          onGuardar={fijos.guardar}
          prefijoQa="comprobantes"
        />
      )}
    </div>
  );
}
