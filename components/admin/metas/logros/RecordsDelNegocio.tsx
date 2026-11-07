"use client";

/**
 * RecordsDelNegocio — las cifras plegables de «Logros» (botón «Indicadores» en
 * la fila del título, `useKpisPlegables`): el mejor día, la mejor semana, el
 * mejor mes y la racha más larga de todo lo leído (hasta 400 días), con su
 * fecha. Ninguna otra vista los dice: Calendario marca el mejor día DEL MES e
 * Inicio › Ventas el de los últimos 14 días. Los cuenta el servidor
 * (`calcularRecords`); acá sólo se dicen.
 */
import type { ReactNode } from "react";
import { CalendarDays, Flame, Trophy, TrendingUp } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { CifraMeta } from "@/components/admin/metas/CifraMeta";
import { nombreDelMes } from "@/components/admin/metas/calendario/calendario-calculos";
import { sumarDiasAFecha } from "@/lib/admin/metas-tareas";
import type { RecordsDelNegocio } from "@/lib/metas/logros-reglas";
import { cifraLogro, elDia, fechaLogro } from "./formato-logro";

const soles = (n: number) => cifraLogro(n, "S/");

export function useRecordsDelNegocio({
  records,
  hoy,
  listo,
}: {
  records: RecordsDelNegocio | null;
  hoy: string;
  /** Ya llegó la primera respuesta: antes, skeletons (un «S/ 0» de mentira se lee como dato). */
  listo: boolean;
}) {
  const tarjetas: ReactNode[] = [];
  const resumen: string[] = [];
  const r = records;
  if (r?.dia) {
    tarjetas.push(
      <CifraMeta
        key="dia"
        etiqueta="Mejor día"
        valor={soles(r.dia.total)}
        icono={TrendingUp}
        detalle={fechaLogro(r.dia.dia, hoy)}
      />,
    );
    /* El botón deja ~22 caracteres al titular (24rem): va sólo el récord de un día. */
    resumen.push(`Récord ${soles(r.dia.total)}`);
  }
  if (r?.semana) {
    const domingo = sumarDiasAFecha(r.semana.dia, 6);
    tarjetas.push(
      <CifraMeta
        key="semana"
        etiqueta="Mejor semana"
        valor={soles(r.semana.total)}
        icono={CalendarDays}
        detalle={
          domingo >= hoy
            ? "Esta semana, que sigue"
            : `Del ${fechaLogro(r.semana.dia, hoy)} al ${fechaLogro(domingo, hoy)}`
        }
      />,
    );
  }
  if (r?.mes) {
    const mes = r.mes.dia.slice(0, 7);
    tarjetas.push(
      <CifraMeta
        key="mes"
        etiqueta="Mejor mes"
        valor={soles(r.mes.total)}
        icono={Trophy}
        detalle={mes === hoy.slice(0, 7) ? "Este mes, que sigue" : nombreDelMes(mes)}
      />,
    );
  }
  if (r?.racha) {
    tarjetas.push(
      <CifraMeta
        key="racha"
        etiqueta="Racha más larga"
        valor={cifraLogro(r.racha.dias, "días")}
        icono={Flame}
        tono={r.racha.sigue ? "exito" : undefined}
        detalle={r.racha.sigue ? "Es la de ahora: sigue viva" : `Terminó ${elDia(r.racha.hasta, hoy)}`}
      />,
    );
    if (resumen.length === 0) resumen.push(`Racha ${cifraLogro(r.racha.dias, "días")}`);
  }

  const plegable = useKpisPlegables({
    claveMemoria: "metas-logros",
    tarjetas,
    resumen: listo && resumen.length > 0 ? resumen.join(" · ") : undefined,
    sinDatosAun: !listo,
    alto: "md",
    anchoFijo: true,
    compactoEnMovil: true,
  });
  /* Sin serie (falló o caché vieja) no hay botón: un panel vacío no dice nada. */
  return listo && tarjetas.length === 0 ? { ...plegable, boton: null, panel: null } : plegable;
}
