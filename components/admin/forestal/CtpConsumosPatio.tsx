"use client";

/**
 * El panel «Patio» de Consumos (ADR-431): qué queda en el patio y cómo se carga
 * la sierra.
 *
 * DOS tarjetas, en el orden en que se pregunta (Brandon, 2026-09-24: «muchos
 * datos dispersos y mal estructurados» — eran seis bloques sueltos):
 *   1. «Qué queda en el patio»: titular + indicadores, por permiso (el clic
 *      filtra la tabla) y los lotes que esperan (`CtpConsumosPatioResumen`);
 *   2. «Trozas en el patio»: la acción (lote y día), la búsqueda y los filtros
 *      DENTRO de la tarjeta de la tabla que acotan (o la sierra, con un lote
 *      elegido).
 * Los criterios de qué se tilda y qué entra al acta NO cambiaron: sólo se movieron.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, FileDown, Layers, Ruler, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { AgrupacionPatio } from "@/lib/forestal/consumo-trozas";
import { ETIQUETA_TRAMO_DIAS, TRAMOS_DIAS, type TramoDias } from "@/lib/forestal/patio-resumen";
import { formatNumber } from "@/lib/format";
import CtpConsumosPatioResumen from "./CtpConsumosPatioResumen";
import CtpPatioKpis from "./CtpPatioKpis";
import CtpConsumosPatioAccion from "./CtpConsumosPatioAccion";
import CtpPatioFiltros from "./CtpPatioFiltros";
import CtpCubicacionParaConsumo from "./CtpCubicacionParaConsumo";
import CtpLoteCerradoFicha from "./CtpLoteCerradoFicha";
import CtpCargarSierra from "./CtpCargarSierra";
import CtpTrozasIngresadas, { type FiltrosPatioColumna } from "./CtpTrozasIngresadas";
import { NotaFiltrosKpi, notaDeFiltros } from "./CtpKpiFiltros";
import type { ActionToast } from "./cubicador-toasts";
import { useRegistrarJornadas } from "./hooks/use-registrar-jornadas";
import { camposDelFiltroPatio, type EstadoPatioConsumos } from "./hooks/use-patio-consumos";

type PushToast = (t: Omit<ActionToast, "id" | "exiting">) => number;

/** El agrupado de la pila (Brandon, 2026-09-01). «Por N° de permiso» es el detalle de la tabla. */
const ETIQUETA_AGRUPAR_PATIO: Record<AgrupacionPatio, string> = {
  ninguna: "Sin agrupar",
  especie: "Por especie",
  guia: "Por guía",
  permiso: "Por N° de permiso",
};

export default function CtpConsumosPatio({
  estado,
  onIr,
  pushToast,
  onResumenPermiso,
  onConsumido,
}: {
  estado: EstadoPatioConsumos;
  onIr?: (vista: string) => void;
  pushToast: PushToast;
  /** Abre el modal de lo que ENTRÓ por permiso (lo consumido incluido). */
  onResumenPermiso: () => void;
  /** Tras consumir: refrescar el cuadro de la Sección 2 (sin desmontar nada). */
  onConsumido: () => void;
}) {
  const { lotes, carga, patio, porPermiso } = estado;
  const { loteElegido, lotesAbiertos, seleccion, setSeleccion, fechaConsumo } = carga;
  const jornadas = useRegistrarJornadas(lotes);
  const [agruparPatio, setAgruparPatio] = useState<AgrupacionPatio>("ninguna");
  /** Un consumo con piezas rechazadas: el toast lo corta, acá se lee entero. */
  const [rechazo, setRechazo] = useState<string | null>(null);
  /* Cubicar lo aserrado, bajo demanda y recordado por dispositivo (ADR-370). */
  const [cubicarAbierto, setCubicarAbierto] = useState(false);
  useEffect(() => {
    try { setCubicarAbierto(localStorage.getItem("ctp-consumos-cubicar") === "1"); } catch { /* modo privado */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("ctp-consumos-cubicar", cubicarAbierto ? "1" : "0"); } catch { /* quota */ }
  }, [cubicarAbierto]);

  /* Los autofiltros de la cabecera escriben el MISMO estado que «Filtros». Las
     opciones salen de toda la pila, con cuántas piezas hay detrás. */
  const f = patio.facetas;
  const filtrosColumna: FiltrosPatioColumna = {
    guia: { value: patio.guia, options: f.guias, onChange: patio.set.guia },
    permiso: { value: patio.permiso, options: f.permisos, onChange: patio.set.permiso },
    especie: { value: patio.especie, options: f.especies, onChange: patio.set.especie },
    tramos: {
      value: patio.tramos,
      options: TRAMOS_DIAS.filter((t) => f.tramos[t] > 0).map((t) => ({ value: t, count: f.tramos[t] })),
      onChange: (v) => patio.set.tramos(v as TramoDias[]),
      etiqueta: (v) => ETIQUETA_TRAMO_DIAS[v as TramoDias] ?? v,
    },
    largo: { valor: patio.largo, onChange: patio.set.largo, conDato: f.largo.conDato },
    diametro: { valor: patio.diametro, onChange: patio.set.diametro, conDato: f.diametro.conDato },
  };
  const nota = notaDeFiltros(camposDelFiltroPatio(patio));

  const opcionesPatio: MenuAccion[] = useMemo(
    () => [
      ...(Object.keys(ETIQUETA_AGRUPAR_PATIO) as AgrupacionPatio[]).map((clave) => ({
        id: `agrupar-patio-${clave}`,
        label: ETIQUETA_AGRUPAR_PATIO[clave],
        hint: clave === "ninguna" ? "Una fila por troza" : "Subtotal arriba, el detalle se despliega",
        icon: Layers,
        activo: agruparPatio === clave,
        onSelect: () => setAgruparPatio(clave),
      })),
      {
        id: "resumen-permiso-patio",
        label: "Resumen de lo que entró por permiso",
        hint: "Lo que ENTRÓ (también lo ya consumido): especie, piezas, m³ y pt — y distribuir su rolliza",
        icon: BarChart3,
        tone: "dark" as const,
        onSelect: onResumenPermiso,
      },
      {
        id: "cubicar-consumo",
        label: cubicarAbierto ? "Cerrar cubicación" : "Cubicar lo aserrado…",
        hint: "Medir las tablas que salieron y repartirlas entre las trozas tildadas",
        icon: Ruler,
        activo: cubicarAbierto,
        onSelect: () => setCubicarAbierto((v) => !v),
      },
      {
        id: "descargar-patio",
        label: "Descargar el patio (Excel)",
        hint: "Por permiso, una hoja por permiso con sus trozas y qué se exportó",
        icon: FileDown,
        busy: estado.descargando,
        disabled: porPermiso.filas.length === 0,
        onSelect: () => void estado.descargarExcel(),
      },
    ],
    [agruparPatio, cubicarAbierto, onResumenPermiso, estado, porPermiso.filas.length],
  );

  const alConsumir = (texto: string, tono: "ok" | "aviso", accion: "consumo" | "adjuntar" = "consumo") => {
    /* "adjuntar" no consumió nada —sólo apartó piezas—: el toast no puede decir
       "Consumo registrado" sin mentir. */
    const okMsg = accion === "adjuntar" ? "Piezas adjuntadas" : "Consumo registrado";
    pushToast({
      tono: tono === "ok" ? "success" : "warning",
      msg: tono === "ok" ? okMsg : `${okMsg} con avisos`,
      detail: texto,
      accion: onIr && accion === "consumo" ? { label: "Ir a Producción", onClick: () => onIr("produccion") } : undefined,
    });
    setRechazo(tono === "aviso" ? texto : null);
    /* NO se suelta el lote ni se salta de apartado (Brandon, 2026-09-01): un
       consumo parcial deja el lote ABIERTO (ADR-356). */
    onConsumido();
  };

  const trabajando = loteElegido != null;
  /* La acción y la barra van DENTRO de la tarjeta de la tabla, la de mirar o
     la de cargar la sierra: son de esa tabla. */
  const accion = <CtpConsumosPatioAccion estado={estado} onIrALotes={onIr ? () => onIr("lotes") : undefined} />;
  const barra = <CtpPatioFiltros filtro={patio} />;
  return (
    <div className="space-y-4">
      {lotes.patioTruncado && (
        <p role="status" className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-3 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          El patio no entró entero en la lectura: se ven {formatNumber(lotes.patioTruncado.leidas)} de{" "}
          {formatNumber(lotes.patioTruncado.hay)} trozas. Las cifras de abajo son de lo leído.
        </p>
      )}

      <CtpConsumosPatioResumen
        estado={estado}
        trabajando={trabajando}
        onIr={onIr}
        indicadores={
          <CtpPatioKpis
            resumen={patio.resumen}
            filtrosActivos={patio.cuantosFiltros}
            filtros={<NotaFiltrosKpi nota={nota} onLimpiar={patio.limpiar} />}
            trabajoActivo={trabajando}
            cargando={lotes.cargando}
            acotadoA={loteElegido?.speciesCommon ?? undefined}
          />
        }
      />

      {estado.piezasOcultasDelLote > 0 && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-3 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <span className="min-w-0 flex-1">
            Este lote tiene <b>{formatNumber(estado.piezasOcultasDelLote)} pieza{estado.piezasOcultasDelLote === 1 ? "" : "s"} de otro permiso</b>{" "}
            que no se ven con «Solo este permiso». Si consumes ahora, quedan apartadas en el lote.
          </span>
          <button type="button" onClick={estado.verTodosLosPermisos}
            className="inline-flex min-h-8 items-center rounded-lg border border-[var(--rule-base)] px-2 font-bold hover:border-[var(--accent)]">
            Ver todos los permisos
          </button>
        </p>
      )}

      {rechazo && (
        <div role="status" className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-3 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
          <span className="min-w-0 flex-1">{rechazo}</span>
          <button type="button" onClick={() => setRechazo(null)} aria-label="Cerrar el aviso del consumo"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Cubicar lo aserrado, del lado del consumo (ADR-370). */}
      {cubicarAbierto && (!loteElegido || loteElegido.status === "abierto") && (
        <CtpCubicacionParaConsumo
          trozas={patio.libres
            .filter((t) => seleccion.has(t.id))
            .map((t) => ({
              id: t.id,
              etiqueta: t.codigoPlanta ?? t.codificacion ?? t.id.slice(-6),
              especie: t.especieComun ?? "",
              m3: Number(t.volumenM3 ?? 0),
            }))}
          lote={loteElegido ? { id: loteElegido.id, code: loteElegido.code } : null}
          fecha={fechaConsumo}
          registrar={(js, loteId) => jornadas.registrar(js, { loteId })}
          ocupado={jornadas.ocupado}
          avance={jornadas.avance}
          onAviso={(msg) => pushToast({ tono: "success", msg })}
        />
      )}

      {loteElegido && loteElegido.status !== "abierto" ? (
        <div className="space-y-2">
          {/* Con un lote cerrado a la vista, el menú sigue a mano para elegir otro. */}
          <div className="flex flex-wrap items-center justify-end gap-2">{accion}</div>
          <CtpLoteCerradoFicha lote={loteElegido} onIrAProduccion={onIr ? () => onIr("produccion") : undefined} />
        </div>
      ) : loteElegido ? (
        <CtpCargarSierra
          lote={loteElegido}
          fecha={fechaConsumo}
          estado={lotes}
          filas={patio.visibles}
          libres={patio.libres}
          totalPatio={patio.totalSinFiltrar}
          filtrando={patio.hayFiltro}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
          onConsumido={alConsumir}
          filtrosColumna={filtrosColumna}
          ahora={patio.ahora}
          encabezado={{ accion, barra }}
        />
      ) : (
          <CtpTrozasIngresadas
            filas={patio.visibles}
            libres={patio.libres}
            totalPatio={patio.totalSinFiltrar}
            filtrosColumna={filtrosColumna}
            filtrando={patio.hayFiltro}
            cargando={lotes.cargando}
            seleccion={seleccion}
            onSeleccion={setSeleccion}
            seleccionable={false}
            agrupar={agruparPatio}
            ahora={patio.ahora}
            accion={accion}
            barra={barra}
            ayuda={
              lotesAbiertos.length > 0
                ? "Para llevar piezas a la sierra, elige un lote en «Consumir en un lote…»: la tabla se acota a su especie y se tildan las piezas."
                : undefined
            }
            menuAgrupar={
              <ActionMenu
                label={agruparPatio === "ninguna" ? "Opciones" : `Opciones · ${ETIQUETA_AGRUPAR_PATIO[agruparPatio]}`}
                title="Agrupar la pila, ver lo que entró por permiso, cubicar o descargar el patio"
                actions={opcionesPatio}
                size="sm"
              />
            }
          />
      )}
    </div>
  );
}
