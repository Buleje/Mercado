"use client";

/**
 * Control del permiso — el tablero de las trozas.
 *
 * El libro ya tenía el dato, pero repartido: la troza nace en Trozado, sale en
 * Despacho y desaparece en Consumo. Para contestar «¿qué me queda?» había que
 * leer tres secciones y cruzar códigos a mano. Acá cada troza aparece una sola
 * vez, con su estado y su color, bajo los códigos del permiso que la ampara.
 *
 * ADR-459 (2-10-2026, Brandon: «quiero mejoras para esa página, nuevas
 * integraciones, funciones especializadas»): el tablero mezclaba las trozas de
 * los tres planes vivos de Blas, no decía cuánto volumen le quedaba al permiso,
 * no dejaba actuar sobre las trozas y no exportaba. Ahora:
 *   · se elige el permiso (recordado) y la banda habla de ESE plan;
 *   · el volumen del permiso, en cascada (en pie → patio → despachado);
 *   · lo que lleva ≥ 15 / ≥ 30 días en el patio, en ámbar / rojo;
 *   · tanda sobre las del patio: despachar con guía, etiquetas, Excel;
 *   · Excel, reporte impreso y resumen por WhatsApp;
 *   · el buscador lee la etiqueta con la pistola.
 *
 * Orden (ley de la vista, rule `ui-components`): título con cifras + permiso +
 * Opciones en una fila → banda → avisos → volumen → estados → tabla.
 *
 * El estado se deriva del libro (`lib/forestal/loth-tablero-trozas.ts`): no hay
 * un contador aparte que se pueda desincronizar.
 */

import { useCallback, useMemo } from "react";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import { bandaDelPlan, nombreDelPlan } from "@/lib/forestal/loth-tablero-permiso";
import type { DatosControl } from "@/lib/forestal/loth-tablero-reporte";
import {
  construirTablero,
  especiesDelTablero,
  filtrarPorPlan,
  planesDe,
  resumirTablero,
  resumirViejas,
} from "@/lib/forestal/loth-tablero-trozas";
import { limaDateKey } from "@/lib/utils";
import { useLothTableroAcciones } from "./hooks/use-loth-tablero-acciones";
import { useLothTableroPermiso } from "./hooks/use-loth-tablero-permiso";
import { useLothTableroTabla } from "./hooks/use-loth-tablero-tabla";
import LothTableroAvisos from "./LothTableroAvisos";
import LothTableroBanda, { type CaratulaTablero } from "./LothTableroBanda";
import LothTableroCabecera from "./LothTableroCabecera";
import LothTableroEstados from "./LothTableroEstados";
import LothTableroTabla, { type NavTablero } from "./LothTableroTabla";
import LothTableroTanda from "./LothTableroTanda";
import LothTableroVolumen from "./LothTableroVolumen";

export type { CaratulaTablero } from "./LothTableroBanda";
export type { NavTablero } from "./LothTableroTabla";

export default function LothTableroTrozas({
  entries,
  caratula,
  nav,
  reloadSignal = 0,
  onDespacharConGuia,
}: {
  entries: LothEntryDTO[];
  caratula?: CaratulaTablero | null;
  nav?: NavTablero;
  /** Sube tras cada escritura del libro: vuelve a leer planes y saldo. */
  reloadSignal?: number;
  /** Abre «Despachar con guía» con estas trozas ya elegidas. */
  onDespacharConGuia?: (codigos: string[]) => void;
}) {
  const permiso = useLothTableroPermiso(reloadSignal);
  const hoyKey = limaDateKey();

  const todas = useMemo(() => construirTablero(entries), [entries]);
  const haySinPlan = useMemo(() => todas.some((f) => f.planId == null), [todas]);
  const filas = useMemo(() => filtrarPorPlan(todas, permiso.planSel), [todas, permiso.planSel]);
  const resumen = useMemo(() => resumirTablero(filas), [filas]);
  const viejas = useMemo(() => resumirViejas(filas), [filas]);
  const especies = useMemo(() => especiesDelTablero(filas), [filas]);

  const banda = useMemo(() => (permiso.plan ? bandaDelPlan(permiso.plan, hoyKey) : null), [permiso.plan, hoyKey]);
  const { saldo } = permiso;
  const cascada = useMemo(
    () => (permiso.plan && saldo.planId === permiso.plan.id && saldo.rows.length > 0 ? cascadaDelPlan(saldo.rows) : null),
    [permiso.plan, saldo.planId, saldo.rows],
  );

  const { planes } = permiso;
  const nombrePlanDe = useCallback(
    (id: string | null) => {
      if (!id) return "Sin plan";
      const p = planes.find((x) => x.id === id);
      return p ? nombreDelPlan(p) : "Plan dado de baja";
    },
    [planes],
  );
  /* Con «Todos» y más de un permiso, cada troza dice de cuál es. */
  const conColumnaPermiso = permiso.planSel == null && (planes.length > 1 || haySinPlan);

  const t = useLothTableroTabla(filas, permiso.planSel != null);
  const { reiniciar } = t;
  const { elegirPlan: guardarPlan } = permiso;
  const elegirPlan = useCallback(
    (id: string | null) => {
      guardarPlan(id);
      reiniciar();
    },
    [guardarPlan, reiniciar],
  );

  const datos: DatosControl = useMemo(
    () => ({
      permiso: banda,
      libro: { tituloHabilitante: caratula?.tituloHabilitante ?? null, titular: caratula?.titularName ?? null },
      filas,
      resumen,
      viejas,
      cascada,
      hoyKey,
      nombrePlanDe: conColumnaPermiso ? nombrePlanDe : undefined,
    }),
    [banda, caratula, filas, resumen, viejas, cascada, hoyKey, conColumnaPermiso, nombrePlanDe],
  );

  const acc = useLothTableroAcciones({
    datos,
    nombre: banda?.nombre ?? (permiso.planSel ? "sin plan" : "todos"),
    entries,
    seleccion: t.seleccion,
    planes,
    tituloDelLibro: caratula?.tituloHabilitante ?? null,
    onIrAlPlan: nav?.onIrAlPlan,
  });

  return (
    <div className="min-w-0 space-y-4" data-vista-control-permiso>
      <LothTableroCabecera
        resumen={resumen}
        viejas={viejas}
        planes={planes}
        planSel={permiso.planSel}
        haySinPlan={haySinPlan}
        onElegirPlan={elegirPlan}
        acciones={acc.acciones}
      />

      <LothTableroBanda banda={banda} caratula={caratula} />

      <LothTableroAvisos
        banda={banda}
        viejas={viejas}
        soloViejas={t.soloViejas}
        onVerViejas={() => t.setSoloViejas(true)}
        errorPlanes={permiso.errorPlanes}
        disponibles={resumen.find((r) => r.estado === "disponible")?.n ?? 0}
      />

      {banda && (
        <LothTableroVolumen
          banda={banda}
          cascada={cascada}
          cargando={saldo.cargando}
          error={saldo.error}
          onReintentar={permiso.reintentarSaldo}
          onIrAlPlan={nav?.onIrAlPlan}
        />
      )}

      <LothTableroEstados
        resumen={resumen}
        viejas={viejas}
        estados={t.estados}
        soloViejas={t.soloViejas}
        onEstado={t.alternarEstado}
        onViejas={() => t.setSoloViejas((v) => !v)}
      />

      <LothTableroTabla
        t={t}
        total={filas.length}
        especies={especies}
        nav={nav}
        permisoDe={conColumnaPermiso ? nombrePlanDe : undefined}
        vacio={permiso.planSel ? "Todavía no hay trozas registradas en este permiso." : undefined}
        tanda={
          <LothTableroTanda
            seleccion={t.seleccion}
            ocultas={t.ocultasElegidas}
            planes={planesDe(t.seleccion).length}
            imprimiendo={acc.imprimiendo}
            onDespachar={onDespacharConGuia ? () => onDespacharConGuia(t.seleccion.map((f) => f.code)) : undefined}
            onImprimir={acc.imprimirEtiquetas}
            onExportar={() => void acc.exportarSeleccion()}
            onQuitar={t.limpiarSeleccion}
          />
        }
      />
    </div>
  );
}
