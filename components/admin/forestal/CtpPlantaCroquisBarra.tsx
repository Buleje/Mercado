"use client";

/**
 * Barra del croquis: dibujar / editar zonas, capas (flujo, etiquetas),
 * configurar y pantalla completa — y, pegados al mapa, los filtros (especie,
 * permiso, dueño, estado) que atenúan lo que no coincide.
 */

import { Pencil, Undo2, Check, X, Edit3, Loader2, Route, Tag, Settings2, Maximize, Minimize, MoreHorizontal } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { FILTROS_VACIOS, hayFiltro, type EstadoFiltro, type FiltrosCroquis } from "@/lib/forestal/planta-croquis";
import type { PlantaZona } from "@/lib/forestal/planta-zona-types";
import type { ModoCroquis } from "./hooks/use-croquis-dibujo";

const BTN = "inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50";
const BTN_ON = "inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]";
const BTN_PRIMARIO = "inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50";
const SELECT = "h-9 max-w-[9.5rem] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export interface CtpPlantaCroquisBarraProps {
  modo: ModoCroquis;
  resumenDibujo: string;
  /** Área de la zona que se está editando, ya formateada. */
  areaTexto: string;
  nVerts: number;
  editSel: { codigo: string } | null;
  guardando: boolean;
  onDibujar: () => void;
  onDeshacer: () => void;
  onTerminar: () => void;
  onCancelar: () => void;
  onEditar: () => void;
  onGuardarEdicion: () => void;
  zonas: PlantaZona[];
  onIrA: (zonaId: string) => void;
  flujoDisponible: boolean;
  mostrarFlujo: boolean;
  onFlujo: () => void;
  mostrarEtiquetas: boolean;
  onEtiquetas: () => void;
  onConfigurar: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  /** Pantalla completa en el celular: los filtros se pliegan para dejar sitio al plano. */
  compacta?: boolean;
  filtros: FiltrosCroquis;
  onFiltros: (f: FiltrosCroquis) => void;
  opciones: { especies: string[]; permisos: string[]; duenos: string[] };
}

function Filtro({ label, valor, opciones, onChange }: { label: string; valor: string | null; opciones: string[]; onChange: (v: string | null) => void }) {
  if (opciones.length < 2) return null;
  return (
    <select value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)} aria-label={`Filtrar por ${label.toLowerCase()}`} className={`${SELECT} ${valor ? "border-[var(--accent)]" : ""}`}>
      <option value="">{label}: todos</option>
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function CtpPlantaCroquisBarra(p: CtpPlantaCroquisBarraProps) {
  const f = p.filtros;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {p.modo === "dibujar" ? (
          <>
            <span className="inline-flex h-9 items-center rounded-xl bg-[var(--data-warning-50)] px-3 text-sm font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">Toca el croquis: {p.resumenDibujo}</span>
            <button type="button" onClick={p.onDeshacer} disabled={p.nVerts === 0} className={BTN}><Undo2 className="h-4 w-4" />Deshacer</button>
            <button type="button" onClick={p.onTerminar} disabled={p.nVerts < 3} className={BTN_PRIMARIO}><Check className="h-4 w-4" />Terminar</button>
            <button type="button" onClick={p.onCancelar} className={BTN}><X className="h-4 w-4" />Cancelar</button>
          </>
        ) : p.modo === "editar" ? (
          <>
            <span className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--data-info-50)] px-3 text-sm font-bold text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]"><Edit3 className="h-4 w-4" />{p.editSel ? `Moviendo ${p.editSel.codigo} · ${p.areaTexto}` : "Toca una zona para mover sus límites"}</span>
            {p.editSel && <button type="button" onClick={p.onGuardarEdicion} disabled={p.guardando} className={BTN_PRIMARIO}>{p.guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar</button>}
            <button type="button" onClick={p.onCancelar} className={BTN}><X className="h-4 w-4" />Salir</button>
          </>
        ) : (
          <>
            <button type="button" onClick={p.onDibujar} className={BTN_PRIMARIO}><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Dibujar zona</span></button>
            {p.zonas.length > 0 && <button type="button" onClick={p.onEditar} className={BTN}><Edit3 className="h-4 w-4" /><span className="hidden sm:inline">Editar</span></button>}
          </>
        )}
        <span aria-hidden className="mx-0.5 hidden h-6 w-px shrink-0 bg-[var(--rule-base)] lg:block" />
        {p.zonas.length > 0 && (
          <select value="" onChange={(e) => { if (e.target.value) p.onIrA(e.target.value); }} aria-label="Ir a una zona" className={SELECT}>
            <option value="">Ir a zona…</option>
            {p.zonas.map((z) => <option key={z.id} value={z.id}>{z.codigo}</option>)}
          </select>
        )}
        {p.flujoDisponible && (
          <span className="inline-flex items-center gap-0.5">
            <button type="button" onClick={p.onFlujo} aria-pressed={p.mostrarFlujo} className={p.mostrarFlujo ? BTN_ON : BTN}><Route className="h-4 w-4" /><span className="hidden md:inline">Flujo</span></button>
            <InfoTip title="Flujo de producción" what="Las rutas numeradas del plano: 1–4 principal (patio → acopio → coche → cinta → rodillos), A para cantear, B solo despuntar y 5 salida." affects="Es un DIBUJO fijo, no datos: el Libro no registra el paso por coche, mesas, cinta ni despuntadora." />
          </span>
        )}
        {/* Lo que no se usa a cada rato va al menú: la columna del mapa mide
            ~600 px a 1280 y seis botones sueltos partían la barra en tres filas. */}
        <ActionMenu
          label="Más opciones del croquis" soloIcono icon={MoreHorizontal} size="sm"
          actions={[
            { id: "etiquetas", label: "Etiquetas sobre las zonas", hint: "Código y PT de cada zona", icon: Tag, activo: p.mostrarEtiquetas, onSelect: p.onEtiquetas },
            { id: "config", label: "Configurar croquis", hint: "Medidas, imagen del plano y maquinaria", icon: Settings2, onSelect: p.onConfigurar },
            { id: "full", label: p.fullscreen ? "Salir de pantalla completa" : "Pantalla completa", icon: p.fullscreen ? Minimize : Maximize, onSelect: p.onFullscreen },
          ]}
        />
      </div>

      <details open={!p.compacta} key={p.compacta ? "c" : "n"} className="group [&_summary::-webkit-details-marker]:hidden">
      <summary className={p.compacta ? "mb-1.5 flex h-11 cursor-pointer list-none items-center text-sm font-bold text-[var(--text-secondary)]" : "hidden"}>Filtros{hayFiltro(f) ? " (activos)" : ""}</summary>
      <div className="flex flex-wrap items-center gap-1.5">
        <SegmentedControl<EstadoFiltro>
          size="sm" label="Filtrar por estado" value={f.estado} onChange={(estado) => p.onFiltros({ ...f, estado })}
          options={[{ value: "todo", label: "Todo" }, { value: "rolliza", label: "Rolliza" }, { value: "aserrada", label: "Aserrada" }, { value: "despacho", label: "Despacho" }]}
        />
        <Filtro label="Especie" valor={f.especie} opciones={p.opciones.especies} onChange={(especie) => p.onFiltros({ ...f, especie })} />
        <Filtro label="Permiso" valor={f.permiso} opciones={p.opciones.permisos} onChange={(permiso) => p.onFiltros({ ...f, permiso })} />
        <Filtro label="Dueño" valor={f.dueno} opciones={p.opciones.duenos} onChange={(dueno) => p.onFiltros({ ...f, dueno })} />
        {hayFiltro(f) && <button type="button" onClick={() => p.onFiltros(FILTROS_VACIOS)} className={BTN}><X className="h-4 w-4" />Limpiar</button>}
      </div>
      </details>
    </div>
  );
}
