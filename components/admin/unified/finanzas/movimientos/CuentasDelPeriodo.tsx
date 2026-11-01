"use client";

/**
 * Mi Plata › Movimientos › «Todo lo que entró y salió» (Cuentas). Todo lo que
 * movió plata en la semana, el mes o desde siempre —adelantos, gastos, ingresos—
 * más lo que te deben hoy. Los totales vienen del servidor
 * (`/api/admin/finanzas/cuentas`); acá solo se filtra y se agrupa para mostrar.
 * Periodo en `?sub=` (recordado como en las vecinas).
 */
import { useMemo, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { RefreshCw, X } from "@buleje/design-system/icons";
import { CabeceraVista } from "@/components/admin/inventario/movimientos/CabeceraVista";
import { BarraFiltrosTabla, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { PERIODOS_CUENTAS, TOPE_MOVIMIENTOS, type PeriodoCuentas } from "@/lib/finance/cuentas-tipos";
import { COLUMNAS_FILTRO_CUENTAS, GRUPOS, filasDelGrupo, prepararFilas } from "./cuentas-agrupado";
import { PorCobrarDeCuentas } from "./PorCobrarDeCuentas";
import { TablaDeCuentas } from "./TablaDeCuentas";
import { TarjetasDeCuentas, type FiltroDeCuentas } from "./TarjetasDeCuentas";
import { useCuentasDelPeriodo } from "./use-cuentas-del-periodo";

const OPCIONES: { value: PeriodoCuentas; label: string }[] = [
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mes" },
  { value: "todo", label: "Todo" },
];
const NOMBRE_PERIODO: Record<PeriodoCuentas, string> = { semana: "esta semana", mes: "este mes", todo: "en total" };
const AVISO = "text-sm font-semibold text-[var(--text-primary)]";
const CAJA = "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3";

export default function CuentasDelPeriodoVista({ onIr }: { onIr: (id: string) => void }) {
  const { vista: periodo, irA: setPeriodo } = useSubvistaModulo<PeriodoCuentas>("plata-cuentas", PERIODOS_CUENTAS, "semana");
  const { datos, cargando, error, recargar } = useCuentasDelPeriodo(periodo);
  const [filtro, setFiltro] = useState<FiltroDeCuentas>(null);
  const celular = useMediaQuery("(max-width: 639px)");

  const filas = useMemo(() => prepararFilas(datos?.movimientos ?? []), [datos]);
  const delGrupo = useMemo(() => filasDelGrupo(filas, filtro === "por-cobrar" ? null : filtro), [filas, filtro]);
  const filtros = useFiltrosTabla(delGrupo, COLUMNAS_FILTRO_CUENTAS);

  const siguiente = periodo === "semana" ? "mes" : "todo";
  const acciones = [{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: recargar }];

  return (
    <div className="space-y-4">
      <CabeceraVista
        titulo="Todo lo que entró y salió"
        ayuda={{
          what: "Cada adelanto dado, gasto e ingreso del periodo, con quién fue y a qué hora, y lo que te deben hoy.",
          affects: "Las cifras las calcula el servidor con todo el periodo. Toca una tarjeta para ver solo ese tipo.",
          example: "Esta semana: entró S/ 1,200 de ventas, salió S/ 800 entre gastos y adelantos.",
        }}
        secciones={
          <SegmentedControl<PeriodoCuentas> size="xl" label="Periodo" value={periodo} onChange={setPeriodo} options={OPCIONES} />
        }
        acciones={acciones}
        tituloMenu="Actualizar"
      />

      {cargando ? (
        <LoadingState />
      ) : error || !datos ? (
        <div role="alert" className={CAJA}>
          <p className={AVISO}>No se pudieron cargar las cuentas.</p>
          <button type="button" onClick={recargar} className={button({ variant: "secondary", className: "h-12 shrink-0 gap-2 rounded-xl" })}>
            <RefreshCw className="h-4 w-4" aria-hidden />Reintentar
          </button>
        </div>
      ) : (
        <>
          <TarjetasDeCuentas datos={datos} filtro={filtro} onFiltro={setFiltro} />
          {filtro && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]" aria-live="polite">
              Viendo: <span className="font-bold text-[var(--text-primary)]">{filtro === "por-cobrar" ? "Por cobrar" : GRUPOS[filtro].rotulo}</span>
              <button type="button" onClick={() => setFiltro(null)} className="inline-flex min-h-12 items-center gap-1 rounded-lg px-2 font-semibold text-[var(--accent-dark)] hover:bg-[var(--surface-sunken)]">
                <X className="h-4 w-4" aria-hidden />Ver todo
              </button>
            </p>
          )}
          {datos.truncado && (
            <p role="status" className="rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-2 text-sm text-[var(--text-primary)]">
              Se muestran los {TOPE_MOVIMIENTOS} más nuevos; los totales cuentan todo.
            </p>
          )}
          {datos.otrasMonedas > 0 && (
            <p role="status" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2 text-sm text-[var(--text-primary)]">
              {datos.otrasMonedas} {datos.otrasMonedas === 1 ? "movimiento está" : "movimientos están"} en otra moneda: se listan, pero no entran en los totales.
            </p>
          )}

          {filtro === "por-cobrar" ? (
            <PorCobrarDeCuentas porCobrar={datos.porCobrar} onIr={onIr} />
          ) : filas.length === 0 ? (
            <div className={CAJA}>
              <p className={AVISO}>
                {periodo === "todo" ? "Todavía no hay movimientos." : `Nada ${NOMBRE_PERIODO[periodo]}: mira ${periodo === "semana" ? "Este mes o Todo" : "Todo"}.`}
              </p>
              {periodo !== "todo" && (
                <button type="button" onClick={() => setPeriodo(siguiente)} className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl px-4" })}>
                  Ver {siguiente === "mes" ? "Este mes" : "Todo"}
                </button>
              )}
            </div>
          ) : delGrupo.length === 0 ? (
            <div className={CAJA}>
              <p className={AVISO}>Sin {filtro ? GRUPOS[filtro].rotulo.toLowerCase() : "movimientos"} {NOMBRE_PERIODO[periodo]}.</p>
              <button type="button" onClick={() => setFiltro(null)} className={button({ variant: "secondary", className: "h-12 shrink-0 rounded-xl px-4" })}>Ver todo</button>
            </div>
          ) : (
            <div className="space-y-3">
              <BarraFiltrosTabla f={filtros} excel={`cuentas-${periodo}`} vistas="cuentas" />
              <TablaDeCuentas filtros={filtros} celular={celular} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
