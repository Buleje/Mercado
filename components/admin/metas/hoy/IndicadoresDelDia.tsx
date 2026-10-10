"use client";

/**
 * IndicadoresDelDia — las cifras plegables de «Hoy» (botón «Indicadores» en la
 * fila del título, `useKpisPlegables`). Sólo lo que ninguna otra pantalla
 * tiene (auditoría 10-10):
 *  · Cierre estimado: lo de hoy + lo que el mismo día de la semana pasada se
 *    vendió DESPUÉS de esta hora (proyección, no dato).
 *  · El mismo día de la semana pasada a esta hora, y ayer a esta hora.
 *  · La hora fuerte que viene (la más fuerte de ese día que todavía no llegó).
 * El total, ventas, ticket promedio y hora pico de hoy ya están en Inicio ›
 * Ventas y Resumen: acá no se repiten. Una cifra sin dato no se dibuja (un
 * «S/ 0» de relleno se lee como el dato real).
 */
import type { ReactNode } from "react";
import { Flame, History, Sunset } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { cifraDeMeta } from "@/components/admin/metas/formato-meta";
import { CifraMeta as Cifra } from "@/components/admin/metas/CifraMeta";
import { TEXTO_TONO } from "@/components/admin/metas/clases-meta";
import { cn } from "@/lib/utils";
import { etiquetaHora, HORA_CIERRE, type CorteDelDia, type ResumenDelDia } from "./hoy-calculos";

const soles = (n: number) => cifraDeMeta(n, "S/");
const ventas = (n: number) => `${n} ${n === 1 ? "venta" : "ventas"}`;

/** «hoy +12 %» al lado de lo de otro día a esta hora; sólo si hoy ya vendió y ese día también. */
function HoyContra({ hoy, otro }: { hoy: number; otro: number }) {
  if (!(hoy > 0) || !(otro > 0)) return null;
  const pct = Math.round(((hoy - otro) / otro) * 100);
  return (
    <b className={cn("tabular-nums", TEXTO_TONO[pct >= 0 ? "exito" : "error"])}>
      hoy {pct >= 0 ? "+" : "−"}
      {Math.abs(pct)} %
    </b>
  );
}

function AEstaHora({ etiqueta, c, hoy, todo }: { etiqueta: string; c: CorteDelDia; hoy: number; todo: string }) {
  return (
    <Cifra
      etiqueta={etiqueta}
      valor={c.aEstaHora > 0 ? soles(c.aEstaHora) : "Sin ventas"}
      icono={History}
      detalle={
        <>
          <HoyContra hoy={hoy} otro={c.aEstaHora} />
          {hoy > 0 && c.aEstaHora > 0 && " · "}
          {todo}: {soles(c.total)}
        </>
      }
    />
  );
}

export function useIndicadoresDelDia({
  r,
  meta,
  nombreSemana,
}: {
  r: ResumenDelDia;
  /** El objetivo de la meta diaria de ventas; `null` sin meta. */
  meta: number | null;
  /** «sábado»: el mismo día de la semana pasada. */
  nombreSemana: string;
}) {
  const tarjetas: ReactNode[] = [];
  const resumen: string[] = [];

  if (r.cierre) {
    const llega = meta !== null && meta > 0 ? r.cierre.monto >= meta : null;
    tarjetas.push(
      <Cifra
        etiqueta="Cierre estimado"
        valor={`≈ ${soles(r.cierre.monto)}`}
        icono={Sunset}
        tono={llega === null ? undefined : llega ? "exito" : "aviso"}
        detalle={
          <>
            {r.cierre.base === "semana"
              ? `Si desde esta hora vendes como el ${nombreSemana} pasado`
              : `A tu ritmo de hoy hasta las ${etiquetaHora(HORA_CIERRE)}`}
            {meta !== null && meta > 0 && ` · ${Math.round((r.cierre.monto / meta) * 100)} % de tu meta`}
          </>
        }
      />,
    );
    resumen.push(`Cierre ≈ ${soles(r.cierre.monto)}`);
  }
  if (r.horaFuerte) {
    tarjetas.push(
      <Cifra
        etiqueta="Hora fuerte que viene"
        valor={etiquetaHora(r.horaFuerte.hora)}
        icono={Flame}
        detalle={`El ${nombreSemana} pasado: ${soles(r.horaFuerte.total)} · ${ventas(r.horaFuerte.n)}`}
      />,
    );
    resumen.push(`Fuerte: ${etiquetaHora(r.horaFuerte.hora)}`);
  }
  if (r.semana.total > 0)
    tarjetas.push(
      <AEstaHora etiqueta={`El ${nombreSemana} pasado a esta hora`} c={r.semana} hoy={r.total} todo="Todo ese día" />,
    );
  if (r.ayer.total > 0) {
    tarjetas.push(<AEstaHora etiqueta="Ayer a esta hora" c={r.ayer} hoy={r.total} todo="Todo el día" />);
    if (resumen.length < 2) resumen.push(`Ayer a esta hora ${soles(r.ayer.aEstaHora)}`);
  }

  return useKpisPlegables({
    claveMemoria: "metas-hoy",
    tarjetas,
    resumen: resumen.join(" · ") || undefined,
    alto: "md",
    // El contenido de «Hoy» SON estas cifras: plegadas de entrada, la vista quedaba en la barra.
    abiertoPorDefecto: true,
    // Sin ventas hoy queda una o dos cifras: que no se estiren a toda la fila.
    anchoFijo: true,
    compactoEnMovil: true,
  });
}
