"use client";

/**
 * IndicadoresMetas — las cifras plegables de la vista «Metas» (botón
 * «Indicadores» en la fila del título, `useKpisPlegables`), como en Hoy,
 * Calendario y Logros. Reemplaza al «Resumen» que ocupaba su propia fila.
 *
 * Las cumplidas NO van acá: las dice el título («1 de 7 cumplidas»). Acá, lo
 * que pide atención (atrasadas, fuera de la meta) y lo que ninguna otra
 * pestaña cuenta: cuántas metas ya pasaron al período anterior entero.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Clock, History, TrendingUp } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { categoriaDe, type AvanceMetaDTO } from "@/lib/admin/metas-catalogo";
import type { EstadoMeta } from "@/lib/admin/metas-periodo";
import type { MetaDTO } from "@/lib/admin/metas-tareas";
import { CifraMeta } from "./CifraMeta";

const de = (total: number) => `de ${total} meta${total === 1 ? "" : "s"}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «Cubicar 50 m³ al mes (25 %)», la que más atrás va de su grupo. */
function laMasAtrasada(lista: { meta: MetaDTO; av?: AvanceMetaDTO }[]): string | undefined {
  const peor = [...lista].sort((a, b) => (a.av?.pct ?? 0) - (b.av?.pct ?? 0))[0];
  if (!peor) return undefined;
  return peor.av?.pct != null ? `${peor.meta.name} (${Math.round(peor.av.pct)} %)` : peor.meta.name;
}

export function useIndicadoresMetas({
  metas,
  avances,
  listo,
}: {
  metas: MetaDTO[];
  avances: Map<string, AvanceMetaDTO>;
  /** Ya se midió una vez: antes, esqueleto y no ceros de mentira. */
  listo: boolean;
}) {
  const con = metas.map((meta) => ({ meta, av: avances.get(meta.id) }));
  const en = (...estados: EstadoMeta[]) => con.filter((x) => estados.includes(x.av?.estado ?? "sin_dato"));
  const total = metas.length;
  const camino = en("en_camino");
  const atrasadas = en("atrasada");
  const fuera = en("pasada_del_tope", "no_cumplida");
  const sinDato = en("sin_dato").length;
  /* Las que suben y ya pasaron al período anterior ENTERO (dato, no proyección). */
  const conVara = con.filter(
    (x) => (categoriaDe(x.meta.category)?.sentido ?? "sube") === "sube" && (x.av?.anterior?.avance ?? 0) > 0,
  );
  const superan = conVara.filter((x) => x.av?.avance != null && x.av.avance >= (x.av.anterior?.avance ?? Infinity));

  const tarjetas: ReactNode[] = [
    <CifraMeta
      key="camino"
      etiqueta="En camino"
      valor={String(camino.length)}
      icono={TrendingUp}
      tono={camino.length > 0 ? "exito" : undefined}
      detalle={`${de(total)} · al ritmo o arriba`}
    />,
    <CifraMeta
      key="atrasadas"
      etiqueta="Atrasadas"
      valor={String(atrasadas.length)}
      icono={Clock}
      tono={atrasadas.length > 0 ? "aviso" : undefined}
      detalle={laMasAtrasada(atrasadas) ?? de(total)}
    />,
    <CifraMeta
      key="fuera"
      etiqueta="Fuera de la meta"
      valor={String(fuera.length)}
      icono={AlertTriangle}
      tono={fuera.length > 0 ? "error" : undefined}
      detalle={`Pasadas del tope o cerradas sin llegar${sinDato > 0 ? ` · ${plural(sinDato, "sin dato", "sin dato")}` : ""}`}
    />,
  ];
  if (conVara.length > 0) {
    tarjetas.push(
      <CifraMeta
        key="anterior"
        etiqueta="Ya pasaron al período anterior"
        valor={`${superan.length} de ${conVara.length}`}
        icono={History}
        tono={superan.length > 0 ? "exito" : undefined}
        detalle={superan[0] ? `${superan[0].meta.name}${superan.length > 1 ? ` y ${superan.length - 1} más` : ""}` : "Ninguna todavía este período"}
      />,
    );
  }

  /* ≤ 22 caracteres (el botón corta con «…»): lo que pide atención primero. */
  const atencion = [
    atrasadas.length > 0 ? plural(atrasadas.length, "atrasada", "atrasadas") : "",
    fuera.length > 0 ? plural(fuera.length, "fuera", "fuera") : "",
  ].filter(Boolean);
  const resumen = total === 0 ? undefined : atencion.length > 0 ? atencion.join(" · ") : "Todas al día";

  return useKpisPlegables({
    claveMemoria: "metas-metas",
    tarjetas,
    resumen,
    sinDatosAun: !listo,
    alto: "md",
    anchoFijo: true,
    compactoEnMovil: true,
  });
}
