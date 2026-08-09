"use client";

/**
 * CtpRadarApariencia — el panel para ajustar cómo se ve la cadena.
 *
 * Tamaño de los bloques (con presets y con sliders finos), color de cada columna
 * (paletas del design system o un color elegido a dedo) y si el volumen se
 * escribe sobre cada línea. Lo elegido se guarda por tenant en el navegador:
 * quien cierra el mes lo deja como le sirve y lo encuentra igual el mes que
 * viene.
 *
 * Read-only respecto de los datos: acá no se toca ni un m³.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Palette, RotateCcw, SlidersHorizontal } from "@buleje/design-system/icons";
import {
  acotar,
  APARIENCIA_DEFAULT,
  COLOR_TOKEN,
  colorDe,
  KINDS,
  LIMITES,
  MEDIDAS,
  paletaActiva,
  PALETAS,
  presetActivo,
  PRESETS_TAMANO,
  type MedidaKey,
  type NodeKind,
  type RadarApariencia,
} from "./ctp-radar-apariencia";

/**
 * El hex que muestra el selector de color nativo, que sólo entiende `#rrggbb`.
 *
 * Dos cosas medidas en el navegador, las dos contraintuitivas:
 *
 * 1. El token se resuelve **desde el panel**, no desde `document.documentElement`.
 *    En la raíz `--accent` es el coral de la marca; dentro del panel admin vale
 *    el verde azulado. Medir en la raíz mostraba un color que no es el que
 *    pinta el dibujo.
 * 2. El valor heredado no es hex sino `oklch(...)`. Se traduce dibujando un
 *    píxel: el navegador es el único que sabe convertir cualquier color CSS, y
 *    de paso descarta lo que no sea un color (queda el gris de respaldo).
 */
function aHex(css: string): string {
  const lienzo = document.createElement("canvas");
  lienzo.width = lienzo.height = 1;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#666666";
  ctx.fillStyle = "#666666";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function hexDe(color: string, contexto: Element | null): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (typeof window === "undefined") return "#666666";
  const m = /^var\((--[a-z0-9-]+)\)$/i.exec(color);
  const css = m
    ? getComputedStyle(contexto ?? document.documentElement).getPropertyValue(m[1]).trim()
    : color;
  return css ? aHex(css) : "#666666";
}

export interface CtpRadarAparienciaProps {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  apariencia: RadarApariencia;
  /** Guarda y aplica en el acto (no hay botón «aceptar»: se ve el cambio detrás). */
  onApariencia: (a: RadarApariencia) => void;
}

export default function CtpRadarApariencia({ abierto, onAbierto, apariencia, onApariencia }: CtpRadarAparienciaProps) {
  const cajaRef = useRef<HTMLDivElement>(null);
  /**
   * De qué lado del botón se abre y cuánto puede medir. El panel mide unos
   * 700 px: anclado siempre hacia abajo, con el botón a media pantalla se salía
   * 280 px por debajo del borde. Se mide el hueco real de cada lado al abrir.
   */
  const [lugar, setLugar] = useState<{ arriba: boolean; maxH: number } | null>(null);
  useEffect(() => {
    if (!abierto || !cajaRef.current) { setLugar(null); return; }
    const r = cajaRef.current.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom - 16;
    const arriba = r.top - 16;
    const usarArriba = abajo < 320 && arriba > abajo;
    setLugar({ arriba: usarArriba, maxH: Math.max(220, Math.round(usarArriba ? arriba : abajo)) });
  }, [abierto]);

  // Click fuera + Escape: es un popover, no un modal — no debe secuestrar la pantalla.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as globalThis.Node)) onAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onAbierto(false); };
    // `pointerdown` y no `mousedown`: en táctil el mousedown sintético llega
    // tarde (o no llega) y la hoja quedaba abierta al tocar afuera.
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto, onAbierto]);

  const preset = presetActivo(apariencia.dims);
  const paleta = paletaActiva(apariencia);
  const aMedida = KINDS.some(({ key }) => apariencia.colores[key] !== undefined) && !paleta;

  const setMedida = (key: MedidaKey, v: number) =>
    onApariencia({ ...apariencia, dims: { ...apariencia.dims, [key]: acotar(key, v) } });
  const setColor = (kind: NodeKind, v: string | undefined) =>
    onApariencia({ ...apariencia, colores: { ...apariencia.colores, [kind]: v } });

  return (
    <div ref={cajaRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onAbierto(!abierto)}
        aria-expanded={abierto}
        title="Tamaño de los bloques y color de cada columna"
        className={`inline-flex h-10 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition ${
          abierto || preset?.key !== "normal" || paleta?.key !== "sistema" || aMedida
            ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12 text-[var(--accent)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        }`}
      >
        <Palette className="h-4 w-4" /> Apariencia
      </button>

      {/* En el celular es una hoja que sube desde abajo: anclado al botón se
          salía 44 px por la izquierda (la barra de controles envuelve) y su
          alto —887 px— no entraba en la pantalla. Desde `sm` vuelve a ser un
          popover pegado al botón. */}
      {abierto && (
        <div
          role="dialog"
          aria-label="Apariencia del dibujo"
          style={lugar ? ({ "--radar-panel-max-h": `${lugar.maxH}px` } as CSSProperties) : undefined}
          className={`fixed inset-x-0 bottom-0 z-50 max-h-[85vh] space-y-4 overflow-y-auto rounded-t-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:z-30 sm:w-96 sm:rounded-2xl sm:max-h-[var(--radar-panel-max-h,32rem)] ${
            lugar?.arriba ? "sm:top-auto sm:bottom-full sm:mb-2" : "sm:bottom-auto sm:top-full sm:mt-2"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <SlidersHorizontal className="h-4 w-4 text-[var(--accent)]" /> Cómo se ve la cadena
            </span>
            <button
              type="button"
              onClick={() => onApariencia(APARIENCIA_DEFAULT)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restablecer
            </button>
          </div>

          {/* ── Tamaño ───────────────────────────────────────────────── */}
          <section className="space-y-2">
            <h4 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Tamaño de los bloques
            </h4>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESETS_TAMANO.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  title={p.hint}
                  onClick={() => onApariencia({ ...apariencia, dims: p.dims })}
                  aria-pressed={preset?.key === p.key}
                  className={`h-9 rounded-lg border-2 text-xs font-bold transition ${
                    preset?.key === p.key
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {MEDIDAS.map((m) => (
              <label key={m.key} className="block" title={m.hint}>
                <span className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                  {m.label}
                  <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{apariencia.dims[m.key]} px</span>
                </span>
                <input
                  type="range"
                  min={LIMITES[m.key].min}
                  max={LIMITES[m.key].max}
                  step={LIMITES[m.key].paso}
                  value={apariencia.dims[m.key]}
                  onChange={(e) => setMedida(m.key, Number(e.target.value))}
                  className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--surface-sunken)] accent-[var(--accent)]"
                />
              </label>
            ))}
          </section>

          {/* ── Color ────────────────────────────────────────────────── */}
          <section className="space-y-2 border-t-2 border-[var(--rule-soft)] pt-3">
            <h4 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Color de cada columna
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {PALETAS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  title={p.hint}
                  onClick={() => onApariencia({ ...apariencia, colores: p.key === "sistema" ? {} : p.colores })}
                  aria-pressed={paleta?.key === p.key}
                  className={`flex h-10 items-center gap-2 rounded-lg border-2 px-2.5 text-xs font-bold transition ${
                    paleta?.key === p.key
                      ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12 text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
                  }`}
                >
                  <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                    {KINDS.map(({ key }) => (
                      <span key={key} className="h-4 w-2 rounded-sm" style={{ background: p.colores[key] }} />
                    ))}
                  </span>
                  {p.label}
                  {paleta?.key === p.key && <Check className="ml-auto h-3.5 w-3.5" />}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 rounded-xl bg-[var(--surface-sunken)] p-2.5">
              <span className="text-xs font-bold text-[var(--text-secondary)]">A medida</span>
              {KINDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={hexDe(colorDe(apariencia, key), cajaRef.current)}
                    onChange={(e) => setColor(key, e.target.value)}
                    aria-label={`Color de ${label}`}
                    className="h-8 w-10 shrink-0 cursor-pointer rounded-md border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
                  {apariencia.colores[key] !== undefined && (
                    <button
                      type="button"
                      onClick={() => setColor(key, undefined)}
                      title={`Volver al color del sistema (${COLOR_TOKEN[key]})`}
                      className="shrink-0 rounded-md px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
                    >
                      Al del sistema
                    </button>
                  )}
                </div>
              ))}
              {aMedida && (
                <p className="text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
                  Un color elegido a mano es el mismo en claro y en oscuro; las paletas de arriba sí se adaptan al tema.
                </p>
              )}
            </div>
            <p className="text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
              El ámbar y el rojo no se tocan: en este dibujo significan «hueco en la cadena» y «CITES».
            </p>
          </section>

          {/* ── Detalle ──────────────────────────────────────────────── */}
          <label className="flex cursor-pointer items-center gap-2 border-t-2 border-[var(--rule-soft)] pt-3 text-xs font-semibold text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={apariencia.etiquetasArista}
              onChange={(e) => onApariencia({ ...apariencia, etiquetasArista: e.target.checked })}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            Escribir el volumen sobre cada línea
            <span className="text-[var(--text-tertiary)]">(con muchas líneas, tapa)</span>
          </label>
        </div>
      )}
    </div>
  );
}
