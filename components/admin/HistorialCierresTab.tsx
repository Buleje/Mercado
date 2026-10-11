"use client";

/**
 * Mi Plata › Impuestos y reportes › Cierres: cada día cerrado en UNA fila con
 * lo vendido y su cuadre de caja; el detalle (fiados, stock, notas) en la ficha.
 *
 * Antes (medido 11-10): 30 filas por página con un botón «Ver» de 32 px cada
 * una (2,21 pantallas, 46 botones bajos), la diferencia en «N/A» y la fecha
 * corrida un día (medianoche UTC leída en la hora del navegador).
 */
import { useCallback, useEffect, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { CalendarClock, ChevronLeft, ChevronRight, Download, MoreHorizontal, RefreshCw, Wallet } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { abrirCierreDiario } from "@/lib/admin/abrir-cierre-diario";
import { exportToExcel } from "@/lib/export-excel";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { fechaDelCierre, textoDiferencia, type CierreDelDia } from "./cierres/cierres";
import FichaCierre from "./cierres/FichaCierre";

type Pagina = { items: CierreDelDia[]; total: number; page: number; limit: number };

/** 15 filas de 48 px: la lista entra en una pantalla y media. */
const LIMIT = 15;
const BOTON_PAG = button({ variant: "ghost", className: "rounded-xl px-3 aria-disabled:opacity-40" });

export default function HistorialCierresTab() {
  const [data, setData] = useState<Pagina | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [ficha, setFicha] = useState<CierreDelDia | null>(null);

  const cargar = useCallback(async (p: number) => {
    setCargando(true);
    setError(false);
    try {
      const res = await fetch(`/api/cierre-diario/history?page=${p}&limit=${LIMIT}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Pagina);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(page); }, [page, cargar]);

  const exportar = () => {
    if (!data?.items.length) return;
    exportToExcel(
      data.items.map((s) => ({
        Fecha: s.fecha.slice(0, 10), "Total Ventas": Number(s.totalVentas), "Cantidad Ventas": s.cantidadVentas,
        "Ticket Promedio": Number(s.ticketPromedio), "Efectivo Contado": s.efectivoContado != null ? Number(s.efectivoContado) : "Sin contar",
        "Efectivo Esperado": Number(s.efectivoEsperado), "Diferencia Caja": Number(s.diferenciaCaja), "Fiados Cobrados": Number(s.fiadosCobrados),
        "Fiados Nuevos": Number(s.fiadosNuevos), "Fiados Vencidos": s.fiadosVencidos, "Mejor Hora": s.mejorHora ?? "",
        "Producto Top": s.productoTop ?? "", Notas: s.notas ?? "", "Creado Por": s.creadoPor,
      })) as Record<string, unknown>[],
      `historial-cierres-pag${page}`,
      "Cierres",
    );
  };

  const paginas = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="space-y-4">
      {/* Una fila: título · cuántos · Cerrar el día · Más */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Cierres del día</SectionTitle>
          <InfoTip
            title="Cierres del día"
            what="Cada día que cerraste: lo vendido y si el efectivo contado cuadró con lo esperado. Toca una fila para ver fiados, stock bajo y notas."
            affects="El conteo de cada caja (turnos) está en Caja › Historial; acá va el resumen del día entero."
            example="Sábado 10/10: S/ 850 vendidos, contaste S/ 420 y esperabas S/ 422 → −S/ 2.00."
          />
          {data && <span className="text-sm text-[var(--text-secondary)]">{data.total} días</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={abrirCierreDiario} className={button({ variant: "primary", className: "rounded-xl px-4" })}>
            <CalendarClock className="h-4 w-4" aria-hidden /> Cerrar el día
          </button>
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Bajar a Excel, cuadres en Caja, actualizar"
            actions={[
              { id: "excel", label: "Bajar esta página a Excel", hint: `${data?.items.length ?? 0} cierres`, icon: Download, disabled: !data?.items.length, onSelect: exportar },
              { id: "caja", label: "Cuadres en Caja", hint: "El conteo de cada caja cerrada", icon: Wallet, seccion: "Ver", onSelect: () => irAEnlace("/admin?tab=ventas-caja&vista=caja-registradora&sub=historial") },
              { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void cargar(page) },
            ]}
          />
        </div>
      </div>

      {cargando && !data ? (
        <TableSkeleton rows={6} cols={4} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />
      ) : error ? (
        <p role="alert" className="flex items-center gap-2 py-6 text-sm text-[var(--data-error-ink)]">
          No se pudieron leer los cierres.
          <button type="button" onClick={() => void cargar(page)} className={button({ variant: "secondary", className: "rounded-xl" })}>Reintentar</button>
        </p>
      ) : !data?.items.length ? (
        <p className="py-6 text-sm text-[var(--text-secondary)]">Todavía no cerraste ningún día.</p>
      ) : (
        <div className={cn("space-y-2", cargando && "opacity-60")}>
          {/* Una tabla del DS como todas: la fila entera abre la ficha (clic,
              Enter o espacio); en el celular pasa a tarjetas sola. */}
          <DataTable>
            <thead>
              <tr>
                <th>Día</th>
                <th className="text-right">Vendido</th>
                <th className="hidden text-right sm:table-cell">Ventas</th>
                <th className="hidden text-right sm:table-cell">Contado</th>
                <th className="text-right">Cuadre</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => {
                const dif = textoDiferencia(s);
                const dia = fechaDelCierre(s.fecha);
                return (
                  <tr
                    key={s.id}
                    tabIndex={0}
                    aria-label={`Ver el cierre del ${dia}`}
                    onClick={() => setFicha(s)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFicha(s); } }}
                    className="cursor-pointer"
                  >
                    <td className="capitalize">{dia}</td>
                    <td className="text-right font-bold tabular-nums">{formatCurrency(Number(s.totalVentas))}</td>
                    <td className="hidden text-right tabular-nums sm:table-cell">{s.cantidadVentas}</td>
                    <td className="hidden text-right tabular-nums sm:table-cell">{s.efectivoContado != null ? formatCurrency(Number(s.efectivoContado)) : "—"}</td>
                    <td className={cn("text-right font-semibold tabular-nums", dif.clase)}>{dif.texto}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {paginas > 1 && (
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => page > 1 && setPage(page - 1)} aria-disabled={page <= 1} className={BOTON_PAG}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> Más nuevos
              </button>
              <span className="text-sm text-[var(--text-secondary)]">Página {page} de {paginas}</span>
              <button type="button" onClick={() => page < paginas && setPage(page + 1)} aria-disabled={page >= paginas} className={BOTON_PAG}>
                Más viejos <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}

      {ficha && <FichaCierre cierre={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
