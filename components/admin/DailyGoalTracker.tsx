"use client";

/**
 * DailyGoalTracker — la sub-vista «Hoy» de Metas y logros (ADR-488).
 *
 * Antes la meta era S/ 3.000 guardados en el localStorage de cada PC y las
 * ventas salían de `/api/sales?limit=500` contadas con la hora del navegador.
 * Ahora la meta es la de ventas diaria de la base (la misma tarjeta de
 * «Metas»), y lo vendido por hora sale de `/api/goals/serie` en hora de Lima
 * (ventas del POS + pedidos que entran), refrescado cada 30 s con la pestaña
 * a la vista. Las partes viven en `components/admin/metas/hoy/`.
 *
 * Tarea propia (auditoría de duplicados 10-10): «cómo voy HOY contra la meta y
 * qué me falta para llegar». Lo que ya está en Inicio (ventas, ticket
 * promedio, hora pico de hoy) se fue; quedan lo que falta y a qué ritmo por
 * hora, el cierre estimado, el mismo día de la semana pasada a esta hora y la
 * hora fuerte que viene. Las cifras van plegables en la fila del título.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Pencil, RefreshCw } from "@buleje/design-system/icons";
import ConfettiBurst from "@/components/ui-system/ConfettiBurst";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { ModalMeta } from "@/components/admin/metas/ModalMeta";
import { TEXTO_TONO } from "@/components/admin/metas/clases-meta";
import { BadgeArea } from "@/components/admin/metas/TarjetaMeta";
import { AvisoSinMeta } from "@/components/admin/metas/hoy/AvisoSinMeta";
import { AvisoDeCarga } from "@/components/admin/metas/AvisoDeCarga";
import { GraficoPorHora } from "@/components/admin/metas/hoy/GraficoPorHora";
import { TarjetaMetaDelDia } from "@/components/admin/metas/hoy/TarjetaMetaDelDia";
import { useIndicadoresDelDia } from "@/components/admin/metas/hoy/IndicadoresDelDia";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { horasADibujar, resumirDia } from "@/components/admin/metas/hoy/hoy-calculos";
import { useMetas } from "@/hooks/use-metas";
import { useSerieHora } from "@/hooks/use-metas-serie";
import { hrefDeMeta } from "@/lib/admin/metas-catalogo";
import { horaLima, metaDeVentas, type TramoVenta } from "@/lib/metas/logros-reglas";
import { formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";

const SIN_HORAS: readonly TramoVenta[] = Array.from({ length: 24 }, () => ({ total: 0, n: 0 }));
const BOTON_ICONO =
  button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" });

type Modal = { modo: "crear"; objetivo?: number } | { modo: "editar" };

export default function DailyGoalTracker() {
  const { metas, cargando: cargandoMetas, error: errorMetas, recargar: recargarMetas } = useMetas();
  const serie = useSerieHora();
  const [modal, setModal] = useState<Modal | null>(null);
  const [celebrar, setCelebrar] = useState(false);

  const meta = metaDeVentas(metas, "diario");
  const objetivo = meta?.target ?? null;
  const horaActual = horaLima(serie.actualizado ?? new Date());
  const horas = serie.datos?.horas ?? SIN_HORAS;
  const horasAyer = serie.datos?.ayer.horas ?? SIN_HORAS;
  const horasSemana = serie.datos?.semanaPasada.horas ?? SIN_HORAS;
  const r = useMemo(
    () => resumirDia(horas, horasAyer, horasSemana, horaActual),
    [horas, horasAyer, horasSemana, horaActual],
  );
  const visibles = useMemo(
    () => horasADibujar(horas, horasSemana, horaActual),
    [horas, horasSemana, horaActual],
  );
  const hoy = serie.datos?.dia ?? limaDateKey();
  // «sábado»: el mismo día de la semana pasada se llama como hoy.
  const nombreSemana = diaConNombre(hoy).split(" ")[0] ?? "";
  const indicadores = useIndicadoresDelDia({ r, meta: objetivo, nombreSemana });

  // Confeti sólo al CRUZAR la meta con la pantalla abierta: abrir el panel con la meta ya pasada no festeja.
  const previo = useRef<number | null>(null);
  useEffect(() => {
    if (!serie.datos || objetivo === null) return;
    if (previo.current !== null && previo.current < objetivo && r.total >= objetivo)
      setCelebrar(true);
    previo.current = r.total;
  }, [serie.datos, r.total, objetivo]);

  const href = hrefDeMeta("ventas");
  const cargandoSerie = serie.cargando && !serie.datos;

  return (
    <div className="space-y-4">
      <ConfettiBurst trigger={celebrar} onComplete={() => setCelebrar(false)} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CardTitle className="text-sm font-bold">Meta del día</CardTitle>
        <InfoTip
          title="Meta del día"
          what="Lo vendido hoy (día de Lima) contra tu meta diaria de ventas: cuánto te falta y cuánto vender por hora para llegar. Es la misma meta que ves en «Metas»."
          body="La raya de la barra es por dónde deberías ir a esta hora (horario de 6:00 a 21:00). «Indicadores» trae el cierre estimado, el mismo día de la semana pasada y la hora fuerte que viene. El total, el ticket y la hora pico de hoy están en Inicio › Ventas."
          example="Meta S/ 3,000 y llevas S/ 1,000 a las 16:00: vende S/ 400 por hora en las 5 h que quedan."
        />
        {!serie.sinPermiso && (
          <span className="hidden text-sm text-[var(--text-secondary)] sm:inline">
            {diaConNombre(hoy)}
            {serie.actualizado ? ` · actualizado ${formatTime(serie.actualizado)}` : " · cargando…"}
          </span>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-1">
          {indicadores.boton}
          {href && (
            <EnlacePanel
              href={href}
              apariencia="heredada"
              title="Es una meta de Ventas: abre Ventas y caja"
              aria-label="Ver en Ventas"
              className="hidden min-h-12 items-center sm:inline-flex gap-1 px-1 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]"
            >
              <BadgeArea category="ventas" />
              <span aria-hidden="true">›</span>
            </EnlacePanel>
          )}
          {meta && (
            <button
              type="button"
              className={BOTON_ICONO}
              aria-label="Editar la meta del día"
              title="Editar la meta del día"
              onClick={() => setModal({ modo: "editar" })}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            className={BOTON_ICONO}
            aria-label="Actualizar"
            title="Actualizar"
            disabled={serie.cargando}
            onClick={() => {
              serie.recargar();
              void recargarMetas(true);
            }}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("h-4 w-4", serie.cargando && "animate-spin motion-reduce:animate-none")}
            />
          </button>
        </span>
      </div>

      {errorMetas && (
        <p className={cn("text-sm", TEXTO_TONO.error)}>
          No se pudo leer tu meta del día: {errorMetas}
        </p>
      )}
      <AvisoDeCarga
        error={serie.error}
        sinPermiso={serie.sinPermiso}
        onReintentar={() => serie.recargar()}
        que="lo vendido hoy"
      />

      {/* Sin permiso no se dibuja «S/ 0 vendido»: sería una cifra falsa, no una oculta. */}
      {!serie.sinPermiso && (
        <>
          <TarjetaMetaDelDia
            total={r.total}
            n={r.n}
            meta={objetivo}
            horaActual={horaActual}
            cierre={r.cierre?.monto ?? null}
            cargando={cargandoSerie}
            pie={
              !cargandoMetas && !errorMetas && !meta ? (
                <AvisoSinMeta embebido onPoner={(o) => setModal({ modo: "crear", objetivo: o })} />
              ) : undefined
            }
          />
          {!cargandoSerie && indicadores.panel}
          {/* Sin venta hoy ni el mismo día de la semana pasada, el gráfico sería una fila de rayas vacías. */}
          {!cargandoSerie && (r.total > 0 || r.semana.total > 0) && (
            <GraficoPorHora
              horas={horas}
              horasComparar={horasSemana}
              nombreComparar={nombreSemana}
              visibles={visibles}
              horaActual={horaActual}
            />
          )}
        </>
      )}

      {modal && (
        <ModalMeta
          abierto
          onCerrar={() => setModal(null)}
          {...(modal.modo === "editar" && meta
            ? { meta }
            : {
                preset: {
                  category: "ventas" as const,
                  period: "diario" as const,
                  ...(modal.modo === "crear" && modal.objetivo ? { target: modal.objetivo } : {}),
                },
              })}
          onGuardada={() => {
            setModal(null);
            void recargarMetas();
          }}
        />
      )}
    </div>
  );
}
