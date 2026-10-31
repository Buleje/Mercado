"use client";

/**
 * IndicadoresDelMes — las cifras plegables de «Calendario» (botón «Indicadores»
 * en la fila del título, `useKpisPlegables`). Arriba del panel, la meta del mes
 * con su barra; debajo, sólo lo que ninguna otra pantalla tiene (auditoría
 * 10-10):
 *  · Cuánto vender por día, contando hoy, para llegar a la meta del mes (y si
 *    eso pide más que tu meta diaria).
 *  · Cuántos días cumplieron la meta diaria y qué día de la semana suele
 *    cumplirla y cuál no (este mes y el anterior).
 *  · El mes contra el anterior al MISMO día (Inicio › Ventas compara los últimos 7 días).
 * El ticket promedio y el mejor día ya están en Inicio › Ventas: el mejor día
 * queda marcado en la grilla con su estrella. Arranca plegado: lo central de la
 * vista es la grilla.
 */
import type { ReactNode } from "react";
import { ListChecks, Scale, TrendingUp } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { CifraMeta } from "@/components/admin/metas/CifraMeta";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { MetaDelMes } from "./MetaDelMes";
import {
  NOMBRES_SEMANA,
  firmeYFlojo,
  nombreDelMes,
  paraLlegarAlMes,
  sumarCumplimiento,
  type CumplePorDia,
  type ResumenMes,
} from "./calendario-calculos";

const soles = (n: number) => cifraDeMeta(n, "S/");
/** «los sábados (5 de 6)». */
const losDias = (i: number, c: readonly CumplePorDia[]) =>
  `los ${NOMBRES_SEMANA[i]}${i < 5 ? "" : "s"} (${c[i]!.cumplidos} de ${c[i]!.evaluados})`;

export function useIndicadoresDelMes({
  mes,
  hoy,
  r,
  metaMensual,
  metaDiaria,
  cumpleMes,
  cumpleDosMeses,
  mesAnterior,
  listo,
  onPonerMeta,
}: {
  mes: string;
  hoy: string;
  r: ResumenMes;
  metaMensual: number | null;
  metaDiaria: number | null;
  /** Por día de la semana, en el mes que se mira. */
  cumpleMes: readonly CumplePorDia[];
  /** Por día de la semana, en el mes que se mira y el anterior (más días para decir «suele»). */
  cumpleDosMeses: readonly CumplePorDia[];
  /** "YYYY-MM" del mes anterior. */
  mesAnterior: string;
  listo: boolean;
  onPonerMeta: () => void;
}) {
  const tarjetas: ReactNode[] = [];
  const resumen: string[] = [];
  const anterior = nombreDelMes(mesAnterior).split(" ")[0] ?? "";

  const llegar = paraLlegarAlMes(mes, hoy, r.total, metaMensual);
  if (llegar) {
    const sobre = metaDiaria !== null ? llegar.porDia - metaDiaria : null;
    tarjetas.push(
      <CifraMeta
        etiqueta="Por día, para llegar a la meta del mes"
        valor={soles(llegar.porDia)}
        icono={Scale}
        tono={sobre === null ? undefined : sobre > 0 ? "aviso" : "exito"}
        detalle={
          <>
            Faltan {soles(llegar.falta)} en {llegar.quedan} {llegar.quedan === 1 ? "día" : "días"}, contando hoy
            {sobre !== null &&
              (sobre > 0
                ? ` · ${soles(sobre)} más que tu meta diaria`
                : " · tu meta diaria alcanza")}
          </>
        }
      />,
    );
  }

  if (metaDiaria !== null) {
    const total = sumarCumplimiento(cumpleMes);
    const fy = firmeYFlojo(cumpleDosMeses);
    tarjetas.push(
      <CifraMeta
        etiqueta="Días que cumplieron la meta"
        valor={total.evaluados > 0 ? `${total.cumplidos} de ${total.evaluados}` : "—"}
        icono={ListChecks}
        detalle={
          fy
            ? `Cumples más ${losDias(fy.firme, cumpleDosMeses)} y menos ${losDias(fy.flojo, cumpleDosMeses)}, en ${anterior} y ${nombreDelMes(mes).split(" ")[0]}`
            : `Meta diaria ${soles(metaDiaria)}`
        }
      />,
    );
    if (total.evaluados > 0) resumen.push(`${total.cumplidos} de ${total.evaluados} días con meta`);
  }

  tarjetas.push(
    <CifraMeta
      etiqueta={`Contra ${anterior} al mismo día`}
      valor={
        r.delta !== null ? `${r.delta >= 0 ? "+" : "−"}${Math.abs(Math.round(r.delta))} %` : soles(r.total)
      }
      icono={TrendingUp}
      tono={r.delta === null ? undefined : r.delta >= 0 ? "exito" : "error"}
      detalle={
        r.delta !== null
          ? `${soles(r.total)} este mes · ${soles(r.anteriorAlDia)} en ${anterior} hasta el día ${r.ultimoVivido}`
          : `En ${anterior} hasta el día ${r.ultimoVivido} no hubo ventas`
      }
    />,
  );

  resumen.unshift(
    metaMensual !== null ? `${soles(r.total)} de ${soles(metaMensual)}` : `Mes: ${soles(r.total)}`,
  );
  if (llegar && resumen.length < 3) resumen.splice(1, 0, `${soles(llegar.porDia)} por día`);

  return useKpisPlegables({
    claveMemoria: "metas-calendario",
    tarjetas,
    resumen: listo ? resumen.slice(0, 2).join(" · ") : undefined,
    sinDatosAun: !listo,
    encabezado: (
      <MetaDelMes
        mes={mes}
        hoy={hoy}
        total={r.total}
        meta={metaMensual}
        cargando={!listo}
        onPonerMeta={onPonerMeta}
      />
    ),
    alto: "md",
    anchoFijo: true,
    compactoEnMovil: true,
  });
}
