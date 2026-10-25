"use client";

/** La tabla de los gastos anotados: una fila por gasto, con el embudo de Excel en cada encabezado. */
import { DataTable } from "@buleje/design-system";
import { Camera, Receipt, Trash2, Wallet } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { diaConNombre, diaDelGasto } from "@/lib/gastos/lista-gastos";
import { FiltroEnCabecera, SinCoincidenciasFila, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { iconoDeCategoria } from "./categorias";
import { conMayuscula, papelDelGasto, queDelGasto } from "./textos-gasto";
import type { GastoDeLaLista } from "./ListaGastos";

interface Props {
  filtros: FiltrosTabla<GastoDeLaLista>;
  borrando: string | null;
  onBorrar: (g: GastoDeLaLista) => void;
}

export default function TablaGastos({ filtros: f, borrando, onBorrar }: Props) {
  return (
    <div className="max-h-[32rem] overflow-auto rounded-xl">
      <DataTable>
        <thead className="sticky top-0 z-10 [&_th]:align-top">
          <tr>
            <th>Fecha<FiltroEnCabecera id="fecha" f={f} compacto /></th>
            <th>Categoría<FiltroEnCabecera id="categoria" f={f} compacto /></th>
            <th>Descripción<FiltroEnCabecera id="descripcion" f={f} compacto /></th>
            <th>Comprobante<FiltroEnCabecera id="comprobante" f={f} compacto /></th>
            <th className="text-right">Monto<FiltroEnCabecera id="monto" f={f} compacto /></th>
            <th className="text-right"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
          {f.filtradas.map((e) => {
            const CatIcon = iconoDeCategoria(e.category);
            const papel = papelDelGasto(e);
            const que = queDelGasto(e);
            return (
              <tr key={e.id} data-gasto={e.id}>
                <td className="whitespace-nowrap">{diaConNombre(diaDelGasto(e.date))}</td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <CatIcon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" strokeWidth={1.5} aria-hidden />
                    {conMayuscula(e.category)}
                  </span>
                </td>
                <td>
                  <span className="block font-semibold">{que}</span>
                  {(e.recurring || e.caja || e.supplierName) && (
                    <span className="block text-sm text-[var(--text-secondary)]">
                      {e.supplierName}
                      {e.recurring && `${e.supplierName ? " · " : ""}Recurrente`}
                      {e.caja && (
                        <span className="ml-1 inline-flex items-center gap-0.5">
                          · <Wallet className="h-3.5 w-3.5" aria-hidden />de la caja
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td>
                  {papel ? (
                    <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
                      <Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden />{papel}
                    </span>
                  ) : "—"}
                </td>
                <td className="whitespace-nowrap text-right">
                  <span className="font-extrabold tabular-nums text-[var(--data-error-ink)]">−{formatCurrency(Number(e.amount))}</span>
                </td>
                <td className="whitespace-nowrap text-right">
                  {e.attachmentUrl && (
                    <a
                      href={e.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Ver la foto del comprobante de «${que}»`}
                      title="Ver la foto del comprobante"
                      className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
                    >
                      <Camera className="h-4 w-4" aria-hidden />
                    </a>
                  )}
                  <button
                    type="button"
                    aria-label={`Borrar «${que}»`}
                    onClick={() => onBorrar(e)}
                    disabled={borrando === e.id}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-500)] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
