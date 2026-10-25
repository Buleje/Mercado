"use client";

/**
 * ActividadesVista — lo que se repite en el negocio (ADR-501 §3): las
 * sugeridas a un clic y la lista con cuándo toca, por dónde avisa, quién la
 * hace y si está prendida. Prender/apagar se hace en la fila.
 */
import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "@buleje/design-system/icons";
import { DataTable, EmptyState, ErrorAlert, LoadingState } from "@buleje/design-system";
import { toast } from "sonner";
import ActionMenu from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { useAgenda } from "@/hooks/use-agenda";
import { cn } from "@/lib/utils";
import type { PlantillaAgenda } from "@/lib/agenda/plantillas";
import type { ActividadDTO } from "@/lib/agenda/tipos";
import { editarActividad } from "../agenda-api";
import { EncabezadoAgenda } from "../comun/EncabezadoAgenda";
import { PUNTO_COLOR } from "../comun/estado-ocurrencia";
import { textoRecurrencia } from "../comun/recurrencia-texto";
import { CANAL_UI, REGLA_UI, ROL_UI } from "../comun/reglas";
import { ActividadModal } from "./ActividadModal";
import { useBorrarActividad } from "./use-borrar-actividad";
import { PlantillasSugeridas } from "./PlantillasSugeridas";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna } from "@/components/admin/shared/use-orden-columna";
import { COLUMNAS_ACTIVIDADES, ORDEN_ACTIVIDADES } from "./columnas-filtro-actividades";
import { borradorDePlantilla, type Borrador } from "./use-actividad-form";

const AYUDA = {
  what: "Las tareas que se repiten en tu negocio: llevar la asistencia, el aserrío del día, registrar gastos e ingresos, revisar adelantos y cuentas de terceros, llevar las facturas.",
  affects: "Cada una prendida sale en Hoy y en el calendario los días que le tocan, y te avisa por la campana (o por donde elijas). Si la fuente ya lo registró, se da por hecha sola.",
  example: "«Registrar gastos e ingresos» todos los días a las 19:00: si ese día no hay gastos anotados, te lo recuerda.",
};

type Ventana = { actividad: ActividadDTO | null; inicial?: Borrador } | null;

export default function ActividadesVista() {
  const { actividades, cargando, recargando, error, refrescar } = useAgenda();
  const [ventana, setVentana] = useState<Ventana>(null);
  const f = useFiltrosTabla(actividades, COLUMNAS_ACTIVIDADES);
  const ord = useOrdenColumna(ORDEN_ACTIVIDADES);
  const filas = ord.ordenar(f.filtradas);

  const abrirPlantilla = (p: PlantillaAgenda) => setVentana({ actividad: null, inicial: borradorDePlantilla(p) });

  return (
    <div className="space-y-4">
      <EncabezadoAgenda
        titulo="Actividades"
        ayuda={AYUDA}
        acciones={
          <button type="button" className={button({ variant: "primary", className: "max-sm:w-12 max-sm:px-0" })} onClick={() => setVentana({ actividad: null })} title="Nueva actividad">
            <Plus className="size-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Nueva actividad</span>
          </button>
        }
        menu={[{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: refrescar, busy: recargando }]}
      />

      {error && (
        <ErrorAlert
          title="No se pudieron traer las actividades"
          description={error}
          action={
            <button type="button" className={button({ variant: "secondary" })} onClick={refrescar}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        />
      )}

      <PlantillasSugeridas onAbrir={abrirPlantilla} />

      {cargando ? (
        <LoadingState message="Trayendo las actividades…" />
      ) : actividades.length === 0 ? (
        !error && <EmptyState title="Todavía no hay actividades" description="Agrega una sugerida o crea la tuya con «Nueva actividad»." />
      ) : (
        <>
        <BarraFiltrosTabla f={f} />
        <DataTable zebra aria-busy={recargando}>
          <thead>
            <tr>
              <ThColumna label="Actividad" ids={["actividad"]} f={f} orden={ord} ordenId="actividad" />
              <ThColumna label="Cuándo" ids={["cuando"]} f={f} orden={ord} ordenId="cuando" />
              <ThColumna label="Avisa por" ids={["avisa"]} f={f} orden={ord} ordenId="avisa" />
              <ThColumna label="Quién la hace" ids={["quien"]} f={f} orden={ord} ordenId="quien" />
              <ThColumna label="Prendida" ids={["prendida"]} f={f} orden={ord} ordenId="prendida" />
              <th data-label="Acciones"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <SinCoincidenciasFila colSpan={6} />}
            {filas.map((a) => (
              <FilaActividad key={a.id} a={a} onEditar={() => setVentana({ actividad: a })} />
            ))}
          </tbody>
        </DataTable>
        </>
      )}

      {ventana && <ActividadModal actividad={ventana.actividad} inicial={ventana.inicial} onCerrar={() => setVentana(null)} />}
    </div>
  );
}

function FilaActividad({ a, onEditar }: { a: ActividadDTO; onEditar: () => void }) {
  const { refrescar } = useAgenda();
  const [ocupada, setOcupada] = useState(false);
  const ui = REGLA_UI[a.regla];
  const Icono = ui.icon;

  const prender = async () => {
    setOcupada(true);
    const r = await editarActividad(a.id, { activo: !a.activo, version: a.version });
    setOcupada(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(a.activo ? `«${a.nombre}» quedó apagada` : `«${a.nombre}» quedó prendida`);
    refrescar();
  };

  const borrarConfirmado = useBorrarActividad();
  const borrar = async () => {
    setOcupada(true);
    await borrarConfirmado(a);
    setOcupada(false);
  };

  return (
    <tr className={cn(ocupada && "opacity-60", !a.activo && "text-[var(--text-tertiary)]")} aria-busy={ocupada}>
      <td>
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2.5 shrink-0 rounded-full", PUNTO_COLOR[a.color])} aria-hidden="true" />
          <Icono className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="min-w-0">
            <span className={cn("block font-semibold", a.activo ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>{a.nombre}</span>
            <span className="block text-sm text-[var(--text-tertiary)]">{a.objetivo ? `${ui.label} · ${a.objetivo.nombre}` : ui.label}</span>
          </span>
        </div>
      </td>
      <td>{textoRecurrencia(a.recurrencia, a.hora)}</td>
      <td>{a.canales.map((c) => CANAL_UI[c].label).join(", ")}</td>
      <td>{a.responsableRol ? (ROL_UI[a.responsableRol as keyof typeof ROL_UI] ?? a.responsableRol) : "Cualquiera"}</td>
      <td>
        <button
          type="button"
          role="switch"
          aria-checked={a.activo}
          aria-label={`${a.activo ? "Apagar" : "Prender"} «${a.nombre}»`}
          onClick={() => void prender()}
          disabled={ocupada}
          className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <span aria-hidden="true" className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors", a.activo ? "bg-[var(--accent)]" : "bg-[var(--rule-strong)]/40")}>
            <span className={cn("absolute top-0.5 size-5 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-transform", a.activo ? "translate-x-5" : "translate-x-0.5")} />
          </span>
          <span className={a.activo ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}>{a.activo ? "Sí" : "No"}</span>
        </button>
      </td>
      <td className="text-right">
        <ActionMenu
          label="Más"
          icon={MoreHorizontal}
          soloIcono
          size="md"
          className="w-12 shrink-0"
          title={`Más de «${a.nombre}»`}
          actions={[
            { id: "editar", label: "Editar", icon: Pencil, onSelect: onEditar },
            { id: "borrar", label: "Borrar", icon: Trash2, tone: "danger", onSelect: () => void borrar() },
          ]}
        />
      </td>
    </tr>
  );
}
