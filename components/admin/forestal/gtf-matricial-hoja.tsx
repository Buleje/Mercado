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
 *
 * «Ver nombres» (prendido de entrada) pone el nombre corto de cada campo
 * encima de su valor, y el de cada columna encima de la primera fila: sólo
 * en pantalla, para no perderse (Brandon 15-10). El papel no lo lleva.
 *
 * «Formato impreso» (prendido de entrada, 16-10) dibuja debajo el talonario
 * de la imprenta con los datos de ESTA guía (`gtf-matricial-plantilla`): con
 * él, el contorno punteado y el nombre de cada campo sobran (el rótulo impreso
 * ya lo dice) y sólo aparecen al pasar el mouse o al elegirlo. Lo que no entra en su renglón sigue en amarillo, y
 * debajo de la hoja una línea dice cuántos son y cómo se arregla.
 */

import { useMemo } from "react";
import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import { claveElemento, INTERLINEA, ptAMm } from "@/lib/forestal/gtf-matricial-edicion";
import { nombreCorto } from "@/lib/forestal/gtf-matricial-nombres";
import { camposQueNoEntran, encabezadoDelTalonario, type NoEntra } from "@/lib/forestal/gtf-matricial-pantalla";
import { alineaCss } from "@/lib/forestal/gtf-matricial-print";
import type { EstadoGtfMatricial } from "./hooks/use-gtf-matricial";
import type { SeleccionTalonario } from "./hooks/use-gtf-matricial-seleccion";
import { AIRE_LIENZO, type ZoomTalonario } from "./hooks/use-gtf-matricial-zoom";
import CampoTalonario from "./gtf-matricial-campo";
import PlantillaTalonario from "./gtf-matricial-plantilla";
import AvisoNoEntran from "./gtf-matricial-no-entran";

export interface FondoHoja {
  src: string | null;
  opacidad: number;
  cuadricula: boolean;
  /** El talonario de la imprenta dibujado debajo de los valores (sólo pantalla). */
  impreso: boolean;
}

const MONO = '"Courier New", Courier, monospace';

export default function HojaTalonario({
  t, s, z, fondo, nombres,
}: { t: EstadoGtfMatricial; s: SeleccionTalonario; z: ZoomTalonario; fondo: FondoHoja; nombres: boolean }) {
  const { hoja, formato, paginas, pagina } = t;
  const noEntran = useMemo(
    () => (hoja ? camposQueNoEntran(hoja, CATALOGO[formato], paginas[pagina]) : []),
    [hoja, formato, paginas, pagina],
  );
  return (
    <>
    <div
      ref={z.caja}
      /* En escritorio llena el alto del bloque del medio; a 400 px, un alto fijo y los bloques debajo. */
      className="relative h-[min(62dvh,34rem)] min-w-0 overflow-auto overscroll-contain rounded-xl bg-[var(--surface-sunken)] lg:h-auto lg:min-h-0 lg:flex-1"
      style={{ padding: AIRE_LIENZO }}
    >
      {t.hoja ? <Lienzo t={t} s={s} escala={z.escala} fondo={fondo} nombres={nombres} noEntran={noEntran} /> : <div className="min-h-64" />}
    </div>
    <AvisoNoEntran lista={noEntran} onElegir={(claves) => claves.forEach((k, i) => s.elegir(k, i > 0))} />
    </>
  );
}

function Lienzo({
  t, s, escala, fondo, nombres, noEntran,
}: { t: EstadoGtfMatricial; s: SeleccionTalonario; escala: number; fondo: FondoHoja; nombres: boolean; noEntran: NoEntra[] }) {
  const hoja = t.hoja;
  const pagina = t.paginas[t.pagina] ?? { campos: {}, filas: [] };
  const titular = t.info?.titular?.nombre;
  const encabezado = useMemo(() => encabezadoDelTalonario(t.formato, t.entradas, t.paginas[t.pagina], titular), [t.formato, t.entradas, t.paginas, t.pagina, titular]);
  if (!hoja) return null;
  const cat = CATALOGO[t.formato];
  const amarillos = new Set(noEntran.map((n) => n.clave));
  const impreso = fondo.impreso;
  const tabla = hoja.tabla;
  const cols = cat.columnas.filter((c) => tabla.columnas[c.id]?.visible);
  const izq = Math.min(...cols.map((c) => tabla.columnas[c.id].x));
  const der = Math.max(...cols.map((c) => tabla.columnas[c.id].x + tabla.columnas[c.id].anchoMm));
  const letraTabla = ptAMm(tabla.letraPt) * escala;
  const ref = s.elegidos[0];
  const props = (k: string, tipo: "campo" | "columna", id: string) => ({
    nombre: nombres ? nombreCorto(t.formato, tipo, id) : null,
    escala,
    seleccionado: s.elegidos.includes(k),
    referencia: ref === k,
    noEntra: amarillos.has(k),
    discreto: impreso,
    onPresionar: (e: React.PointerEvent) => s.presionarElemento(e, k, escala),
    onFocoTeclado: () => !s.elegidos.includes(k) && s.elegir(k),
    onFlecha: s.moverConFlechas,
  });

  return (
    <div
      role="application"
      aria-label={`Hoja de ${cat.nombre.toLowerCase()} del talonario, ${hoja.anchoMm} × ${hoja.altoMm} mm`}
      onPointerDown={(e) => s.presionarHoja(e, escala)}
      className={`relative mx-auto select-none overflow-hidden border border-[var(--rule-base)] shadow-[var(--shadow-sm)] ${impreso ? "bg-[var(--gtf-papel)]" : "bg-[var(--surface-raised)]"}`}
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

      {impreso && <PlantillaTalonario formato={t.formato} encabezado={encabezado} anchoMm={hoja.anchoMm} altoMm={hoja.altoMm} />}

      {/* Hasta dónde llegan las filas: con el formato dibujado ya se ve la tabla, sólo cuando se acomoda una columna. */}
      {cols.length > 0 && (!impreso || cols.some((c) => s.elegidos.includes(claveElemento({ tipo: "columna", id: c.id })))) && (
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
            {...props(k, "columna", c.id)}
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
            {...props(k, "campo", c.id)}
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
