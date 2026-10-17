"use client";

import { useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { CreditCard, Download, MoreHorizontal, Plus, RefreshCw, ScrollText, X } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { codigoDeOrden, descripcionALaVista } from "@/lib/compras/referencia-documento";
import { cn, exportToCSV, limaDateKey } from "@/lib/utils";
import CalendarioPorPagar from "@/components/admin/cuentas-por-pagar/CalendarioPorPagar";
import EstadoDeCuentaModal from "@/components/admin/cuentas-por-pagar/EstadoDeCuentaModal";
import NuevaCuentaModal from "@/components/admin/cuentas-por-pagar/NuevaCuentaModal";
import PropuestaDePagos from "@/components/admin/cuentas-por-pagar/PropuestaDePagos";
import SeccionCuentas, { type FiltrosCuentas } from "@/components/admin/cuentas-por-pagar/SeccionCuentas";
import { consultaDeLaUrl } from "@/lib/compras/consulta-de-la-url";
import type { Abierto } from "@/components/admin/cuentas-por-pagar/TablaCuentas";
import VincularOrdenModal from "@/components/admin/cuentas-por-pagar/VincularOrdenModal";
import { useCuentasPorPagar } from "@/components/admin/cuentas-por-pagar/use-cuentas-por-pagar";
import { useIndicadoresPorPagar } from "@/components/admin/cuentas-por-pagar/use-indicadores-por-pagar";
import {
  diaDeVencimiento, estaPagada, ordenar, proveedoresConCuentas, resumir, saldo, sugeridasParaPagar, type CuentaPorPagar,
} from "@/components/admin/cuentas-por-pagar/resumen-cuentas";

export const SECCIONES_POR_PAGAR = ["cuentas", "calendario", "propuesta"] as const;
type SeccionPorPagar = (typeof SECCIONES_POR_PAGAR)[number];
const ID_PANEL = "panel-por-pagar";
const FILTROS_INICIALES: FiltrosCuentas = { estado: "pendientes", proveedorId: "", q: "" };

/**
 * Cuentas por pagar a proveedores: a quién le debes, cuánto, cuándo vence y
 * pagar. Vive en Compras › Por pagar. Tres secciones (`?sub=`): la lista de
 * cuentas, el calendario con la antigüedad del saldo (C45) y la propuesta de
 * pagos (C46, preparar no paga). El estado de cuenta de un proveedor (C48)
 * sale del «⋯» de la cabecera o de la fila.
 */
export default function PayablesTab() {
  const { cuentas, proveedores, loading, error, setError, saving, load, crear, vincular, pagar, eliminar } = useCuentasPorPagar();
  const { confirm } = useConfirm();
  const { vista, irA } = useSubvistaModulo<SeccionPorPagar>("compras-por-pagar", SECCIONES_POR_PAGAR, "cuentas");
  // «Ver su cuenta» desde Buscar en Compras llega con `?q=`: la cuenta aparece aunque ya esté pagada.
  const [filtros, setFiltrosTodos] = useState<FiltrosCuentas>(() => {
    const q = consultaDeLaUrl();
    return q ? { estado: "todas", proveedorId: "", q } : FILTROS_INICIALES;
  });
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [nueva, setNueva] = useState(false);
  const [aVincular, setAVincular] = useState<CuentaPorPagar | null>(null);
  const [estadoDe, setEstadoDe] = useState<{ proveedor?: string } | null>(null);
  // La propuesta arranca con las sugeridas; desde que marcas una, manda tu lista.
  const [elegidasAMano, setElegidas] = useState<Set<string> | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tono: "ok" | "aviso" } | null>(null);
  const hoy = limaDateKey();

  const resumen = useMemo(() => resumir(cuentas, hoy), [cuentas, hoy]);
  const kpis = useIndicadoresPorPagar(resumen, !loading && !error);
  const porProveedor = useMemo(() => proveedoresConCuentas(cuentas), [cuentas]);
  const sugeridas = useMemo(() => new Set(sugeridasParaPagar(cuentas, hoy)), [cuentas, hoy]);
  const elegidas = elegidasAMano ?? sugeridas;
  const marcadas = cuentas.filter((c) => elegidas.has(c.id) && !estaPagada(c)).length;

  const setFiltros = (cambio: Partial<FiltrosCuentas>) => setFiltrosTodos((f) => ({ ...f, ...cambio }));

  const borrar = async (id: string) => {
    if (!(await confirm({ title: "¿Eliminar esta cuenta por pagar?", description: "Se borra con sus pagos registrados.", intent: "danger", confirmLabel: "Sí, eliminar" }))) return;
    await eliminar(id);
  };

  /** «Pagar» desde la propuesta: lleva a la cuenta, sin filtros que la escondan, con el pago abierto. */
  const pagarDesdePropuesta = (id: string) => {
    setFiltrosTodos(FILTROS_INICIALES);
    setAbierto({ id, que: "pagar" });
    irA("cuentas");
    window.setTimeout(() => document.querySelector(`[data-cuenta="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center" }), 80);
  };

  const descargar = () => exportToCSV(ordenar(cuentas).map((c) => ({
    proveedor: c.supplierName, concepto: descripcionALaVista(c.description, c.purchaseOrderId), total: c.amount, pagado: c.paidAmount,
    falta: saldo(c), vence: diaDeVencimiento(c.dueDate), estado: c.status, orden: c.purchaseOrderId ? codigoDeOrden(c.purchaseOrderId) : "",
  })), "cuentas-por-pagar");

  const conDatos = !loading && cuentas.length > 0;
  const secciones = [
    // Sin cuenta: la misma cifra está en «Por pagar N» y en los indicadores, y la fila no entra a 1280.
    { clave: "cuentas" as const, rotulo: "Cuentas" },
    { clave: "calendario" as const, rotulo: "Calendario" },
    { clave: "propuesta" as const, rotulo: "Propuesta", cuenta: marcadas },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="text-[var(--text-primary)]">Cuentas por pagar</SectionTitle>
        <InfoTip
          title="Cuentas por pagar"
          what="Lo que le debes a cada proveedor: las compras a crédito crean su cuenta sola y también puedes cargar una a mano con su factura u orden. Arriba van las vencidas y las que vencen primero."
          affects="Al recibir con productos dañados, vencidos o faltantes, la cuenta de esa orden baja sola. Si pagas en efectivo puedes marcar «Sale de la caja» y el pago queda como egreso de la caja abierta."
          example="Orden de S/ 140 a 15 días con Distribuidora Ucayali: vence el jueves 23/10; si pagas S/ 100 hoy te faltan S/ 40."
        />
        {conDatos && (
          <BarraDeSecciones secciones={secciones} activa={vista} onCambiar={irA} etiqueta="Secciones de Por pagar" idPanel={ID_PANEL} />
        )}
        <div className="ml-auto flex items-center gap-2">
          {conDatos && kpis.boton}
          <button type="button" onClick={() => setNueva(true)} aria-haspopup="dialog" title="Nueva cuenta" className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 max-2xl:w-12 max-2xl:px-0" })}>
            <Plus className="h-4 w-4" aria-hidden /> <span className="max-2xl:sr-only">Nueva cuenta</span>
          </button>
          <ActionMenu
            label="Más acciones"
            soloIcono
            size="md"
            className="w-12 shrink-0"
            icon={MoreHorizontal}
            actions={[
              { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: () => void load(), busy: loading },
              { id: "estado", label: "Estado de cuenta", hint: "Cargos, pagos y saldo con un proveedor", icon: ScrollText, onSelect: () => setEstadoDe({ proveedor: filtros.proveedorId || undefined }), disabled: porProveedor.length === 0 },
              { id: "csv", label: "Descargar CSV", hint: "Todas las cuentas", icon: Download, onSelect: descargar, disabled: cuentas.length === 0 },
            ]}
          />
        </div>
      </div>

      {(error || aviso) && (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold",
            error ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]"
              : aviso?.tono === "aviso" ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
              : "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--text-primary)]",
          )}
        >
          <p>{error ?? aviso?.texto}</p>
          <button type="button" onClick={() => { setError(null); setAviso(null); }} className="shrink-0 hover:opacity-70" aria-label="Cerrar aviso">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {conDatos && kpis.panel}

      {loading ? (
        <TableSkeleton rows={4} cols={4} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />
      ) : cuentas.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No le debes nada a ningún proveedor"
          description="Las compras a crédito crean su cuenta aquí solas."
          action={{ label: "Anotar una cuenta", onClick: () => setNueva(true) }}
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
        />
      ) : (
        <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, vista)}>
          {vista === "calendario" ? (
            <CalendarioPorPagar cuentas={cuentas} hoy={hoy} />
          ) : vista === "propuesta" ? (
            <PropuestaDePagos cuentas={cuentas} hoy={hoy} elegidas={elegidas} setElegidas={setElegidas} onPagar={pagarDesdePropuesta} />
          ) : (
            <SeccionCuentas
              cuentas={cuentas}
              hoy={hoy}
              filtros={filtros}
              setFiltros={setFiltros}
              abierto={abierto}
              setAbierto={setAbierto}
              saving={saving}
              onPagar={pagar}
              onEliminar={(id) => void borrar(id)}
              onAviso={(texto, tono) => setAviso({ texto, tono })}
              onEstadoDeCuenta={(proveedor) => setEstadoDe({ proveedor })}
              onVincular={setAVincular}
            />
          )}
        </div>
      )}

      {nueva && <NuevaCuentaModal proveedores={proveedores} cuentas={cuentas} saving={saving} onCrear={crear} onCerrar={() => setNueva(false)} />}
      {aVincular && <VincularOrdenModal cuenta={aVincular} saving={saving} onVincular={vincular} onCerrar={() => setAVincular(null)} />}
      {estadoDe && (
        <EstadoDeCuentaModal
          proveedores={porProveedor.map((p) => ({ id: p.id, nombre: p.nombre }))}
          inicial={estadoDe.proveedor}
          onCerrar={() => setEstadoDe(null)}
        />
      )}
    </div>
  );
}
