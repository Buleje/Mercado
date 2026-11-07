import { describe, expect, it } from "vitest";
import {
  RUTAS_PLANO_V9,
  contenidoPorZona,
  flujoAplica,
  puntaDeTramo,
  resumirZonaCroquis,
  rotuloDeTramo,
  rutasDelPlano,
} from "@/lib/forestal/planta-croquis";
import { documentoHtml, medidasHoja, orientacionDeHtml } from "@/lib/forestal/ctp-documento-print";
import { croquisDocumento, fechaImpresion, textoContenido } from "@/lib/forestal/planta-croquis-print";
import type { Item, PlantaCroquis, PlantaZona } from "@/lib/forestal/planta-zona-types";

const V9: PlantaCroquis = { version: 9, anchoM: 54, altoM: 48, imagenUrl: null, maquinas: [
  { codigo: "D1", nombre: "Cargador frontal", x: 18.95, y: 28.75, fuera: false },
  { codigo: "D3", nombre: "Forestal automático", x: 13.15, y: 33.2, fuera: true },
], actualizadoEn: "2026-10-03T00:00:00.000Z" };

describe("rutas del plano v9", () => {
  it("cuatro rutas con los números de la lámina", () => {
    expect(RUTAS_PLANO_V9.map((r) => [r.id, r.numero])).toEqual([["principal", "1–4"], ["cantear", "A"], ["despuntar", "B"], ["salida", "5"]]);
    expect(RUTAS_PLANO_V9.map((r) => r.tramos.map((t) => t.n).join(","))).toEqual(["1,2,3,4", "A1,A2,A3", "B", "5,5,5,5"]);
  });
  it("colores por token del DS (sin hex) y solo la salida punteada", () => {
    for (const r of RUTAS_PLANO_V9) expect(r.color).toMatch(/^var\(--[a-z0-9-]+\)$/);
    expect(RUTAS_PLANO_V9.filter((r) => r.punteada).map((r) => r.id)).toEqual(["salida"]);
  });
  it("todo tramo cae dentro del terreno de 54 × 48 m y tiene al menos un segmento", () => {
    for (const r of RUTAS_PLANO_V9) for (const t of r.tramos) {
      expect(t.puntos.length).toBeGreaterThanOrEqual(2);
      for (const [y, x] of t.puntos) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(54);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(48);
      }
    }
  });
  it("la ruta 1 sale del patio de trozas (x < 10) y llega al acopio 14 (x 29,5–39,4; y 13,2–17,1)", () => {
    const t1 = RUTAS_PLANO_V9[0].tramos[0];
    expect(t1.puntos[0][1]).toBeLessThan(10);
    const [y, x] = t1.puntos[t1.puntos.length - 1];
    expect(x).toBeGreaterThan(29.5); expect(x).toBeLessThan(39.4);
    expect(y).toBeGreaterThan(13.2); expect(y).toBeLessThan(17.5);
  });
});

describe("rutasDelPlano / flujoAplica", () => {
  it("solo sobre la v9 de 54 × 48 (± 1 m)", () => {
    expect(rutasDelPlano(V9)).toBe(RUTAS_PLANO_V9);
    expect(rutasDelPlano({ anchoM: 54.8, altoM: 47.2, version: 9 })).toBe(RUTAS_PLANO_V9);
    expect(rutasDelPlano({ anchoM: 54, altoM: 48, version: 8 })).toBeNull();
    expect(rutasDelPlano({ anchoM: 60, altoM: 48, version: 9 })).toBeNull();
    expect(rutasDelPlano(null)).toBeNull();
    expect(flujoAplica(V9)).toBe(true);
  });
});

describe("número y punta de cada tramo", () => {
  const b = RUTAS_PLANO_V9[2].tramos[0];
  it("el número va donde lo pinta la lámina; null = sin número", () => {
    expect(rotuloDeTramo(b)).toEqual([7.95, 17.99]);
    expect(rotuloDeTramo(RUTAS_PLANO_V9[3].tramos[0])).toBeNull();
  });
  it("sin rótulo propio, a la mitad del segmento más largo", () => {
    expect(rotuloDeTramo({ n: "X", texto: "", puntos: [[0, 0], [0, 10], [2, 10]] })).toEqual([0, 5]);
  });
  it("la punta apunta al último punto del último segmento", () => {
    expect(puntaDeTramo(b)[0]).toEqual([6.8, 14.9]);
  });
});

describe("hoja apaisada del armazón de documentos", () => {
  it("apaisada declara @page landscape y data-hoja; la vertical sigue igual", () => {
    const ap = documentoHtml({ titulo: "x", cuerpo: "<p>y</p>", orientacion: "apaisada" });
    expect(ap).toContain('<html lang="es" data-hoja="apaisada">');
    expect(ap).toContain("@page{size:A4 landscape;");
    expect(orientacionDeHtml(ap)).toBe("apaisada");
    const ve = documentoHtml({ titulo: "x", cuerpo: "<p>y</p>" });
    expect(ve).toContain("@page{size:A4;");
    expect(orientacionDeHtml(ve)).toBe("vertical");
  });
  it("medidas A4: 297 × 210 acostada, 190 mm útiles de alto", () => {
    expect(medidasHoja("apaisada")).toEqual({ anchoMm: 297, altoMm: 210, utilMm: 190 });
    expect(medidasHoja()).toEqual({ anchoMm: 210, altoMm: 297, utilMm: 277 });
  });
});

describe("croquisDocumento — la hoja del croquis", () => {
  const zona: PlantaZona = { id: "z14", codigo: "PT-14", nombre: "Acopio <coche>", tipo: "patio_trozas", plano: "croquis", poligono: JSON.stringify([[13.2, 29.5], [13.2, 39.4], [17.1, 39.4], [17.1, 29.5]]) } as PlantaZona;
  const pila = { id: "g1", kind: "troza", label: "GTF 001", cantidad: 6, unidad: "m³", cites: false, piezas: 3, trozas: [] } as unknown as Item;
  const contenido = contenidoPorZona([pila], { g1: { zonaId: "z14", lat: 15, lng: 34 } }, new Set(["z14"]));
  const base = { zonas: [zona], contenido, imagen: "data:image/png;base64,AAAA", empresa: { nombre: "Inversiones Agroforestales Blas S.A.C.", meta: ["CTP 145-2023"] }, fecha: new Date(2026, 9, 3) };

  it("trae plano, zonas con lo que tienen, pilas, máquinas, rutas y pie con empresa, fecha y versión", () => {
    const d = croquisDocumento({ ...base, croquis: V9 });
    expect(d.nombre).toBe("Croquis de la planta v9");
    expect(d.html).toContain('data-hoja="apaisada"');
    expect(d.html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(d.html).toContain("PT-14");
    expect(d.html).toContain("Acopio &lt;coche&gt;");
    expect(d.html).toContain("6 m³ · 3 pzas");
    expect(d.html).toContain("<circle"); // la pila
    expect(d.html).toContain("Ruta principal");
    expect(d.html).toContain("Comercial solo despuntar");
    expect(d.html).toContain("D3</b> Forestal automático (fuera de la planta)");
    expect(d.html).toContain("Versión 9");
    expect(d.html).toContain("Impreso el sábado 03/10/2026");
    expect(d.html).toContain("Inversiones Agroforestales Blas S.A.C. · Croquis de la planta · versión 9");
  });
  it("sobre otra versión del plano no dibuja ni lista rutas", () => {
    const d = croquisDocumento({ ...base, croquis: { ...V9, version: 8 } });
    expect(d.html).not.toContain("Rutas de producción");
    expect(d.html).not.toContain("<polyline");
  });
  it("lo que tiene una zona, en PT → m³ → piezas", () => {
    expect(textoContenido(resumirZonaCroquis(contenido.z14))).toBe("6 m³ · 3 pzas");
    expect(textoContenido(resumirZonaCroquis(undefined))).toBe("");
    expect(fechaImpresion(new Date(2026, 8, 10))).toBe("jueves 10/09/2026");
  });
});
