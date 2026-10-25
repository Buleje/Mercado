"use client";

/**
 * La tabla de Caja › Historial › Por día: una fila por día con lo vendido y el
 * cuadre de sus cajas cerradas. Todo viene armado del servidor
 * (`/api/cash-registers/por-dia`); acá sólo se elige el color.
 *
 * Una caja cerrada sin conteo (`close(null)`) no suma a «Real» ni a «Total
 * recaudado» y su día no sale «OK»: sale «Sin conteo». El día se juzga por la
 * PEOR caja: +5 en una y −5 en otra dan 0 de neto y el día no cuadró.
 */
import { useMemo, type KeyboardEvent } from "react";
import { CardTitle, DataTable, EmptyState } from "@buleje/design-system";
import { AlertTriangle, Check, History, MinusCircle } from "@buleje/design-system/icons";
import type { DiaDeCaja, TotalesDeCaja } from "@/lib/caja/cierres-por-dia";
import { formatDateShort, formatWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { fmt } from "./tipos";

type EstadoDia = "ok" | "sin_conteo" | "sin_caja" | "menor" | "alerta";

const VERDE = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const AMBAR = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const CHIP = "inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-sm font-semibold";

function estadoDelDia(d: DiaDeCaja, tolerancia: number): { estado: EstadoDia; ok: boolean; menor: boolean } {
  const ok = d.cuadre.peor <= tolerancia;
  const menor = !ok && d.cuadre.peor <= tolerancia * 2;
  if (d.cuadre.cajas === 0) return { estado: "sin_caja", ok: true, menor: false };
  return { estado: !ok ? (menor ? "menor" : "alerta") : d.cuadre.sinConteo > 0 ? "sin_conteo" : "ok", ok, menor };
}

function ChipEstado({ estado }: { estado: EstadoDia }) {
  if (estado === "ok") return <span className={cn(CHIP, "bg-[var(--data-success-500)]/12", VERDE)}><Check className="h-4 w-4" aria-hidden />OK</span>;
  if (estado === "sin_conteo") return <span className={cn(CHIP, "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}><MinusCircle className="h-4 w-4" aria-hidden />Sin conteo</span>;
  if (estado === "sin_caja") return <span className={cn(CHIP, "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}><MinusCircle className="h-4 w-4" aria-hidden />Sin caja</span>;
  if (estado === "menor") return <span className={cn(CHIP, "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15", AMBAR)}><AlertTriangle className="h-4 w-4" aria-hidden />Menor</span>;
  return <span className={cn(CHIP, "bg-[var(--data-error-100)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]")}><AlertTriangle className="h-4 w-4" aria-hidden />Alerta</span>;
}

const ROTULO_ESTADO: Record<EstadoDia, string> = { ok: "OK", sin_conteo: "Sin conteo", sin_caja: "Sin caja", menor: "Menor", alerta: "Alerta" };
const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");

/** Una fila por día, con su estado ya juzgado (la tolerancia es de la tienda). */
type Fila = { d: DiaDeCaja; estado: EstadoDia; ok: boolean; menor: boolean; contadas: number };

/** Filtros de columna (como Adelantos › Lista): los días del rango llegan enteros del servidor. */
const COLUMNAS: readonly ColumnaFiltro<Fila>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: ({ d }) => d.dia, formatearValor: ddmm },
  { id: "vendido", label: "Vendido", tipo: "rango", numero: ({ d }) => d.ventas.total, unidad: "S/", paso: 0.01 },
  { id: "esperado", label: "Esperado", tipo: "rango", numero: ({ d, contadas }) => (contadas === 0 ? null : d.cuadre.esperado), unidad: "S/", paso: 0.01 },
  { id: "real", label: "Real", tipo: "rango", numero: ({ d, contadas }) => (contadas === 0 ? null : d.cuadre.contado), unidad: "S/", paso: 0.01 },
  { id: "diferencia", label: "Diferencia", tipo: "rango", numero: ({ d, contadas }) => (contadas === 0 ? null : d.cuadre.diferencia), unidad: "S/", paso: 0.01 },
  { id: "estado", label: "Estado", tipo: "multi", valor: ({ estado }) => ROTULO_ESTADO[estado], soloConVarios: true },
];

const ORDEN: Record<string, AccesorOrden<Fila>> = {
  fecha: { valor: ({ d }) => d.dia },
  vendido: { valor: ({ d }) => d.ventas.total },
  esperado: { valor: ({ d, contadas }) => (contadas === 0 ? null : d.cuadre.esperado) },
  real: { valor: ({ d, contadas }) => (contadas === 0 ? null : d.cuadre.contado) },
  diferencia: { valor: ({ d, contadas }) => (contadas === 0 ? null : d.cuadre.diferencia) },
  estado: { valor: ({ estado }) => ROTULO_ESTADO[estado], texto: true },
};

interface Props {
  dias: DiaDeCaja[];
  totales: TotalesDeCaja;
  tolerancia: number;
  /** Lo vendido del día (venía de los cierres de Mi Plata): sólo quien veía Mi Plata. */
  veVentas: boolean;
  /** Abre la ficha del día (ventas, cuadre, fiados, stock, notas). */
  onVer?: (d: DiaDeCaja) => void;
  cargando?: boolean;
}

export function CajaPorDiaTabla({ dias, totales, tolerancia, veVentas, onVer, cargando }: Props) {
  /* Sin las ventas a la vista, un día sin cajas sería una fila vacía. */
  const base = useMemo<Fila[]>(
    () =>
      (veVentas ? dias : dias.filter((d) => d.cuadre.cajas > 0)).map((d) => ({
        d,
        ...estadoDelDia(d, tolerancia),
        contadas: d.cuadre.cajas - d.cuadre.sinConteo,
      })),
    [dias, veVentas, tolerancia],
  );
  /* Sin las ventas a la vista, «Vendido» tampoco se filtra. */
  const columnas = useMemo(() => (veVentas ? COLUMNAS : COLUMNAS.filter((c) => c.id !== "vendido")), [veVentas]);
  const f = useFiltrosTabla(base, columnas);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  const { discrepancia } = totales;
  /* Con filtros puestos, las cifras de arriba (todo el rango) ya no son lo que se ve: acá va lo de las filas. */
  const vistoVendido = filas.reduce((a, { d }) => a + d.ventas.total, 0);
  const vistoDif = filas.reduce((a, { d, contadas }) => a + (contadas === 0 ? 0 : d.cuadre.diferencia), 0);

  return (
    <section className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden", cargando && "opacity-60")}>
      <div className="px-4 sm:px-5 py-3 border-b border-[var(--rule-soft)] flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Por día</CardTitle>
        <span className="text-[var(--text-secondary)]">Días con cierres <b className="text-[var(--text-primary)] tabular-nums">{totales.dias}</b></span>
        {totales.sinConteo > 0 && (
          <span className="text-[var(--text-secondary)]">Cerradas sin conteo <b className="text-[var(--text-primary)] tabular-nums">{totales.sinConteo}</b></span>
        )}
        <span className="text-[var(--text-secondary)]">Total recaudado <b className="text-[var(--text-primary)] tabular-nums">{fmt(totales.recaudado)}</b></span>
        <span className="text-[var(--text-secondary)]">
          Diferencia acumulada{" "}
          <b className={cn("tabular-nums", discrepancia > 10 ? "text-[var(--data-error-500)]" : discrepancia > 0 ? AMBAR : VERDE)}>{fmt(discrepancia)}</b>
        </span>
      </div>
      {f.activos > 0 && (
        <div className="px-4 sm:px-5 py-2 border-b border-[var(--rule-soft)] flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">Total de lo que se ve</span>
          <span>{filas.length} {filas.length === 1 ? "día" : "días"}</span>
          {veVentas && <span>Vendido <b className="text-[var(--text-primary)] tabular-nums">{fmt(vistoVendido)}</b></span>}
          <span>Diferencia neta <b className="text-[var(--text-primary)] tabular-nums">{fmt(vistoDif)}</b></span>
        </div>
      )}
      <BarraFiltrosTabla f={f} className="px-4 sm:px-5 py-2" />
      {base.length === 0 ? (
        <EmptyState icon={History} title="Sin cajas cerradas" description="No hay cierres en el rango seleccionado." className="p-6" />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <ThColumna label="Fecha" ids={["fecha"]} f={f} orden={ord} ordenId="fecha" />
              {veVentas && <ThColumna label="Vendido" ids={["vendido"]} f={f} derecha orden={ord} ordenId="vendido" />}
              <ThColumna label="Esperado" ids={["esperado"]} f={f} derecha orden={ord} ordenId="esperado" />
              <ThColumna label="Real" ids={["real"]} f={f} derecha orden={ord} ordenId="real" />
              <ThColumna label="Diferencia" ids={["diferencia"]} f={f} derecha orden={ord} ordenId="diferencia" />
              <ThColumna label="Estado" ids={["estado"]} f={f} className="text-center" orden={ord} ordenId="estado" />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <SinCoincidenciasFila colSpan={veVentas ? 6 : 5} />}
            {filas.map(({ d, estado, ok, menor, contadas }) => {
              const c = d.cuadre;
              const compensa = c.faltante > 0.005 && c.sobrante > 0.005;
              const abrir = onVer ? () => onVer(d) : undefined;
              return (
                <tr
                  key={d.dia}
                  className={cn(!ok && "bg-[var(--data-error-50)]/30", abrir && "cursor-pointer")}
                  {...(abrir && {
                    tabIndex: 0,
                    "aria-label": `Ver el cierre del ${formatDateShort(d.dia + "T12:00:00")}`,
                    onClick: abrir,
                    onKeyDown: (e: KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrir();
                      }
                    },
                  })}
                >
                  <td>
                    <p className="font-bold text-[var(--text-primary)]">{formatWeekday(d.dia + "T12:00:00")} {formatDateShort(d.dia + "T12:00:00")}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {c.cajas === 0 ? "Sin caja cerrada" : `${c.cajas} caja${c.cajas > 1 ? "s" : ""}`}
                      {c.sinConteo > 0 && ` · ${c.sinConteo} sin conteo`}
                    </p>
                  </td>
                  {veVentas && (
                    <td className="text-right">
                      <p className="font-bold tabular-nums">{fmt(d.ventas.total)}</p>
                      {d.ventas.cantidad > 0 && (
                        <p className="text-sm text-[var(--text-secondary)] tabular-nums">
                          {d.ventas.cantidad} venta{d.ventas.cantidad > 1 ? "s" : ""} · ticket {fmt(d.ventas.ticket)}
                        </p>
                      )}
                    </td>
                  )}
                  {contadas === 0 ? (
                    <>
                      <td className="text-right text-[var(--text-tertiary)]">—</td>
                      <td className="text-right text-[var(--text-tertiary)]">—</td>
                      <td className="text-right text-[var(--text-tertiary)]">—</td>
                    </>
                  ) : (
                    <>
                      <td className="text-right text-[var(--text-secondary)] font-semibold tabular-nums">{fmt(c.esperado)}</td>
                      <td className="text-right font-bold tabular-nums">{fmt(c.contado)}</td>
                      <td className={cn("text-right font-extrabold tabular-nums", ok ? VERDE : menor ? AMBAR : "text-[var(--data-error-500)]")}>
                        {c.diferencia > 0 ? "+" : ""}
                        {fmt(c.diferencia)}
                        {/* Faltó en una caja y sobró en otra: el neto los esconde. */}
                        {compensa && <span className="block text-sm font-semibold text-[var(--text-secondary)]">faltó {fmt(c.faltante)} · sobró {fmt(c.sobrante)}</span>}
                      </td>
                    </>
                  )}
                  <td className="text-center">
                    <ChipEstado estado={estado} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
