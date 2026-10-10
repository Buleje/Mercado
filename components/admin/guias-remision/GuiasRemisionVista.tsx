"use client";

/**
 * Comprobantes › Guías de remisión. Una fila arriba (título · Indicadores ·
 * Nueva guía · Más), el buscador con los estados y la lista; el detalle y la
 * guía nueva se abren encima.
 */
import { useCallback, useEffect, useState } from "react";
import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, MoreHorizontal, Plus, RefreshCw, Truck } from "@buleje/design-system/icons";
import { AnimatePresence } from "@/components/admin/providers";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { GuiaDetalle } from "./GuiaDetalle";
import { GuiasFiltros } from "./GuiasFiltros";
import { GuiasTabla } from "./GuiasTabla";
import { NuevaGuiaModal } from "./NuevaGuiaModal";
import type { GuiaRemision } from "./tipos";
import { useGuias } from "./use-guias";
import { useIndicadoresGuias } from "./use-indicadores-guias";
import { useNuevaGuia } from "./use-nueva-guia";

export default function GuiasRemisionVista() {
  const datos = useGuias();
  const [seleccionada, setSeleccionada] = useState<GuiaRemision | null>(null);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const cerrarNueva = useCallback(() => setMostrarNueva(false), []);
  const cerrarDetalle = useCallback(() => setSeleccionada(null), []);
  const nueva = useNuevaGuia(() => { setMostrarNueva(false); datos.recargar(); });
  const kpis = useIndicadoresGuias(datos.resumen);

  const abrirNueva = useCallback(() => { setMostrarNueva(true); nueva.setError(null); }, [nueva]);

  /* Ctrl/⌘+N abre la guía nueva (desde fuera de un campo). */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); abrirNueva(); }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abrirNueva]);

  const acciones: MenuAccion[] = [
    { id: "pedidos", label: "Ir a Pedidos", hint: "La guía de un pedido nace ahí: toca «Hacer guía» y escribe su N° en «Vincular pedido»", icon: Truck, onSelect: () => irAEnlace(hrefDeDestino({ tab: "pedidos", params: {} })) },
    { id: "exportar", label: "Exportar a Excel", hint: datos.estado ? "Solo las guías del estado elegido" : "Todas las guías", icon: Download, onSelect: datos.exportar },
    { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: datos.recargar },
  ];

  const { guias, filtradas, loading, error } = datos;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Guías de remisión</SectionTitle>
          <InfoTip
            title="Guías de remisión"
            what="Los papeles que acompañan a la mercadería cuando sale de un lugar a otro: quién la lleva, en qué vehículo y hasta dónde."
            affects="Una guía en tránsito queda pendiente hasta que la marcas entregada. Anularla no borra el traslado de tu historial. ¿Es de un pedido? Hazla desde el pedido (menú «Más» › Ir a Pedidos)."
            example="Mandas 40 sacos de arroz a la tienda de Yarinacocha en la camioneta ABC-123: haces la guía y viaja con el chofer."
            side="bottom"
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.hayCifras && kpis.boton}
          <button type="button" onClick={abrirNueva} className={button({ variant: "primary", className: "rounded-xl" })}>
            <Plus className="h-4 w-4" aria-hidden />
            Nueva guía
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Ir a Pedidos, exportar y actualizar" />
        </div>
      </div>

      {kpis.hayCifras && kpis.panel}

      <GuiasFiltros search={datos.search} onSearch={datos.setSearch} estado={datos.estado} onEstado={datos.setEstado} conteos={datos.conteos} />

      <div className="overflow-hidden rounded-xl bg-[var(--surface-raised)]">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" aria-hidden />
            <p className="text-sm text-[var(--data-error-ink)]">{error}</p>
            <button type="button" onClick={datos.recargar} className={button({ variant: "secondary", className: "rounded-xl" })}>Reintentar</button>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Truck className="mx-auto mb-3 h-12 w-12 text-[var(--text-tertiary)]" aria-hidden />
            <CardTitle className="mb-1 text-sm font-bold text-[var(--text-primary)]">
              {guias.length === 0 ? "Aún no hay guías de remisión" : "Ninguna guía coincide"}
            </CardTitle>
            <p className="mx-auto mb-4 max-w-md text-sm text-[var(--text-secondary)]">
              {guias.length === 0 ? "Documenta tus envíos de mercadería." : "Prueba con otro estado o con otro nombre."}
            </p>
            {guias.length === 0 && (
              <button type="button" onClick={abrirNueva} className={button({ variant: "primary", className: "rounded-xl" })}>
                <Plus className="h-4 w-4" aria-hidden /> Crear guía
              </button>
            )}
          </div>
        ) : (
          <GuiasTabla guias={datos.pagina} total={filtradas.length} page={datos.page} totalPages={datos.totalPages} onPage={datos.setPage} onAbrir={setSeleccionada} />
        )}
      </div>

      <AnimatePresence>
        {seleccionada && (
          <GuiaDetalle
            key={seleccionada.id}
            guia={seleccionada}
            onCerrar={cerrarDetalle}
            onDuplicar={() => datos.duplicar(seleccionada.id)}
            onAnular={async (motivo) => { setSeleccionada(await datos.anular(seleccionada.id, motivo)); }}
          />
        )}
      </AnimatePresence>
      <NuevaGuiaModal abierto={mostrarNueva} onCerrar={cerrarNueva} nueva={nueva} />
    </div>
  );
}
