/**
 * «Imprimir en talonario» (Brandon 15-10): la GTF y su lista sobre el talonario
 * preimpreso de la matricial, sólo los valores y cada uno en sus mm.
 *   1. Los valores son los de «Imprimir hoja SERFOR» (misma entrada, mismos
 *      formateadores); vacío no se imprime.
 *   2. La lista sigue en otra hoja cuando no entra, sin mezclar listas, y el
 *      total va en la última hoja de cada lista.
 *   3. Lo guardado se completa con la de fábrica; lo inválido no entra.
 *   4. El HTML: `@page` del talonario, margen 0, corrimiento sumado, sin rótulos.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { casillerosGtf, cuerpoGtfOficial, detalleGtf, ORIGENES, ORIGENES_SIN_CASILLA_2024 } from "@/lib/forestal/ctp-gtf-formato";
import {
  acotarPos,
  CATALOGO,
  hojaDeFabrica,
  hojaSchema,
  normalizarDisposicion,
  normalizarHoja,
  ORIGENES_TALONARIO,
  entraEnUnaLinea,
} from "@/lib/forestal/gtf-matricial-disposicion";
import { PLANTILLA_FABRICA } from "@/lib/forestal/gtf-talonario-plantilla";
import { entradasDeLaGuia, paginasGuia, paginasLista } from "@/lib/forestal/gtf-matricial-valores";
import { cajasDeLaPagina, htmlPruebaTalonario, htmlTalonario } from "@/lib/forestal/gtf-matricial-print";
import type { LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import AccionesGtf from "@/components/admin/forestal/gtf-acciones-menu";
import type { Gtf } from "@/components/admin/forestal/gtf-tabla-columnas";

const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];
const DATOS = JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown;
const trozas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    code: `T-${i + 1}`, species: i % 3 ? "Cumala" : "Tornillo", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95,
  }));

const doc = (extra: Partial<LothGtfDoc> = {}): LothGtfDoc => ({
  gtfNumber: "019-001-0000482", gtfDate: "2026-09-02", tipo: "trozas", titularName: "PEREZ MUÑOZ JUAN CARLOS",
  tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null, conductor: null,
  conductorLicencia: null, placaVehiculo: null, origen: null, destino: null, observations: null, status: "emitida",
  annulledReason: null, volumenTotalM3: null, items: trozas(27), gtfDatos: DATOS, ...extra,
});

afterEach(cleanup);

describe("valores: los de la hoja SERFOR", () => {
  const e = entradasDeLaGuia(doc(), null);
  const hoja = hojaDeFabrica("guia");
  const [p] = paginasGuia(e, hoja);
  const v = casillerosGtf(e.cuerpo);
  const html = cuerpoGtfOficial(e.cuerpo);

  it("cada casillero con valor sale igual que en la hoja A4 (las fechas, con el separador del talonario)", () => {
    for (const id of ["2", "6", "7", "13", "22", "31p", "35", "36"] as const) {
      expect(p.campos[id], id).toBe(v[id]);
      if (v[id]) expect(html, id).toContain(v[id].replace(/&/g, "&amp;"));
    }
    expect(v["3"]).toBe("02.09.2026");
    expect(p.campos["3"]).toBe("02/09/2026");
    expect([p.campos["3d"], p.campos["3m"], p.campos["3a"]]).toEqual(["02", "09", "2026"]);
    expect(p.campos["7"]).toBe("PEREZ MUÑOZ JUAN CARLOS");
  });

  it("el (5) imprime una «X» sólo en la casilla del origen marcado", () => {
    const marcadas = ORIGENES_TALONARIO.filter((o) => p.campos[`5:${o.clave}`] === "X").map((o) => o.clave);
    expect(marcadas).toEqual([v["5"]]);
  });

  it("el detalle (37) y su total son los de la tabla del papel A4", () => {
    const det = detalleGtf(e.cuerpo.lineas);
    expect(p.filas).toEqual(det.filas);
    expect(p.campos["37t"]).toBe(det.total);
    expect(html).toContain(det.total);
  });

  it("las casillas del (5): las 10 del formato 2024 más las 2 de 2015 (el talonario no puede perder una)", () => {
    const claves = (xs: ReadonlyArray<{ clave: string }>) => xs.map((o) => o.clave).sort();
    expect(claves(ORIGENES_TALONARIO)).toEqual(claves([...ORIGENES, ...ORIGENES_SIN_CASILLA_2024]));
    // Las 9 de antes conservan su orden: la posición de fábrica de cada casilla
    // sale de ese orden y un talonario ya calibrado no se corre (ADR-494).
    expect(ORIGENES_TALONARIO.slice(0, 9).map((o) => o.clave)).toEqual([
      "concesion", "permiso", "autorizacion", "bosque_local", "desbosque", "cambio_uso", "plantacion", "plan_consolidado", "otros",
    ]);
  });
});

describe("lista: hojas del talonario", () => {
  const e = entradasDeLaGuia(doc(), null);

  it("27 trozas con 20 filas por hoja: dos hojas, una por lista, cada una con su N° y su total", () => {
    const ps = paginasLista(e, hojaDeFabrica("lista"));
    expect(ps.map((p) => p.filas.length)).toEqual([20, 7]);
    expect(ps[0].campos.numero).toBe(e.listas.numeros[0]);
    expect(ps[1].campos.numero).toBe(e.listas.numeros[1]);
    expect(ps[0].campos.totVol).toBe("19.000");
    expect(ps[1].campos.totPiezas).toBe("7");
    expect(ps[1].filas[0].n).toBe("1");
  });

  it("si el talonario entra 8 filas, cada lista sigue en otra hoja y el total va en su última", () => {
    const hoja = { ...hojaDeFabrica("lista"), tabla: { ...hojaDeFabrica("lista").tabla, maxFilas: 8 } };
    const ps = paginasLista(e, hoja);
    expect(ps.map((p) => p.filas.length)).toEqual([8, 8, 4, 7]);
    expect(ps.map((p) => p.campos.totVol)).toEqual(["", "", "19.000", "6.650"]);
    expect(ps[2].campos.numero).toBe(ps[0].campos.numero);
    expect(ps[1].filas[0].n).toBe("9");
    expect(ps[0].filas[0]).toMatchObject({ codigo: "T-1", d1: "0.60", d2: "0.50", largo: "4.00", vol: "0.950" });
  });

  it("una guía anotada a mano (sin `gtfDatos`) sale con la identidad de la carátula", () => {
    const sinDatos = entradasDeLaGuia(doc({ gtfDatos: undefined, tituloHabilitante: "TH-9" }), { titularName: "CARATULA SAC" });
    const [p] = paginasGuia(sinDatos, hojaDeFabrica("guia"));
    expect(p.campos["7"]).toBe("CARATULA SAC");
    expect(p.campos["6"]).toBe("TH-9");
  });
});

describe("disposición guardada", () => {
  it("lo inválido o desconocido no entra; lo que falta se completa con la de fábrica", () => {
    const fab = hojaDeFabrica("guia");
    const h = normalizarHoja("guia", {
      plantilla: PLANTILLA_FABRICA,
      anchoMm: 240,
      offsetXMm: 999,
      campos: { "7": { ...fab.campos["7"], x: 30.5 }, inventado: { x: 1 }, "13": { x: "mal" } },
      tabla: { maxFilas: 5, columnas: { "37g": { x: 170, anchoMm: 20, alinea: "der", visible: false } } },
    });
    expect(h.anchoMm).toBe(240);
    expect(h.offsetXMm).toBe(0);
    expect(h.campos["7"].x).toBe(30.5);
    expect(h.campos["13"]).toEqual(fab.campos["13"]);
    expect(h.campos.inventado).toBeUndefined();
    expect(h.tabla.maxFilas).toBe(5);
    expect(h.tabla.columnas["37g"].visible).toBe(false);
    /* Las claves numéricas ("2", "13") van primero en un objeto de JS: se compara el conjunto. */
    expect(Object.keys(h.campos).sort()).toEqual(CATALOGO.guia.campos.map((c) => c.id).sort());
    expect(normalizarDisposicion(null).lista).toEqual(hojaDeFabrica("lista"));
  });

  it("el esquema del PUT rechaza medidas imposibles", () => {
    expect(hojaSchema.safeParse(hojaDeFabrica("lista")).success).toBe(true);
    expect(hojaSchema.safeParse({ ...hojaDeFabrica("lista"), anchoMm: 5 }).success).toBe(false);
    expect(hojaSchema.safeParse({ ...hojaDeFabrica("lista"), offsetYMm: -80 }).success).toBe(false);
  });

  it("un arrastre fuera de la hoja queda dentro de lo que el servidor acepta (si no, el PUT daría 400 y no se podría imprimir)", () => {
    const fab = hojaDeFabrica("guia");
    const x = acotarPos(-120);
    expect(x).toBe(-50);
    const movida = { ...fab, campos: { ...fab.campos, "7": { ...fab.campos["7"], x, y: acotarPos(5000) } } };
    expect(hojaSchema.safeParse(movida).success).toBe(true);
  });

  it("Courier: a 9 pt entran 24 caracteres en 46 mm", () => {
    expect(entraEnUnaLinea("x".repeat(24), 46, 9)).toBe(true);
    expect(entraEnUnaLinea("x".repeat(25), 46, 9)).toBe(false);
  });
});

describe("el papel", () => {
  const e = entradasDeLaGuia(doc(), null);
  const base = hojaDeFabrica("guia");
  const hoja = { ...base, anchoMm: 216, altoMm: 280, offsetXMm: 1.5, offsetYMm: -2 };

  it("@page del talonario con margen 0, sólo valores y el corrimiento sumado", () => {
    const html = htmlTalonario(hoja, CATALOGO.guia, paginasGuia(e, hoja), "GTF");
    expect(html).toContain("@page { size: 216mm 280mm; margin: 0; }");
    expect(html).toContain("Courier New");
    expect(html).not.toContain("(13)");
    const x7 = base.campos["7"].x + 1.5;
    const y7 = base.campos["7"].y - 2;
    expect(html).toContain(`left:${x7}mm;top:${y7}mm`);
    expect(html).toContain("PEREZ MUÑOZ JUAN CARLOS");
  });

  it("lo oculto y lo vacío no salen; las filas bajan de a un alto de fila", () => {
    const [p] = paginasGuia(e, hoja);
    const sinTitular = { ...hoja, campos: { ...hoja.campos, "7": { ...hoja.campos["7"], visible: false } } };
    const cajas = cajasDeLaPagina(sinTitular, CATALOGO.guia, { ...p, campos: { ...p.campos, "38": "" } }).join("");
    expect(cajas).not.toContain(">PEREZ MUÑOZ JUAN CARLOS<");
    expect(cajas).toContain(">JUAN CARLOS PEREZ MUÑOZ<"); // el representante sí
    /* El papel redondea a centésimas de mm (`n()` de gtf-matricial-print). */
    const yFila2 = Math.round((hoja.tabla.y + hoja.tabla.altoFilaMm - 2) * 100) / 100;
    if (p.filas.length > 1) expect(cajas).toContain(`top:${yFila2}mm`);
  });

  it("la prueba trae la cuadrícula, las cruces y el corrimiento usado", () => {
    const html = htmlPruebaTalonario(hoja, CATALOGO.guia, null, "Prueba");
    expect(html).toContain("PRUEBA DE ALINEACIÓN · 216 × 280 mm");
    expect(html).toContain("translate(1.5 -2)");
    expect(html).toContain("@page { size: 216mm 280mm; margin: 0; }");
  });
});

describe("menú ⋯ de la guía", () => {
  const guia = (extra: Partial<Gtf> = {}): Gtf =>
    ({ ...doc(), id: "g1", piezasTotal: 27, ...extra }) as unknown as Gtf;
  const opciones = () => within(screen.getByRole("menu")).getAllByRole("menuitem").map((b) => b.textContent ?? "");
  const nada = () => undefined;

  it("una guía viva ofrece «Imprimir en talonario»; una anulada no", () => {
    render(<AccionesGtf g={guia()} onHoja={nada} onResumen={nada} />);
    fireEvent.click(screen.getByRole("button", { name: /Acciones de la GTF/ }));
    expect(opciones().some((o) => o.includes("Imprimir en talonario"))).toBe(true);
    cleanup();
    render(<AccionesGtf g={guia({ status: "anulada", annulledReason: "x" })} onHoja={nada} onResumen={nada} />);
    fireEvent.click(screen.getByRole("button", { name: /Acciones de la GTF/ }));
    expect(opciones().some((o) => o.includes("Imprimir en talonario"))).toBe(false);
  });
});

