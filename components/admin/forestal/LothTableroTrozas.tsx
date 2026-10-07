"use client";

/**
 * Control del permiso — el tablero de las trozas.
 *
 * El libro ya tenía el dato, pero repartido: la troza nace en Trozado, sale en
 * Despacho y desaparece en Consumo. Para contestar «¿qué me queda?» había que
 * leer tres secciones y cruzar códigos a mano. Acá cada troza aparece una sola
 * vez, con su estado y su color, bajo los códigos del permiso que la ampara.
 *
 * Lo construyeron dos sesiones (unidas en el merge del 04-10):
 *   · ADR-459 (02-10): permiso elegido y recordado, volumen en cascada, patio
 *     viejo en ámbar/rojo, tanda (guía, etiquetas, Excel), reporte, WhatsApp,
 *     la pistola en el buscador y la pestaña Kárdex;
 *   · 30-09/01-10: cada troza cruzada con su GTF (placa, destino) y su plan;
 *     columnas a elegir con orden y Excel para OSINFOR; «Escanear troza» con
 *     la cámara; y el `encabezado` que monta el libro (ficha, saldo, cuadre).
 *
 * Orden (ley de la vista): cabecera en una fila → [escáner] → encabezado (o la
 * banda) → avisos → volumen → Trozas | Kárdex → estados → tabla.
 *
 * El estado se deriva del libro (`lib/forestal/loth-tablero-trozas.ts`): no hay
 * un contador aparte que se pueda desincronizar.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { GtfRegistrada } from "@/lib/forestal/loth-cuadre-guias";
import type { PlanFichaApi } from "@/lib/forestal/loth-ficha-permiso";
import { cascadaDelPlan } from "@/lib/forestal/loth-saldo-cascada";
import { ordenarTablero } from "@/lib/forestal/loth-tablero-columnas";
import { bandaDelPlan, nombreDelPlan } from "@/lib/forestal/loth-tablero-permiso";
import type { DatosControl } from "@/lib/forestal/loth-tablero-reporte";
import {
  construirTablero,
  filtrarPorPlan,
  planesDe,
  resumirTablero,
  resumirViejas,
  type TrozaTablero,
} from "@/lib/forestal/loth-tablero-trozas";
import { limaDateKey } from "@/lib/utils";
import { useLothTableroAcciones } from "./hooks/use-loth-tablero-acciones";
import { useLothTableroKardex } from "./hooks/use-loth-tablero-kardex";
import { useLothTableroPermiso } from "./hooks/use-loth-tablero-permiso";
import { useLothTableroTabla } from "./hooks/use-loth-tablero-tabla";
import { useTableroColumnas } from "./hooks/use-tablero-columnas";
import { useTableroContexto } from "./hooks/use-tablero-contexto";
import LothEscanerTroza from "./LothEscanerTroza";
import LothTableroAvisos from "./LothTableroAvisos";
import LothTableroBanda, { type CaratulaTablero } from "./LothTableroBanda";
import LothTableroCabecera from "./LothTableroCabecera";
import LothTableroEstados from "./LothTableroEstados";
import LothTableroKardex from "./LothTableroKardex";
import LothTableroTabla from "./LothTableroTabla";
import LothTableroTanda from "./LothTableroTanda";
import type { NavTablero } from "./LothTableroTrozasTabla";
import LothTableroVolumen from "./LothTableroVolumen";

export type { CaratulaTablero } from "./LothTableroBanda";
export type { NavTablero } from "./LothTableroTrozasTabla";

/**
 * Lo que el tablero ya leyó y le presta a su encabezado, para que el cuadre por
 * guía y la ficha de cada plan no vuelvan a pedir lo mismo a la API.
 */
export interface DatosEncabezadoTablero {
  /** Todas las trozas del libro, ya cruzadas (sin el permiso elegido ni los filtros de la tabla). */
  filas: readonly TrozaTablero[];
  /** Todas las GTF, anuladas incluidas; `null` = no se pudieron leer. */
  gtfs: readonly GtfRegistrada[] | null;
  /** Todos los planes no dados de baja; `null` = no se pudieron leer. */
  planes: readonly PlanFichaApi[] | null;
  cargando: boolean;
  /** El permiso que mira la tabla (el del chip del libro): el encabezado habla de ése. */
  planSel?: string | null;
}

export default function LothTableroTrozas({
  entries,
  caratula,
  nav,
  reloadSignal = 0,
  onDespacharConGuia,
  encabezado,
  accionesExtra,
}: {
  entries: LothEntryDTO[];
  caratula?: CaratulaTablero | null;
  nav?: NavTablero;
  /** Sube tras cada escritura del libro: vuelve a leer planes y saldo. */
  reloadSignal?: number;
  /** Abre «Despachar con guía» con estas trozas ya elegidas. */
  onDespacharConGuia?: (codigos: string[]) => void;
  /**
   * Lo que va entre la cabecera y «Estado de las trozas»: la ficha del permiso,
   * el saldo por especie y el cuadre por guía. El tablero no sabe qué es; le
   * guarda el lugar y, si es función, le pasa lo que ya leyó.
   *
   * Con encabezado NO se dibuja la banda: la ficha del permiso trae los mismos
   * códigos más la vigencia — dos veces el mismo código es ruido.
   */
  encabezado?: ReactNode | ((datos: DatosEncabezadoTablero) => ReactNode);
  /** Opciones que el libro suma al menú «⋯» de la cabecera (el informe del permiso). */
  accionesExtra?: (datos: DatosEncabezadoTablero) => MenuAccion[];
}) {
  const permiso = useLothTableroPermiso(reloadSignal);
  const ctx = useTableroContexto();
  const columnas = useTableroColumnas();
  const hoyKey = limaDateKey();
  /** 0 = escáner cerrado; cada «Escanear troza» lo sube y vuelve a abrir la cámara. */
  const [escaner, setEscaner] = useState(0);

  const todas = useMemo(() => construirTablero(entries, new Date(), ctx.contexto), [entries, ctx.contexto]);
  const filas = useMemo(() => filtrarPorPlan(todas, permiso.planSel), [todas, permiso.planSel]);
  const resumen = useMemo(() => resumirTablero(filas), [filas]);
  const viejas = useMemo(() => resumirViejas(filas), [filas]);

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
  /* Con «Todos» y trozas de más de un permiso (o con y sin plan), cada troza dice
     de cuál es. Si todas son del mismo, la columna repetiría lo mismo en cada fila. */
  const conColumnaPermiso = permiso.planSel == null && planesDe(todas).length > 1;

  const t = useLothTableroTabla(filas, permiso.planSel != null, columnas.visibles, conColumnaPermiso ? nombrePlanDe : undefined);
  const ordenadas = useMemo(() => ordenarTablero(t.visibles, columnas.orden), [t.visibles, columnas.orden]);
  /* Cambió el permiso del libro: lo elegido, los filtros de columna y la última lectura eran del anterior. */
  const [planVisto, setPlanVisto] = useState(permiso.planSel);
  if (planVisto !== permiso.planSel) {
    setPlanVisto(permiso.planSel);
    t.reiniciar();
  }

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

  /* «Trozas» (cada troza con su estado) o «Kárdex» (cada movimiento con su saldo). Se recuerda. */
  const [pestana, setPestana] = useLocalStorage<"trozas" | "kardex">("loth-tablero:pestana", "trozas");
  const kardex = useLothTableroKardex({
    entries,
    planId: permiso.plan?.id ?? null,
    banda,
    franja: cascada,
    activo: pestana === "kardex",
    reloadSignal,
    hoyKey,
  });

  const acc = useLothTableroAcciones({
    datos,
    nombre: banda?.nombre ?? (permiso.planSel ? "sin plan" : "todos"),
    entries,
    seleccion: t.seleccion,
    planes,
    tituloDelLibro: caratula?.tituloHabilitante ?? null,
    onIrAlPlan: nav?.onIrAlPlan,
  });

  const datosEncabezado: DatosEncabezadoTablero = useMemo(
    () => ({ filas: todas, gtfs: ctx.gtfs, planes: ctx.planes, cargando: ctx.cargando, planSel: permiso.planSel }),
    [todas, ctx.gtfs, ctx.planes, ctx.cargando, permiso.planSel],
  );

  /* «Ver en la tabla» del escáner: la tabla queda sólo con esa troza. */
  const verEnTabla = (code: string) => {
    setPestana("trozas");
    t.mostrarTodo();
    t.setTexto(code);
  };

  return (
    <div className="min-w-0 space-y-4" data-vista-control-permiso>
      <LothTableroCabecera
        resumen={resumen}
        viejas={viejas}
        acciones={acc.acciones}
        accionesExtra={accionesExtra?.(datosEncabezado)}
        filas={filas}
        caratula={caratula}
        cargando={ctx.cargando}
        onEscanear={() => setEscaner((n) => n + 1)}
      />
      {escaner > 0 && (
        <LothEscanerTroza
          filas={filas}
          entries={entries}
          tituloHabilitante={caratula?.tituloHabilitante}
          nav={nav}
          pedidoCamara={escaner}
          onVerEnTabla={verEnTabla}
          onCerrar={() => setEscaner(0)}
        />
      )}

      {/* Lugar para la ficha del permiso, el saldo por especie y el cuadre por
          guía; sin él, la banda con los códigos que amparan todo lo de abajo. */}
      {encabezado == null ? (
        <LothTableroBanda banda={banda} caratula={caratula} />
      ) : typeof encabezado === "function" ? (
        encabezado(datosEncabezado)
      ) : (
        encabezado
      )}

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

      <SegmentedControl
        value={pestana}
        onChange={setPestana}
        label="Qué ver del permiso"
        options={[
          { value: "trozas", label: "Trozas", badge: filas.length },
          { value: "kardex", label: "Kárdex" },
        ]}
      />

      {pestana === "kardex" ? (
        <LothTableroKardex k={kardex} banda={banda} hoyKey={hoyKey} nav={nav} cargandoFranja={saldo.cargando} />
      ) : (
        <>
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
            filas={ordenadas}
            total={filas.length}
            columnas={columnas}
            faltante={ctx.faltante}
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
        </>
      )}
    </div>
  );
}
