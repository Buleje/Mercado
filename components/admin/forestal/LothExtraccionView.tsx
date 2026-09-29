"use client";

/**
 * LothExtraccionView — la vista «Extracción» del Libro TH (ADR-454): el manejo
 * del permiso de punta a punta. Cuánto aprobó el censo y, contra eso, cuánto
 * se taló, trozó y despachó (cada una con su saldo), cuánto llegó a la planta
 * y cuánto se aserró.
 *
 * Orden (ley de la vista, rule `ui-components`): título con las cifras clave,
 * permiso, período y menú en UNA fila → avisos (una línea + ⓘ) → indicadores
 * plegables → la tabla → los gráficos plegables.
 *
 * Todas las cifras llegan hechas de `GET /api/admin/forestal/loth/extraccion`;
 * la pantalla no suma (regla «totales en backend»).
 *
 * Relación con «Analítica»: nada se movió ni se borró. La Analítica sigue con
 * el veredicto, las anomalías, el flujo al producto terminado y la plata; acá
 * vive el saldo contra el censo y la cadena hasta el CTP (ADR-454 §6).
 */

import { SectionTitle } from "@buleje/design-system";
import { AlertCircle, FileSpreadsheet, Map as MapIcon, RefreshCw, TrendingUp } from "@buleje/design-system/icons";
import { toast } from "sonner";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { PanelSkeleton, TablaSkeleton } from "@/components/admin/shared/module-primitives";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { exportSheetsToExcel } from "@/lib/export-excel";
import { describirError } from "@/lib/errores/sin-dato";
import CtpPeriodPicker from "./CtpPeriodPicker";
import { Btn } from "./ctp-shared";
import { PLAN_SIN_PLAN, useLothExtraccion, type OpcionPlan } from "./hooks/use-loth-extraccion";
import LothExtraccionAvisos from "./loth-extraccion-avisos";
import LothExtraccionGraficos from "./loth-extraccion-graficos";
import { useKpisExtraccion } from "./loth-extraccion-kpis";
import { hojasDeExtraccion, nombreDeArchivo } from "./loth-extraccion-excel";
import { fm3, nombrePermiso } from "./loth-extraccion-shared";
import LothExtraccionTabla from "./loth-extraccion-tabla";

export default function LothExtraccionView({
  reloadSignal = 0,
  onIr,
}: {
  reloadSignal?: number;
  /** Salta a otra vista del libro (Plan de Manejo, Analítica). */
  onIr?: (vista: "plan" | "rentabilidad") => void;
}) {
  const e = useLothExtraccion(reloadSignal);
  const d = e.datos;
  const kpis = useKpisExtraccion(d, e.cargando, e.error);

  /* El selector ofrece los planes del negocio; si esa lista no llegó, los de la
     respuesta. «Sin plan» va al final, sólo si hay líneas así. */
  const opciones: OpcionPlan[] = [
    ...(e.planes.length > 0
      ? e.planes
      : (d?.permisos ?? []).flatMap((p) => (p.planId ? [{ id: p.planId, etiqueta: nombrePermiso(p), detalle: p.titular }] : []))),
    ...(e.haySinPlan || e.planId === PLAN_SIN_PLAN
      ? [{ id: PLAN_SIN_PLAN, etiqueta: "Sin plan", detalle: "Líneas sin árbol en un censo" }]
      : []),
  ];
  const elegido = opciones.find((o) => o.id === e.planId) ?? null;

  const exportar = async () => {
    if (!d) return;
    try {
      await exportSheetsToExcel(hojasDeExtraccion(d), nombreDeArchivo(elegido?.etiqueta ?? "todos"));
    } catch (err) {
      toast.error(`No se pudo armar el Excel: ${describirError(err)}`);
    }
  };

  const acciones: MenuAccion[] = [
    {
      id: "excel",
      label: "Exportar a Excel",
      hint: "Por permiso, por especie, por semana y los avisos",
      icon: FileSpreadsheet,
      onSelect: () => void exportar(),
      disabled: !d || d.permisos.length === 0,
    },
    ...(onIr
      ? [
          { id: "plan", label: "Ir al Plan de Manejo", hint: "Censo, especies autorizadas y semilleros", icon: MapIcon, onSelect: () => onIr("plan") },
          { id: "rentabilidad", label: "Ir a Rentabilidad y rendimiento", hint: "Margen, veredicto, anomalías y flujo", icon: TrendingUp, onSelect: () => onIr("rentabilidad") },
        ]
      : []),
  ];

  const t = d?.total;
  return (
    <div className="space-y-4" data-vista-extraccion>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="inline-flex items-center gap-1.5">
            <SectionTitle>Extracción</SectionTitle>
            <InfoTip
              title="Extracción"
              what="Lo aprobado según censo de cada permiso y, contra eso, cuánto se taló, trozó y despachó."
              affects="Cada saldo es lo aprobado menos esa operación: no se suman entre sí."
              example="Aprobado 400.5 m³, talado 32.9 m³: saldo de tala 367.6 m³."
              side="bottom"
            />
          </span>
          {t && (
            <p className="text-sm tabular-nums text-[var(--text-secondary)]">
              aprobado <b className="text-[var(--text-primary)]">{fm3(t.censo.aprovechableM3)}</b> · talado{" "}
              <b className="text-[var(--text-primary)]">{fm3(t.talado.m3)}</b> · trozado{" "}
              <b className="text-[var(--text-primary)]">{fm3(t.trozado.m3)}</b> · despachado{" "}
              <b className="text-[var(--text-primary)]">{fm3(t.despachado.m3)}</b> m³
            </p>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="extraccion-permiso">
            Permiso
          </label>
          <select
            id="extraccion-permiso"
            value={e.planId ?? ""}
            onChange={(ev) => e.elegirPlan(ev.target.value || null)}
            title={elegido?.detalle ?? "Todos los planes del libro"}
            className={`h-10 max-w-[16rem] rounded-xl border-2 bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none ${
              e.planId ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
            }`}
          >
            <option value="">Todos los permisos</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.detalle && o.detalle !== o.etiqueta ? `${o.etiqueta} · ${o.detalle}` : o.etiqueta}
              </option>
            ))}
          </select>
          <CtpPeriodPicker
            periodKey={e.periodKey}
            custom={e.custom}
            period={e.period}
            onKeyChange={e.elegirPeriodo}
            onCustomChange={e.elegirRango}
          />
          <ActionMenu label="Opciones de la extracción" actions={acciones} size="sm" soloIcono />
        </div>
      </header>

      {e.error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/8 px-3 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0 text-[var(--data-error-ink)]" aria-hidden />
          <span className="min-w-0 flex-1 text-[var(--text-primary)]">
            {e.error}
            {d ? " Lo que ves es la última lectura." : ""}
          </span>
          <Btn size="sm" onClick={e.reintentar}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </Btn>
        </div>
      )}

      {!d ? (
        e.error ? null : (
          <div aria-busy="true" className="space-y-3">
            <p className="text-sm text-[var(--text-tertiary)]">Leyendo el libro, el censo y el CTP…</p>
            <PanelSkeleton kpis={3} />
            <TablaSkeleton filas={4} columnas={8} />
          </div>
        )
      ) : d.permisos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center">
          <p className="text-base font-bold text-[var(--text-primary)]">Todavía no hay un plan de manejo con censo.</p>
          {onIr && (
            <Btn size="sm" variant="primary" className="mt-3" onClick={() => onIr("plan")}>
              <MapIcon className="h-4 w-4" aria-hidden /> Cargar el plan
            </Btn>
          )}
        </div>
      ) : (
        <>
          <LothExtraccionAvisos avisos={d.avisos} />
          <div className="space-y-2">
            {kpis.boton}
            {kpis.panel}
          </div>
          <div aria-busy={e.cargando} className={e.cargando ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <LothExtraccionTabla datos={d} especie={e.especie} onEspecie={e.elegirEspecie} />
          </div>
          <LothExtraccionGraficos datos={d} especie={e.especie} onEspecie={e.elegirEspecie} />
        </>
      )}
    </div>
  );
}
