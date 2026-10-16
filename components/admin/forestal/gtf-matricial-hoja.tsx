"use client";

/**
 * La hoja del talonario en pantalla, a escala: cada valor donde va a caer en
 * el papel. Encima, la foto o el escaneo del talonario vacío (sólo en
 * pantalla, nunca se imprime) para acomodar a ojo, y una cuadrícula de 10 mm.
 *
 * La tabla se acomoda desde su PRIMERA fila: arrastrar una celda corre esa
 * columna en X y toda la tabla en Y. Las demás filas siguen el alto de fila, y
 * el recuadro punteado marca hasta dónde llegan las filas que entran.
 *
 * El lienzo tiene alto fijo y se desplaza adentro: así la lupa acerca sobre un
 * punto y «Ver hoja completa» puede hacer entrar el alto. Con el mouse, un
 * recuadro sobre la hoja vacía elige lo que toca; al arrastrar, las guías
 * (líneas de la marca) avisan que un borde o un centro coincide con otro.
 */

import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import { claveElemento, INTERLINEA, ptAMm } from "@/lib/forestal/gtf-matricial-edicion";
import { alineaCss } from "@/lib/forestal/gtf-matricial-print";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";
import { AIRE_LIENZO, type ZoomTalonario } from "./hooks/use-gtf-matricial-zoom";
import CampoTalonario from "./gtf-matricial-campo";

export interface FondoHoja {
  src: string | null;
  opacidad: number;
  cuadricula: boolean;
}

const MONO = '"Courier New", Courier, monospace';

export default function HojaTalonario({ t, s, z, fondo }: { t: EstadoGtfMatricial; s: SeleccionTalonario; z: ZoomTalonario; fondo: FondoHoja }) {
  return (
    <div
      ref={z.caja}
      /* Alto = lo que queda visible bajo la cabecera, las pestañas, la barra y el pie (1280 × 900: ~556 px). */
      className="relative h-[clamp(22rem,calc(100dvh-21.5rem),64rem)] min-w-0 overflow-auto overscroll-contain rounded-xl bg-[var(--surface-sunken)]"
      style={{ padding: AIRE_LIENZO }}
    >
      {t.hoja ? <Lienzo t={t} s={s} escala={z.escala} fondo={fondo} /> : <div className="min-h-64" />}
    </div>
  );
}

function Lienzo({ t, s, escala, fondo }: { t: EstadoGtfMatricial; s: SeleccionTalonario; escala: number; fondo: FondoHoja }) {
  const hoja = t.hoja;
  if (!hoja) return null;
  const cat = CATALOGO[t.formato];
  const pagina = t.paginas[t.pagina] ?? { campos: {}, filas: [] };
  const tabla = hoja.tabla;
  const cols = cat.columnas.filter((c) => tabla.columnas[c.id]?.visible);
  const izq = Math.min(...cols.map((c) => tabla.columnas[c.id].x));
  const der = Math.max(...cols.map((c) => tabla.columnas[c.id].x + tabla.columnas[c.id].anchoMm));
  const letraTabla = ptAMm(tabla.letraPt) * escala;
  const ref = s.elegidos[0];
  const props = (k: string) => ({
    escala,
    seleccionado: s.elegidos.includes(k),
    referencia: ref === k,
    onPresionar: (e: React.PointerEvent) => s.presionarElemento(e, k, escala),
    onFocoTeclado: () => !s.elegidos.includes(k) && s.elegir(k),
    onFlecha: s.moverConFlechas,
  });

  return (
    <div
      role="application"
      aria-label={`Hoja de ${cat.nombre.toLowerCase()} del talonario, ${hoja.anchoMm} × ${hoja.altoMm} mm`}
      onPointerDown={(e) => s.presionarHoja(e, escala)}
      className="relative mx-auto select-none overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
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
          style={{ left: izq * escala, top: tabla.y * escala, width: (der - izq) * escala, height: tabla.altoFilaMm * tabla.maxFilas * escala }}
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
                fontFamily: MONO,
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
        const k = claveElemento({ tipo: "columna", id: c.id });
        return (
          <CampoTalonario
            key={k}
            etiqueta={c.label}
            texto={pagina.filas[0]?.[c.id] ?? ""}
            x={pos.x}
            y={tabla.y}
            anchoMm={pos.anchoMm}
            letraPt={tabla.letraPt}
            alinea={pos.alinea}
            unaLinea
            {...props(k)}
          />
        );
      })}

      {cat.campos.map((c) => {
        const pos = hoja.campos[c.id];
        if (!pos?.visible) return null;
        const k = claveElemento({ tipo: "campo", id: c.id });
        return (
          <CampoTalonario
            key={k}
            etiqueta={c.label}
            texto={pagina.campos[c.id] ?? ""}
            x={pos.x}
            y={pos.y}
            anchoMm={pos.anchoMm}
            letraPt={pos.letraPt}
            alinea={pos.alinea}
            {...props(k)}
          />
        );
      })}

      {s.guias?.x.map((x) => (
        <span key={`gx-${x}`} aria-hidden className="pointer-events-none absolute inset-y-0 z-30 w-px bg-[var(--accent)]" style={{ left: x * escala }} />
      ))}
      {s.guias?.y.map((y) => (
        <span key={`gy-${y}`} aria-hidden className="pointer-events-none absolute inset-x-0 z-30 h-px bg-[var(--accent)]" style={{ top: y * escala }} />
      ))}
      {s.recuadro && (
        <span
          aria-hidden
          className="pointer-events-none absolute z-30 rounded-[2px] border border-[var(--accent)] bg-[var(--accent-muted)]/40"
          style={{ left: s.recuadro.x * escala, top: s.recuadro.y * escala, width: s.recuadro.ancho * escala, height: s.recuadro.alto * escala }}
        />
      )}
    </div>
  );
}
