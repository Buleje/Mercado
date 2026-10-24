"use client";

/**
 * Socios e inversión › Inversión inicial (ADR-497): arriba las cifras (total,
 * aportes, en cuánto se recupera, en qué se fue y de dónde salió) y abajo
 * cada gasto, con su categoría y su fuente.
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { etiquetaFuente, totalesInversion } from "@/lib/planificacion/calculos";
import { formatCurrency } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { fechaCorta } from "../empresa/campos-plan";
import { InversionModal, type ItemInversion } from "./InversionModal";
import { InversionTotales } from "./InversionTotales";

export function InversionTabla() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("inversion");
  const { datos: socios } = useSeccionPlan("socios");
  const { confirm } = useConfirm();
  const [editando, setEditando] = useState<ItemInversion | null | undefined>(undefined);
  const hoy = limaDateKey();
  const totales = totalesInversion(datos, socios.items);
  const filas = [...datos.items].sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999"));

  const guardar = (i: ItemInversion) =>
    cambiar((prev) => {
      const existe = prev.items.some((x) => x.id === i.id);
      return { ...prev, items: existe ? prev.items.map((x) => (x.id === i.id ? i : x)) : [...prev.items, i] };
    });

  const quitar = async (i: ItemInversion) => {
    const ok = await confirm({
      title: `¿Quitar «${i.concepto}»?`,
      description: `Sale ${formatCurrency(i.monto)} de la inversión. Puedes recuperarlo desde Versiones anteriores.`,
      confirmLabel: "Quitar",
      intent: "danger",
    });
    if (ok) cambiar((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== i.id) }));
  };

  return (
    <section className="space-y-4" aria-label="Inversión inicial">
      <CabeceraSeccion
        seccion="inversion"
        titulo="Inversión inicial"
        ayuda="Todo lo que cuesta poner el negocio en marcha: local, equipos, mercadería, trámites, publicidad y la plata para operar los primeros meses."
        ejemplo="Anota cada compra con de dónde salió la plata: así ves cuánto cubren los socios y cuánto el préstamo."
      >
        {puedeEditar ? (
          <button type="button" className={button({ variant: "primary" })} onClick={() => setEditando(null)}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar
          </button>
        ) : null}
      </CabeceraSeccion>

      <InversionTotales
        totales={totales}
        ganancia={datos.gananciaMensualEsperada}
        hoy={hoy}
        editable={puedeEditar}
        onGanancia={(v) => cambiar((prev) => ({ ...prev, gananciaMensualEsperada: v }))}
      />

      {filas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-sm text-[var(--text-secondary)]">
          Todavía no anotas gastos de inversión.
        </div>
      ) : (
        <DataTable aria-label="Gastos de la inversión inicial">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Categoría</th>
              <th className="text-right">Monto</th>
              <th>De dónde salió</th>
              <th className="whitespace-nowrap">Fecha</th>
              <th className="w-12">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((i) => {
              const acciones: MenuAccion[] = puedeEditar
                ? [
                    { id: "editar", label: "Editar", icon: Pencil, onSelect: () => setEditando(i) },
                    { id: "quitar", label: "Quitar", icon: Trash2, tone: "danger", onSelect: () => void quitar(i) },
                  ]
                : [];
              return (
                <tr key={i.id}>
                  <td className="font-medium">{i.concepto}</td>
                  <td>{i.categoria}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatCurrency(i.monto)}</td>
                  <td>{etiquetaFuente(i.fuente, socios.items)}</td>
                  <td className="whitespace-nowrap">{fechaCorta(i.fecha, hoy)}</td>
                  <td className="text-right">
                    {acciones.length > 0 ? <ActionMenu label={`Opciones de ${i.concepto}`} actions={acciones} soloIcono size="sm" /> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-semibold">Total</td>
              <td />
              <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatCurrency(totales.total)}</td>
              <td />
              <td />
              <td />
            </tr>
          </tfoot>
        </DataTable>
      )}

      {editando !== undefined ? (
        <InversionModal
          key={editando?.id ?? "nuevo"}
          abierto
          inicial={editando}
          socios={socios.items}
          onCerrar={() => setEditando(undefined)}
          onGuardar={guardar}
        />
      ) : null}
    </section>
  );
}
