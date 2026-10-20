"use client";

/**
 * HoyVista — «lo que te toca hoy» (ADR-501 §1): cuánto ya se hizo, la lista
 * del día y lo atrasado (hasta 7 días), cada uno con lo que dice su fuente
 * («6 de 8 marcados») y el enlace para ir a hacerlo. Las cifras vienen del
 * servidor (`GET /api/admin/agenda/hoy`): acá no se suma nada.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { BellOff, BellRing, CalendarDays, Play, Plus, RefreshCw, Sparkles } from "@buleje/design-system/icons";
import { CardTitle, EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { TARJETA, claseChip } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import { abrirAvisoAgenda, useConfigAviso } from "@/hooks/use-aviso-agenda";
import { textoCada } from "@/lib/agenda/aviso-pantalla";
import { cn } from "@/lib/utils";
import { EncabezadoAgenda } from "../comun/EncabezadoAgenda";
import { ESTILO_ESTADO } from "../comun/estado-ocurrencia";
import { fechaLarga } from "../comun/fechas";
import { CLASE_CHIP_ESTADO, ListaOcurrencias } from "../comun/ListaOcurrencias";

const ActividadModal = dynamic(() => import("../actividades/ActividadModal").then((m) => m.ActividadModal), { ssr: false });
const ConfigAvisoModal = dynamic(() => import("../aviso/ConfigAvisoModal"), { ssr: false });

const AYUDA = {
  what: "Lo que tienes que hacer hoy en tu negocio y lo que quedó atrasado de la semana, según las actividades que prendiste.",
  affects: "Si la fuente ya lo registró (la asistencia, la corrida de aserrío, el gasto), sale como hecha sola. Lo que marcas a mano gana sobre lo que diga la fuente.",
  example: "«Llevar la asistencia · 6 de 8 marcados»: faltan dos personas por marcar; toca la flecha para ir a la hoja del día.",
};

export default function HoyVista({ irA }: { irA: (vista: string) => void }) {
  const { hoy, actividades, cargando, recargando, error, refrescar } = useAgenda();
  const { config: aviso } = useConfigAviso();
  const [nueva, setNueva] = useState(false);
  const [configAviso, setConfigAviso] = useState(false);
  const IconoAviso = aviso.activo ? BellRing : BellOff;

  const encabezado = (
    <EncabezadoAgenda
      titulo="Lo que te toca hoy"
      ayuda={AYUDA}
      secciones={
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold capitalize text-[var(--text-secondary)]">{fechaLarga(hoy.fecha)}</span>
          <button type="button" data-qa="aviso-agenda-config" className={claseChip(aviso.activo)} onClick={() => setConfigAviso(true)} title="La ventana que sale sola con lo que te falta">
            <IconoAviso className="size-4" aria-hidden="true" />
            {aviso.activo ? `Aviso cada ${textoCada(aviso.cadaMin)}` : "Aviso apagado"}
          </button>
        </div>
      }
      acciones={
        <button type="button" className={button({ variant: "primary", className: "max-sm:w-12 max-sm:px-0" })} onClick={() => setNueva(true)} title="Nueva actividad">
          <Plus className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">Nueva actividad</span>
        </button>
      }
      menu={[
        { id: "actualizar", label: "Actualizar", hint: "Vuelve a mirar las fuentes", icon: RefreshCw, onSelect: refrescar, busy: recargando },
        { id: "calendario", label: "Ver el calendario", icon: CalendarDays, onSelect: () => irA("calendario") },
        { id: "sugeridas", label: "Actividades sugeridas", icon: Sparkles, onSelect: () => irA("actividades") },
        { id: "aviso", label: "Configurar el aviso", hint: "Cada cuánto sale solo", icon: BellRing, onSelect: () => setConfigAviso(true) },
        { id: "ver-aviso", label: "Ver el aviso ahora", icon: Play, onSelect: abrirAvisoAgenda },
      ]}
    />
  );

  if (cargando) {
    return (
      <div className="space-y-4">
        {encabezado}
        <LoadingState message="Mirando lo de hoy…" />
      </div>
    );
  }

  const { cuenta } = hoy;
  const sinActividades = actividades.length === 0 && hoy.hoy.length === 0 && hoy.atrasadas.length === 0;

  return (
    <div className="space-y-4">
      {encabezado}
      {error && (
        <ErrorAlert
          title="No se pudo traer la agenda"
          description={error}
          action={
            <button type="button" className={button({ variant: "secondary" })} onClick={refrescar}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        />
      )}

      {sinActividades && !error ? (
        <EmptyState
          title="Todavía no tienes actividades"
          description="Prende las que te sirven (asistencia, aserrío, gastos, adelantos, cuentas, facturas) y aquí verás cada día lo que falta."
          action={{ label: "Ver las sugeridas", node: <button type="button" className={button({ variant: "primary" })} onClick={() => irA("actividades")}>Ver las sugeridas</button> }}
        />
      ) : (
        <>
          <Avance hechas={cuenta.hechas} total={cuenta.total} pendientes={cuenta.pendientes} atrasadas={cuenta.atrasadas} />
          <section className={cn(TARJETA, "px-4 py-3")} aria-busy={recargando}>
            <CardTitle>Hoy</CardTitle>
            <ListaOcurrencias
              etiqueta="Lo que toca hoy"
              ocurrencias={hoy.hoy}
              vacio={<p className="py-4 text-sm text-[var(--text-secondary)]">Hoy no toca nada. Mira lo atrasado o el calendario de la semana.</p>}
            />
          </section>
          {hoy.atrasadas.length > 0 && (
            <section className={cn(TARJETA, "px-4 py-3")}>
              <CardTitle>Atrasadas</CardTitle>
              <ListaOcurrencias etiqueta="Lo atrasado" ocurrencias={hoy.atrasadas} conFecha />
            </section>
          )}
        </>
      )}

      {nueva && <ActividadModal actividad={null} onCerrar={() => setNueva(false)} />}
      {configAviso && <ConfigAvisoModal onCerrar={() => setConfigAviso(false)} />}
    </div>
  );
}

function Avance({ hechas, total, pendientes, atrasadas }: { hechas: number; total: number; pendientes: number; atrasadas: number }) {
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
  return (
    <div className={cn(TARJETA, "flex flex-wrap items-center gap-x-6 gap-y-3 p-4")}>
      <div className="min-w-0 flex-[1_1_14rem] space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {hechas} de {total}
          </span>
          <span className="text-sm text-[var(--text-secondary)]">{total === 1 ? "hecha hoy" : "hechas hoy"}</span>
        </div>
        <div
          role="progressbar"
          aria-label={`${hechas} de ${total} hechas hoy`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={hechas}
          className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        >
          <div className={cn("h-full rounded-full", ESTILO_ESTADO.hecha.punto)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={cn(CLASE_CHIP_ESTADO, "text-sm", ESTILO_ESTADO.pendiente.chip)}>{pendientes} por hacer</span>
        <span className={cn(CLASE_CHIP_ESTADO, "text-sm", atrasadas > 0 ? ESTILO_ESTADO.atrasada.chip : ESTILO_ESTADO.futura.chip)}>
          {atrasadas} {atrasadas === 1 ? "atrasada" : "atrasadas"}
        </span>
      </div>
    </div>
  );
}
