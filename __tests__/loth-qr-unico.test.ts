/**
 * Tests — QR que no falla (QR1, QR3, QR4, QR5 · 08-10).
 *
 *   · El QR por línea (`…/verificar/troza/<id>?c=<código>`), con o sin el
 *     prefijo `/t/<slug>` de la base pública, se lee como el CÓDIGO (lo que
 *     vale sin internet) + el id de la línea; el viejo `/verificar/<código>`
 *     sigue leyéndose; `/verificar/guia/…` no es una troza.
 *   · Con el id, la troza se encuentra aunque el código esté en dos permisos.
 *   · Tamaño del módulo del QR del sistema por formato de etiqueta, medido con
 *     la URL más larga real (Blas por `/t/<slug>`): < 2 puntos → un solo QR.
 *   · La hoja de despacho: trozas con D1/D2/Largo/m³ del trozado, total, y el
 *     QR a la lista pública con el id de una línea vigente; sin DNI.
 */
import { describe, expect, it } from "vitest";
import QR from "qrcode";
import { buscarTrozaEscaneada, leerEscaneo } from "@/lib/forestal/leer-escaneo-troza";
import { buscarEnTablero, leerQrTrozaLoth } from "@/lib/forestal/loth-qr-troza";
import type { TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { MIN_PUNTOS_POR_MODULO, permisoDelPie, puntosPorModulo, qrsDeLaEtiqueta } from "@/lib/forestal/loth-troza-etiquetas";
import { trozasPedidas } from "@/components/admin/forestal/LothGuiaTrozasDeAntes";
import { FORMATOS_ETIQUETA } from "@/lib/forestal/ctp-troza-etiquetas";
import { htmlHojaDespacho, lineaDelQr } from "@/lib/forestal/loth-despacho-hoja";
import { despachosPorGuia } from "@/lib/forestal/loth-despacho-por-guia";
import type { LothEntryDTO, TrozadoDelDespacho } from "@/lib/forestal/loth-constants";
import { urlVerificarTroza } from "@/lib/tenant-url-publica";

const BLAS = "inversiones-agroforestales-blas-sociedad-anonima";
const ID = "cmuxm8tq60003yvvznq98n0go";

describe("leerEscaneo con el QR por línea", () => {
  it("id + código (con «/» y espacios), con la base `/t/<slug>`", () => {
    const url = urlVerificarTroza(`http://localhost:3000/t/${BLAS}`, { lineaId: ID, codigo: "13/a (0000008)-0003" });
    expect(leerEscaneo(url)).toEqual({ tipo: "codigo", codigo: "13/A (0000008)-0003", linea: ID });
  });
  it("con subdominio y sin prefijo", () => {
    expect(leerEscaneo(`https://${BLAS}.buleje.pe/verificar/troza/${ID}?c=12A-0001`)).toEqual({
      tipo: "codigo",
      codigo: "12A-0001",
      linea: ID,
    });
  });
  it("el QR viejo por código también con `/t/<slug>`", () => {
    expect(leerEscaneo(`http://localhost:3000/t/${BLAS}/verificar/1`)).toEqual({ tipo: "codigo", codigo: "1" });
  });
  it("sin `?c=` no hay qué buscar sin internet; guía, lote y despacho no son trozas", () => {
    expect(leerEscaneo(`https://x.pe/verificar/troza/${ID}`)).toBeNull();
    expect(leerEscaneo(`https://x.pe/verificar/guia/${ID}`)).toBeNull();
    expect(leerEscaneo(`https://x.pe/t/${BLAS}/verificar/lote/${ID}`)).toBeNull();
    expect(leerEscaneo("https://x.pe/verificar/despacho/abc")).toBeNull();
  });
});

describe("el id decide aunque el código se repita", () => {
  it("escáner del despacho (lista de líneas del libro)", () => {
    const trozas = [
      { id: "linea-permiso-A", codigoPlanta: "1" },
      { id: ID, codigoPlanta: "1" },
    ];
    expect(buscarTrozaEscaneada(trozas, leerEscaneo(`https://x.pe/verificar/troza/${ID}?c=1`))).toEqual({
      estado: "una",
      troza: { id: ID, codigoPlanta: "1" },
    });
    expect(buscarTrozaEscaneada(trozas, leerEscaneo("1")).estado).toBe("varias");
  });
  it("Control del permiso (tablero)", () => {
    const fila = (code: string, trozadoId: string) => ({ code, trozadoId, treeCode: code }) as TrozaTablero;
    const filas = [fila("1", "otra-linea"), fila("1", ID)];
    const l = leerQrTrozaLoth(`https://x.pe/verificar/troza/${ID}?c=1`);
    expect(l).toEqual({ tipo: "codigo", codigo: "1", linea: ID });
    const r = l?.tipo === "codigo" ? buscarEnTablero(filas, l.codigo, l.linea) : null;
    expect(r).toEqual({ estado: "una", fila: filas[1] });
    expect(buscarEnTablero(filas, "1").estado).toBe("varias");
  });
});

describe("tamaño del módulo del QR del sistema (QR5)", () => {
  /* La más larga real: localhost + `/t/<slug de 48>` + id + `?c=` de nivel 2. */
  const url = urlVerificarTroza(`http://localhost:3000/t/${BLAS}`, { lineaId: ID, codigo: "12A-019/0001" });
  const modulos = QR.create(url, { errorCorrectionLevel: "L" }).modules.size;

  it("la URL larga pide 41 módulos (versión 6)", () => {
    expect(url.length).toBeGreaterThan(115);
    expect(modulos).toBe(41);
  });
  it("puntos por módulo: lado × dpi ÷ (módulos + margen)", () => {
    expect(puntosPorModulo(8, 41, 203)).toBeCloseTo(1.49, 2);
    expect(puntosPorModulo(9, 41, 300)).toBeCloseTo(2.47, 2);
  });
  it("el rollo 50×30 (QR chico de 8 mm en 203 dpi) lleva UN solo QR; los demás, los dos", () => {
    const por = Object.fromEntries(FORMATOS_ETIQUETA.map((f) => [f.id, qrsDeLaEtiqueta(f.id, modulos)]));
    expect(por["rollo-50x30"]?.dos).toBe(false);
    expect(por["a4-3x7"]?.dos).toBe(true);
    expect(por["rollo-100x50"]?.dos).toBe(true);
    expect(por["testa-a6"]?.dos).toBe(true);
    for (const f of FORMATOS_ETIQUETA) {
      /* Con uno solo, el QR va en el lugar del grande: también ≥ 2 puntos. */
      const lado = por[f.id]?.dos ? f.qrChicoMm : f.qrMm;
      expect(puntosPorModulo(lado, modulos, f.id === "a4-3x7" ? 300 : 203)).toBeGreaterThanOrEqual(MIN_PUNTOS_POR_MODULO);
    }
  });
});

describe("hoja de despacho por guía (QR3)", () => {
  const trozado = (lineaId: string, vol: string): TrozadoDelDespacho => ({
    lineaId,
    lineNo: 1,
    treeCode: "1",
    speciesCommon: "Tornillo",
    speciesScientific: null,
    cites: false,
    diamMayorM: "0.62",
    diamMenorM: "0.55",
    lengthM: "4.10",
    volumeM3: vol,
    anulada: false,
  });
  const despacho = (id: string, code: string, over: Partial<LothEntryDTO> = {}) =>
    ({
      id,
      section: "despacho_troza",
      lineNo: 1,
      entryDate: "2025-10-09T00:00:00.000Z",
      treeCode: null,
      trozaCode: code,
      speciesCommon: null,
      speciesScientific: null,
      cites: false,
      diamMayorM: null,
      diamMenorM: null,
      lengthM: null,
      volumeM3: null,
      gtfNumber: "019-001-0000001",
      planId: "plan-1",
      status: "registrado",
      ...over,
    }) as LothEntryDTO;
  const lineas = [
    despacho("d0", "9", { status: "anulado" }),
    despacho("d1", "1", { trozado: trozado("t1", "1.2346") }),
    despacho("d2", "2", { trozado: trozado("t2", "0.9000") }),
  ];
  const [f] = despachosPorGuia(lineas, []);

  it("el QR lleva el id de la primera línea VIGENTE", () => {
    expect(lineaDelQr(f!)?.id).toBe("d1");
  });
  it("trozas vigentes con sus medidas, total y la dirección de la lista; sin DNI", () => {
    const html = htmlHojaDespacho(f!, {
      qrSvg: "<svg/>",
      url: "https://x.pe/verificar/guia/d1",
      permiso: { tituloHabilitante: "17-UCA/PER-0001", planNumber: "PO-1", titular: "Blas SA" },
    });
    expect(html).toContain("GTF 019-001-0000001");
    expect(html).toContain(">0.62<");
    expect(html).toContain(">4.10<");
    expect(html).toContain("1.235");
    expect(html).toContain("https://x.pe/verificar/guia/d1");
    expect(html).not.toContain(">9<");
    expect(html).not.toMatch(/DNI|tel[eé]fono/i);
  });
});

describe("«Armar la guía» con el permiso que ya fijó el escaneo (revisión Q)", () => {
  const prep = [
    { codigo: "118", planId: "A" },
    { codigo: "118", planId: "B" },
    { codigo: "7", planId: "A" },
    { codigo: "9", planId: null },
  ];
  it("con el permiso conocido, el mismo código en OTRO permiso no cuenta", () => {
    const r = trozasPedidas(prep, { codigos: ["118", "7"], planes: ["A"] });
    expect(r.map((t) => `${t.codigo}@${t.planId}`)).toEqual(["118@A", "7@A"]);
  });
  it("sin permiso conocido sigue como antes (las dos → el aviso de 2 permisos)", () => {
    expect(trozasPedidas(prep, { codigos: ["118"] })).toHaveLength(2);
  });
  it("«sin permiso» (null) también filtra", () => {
    expect(trozasPedidas(prep, { codigos: ["9", "118"], planes: [null] })).toEqual([{ codigo: "9", planId: null }]);
  });
});

describe("pie de la etiqueta: el permiso de la línea, sin rellenar con el del libro", () => {
  const libro = { tituloHabilitante: "OTRO PERMISO", planNumber: "P-OTRO" };
  it("permiso de la línea sin título → queda vacío, no el del libro filtrado", () => {
    expect(permisoDelPie({ tituloHabilitante: null, planNumber: "P-1" }, libro)).toEqual({
      tituloHabilitante: null,
      planNumber: "P-1",
    });
  });
  it("línea sin permiso → el del libro", () => {
    expect(permisoDelPie(null, libro)).toEqual(libro);
  });
});
