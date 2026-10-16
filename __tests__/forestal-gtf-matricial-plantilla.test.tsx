/**
 * El talonario de la imprenta en el diseñador (Brandon 16-10: «que se parezca
 * lo más posible a esos formatos»): la plantilla se DIBUJA en pantalla con los
 * datos de la guía y nunca viaja al papel; una disposición acomodada sobre la
 * grilla vieja vuelve a la de fábrica sin perder la medida ni el corrimiento;
 * lo amarillo es exactamente lo que no entra en su renglón ni achicado.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { casillerosGtf } from "@/lib/forestal/ctp-gtf-formato";
import { CATALOGO, entraEnUnaLinea, hojaDeFabrica, normalizarHoja } from "@/lib/forestal/gtf-matricial-disposicion";
import { PLANTILLA_FABRICA, plantillaTalonario } from "@/lib/forestal/gtf-talonario-plantilla";
import { entradasDeLaGuia, paginasGuia, paginasLista } from "@/lib/forestal/gtf-matricial-valores";
import { htmlTalonario } from "@/lib/forestal/gtf-matricial-print";
import { camposQueNoEntran, encabezadoDelTalonario, revisarEncaje, serieYNumero } from "@/lib/forestal/gtf-matricial-pantalla";
import type { LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import PlantillaTalonario from "@/components/admin/forestal/gtf-matricial-plantilla";
import CampoTalonario from "@/components/admin/forestal/gtf-matricial-campo";

const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];
const DATOS = JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown;
const doc = (): LothGtfDoc => ({
  gtfNumber: "019-001-0000771", gtfDate: "2026-09-02", tipo: "trozas", titularName: "PEREZ MUÑOZ JUAN CARLOS",
  tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null, conductor: null,
  conductorLicencia: null, placaVehiculo: null, origen: null, destino: null, observations: null, status: "emitida",
  annulledReason: null, volumenTotalM3: null, gtfDatos: DATOS,
  items: Array.from({ length: 9 }, (_, i) => ({ code: `T-${i + 1}`, species: "Tornillo", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 })),
});

afterEach(cleanup);

describe("disposición guardada y plantilla", () => {
  it("sin `plantilla` (la grilla de antes): campos y tabla de fábrica; medida, corrimiento y separador se quedan", () => {
    const fab = hojaDeFabrica("guia");
    const h = normalizarHoja("guia", {
      anchoMm: 216, altoMm: 280, offsetXMm: 1.5, offsetYMm: -2, separadorFecha: "-",
      campos: { "7": { ...fab.campos["7"], x: 99 } },
      tabla: { ...fab.tabla, y: 150 },
    });
    expect([h.anchoMm, h.altoMm, h.offsetXMm, h.offsetYMm, h.separadorFecha]).toEqual([216, 280, 1.5, -2, "-"]);
    expect(h.campos).toEqual(fab.campos);
    expect(h.tabla).toEqual(fab.tabla);
    expect(h.plantilla).toBe(PLANTILLA_FABRICA);
  });

  it("acomodada sobre la plantilla de fábrica: se respeta lo movido", () => {
    const fab = hojaDeFabrica("guia");
    const h = normalizarHoja("guia", { ...fab, campos: { ...fab.campos, "7": { ...fab.campos["7"], x: 99 } }, tabla: { ...fab.tabla, y: 150 } });
    expect(h.campos["7"].x).toBe(99);
    expect(h.tabla.y).toBe(150);
  });
});

describe("el formato impreso es sólo de pantalla", () => {
  const e = entradasDeLaGuia(doc(), null);

  it("el papel de la matricial no lleva ni el dibujo ni sus rótulos", () => {
    const hoja = hojaDeFabrica("guia");
    const html = htmlTalonario(hoja, CATALOGO.guia, paginasGuia(e, hoja), "GTF");
    expect(html).not.toContain("<svg");
    const rotulos = plantillaTalonario("guia", {}).trazos.flatMap((t) => (t.t === "texto" && t.s.length >= 12 ? [t.s] : []));
    expect(rotulos.length).toBeGreaterThan(5);
    for (const r of rotulos) expect(html, r).not.toContain(r);
  });

  it("en pantalla: SVG en mm con el titular, la serie y el N° de esta guía; el N° en la tinta del folio", () => {
    const enc = encabezadoDelTalonario("guia", e, undefined, "INVERSIONES DE PRUEBA S.A.");
    expect(enc).toMatchObject({ titular: "INVERSIONES DE PRUEBA S.A.", serie: "19", numero: "0000771" });
    const { container } = render(<PlantillaTalonario formato="guia" encabezado={enc} anchoMm={210} altoMm={297} />);
    const svg = container.querySelector("svg[data-plantilla-talonario='guia']");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 210 297");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    const textos = [...container.querySelectorAll("text")];
    expect(textos.some((t) => t.textContent === "INVERSIONES DE PRUEBA S.A.")).toBe(true);
    const folio = textos.find((t) => t.textContent?.includes("0000771"));
    expect(folio?.getAttribute("fill")).toBe("var(--gtf-folio)");
    /* Sin hex: todo color sale de un token. */
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it("el encabezado no inventa: sin titular en el modal usa el (7); la lista sin N° propio deja el de fábrica", () => {
    const v = casillerosGtf(e.cuerpo);
    expect(encabezadoDelTalonario("guia", e, undefined, null).titular).toBe(v["7"]);
    const [pl] = paginasLista(e, hojaDeFabrica("lista"));
    const lista = encabezadoDelTalonario("lista", e, { ...pl, campos: { ...pl.campos, numero: e.cuerpo.numeroGtf } }, null);
    expect(lista.numero).toBeUndefined();
    expect(encabezadoDelTalonario("lista", e, { ...pl, campos: { ...pl.campos, numero: "00042" } }, null).numero).toBe("000042");
  });

  it("serie y N° del número de la guía", () => {
    expect(serieYNumero("019-001-0000771")).toEqual({ serie: "19", numero: "0000771" });
    expect(serieYNumero("0000771")).toEqual({ numero: "0000771" });
    expect(serieYNumero("  ")).toEqual({});
  });
});

describe("lo amarillo", () => {
  it("son exactamente los valores que no entran en una línea ni a 6 pt; de la tabla, la columna con su fila más larga", () => {
    const hoja = hojaDeFabrica("guia");
    const cat = CATALOGO.guia;
    const largo = "X".repeat(400);
    const col = cat.columnas[0].id;
    const lista = camposQueNoEntran(hoja, cat, { campos: { "7": largo, "6": "corto" }, filas: [{ [col]: "1" }, { [col]: largo }] });
    expect(lista.map((n) => n.clave)).toEqual(["campo:7", `columna:${col}`]);
    expect(entraEnUnaLinea("corto", hoja.campos["6"].anchoMm, hoja.campos["6"].letraPt)).toBe(true);
    const oculto = { ...hoja, campos: { ...hoja.campos, "7": { ...hoja.campos["7"], visible: false } } };
    expect(camposQueNoEntran(oculto, cat, { campos: { "7": largo }, filas: [] })).toEqual([]);
  });

  it("lo que entra achicado no es amarillo: va aparte, con la letra a la que sale", () => {
    const hoja = hojaDeFabrica("guia");
    const r = revisarEncaje(hoja, CATALOGO.guia, { campos: { "7": "X".repeat(40) }, filas: [] });
    expect(r.noEntran).toEqual([]);
    expect(r.achicados).toMatchObject([{ clave: "campo:7", letraPt: 8.6 }]);
  });
});

describe("el valor en la hoja de pantalla", () => {
  const base = {
    etiqueta: "(7) Nombre del titular", x: 10, y: 20, anchoMm: 73.6, letraPt: 9, alinea: "izq" as const, escala: 4, seleccionado: false,
    onPresionar: () => undefined, onFocoTeclado: () => undefined, onFlecha: () => undefined,
  };

  it("achicado: el texto en su letra dentro de la caja con la del campo (la base no se mueve) y el aviso al pasar el mouse", () => {
    const { container } = render(<CampoTalonario {...base} texto={"X".repeat(40)} letraValorPt={8.6} />);
    const caja = container.querySelector<HTMLElement>("[data-campo]");
    expect(caja?.title).toBe("(7) Nombre del titular · letra 8,6 pt para que entre");
    expect(caja?.style.whiteSpace).toBe("nowrap");
    expect(caja?.style.fontSize).toBe(`${(9 * 25.4) / 72 * 4}px`);
    expect(caja?.querySelector("span")?.style.fontSize).toBe(`${(8.6 * 25.4) / 72 * 4}px`);
  });

  it("«Sólo valores»: el vacío no se dibuja y no hay nombre encima", () => {
    const vacio = render(<CampoTalonario {...base} texto="" nombre="(7) Titular" soloValores />);
    expect(vacio.container.innerHTML).toBe("");
    const lleno = render(<CampoTalonario {...base} texto="PEREZ" nombre="(7) Titular" soloValores />);
    expect(lleno.container.querySelector("[data-nombre-campo]")).toBeNull();
    expect(lleno.container.textContent).toBe("PEREZ");
  });
});
