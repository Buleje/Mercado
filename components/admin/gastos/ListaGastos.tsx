"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Download, Plus, Receipt, Search, Trash2, TrendingUp, Wallet, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { decodeExpenseDescription } from "@/lib/expense-meta";
import { formatCurrency } from "@/lib/format";
import { exportToCSV } from "@/lib/utils";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import {
  categoriasDeLista, diaConNombre, diaDelGasto, filtrarGastos, lineaDeCajaAlBorrar, normalizar,
  type RetiroDelGasto,
} from "@/lib/gastos/lista-gastos";
import { iconoDeCategoria } from "./categorias";
import { campo } from "./estilos";

export type GastoDeLaLista = {
  id: string; category: string; description: string; amount: number; date: string; recurring: boolean;
  documentType?: string | null; documentNumber?: string | null; igvAmount?: number | null; attachmentUrl?: string | null;
  supplierName?: string | null; supplierRuc?: string | null; paymentMethod?: string | null;
  /** El retiro de caja del gasto (`null` = no salió del cajón). Viene con `?caja=1`. */
  caja?: RetiroDelGasto | null;
};

interface Props {
  gastos: GastoDeLaLista[];
  /** Días de Lima del período («2026-10-01»): para el vacío y el nombre del CSV. */
  desde: string;
  hasta: string;
  /** Categoría elegida (también desde las tarjetas de arriba); `null` = todas. */
  categoria: string | null;
  onCategoria: (c: string | null) => void;
  onNuevo: () => void;
  /** Después de borrar: volver a pedir la lista y los totales. */
  onCambio: () => void;
}

const queDelGasto = (g: GastoDeLaLista) => decodeExpenseDescription(g.description).description.trim() || g.category;
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Factura F001-123 · IGV S/ 18.00» — lo que dice el papel del gasto, si tiene. */
function papelDelGasto(e: GastoDeLaLista): string | null {
  if (!e.documentType || e.documentType === "sin_comprobante") return null;
  const tipo = conMayuscula(e.documentType);
  const igv = e.documentType === "factura" && e.igvAmount != null
    ? e.igvAmount > 0 ? ` · IGV ${formatCurrency(e.igvAmount)}` : " · exonerada"
    : "";
  return `${tipo}${e.documentNumber ? ` ${e.documentNumber}` : ""}${igv}`;
}

/** «01/10/2026» — como lo escribe el contador. */
const fechaCsv = (dia: string) => (dia ? dia.split("-").reverse().join("/") : "");

function filasCsv(gastos: readonly GastoDeLaLista[]) {
  return gastos.map((g) => ({
    Fecha: fechaCsv(diaDelGasto(g.date)),
    Categoría: conMayuscula(g.category),
    Descripción: decodeExpenseDescription(g.description).description,
    Proveedor: g.supplierName ?? "",
    RUC: g.supplierRuc ?? "",
    Comprobante: g.documentType && g.documentType !== "sin_comprobante" ? conMayuscula(g.documentType) : "",
    "N°": g.documentNumber ?? "",
    IGV: g.igvAmount != null ? Number(g.igvAmount).toFixed(2) : "",
    "Monto (S/)": Number(g.amount).toFixed(2),
    "Medio de pago": g.paymentMethod ?? "",
    "Salió de la caja": g.caja ? "Sí" : "No",
  }));
}

export default function ListaGastos({ gastos, desde, hasta, categoria, onCategoria, onNuevo, onCambio }: Props) {
  const { confirm } = useConfirm();
  const [buscar, setBuscar] = useState("");
  const [borrando, setBorrando] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const lista = categoriasDeLista(gastos);
    // La elegida en una tarjeta puede no tener gastos en este período: igual se ve.
    if (categoria && !lista.some((c) => normalizar(c.categoria) === normalizar(categoria))) lista.push({ categoria, cuantos: 0 });
    return lista;
  }, [gastos, categoria]);
  const visibles = useMemo(
    /* Por el DÍA del gasto (Lima), no por la hora guardada: uno anotado sin fecha a las 20:00
       del 04 se guarda como 01:00 UTC del 05 y saltaba arriba de los del 05 (revisión 09-10). */
    () =>
      filtrarGastos(gastos, { buscar, categoria, descripcion: queDelGasto })
        .map((g, i) => ({ g, i, dia: diaDelGasto(g.date) }))
        .sort((a, b) => (a.dia === b.dia ? a.i - b.i : a.dia < b.dia ? 1 : -1))
        .map(({ g }) => g),
    [gastos, buscar, categoria],
  );
  const filtrado = buscar.trim() !== "" || categoria != null;
  const limpiar = () => { setBuscar(""); onCategoria(null); };

  const borrar = async (g: GastoDeLaLista) => {
    const ok = await confirm({
      title: `¿Borrar «${queDelGasto(g)}» de ${formatCurrency(Number(g.amount))}?`,
      description: lineaDeCajaAlBorrar(g.caja),
      intent: "danger",
      confirmLabel: "Borrar",
      cancelLabel: "No borrar",
    });
    if (!ok) return;
    setBorrando(g.id);
    try {
      const res = await fetch(`/api/expenses/${g.id}`, { method: "DELETE", headers: csrfHeaders() });
      const body = (await res.json().catch(() => ({}))) as { error?: string; caja?: { retiro: string; aviso: string } };
      if (!res.ok) toast.error(body.error ?? "No se pudo borrar el gasto");
      // Lo que el servidor HIZO con la caja (pudo cerrarse entre la lista y el clic).
      else if (body.caja?.retiro === "cerrada") toast.warning(body.caja.aviso);
      else if (body.caja) toast.success(body.caja.aviso);
      else toast.success(`Borraste «${queDelGasto(g)}»`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo borrar el gasto");
    } finally {
      setBorrando(null);
      onCambio();
    }
  };

  if (gastos.length === 0 && !categoria) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-12 text-center">
        <TrendingUp className="mx-auto mb-3 h-12 w-12 text-[var(--text-tertiary)]" aria-hidden />
        <p className="mb-4 font-bold text-[var(--text-primary)]">Sin gastos del {diaConNombre(desde)} al {diaConNombre(hasta)}</p>
        <button type="button" onClick={onNuevo} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary/90">
          <Plus className="h-4 w-4" aria-hidden />Anotar un gasto
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-[2_1_14rem]">
          <span className="sr-only">Buscar gasto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar: luz, alquiler, proveedor, N°…"
            className={`${campo()} pl-9`}
          />
        </label>
        <select
          value={categoria ? (categorias.find((c) => normalizar(c.categoria) === normalizar(categoria))?.categoria ?? categoria) : ""}
          onChange={(e) => onCategoria(e.target.value || null)}
          aria-label="Categoría"
          className={`${campo()} min-w-0 flex-[1_1_11rem] sm:w-auto`}
        >
          <option value="">Todas las categorías ({gastos.length})</option>
          {categorias.map((c) => (
            <option key={c.categoria} value={c.categoria}>{conMayuscula(c.categoria)} ({c.cuantos})</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => exportToCSV(filasCsv(visibles), `gastos-${desde}-al-${hasta}${categoria ? `-${categoria}` : ""}`)}
          disabled={visibles.length === 0}
          className="inline-flex h-10 max-sm:h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />Descargar CSV
        </button>
      </div>

      {filtrado && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <span>
            <span className="font-bold text-[var(--text-primary)]">{visibles.length}</span> de {gastos.length} gastos
            {visibles.length > 0 && <> · {formatCurrency(visibles.reduce((s, g) => s + Number(g.amount), 0))}</>}
          </span>
          <button type="button" onClick={limpiar} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-[var(--accent-dark)] hover:bg-[var(--surface-sunken)]">
            <X className="h-3.5 w-3.5" aria-hidden />Limpiar
          </button>
        </p>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-8 text-center">
          <p className="mb-3 font-bold text-[var(--text-primary)]">
            {buscar.trim() ? `Ningún gasto con «${buscar.trim()}»` : "Ningún gasto de esa categoría"} en este período
          </p>
          <button type="button" onClick={limpiar} className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            Ver todos
          </button>
        </div>
      ) : (
        <ul className="max-h-100 space-y-2 overflow-y-auto">
          {visibles.map((e) => (
            <FilaGasto key={e.id} gasto={e} borrando={borrando === e.id} onBorrar={() => borrar(e)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaGasto({ gasto: e, borrando, onBorrar }: { gasto: GastoDeLaLista; borrando: boolean; onBorrar: () => void }) {
  const CatIcon = iconoDeCategoria(e.category);
  const papel = papelDelGasto(e);
  const que = queDelGasto(e);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-2 sm:px-4 sm:py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]">
        <CatIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--text-primary)]">{que}</p>
        <p className="text-xs text-[var(--text-tertiary)]">
          {diaConNombre(diaDelGasto(e.date))} · <span className="capitalize">{e.category}</span>
          {e.recurring && " · Recurrente"}
          {e.caja && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-[var(--text-secondary)]">
              · <Wallet className="h-3 w-3" aria-hidden />de la caja
            </span>
          )}
        </p>
        {papel && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            <Receipt className="h-3 w-3 shrink-0" aria-hidden />{papel}
            {e.attachmentUrl && (
              <a href={e.attachmentUrl} target="_blank" rel="noreferrer" aria-label="Ver la foto del comprobante" className="ml-1 inline-flex items-center text-[var(--accent-dark)] hover:underline">
                <Camera className="h-3 w-3" />
              </a>
            )}
          </p>
        )}
      </div>
      <p className="shrink-0 font-extrabold text-[var(--data-error-500)]">-{formatCurrency(Number(e.amount))}</p>
      <button
        type="button"
        aria-label={`Borrar «${que}»`}
        onClick={onBorrar}
        disabled={borrando}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-500)] disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}
