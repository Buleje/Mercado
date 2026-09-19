"use client";

/**
 * Qué se está mirando ahora mismo: un chip por VALOR elegido.
 *
 * Uno por valor y no uno por campo (Brandon, 2026-09-10): con dos especies
 * puestas, sacar una no debería sacar la otra. Se esconde entero cuando no hay
 * ningún filtro — una fila vacía enseña a no mirar la fila.
 */

import { X } from "@buleje/design-system/icons";
import { ESTADO_META, SIN_TITULO, type EstadoTroza } from "@/lib/forestal/trozas-patio";

const TRAMO_LABEL: Record<string, string> = {
  fresca: "Menos de 30 días",
  atencion: "30 a 59 días",
  riesgo: "60 días o más",
};

export interface CtpTrozasFiltrosActivosProps {
  texto: string;
  onTexto: (v: string) => void;
  estadoFiltro: readonly EstadoTroza[];
  onEstadoFiltro: (v: EstadoTroza[]) => void;
  tramoFiltro: readonly string[];
  onTramoFiltro: (v: string[]) => void;
  especie: readonly string[];
  onEspecie: (v: string[]) => void;
  guia: readonly string[];
  onGuia: (v: string[]) => void;
  titulo: readonly string[];
  onTitulo: (v: string[]) => void;
  onLimpiar: () => void;
}

export default function CtpTrozasFiltrosActivos({
  texto, onTexto, estadoFiltro, onEstadoFiltro, tramoFiltro, onTramoFiltro,
  especie, onEspecie, guia, onGuia, titulo, onTitulo, onLimpiar,
}: CtpTrozasFiltrosActivosProps) {
  const hayFiltro =
    Boolean(texto.trim()) || [estadoFiltro, especie, tramoFiltro, guia, titulo].some((v) => v.length > 0);
  if (!hayFiltro) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-1.5 text-[length:var(--ts-2xs)]">
      {estadoFiltro.map((e) => (
        <Chip key={e} label={ESTADO_META[e].label} onQuitar={() => onEstadoFiltro(estadoFiltro.filter((x) => x !== e))} />
      ))}
      {tramoFiltro.map((t) => (
        <Chip key={t} label={TRAMO_LABEL[t] ?? t} onQuitar={() => onTramoFiltro(tramoFiltro.filter((x) => x !== t))} />
      ))}
      {especie.map((e) => (
        <Chip key={e} label={e} onQuitar={() => onEspecie(especie.filter((x) => x !== e))} />
      ))}
      {guia.map((g) => (
        <Chip key={g} label={`Guía ${g}`} onQuitar={() => onGuia(guia.filter((x) => x !== g))} />
      ))}
      {titulo.map((t) => (
        <Chip
          key={t}
          label={t === SIN_TITULO ? "Sin título declarado" : `Título ${t}`}
          onQuitar={() => onTitulo(titulo.filter((x) => x !== t))}
        />
      ))}
      {texto.trim() && <Chip label={`«${texto.trim()}»`} onQuitar={() => onTexto("")} />}
      <button type="button" onClick={onLimpiar} className="font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]">
        Ver todo
      </button>
    </div>
  );
}

function Chip({ label, onQuitar }: { label: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2 pr-1 font-bold text-[var(--accent-ink)] dark:bg-[var(--accent)]/12 dark:text-[var(--accent)]">
      {label}
      <button type="button" onClick={onQuitar} aria-label={`Quitar el filtro ${label}`} className="rounded-full p-0.5 hover:bg-[var(--surface-canvas)]">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
