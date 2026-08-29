"use client";

/**
 * FiltrosDoc — el panel para acotar la lista del drive.
 *
 * Vive detrás de un botón y no desplegado en la barra porque son cuatro grupos
 * de opciones: siempre visibles empujarían la grilla hacia abajo y taparían
 * justo lo que se está buscando. El botón dice cuántos filtros están puestos,
 * así no se puede estar filtrando sin darse cuenta —que es lo que hace pensar
 * "se me perdió un archivo".
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SlidersHorizontal, X, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { etiquetaFamilia } from "@/lib/documentos/etiquetas-familia";
import {
  FILTROS_VACIOS, cuantosFiltrosActivos,
  type FiltrosDoc as Filtros, type FiltroPeso, type FiltroFecha, type FiltroVencimiento,
} from "@/lib/documentos/filtros-doc";
import type { FamiliaArchivo } from "@/lib/documents/tipos-archivo";

interface Props {
  filtros: Filtros;
  onCambiar: (f: Filtros) => void;
  /** Tipos que hay de verdad en lo que se está mirando, con su cuenta. */
  presentes: { familia: FamiliaArchivo; cuantos: number }[];
  /** Etiquetas que hay de verdad en lo que se está mirando, con su cuenta. */
  tagsPresentes: { tag: string; cuantos: number }[];
  abierto: boolean;
  onAlternar: () => void;
  /** Cuántos quedan tras aplicar los filtros, para decirlo sin cerrar el panel. */
  resultados: number;
}

/** Etiquetas más usadas primero: con docenas de tags, la cola larga no entra ni ayuda. */
const MAX_TAGS_EN_PANEL = 15;

const PESOS: { valor: FiltroPeso; texto: string }[] = [
  { valor: "cualquiera", texto: "Cualquiera" },
  { valor: "chico", texto: "Menos de 1 MB" },
  { valor: "mediano", texto: "1 a 10 MB" },
  { valor: "grande", texto: "Más de 10 MB" },
];

const FECHAS: { valor: FiltroFecha; texto: string }[] = [
  { valor: "cualquiera", texto: "Cuando sea" },
  { valor: "hoy", texto: "Hoy" },
  { valor: "semana", texto: "Última semana" },
  { valor: "mes", texto: "Este mes" },
  { valor: "anio", texto: "Este año" },
];

const VENCIMIENTOS: { valor: FiltroVencimiento; texto: string }[] = [
  { valor: "cualquiera", texto: "No importa" },
  { valor: "vencidos", texto: "Ya vencidos" },
  { valor: "por-vencer", texto: "Vencen en 30 días" },
  { valor: "con-fecha", texto: "Con fecha puesta" },
  { valor: "sin-fecha", texto: "Sin fecha" },
];

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {titulo}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border-2 px-2.5 py-1 text-xs font-bold transition-colors",
        activo
          ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary/40",
      )}
    >
      {activo && <Check className="h-3 w-3" />}
      {children}
    </button>
  );
}

export default function FiltrosDoc({ filtros, onCambiar, presentes, tagsPresentes, abierto, onAlternar, resultados }: Props) {
  const activos = cuantosFiltrosActivos(filtros);
  const panelRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  /**
   * Hacia dónde se abre. La barra de herramientas suele quedar a media altura
   * o más abajo, así que abrir siempre hacia abajo dejaba el panel fuera de la
   * pantalla: había que adivinar que estaba ahí y bajar con el scroll.
   */
  const [haciaArriba, setHaciaArriba] = useState(false);

  useLayoutEffect(() => {
    if (!abierto || !botonRef.current) return;
    const caja = botonRef.current.getBoundingClientRect();
    const abajo = window.innerHeight - caja.bottom;
    // Se da vuelta sólo si arriba hay MÁS lugar: si las dos están apretadas,
    // abrir hacia abajo es lo esperable y el panel scrollea solo.
    setHaciaArriba(abajo < 340 && caja.top > abajo);
  }, [abierto]);

  // Cerrar al tocar afuera y con Escape: un panel que tapa la grilla y no se
  // va molesta más de lo que ayuda.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onAlternar();
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") onAlternar(); };
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto, onAlternar]);

  const alternarFamilia = (f: FamiliaArchivo) =>
    onCambiar({
      ...filtros,
      familias: filtros.familias.includes(f)
        ? filtros.familias.filter((x) => x !== f)
        : [...filtros.familias, f],
    });

  const alternarTag = (t: string) =>
    onCambiar({
      ...filtros,
      tags: filtros.tags.includes(t)
        ? filtros.tags.filter((x) => x !== t)
        : [...filtros.tags, t],
    });

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={botonRef}
        onClick={onAlternar}
        className={cn(
          "inline-flex h-[42px] items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold transition-colors",
          activos > 0
            ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            : "border-[var(--rule-base)] bg-white text-[var(--text-tertiary)] hover:border-primary/40 dark:bg-[var(--surface-raised)]",
        )}
        aria-expanded={abierto}
        title="Filtrar por tipo de archivo, peso, fecha o vencimiento"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">Filtros</span>
        {activos > 0 && (
          <span className="rounded-full bg-primary px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-white">
            {activos}
          </span>
        )}
      </button>

      {abierto && (
        // El panel tiene cuatro grupos: en una pantalla de notebook, abierto
        // desde una barra que ya está a media altura, el último quedaba fuera
        // de la vista y no había forma de llegar. Se le pone tope y scroll
        // propio para que siempre se pueda llegar a "Limpiar todo".
        <div
          className={cn(
            "absolute right-0 z-40 max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-2rem))] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border-2 border-[var(--rule-base)] bg-white p-3 shadow-[var(--shadow-lg)] dark:border-white/10 dark:bg-[var(--surface-raised)]",
            haciaArriba ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-[var(--text-primary)]">Filtrar documentos</p>
            <button onClick={onAlternar} aria-label="Cerrar los filtros" className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Sólo los tipos que hay de verdad: ofrecer "Video" en un drive sin
              videos es una opción más para descartar a mano. */}
          {presentes.length > 0 && (
            <Grupo titulo="Tipo de archivo">
              {presentes.map(({ familia, cuantos }) => (
                <Chip key={familia} activo={filtros.familias.includes(familia)} onClick={() => alternarFamilia(familia)}>
                  {etiquetaFamilia(familia)}
                  <span className="tabular-nums opacity-60">{cuantos}</span>
                </Chip>
              ))}
            </Grupo>
          )}

          {tagsPresentes.length > 0 && (
            <Grupo titulo="Etiquetas">
              {tagsPresentes.slice(0, MAX_TAGS_EN_PANEL).map(({ tag, cuantos }) => (
                <Chip key={tag} activo={filtros.tags.includes(tag)} onClick={() => alternarTag(tag)}>
                  #{tag}
                  <span className="tabular-nums opacity-60">{cuantos}</span>
                </Chip>
              ))}
            </Grupo>
          )}

          <Grupo titulo="Peso">
            {PESOS.map((p) => (
              <Chip key={p.valor} activo={filtros.peso === p.valor} onClick={() => onCambiar({ ...filtros, peso: p.valor })}>
                {p.texto}
              </Chip>
            ))}
          </Grupo>

          <Grupo titulo="Subido">
            {FECHAS.map((f) => (
              <Chip key={f.valor} activo={filtros.subido === f.valor} onClick={() => onCambiar({ ...filtros, subido: f.valor })}>
                {f.texto}
              </Chip>
            ))}
          </Grupo>

          <Grupo titulo="Vencimiento">
            {VENCIMIENTOS.map((v) => (
              <Chip key={v.valor} activo={filtros.vencimiento === v.valor} onClick={() => onCambiar({ ...filtros, vencimiento: v.valor })}>
                {v.texto}
              </Chip>
            ))}
          </Grupo>

          <div className="flex items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-2.5">
            <p className="text-xs text-[var(--text-secondary)]">
              <strong className="tabular-nums text-[var(--text-primary)]">{resultados}</strong>{" "}
              documento{resultados === 1 ? "" : "s"} a la vista
            </p>
            <button
              onClick={() => onCambiar(FILTROS_VACIOS)}
              disabled={activos === 0}
              className="text-xs font-bold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Limpiar todo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
