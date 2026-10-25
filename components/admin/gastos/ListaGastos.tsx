"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, Search, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { decodeExpenseDescription } from "@/lib/expense-meta";
import { BarraFiltrosTabla, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { PresetsFiltros } from "@/components/admin/shared/vistas-de-filtros";
import { formatCurrency } from "@/lib/format";
import { exportToCSV } from "@/lib/utils";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import {
  categoriasDeLista, diaConNombre, diaDelGasto, filtrarGastos, lineaDeCajaAlBorrar, normalizar,
  type RetiroDelGasto,
} from "@/lib/gastos/lista-gastos";
import TablaGastos from "./TablaGastos";
import { conMayuscula, queDelGasto } from "./textos-gasto";

export type GastoDeLaLista = {
  id: string; category: string; description: string; amount: number; date: string; recurring: boolean;
  documentType?: string | null; documentNumber?: string | null; igvAmount?: number | null; attachmentUrl?: string | null;
  supplierName?: string | null; supplierRuc?: string | null; paymentMethod?: string | null;
  /** El retiro de caja del gasto (`null` = no salió del cajón). Viene con `?caja=1`. */
  caja?: RetiroDelGasto | null;
};

interface Props {
  gastos: GastoDeLaLista[];
  /** Días de Lima del período («2026-10-01»): se eligen en la fila de filtros. */
  desde: string;
  hasta: string;
  onDesde: (dia: string) => void;
  onHasta: (dia: string) => void;
  /** El buscador vive arriba: «Descargar CSV» (en el «⋯» de la cabecera) baja lo que se ve. */
  buscar: string;
  onBuscar: (texto: string) => void;
  /** Categoría elegida (también desde las tarjetas de arriba); `null` = todas. */
  categoria: string | null;
  onCategoria: (c: string | null) => void;
  /** Los autofiltros de las cabeceras, armados sobre lo que dejan el buscador y la categoría. */
  filtros: FiltrosTabla<GastoDeLaLista>;
  /** Después de borrar: volver a pedir la lista y los totales. */
  onCambio: () => void;
}

/** «01/10/2026» — como lo escribe el contador. */
const fechaCsv = (dia: string) => (dia ? dia.split("-").reverse().join("/") : "");

/** Los gastos que se ven con el buscador y la categoría, por día (lo más nuevo arriba). */
export function gastosVisibles(gastos: readonly GastoDeLaLista[], buscar: string, categoria: string | null): GastoDeLaLista[] {
  /* Por el DÍA del gasto (Lima), no por la hora guardada: uno anotado sin fecha a las 20:00
     del 04 se guarda como 01:00 UTC del 05 y saltaba arriba de los del 05 (revisión 09-10). */
  return filtrarGastos([...gastos], { buscar, categoria, descripcion: queDelGasto })
    .map((g, i) => ({ g, i, dia: diaDelGasto(g.date) }))
    .sort((a, b) => (a.dia === b.dia ? a.i - b.i : a.dia < b.dia ? 1 : -1))
    .map(({ g }) => g);
}

/** El CSV de lo que se ve, como lo pide el contador. */
export function descargarCsvGastos(visibles: readonly GastoDeLaLista[], desde: string, hasta: string, categoria: string | null): void {
  exportToCSV(filasCsv(visibles), `gastos-${desde}-al-${hasta}${categoria ? `-${categoria}` : ""}`);
}

/** Los campos de la fila de filtros: 48 px de alto, como el resto de las barras del panel. */
const FILTRO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] dark:bg-[var(--surface-sunken)]";

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

export default function ListaGastos({ gastos, desde, hasta, onDesde, onHasta, buscar, onBuscar, categoria, onCategoria, filtros, onCambio }: Props) {
  const { confirm } = useConfirm();
  /* Vistas de fábrica (25-10): los gastos sin papel para la SUNAT. */
  const presets = useMemo<PresetsFiltros>(() => [
    { id: "sin-comprobante", nombre: "Sin comprobante", ayuda: "Gastos sin boleta ni factura", estado: { facetas: { comprobante: ["Sin comprobante"] }, textos: {} } },
  ], []);
  const [borrando, setBorrando] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const lista = categoriasDeLista(gastos);
    // La elegida en una tarjeta puede no tener gastos en este período: igual se ve.
    if (categoria && !lista.some((c) => normalizar(c.categoria) === normalizar(categoria))) lista.push({ categoria, cuantos: 0 });
    return lista;
  }, [gastos, categoria]);
  const visibles = useMemo(() => gastosVisibles(gastos, buscar, categoria), [gastos, buscar, categoria]);
  const filtrado = buscar.trim() !== "" || categoria != null;
  const limpiar = () => { onBuscar(""); onCategoria(null); };

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

  /* La fila de filtros va SIEMPRE (también sin gastos: si no, no se podía cambiar el período). */
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-[2_1_14rem]">
          <span className="sr-only">Buscar gasto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={buscar}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Buscar: luz, alquiler, proveedor, N°…"
            className={`${FILTRO} pl-9`}
          />
        </label>
        <select
          value={categoria ? (categorias.find((c) => normalizar(c.categoria) === normalizar(categoria))?.categoria ?? categoria) : ""}
          onChange={(e) => onCategoria(e.target.value || null)}
          aria-label="Categoría"
          className={`${FILTRO} min-w-0 flex-[1_1_11rem] sm:w-auto`}
        >
          <option value="">Todas las categorías ({gastos.length})</option>
          {categorias.map((c) => (
            <option key={c.categoria} value={c.categoria}>{conMayuscula(c.categoria)} ({c.cuantos})</option>
          ))}
        </select>
        <div className="flex min-w-0 flex-[1_1_18rem] items-center gap-2">
          <Calendar className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && onDesde(e.target.value)} aria-label="Desde" className={`${FILTRO} min-w-0 flex-1`} />
          <span className="text-[var(--text-tertiary)]" aria-hidden>→</span>
          <input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && onHasta(e.target.value)} aria-label="Hasta" className={`${FILTRO} min-w-0 flex-1`} />
        </div>
      </div>

      {filtrado && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <span>
            <span className="font-bold text-[var(--text-primary)]">{visibles.length}</span> de {gastos.length} gastos
            {visibles.length > 0 && <> · {formatCurrency(visibles.reduce((s, g) => s + Number(g.amount), 0))}</>}
          </span>
          <button type="button" onClick={limpiar} className="inline-flex min-h-12 items-center gap-1 rounded-lg px-2 font-semibold text-[var(--accent-dark)] hover:bg-[var(--surface-sunken)]">
            <X className="h-4 w-4" aria-hidden />Limpiar
          </button>
        </p>
      )}

      {gastos.length === 0 && !categoria ? (
        /* Una frase: «Anotar gasto» ya está en la cabecera, a la vista. */
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
          Sin gastos del {diaConNombre(desde)} al {diaConNombre(hasta)}.
        </p>
      ) : visibles.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {buscar.trim() ? `Ningún gasto con «${buscar.trim()}»` : "Ningún gasto de esa categoría"} en este período.
          </p>
          <button type="button" onClick={limpiar} className="inline-flex h-12 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]">
            Ver todos
          </button>
        </div>
      ) : (
        <>
          <BarraFiltrosTabla vistas="gastos" presets={presets} f={filtros} />
          <TablaGastos filtros={filtros} borrando={borrando} onBorrar={borrar} />
        </>
      )}
    </div>
  );
}
