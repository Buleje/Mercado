"use client";

/**
 * La hoja del talonario en pantalla, a escala: cada valor donde va a caer en
 * el papel. Encima, la foto o el escaneo del talonario vacío (sólo en
 * pantalla, nunca se imprime) para acomodar a ojo, y una cuadrícula de 10 mm.
 *
 * La tabla se acomoda desde su PRIMERA fila: arrastrar una celda corre esa
 * columna en X y toda la tabla en Y. Las demás filas siguen el alto de fila, y
 * el recuadro punteado marca hasta dónde llegan las filas que entran.
 */

import { useEffect, useRef, useState } from "react";
import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import CampoTalonario, { ptAMm } from "./gtf-matricial-campo";
import { alineaCss, INTERLINEA } from "@/lib/forestal/gtf-matricial-print";

/** Aire alrededor de la hoja dentro del lienzo, en px. */
const AIRE = 16;

export interface FondoHoja {
  src: string | null;
  opacidad: number;
  cuadricula: boolean;
}

export default function HojaTalonario({
  t,
  fondo,
  zoom,
}: {
  t: EstadoGtfMatricial;
  fondo: FondoHoja;
  zoom: number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={caja}
      className="min-w-0 overflow-auto rounded-xl bg-[var(--surface-sunken)]"
      style={{ padding: AIRE }}
    >
      {t.hoja ? (
        <Lienzo
          t={t}
          fondo={fondo}
          escalaBase={Math.max(0.5, (ancho || 600) / t.hoja.anchoMm) * zoom}
        />
      ) : (
        <div className="min-h-64" />
      )}
    </div>
  );
}

function Lienzo({
  t,
  fondo,
  escalaBase: escala,
}: {
  t: EstadoGtfMatricial;
  fondo: FondoHoja;
  escalaBase: number;
}) {
  const hoja = t.hoja;
  if (!hoja) return null;
  const cat = CATALOGO[t.formato];
  const pagina = t.paginas[t.pagina] ?? { campos: {}, filas: [] };
  const tabla = hoja.tabla;
  const cols = cat.columnas.filter((c) => tabla.columnas[c.id]?.visible);
  const izq = Math.min(...cols.map((c) => tabla.columnas[c.id].x));
  const der = Math.max(...cols.map((c) => tabla.columnas[c.id].x + tabla.columnas[c.id].anchoMm));
  const letraTabla = ptAMm(tabla.letraPt) * escala;

  return (
    <div
      role="application"
      aria-label={`Hoja de ${cat.nombre.toLowerCase()} del talonario, ${hoja.anchoMm} × ${hoja.altoMm} mm`}
      onPointerDown={() => t.setSel(null)}
      className="relative overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
      style={{
        width: hoja.anchoMm * escala,
        height: hoja.altoMm * escala,
        ...(fondo.cuadricula
          ? {
              backgroundImage:
                "linear-gradient(to right, var(--rule-soft) 1px, transparent 1px), linear-gradient(to bottom, var(--rule-soft) 1px, transparent 1px)",
              backgroundSize: `${10 * escala}px ${10 * escala}px`,
            }
          : {}),
      }}
    >
      {fondo.src && (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL local, sólo para alinear a ojo
        <img
          src={fondo.src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          style={{ opacity: fondo.opacidad }}
        />
      )}

      {cols.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[2px] border border-dashed border-[var(--rule-strong)]"
          style={{
            left: izq * escala,
            top: tabla.y * escala,
            width: (der - izq) * escala,
            height: tabla.altoFilaMm * tabla.maxFilas * escala,
          }}
        />
      )}

      {/* Filas 2 en adelante: siguen a la primera, no se arrastran. */}
      {pagina.filas.slice(1, tabla.maxFilas).map((fila, i) =>
        cols.map((c) => {
          const pos = tabla.columnas[c.id];
          const valor = fila[c.id] ?? "";
          if (!valor) return null;
          return (
            <span
              key={`${i}-${c.id}`}
              aria-hidden
              className="pointer-events-none absolute overflow-visible whitespace-nowrap text-[var(--text-primary)]"
              style={{
                left: pos.x * escala,
                top: (tabla.y + (i + 1) * tabla.altoFilaMm) * escala,
                width: pos.anchoMm * escala,
                fontSize: letraTabla,
                lineHeight: INTERLINEA,
                textAlign: alineaCss(pos.alinea) as React.CSSProperties["textAlign"],
                fontFamily: '"Courier New", Courier, monospace',
                fontWeight: 700,
              }}
            >
              {valor}
            </span>
          );
        }),
      )}

      {cols.map((c) => {
        const pos = tabla.columnas[c.id];
        return (
          <CampoTalonario
            key={`col-${c.id}`}
            etiqueta={c.label}
            texto={pagina.filas[0]?.[c.id] ?? ""}
            x={pos.x}
            y={tabla.y}
            anchoMm={pos.anchoMm}
            letraPt={tabla.letraPt}
            alinea={pos.alinea}
            escala={escala}
            unaLinea
            seleccionado={t.sel?.tipo === "columna" && t.sel.id === c.id}
            onSeleccionar={() => t.setSel({ tipo: "columna", id: c.id })}
            onMover={(x, y) => {
              t.cambiarColumna(c.id, { x });
              if (y !== tabla.y) t.cambiarTabla({ y });
            }}
          />
        );
      })}

      {cat.campos.map((c) => {
        const pos = hoja.campos[c.id];
        if (!pos?.visible) return null;
        return (
          <CampoTalonario
            key={c.id}
            etiqueta={c.label}
            texto={pagina.campos[c.id] ?? ""}
            x={pos.x}
            y={pos.y}
            anchoMm={pos.anchoMm}
            letraPt={pos.letraPt}
            alinea={pos.alinea}
            escala={escala}
            seleccionado={t.sel?.tipo === "campo" && t.sel.id === c.id}
            onSeleccionar={() => t.setSel({ tipo: "campo", id: c.id })}
            onMover={(x, y) => t.cambiarCampo(c.id, { x, y })}
          />
        );
      })}
    </div>
  );
}
