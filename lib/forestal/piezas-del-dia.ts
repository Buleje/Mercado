/**
 * Lo que salió un día —o varios— PAQUETE POR PAQUETE, y de ahí al cubicado y
 * al Anexo 04.
 *
 * Pedido de Brandon (2026-09-23): *«cuando se presiona "Ver qué salió ese día"
 * que se ponga un modal donde estarán los detalles del día pieza por pieza
 * según lo cubicado, para modificar/editar […] lo de traer cubicado es traerlo
 * en todo (no especie por especie), en general de todo ese día»* y *«cuando se
 * selecciona según el check los días quiero que aparezca opción de Anexo 4 y
 * se hará ese anexo según lo seleccionado, se combinará»*.
 *
 * Un paquete del libro ES una línea de lo cubicado: una escuadría con sus
 * piezas (medido en Blas: 91 paquetes el 22/09, uno por medida). Por eso «pieza
 * por pieza» es la lista de paquetes con su escuadría vuelta a pulgadas y pies,
 * que es como se cantó en la sierra.
 *
 * Reglas:
 *  · la escuadría vuelve con `acercarAEscala` (la misma de la escuadría del
 *    paquete y de «traer al cubicado»): el libro guarda cm y m con 2 decimales
 *    y 8 pies volvían como 8.01;
 *  · un paquete SIN escuadría no viaja ni al cubicado ni al anexo: una fila
 *    0×0×0 no se edita a nada y un anexo con medidas inventadas es una
 *    declaración jurada falsa. Se cuenta y se dice;
 *  · el tipo es el que el LIBRO declaró (su producto), no el que la medida
 *    sugiere: si al declarar se forzó «Comercial» sobre una medida de tabla,
 *    el anexo y el cubicado tienen que seguir diciendo «Comercial»;
 *  · el dueño viaja con las piezas (de tercero → su nombre y su ficha): traída
 *    de vuelta, «Declarar» la vuelve a separar por dueño.
 *
 * PURO y client-safe: lo arma el servidor (`ForestCtpDB.jornadasConPaquetes`)
 * y lo usan el modal del día y la barra de días marcados.
 */

import { cubicarPieza, ptDesdeM3, type PiezaCubicada } from "./cubicacion";
import { acercarAEscala } from "./escala-de-medida";
import { CM_POR_PULGADA, M_POR_PIE } from "./escuadria-del-paquete";
import { clasificarTipo, ORDEN_TIPO, type TipoComercial } from "./cubicacion-tipo";
import { tipoComercialDelProducto } from "./loctp-catalogos";
import { clasificacionCorta, piezasDeLaCorrida } from "./detalle-de-jornada";
import type { HojaExcel } from "@/lib/export-excel";

/** Un paquete del libro, con todo lo que hace falta para mirarlo y editarlo. */
export interface PaqueteDelDia {
  id: string;
  codigo: string;
  producto: string | null;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  /** PT medido al cubicar (ADR-429); `null` = paquete viejo, sale del m³. */
  pieTablar: number | null;
}

/** Una corrida del día con sus paquetes y lo que pide el editor (ADR-401). */
export interface CorridaDelDia {
  id: string;
  lineNo: number;
  /** `YYYY-MM-DD`. */
  dia: string;
  /** `entryDate` en ISO, como lo muestra el editor. */
  fecha: string;
  especie: string | null;
  especieCientifica: string | null;
  producto: string | null;
  presentacion: string | null;
  unidad: string | null;
  /** `quantity` del asiento, tal cual. */
  cantidad: number | null;
  /** Volumen declarado en m³ (0 si el asiento está en otra unidad) — el del resumen. */
  m3: number;
  /** `pieces` del asiento. */
  piezasAsiento: number;
  volumenConsumidoM3: number | null;
  observaciones: string | null;
  materiaPrimaRef: string | null;
  /** La etiqueta del resumen (`etiquetaDeDueno` o `SIN_DUENO`): con ella se filtra. */
  dueno: string;
  duenoMadera: string | null;
  titularNombre: string | null;
  duenoParteId: string | null;
  /** Guías de la madera que consumió (o `gtfIngreso` si se cargó a mano). */
  gtfOrigen: string[];
  /** Permisos heredados de esas guías; si no hay, el declarado en el asiento. */
  permisos: string[];
  /** Por qué sus campos del registro no se corrigen (la misma regla del servidor). */
  atadaPorque: string | null;
  paquetes: PaqueteDelDia[];
}

/** La escuadría como se canta en la sierra: pulgadas × pulgadas × pies. */
export interface EscuadriaEnPulgadas {
  espesor: number;
  ancho: number;
  largo: number;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * La escuadría del paquete en pulgadas y pies, o `null` si le falta una de las
 * tres (o alguna es 0): sin las tres no hay pieza que medir.
 */
export function escuadriaEnPulgadas(
  p: Pick<PaqueteDelDia, "espesorCm" | "anchoCm" | "largoM">,
): EscuadriaEnPulgadas | null {
  const cm = (v: number | null) => (v != null && v > 0 ? v : 0);
  /* Las escuadrías se cortan en cuartos de pulgada y los largos en medios
     pies: ésa es la grilla a la que se vuelve (ver `acercarAEscala`). */
  const espesor = acercarAEscala(cm(p.espesorCm) / CM_POR_PULGADA, 0.25, 0.02);
  const ancho = acercarAEscala(cm(p.anchoCm) / CM_POR_PULGADA, 0.25, 0.02);
  const largo = acercarAEscala(cm(p.largoM) / M_POR_PIE, 0.5, 0.05);
  return espesor > 0 && ancho > 0 && largo > 0 ? { espesor, ancho, largo } : null;
}

/** «2 × 8 × 10» — pulgadas por pulgadas por pies, como en la planilla. */
export const fmtEscuadriaPulgadas = (e: EscuadriaEnPulgadas): string =>
  `${e.espesor} × ${e.ancho} × ${e.largo}`;

const esTipoComercial = (t: string | null): t is TipoComercial =>
  t != null && (ORDEN_TIPO as readonly string[]).includes(t);

const medidaEnPulgadas = (e: EscuadriaEnPulgadas) => ({
  ...e,
  uEspesor: "pulg" as const,
  uAncho: "pulg" as const,
  uLargo: "pies" as const,
});

/**
 * El tipo del paquete: el que declaró el libro (su producto) y, si el producto
 * no dice cuál es («MADERA ASERRADA» a secas), el que sale de la medida.
 */
export function tipoDelPaquete(p: Pick<PaqueteDelDia, "producto" | "espesorCm" | "anchoCm" | "largoM">): string {
  const declarado = tipoComercialDelProducto(p.producto);
  if (declarado) return declarado;
  const e = escuadriaEnPulgadas(p);
  if (e) return clasificarTipo(medidaEnPulgadas(e));
  return p.producto ? clasificacionCorta(p.producto) : "—";
}

/** El PT del paquete: el medido; si no hay (paquete viejo), el del m³ — como `ptDelPaquete`. */
export const ptDelPaqueteDelDia = (p: Pick<PaqueteDelDia, "pieTablar" | "volumenM3">): number =>
  p.pieTablar != null ? p.pieTablar : ptDesdeM3(p.volumenM3);

/** Una fila de la tabla «pieza por pieza». */
export interface FilaDePieza {
  paqueteId: string;
  corridaId: string;
  lineNo: number;
  dia: string;
  especie: string | null;
  tipo: string;
  codigo: string;
  escuadria: EscuadriaEnPulgadas | null;
  cantidad: number;
  m3: number;
  pt: number;
  dueno: string;
}

/** Los paquetes de las corridas, en el orden del libro (día, N°, como se declararon). */
export function filasPiezaPorPieza(corridas: readonly CorridaDelDia[]): FilaDePieza[] {
  return [...corridas]
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.lineNo - b.lineNo))
    .flatMap((c) =>
      c.paquetes.map((p) => ({
        paqueteId: p.id,
        corridaId: c.id,
        lineNo: c.lineNo,
        dia: c.dia,
        especie: c.especie,
        tipo: tipoDelPaquete(p),
        codigo: p.codigo,
        escuadria: escuadriaEnPulgadas(p),
        cantidad: p.cantidad,
        m3: p.volumenM3,
        pt: ptDelPaqueteDelDia(p),
        dueno: c.dueno,
      })),
    );
}

/** Lo que el asiento declara y sus paquetes NO detallan (L1: Σ paquetes ≤ quantity). */
export function m3SinPaquete(c: Pick<CorridaDelDia, "m3" | "paquetes">): number {
  const resto = c.m3 - c.paquetes.reduce((a, p) => a + p.volumenM3, 0);
  /* Un litro: la tolerancia del aserradero, no la del punto flotante. */
  return resto > 0.001 ? r4(resto) : 0;
}

/** Las cifras de una corrida en la tabla: la cabecera de su grupo. */
export interface CifrasDeCorrida {
  paquetes: number;
  piezas: number;
  m3: number;
  pt: number;
  /** m³ del asiento que ningún paquete detalla (su propio renglón). */
  sinPaqueteM3: number;
}

/**
 * Lo que dice la cabecera de una corrida: la suma de sus renglones. Las piezas
 * son las de sus paquetes (las del asiento sólo si no tiene paquetes, como el
 * casillero) y el m³ es el de los paquetes MÁS lo no detallado — así la
 * corrida cierra con el día de arriba.
 */
export function cifrasDeLaCorrida(c: CorridaDelDia): CifrasDeCorrida {
  const sinPaqueteM3 = m3SinPaquete(c);
  return {
    paquetes: c.paquetes.length,
    piezas: piezasDeLaCorrida(c.paquetes, c.piezasAsiento),
    m3: r4(c.paquetes.reduce((a, p) => a + p.volumenM3, 0) + sinPaqueteM3),
    pt: c.paquetes.reduce((a, p) => a + ptDelPaqueteDelDia(p), 0) + (sinPaqueteM3 > 0 ? ptDesdeM3(sinPaqueteM3) : 0),
    sinPaqueteM3,
  };
}

/** La fila de total de la tabla: la suma de las corridas. */
export function totalesDeLasCorridas(corridas: readonly CorridaDelDia[]): CifrasDeCorrida & { corridas: number } {
  return corridas.reduce(
    (t, c) => {
      const x = cifrasDeLaCorrida(c);
      return {
        corridas: t.corridas + 1,
        paquetes: t.paquetes + x.paquetes,
        piezas: t.piezas + x.piezas,
        m3: r4(t.m3 + x.m3),
        pt: t.pt + x.pt,
        sinPaqueteM3: r4(t.sinPaqueteM3 + x.sinPaqueteM3),
      };
    },
    { corridas: 0, paquetes: 0, piezas: 0, m3: 0, pt: 0, sinPaqueteM3: 0 },
  );
}

/** Lo que no pudo viajar porque el paquete no tiene escuadría. */
export interface SinEscuadria {
  paquetes: number;
  piezas: number;
  m3: number;
  codigos: string[];
}

export interface PiezasDeLasCorridas {
  piezas: PiezaCubicada[];
  sinEscuadria: SinEscuadria;
}

/**
 * De las corridas a filas del cubicador —o del Anexo 04—, TODAS juntas.
 *
 * Cada pieza trae su PT y su m³ ya cubicados (el anexo los suma; el cubicador
 * los vuelve a calcular al entrar, con la misma fórmula). El id es el del
 * paquete: dos paquetes de la misma medida son dos filas, como en el libro.
 */
export function piezasDeLasCorridas(corridas: readonly CorridaDelDia[]): PiezasDeLasCorridas {
  const piezas: PiezaCubicada[] = [];
  const sinEscuadria: SinEscuadria = { paquetes: 0, piezas: 0, m3: 0, codigos: [] };
  for (const c of [...corridas].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.lineNo - b.lineNo))) {
    const deTercero = c.duenoMadera === "tercero" && (c.titularNombre ?? "").trim() !== "";
    for (const p of c.paquetes) {
      const e = escuadriaEnPulgadas(p);
      const cantidad = Math.max(0, Math.round(p.cantidad));
      if (!e || cantidad <= 0) {
        sinEscuadria.paquetes += 1;
        sinEscuadria.piezas += cantidad;
        sinEscuadria.m3 = r4(sinEscuadria.m3 + p.volumenM3);
        sinEscuadria.codigos.push(p.codigo);
        continue;
      }
      const medida = medidaEnPulgadas(e);
      /* El tipo forzado viaja SÓLO si difiere del de la medida: si coinciden,
         dejarlo sin forzar es lo mismo y la fila sigue la regla si se edita. */
      const declarado = tipoComercialDelProducto(p.producto);
      const tipo = esTipoComercial(declarado) && declarado !== clasificarTipo(medida) ? declarado : undefined;
      piezas.push({
        id: `paq-${p.id}`,
        cantidad,
        ...medida,
        especie: (c.especie ?? "").trim() || undefined,
        ...(deTercero ? { dueno: (c.titularNombre ?? "").trim() } : {}),
        ...(deTercero && c.duenoParteId ? { duenoParteId: c.duenoParteId } : {}),
        ...(tipo ? { tipo } : {}),
        ...cubicarPieza({ cantidad, ...medida }),
      });
    }
  }
  return { piezas, sinEscuadria };
}

/**
 * «3 paquetes (5,154 m³ · 336 piezas) no tienen escuadría y no entran» — la
 * frase del aviso. `adonde` dice a qué no entran y `como` dónde se carga.
 */
export function avisoSinEscuadria(
  s: SinEscuadria,
  fmtM3: (v: number) => string,
  { adonde, como }: { adonde: string; como: string },
): string | null {
  if (s.paquetes === 0) return null;
  const uno = s.paquetes === 1;
  const piezas = s.piezas > 0 ? ` · ${s.piezas} pieza${s.piezas === 1 ? "" : "s"}` : "";
  return `${uno ? "1 paquete" : `${s.paquetes} paquetes`} (${fmtM3(s.m3)} m³${piezas}) no ${
    uno ? "tiene" : "tienen"
  } escuadría y no ${uno ? "entra" : "entran"} ${adonde}: ${como}.`;
}

/**
 * La hoja «Pieza por pieza» del Excel del día: una fila por paquete con el día,
 * la corrida, la especie y el dueño escritos en CADA fila (se filtra y se arma
 * una dinámica sin rellenar huecos) y las medidas como números.
 */
export function hojaPiezaPorPieza(filas: readonly FilaDePieza[]): HojaExcel {
  return {
    nombre: "Pieza por pieza",
    filas: filas.map((f) => ({
      Fecha: f.dia,
      "N° corrida": f.lineNo,
      Especie: f.especie ?? "",
      Dueño: f.dueno,
      Código: f.codigo,
      Tipo: f.tipo,
      "Espesor (pulg)": f.escuadria?.espesor ?? "",
      "Ancho (pulg)": f.escuadria?.ancho ?? "",
      "Largo (pies)": f.escuadria?.largo ?? "",
      Piezas: f.cantidad,
      "m³": f.m3,
      PT: Math.round(f.pt * 100) / 100,
    })),
  };
}
