"use client";

/**
 * CtpPlantaCroquisLeyendaCategorias — la leyenda del croquis por CATEGORÍA de
 * componente (madera, maquinaria, techo, servicio, cámaras…), con el formato
 * de la simbología del plano. Tocar una categoría atenúa el resto del mapa;
 * «Ver qué es cada zona» despliega las zonas de cada una (tocar una la trae a
 * la vista). Va DEBAJO del mapa, como la de rutas: a 400 px una tarjeta
 * flotante tapaba medio plano. Las zonas cargadas antes de la leyenda salen
 * por su tipo, con el botón para identificarlas.
 */

import type { ComponentType } from "react";
import { Building2, Camera, Cog, Construction, Layers, Leaf, LogIn, MapPin, Sparkles, Warehouse, Wrench } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { PATRON_RAYADO_CEMENTO, PATRON_RAYADO_TECHO, claveLeyenda, leyendaDeZonas, type FormatoComponente } from "@/lib/forestal/croquis-componentes";
import type { CategoriaComponente, PlantaZona } from "@/lib/forestal/planta-zona-types";

export const ICONO_CATEGORIA: Record<CategoriaComponente, ComponentType<{ className?: string }>> = {
  madera: Layers, maquinaria: Cog, techo: Warehouse, servicio: Wrench, oficina: Building2,
  seguridad: Camera, acceso: LogIn, limite: Construction, naturaleza: Leaf, otro: MapPin,
};

/**
 * Los rellenos rayados (ramada, piso de cemento) como patrones SVG: el mapa y
 * las muestras los usan con `url(#…)`. UNA vez por pantalla. Oculto con tamaño
 * 0 y no con `display:none` (así Chrome no pinta el patrón).
 */
export function CroquisPatrones() {
  return (
    <svg aria-hidden focusable="false" width="0" height="0" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <pattern id={PATRON_RAYADO_TECHO} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" style={{ fill: "var(--amazon-river)", fillOpacity: 0.14 }} />
          <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: "var(--amazon-river)", strokeWidth: 2.4 }} />
        </pattern>
        <pattern id={PATRON_RAYADO_CEMENTO} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--text-tertiary)", strokeWidth: 1.3 }} />
        </pattern>
      </defs>
    </svg>
  );
}

/** La muestra de un formato: el mismo contorno, trazo y relleno que en el mapa. */
export function MuestraFormato({ formato }: { formato: FormatoComponente }) {
  return (
    <svg aria-hidden focusable="false" width="22" height="14" viewBox="0 0 22 14" className="shrink-0">
      <rect
        x="1.5" y="1.5" width="19" height="11" rx="2"
        style={{ fill: formato.relleno, fillOpacity: Math.max(formato.opacidad, 0.12), stroke: formato.color, strokeWidth: Math.min(formato.peso, 3), strokeDasharray: formato.trazo ? "4 2.5" : undefined }}
      />
    </svg>
  );
}

const CHIP = "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-bold transition-colors";

export default function CtpPlantaCroquisLeyendaCategorias({ zonas, filtro, onFiltro, onIrA, pendientes, identificando, onIdentificar }: {
  /** Las zonas del croquis. */
  zonas: PlantaZona[];
  /** Clave de la entrada que se está mirando (las demás se atenúan); null = todas. */
  filtro: string | null;
  onFiltro: (clave: string | null) => void;
  onIrA: (zonaId: string) => void;
  /** Zonas sin componente (cargadas antes de la leyenda). */
  pendientes: number;
  identificando: boolean;
  onIdentificar: () => void;
}) {
  const [abierta, setAbierta] = useLocalStorage<boolean>("ctp-croquis-leyenda-abierta", false);
  const entradas = leyendaDeZonas(zonas);
  if (entradas.length === 0) return null;

  return (
    <section aria-label="Leyenda del plano" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2" data-leyenda-categorias="">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="mr-1 flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Leyenda del plano
          <InfoTip
            title="Leyenda del plano"
            what="Cada zona del croquis según lo que es en la leyenda de la lámina, con su formato: ramada rayada, techo parabólico punteado azul, cerco marrón, malla verde azulada, río azul claro y maquinaria amarilla."
            affects="Toca una categoría para ver solo esas zonas (el resto se atenúa). La madera se ubica en madera, maquinaria, acceso y ramadas; no en servicios, cámaras, oficina, límites ni naturaleza."
            example="Maquinaria: cinta principal, rodillos, mesas 1 y 2, coche de aserrío, despuntadora."
          />
        </span>
        {entradas.map((e) => {
          const activa = filtro === e.clave;
          const Icono = e.categoria ? ICONO_CATEGORIA[e.categoria] : MapPin;
          return (
            <button
              key={e.clave}
              type="button"
              aria-pressed={activa}
              title={e.hint}
              onClick={() => onFiltro(activa ? null : e.clave)}
              className={`${CHIP} ${activa ? "border-[var(--text-primary)] bg-[var(--surface-sunken)] text-[var(--text-primary)]" : filtro ? "border-[var(--rule-soft)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]" : "border-[var(--rule-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
            >
              {e.formatos.slice(0, 3).map((f, i) => <MuestraFormato key={i} formato={f} />)}
              <Icono className="h-3.5 w-3.5 shrink-0" />
              {e.label}
              <span className="tabular-nums font-semibold text-[var(--text-tertiary)]">{e.n}</span>
            </button>
          );
        })}
        {filtro && (
          <button type="button" onClick={() => onFiltro(null)} className="h-8 rounded-lg px-2 text-xs font-semibold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">Ver todas</button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {pendientes > 0 && (
            <button
              type="button"
              onClick={onIdentificar}
              disabled={identificando}
              title="Asigna a cada zona lo que es en la leyenda, por su nombre y su número (PT-08 → 8)"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-xs font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {identificando ? "Identificando…" : `Identificar la leyenda (${pendientes})`}
            </button>
          )}
          <button type="button" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)} className="h-8 rounded-lg px-2 text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">
            {abierta ? "Ocultar zonas" : "Ver qué es cada zona"}
          </button>
        </span>
      </div>

      {abierta && (
        <div className="mt-2 grid gap-3 border-t border-[var(--rule-soft)] pt-2 sm:grid-cols-2 xl:grid-cols-3">
          {entradas.map((e) => (
            <div key={e.clave} className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                <MuestraFormato formato={e.formatos[0]} />{e.label}
              </p>
              <p className="mb-1 text-xs text-[var(--text-tertiary)]">{e.hint}</p>
              <ul className="space-y-0.5">
                {zonas.filter((z) => claveLeyenda(z) === e.clave).map((z) => (
                  <li key={z.id}>
                    <button type="button" onClick={() => onIrA(z.id)} className="flex w-full items-baseline gap-1.5 rounded-md px-1 py-0.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                      <span className="shrink-0 font-mono font-bold text-[var(--text-primary)]">{z.codigo}</span>
                      <span className="min-w-0 truncate">{z.componente?.nombre ?? z.nombre ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-bold text-[var(--text-primary)]">Marcas</p>
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-4 shrink-0 rounded-sm border-2 border-[var(--data-warning-500)] bg-[var(--text-primary)]" />Máquina D1–D7 (gris = fuera)</span>
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-4 shrink-0 rounded-full border-2 border-[var(--text-tertiary)] bg-[var(--surface-raised)]" />Troza separada</span>
          </div>
        </div>
      )}
    </section>
  );
}
