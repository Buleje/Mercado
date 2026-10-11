"use client";

import { useMemo, useState } from "react";
import { ErrorAlert } from "@buleje/design-system";
import { MoreHorizontal, Plus, RefreshCw, Search } from "@buleje/design-system/icons";
import type { DbSupplier } from "@/lib/jsondb";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import ActionMenu from "@/components/admin/shared/action-menu";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { button } from "@/components/ui-system/button-variants";
import { cn, limaDateKey } from "@/lib/utils";
import CabeceraProveedores, { ID_PANEL_PROVEEDORES, idPestanaDeSeccion, type BarraProveedores } from "./proveedores/CabeceraProveedores";
import ProveedorFormModal from "./proveedores/ProveedorFormModal";
import TablaProveedores from "./proveedores/TablaProveedores";
import { conDeuda, filtrarProveedores, tieneRuc, type FiltroProveedor } from "./proveedores/datos-proveedores";
import { useFichaProveedorUrl } from "./proveedores/use-ficha-proveedor-url";
import { useIndicadoresProveedores } from "./proveedores/use-indicadores-proveedores";
import { useProveedores } from "./proveedores/use-proveedores";

const FILTROS: { id: FiltroProveedor; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "con-deuda", label: "Con deuda" },
  { id: "con-ruc", label: "Con RUC" },
  { id: "sin-ruc", label: "Sin RUC" },
];

/**
 * Compras › Proveedores › lista. `barra` (la pone `ProveedoresVista`) dibuja las
 * secciones Lista / Comparar en la fila del título; sin ella la lista va sola.
 */
export default function SuppliersTab({ barra }: { barra?: BarraProveedores } = {}) {
  const { proveedores, cuentas, compras, loading, error, load, borrar } = useProveedores();
  const [editando, setEditando] = useState<DbSupplier | null>(null);
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [filtro, setFiltro] = useState<FiltroProveedor>("todos");
  const [texto, setTexto] = useState("");
  const [porBorrar, setPorBorrar] = useState<DbSupplier | null>(null);
  const [borrando, setBorrando] = useState(false);
  /** Lo que dijo el servidor cuando no se pudo borrar. Antes se perdía. */
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  const ficha = useFichaProveedorUrl({
    suppliers: proveedores, loading, editingSupplier: editando, showProveedorModal: fichaAbierta,
    setEditingSupplier: setEditando, setShowProveedorModal: setFichaAbierta,
  });
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

  const nuevo = () => { setEditando(null); setFichaAbierta(true); };
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
                  type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, RUC o teléfono"
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
              <TablaProveedores proveedores={visibles} cuentas={cuentas} compras={compras} hoy={hoy} ahora={ahora} onFicha={ficha.abrirFicha} onEliminar={setPorBorrar} />
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

      <ProveedorFormModal
        isOpen={fichaAbierta}
        onClose={ficha.cerrarFicha}
        /* El formulario llama `onSaved(); onClose();`: cerrar acá también era un 2.º «atrás» que sacaba del módulo. */
        onSaved={() => void load()}
        supplier={editando as Record<string, unknown> | null}
      />
    </div>
  );
}
