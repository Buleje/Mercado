"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ErrorAlert } from "@buleje/design-system";
import { MoreHorizontal, Plus, RefreshCw, Search } from "@buleje/design-system/icons";
import type { DbSupplier } from "@/lib/jsondb";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import ActionMenu from "@/components/admin/shared/action-menu";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { button } from "@/components/ui-system/button-variants";
import { cn, limaDateKey } from "@/lib/utils";
import { duplicadosEnLista } from "@/lib/compras/proveedor-identidad";
import CabeceraProveedores, { ID_PANEL_PROVEEDORES, idPestanaDeSeccion, type BarraProveedores } from "./proveedores/CabeceraProveedores";
import FichaProveedorModal from "./proveedores/FichaProveedorModal";
import ProveedorFormModal from "./proveedores/ProveedorFormModal";
import TablaProveedores from "./proveedores/TablaProveedores";
import { conDeuda, filtrarProveedores, tieneRuc, type FiltroProveedor } from "./proveedores/datos-proveedores";
import { useFichaProveedorUrl, useListaRecordada } from "./proveedores/use-ficha-proveedor-url";
import { useIndicadoresProveedores } from "./proveedores/use-indicadores-proveedores";
import { useProveedores } from "./proveedores/use-proveedores";

const EstadoDeCuentaModal = dynamic(() => import("./cuentas-por-pagar/EstadoDeCuentaModal"), { ssr: false });

const FILTROS: { id: FiltroProveedor; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "con-deuda", label: "Con deuda" },
  { id: "con-ruc", label: "Con RUC" },
  { id: "sin-ruc", label: "Sin RUC" },
];

interface Props {
  barra?: BarraProveedores;
  /** «Nueva orden» desde la ficha (lo pasa Compras: lleva a Órdenes con el proveedor elegido). */
  onNuevaOrden?: (proveedor: { id: string; name: string }) => void;
}

/**
 * Compras › Proveedores › lista. `barra` (la pone `ProveedoresVista`) dibuja las
 * secciones Lista / Comparar en la fila del título; sin ella la lista va sola.
 *
 * «Ficha» abre la ficha de CONSULTA (C33); «Editar» es aparte: desde la fila
 * abre el formulario directo y desde la ficha lo abre encima y vuelve a ella.
 */
export default function SuppliersTab({ barra, onNuevaOrden }: Props = {}) {
  const { proveedores, cuentas, compras, loading, error, load, borrar } = useProveedores();
  /** El formulario: `supplier: null` = nuevo. Con la ficha abierta, ésta espera detrás. */
  const [form, setForm] = useState<{ supplier: DbSupplier | null } | null>(null);
  /** Estado de cuenta del proveedor de la ficha (se abre en su lugar y vuelve). */
  const [cuentaDe, setCuentaDe] = useState<DbSupplier | null>(null);
  const { filtro, setFiltro, texto, setTexto } = useListaRecordada();
  const [porBorrar, setPorBorrar] = useState<DbSupplier | null>(null);
  const [borrando, setBorrando] = useState(false);
  /** Lo que dijo el servidor cuando no se pudo borrar. Antes se perdía. */
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  const ficha = useFichaProveedorUrl({ proveedores, loading });
  const duplicados = useMemo(() => duplicadosEnLista(proveedores), [proveedores]);
  const kpis = useIndicadoresProveedores(proveedores, cuentas, compras, !loading && !error);

  // «Hoy» en Lima, no en UTC del servidor/navegador.
  const hoy = limaDateKey();
  const ahora = useMemo(() => new Date(), []);
  const visibles = useMemo(() => filtrarProveedores(proveedores, cuentas, filtro, texto), [proveedores, cuentas, filtro, texto]);
  const cuenta = useMemo(() => {
    const deben = conDeuda(cuentas);
    return {
      todos: proveedores.length,
      "con-deuda": proveedores.filter((s) => deben.has(s.id)).length,
      "con-ruc": proveedores.filter(tieneRuc).length,
      "sin-ruc": proveedores.filter((s) => !tieneRuc(s)).length,
    } satisfies Record<FiltroProveedor, number>;
  }, [proveedores, cuentas]);

  const nuevo = () => setForm({ supplier: null });
  const confirmarBorrado = async () => {
    if (!porBorrar) return;
    setBorrando(true);
    setErrorBorrar(null);
    const fallo = await borrar(porBorrar.id);
    setBorrando(false);
    if (fallo) setErrorBorrar(fallo);
    else setPorBorrar(null);
  };

  return (
    <div className="space-y-4">
      <CabeceraProveedores barra={barra}>
        {kpis.boton}
        <button type="button" onClick={nuevo} aria-haspopup="dialog" className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}>
          <Plus className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Nuevo proveedor</span>
        </button>
        <ActionMenu
          label="Más" icon={MoreHorizontal} soloIcono size="md" className="w-12 shrink-0" title="Actualizar la lista"
          actions={[{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void load(), busy: loading }]}
        />
      </CabeceraProveedores>

      {kpis.panel}

      <div
        role={barra ? "tabpanel" : undefined}
        id={barra ? ID_PANEL_PROVEEDORES : undefined}
        aria-labelledby={barra ? idPestanaDeSeccion(ID_PANEL_PROVEEDORES, barra.activa) : undefined}
        className="space-y-3"
      >
        {error ? (
          <ErrorAlert title="No se pudo abrir tu lista de proveedores" description={error} action={<button type="button" onClick={() => void load()} className={button({ variant: "secondary" })}>Reintentar</button>} />
        ) : loading ? (
          <TableSkeleton rows={4} cols={4} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />
        ) : proveedores.length === 0 ? (
          <EmptyState
            icon={Plus}
            title="Aún no tienes proveedores"
            description="Agrega el primero para comprarle y llevar lo que le debes."
            action={{ label: "Nuevo proveedor", onClick: nuevo }}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[14rem] flex-1">
                <span className="sr-only">Buscar proveedor</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, RUC, DNI, contacto o teléfono"
                  className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
                />
              </label>
              <div role="group" aria-label="Qué proveedores ver" className="inline-flex flex-wrap gap-2">
                {FILTROS.map((f) => (
                  <button
                    key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}
                    className={cn("h-12 rounded-xl border px-3 text-sm font-semibold transition-colors", filtro === f.id ? "border-primary bg-primary text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}
                  >
                    {f.label} <span className="tabular-nums opacity-80">{cuenta[f.id]}</span>
                  </button>
                ))}
              </div>
            </div>
            {visibles.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--rule-base)] py-8 text-center">
                <p className="text-sm font-semibold text-[var(--text-secondary)]">Ningún proveedor coincide.</p>
                <button type="button" onClick={() => { setFiltro("todos"); setTexto(""); }} className="mt-2 text-sm font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">Ver todos</button>
              </div>
            ) : (
              <TablaProveedores
                proveedores={visibles} cuentas={cuentas} compras={compras} hoy={hoy} ahora={ahora}
                duplicados={duplicados} resaltado={ficha.ultimo}
                onFicha={ficha.abrir} onEditar={(s) => setForm({ supplier: s })} onEliminar={setPorBorrar}
              />
            )}
          </>
        )}
      </div>

      <ConfirmDeleteDialog
        open={!!porBorrar}
        onClose={() => { setPorBorrar(null); setErrorBorrar(null); }}
        onConfirm={confirmarBorrado}
        title="¿Eliminar proveedor?"
        description={
          errorBorrar
            ? `No se eliminó: ${errorBorrar}`
            : porBorrar
              ? `"${porBorrar.name}" será eliminado permanentemente. Esta acción no se puede deshacer.`
              : "Esta acción no se puede deshacer"
        }
        confirmText="Sí, eliminar"
        loading={borrando}
      />

      <FichaProveedorModal
        proveedor={ficha.proveedor}
        visible={!form && !cuentaDe}
        seccion={ficha.seccion}
        onSeccion={ficha.setSeccion}
        onCerrar={ficha.cerrar}
        onEditar={() => ficha.proveedor && setForm({ supplier: ficha.proveedor })}
        onEstadoDeCuenta={() => setCuentaDe(ficha.proveedor)}
        onNuevaOrden={onNuevaOrden && ficha.proveedor ? () => ficha.proveedor && onNuevaOrden({ id: ficha.proveedor.id, name: ficha.proveedor.name }) : undefined}
      />

      <ProveedorFormModal
        // La clave remonta el formulario por proveedor: abrir otro no arrastra lo escrito.
        key={form?.supplier?.id ?? "nuevo"}
        isOpen={!!form}
        /* El formulario llama `onSaved(); onClose();`: cerrar sólo el formulario; si vino de la ficha, ésta vuelve a verse. */
        onClose={() => setForm(null)}
        onSaved={() => void load()}
        supplier={(form?.supplier ?? null) as Record<string, unknown> | null}
        existentes={proveedores}
      />

      {cuentaDe && (
        <EstadoDeCuentaModal proveedores={[{ id: cuentaDe.id, nombre: cuentaDe.name }]} inicial={cuentaDe.id} onCerrar={() => setCuentaDe(null)} />
      )}
    </div>
  );
}
