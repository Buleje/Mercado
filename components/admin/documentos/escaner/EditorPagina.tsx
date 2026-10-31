"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Crop, Maximize, RotateCw, Sparkles, Loader2 } from "@buleje/design-system/icons";
import { FILTROS } from "@/lib/documentos/escaner/filtros";
import { cuadrilateroCompleto, type Cuadrilatero as Quad } from "@/lib/documentos/escaner/geometria";
import { logger } from "@/lib/logger";
import { Cuadrilatero } from "./Cuadrilatero";
import { filtrar, recortarYRotar } from "./procesar-pagina";
import type { PaginaEscaner } from "./tipos";

type Modo = "recortar" | "filtros";

const BASE_LADO = 760;

/** Editor de UNA página: recorte con 8 tiradores, rotar y filtros en vivo. */
export function EditorPagina({
  pagina,
  indice,
  total,
  onActualizar,
  onListo,
}: {
  pagina: PaginaEscaner;
  indice: number;
  total: number;
  onActualizar: (id: string, c: Partial<Pick<PaginaEscaner, "quad" | "rotacion" | "filtro">>) => void;
  onListo: () => void;
}) {
  const [modo, setModo] = useState<Modo>("recortar");
  const [base, setBase] = useState<ImageData | null>(null);
  const [cargando, setCargando] = useState(false);
  const lienzoRef = useRef<HTMLCanvasElement>(null);

  // La base (recorte + rotación, sin filtro) se recalcula al entrar a Filtros
  // o al cambiar el recorte/rotación. El filtro luego es instantáneo.
  useEffect(() => {
    if (modo !== "filtros") return;
    let vivo = true;
    setCargando(true);
    recortarYRotar({ origenBlob: pagina.origenBlob, quad: pagina.quad, rotacion: pagina.rotacion }, BASE_LADO)
      .then((img) => {
        if (vivo) setBase(img);
      })
      .catch((err) => logger.warn("[escaner] base de filtro falló", { error: String(err) }))
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [modo, pagina.origenBlob, pagina.quad, pagina.rotacion]);

  // Dibuja la base con el filtro elegido (instantáneo).
  useEffect(() => {
    if (modo !== "filtros" || !base) return;
    const c = lienzoRef.current;
    if (!c) return;
    const img = filtrar(base, pagina.filtro);
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")?.putImageData(img, 0, 0);
  }, [modo, base, pagina.filtro]);

  const rotar = () => onActualizar(pagina.id, { rotacion: (pagina.rotacion + 90) % 360 });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Página {indice + 1} de {total}
        </span>
        <div className="flex rounded-xl border border-[var(--rule-base)] p-0.5">
          {(["recortar", "filtros"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                modo === m ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              }`}
            >
              {m === "recortar" ? <Crop className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {m === "recortar" ? "Recortar" : "Filtros"}
            </button>
          ))}
        </div>
      </div>

      {modo === "recortar" ? (
        <>
          <Cuadrilatero
            src={pagina.origenUrl}
            ancho={pagina.ancho}
            alto={pagina.alto}
            quad={pagina.quad}
            onCambio={(q: Quad) => onActualizar(pagina.id, { quad: q })}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => onActualizar(pagina.id, { quad: cuadrilateroCompleto() })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Maximize className="h-4 w-4" /> Todo
            </button>
            <button
              type="button"
              onClick={rotar}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <RotateCw className="h-4 w-4" /> Rotar 90°
            </button>
          </div>
          <p className="text-center text-xs text-[var(--text-tertiary)]">
            Arrastra los 8 puntos para ajustar el borde del documento.
          </p>
        </>
      ) : (
        <>
          <div className="relative mx-auto flex max-h-[52vh] w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
            <canvas ref={lienzoRef} className="max-h-[52vh] w-auto max-w-full object-contain" />
            {cargando && (
              <span className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)]/70">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onActualizar(pagina.id, { filtro: f.id })}
                className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                  pagina.filtro === f.id
                    ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                    : "border-[var(--rule-base)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="text-sm font-semibold text-[var(--text-primary)]">{f.etiqueta}</span>
                <span className="text-[length:var(--ts-2xs,11px)] leading-tight text-[var(--text-tertiary)]">{f.descripcion}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onListo}
        className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-600)]"
      >
        <Check className="h-4 w-4" /> Listo
      </button>
    </div>
  );
}
