"use client";

/**
 * Mi Plata › Comparar períodos — una semana, mes, trimestre o año de Lima
 * contra el anterior o contra el mismo de hace un año.
 *
 * Bug 11-10: sumaba EN EL NAVEGADOR las últimas 1 000 ventas del POS que trae
 * `/api/admin/dashboard`, con el reloj del navegador. Dejaba afuera los
 * pedidos concretados (el año 2026 de `main` daba S/ 259,30; Mi Plata,
 * S/ 397,50) y contaba la venta anónima como un cliente. Ahora todo sale del
 * servidor (`/api/finanzas/comparativo?periodo=…`) con la regla de ventas de
 * Mi Plata; lo que no se puede calcular llega `null` y se ve «—».
 *
 * Patrón del panel: cabecera en una fila (título · ⓘ · período · ‹ › ·
 * contra · Más) y una tabla en vez de 6 tarjetas con barras.
 */

import { DataTable, SectionTitle } from "@buleje/design-system";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
} from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useCompararPeriodos } from "@/components/admin/comparar-periodos/use-comparar-periodos";
import {
  Cambio,
  cambioDe,
  esMejora,
  ListaMovil,
  METRICAS,
  unidad,
  valor,
  type Fila,
} from "@/components/admin/comparar-periodos/metricas";
import { cn, exportToCSV, limaDateKey } from "@/lib/utils";
import {
  periodoSiguiente,
  rangoDeComparacion,
  rangoDelPeriodo,
  type ContraPeriodo,
  type Periodo,
} from "@/lib/finance/comparativo-periodos";

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anyo", label: "Año" },
];

const CONTRAS: { value: ContraPeriodo; label: string }[] = [
  { value: "anterior", label: "vs. anterior" },
  { value: "hace_un_anyo", label: "vs. hace un año" },
];

const FLECHA =
  "inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-40";

export default function PeriodComparatorTab() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [contra, setContra] = useState<ContraPeriodo>("anterior");
  /** null = el período de hoy; si no, un día dentro del período que se mira. */
  const [fecha, setFecha] = useState<string | null>(null);
  const { datos, cargando, error, recargar } = useCompararPeriodos(periodo, contra, fecha);

  const hoy = limaDateKey(new Date());
  const rango = rangoDelPeriodo(periodo, fecha ?? hoy);
  const enCurso = rango.hasta >= hoy;
  const irAtras = () => setFecha(rangoDeComparacion(periodo, rango, "anterior").desde);
  const irAdelante = () => {
    const siguiente = periodoSiguiente(periodo, rango);
    setFecha(siguiente.hasta >= hoy ? null : siguiente.desde);
  };

  /* Se muestra lo que corresponde a lo elegido; mientras carga lo nuevo, lo
     anterior queda a la vista atenuado (aria-busy), sin parpadear a vacío. */
  const vigente =
    datos &&
    datos.periodo === periodo &&
    datos.contra === contra &&
    datos.actual.desde === rango.desde
      ? datos
      : null;
  const mostrado = vigente ?? datos;

  const filas = useMemo<Fila[]>(
    () =>
      mostrado
        ? METRICAS.map((m) => ({
            ...m,
            a: mostrado.actual[m.key],
            b: mostrado.base[m.key],
            cambio: cambioDe(m.tipo, mostrado.actual[m.key], mostrado.base[m.key]),
          }))
        : [],
    [mostrado],
  );
  const juzgables = filas
    .map((f) => esMejora(f.cambio, f.sentido))
    .filter((x): x is boolean => x != null);
  const mejoraron = juzgables.filter(Boolean).length;

  const exportar = () => {
    if (!mostrado) return;
    exportToCSV(
      filas.map((f) => ({
        metrica: f.label,
        [mostrado.actual.etiqueta]: valor(f.tipo, f.a),
        [mostrado.base.etiqueta]: valor(f.tipo, f.b),
        cambio: f.cambio == null ? "—" : `${f.cambio.toFixed(1)} ${unidad(f.tipo)}`,
      })),
      `comparar-${periodo}-${mostrado.actual.desde}`,
    );
  };

  return (
    <div className="space-y-3">
      {/* Una fila: título · ⓘ · período · ‹ › · contra · Más. */}
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">
          Comparar períodos
        </SectionTitle>
        <InfoTip
          title="Comparar períodos"
          what="Una semana, mes, trimestre o año contra el anterior o contra el mismo de hace un año. Ventas = mostrador + pedidos concretados, igual que el Resumen de Mi Plata."
          affects="El margen y el costo sólo cuentan las ventas que guardaron su costo. Clientes únicos = teléfonos distintos que compraron (la venta sin cliente no cuenta). «—» = no hay con qué comparar."
          example="Con «Mes» y ‹ ves setiembre contra agosto. La semana va de lunes a domingo, en hora de Lima."
        />
        <SegmentedControl
          value={periodo}
          onChange={setPeriodo}
          options={PERIODOS}
          size="lg"
          label="Período"
        />
        <div className="inline-flex gap-1">
          <button
            type="button"
            onClick={irAtras}
            className={FLECHA}
            aria-label="Período anterior"
            title="Período anterior"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={irAdelante}
            disabled={enCurso}
            className={FLECHA}
            aria-label="Período siguiente"
            title="Período siguiente"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {/* Un select y no otro segmentado: con los dos, «Más» caía a otra fila a 1280 px. */}
        <select
          aria-label="Comparar contra"
          value={contra}
          onChange={(e) => setContra(e.target.value as ContraPeriodo)}
          className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {CONTRAS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="ml-auto">
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            actions={[
              {
                id: "hoy",
                label: "Volver al período de hoy",
                icon: RotateCcw,
                onSelect: () => setFecha(null),
                disabled: fecha == null,
              },
              { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: recargar },
              {
                id: "csv",
                label: "Descargar (CSV)",
                icon: Download,
                onSelect: exportar,
                disabled: !mostrado,
              },
            ]}
          />
        </div>
      </div>

      {error && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-ink)]">
          No se pudo cargar la comparación ({error}).
          <button type="button" onClick={recargar} className="min-h-12 rounded-xl px-3 underline">
            Reintentar
          </button>
        </p>
      )}

      {!error && !mostrado && cargando && (
        <p className="py-6 text-sm text-[var(--text-secondary)]">Cargando la comparación…</p>
      )}

      {!error && mostrado && (
        <div aria-busy={cargando || !vigente} className={cn("space-y-2", !vigente && "opacity-60")}>
          <ListaMovil
            filas={filas}
            etiquetaActual={mostrado.actual.etiqueta}
            etiquetaBase={mostrado.base.etiqueta}
          />
          {juzgables.length > 0 && (
            <p className="text-right text-sm font-semibold text-[var(--text-secondary)] sm:hidden">
              {mejoraron} de {juzgables.length} mejoraron
            </p>
          )}
          <DataTable zebra wrapperClassName="hidden sm:block">
            <thead>
              <tr>
                <th>Métrica</th>
                <th className="text-right">{mostrado.actual.etiqueta}</th>
                <th className="text-right">{mostrado.base.etiqueta}</th>
                <th className="text-right">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.key}>
                  {/* Sin estilos propios en las celdas (ley 10): el peso y el
                      color van en un span, como en el resto del panel. */}
                  <td><span className="font-semibold">{f.label}</span></td>
                  <td className="text-right">
                    <span className="font-bold tabular-nums">{valor(f.tipo, f.a)}</span>
                  </td>
                  <td className="text-right">
                    <span className="tabular-nums text-[var(--text-secondary)]">{valor(f.tipo, f.b)}</span>
                  </td>
                  <td className="text-right">
                    <Cambio cambio={f.cambio} sentido={f.sentido} tipo={f.tipo} />
                  </td>
                </tr>
              ))}
            </tbody>
            {juzgables.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right">
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {mejoraron} de {juzgables.length} mejoraron
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </DataTable>
        </div>
      )}
    </div>
  );
}
