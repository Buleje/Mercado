"use client";

/**
 * Análisis › Alertas › Qué revisar: lo raro del negocio que pide una acción
 * (`/api/analytics/anomalias`: venta baja, stock muerto, fiado vencido, margen
 * crítico), una alerta por fila, las de prioridad alta primero.
 *
 * Antes vivía al fondo de «Business Intelligence», debajo de seis tarjetas que
 * repetían Inicio y de una proyección que repetía Predicción. Su «→» llevaba a
 * `/admin/ventas`, `/admin/productos?search=…` y `/admin/fiados`: rutas que no
 * existen (404). Ahora cada fila abre la pestaña del panel que corresponde.
 *
 * 11-10 («todo parejo»): de lista con párrafos a `DataTable` —medido 132
 * palabras de texto corrido a la vista con 10 alertas— y la prioridad y el
 * tipo se filtran en su cabecera (autofiltro del panel), en la misma fila.
 * En el celular la cabecera de la tabla se oculta (tarjetas): ahí los mismos
 * dos filtros van en una fila de selects de 48 px pegada a la lista.
 */

import { useEffect, useState } from "react";
import { DataTable, LoadingState } from "@buleje/design-system";
import { AlertTriangle, ChevronRight, RefreshCw } from "@buleje/design-system/icons";
import type { Anomalia } from "@/app/api/analytics/anomalias/route";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { button } from "@/components/ui-system/button-variants";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

export interface EstadoAlertas {
  alertas: Anomalia[] | null;
  cargando: boolean;
  error: boolean;
  recargar: () => void;
}

const ORDEN: Record<Anomalia["severity"], number> = { alto: 0, medio: 1, bajo: 2 };

/** Una sola carga para la cuenta de la barra y para la lista. */
export function useAlertasNegocio(): EstadoAlertas {
  const [alertas, setAlertas] = useState<Anomalia[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setCargando(true);
    setError(false);
    fetch("/api/analytics/anomalias", { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { anomalias?: Anomalia[] }) => {
        const lista = [...(d.anomalias ?? [])].sort(
          (a, b) => ORDEN[a.severity] - ORDEN[b.severity],
        );
        setAlertas(lista);
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        logger.warn("[AlertasNegocio] no cargaron las alertas", {
          error: String(err).slice(0, 120),
        });
        setError(true);
      })
      .finally(() => {
        if (!ac.signal.aborted) setCargando(false);
      });
    return () => ac.abort();
  }, [vuelta]);

  return { alertas, cargando, error, recargar: () => setVuelta((v) => v + 1) };
}

/** Adónde lleva cada tipo, dentro del panel. */
const DESTINO: Record<Anomalia["type"], { href: string; rotulo: string }> = {
  venta_baja: { href: "/admin?tab=ventas-caja", rotulo: "Ver ventas" },
  stock_muerto: { href: "/admin?tab=inventario", rotulo: "Ver productos" },
  margen_critico: { href: "/admin?tab=inventario", rotulo: "Ver productos" },
  fiado_vencido: { href: "/admin?tab=fiados", rotulo: "Ver fiados" },
};

const TIPO: Record<Anomalia["type"], string> = {
  venta_baja: "Ventas bajas",
  stock_muerto: "Stock muerto",
  fiado_vencido: "Fiado vencido",
  margen_critico: "Margen bajo",
};

const SEVERIDAD: Record<Anomalia["severity"], { rotulo: string; clase: string }> = {
  alto: { rotulo: "Alta", clase: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]" },
  medio: {
    rotulo: "Media",
    clase: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  },
  bajo: { rotulo: "Baja", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};

/** «Stock muerto: Leche Gloria» → «Leche Gloria»: el tipo ya va en su columna. */
function asunto(a: Anomalia): string {
  const i = a.title.indexOf(": ");
  return i > 0 ? a.title.slice(i + 2) : a.title;
}

/** En el celular, un select por filtro: «Todas» o un valor (el autofiltro de escritorio admite varios). */
const SELECT_CELULAR = cn(CAMPO_INPUT, "h-12 min-w-0 flex-1");

function SelectCelular({
  etiqueta,
  todas,
  valor,
  opciones: ops,
  rotulo,
  onCambiar,
}: {
  etiqueta: string;
  todas: string;
  valor: readonly string[];
  opciones: readonly { value: string; count: number }[];
  rotulo: (v: string) => string;
  onCambiar: (v: string[]) => void;
}) {
  return (
    <select
      aria-label={`Filtrar por ${etiqueta}`}
      className={SELECT_CELULAR}
      value={valor.length === 1 ? valor[0] : ""}
      onChange={(e) => onCambiar(e.target.value ? [e.target.value] : [])}
    >
      <option value="">{todas}</option>
      {ops.map((o) => (
        <option key={o.value} value={o.value}>{`${rotulo(o.value)} (${o.count})`}</option>
      ))}
    </select>
  );
}

/** Opciones del autofiltro: sólo lo que hay, con su cuenta. */
function opciones<K extends string>(alertas: readonly Anomalia[], de: (a: Anomalia) => K) {
  const cuenta = new Map<K, number>();
  for (const a of alertas) cuenta.set(de(a), (cuenta.get(de(a)) ?? 0) + 1);
  return [...cuenta].map(([value, count]) => ({ value, count }));
}

export function AlertasNegocio({ estado }: { estado: EstadoAlertas }) {
  const { alertas, cargando, error, recargar } = estado;
  const [prioridades, setPrioridades] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);

  if (cargando && !alertas) return <LoadingState />;
  if (error && !alertas) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)]" aria-hidden />
        <p className="text-sm text-[var(--data-error-ink)]">No se pudieron revisar las alertas.</p>
        <button
          type="button"
          onClick={recargar}
          className={button({ variant: "secondary", className: "ml-auto gap-2 rounded-xl" })}
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
        </button>
      </div>
    );
  }
  if (!alertas || alertas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)]">
        Nada raro por ahora: ventas, stock, fiados y márgenes dentro de lo normal.
      </p>
    );
  }

  const visibles = alertas.filter(
    (a) =>
      (prioridades.length === 0 || prioridades.includes(a.severity)) &&
      (tipos.length === 0 || tipos.includes(a.type)),
  );
  const opcionesPrioridad = opciones(alertas, (a) => a.severity);
  const opcionesTipo = opciones(alertas, (a) => a.type);
  const rotuloPrioridad = (v: string) => SEVERIDAD[v as Anomalia["severity"]]?.rotulo ?? v;
  const rotuloTipo = (v: string) => TIPO[v as Anomalia["type"]] ?? v;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 sm:hidden" role="group" aria-label="Filtros de las alertas">
        <SelectCelular
          etiqueta="Prioridad"
          todas="Toda prioridad"
          valor={prioridades}
          opciones={opcionesPrioridad}
          rotulo={rotuloPrioridad}
          onCambiar={setPrioridades}
        />
        <SelectCelular
          etiqueta="Tipo"
          todas="Todo tipo"
          valor={tipos}
          opciones={opcionesTipo}
          rotulo={rotuloTipo}
          onCambiar={setTipos}
        />
      </div>
      <DataTable className="w-full">
        <thead>
          <tr>
            <th className="w-32">
              <span className="inline-flex items-center gap-1">
                Prioridad
                <FiltroColumnaMulti
                  compacto
                  label="Prioridad"
                  value={prioridades}
                  options={opcionesPrioridad}
                  etiqueta={rotuloPrioridad}
                  onChange={setPrioridades}
                  placeholder="Todas"
                />
              </span>
            </th>
            <th className="w-44">
              <span className="inline-flex items-center gap-1">
                Tipo
                <FiltroColumnaMulti
                  compacto
                  label="Tipo"
                  value={tipos}
                  options={opcionesTipo}
                  etiqueta={rotuloTipo}
                  onChange={setTipos}
                  placeholder="Todos"
                />
              </span>
            </th>
            <th>Qué</th>
            <th>Detalle</th>
            <th className="w-40 text-right">Dónde se arregla</th>
          </tr>
        </thead>
        <tbody>
          {visibles.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center">
                Ninguna alerta con ese filtro.
              </td>
            </tr>
          )}
          {visibles.map((a, i) => {
            const sev = SEVERIDAD[a.severity];
            const destino = DESTINO[a.type];
            return (
              <tr key={`${a.type}-${a.title}-${i}`}>
                <td>
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-sm font-bold",
                      sev.clase,
                    )}
                  >
                    {sev.rotulo}
                  </span>
                </td>
                <td className="whitespace-nowrap">{TIPO[a.type]}</td>
                <td>
                  <span className="font-semibold text-[var(--text-primary)]">{asunto(a)}</span>
                </td>
                <td>{a.body}</td>
                <td className="text-right">
                  <EnlacePanel
                    href={destino.href}
                    apariencia="heredada"
                    className={button({
                      variant: "ghost",
                      className: "gap-1 rounded-xl px-3 text-[var(--accent-ink)]",
                    })}
                  >
                    {destino.rotulo} <ChevronRight className="h-4 w-4" aria-hidden />
                  </EnlacePanel>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
