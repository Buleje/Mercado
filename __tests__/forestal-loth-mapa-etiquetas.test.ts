/**
 * Tests — dónde va la etiqueta de cada árbol en el mapa del Libro TH (29-09).
 *
 * Con los 65 árboles REALES del censo de Blas (UTM leída de la base, zona
 * 18 Sur), proyectados como los proyecta Leaflet (Web Mercator, 256 px por
 * tesela) en un mapa de 1200 × 560 px: ninguna etiqueta pisa a otra ni al
 * símbolo de otro árbol, el elegido siempre lleva la suya, y cuántas entran
 * en cada zoom (lo que decidió `ZOOM_ETIQUETAS`).
 */

import { describe, expect, it } from "vitest";
import { fromUtm } from "@/lib/forestal/loth-utm";
import {
  estiloDeLado,
  prioridadDeArbol,
  RADIO_SIMBOLO,
  rectDeLado,
  ubicarEtiquetas,
  type CajaEtiqueta,
  type LadoEtiqueta,
  type Rect,
} from "@/components/admin/forestal/loth-mapa-etiquetas";

/** Blas, plan del censo de 65 árboles: [código, E, N] tal como están en la base (29-09). */
const BLAS: [string, number, number][] = [
  ["100", 522155, 8918048], ["102", 522156, 8918084], ["103", 522147, 8918082], ["106", 522038, 8918135],
  ["107", 521964, 8918161], ["111", 521961, 8918254], ["112", 521938, 8918236], ["113", 521932, 8918232],
  ["114", 521929, 8918191], ["115", 521927, 8918180], ["116", 521947, 8918134], ["117", 521964, 8918033],
  ["118", 521865, 8918034], ["13", 522038, 8918023], ["14", 522058, 8918032], ["15", 522057, 8918032],
  ["17", 522023, 8918078], ["18", 522016, 8918079], ["19", 522045, 8918093], ["2", 521922, 8918151],
  ["20", 522065, 8918102], ["22", 522075, 8917975], ["25", 522144, 8918023], ["26", 522188, 8918003],
  ["27", 522189, 8918001], ["3", 521958, 8918120], ["31", 522187, 8917935], ["32", 522198, 8917943],
  ["33", 522163, 8917933], ["34", 522137, 8917914], ["35", 522130, 8917906], ["36", 522115, 8917915],
  ["39", 522214, 8917890], ["42", 522281, 8917867], ["46", 522329, 8917783], ["49", 522460, 8917859],
  ["5", 521982, 8918125], ["52", 522343, 8917933], ["53", 522599, 8917754], ["55", 522536, 8917745],
  ["56", 522556, 8917667], ["57", 522545, 8917677], ["59", 522581, 8917656], ["60", 522600, 8917653],
  ["64", 522569, 8917613], ["67", 522544, 8917577], ["70", 522555, 8917545], ["71", 522556, 8917541],
  ["72", 522653, 8917496], ["73", 522655, 8917486], ["74", 522707, 8917378], ["75", 522684, 8917341],
  ["76", 522734, 8917282], ["79", 522772, 8917274], ["8", 521937, 8918009], ["84", 522615, 8917683],
  ["85", 522632, 8917703], ["89", 522558, 8917825], ["9", 521940, 8918017], ["90", 522553, 8917826],
  ["92", 522448, 8917880], ["94", 522430, 8917892], ["95", 522411, 8917913], ["96", 522401, 8917977],
  ["99", 522158, 8918038],
];
const TALADOS = new Set(["100", "114"]);
const TROZADOS = new Set(["111", "113"]);

/** Web Mercator como Leaflet: píxel global en el zoom z. */
function mercator(lat: number, lng: number, z: number): [number, number] {
  const escala = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * escala, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * escala];
}

const VISTA = { ancho: 1200, alto: 560 };

/** Las cajas como las arma el mapa: centradas en el censo, con el ancho que mide una etiqueta de 12 px. */
function cajasEn(z: number, elegido: string | null = null): CajaEtiqueta[] {
  const pts = BLAS.map(([code, e, n]) => {
    const [lat, lng] = fromUtm(e, n, 18, true);
    return { code, p: mercator(lat, lng, z) };
  });
  const cx = (Math.min(...pts.map((q) => q.p[0])) + Math.max(...pts.map((q) => q.p[0]))) / 2;
  const cy = (Math.min(...pts.map((q) => q.p[1])) + Math.max(...pts.map((q) => q.p[1]))) / 2;
  return pts.map(({ code, p }) => {
    const etapa = TALADOS.has(code) ? "talado" : TROZADOS.has(code) ? "trozado" : "en_pie";
    const texto = `${code} · ${etapa === "trozado" ? "Trozado ×1" : etapa === "talado" ? "Talado" : "En pie"}`;
    return {
      id: code,
      x: p[0] - cx + VISTA.ancho / 2,
      y: p[1] - cy + VISTA.alto / 2,
      w: Math.round(texto.length * 6.6 + 16),
      h: 20,
      prioridad: prioridadDeArbol({ elegido: code === elegido, cercano: false, conAviso: false, etapa }),
      fija: code === elegido,
    };
  });
}

const tocan = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function puestas(cajas: CajaEtiqueta[], lados: Map<string, LadoEtiqueta>) {
  return cajas.flatMap((c) => {
    const lado = lados.get(c.id);
    return lado && lado !== "no" ? [{ c, rect: rectDeLado(lado, c) }] : [];
  });
}

describe("ubicarEtiquetas · los 65 árboles de Blas", () => {
  it.each([15, 16, 17, 18])("zoom %i: ninguna etiqueta pisa a otra ni al símbolo de otro árbol", (z) => {
    const cajas = cajasEn(z);
    const p = puestas(cajas, ubicarEtiquetas(cajas, VISTA));
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) expect(tocan(p[i].rect, p[j].rect), `${p[i].c.id} vs ${p[j].c.id}`).toBe(false);
      for (const otro of cajas) {
        if (otro.id === p[i].c.id) continue;
        const sim = { x: otro.x - RADIO_SIMBOLO, y: otro.y - RADIO_SIMBOLO, w: 2 * RADIO_SIMBOLO, h: 2 * RADIO_SIMBOLO };
        expect(tocan(p[i].rect, sim), `${p[i].c.id} tapa a ${otro.id}`).toBe(false);
      }
    }
  });

  it("cuántas entran: de lejos pocas, de cerca casi todas (lo que fijó el zoom 16)", () => {
    const visibles = (z: number) => cajasEn(z).filter((c) => c.x >= 0 && c.x <= VISTA.ancho && c.y >= 0 && c.y <= VISTA.alto);
    const medir = (z: number) => {
      const v = visibles(z);
      return `${puestas(v, ubicarEtiquetas(v, VISTA)).length}/${v.length}`;
    };
    // Medido 29-09 (etiqueta de 12 px, mapa de 1200 × 560): el área entera cabe
    // hasta el 16; en el 17 y el 18 se ve una parte y casi todas entran.
    expect({ 15: medir(15), 16: medir(16), 17: medir(17), 18: medir(18) }).toEqual({ 15: "18/65", 16: "27/65", 17: "35/48", 18: "20/21" });
  });

  it("los talados y trozados van antes que los en pie: en zoom 16 los cuatro llevan su etiqueta", () => {
    const cajas = cajasEn(16);
    const lados = ubicarEtiquetas(cajas, VISTA);
    for (const code of [...TALADOS, ...TROZADOS]) expect(lados.get(code), code).not.toBe("no");
  });

  it("el elegido lleva su etiqueta siempre, aunque esté en el montón (14 y 15 están a 1 m)", () => {
    const cajas = cajasEn(15, "15");
    expect(ubicarEtiquetas(cajas, VISTA).get("15")).not.toBe("no");
  });
});

describe("ubicarEtiquetas · bordes", () => {
  it("prueba otro lado antes que salirse del mapa", () => {
    const lados = ubicarEtiquetas([{ id: "a", x: 1190, y: 100, w: 80, h: 20, prioridad: 10 }], VISTA);
    expect(lados.get("a")).toBe("izq");
  });

  it("no se pone debajo de lo que tapa el mapa (la leyenda): prueba el otro lado", () => {
    const leyenda = { x: 1000, y: 380, w: 200, h: 180 };
    const lados = ubicarEtiquetas([{ id: "a", x: 960, y: 420, w: 80, h: 20, prioridad: 10 }], VISTA, { tapas: [leyenda] });
    expect(lados.get("a")).toBe("izq");
  });

  it("el elegido sin lado libre no queda bajo la leyenda: va al lado que menos tapa", () => {
    // Mapa de 400 × 200 con la leyenda abajo a la derecha. A la izquierda del
    // elegido hay tres árboles que bloquean esos lados; los de la derecha
    // chocan con la leyenda. Ninguno entra limpio: antes caía siempre a la
    // derecha, entera bajo la leyenda; ahora va a la izquierda (sólo pisa símbolos).
    const vista = { ancho: 400, alto: 200 };
    const leyenda = { x: 300, y: 60, w: 100, h: 140 };
    const vecinos = [100, 80, 120].map((y, i) => ({ id: `v${i}`, x: 250, y, w: 0, h: 0, prioridad: 5 }));
    const lados = ubicarEtiquetas([{ id: "a", x: 300, y: 100, w: 80, h: 20, prioridad: 0, fija: true }, ...vecinos], vista, { tapas: [leyenda] });
    expect(lados.get("a")).toBe("izq");
  });

  it("sin medir (w = 0) no se pone", () => {
    expect(ubicarEtiquetas([{ id: "a", x: 100, y: 100, w: 0, h: 0, prioridad: 10 }], VISTA).get("a")).toBe("no");
  });

  it("el estilo en línea pone la etiqueta del lado elegido, a 14 px del centro del símbolo", () => {
    expect(estiloDeLado("der", 26)).toBe("left:27px;top:50%;transform:translateY(-50%)");
    expect(estiloDeLado("izq", 26)).toContain("right:27px");
    expect(estiloDeLado("no", 26)).toContain("visibility:hidden");
  });
});
