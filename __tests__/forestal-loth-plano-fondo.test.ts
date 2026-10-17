/**
 * loth-plano-fondo + loth-plano-ventana — el plano impreso del Libro TH sale
 * con la imagen RECIENTE (Sentinel-2 de la fecha del mapa) y su FECHA; si no
 * carga, con la foto de Esri y la suya. Escenas y fecha de Esri de las
 * respuestas REALES guardadas el 29-09 sobre Blas; topes de resolución medidos
 * ese día contra cada servicio (ver comentarios del módulo).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/loth-imagenes-blas-2026-09-29.json";
import { agruparPorFecha, parseMetadatosEsri, parseRespuestaStac, type EscenaS2 } from "@/lib/forestal/loth-imagenes";
import {
  armarFondoPlano,
  elegirFondoPlano,
  elegirFondoVista,
  fondoDeLaImagen,
  GRADOS_POR_PX_ESRI_Z17,
  pixelesDelFondo,
  textoDelFondo,
  type FondoImagen,
  type Recuadro,
} from "@/lib/forestal/loth-plano-fondo";
import { ESPERA_POR_IMAGEN_MS, vigilarLamina } from "@/lib/forestal/loth-plano-ventana";

const escenas = agruparPorFecha(parseRespuestaStac(fixture.stac) ?? []);
const esri = parseMetadatosEsri(fixture.esri);
const del = (fecha: string): EscenaS2 => {
  const e = escenas.find((x) => x.fecha === fecha);
  if (!e) throw new Error(`sin escena ${fecha} en el fixture`);
  return e;
};
const ASPECTO = 780 / 1180;
/** El marco mínimo del plano (~1,3 km de alto) sobre Blas, ya corregido de aspecto. */
const CHICO: Recuadro = { lngMin: -74.8092, lngMax: -74.7908, latMin: -9.796, latMax: -9.784 };
/** El recuadro con el que se midió el tope de Esri: 2 800 px → 200, 2 900 → 500. */
const MEDIDO: Recuadro = { lngMin: -74.815, lngMax: -74.785, latMin: -9.8, latMax: -9.78 };
/** Un plano grande (el censo de Blas cae a 31 km del área). */
const GRANDE: Recuadro = { lngMin: -75.0, lngMax: -74.6, latMin: -9.9, latMax: -9.64 };

describe("qué imagen va de fondo", () => {
  it("fixture real: la escena del 23-09 existe y la foto de Esri es del 18-06-2022", () => {
    expect(del("2026-09-23").items.length).toBeGreaterThan(0);
    expect(esri?.fecha).toBe("2022-06-18");
  });

  it("plano con Sentinel-2 en pantalla: sale la fecha elegida, con Esri de respaldo", () => {
    const f = elegirFondoPlano({ base: "s2", escena: del("2026-09-23"), esri });
    expect(f).toMatchObject({ tipo: "s2", fecha: "2026-09-23", respaldo: { tipo: "esri", fecha: "2022-06-18" } });
  });

  it("plano con la foto de Esri en pantalla: igual sale la reciente (la escena del mapa), no la de 2022", () => {
    expect(elegirFondoPlano({ base: "sat", escena: del("2026-09-23"), esri }).tipo).toBe("s2");
  });

  it("sin escenas (Sentinel-2 caído): la foto de Esri CON su fecha; si Esri tampoco la dijo, null explícito", () => {
    expect(elegirFondoPlano({ base: "s2", escena: null, esri })).toEqual({ tipo: "esri", fecha: "2022-06-18" });
    expect(elegirFondoPlano({ base: "sat", escena: { fecha: "2026-09-23", items: [] }, esri: null })).toEqual({ tipo: "esri", fecha: null });
  });

  it("mapa topográfico o de calles: el mapa, con la foto de Esri de respaldo", () => {
    expect(elegirFondoPlano({ base: "topo", escena: del("2026-09-23"), esri })).toEqual({ tipo: "mapa", base: "topo", respaldo: { tipo: "esri", fecha: "2022-06-18" } });
    expect(elegirFondoPlano({ base: "street", escena: null, esri: null })).toMatchObject({ tipo: "mapa", base: "calles" });
  });

  it("el PNG «lo que ves» respeta la base de la pantalla: con la foto de Esri, la foto de Esri", () => {
    expect(elegirFondoVista({ base: "sat", escena: del("2026-09-23"), esri })).toEqual({ tipo: "esri", fecha: "2022-06-18" });
    expect(elegirFondoVista({ base: "s2", escena: del("2026-09-23"), esri }).tipo).toBe("s2");
  });
});

describe("fuente y fecha impresas", () => {
  it("Sentinel-2: fecha larga a la peruana en el cajetín y el pie, corta en la escala, Copernicus con el año", () => {
    const t = textoDelFondo(elegirFondoPlano({ base: "s2", escena: del("2026-09-23"), esri }));
    expect(t.celda).toBe("Sentinel-2 · 23 de setiembre de 2026");
    expect(t.nota).toBe("Imagen satelital: Sentinel-2 del 23 de setiembre de 2026 · Contiene datos Copernicus Sentinel modificados (2026) · Microsoft Planetary Computer");
    expect(t.corto).toBe("Sentinel-2 del 23 set 2026");
  });

  it("Esri: su fecha y la fuente que Esri publica hoy (Vantor, no Maxar)", () => {
    const t = textoDelFondo({ tipo: "esri", fecha: "2022-06-18" });
    expect(t.nota).toBe("Imagen satelital: Esri World Imagery del 18 de junio de 2022 · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community");
    expect(t.celda).toBe("Esri World Imagery · 18 de junio de 2022");
    expect(JSON.stringify(t)).not.toMatch(/Maxar/);
  });

  it("nunca muda: sin fecha de Esri, el papel dice que no la informó", () => {
    const t = textoDelFondo({ tipo: "esri", fecha: null });
    expect(t.celda).toMatch(/fecha no informada/);
    expect(t.nota).toMatch(/fecha no informada por Esri/);
  });

  it("el mapa topográfico se nombra como mapa (no como foto) con el texto de Esri", () => {
    const t = textoDelFondo({ tipo: "mapa", base: "topo", respaldo: { tipo: "esri", fecha: null } });
    expect(t.celda).toBe("Mapa topográfico de Esri");
    expect(t.corto).toBe("mapa topográfico de Esri");
    expect(t.nota).toMatch(/^Mapa base: Esri World Topographic Map · Sources: Esri, HERE, Garmin/);
  });
});

describe("resolución de impresión (A3: 36,8 cm de mapa, medidos en el PDF)", () => {
  it("Sentinel-2: 300 ppp serían 4 346 px; el tope lo deja en 4 096 × 2 708, el aspecto del marco", () => {
    expect(pixelesDelFondo("s2", GRANDE, ASPECTO)).toEqual({ ancho: 4096, alto: 2708 });
    expect(pixelesDelFondo("s2", CHICO, ASPECTO)).toEqual({ ancho: 4096, alto: 2708 });
    // En A4 (24,6 cm de mapa) alcanza con menos.
    expect(pixelesDelFondo("s2", GRANDE, ASPECTO, 24.6).ancho).toBe(2906);
  });

  it("foto de Esri: nunca más fina que su nivel 17 (medido: 0,03° a 2 800 px → 200, a 2 900 → 500)", () => {
    const medido = pixelesDelFondo("esri-foto", MEDIDO, 0.02 / 0.03);
    expect(medido.ancho).toBeLessThanOrEqual(2800);
    expect(medido.ancho).toBeGreaterThan(2500);
    // Chico: 0,0184° → a lo sumo 1 715 px en nivel 17 (1 700 → 200, 1 800 → 500).
    const chico = pixelesDelFondo("esri-foto", CHICO, ASPECTO);
    expect(chico.ancho).toBeLessThan((CHICO.lngMax - CHICO.lngMin) / GRADOS_POR_PX_ESRI_Z17);
    expect(chico.ancho).toBeGreaterThan(1180);
    // Grande: el nivel 17 no limita; manda el tope declarado del export (4 096).
    expect(pixelesDelFondo("esri-foto", GRANDE, ASPECTO).ancho).toBe(4096);
  });

  it("mapa topográfico: tope 2 400 (a 3 012 tardaba 18 s)", () => {
    expect(pixelesDelFondo("esri-mapa", GRANDE, ASPECTO).ancho).toBe(2400);
  });

  it("un marco alto no pasa el tope por el lado largo", () => {
    const px = pixelesDelFondo("s2", GRANDE, 2);
    expect(px.alto).toBeLessThanOrEqual(4096);
  });
});

describe("las imágenes de la lámina", () => {
  const sobreBlas: Recuadro = { lngMin: -74.82, lngMax: -74.78, latMin: -9.81, latMax: -9.78 };

  it("Sentinel-2 que cubre todo el marco: un jpg suavizado a 4 096 px; respaldo Esri con fecha y al final el tamaño que nunca falló", () => {
    const f = elegirFondoPlano({ base: "s2", escena: del("2026-09-23"), esri });
    const a = armarFondoPlano(f, sobreBlas, ASPECTO);
    expect(a.extras).toEqual([]);
    expect(a.principal.src).toMatch(/\/item\/bbox\/-74\.82,-9\.81,-74\.78,-9\.78\/4096x2708\.jpg\?/);
    expect(a.principal.src).toContain("reproject=bilinear");
    expect(a.principal.src).toContain("S2A_MSIL2A_20260923");
    expect(a.principal.celda).toBe("Sentinel-2 · 23 de setiembre de 2026");
    expect(a.respaldos.every((r) => r.src.includes("World_Imagery") && r.celda.includes("18 de junio de 2022"))).toBe(true);
    expect(a.respaldos.at(-1)?.src).toContain("size=1180,780");
  });

  it("recuadro mínimo del plano (0,012°): el respaldo de Esri no pasa su nivel 17 (1 180 px daba HTTP 500)", () => {
    const minimo: Recuadro = { lngMin: -75, lngMax: -74.988, latMin: -9, latMax: -8.9921 };
    const a = armarFondoPlano({ tipo: "esri", fecha: "2022-06-18" }, minimo, ASPECTO);
    const todas = [a.principal, ...a.respaldos];
    for (const c of todas) {
      const ancho = Number(/size=(\d+),/.exec(c.src)?.[1]);
      expect(ancho * GRADOS_POR_PX_ESRI_Z17).toBeLessThanOrEqual(0.012);
    }
  });

  it("el área en el borde de dos cuadros de la misma pasada: png transparente y el vecino debajo", () => {
    const dos: FondoImagen = {
      tipo: "s2",
      fecha: "2026-09-23",
      items: [
        { id: "T18LWQ", bbox: [-75, -10.04, -74.0, -9.04] },
        { id: "T18LXQ", bbox: [-74.02, -10.04, -73, -9.04] },
      ],
      respaldo: { tipo: "esri", fecha: "2022-06-18" },
    };
    const a = armarFondoPlano(dos, { lngMin: -74.05, lngMax: -73.95, latMin: -9.6, latMax: -9.55 }, ASPECTO);
    expect(a.principal.src).toMatch(/\.png\?/);
    expect(a.extras).toHaveLength(1);
    // El que más cubre (T18LXQ, 0,07° de 0,1°) va arriba; el otro, debajo.
    expect(a.principal.src).toContain("item=T18LXQ");
    expect(a.extras[0]).toContain("item=T18LWQ");
  });

  it("mapa topográfico: el mapa, después el mapa al tamaño de siempre, y la foto con SU texto", () => {
    const a = armarFondoPlano(elegirFondoPlano({ base: "topo", escena: null, esri }), sobreBlas, ASPECTO);
    expect(a.principal.src).toMatch(/World_Topo_Map\/MapServer\/export\?.*size=2400,1586&format=png/);
    expect(a.respaldos[0].src).toContain("size=1180,780");
    const ultima = a.respaldos.at(-1);
    expect(ultima?.src).toContain("World_Imagery");
    expect(ultima?.celda).toBe("Esri World Imagery · 18 de junio de 2022");
  });
});

describe("PNG de la vista", () => {
  it("con la foto de Esri a zoom ~18 no pide más fino que el nivel 17 (1 400 px daba HTTP 500)", () => {
    const z18: Recuadro = { lngMin: -74.80375, lngMax: -74.79625, latMin: -9.7925, latMax: -9.7879 };
    const f = fondoDeLaImagen({ tipo: "esri", fecha: "2022-06-18" }, z18, 1400, 860);
    const ancho = Number(/size=(\d+),/.exec(f.url)?.[1]);
    expect(ancho).toBeLessThanOrEqual(690);
    expect(f.fuente).toContain("18 de junio de 2022");
  });

  it("con Sentinel-2: el recorte suavizado y la foto de Esri de respaldo, cada uno con su fecha", () => {
    const f = fondoDeLaImagen(elegirFondoVista({ base: "s2", escena: del("2026-09-23"), esri }), { lngMin: -74.82, lngMax: -74.78, latMin: -9.81, latMax: -9.78 }, 1400, 860);
    expect(f.url).toMatch(/1400x860\.png\?.*reproject=bilinear/);
    expect(f.fuente).toContain("23 de setiembre de 2026");
    expect(f.respaldo?.fuente).toContain("18 de junio de 2022");
  });
});

describe("la ventana del plano: si la imagen no carga, cambia la imagen Y el texto", () => {
  it("Sentinel-2 falla → Esri alta → Esri básica → sin imagen; el cajetín nunca dice Sentinel-2 sobre una foto de Esri", () => {
    const a = armarFondoPlano(elegirFondoPlano({ base: "s2", escena: del("2026-09-23"), esri }), CHICO, ASPECTO);
    document.body.innerHTML = `
      <span id="estado-fondo"></span><button id="imprimir"></button>
      <img class="s2x" src="https://x/vecino.png" alt="" />
      <img id="fondo" src="${a.principal.src}" alt="" />
      <span data-fuente-celda>${a.principal.celda}</span><span data-fuente-corto>${a.principal.corto}</span><span data-fuente-nota>${a.principal.nota}</span>`;
    vigilarLamina(window, a.principal, a.respaldos);
    const fondo = document.getElementById("fondo") as HTMLImageElement;
    const celda = () => document.querySelector("[data-fuente-celda]")?.textContent;

    fondo.dispatchEvent(new Event("error"));
    expect(fondo.src).toBe(a.respaldos[0].src);
    expect(celda()).toBe("Esri World Imagery · 18 de junio de 2022");
    expect(document.querySelector("[data-fuente-nota]")?.textContent).toMatch(/^Imagen satelital: Esri World Imagery del 18 de junio de 2022/);
    expect((document.querySelector("img.s2x") as HTMLElement).style.display).toBe("none");

    for (let i = 1; i < a.respaldos.length; i++) fondo.dispatchEvent(new Event("error"));
    expect(fondo.src).toBe(a.respaldos.at(-1)?.src);
    fondo.dispatchEvent(new Event("error"));
    expect(fondo.style.display).toBe("none");
    expect(celda()).toBe("Sin imagen de fondo");
  });
});

describe("la ventana del plano: una imagen que se cuelga cuenta como caída", () => {
  afterEach(() => vi.useRealTimers());

  it("Sentinel-2 sin respuesta a los 25 s → pasa a la foto de Esri y lo dice en la barra", () => {
    vi.useFakeTimers();
    const a = armarFondoPlano(elegirFondoPlano({ base: "s2", escena: del("2026-09-23"), esri }), CHICO, ASPECTO);
    document.body.innerHTML = `<span id="estado-fondo"></span><img id="fondo" src="${a.principal.src}" alt="" /><span data-fuente-celda>${a.principal.celda}</span>`;
    const fondo = document.getElementById("fondo") as HTMLImageElement;
    // jsdom no descarga imágenes: se simula el pedido colgado.
    Object.defineProperty(fondo, "complete", { configurable: true, get: () => false });
    vigilarLamina(window, a.principal, a.respaldos);
    vi.advanceTimersByTime(ESPERA_POR_IMAGEN_MS - 1000);
    expect(fondo.src).toBe(a.principal.src);
    vi.advanceTimersByTime(2000);
    expect(fondo.src).toBe(a.respaldos[0].src);
    expect(document.querySelector("[data-fuente-celda]")?.textContent).toBe("Esri World Imagery · 18 de junio de 2022");
    expect(document.getElementById("estado-fondo")?.textContent).toBe("No cargó Sentinel-2 del 23 set 2026: probando con la foto de Esri del 18 jun 2022…");
  });
});
