"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Calculator, CheckCircle2, Eye } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn, limaDateKey } from "@/lib/utils";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { PresetsFiltros } from "@/components/admin/shared/vistas-de-filtros";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { FILTROS, STATUS_MAP, dentroDeTolerancia, fmt, fmtSigno, horaLima, lecturaDelConteo, type CashAudit, type FiltroCuadre } from "./arqueo-shared";

const PAGINA = 20;

const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");
const conteoDe = (a: CashAudit) => lecturaDelConteo(a);

/** Filtros de columna (como Adelantos › Lista) sobre lo que pasan los chips de estado: los cuadres llegan enteros. */
const COLUMNAS: readonly ColumnaFiltro<CashAudit>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (a) => a.openedAt ? limaDateKey(a.openedAt) || null : null, formatearValor: ddmm },
  { id: "turno", label: "Turno", tipo: "multi", valor: (a) => a.turno, soloConVarios: true },
  { id: "cajero", label: "Cajero/a", tipo: "texto", valor: (a) => [a.cajero, a.cerro ?? "", a.notes ?? ""] },
  { id: "esperado", label: "Esperado", tipo: "rango", numero: (a) => a.expectedAmount, unidad: "S/", paso: 0.01 },
  { id: "contado", label: "Contado", tipo: "rango", numero: (a) => conteoDe(a).contado, unidad: "S/", paso: 0.01 },
  { id: "diferencia", label: "Diferencia", tipo: "rango", numero: (a) => conteoDe(a).diferencia, unidad: "S/", paso: 0.01 },
  { id: "estado", label: "Estado", tipo: "multi", valor: (a) => STATUS_MAP[a.status].label, soloConVarios: true },
];

const ORDEN: Record<string, AccesorOrden<CashAudit>> = {
  fecha: { valor: (a) => (a.openedAt ? new Date(a.openedAt).getTime() : null) },
  turno: { valor: (a) => a.turno, texto: true },
  cajero: { valor: (a) => a.cajero, texto: true },
  esperado: { valor: (a) => a.expectedAmount },
  contado: { valor: (a) => conteoDe(a).contado },
  diferencia: { valor: (a) => conteoDe(a).diferencia },
  estado: { valor: (a) => STATUS_MAP[a.status].label, texto: true },
};

/** Celda sin medir: palabra en gris, nunca «S/ 0». */
function SinDato({ texto, porque }: { texto: string | null; porque: string | null }) {
  return <span className="text-sm font-semibold text-[var(--text-secondary)]" title={porque ?? undefined}>{texto ?? "—"}</span>;
}

/**
 * Historial de cuadres con sus filtros pegados. `GET /api/cash-registers`
 * devuelve TODAS las cajas: con un año de cierres diarios la tabla pasaba de
 * 300 filas, así que se muestran de a 20 («Ver más»).
 *
 * El buscador (fecha, cajero o nota) vino de la tabla del Historial de cajas,
 * que repetía esta y se fue el 10-10. De ella vino también la tolerancia del
 * negocio: una diferencia de hasta ± `tolerancia` sale «Dentro de tolerancia».
 */
export default function TablaCuadres({
  audits,
  onVer,
  onIrACaja,
  tolerancia,
}: {
  audits: CashAudit[];
  onVer: (a: CashAudit) => void;
  onIrACaja?: () => void;
  /** La de Caja (`cashTolerance`). Sin ella, sólo el céntimo decide. */
  tolerancia?: number;
}) {
  const [filtro, setFiltro] = useState<FiltroCuadre>("todos");
  const [visibles, setVisibles] = useState(PAGINA);

  const cuenta = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id, audits.filter(f.pasa).length])) as Record<FiltroCuadre, number>, [audits]);
  const delChip = useMemo(() => {
    const pasa = FILTROS.find((x) => x.id === filtro)!.pasa;
    return audits.filter(pasa);
  }, [audits, filtro]);
  /* Vistas de fábrica (25-10): un clic a lo que se mira primero. */
  const presets = useMemo<PresetsFiltros>(() => {
    return [
      { id: "con-diferencia", nombre: "Con diferencia", ayuda: "Sobró o faltó plata", estado: { facetas: { estado: ["Sobrante", "Faltante"] }, textos: {} } },
      { id: "sin-conteo", nombre: "Sin conteo", ayuda: "Cerradas sin contar", estado: { facetas: { estado: ["Cerrada sin conteo"] }, textos: {} } },
    ];
  }, []);
  const fc = useFiltrosTabla(delChip, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(fc.filtradas);
  /* Diferencia acumulada de lo que se ve (todas las filas, no sólo las 20 de la página): sólo cuentan las cajas con conteo. */
  const difs = filas.map((a) => conteoDe(a).diferencia).filter((d): d is number => d != null);
  const difAcumulada = difs.reduce((n, d) => n + d, 0);

  if (audits.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
        <Calculator className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Todavía no hay cuadres: aparecen al cerrar una caja.</p>
        {onIrACaja && (
          <button type="button" onClick={onIrACaja} className="mt-3 inline-flex min-h-12 items-center rounded-xl px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ir a Caja › Hoy →
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] p-3">
        <div role="group" aria-label="Filtrar cuadres" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            onClick={() => { setFiltro(f.id); setVisibles(PAGINA); }}
            /* Filtro a 48 px (decisión de Brandon 09-10), con el patrón de chips de Pedidos. */
            className={button({
              variant: "secondary",
              className: cn("rounded-xl px-4", filtro === f.id && "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"),
            })}
          >
            {f.label} <span className="tabular-nums opacity-80">{cuenta[f.id]}</span>
          </button>
        ))}
        </div>
      </div>

      <BarraFiltrosTabla excel="Cuadres de caja" vistas="cuadres" presets={presets} f={fc} className="px-3 py-2" />
      {delChip.length === 0 ? (
        <p className="p-6 text-center text-sm text-[var(--text-secondary)]">Ningún cuadre con ese filtro.</p>
      ) : (
        <DataTable className="min-w-[640px]">
          <thead>
            <tr>
              <ThColumna label="Fecha" ids={["fecha"]} f={fc} orden={ord} ordenId="fecha" />
              <ThColumna label="Turno" ids={["turno"]} f={fc} orden={ord} ordenId="turno" />
              <ThColumna label="Cajero/a" ids={["cajero"]} f={fc} orden={ord} ordenId="cajero" />
              <ThColumna label="Esperado" ids={["esperado"]} f={fc} derecha orden={ord} ordenId="esperado" />
              <ThColumna label="Contado" ids={["contado"]} f={fc} derecha orden={ord} ordenId="contado" />
              <ThColumna label="Diferencia" ids={["diferencia"]} f={fc} derecha orden={ord} ordenId="diferencia" />
              <ThColumna label="Estado" ids={["estado"]} f={fc} orden={ord} ordenId="estado" />
              <th data-label="Ver"><span className="sr-only">Ver</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <SinCoincidenciasFila colSpan={8} />}
            {filas.slice(0, visibles).map((a) => {
              const s = STATUS_MAP[a.status];
              const SIcon = s.icon;
              const l = lecturaDelConteo(a);
              const conteo = a.conteos[0];
              const tolerada = dentroDeTolerancia(a, tolerancia);
              return (
                <tr key={a.id}>
                  <td className="font-bold">{a.fecha}<span className="block text-sm font-normal text-[var(--text-secondary)]">{horaLima(a.openedAt)}</span></td>
                  <td className="capitalize text-[var(--text-secondary)]">{a.turno}</td>
                  <td className="font-semibold">{a.cajero}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmt(a.expectedAmount)}</td>
                  <td className="text-right font-bold tabular-nums">
                    {l.contado != null ? fmt(l.contado) : conteo ? <span title={`Conteo express a las ${horaLima(conteo.creadoEn)}`}>{fmt(conteo.contado)}*</span> : <SinDato texto={l.etiqueta} porque={l.porque} />}
                  </td>
                  <td className={cn("text-right font-extrabold tabular-nums", l.diferencia == null || l.diferencia === 0 ? "text-[var(--text-secondary)]" : tolerada || l.diferencia > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]")}>
                    {l.diferencia != null ? fmtSigno(l.diferencia) : <SinDato texto={l.etiqueta} porque={l.porque} />}
                  </td>
                  <td>
                    {tolerada ? (
                      <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", STATUS_MAP.conforme.color)} title={`${s.label} de ${fmt(Math.abs(a.difference))}: hasta ±${fmt(tolerancia ?? 0)} se acepta`}>
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                        <span>Dentro de tolerancia <span className="whitespace-nowrap font-normal text-[var(--text-secondary)]">(±{fmt(tolerancia ?? 0)})</span></span>
                      </span>
                    ) : (
                      <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", s.color)}><SIcon className="h-4 w-4" aria-hidden />{s.label}</span>
                    )}
                  </td>
                  <td>
                    <button type="button" aria-label={`Ver el cuadre del ${a.fecha}`} onClick={() => onVer(a)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
                      <Eye className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filas.length > 0 && (
            <tfoot className="max-sm:hidden">
              <tr className="border-t-2 border-[var(--rule-base)] font-bold">
                <td colSpan={5}>{fc.activos > 0 ? "Total de lo que se ve" : "Total"} · {filas.length} {filas.length === 1 ? "cuadre" : "cuadres"}</td>
                <td className="text-right tabular-nums" title={difs.length < filas.length ? `Suma de los ${difs.length} cuadres con conteo` : undefined}>
                  {difs.length === 0 ? "—" : fmtSigno(difAcumulada)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </DataTable>
      )}

      {filas.length > visibles && (
        <div className="border-t border-[var(--rule-soft)] p-2 text-center">
          <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} className="min-h-12 rounded-xl px-4 text-sm font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver {Math.min(PAGINA, filas.length - visibles)} más de {filas.length - visibles}
          </button>
        </div>
      )}
    </section>
  );
}
