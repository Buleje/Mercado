"use client";

/**
 * Las secciones del cubicador de madera (Brandon 23-10: «que se haga sección e
 * ir en sección y sección; que no estén todas las secciones visibles en una
 * pantalla»). Se ve UNA a la vez y la URL la recuerda (`?sub=`, regla 11 de la
 * vista): Cargar · Lote · Guardadas · Grabaciones.
 *
 * Antes eran tres bloques apilados con un índice pegajoso que llevaba a cada
 * uno (`cubicador-indice`, 23-10 a la mañana). Para no dictar a ciegas ahora
 * que la tabla no está debajo, «Cargar» muestra `UltimasDelLote`: las últimas
 * piezas y el total del lote, con los MISMOS totales que calcula el cubicador
 * (el m³ sale del pie tablar ÷ 424; acá no se suma nada).
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Layers, Table } from "@buleje/design-system/icons";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { masNuevasPrimero } from "@/lib/forestal/cubicador-bloques-especie";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { formatNumber } from "@/lib/format";

export const SECCIONES_CUBICADOR = ["cargar", "lote", "guardadas", "grabaciones"] as const;
export type SeccionCubicador = (typeof SECCIONES_CUBICADOR)[number];

const ROTULO: Record<SeccionCubicador, string> = {
  cargar: "Cargar",
  lote: "Lote",
  guardadas: "Guardadas",
  grabaciones: "Grabaciones",
};

const ID_PANEL = "cubicador-madera-seccion";

/**
 * La sección que se ve, en `?sub=` (y recordada para la próxima visita).
 * `visitadas`: las que ya se abrieron. Las Grabaciones quedan montadas después
 * de la primera visita: salir a «Cargar» no puede cortar una grabación.
 */
export function useSeccionDelCubicador(): {
  seccion: SeccionCubicador;
  irA: (s: SeccionCubicador) => void;
  visitadas: ReadonlySet<SeccionCubicador>;
} {
  const { vista, irA } = useSubvistaModulo<SeccionCubicador>("forestal-cubicador-madera", SECCIONES_CUBICADOR, "cargar");
  const ir = useCallback((s: SeccionCubicador) => irA(s), [irA]);
  const [visitadas, setVisitadas] = useState<ReadonlySet<SeccionCubicador>>(() => new Set([vista]));
  /* Ajuste durante el render (patrón de React): sin un efecto que pinte un cuadro de más. */
  if (!visitadas.has(vista)) setVisitadas(new Set([...visitadas, vista]));
  return { seccion: vista, irA: ir, visitadas };
}

/** Atributos del contenedor que cambia con la barra (patrón ARIA de pestañas). */
export function panelDeSeccion(seccion: SeccionCubicador) {
  return { role: "tabpanel" as const, id: ID_PANEL, "aria-labelledby": idPestanaDeSeccion(ID_PANEL, seccion) };
}

/**
 * La barra de secciones, pegada arriba: en un lote de 700 filas la vuelta a
 * «Cargar» no puede pedir subir toda la tabla. Al cambiar de sección desde
 * abajo, se sube al principio del cubicador (la sección nueva empieza ahí).
 */
export function BarraDelCubicador({ seccion, onCambiar, piezasDelLote, resumen }: {
  seccion: SeccionCubicador;
  onCambiar: (s: SeccionCubicador) => void;
  /** Piezas del lote, al lado de «Lote». */
  piezasDelLote: number;
  /** m³ · PT del lote, a la derecha (desde 640 px). */
  resumen?: ReactNode;
}) {
  const ancla = useRef<HTMLDivElement>(null);
  const secciones = SECCIONES_CUBICADOR.map((clave) => ({
    clave,
    rotulo: ROTULO[clave],
    cuenta: clave === "lote" ? piezasDelLote : undefined,
  }));
  const cambiar = (s: SeccionCubicador) => {
    onCambiar(s);
    const el = ancla.current;
    /* 64 px = la cabecera del panel: más arriba, la barra ya está pegada. */
    if (el && el.getBoundingClientRect().top < 64) el.scrollIntoView({ block: "start", behavior: "auto" });
  };
  return (
    <>
      <div ref={ancla} aria-hidden className="scroll-mt-16" />
      <div className="sticky top-16 z-20 flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-sm)]">
        <div className="min-w-0 flex-1">
          <BarraDeSecciones
            secciones={secciones}
            activa={seccion}
            onCambiar={cambiar}
            etiqueta="Secciones del cubicador"
            idPanel={ID_PANEL}
            tonoCuenta="neutro"
          />
        </div>
        {resumen && (
          <span className="hidden shrink-0 pr-2 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)] sm:inline">
            {resumen}
          </span>
        )}
      </div>
    </>
  );
}

const ULTIMAS = 4;

/**
 * Lo último que se cargó y el total del lote, debajo del micrófono: con la
 * tabla en su propia sección, sin esto se dictaría a ciegas. La primera es la
 * recién dictada (`masNuevasPrimero`, el mismo orden de «Más nuevas primero»).
 */
export function UltimasDelLote({ rows, totales, fmtPt, fmtM3, onVerLote, apartado }: {
  rows: readonly PiezaCubicada[];
  /** Los totales del cubicador, tal cual (no se recalculan acá). */
  totales: { piezas: number; pt: number; m3: number };
  fmtPt: (v: number) => string;
  fmtM3: (v: number) => string;
  onVerLote: () => void;
  /** El apartado en curso, para cerrarlo sin ir al lote. */
  apartado?: { letra: string; piezas: number; pt: number; onCerrar: () => void };
}) {
  const ultimas = useMemo(() => masNuevasPrimero(rows).slice(0, ULTIMAS), [rows]);
  if (rows.length === 0) return null;
  return (
    <section
      aria-label="Lo último que cargaste"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-bold text-[var(--text-secondary)]">Últimas</span>
        <ol className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {ultimas.map((r, i) => (
            <li
              key={r.id}
              title={`${r.cantidad} × ${r.espesor}×${r.ancho}×${r.largo}${r.especie ? ` · ${r.especie}` : ""} = ${fmtPt(r.pieTablar)} PT`}
              className={`inline-flex items-baseline gap-1.5 rounded-lg border px-2 py-1 font-mono text-sm tabular-nums ${
                i === 0
                  ? "border-[var(--accent)] bg-primary/10 font-bold text-[var(--text-primary)]"
                  : "border-transparent bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
              }`}
            >
              {r.cantidad > 1 && <span>{r.cantidad}×</span>}
              <span>{r.espesor}×{r.ancho}×{r.largo}</span>
              {r.especie && <span className="hidden font-sans text-xs font-semibold text-[var(--text-tertiary)] md:inline">{r.especie}</span>}
            </li>
          ))}
        </ol>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
            {fmtPt(totales.pt)} <span className="font-sans text-xs text-[var(--text-tertiary)]">PT</span>
            <span aria-hidden className="px-1 text-[var(--rule-base)]">·</span>
            {fmtM3(totales.m3)} <span className="font-sans text-xs text-[var(--text-tertiary)]">m³</span>
            <span aria-hidden className="px-1 text-[var(--rule-base)]">·</span>
            {formatNumber(totales.piezas)} <span className="font-sans text-xs text-[var(--text-tertiary)]">pzas</span>
          </span>
          <button
            type="button"
            onClick={onVerLote}
            className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] dark:text-[var(--accent)]"
          >
            <Table className="h-4 w-4" aria-hidden /> Ver el lote
          </button>
        </div>
      </div>
      {apartado && apartado.piezas > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">
            Apartado {apartado.letra} sin guardar ·{" "}
            <span className="font-mono tabular-nums">
              {apartado.piezas} {apartado.piezas === 1 ? "pieza" : "piezas"} · {fmtPt(apartado.pt)} PT
            </span>
          </span>
          <button
            type="button"
            onClick={apartado.onCerrar}
            className="ml-auto inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-[var(--accent-dark)] px-3 text-sm font-bold text-white transition hover:brightness-95"
          >
            <Layers className="h-4 w-4" aria-hidden /> Cerrar apartado {apartado.letra}
          </button>
        </div>
      )}
    </section>
  );
}
