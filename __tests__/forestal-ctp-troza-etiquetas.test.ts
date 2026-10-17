import { describe, expect, it } from "vitest";
import {
  FORMATOS_ETIQUETA,
  codigoDeEtiqueta,
  cssEtiquetas,
  cuerpoEtiquetas,
  htmlEtiqueta,
  diaDeEtiqueta,
  medidasEtiqueta,
  resumenEtiquetado,
  tamanoCodigoPt,
  trozasEtiquetables,
  urlFichaDeTroza,
} from "@/lib/forestal/ctp-troza-etiquetas";
import { esIdDeTroza, rutaFichaDeTroza, TAB_LIBRO_CTP, urlCortaDeTroza } from "@/lib/forestal/ctp-troza-url";
import { CTP_MODULE_TAB_ID } from "@/components/admin/forestal/ctp-shared";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const troza = (over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: "t1",
  woodEntryId: "e1",
  codificacion: "106/B",
  codigoPlanta: "P-014",
  especieComun: "Copaiba",
  d1Cm: 45,
  d2Cm: 39,
  largoM: 6.16,
  volumenM3: 5.133,
  gtfNumber: "EFDT-001-2026",
  permiso: "PGMF-014-2020",
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  ...over,
});

describe("trozasEtiquetables", () => {
  it("una troza libre en el patio entra", () => {
    expect(trozasEtiquetables([troza()])).toHaveLength(1);
  });

  it("descarta la consumida, la despachada, la sin recepcionar, la descarte y la madre retrozada", () => {
    const consumida = troza({ id: "consumida", consumidaEnId: "corrida1" });
    const despachada = troza({ id: "despachada", despachadaEnId: "desp1" });
    const noRecepcionada = troza({ id: "no-recepcionada", noRecepcionada: true });
    const descarte = troza({ id: "descarte", descarte: true });
    const madreRetrozada = troza({ id: "madre", retrozos: 2 });

    expect(trozasEtiquetables([consumida, despachada, noRecepcionada, descarte, madreRetrozada])).toHaveLength(0);
  });

  it("de un lote mixto sólo salen las que hoy están en el patio", () => {
    const libre = troza({ id: "libre" });
    const consumida = troza({ id: "consumida", consumidaEnId: "corrida1" });
    const resultado = trozasEtiquetables([libre, consumida]);
    expect(resultado.map((t) => t.id)).toEqual(["libre"]);
  });

  it("sin trozas, ninguna etiqueta", () => {
    expect(trozasEtiquetables([])).toEqual([]);
  });
});

describe("medidasEtiqueta — D1, D2 y largo SIEMPRE, con su nombre (Brandon 26-09)", () => {
  it("con las tres medidas: D1 y D2 como vienen, no reordenadas", () => {
    expect(medidasEtiqueta({ d1Cm: 39, d2Cm: 45, largoM: 6.16 })).toBe("D1 39 · D2 45 cm · L 6.16 m");
  });

  it("con un solo diámetro, el otro sale «—»", () => {
    expect(medidasEtiqueta({ d1Cm: 45, d2Cm: null, largoM: 6.16 })).toBe("D1 45 · D2 — cm · L 6.16 m");
  });

  it("sin D1/D2 igual se imprimen, con «—» (77 de 84 trozas de Blas no los traen: hay que medirlas)", () => {
    expect(medidasEtiqueta({ d1Cm: null, d2Cm: null, largoM: 6.16 })).toBe("D1 — · D2 — · L 6.16 m");
  });

  it("con sólo el diámetro declarado como un número, va entre paréntesis", () => {
    expect(medidasEtiqueta({ d1Cm: null, d2Cm: null, diametroCm: 44, largoM: 5 })).toBe("D1 — · D2 — (Ø 44 cm) · L 5.00 m");
  });

  it("sin ninguna medida, guiones — nunca 0", () => {
    expect(medidasEtiqueta({ d1Cm: null, d2Cm: null, largoM: null })).toBe("D1 — · D2 — · L —");
  });
});

describe("urlFichaDeTroza", () => {
  it("abre el panel en Libro CTP → Trozas con el id de la pieza", () => {
    const url = urlFichaDeTroza("https://blas.buleje.pe", "abc123");
    const u = new URL(url);
    expect(u.origin).toBe("https://blas.buleje.pe");
    expect(u.pathname).toBe("/admin");
    expect(u.searchParams.get("tab")).toBe("ctp-libro-operaciones");
    expect(u.searchParams.get("vista")).toBe("trozas");
    expect(u.searchParams.get("troza")).toBe("abc123");
  });

  it("usa el origen que se le pasa, no uno fijo — cada tenant escanea el suyo", () => {
    const url = urlFichaDeTroza("https://otro-tenant.buleje.pe", "xyz");
    expect(url.startsWith("https://otro-tenant.buleje.pe/admin?")).toBe(true);
  });
});

describe("ruta corta del QR", () => {
  it("el QR lleva /admin/q/<id> del MISMO origen", () => {
    expect(urlCortaDeTroza("https://blas.buleje.pe", "cmg1abcdefghijklmnopqrstu")).toBe(
      "https://blas.buleje.pe/admin/q/cmg1abcdefghijklmnopqrstu",
    );
  });

  it("la ruta corta redirige a la misma ficha que la URL larga", () => {
    const id = "cmg1abcdefghijklmnopqrstu";
    expect(`https://x.pe${rutaFichaDeTroza(id)}`).toBe(urlFichaDeTroza("https://x.pe", id));
  });

  it("la pestaña del libro es la misma constante que usa el panel", () => {
    expect(TAB_LIBRO_CTP).toBe(CTP_MODULE_TAB_ID);
  });

  it("sólo acepta ids con forma de cuid: nada de rutas ni scripts", () => {
    expect(esIdDeTroza("cmg1abcdefghijklmnopqrstu")).toBe(true);
    expect(esIdDeTroza("../../etc")).toBe(false);
    expect(esIdDeTroza("<script>")).toBe(false);
    expect(esIdDeTroza("abc")).toBe(false);
    expect(esIdDeTroza(undefined)).toBe(false);
  });

  it("la URL corta es más corta que la larga (menos módulos en el QR)", async () => {
    const QR = (await import("qrcode")).default;
    const id = "cmg1abcdefghijklmnopqrstu";
    const corta = QR.create(urlCortaDeTroza("https://inversiones-agroforestales-blas.buleje.pe", id), { errorCorrectionLevel: "M" });
    const larga = QR.create(urlFichaDeTroza("https://inversiones-agroforestales-blas.buleje.pe", id), { errorCorrectionLevel: "M" });
    expect(corta.modules.size).toBeLessThan(larga.modules.size);
  });
});

describe("código de la etiqueta", () => {
  it("prefiere la marca de planta; si no, la del bosque; «-» es sin código", () => {
    expect(codigoDeEtiqueta({ codigoPlanta: "115-A", codificacion: "106/B" })).toBe("115-A");
    expect(codigoDeEtiqueta({ codigoPlanta: null, codificacion: "106/B" })).toBe("106/B");
    expect(codigoDeEtiqueta({ codigoPlanta: null, codificacion: "-" })).toBe("—");
  });

  it("el tamaño baja con el largo y nunca pasa el techo del formato", () => {
    expect(tamanoCodigoPt("7", "testa-a6")).toBe(100);
    expect(tamanoCodigoPt("115-A", "testa-a6")).toBeGreaterThan(60);
    expect(tamanoCodigoPt("PQ-2609-004", "a4-3x7")).toBeLessThan(tamanoCodigoPt("115", "a4-3x7"));
    expect(tamanoCodigoPt("X".repeat(80), "rollo-50x30")).toBe(7);
  });
});

describe("htmlEtiqueta", () => {
  const qr = "<svg data-qr></svg>";

  it("con barras: un Code128 del código de planta", () => {
    const html = htmlEtiqueta(troza({ codigoPlanta: "115-A" }), qr, { formato: "a4-3x7", barras: true });
    expect(html).toContain('class="bar"');
    expect(html).toContain("Código de barras 115-A");
    expect(html).toContain("data-qr");
  });

  it("sin barras si se apaga, o si la troza no tiene ningún código", () => {
    expect(htmlEtiqueta(troza(), qr, { formato: "a4-3x7", barras: false })).not.toContain('class="bar"');
    expect(htmlEtiqueta(troza({ codigoPlanta: null, codificacion: "-" }), qr, { formato: "a4-3x7", barras: true })).not.toContain('class="bar"');
  });

  it("escapa lo que viene de la base", () => {
    const html = htmlEtiqueta(troza({ especieComun: '<img src=x onerror="a">' }), qr, { formato: "rollo-50x30", barras: false });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});

describe("formatos", () => {
  it("cada formato declara su tamaño de página", () => {
    expect(cssEtiquetas("a4-3x7")).toContain("size: A4");
    expect(cssEtiquetas("rollo-50x30")).toContain("size: 50mm 30mm");
    expect(cssEtiquetas("rollo-100x50")).toContain("size: 100mm 50mm");
    expect(cssEtiquetas("testa-a6")).toContain("size: 105mm 148mm"); // A6 en mm: Chrome ignora «size: A6»
  });

  it("el QR de la testa es de al menos 4 cm y el del A4 más grande que el viejo de 15 mm", () => {
    const f = Object.fromEntries(FORMATOS_ETIQUETA.map((x) => [x.id, x]));
    expect(f["testa-a6"]!.qrMm).toBeGreaterThanOrEqual(40);
    expect(f["a4-3x7"]!.qrMm).toBeGreaterThan(15);
  });

  it("A4 agrupa de a 21 por hoja; el rollo va una tras otra", () => {
    const tarjetas = Array.from({ length: 22 }, (_, i) => `<i>${i}</i>`);
    expect(cuerpoEtiquetas(tarjetas, "a4-3x7").match(/class="hoja"/g)).toHaveLength(2);
    expect(cuerpoEtiquetas(tarjetas, "rollo-50x30")).not.toContain("hoja");
  });
});

describe("resumenEtiquetado", () => {
  const patio = [
    troza({ id: "a", codigoPlanta: "118", etiquetadaEn: "2026-09-10T15:00:00.000Z" } as Partial<TrozaConsumible>),
    troza({ id: "b", codigoPlanta: "118" }),
    troza({ id: "c", codigoPlanta: null, etiquetadaEn: "2026-09-12T15:00:00.000Z" } as Partial<TrozaConsumible>),
    troza({ id: "d", codigoPlanta: "200", consumidaEnId: "corrida" }),
    troza({ id: "e", codigoPlanta: "300" }),
  ];

  it("cuenta las que van, las ya etiquetadas (con la última fecha) y las sin código", () => {
    const r = resumenEtiquetado(patio, ["a", "b", "c", "d", "zzz"], { soloSinEtiqueta: false });
    expect(r.enPatio.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(r.fuera).toBe(2); // la aserrada y la que no existe
    expect(r.yaEtiquetadas.map((t) => t.id)).toEqual(["a", "c"]);
    expect(r.ultimaEtiqueta).toBe("2026-09-12T15:00:00.000Z");
    expect(r.sinCodigo.map((t) => t.id)).toEqual(["c"]);
    expect(r.aImprimir).toHaveLength(3);
  });

  it("«solo las que no tienen etiqueta» saca las ya impresas", () => {
    const r = resumenEtiquetado(patio, ["a", "b", "c"], { soloSinEtiqueta: true });
    expect(r.aImprimir.map((t) => t.id)).toEqual(["b"]);
  });

  it("el 118 repetido se avisa UNA vez, contando contra el patio entero", () => {
    expect(resumenEtiquetado(patio, ["a", "b"], { soloSinEtiqueta: false }).repetidos).toEqual([{ codigo: "118", piezas: 2 }]);
    // pedir sólo una de las dos igual avisa: la otra está en la pila
    expect(resumenEtiquetado(patio, ["b"], { soloSinEtiqueta: false }).repetidos).toEqual([{ codigo: "118", piezas: 2 }]);
    expect(resumenEtiquetado(patio, ["e"], { soloSinEtiqueta: false }).repetidos).toEqual([]);
  });

  it("la fecha se dice como en el resto del panel: «jueves 10/09» en hora de Lima", () => {
    expect(diaDeEtiqueta("2026-09-10T15:00:00.000Z")).toBe("jueves 10/09");
    expect(diaDeEtiqueta(null)).toBe("");
  });
});
