import { describe, expect, it } from "vitest";
import {
  cabeceraDoc,
  documentoHtml,
  MARGEN_MM,
  resumenDoc,
  seccionDoc,
  selloDoc,
} from "@/lib/forestal/ctp-documento-print";
import { portadaLegajo, type RenglonLegajo } from "@/lib/forestal/ctp-legajo";

describe("documentoHtml — el armazón de papel", () => {
  const hoja = () =>
    documentoHtml({ titulo: "GTF 019-4", css: ".x{color:red}", cuerpo: "<p>hola</p>", pieCorrido: "GTF 019-4" });

  it("sale autocontenido y en A4: el visor y la impresora leen lo mismo", () => {
    const h = hoja();
    expect(h.startsWith("<!doctype html>")).toBe(true);
    // El margen sale de una sola fuente: si cambia, cambia con él el alto útil
    // que usan `paginar()` y el PDF.
    expect(h).toContain(`@page{size:A4;margin:${MARGEN_MM}mm}`);
    expect(MARGEN_MM).toBeLessThanOrEqual(15);
    expect(h).toContain(".doc-hoja");
    expect(h).toContain(".x{color:red}");
  });

  it("el contenido va DENTRO de la hoja, que es lo que se ve como papel", () => {
    expect(hoja()).toContain('<div class="doc-hoja"><p>hola</p></div>');
  });

  it("el pie corrido queda FUERA de la hoja: se repite por página, no fluye", () => {
    // Si viviera adentro del flujo saldría una sola vez, y la hoja 3 de un anexo
    // largo volvería a ser un papel anónimo.
    const h = hoja();
    expect(h).toMatch(/<\/div>\s*<div class="doc-corrido">GTF 019-4<\/div>/);
  });

  it("sin pie corrido no deja el div vacío", () => {
    expect(documentoHtml({ titulo: "x", cuerpo: "y" })).not.toContain("doc-corrido\">");
  });

  it("el título se escapa: un N° de guía con comillas no rompe el head", () => {
    expect(documentoHtml({ titulo: 'a"><script>x', cuerpo: "" })).not.toContain("<script>x");
  });
});

describe("cabeceraDoc", () => {
  it("las líneas de meta vacías no dejan renglones huecos", () => {
    const h = cabeceraDoc({ emisor: "CC.NN. San Luis", meta: ["", null, undefined, "PASCO"], tipo: "Lista", numero: "4" });
    expect(h.match(/doc-meta/g) ?? []).toHaveLength(1);
    expect(h).toContain("PASCO");
  });

  it("sin número el recuadro no colapsa", () => {
    expect(cabeceraDoc({ emisor: "x", tipo: "Lista", numero: "" })).toContain("&nbsp;");
  });

  it("escapa todo lo que viene de la guía", () => {
    const h = cabeceraDoc({ emisor: "<img src=x>", tipo: "Lista", numero: "1" });
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
  });
});

describe("resumenDoc — las cifras de un vistazo", () => {
  it("una ficha sin valor no se dibuja: un recuadro vacío parece un dato perdido", () => {
    const h = resumenDoc([{ k: "Piezas", v: "" }, { k: "Volumen", v: "12.500", u: "m³" }]);
    expect(h).not.toContain("Piezas");
    expect(h).toContain("12.500");
  });

  it("sin ninguna ficha con valor no deja la franja vacía", () => {
    expect(resumenDoc([{ k: "Piezas", v: "" }])).toBe("");
  });

  it("el tono viaja como clase, no como color hardcodeado en el HTML", () => {
    expect(resumenDoc([{ k: "Estado", v: "Anulada", tono: "mal" }])).toContain('class="t mal"');
  });
});

describe("seccionDoc y selloDoc", () => {
  it("el cintillo dice qué casilleros trae debajo", () => {
    expect(seccionDoc("Destinatario", "casilleros (22) a (28)")).toContain("casilleros (22) a (28)");
  });

  it("sin casilleros no dibuja el span vacío", () => {
    expect(seccionDoc("Destinatario")).not.toContain("<span>");
  });

  it("el sello lleva su aclaración, que es para lo que existe", () => {
    const h = selloDoc("Reproducción", "No sustituye el original");
    expect(h).toContain("Reproducción");
    expect(h).toContain("No sustituye el original");
  });
});

describe("legajo — varios documentos en uno", () => {
  it("cada parte se envuelve para que arranque en hoja nueva", () => {
    const h = documentoHtml({ titulo: "Legajo", cuerpo: ["<p>uno</p>", "<p>dos</p>"] });
    expect(h).toContain('<section class="doc-parte"><p>uno</p></section>');
    expect(h).toContain('<section class="doc-parte"><p>dos</p></section>');
    expect(h).toContain(".doc-parte + .doc-parte { break-before:page; }");
  });

  it("un cuerpo suelto NO se envuelve: no hay legajo de un documento", () => {
    // El CSS de las partes viaja siempre (es del armazón); lo que no debe
    // aparecer es la ENVOLTURA, que es la que fuerza el salto de hoja.
    expect(documentoHtml({ titulo: "x", cuerpo: "<p>uno</p>" })).not.toContain('<section class="doc-parte">');
  });
});

describe("portadaLegajo — el índice es lo que se cuenta contra la carpeta", () => {
  const renglon = (over: Partial<RenglonLegajo> = {}): RenglonLegajo => ({
    libroNro: 14,
    gtfNumber: "019-0000003",
    entryDate: "2026-07-30",
    providerName: "CC.NN. SAN LUIS",
    especie: "Sapotillo",
    volumenM3: "4.8740",
    piezas: 2,
    estado: "Pendiente",
    conGuia: true,
    ...over,
  });

  it("el total del índice suma lo listado", () => {
    const h = portadaLegajo({ titular: "CTP", renglones: [renglon(), renglon({ volumenM3: "9.0650" })] });
    expect(h).toContain("13.939");
  });

  it("dice cuántos ingresos NO traen la guía: son los que hay que adjuntar a mano", () => {
    const h = portadaLegajo({ titular: "CTP", renglones: [renglon(), renglon({ conGuia: false })] });
    expect(h).toContain("Sin ficha SERFOR");
    expect(h).toContain("hay 1 en esa situación");
  });

  it("sin faltantes no inventa la advertencia", () => {
    const h = portadaLegajo({ titular: "CTP", renglones: [renglon()] });
    expect(h).not.toContain("en esa situación");
  });

  it("la fecha del ingreso se lee como en el papel (DD.MM.YYYY)", () => {
    expect(portadaLegajo({ titular: "CTP", renglones: [renglon()] })).toContain("30.07.2026");
  });

  it("escapa lo que viene del proveedor", () => {
    const h = portadaLegajo({ titular: "CTP", renglones: [renglon({ providerName: "<b>x</b>" })] });
    expect(h).not.toContain("<b>x</b>");
    expect(h).toContain("&lt;b&gt;x");
  });
});
