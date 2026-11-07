"use client";
import { useState } from "react";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle2, Download, MoreHorizontal, Plus, RefreshCw, RotateCcw, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { FilaDevolucion } from "./devoluciones-proveedor/FilaDevolucion";
import { FiltrosDevolucionesBarra } from "./devoluciones-proveedor/FiltrosDevoluciones";
import { ReportesDevoluciones } from "./devoluciones-proveedor/ReportesDevoluciones";
import { FormularioDevolucion } from "./devoluciones-proveedor/FormularioDevolucion";
import { AnularDevolucionModal } from "./devoluciones-proveedor/AnularDevolucionModal";
import { MensajeProveedorModal } from "./devoluciones-proveedor/MensajeProveedorModal";
import { ValorarDevolucionModal } from "./devoluciones-proveedor/ValorarDevolucionModal";
import { exportarDevolucionesCSV } from "./devoluciones-proveedor/exportar-csv";
import { PERIODOS, SIN_FILTROS, conteoPorEstado, filtrarDevoluciones, type Devolucion, type FiltrosDevoluciones } from "./devoluciones-proveedor/tipos";
import { consultaDeLaUrl } from "@/lib/compras/consulta-de-la-url";
import { useDevoluciones } from "./devoluciones-proveedor/use-devoluciones";
import { useIndicadoresDevoluciones } from "./devoluciones-proveedor/use-indicadores-devoluciones";

const AYUDA = {
  what: "Lo que le devuelves a un proveedor (vencido, dañado, equivocado) y en qué va el reclamo: pendiente, enviada, resuelta o anulada. No puedes devolver más de lo que te llegó de ese proveedor.",
  affects: "Al marcarla enviada, la mercadería sale del Inventario y queda en Movimientos como «devolución a proveedor». Si la anulas y la mercadería volvió, regresa al inventario. La nota de crédito de una recepción con faltantes baja la cuenta en Por pagar; aquí queda el reclamo hasta que el proveedor responda.",
  example: "5 cajas vencidas de Ferretería Pasco: la registras, la marcas enviada (salen 5 del stock) y, cuando te mandan la nota de crédito, la marcas resuelta.",
};

/** Vive dentro de Compras (su barra ya es el título del módulo): acá va el título de la vista. */
export default function DevolucionesProveedorModule() {
  const d = useDevoluciones();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // «Ver en Devoluciones» desde Buscar en Compras llega con `?q=` (el proveedor).
  const [filtros, setFiltros] = useState<FiltrosDevoluciones>(() => ({ ...SIN_FILTROS, texto: consultaDeLaUrl() }));
  const [ventana, setVentana] = useState<{ tipo: "anular" | "valorar" | "mensaje"; id: string } | null>(null);
  // La fila viva (no una copia): si la recarga la cambia, la ventana ve lo último.
  const enVentana: Devolucion | undefined = ventana ? d.devoluciones.find((x) => x.id === ventana.id) : undefined;
  const cerrar = () => setVentana(null);
  const kpis = useIndicadoresDevoluciones(d.devoluciones, d.loading);

  const filtradas = filtrarDevoluciones(d.devoluciones, filtros);
  const conteos = conteoPorEstado(d.devoluciones);
  const acciones: MenuAccion[] = [
    { id: "csv", label: "Descargar CSV", hint: "Todas las devoluciones, para Excel", icon: Download, onSelect: () => exportarDevolucionesCSV(d.devoluciones), disabled: d.devoluciones.length === 0 },
    { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: d.recargar, busy: d.loading },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Devoluciones</SectionTitle>
          <InfoTip title="Devoluciones a proveedores" what={AYUDA.what} affects={AYUDA.affects} example={AYUDA.example} />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <button type="button" onClick={() => setMostrarFormulario(true)} aria-haspopup="dialog" className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Nueva devolución</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Descargar CSV y actualizar" />
        </div>
      </div>

      {kpis.panel}
      {/* C56: las tasas van sobre el período elegido en el filtro, y lo dicen. */}
      {kpis.abierto && (
        <ReportesDevoluciones
          devoluciones={filtrarDevoluciones(d.devoluciones, { ...SIN_FILTROS, periodo: filtros.periodo })}
          periodo={PERIODOS.find((p) => p.id === filtros.periodo)?.label ?? "Todas las fechas"}
        />
      )}

      {/* Resultado de la última acción: una guardada y una que no entró no se ven igual. */}
      {d.aviso && (
        <div
          role={d.aviso.tipo === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-xl border px-3 py-2.5",
            d.aviso.tipo === "error" ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10" : "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10",
          )}
        >
          {d.aviso.tipo === "error"
            ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />}
          <p className={cn("flex-1 text-sm font-medium", d.aviso.tipo === "error" ? "text-[var(--data-error-ink)]" : "text-[var(--data-success-ink)]")}>{d.aviso.texto}</p>
          <button type="button" onClick={() => d.setAviso(null)} aria-label="Cerrar aviso" className="-m-2 flex h-12 w-12 shrink-0 items-center justify-center text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mostrarFormulario && (
        <FormularioDevolucion
          proveedores={d.proveedores}
          loadingProveedores={d.loadingProveedores}
          products={d.products}
          guardando={d.guardando}
          onGuardar={d.registrar}
          onCerrar={() => setMostrarFormulario(false)}
        />
      )}

      {d.devoluciones.length > 0 && (
        <FiltrosDevolucionesBarra filtros={filtros} onCambiar={setFiltros} devoluciones={d.devoluciones} conteos={conteos} visibles={filtradas.length} />
      )}

      {d.loading ? (
        <LoadingState />
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
          <RotateCcw className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm text-[var(--text-secondary)]">
            {d.devoluciones.length > 0 ? "Ninguna devolución coincide con los filtros." : "Todavía no devolviste nada a tus proveedores."}
          </p>
          {d.devoluciones.length === 0 && (
            <button type="button" onClick={() => setMostrarFormulario(true)} className="mt-3 h-12 text-sm font-medium text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
              Registrar la primera devolución
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((dev) => (
            <FilaDevolucion
              key={dev.id}
              dev={dev}
              abierta={expandedId === dev.id}
              ocupada={d.actionId === dev.id}
              onAlternar={() => setExpandedId(expandedId === dev.id ? null : dev.id)}
              onAvanzar={() => d.avanzarEstado(dev.id)}
              onAnular={() => setVentana({ tipo: "anular", id: dev.id })}
              onReingresar={() => d.reingresar(dev.id)}
              onValorar={() => setVentana({ tipo: "valorar", id: dev.id })}
              onMensaje={() => setVentana({ tipo: "mensaje", id: dev.id })}
            />
          ))}
        </div>
      )}

      {enVentana && ventana?.tipo === "anular" && (
        <AnularDevolucionModal dev={enVentana} ocupada={d.actionId === enVentana.id} onAnular={(motivo, volvio) => d.anular(enVentana.id, motivo, volvio)} onCerrar={cerrar} />
      )}
      {enVentana && ventana?.tipo === "valorar" && (
        <ValorarDevolucionModal dev={enVentana} ocupada={d.actionId === enVentana.id} onValorar={(v) => d.valorar(enVentana.id, v)} onCerrar={cerrar} />
      )}
      {enVentana && ventana?.tipo === "mensaje" && (
        <MensajeProveedorModal dev={enVentana} proveedor={d.proveedores.find((p) => p.id === enVentana.proveedorId)} onCerrar={cerrar} />
      )}
    </div>
  );
}
