"use client";

/**
 * La cara de la carga, enderezada, con una elipse y el N° de la guía por troza
 * («Medir por foto», 16-10). Tocar una testa la elige (y su fila en la tabla);
 * con «Agregar troza», el próximo toque busca el borde ahí. Debajo, lo de la
 * elegida: −1 / +1 cm y Quitar.
 *
 * Amarillo = lo que midió la foto; turquesa = la elegida; punteada = la que
 * agregó o ajustó el operador. El trazo no escala con la foto
 * (`non-scaling-stroke`): se ve igual a 400 px que a 1280.
 */
import type { KeyboardEvent, MouseEvent } from "react";
import { Minus, Plus, ScanLine, Trash2 } from "@buleje/design-system/icons";
import type { CaraMedida } from "@/lib/forestal/testas-medicion";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Btn } from "./ctp-shared";
import type { TrozasPorFoto } from "./hooks/use-trozas-por-foto";

const coma1 = (n: number): string => n.toFixed(1).replace(".", ",");

/**
 * La parte de la foto que se muestra: las testas que vio la foto con radio y
 * medio de margen (abajo suele quedar medio metro de piso). Sale de lo que
 * midió la foto, no de lo corregido: no salta al quitar o agregar. Una troza
 * que faltó en la orilla queda adentro (su centro está a ~2 radios de la vecina).
 */
function recorte(cara: CaraMedida): { x: number; y: number; w: number; h: number } {
  const ts = cara.testas;
  if (!ts.length) return { x: 0, y: 0, w: cara.ancho, h: cara.alto };
  const radios = ts.map((t) => Math.max(t.aPx, t.bPx)).sort((a, b) => a - b);
  const margen = 1.5 * (radios[Math.floor(radios.length / 2)] ?? 0);
  const x0 = Math.max(0, Math.min(...ts.map((t) => t.cx - Math.max(t.aPx, t.bPx))) - margen);
  const y0 = Math.max(0, Math.min(...ts.map((t) => t.cy - Math.max(t.aPx, t.bPx))) - margen);
  const x1 = Math.min(cara.ancho, Math.max(...ts.map((t) => t.cx + Math.max(t.aPx, t.bPx))) + margen);
  const y1 = Math.min(cara.alto, Math.max(...ts.map((t) => t.cy + Math.max(t.aPx, t.bPx))) + margen);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export default function LothTrozasPorFotoLienzo({ p }: { p: TrozasPorFoto }) {
  const m = p.medida;
  if (!m) return null;
  const { ancho, alto } = m.cara;
  const caja = recorte(m.cara);
  const i = p.testas.findIndex((t) => t.id === p.seleccion);
  const elegida = i >= 0 ? p.testas[i] : null;
  const radios = p.testas.map((t) => (t.aPx + t.bPx) / 2).sort((a, b) => a - b);
  const r = radios[Math.floor(radios.length / 2)] ?? ancho / 30;
  const letra = Math.max(ancho / 70, r * 0.7);

  function alTocar(e: MouseEvent<SVGSVGElement>) {
    const ctm = e.currentTarget.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    void p.tocar(pt.x, pt.y);
  }
  const alTeclear = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    p.setSeleccion(id);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <svg
          viewBox={`${caja.x} ${caja.y} ${caja.w} ${caja.h}`}
          onClick={alTocar}
          data-qa="lienzo-carga"
          aria-label={`Foto de la carga con ${p.testas.length} trozas marcadas`}
          className={`block h-auto w-full touch-manipulation select-none ${p.agregando ? "cursor-crosshair" : "cursor-pointer"}`}
        >
          <image href={m.url} width={ancho} height={alto} />
          {p.testas.map((t, k) => {
            const sel = t.id === p.seleccion;
            const rotar = `rotate(${t.anguloGrados} ${t.cx} ${t.cy})`;
            return (
              <g
                key={t.id}
                role="button"
                tabIndex={0}
                aria-pressed={sel}
                aria-label={`Troza ${p.codigos[k]}: ${coma1(t.dCm)} cm`}
                onKeyDown={alTeclear(t.id)}
                data-qa="testa"
                data-codigo={p.codigos[k]}
                className="outline-none focus-visible:[&>ellipse:last-of-type]:stroke-[var(--accent)]"
              >
                <ellipse cx={t.cx} cy={t.cy} rx={t.aPx} ry={t.bPx} transform={rotar} vectorEffect="non-scaling-stroke" strokeWidth={5} className="fill-none stroke-[var(--brand-ink)] opacity-60" />
                <ellipse
                  cx={t.cx}
                  cy={t.cy}
                  rx={t.aPx}
                  ry={t.bPx}
                  transform={rotar}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={sel ? 4 : 2.5}
                  strokeDasharray={t.origen === "auto" ? undefined : "6 4"}
                  className={sel ? "fill-[var(--accent)]/25 stroke-[var(--accent)]" : "fill-none stroke-[var(--data-warning-500)]"}
                />
                <text
                  x={t.cx}
                  y={t.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={letra}
                  strokeWidth={letra * 0.16}
                  paintOrder="stroke"
                  className="pointer-events-none fill-white stroke-[var(--brand-ink)] font-bold"
                >
                  {p.codigos[k]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {elegida ? (
          <>
            <span className="mr-auto min-w-0 text-sm font-bold text-[var(--text-primary)]" aria-live="polite">
              N° {p.codigos[i]} · <span className="font-mono tabular-nums">{coma1(elegida.dCm)} cm</span>
            </span>
            <Btn onClick={() => p.ajustar(elegida.id, -1)} aria-label={`Achicar 1 cm la troza ${p.codigos[i]}`} className="w-12 px-0!">
              <Minus className="h-4 w-4" aria-hidden="true" />
            </Btn>
            <Btn onClick={() => p.ajustar(elegida.id, 1)} aria-label={`Agrandar 1 cm la troza ${p.codigos[i]}`} className="w-12 px-0!">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Btn>
            <Btn variant="danger" onClick={() => p.quitar(elegida.id)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Quitar
            </Btn>
          </>
        ) : (
          <span className="mr-auto flex items-center gap-1 text-sm text-[var(--text-secondary)]">
            {p.buscando ? "Buscando el borde…" : p.agregando ? "Toca la troza que faltó." : "Toca una troza para corregirla."}
            <InfoTip
              title="Corregir la foto"
              what="Cada elipse es una troza que vio la foto, con el N° que llevará en la guía (se leen por filas, de arriba abajo y de izquierda a derecha). Tócala para achicarla o agrandarla de a 1 cm, o para quitarla si no es una troza. Si faltó una, toca «Agregar troza» y después la troza."
              affects="El Ø de la tabla es el promedio de los dos ejes de la elipse, a 1 decimal como el libro."
              example="Amarillo = medida por la foto · punteada = la agregaste o ajustaste tú"
              ariaLabel="Cómo corregir la foto"
            />
          </span>
        )}
        <Btn
          variant={p.agregando ? "primary" : "secondary"}
          aria-pressed={p.agregando}
          disabled={p.buscando}
          onClick={() => {
            p.setSeleccion(null);
            p.setAgregando(!p.agregando);
          }}
        >
          <ScanLine className="h-4 w-4" aria-hidden="true" /> {p.agregando ? "Toca la foto" : "Agregar troza"}
        </Btn>
      </div>
      {p.aviso && (
        <p role="status" className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {p.aviso}
        </p>
      )}
    </div>
  );
}
