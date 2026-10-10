"use client";

/**
 * La ficha de lo que se tocó en el croquis (zona, pila, troza o máquina). Vive
 * en la columna de la derecha en vez de flotar sobre el plano: así el croquis
 * queda entero a la vista mientras se lee. Debajo de `xl` cae bajo el mapa.
 */

import { useEffect, useMemo, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { X, Cog } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { codigoTroza, type ContenidoZona } from "@/lib/forestal/planta-croquis";
import { claveTroza, type AsignacionPlanta, type Item, type MaquinaPlanta, type PlantaCroquis, type PlantaZona, type TrozaUbicable, type UbicacionPlanta } from "@/lib/forestal/planta-zona-types";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import CtpPlantaCroquisFichaZona from "./CtpPlantaCroquisFichaZona";
import { CtpPlantaCroquisFichaPila, CtpPlantaCroquisFichaTroza } from "./CtpPlantaCroquisFichaPila";
import type { SeleccionCroquis } from "./hooks/use-croquis-leaflet";

const KIND_TITULO: Record<Item["kind"], string> = { troza: "Pila de rolliza", producto: "Aserrada", despacho: "Despacho armado" };

/** Una troza en la mano se ubica como cualquier ítem: su id es la clave `troza:<id>`. */
export function trozaEnMano(t: TrozaUbicable, pila: Item): Item {
  return { id: claveTroza(t.id), kind: "troza", label: `Troza ${codigoTroza(t)}`, sub: pila.label, especie: pila.especie, cantidad: t.m3 ?? 0, unidad: "m³", cites: pila.cites };
}

export interface CtpPlantaCroquisFichaProps {
  seleccion: SeleccionCroquis;
  zonaById: Map<string, PlantaZona>;
  items: Item[];
  contenido: Record<string, ContenidoZona>;
  ubicaciones: Record<string, UbicacionPlanta>;
  croquis: PlantaCroquis | null;
  onCerrar: () => void;
  onAbrir: (s: SeleccionCroquis) => void;
  onEnMano: (it: Item) => void;
  onAsignar: (asigs: AsignacionPlanta[]) => void;
  onEditarZona: (z: PlantaZona) => void;
  onDespachar: (zonaId: string) => void;
  onMoverMaquina: (m: MaquinaPlanta) => void;
}

export default function CtpPlantaCroquisFicha(p: CtpPlantaCroquisFichaProps) {
  const { seleccion: sel, zonaById, items, contenido, ubicaciones, croquis } = p;
  const ref = useRef<HTMLDivElement>(null);
  const trozaById = useMemo(() => {
    const m = new Map<string, { troza: TrozaUbicable; pila: Item }>();
    for (const it of items) for (const t of it.trozas ?? []) m.set(t.id, { troza: t, pila: it });
    return m;
  }, [items]);

  // Debajo de `xl` la ficha cae bajo el mapa: se la trae a la vista al tocar algo.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1280) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [sel.tipo, sel.id]);

  let titulo = "";
  /** El título con enlaces (la troza lleva a su ficha); si falta, va `titulo` tal cual. */
  let tituloConEnlace: React.ReactNode = null;
  let cuerpo: React.ReactNode = null;
  if (sel.tipo === "zona") {
    const z = zonaById.get(sel.id);
    if (z) {
      titulo = `${z.codigo}${z.nombre ? ` · ${z.nombre}` : ""}`;
      cuerpo = <CtpPlantaCroquisFichaZona zona={z} contenido={contenido[z.id]} onAbrir={p.onAbrir} onEditar={() => p.onEditarZona(z)} onDespachar={() => p.onDespachar(z.id)} />;
    }
  } else if (sel.tipo === "pila") {
    const it = items.find((x) => x.id === sel.id);
    if (it) {
      const z = zonaById.get(ubicaciones[it.id]?.zonaId ?? "") ?? null;
      titulo = `${KIND_TITULO[it.kind]} · ${it.label}`;
      cuerpo = (
        <CtpPlantaCroquisFichaPila
          item={it} zona={z} ubicaciones={ubicaciones} zonaById={zonaById}
          enZona={z ? contenido[z.id]?.pilas.find((x) => x.item.id === it.id) : undefined}
          onSeparar={(t) => p.onEnMano(trozaEnMano(t, it))}
          onVolver={(tid) => p.onAsignar([{ clave: claveTroza(tid), zonaId: null }])}
          onAbrir={p.onAbrir}
          onMover={() => p.onEnMano(it)}
          onQuitar={() => p.onAsignar([{ clave: it.id, zonaId: null }])}
        />
      );
    }
  } else if (sel.tipo === "troza") {
    const t = trozaById.get(sel.id);
    if (t) {
      titulo = `Troza ${codigoTroza(t.troza)}`;
      tituloConEnlace = (
        <>
          Troza <EnlacePanel cosa="troza" id={t.troza.id}>{codigoTroza(t.troza)}</EnlacePanel>
        </>
      );
      cuerpo = (
        <CtpPlantaCroquisFichaTroza
          troza={t.troza} pila={t.pila} zona={zonaById.get(ubicaciones[claveTroza(t.troza.id)]?.zonaId ?? "") ?? null}
          onVolver={() => p.onAsignar([{ clave: claveTroza(t.troza.id), zonaId: null }])}
          onMover={() => p.onEnMano(trozaEnMano(t.troza, t.pila))}
          onAbrir={p.onAbrir}
        />
      );
    }
  } else {
    const m = croquis?.maquinas.find((x) => x.codigo === sel.id);
    if (m) {
      titulo = `${m.codigo} · ${m.nombre}`;
      cuerpo = (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <Cog className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            {m.fuera ? "Fuera de la planta (en otro almacén)" : `En la planta · x ${m.x} m, y ${m.y} m`}
            <InfoTip title="Mover una máquina" what="Arrástrala en el croquis. Soltarla fuera del terreno la marca «fuera»; meterla de nuevo la vuelve a la planta." affects="Es solo el dibujo: no registra horas ni uso." />
          </p>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => p.onMoverMaquina({ ...m, fuera: !m.fuera })}>
            {m.fuera ? "Volver a la planta" : "Está en otro almacén"}
          </button>
        </div>
      );
    }
  }

  return (
    <div ref={ref} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <CardTitle as="h3" className="min-w-0 break-words text-sm font-bold text-[var(--text-primary)]">{tituloConEnlace ?? (titulo || "Ya no está en el plano")}</CardTitle>
        <button type="button" onClick={p.onCerrar} aria-label="Cerrar ficha y volver a la lista" title="Volver a la lista (Esc)" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></button>
      </div>
      {cuerpo ?? <p className="text-sm text-[var(--text-tertiary)]">Se despachó o se quitó desde otra pantalla. Cierra la ficha para volver a la lista.</p>}
    </div>
  );
}
