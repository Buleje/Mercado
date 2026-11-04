/**
 * SIRE — cruce de la PROPUESTA de ventas de SUNAT (RVIE) con nuestro libro 14.1. Sin una
 * propuesta real a mano, el archivo sale de NUESTRO exportador (`armarSireRvie`: los mismos 33
 * campos del Anexo 2) y se le hacen cambios a propósito: el cruce tiene que ver exactamente esos.
 * También: fila de títulos, latin1, negativos «- 12.50», líneas vacías, .zip, tolerancia S/ 0,01.
 */
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { armarRegistroVentas, ESTADO_VENTA, ORIGEN_VENTA, type ComprobanteEmitido } from "@/lib/contabilidad/libros/registro-ventas";
import { armarSireRvie } from "@/lib/contabilidad/libros/sire-rvie";
import { centimosSire, claveComprobante, cruzarConPropuesta, leerArchivoPropuesta, parsearPropuestaRvie, type ResultadoCruce } from "@/lib/contabilidad/libros/sire-cruce";
import type { FilaLibro } from "@/lib/contabilidad/libros/comun";

const RUC = "20100066603";
const NEGOCIO = { ruc: RUC, razonSocial: "BODEGA SAN MARTIN S.A.C.", periodo: "2026-10" };
const MES = { ruc: RUC, periodo: "2026-10" };
const dia = (d: number) => new Date(Date.UTC(2026, 9, d, 15, 0, 0));

function comprobante(p: Partial<ComprobanteEmitido> & Pick<ComprobanteEmitido, "id" | "tipo" | "serie" | "numero">): ComprobanteEmitido {
  return { clienteDoc: null, clienteNombre: "", subtotal: 100, igv: 18, total: 118, estado: "accepted", emitidoEn: dia(10), pedidoId: null, ...p };
}
const libro = (c: ComprobanteEmitido[]): FilaLibro[] =>
  armarRegistroVentas({ periodo: "2026-10", comprobantes: c, ventasPos: [], pedidos: [], notasCredito: [], pedidosSinEntregar: 0, pedidosConComprobante: [], devoluciones: [] }).filas;

/** Fila del libro escrita a mano (las claves reales de `armarRegistroVentas`). */
const filaLibro = (p: Partial<FilaLibro>): FilaLibro => ({
  fechaEmision: "10/10/2026",
  tipo: "03",
  serie: "B001",
  numero: 1,
  clienteNombre: "",
  baseGravada: 100,
  igv: 18,
  total: 118,
  estado: ESTADO_VENTA.aceptado,
  origen: ORIGEN_VENTA.electronico,
  ...p,
});

/** Una línea de propuesta con los campos en la posición del Anexo 2 (40 campos). */
function lineaSunat(p: { tipo?: string; serie?: string; numero?: string; cliente?: string; base?: string; igv?: string; total?: string; periodo?: string; ruc?: string }): string {
  const c = Array.from({ length: 40 }, () => "");
  c[0] = p.ruc ?? RUC;
  c[1] = "BODEGA SAN MARTIN S.A.C.";
  c[2] = p.periodo ?? "202610";
  c[4] = "10/10/2026";
  c[6] = p.tipo ?? "03";
  c[7] = p.serie ?? "B001";
  c[8] = p.numero ?? "1";
  c[12] = p.cliente ?? "";
  c[14] = p.base ?? "100.00";
  c[16] = p.igv ?? "18.00";
  c[25] = p.total ?? "118.00";
  c[26] = "PEN";
  return c.join("|");
}

function cruzar(txt: string, filas: FilaLibro[], negocio: { ruc: string | null; periodo: string } = MES): Extract<ResultadoCruce, { ok: true }> {
  const p = parsearPropuestaRvie(txt);
  if (!p.ok) throw new Error(p.error);
  const r = cruzarConPropuesta(p, filas, negocio);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("cruce con un archivo de NUESTRO exportador", () => {
  const filas = libro([
    comprobante({ id: "f1", tipo: "factura", serie: "F001", numero: 1, clienteDoc: "20131312955", clienteNombre: "FERRETERIA EL SOL SAC", subtotal: 500, igv: 90, total: 590 }),
    comprobante({ id: "b2", tipo: "boleta", serie: "B001", numero: 2, subtotal: 50, igv: 9, total: 59, emitidoEn: dia(11) }),
    comprobante({ id: "b3", tipo: "boleta", serie: "B001", numero: 3, emitidoEn: dia(12) }),
    comprobante({ id: "b4", tipo: "boleta", serie: "B001", numero: 4, estado: "voided", subtotal: 20, igv: 3.6, total: 23.6 }),
  ]);
  const armado = armarSireRvie(filas, NEGOCIO);
  if (!armado.ok) throw new Error(`el exportador no armó el archivo: ${armado.error}`);
  const exportado = armado;

  it("el archivo tal cual: 4 iguales y ninguna diferencia", () => {
    expect(exportado.ok).toBe(true);
    expect(exportado.lineas).toBe(4);
    const r = cruzar(exportado.contenidoTxt, filas);
    expect(r.resumen).toEqual({ soloSunat: 0, soloLibro: 0, importes: 0, iguales: 4, enSunat: 4, enLibro: 4, sinComprobante: 0 });
    expect(r.diferencias).toEqual([]);
    expect(r.totales.sunat).toEqual(r.totales.libro);
    expect(r.totales.libro).toEqual({ base: 650, igv: 117, total: 767 });
  });

  it("quitando la B001-2 y subiendo el total de la F001-1 en S/ 1: salen EXACTAMENTE esas 2", () => {
    const lineas = exportado.contenidoTxt.split("\r\n").filter((l) => !l.includes("|B001|2|"));
    const tocado = lineas.map((l) => {
      if (!l.includes("|F001|1|")) return l;
      const c = l.split("|");
      c[25] = "591.00";
      return c.join("|");
    });
    expect(tocado.length).toBe(lineas.length);
    const r = cruzar(tocado.join("\r\n"), filas);
    expect(r.resumen).toMatchObject({ soloSunat: 0, soloLibro: 1, importes: 1, iguales: 2 });
    expect(r.diferencias.map((d) => [d.clase, d.comprobante, d.campos, d.diferencia])).toEqual([
      ["soloLibro", "B001-2", [], -59],
      ["importes", "F001-1", ["total"], 1],
    ]);
    expect(r.diferencias[1]).toMatchObject({ libro: { total: 590 }, sunat: { total: 591 }, cliente: "FERRETERIA EL SOL SAC" });
  });

  it("una boleta que SUNAT tiene y el libro no", () => {
    const r = cruzar(`${exportado.contenidoTxt}${lineaSunat({ numero: "99", base: "10.00", igv: "1.80", total: "11.80" })}\r\n`, filas);
    expect(r.diferencias).toEqual([expect.objectContaining({ clase: "soloSunat", comprobante: "B001-99", libro: null, diferencia: 11.8 })]);
  });
});

describe("lectura tolerante de la propuesta", () => {
  it("negativos con y sin espacio, coma, vacío, redondeo y basura", () => {
    expect(centimosSire("-123.45")).toBe(-12345);
    expect(centimosSire("- 123.45")).toBe(-12345);
    expect(centimosSire(" 12,5 ")).toBe(1250);
    expect(centimosSire("1.005")).toBe(101);
    expect(centimosSire("")).toBe(0);
    expect(Object.is(centimosSire("-0.00"), 0)).toBe(true);
    expect(centimosSire("12.3.4")).toBeNull();
    expect(centimosSire("S/ 5")).toBeNull();
  });

  it("la clave quita ceros del número y normaliza tipo y serie", () => {
    expect(claveComprobante("3", "b001", "00000012")).toBe("03|B001|12");
    expect(claveComprobante("01", "F001", 12)).toBe("01|F001|12");
    expect(claveComprobante("", "F001", "1")).toBeNull();
  });

  it("fila de títulos que ubica las columnas + latin1 + «- 12.50» + líneas vacías + número con ceros", () => {
    const titulos =
      "Nro|Ruc|Razon Social|Periodo|CAR SUNAT|Fecha de emisión|Fecha Vcto/Pago|Tipo CP/Doc.|Serie del CDP|Nro CP o Doc. Nro Inicial (Rango)|Nro Final (Rango)|Tipo Doc Identidad|Nro Doc Identidad|Apellidos Nombres/ Razón Social|Valor Facturado Exportación|BI Gravada|Dscto BI|IGV / IPM|Dscto IGV / IPM|Mto Exonerado|Mto Inafecto|ISC|BI Grav IVAP|IVAP|ICBPER|Otros Tributos|Total CP";
    const conNro = (n: number, l: string) => `${n}|${l}`;
    const texto = [
      titulos,
      "",
      conNro(1, lineaSunat({ numero: "00000012", cliente: "PEÑA ÁVILA ROSA" })),
      "   ",
      conNro(2, lineaSunat({ tipo: "07", serie: "BC01", numero: "5", base: "- 12.50", igv: "-2.25", total: "- 14.75" })),
      "",
    ].join("\r\n");
    const leido = leerArchivoPropuesta(new Uint8Array(Buffer.from(texto, "latin1")), "propuesta.txt");
    expect(leido).toMatchObject({ ok: true, codificacion: "latin1" });
    if (!leido.ok) return;
    const p = parsearPropuestaRvie(leido.texto);
    expect(p).toMatchObject({ ok: true, conTitulos: true, ruc: RUC, periodo: "202610", ilegibles: [] });
    if (!p.ok) return;
    expect(p.comprobantes.map((c) => [c.clave, c.cliente, c.base, c.igv, c.total])).toEqual([
      ["03|B001|12", "PEÑA ÁVILA ROSA", 10000, 1800, 11800],
      ["07|BC01|5", "", -1250, -225, -1475],
    ]);
    const r = cruzarConPropuesta(p, [filaLibro({ numero: 12 }), filaLibro({ tipo: "07", serie: "BC01", numero: 5, baseGravada: -12.5, igv: -2.25, total: -14.75 })], MES);
    expect(r).toMatchObject({ ok: true, resumen: { iguales: 2, soloSunat: 0, soloLibro: 0, importes: 0 } });
  });

  it("UTF-8 con BOM y la propuesta dentro de un .zip (elige la de ventas)", () => {
    const txt = `﻿${lineaSunat({ cliente: "MUÑOZ" })}\r\n`;
    const zip = zipSync({
      "__MACOSX/._x.txt": strToU8("basura"),
      [`LE${RUC}20261000080400021112.txt`]: strToU8("no es esta"),
      [`LE${RUC}20261000140400021112.txt`]: strToU8(txt),
    });
    const leido = leerArchivoPropuesta(zip, "propuesta.zip");
    expect(leido).toMatchObject({ ok: true, codificacion: "utf-8", nombre: `LE${RUC}20261000140400021112.txt` });
    if (!leido.ok) return;
    expect(leido.texto.startsWith(RUC)).toBe(true);
    expect(cruzar(leido.texto, [filaLibro({})]).resumen.iguales).toBe(1);
  });

  it("frena el Excel, la propuesta de compras, el CSV y el archivo vacío", () => {
    const xlsx = zipSync({ "[Content_Types].xml": strToU8("<x/>"), "xl/workbook.xml": strToU8("<x/>") });
    expect(leerArchivoPropuesta(xlsx, "p.xlsx")).toMatchObject({ ok: false, error: expect.stringMatching(/Excel/) });
    expect(leerArchivoPropuesta(strToU8(lineaSunat({})), `LE${RUC}20261000080400021112.txt`)).toMatchObject({ ok: false, error: expect.stringMatching(/COMPRAS/) });
    expect(parsearPropuestaRvie("ruc;periodo;total\n20100066603;202610;118")).toMatchObject({ ok: false, error: expect.stringMatching(/«\|»/) });
    expect(leerArchivoPropuesta(new Uint8Array(0))).toMatchObject({ ok: false });
  });

  it("línea corta o con importe raro → ilegible y avisada; todas ilegibles → error", () => {
    const p = parsearPropuestaRvie([lineaSunat({}), "20100066603|X|202610", lineaSunat({ numero: "2", total: "1O0.00" })].join("\n"));
    expect(p).toMatchObject({ ok: true, ilegibles: [{ linea: 2 }, { linea: 3 }] });
    if (p.ok) expect(cruzarConPropuesta(p, [filaLibro({})], MES)).toMatchObject({ ok: true, avisos: [expect.stringMatching(/2 líneas de la propuesta/)] });
    expect(parsearPropuestaRvie("a|b|c\n1|2|3")).toMatchObject({ ok: false });
  });
});

describe("reglas del cruce", () => {
  it("tolerancia S/ 0,01 por importe: 0,01 es igual, 0,02 ya es diferencia", () => {
    expect(cruzar(lineaSunat({ total: "118.01" }), [filaLibro({})]).resumen.iguales).toBe(1);
    const r = cruzar(lineaSunat({ total: "118.02", igv: "17.99" }), [filaLibro({})]);
    expect(r.diferencias).toEqual([expect.objectContaining({ clase: "importes", campos: ["total"], diferencia: 0.02 })]);
  });

  it("repetida (anotada a mano y electrónica): cuenta la electrónica; anulada = ceros", () => {
    const filas = [
      filaLibro({ origen: "Venta anotada", total: 999 }),
      filaLibro({}),
      filaLibro({ numero: 7, estado: ESTADO_VENTA.anulado }),
      filaLibro({ serie: "", numero: "" }),
    ];
    const r = cruzar([lineaSunat({}), lineaSunat({ numero: "7", base: "0.00", igv: "0.00", total: "0.00" })].join("\n"), filas);
    expect(r.resumen).toMatchObject({ iguales: 2, enLibro: 2, sinComprobante: 1, soloLibro: 0, importes: 0 });
    expect(r.avisos.some((a) => a.includes("1 venta del libro no tiene"))).toBe(true);
  });

  it("otro mes u otro RUC → error claro; negocio sin RUC → cruza con aviso", () => {
    const p = parsearPropuestaRvie(lineaSunat({}));
    if (!p.ok) throw new Error(p.error);
    expect(cruzarConPropuesta(p, [], { ruc: RUC, periodo: "2026-09" })).toMatchObject({ ok: false, error: expect.stringMatching(/2026-10/) });
    expect(cruzarConPropuesta(p, [], { ruc: "20999999999", periodo: "2026-10" })).toMatchObject({ ok: false, error: expect.stringMatching(/RUC/) });
    const sinRuc = cruzarConPropuesta(p, [filaLibro({})], { ruc: null, periodo: "2026-10" });
    expect(sinRuc).toMatchObject({ ok: true, resumen: { iguales: 1 }, avisos: [expect.stringMatching(/no tiene RUC/)] });
  });

  it("propuesta con dos meses → error", () => {
    expect(parsearPropuestaRvie([lineaSunat({}), lineaSunat({ numero: "2", periodo: "202609" })].join("\n"))).toMatchObject({ ok: false, error: expect.stringMatching(/más de un mes/) });
  });
});

describe("topes del archivo (revisión 04-11)", () => {
  it(".zip que infla de más (suma de los .txt sobre el tope) → error sin descomprimir todo", () => {
    const cero = new Uint8Array(5 * 1024 * 1024);
    const zip = zipSync(Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`p${i}.txt`, cero])), { level: 9 });
    expect(leerArchivoPropuesta(zip, "propuesta.zip")).toMatchObject({ ok: false, error: expect.stringMatching(/demasiado/) });
  });

  it(".zip con más de 5 .txt → error", () => {
    const zip = zipSync(Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`p${i}.txt`, strToU8("a|b")])));
    expect(leerArchivoPropuesta(zip, "propuesta.zip")).toMatchObject({ ok: false, error: expect.stringMatching(/demasiado/) });
  });

  it("propuesta en blanco → error claro (no «todo cuadra con 0»)", () => {
    expect(parsearPropuestaRvie("\n")).toMatchObject({ ok: false, error: expect.stringMatching(/en blanco/) });
  });
});

