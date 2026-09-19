"use client";

/**
 * LothMapaToolbar — la ÚNICA barra del mapa del Libro TH, pegada arriba de él.
 *
 * Antes eran cuatro filas repartidas por la pantalla —capas arriba a la
 * derecha, el modo campo en otra, las herramientas en otra, y dibujar,
 * importar y exportar en la cabina EUDR y en tres paneles de abajo—: 34
 * botones con texto antes de llegar al mapa (medido 2026-09-18). Ahora:
 *
 *   · Capas ▾     base, cuadrícula, censo, capas oficiales, secciones
 *   · Dibujar ▾   área, contorno del predio, vía, referencia, pegar coordenadas
 *   · íconos      medir, ir a coordenada, comparar EUDR, faja, perfil, campo
 *   · Exportar ▾  planos, informe EUDR, GeoJSON, KML, CSV, PNG
 *   · pantalla completa
 *
 * Los tres menús usan `ActionMenu`: cada opción lleva su línea de para qué
 * sirve, que un botón suelto no tenía dónde decir. Las herramientas son íconos
 * con tooltip porque son interruptores —se prenden y se apagan— y el color
 * dice cuál está prendida sin abrir nada.
 */

import { Download, Layers, Loader2, Maximize2, Minimize2, PenTool, Save, Wrench, type LucideIcon } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";

export interface HerramientaIcono {
  id: string;
  /** Nombre corto: el renglón del menú en el celular. */
  corto: string;
  /** Qué hace, en una línea: es el tooltip y el nombre accesible. */
  label: string;
  icono: LucideIcon;
  activa: boolean;
  disabled?: boolean;
  /** Esperando un servicio externo (imágenes históricas, altitudes). */
  cargando?: boolean;
  onClick: () => void;
}

interface Props {
  capas: MenuAccion[];
  dibujar: MenuAccion[];
  /** Algún dibujo está en curso: el menú Dibujar se marca como activo. */
  dibujando: boolean;
  herramientas: HerramientaIcono[];
  exportar: MenuAccion[];
  fullscreen: boolean;
  onFullscreen: () => void;
  /** Hay referencias, vías o predio sin guardar (se muestra sólo entonces). */
  sinGuardar: boolean;
  guardando: boolean;
  onGuardar: () => void;
}

const ICONO =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-40";
const ICONO_OFF =
  "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";
const ICONO_ON = "border-transparent bg-[var(--brand-ink)] text-white";

export default function LothMapaToolbar({
  capas,
  dibujar,
  dibujando,
  herramientas,
  exportar,
  fullscreen,
  onFullscreen,
  sinGuardar,
  guardando,
  onGuardar,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
      <ActionMenu label="Capas" icon={Layers} actions={capas} title="Base del mapa, cuadrícula, censo y capas oficiales" compactoEnMovil />
      <ActionMenu
        label="Dibujar"
        icon={PenTool}
        actions={dibujar}
        variant={dibujando ? "accent" : "outline"}
        title="Área de aprovechamiento, contorno del predio, vías y referencias"
        compactoEnMovil
      />

      <span className="mx-0.5 h-6 w-px bg-[var(--rule-base)] max-sm:hidden" aria-hidden="true" />

      {/* En el celular los seis íconos partían la barra en tres filas: ahí van
          a un menú, y lo prendido se sigue viendo en su panel bajo la barra. */}
      <div className="sm:hidden">
        <ActionMenu
          label="Herramientas"
          icon={Wrench}
          compactoEnMovil
          actions={herramientas.map((h) => ({
            id: h.id,
            label: h.corto,
            hint: h.label,
            icon: h.icono,
            activo: h.activa,
            busy: h.cargando,
            disabled: h.disabled,
            onSelect: h.onClick,
          }))}
        />
      </div>
      <div role="group" aria-label="Herramientas del mapa" className="flex flex-wrap items-center gap-1.5 max-sm:hidden">
        {herramientas.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={h.onClick}
            disabled={h.disabled}
            aria-pressed={h.activa}
            aria-label={h.label}
            title={h.label}
            className={`${ICONO} ${h.activa ? ICONO_ON : ICONO_OFF}`}
          >
            {h.cargando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <h.icono className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {sinGuardar && (
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando}
            title="Hay referencias, vías o datos del predio que todavía no se guardaron"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-3 text-sm font-bold text-[var(--data-warning-700)] transition-colors hover:bg-[var(--data-warning-500)]/20 disabled:opacity-60 dark:text-[var(--data-warning-500)]"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Guardar cambios
          </button>
        )}
        <ActionMenu
          label="Exportar"
          icon={Download}
          actions={exportar}
          title="Planos para el expediente, informe EUDR y archivos"
          compactoEnMovil
        />
        <button
          type="button"
          onClick={onFullscreen}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          title={fullscreen ? "Salir de pantalla completa (Escape)" : "Pantalla completa"}
          className={`${ICONO} ${ICONO_OFF}`}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
