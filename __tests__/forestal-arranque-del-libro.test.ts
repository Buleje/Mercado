/**
 * El primer día de un CTP nuevo.
 *
 * Lo que se prueba es el ORDEN: los pasos dependen entre sí y sólo uno puede
 * ser el siguiente. Un libro que marca tres cosas como urgentes a la vez no
 * está guiando a nadie.
 */

import { describe, expect, it } from "vitest";
import {
  avanceDeArranque,
  hayQueGuiar,
  libroReciénAbierto,
  pasosDeArranque,
  type EstadoDelLibro,
} from "@/lib/forestal/arranque-del-libro";
import { emptyCtpFicha, type CtpFicha } from "@/lib/forestal/ctp-ficha-types";

const VACIO: EstadoDelLibro = {
  ficha: null,
  especies: 0,
  ingresos: 0,
  lotes: 0,
  corridas: 0,
  despachos: 0,
};

/** Una ficha con todo lo que `ctpFichaFaltantes` exige. */
function fichaCompleta(): CtpFicha {
  const f = emptyCtpFicha();
  return {
    ...f,
    nombreCtp: "Maderera Blas",
    codigoCtp: "CTP-19-001",
    ruc: "20512345678",
    razonSocial: "Inversiones Agroforestales BLAS S.A.C.",
    arffs: "GORE Ucayali · DRSAFFS",
    registroArffs: "R-001-2026",
    registroArffsFecha: "2026-01-15",
    representante: "Luis Brandon",
    representanteDni: "70123456",
    direccion: "Carretera Federico Basadre km 12",
    region: "Ucayali",
    provincia: "Coronel Portillo",
    distrito: "Calleria",
    ubigeo: "250101",
    telefono: "961234567",
    email: "maderera@blas.pe",
    gtfSerie: "019-001",
  };
}

describe("libroReciénAbierto", () => {
  it("un libro sin movimiento está recién abierto, aunque tenga ficha", () => {
    /* La Ficha se llena ANTES de que entre la primera troza: tenerla no
       significa que el centro ya opere. */
    expect(libroReciénAbierto({ ...VACIO, ficha: fichaCompleta() })).toBe(true);
  });

  it("con una sola guía cargada ya no lo está", () => {
    expect(libroReciénAbierto({ ...VACIO, ingresos: 1 })).toBe(false);
  });
});

describe("pasosDeArranque — el orden es el producto", () => {
  it("con el libro vacío, el único «ahora» es la Ficha", () => {
    const pasos = pasosDeArranque(VACIO);
    const ahora = pasos.filter((p) => p.estado === "ahora");
    expect(ahora).toHaveLength(1);
    expect(ahora[0]!.clave).toBe("ficha");
    /* Y dice qué falta, no sólo que falta. */
    expect(ahora[0]!.detalle).toContain("ninguna ficha");
  });

  it("nunca hay dos pasos «ahora» a la vez", () => {
    /* Marcar tres cosas como urgentes es no marcar ninguna. */
    for (const e of [
      VACIO,
      { ...VACIO, ficha: fichaCompleta() },
      { ...VACIO, ficha: fichaCompleta(), especies: 4 },
      { ...VACIO, ficha: fichaCompleta(), especies: 4, ingresos: 2 },
      { ...VACIO, ficha: fichaCompleta(), especies: 4, ingresos: 2, lotes: 1 },
    ]) {
      expect(pasosDeArranque(e).filter((p) => p.estado === "ahora")).toHaveLength(1);
    }
  });

  it("el camino avanza al completarse cada paso", () => {
    const siguiente = (e: EstadoDelLibro) => pasosDeArranque(e).find((p) => p.estado === "ahora")!.clave;
    const f = fichaCompleta();
    expect(siguiente({ ...VACIO, ficha: f })).toBe("especies");
    expect(siguiente({ ...VACIO, ficha: f, especies: 4 })).toBe("ingreso");
    expect(siguiente({ ...VACIO, ficha: f, especies: 4, ingresos: 2 })).toBe("lote");
    expect(siguiente({ ...VACIO, ficha: f, especies: 4, ingresos: 2, lotes: 1 })).toBe("produccion");
    expect(siguiente({ ...VACIO, ficha: f, especies: 4, ingresos: 2, lotes: 1, corridas: 1 })).toBe("despacho");
  });

  it("una ficha a medias NO cuenta como hecha", () => {
    /* `ctpFichaFaltantes` es quien decide qué es «mínimo», y son cuatro campos
       de identidad legal (`CTP_FICHA_REQUIRED`): sin el código de CTP el paso
       sigue abierto por más que el resto esté cargado. La serie del talonario
       NO está en esa lista — se pide más adelante, en el paso de despacho. */
    const aMedias = { ...fichaCompleta(), codigoCtp: "" };
    const pasos = pasosDeArranque({ ...VACIO, ficha: aMedias, especies: 4 });
    const ficha = pasos.find((p) => p.clave === "ficha")!;
    expect(ficha.estado).toBe("ahora");
    expect(ficha.detalle).toContain("Faltan");
  });

  it("el histórico del SNIFFS queda siempre opcional", () => {
    /* Que haya ingresos no dice si vinieron del SNIFFS o se cargaron a mano:
       darlo por hecho sería afirmar algo que no se sabe. */
    const pasos = pasosDeArranque({ ...VACIO, ficha: fichaCompleta(), ingresos: 9 });
    expect(pasos.find((p) => p.clave === "historico")!.estado).toBe("opcional");
  });
});

describe("avance y cuándo dejar de guiar", () => {
  it("el opcional no cuenta en el avance", () => {
    const { total } = avanceDeArranque(pasosDeArranque(VACIO));
    expect(total).toBe(6);
  });

  it("cuando el libro dio la vuelta completa, la guía se apaga", () => {
    /* De la guía de ingreso a la de salida: ahí el centro ya sabe operar y los
       primeros pasos sólo estorban. */
    const lleno: EstadoDelLibro = {
      ficha: fichaCompleta(),
      especies: 12,
      ingresos: 24,
      lotes: 5,
      corridas: 9,
      despachos: 3,
    };
    const pasos = pasosDeArranque(lleno);
    expect(avanceDeArranque(pasos)).toEqual({ hechos: 6, total: 6 });
    expect(hayQueGuiar(pasos, lleno)).toBe(false);
    expect(pasos.some((p) => p.estado === "ahora")).toBe(false);
  });

  it("a un centro que YA opera no se le muestran primeros pasos", () => {
    /* El caso real que lo destapó: el aserradero tiene 24 ingresos, 5 lotes y
       14 corridas… y cero guías de salida emitidas desde el libro. Con la regla
       ingenua le aparecía un cartel de PRIMEROS PASOS a quien opera hace meses.
       Lo que le falte a partir de ahí es un pendiente normal, no una lección. */
    const yaOpera: EstadoDelLibro = {
      ficha: fichaCompleta(),
      especies: 12,
      ingresos: 24,
      lotes: 5,
      corridas: 14,
      despachos: 0,
    };
    expect(hayQueGuiar(pasosDeArranque(yaOpera), yaOpera)).toBe(false);
  });

  it("pero a uno a medio camino sí", () => {
    /* Recibió madera y armó un lote, pero todavía no declaró ninguna corrida:
       no dio la vuelta, así que la guía sigue sirviendo. */
    const aMedias: EstadoDelLibro = {
      ficha: fichaCompleta(),
      especies: 12,
      ingresos: 24,
      lotes: 5,
      corridas: 0,
      despachos: 0,
    };
    expect(hayQueGuiar(pasosDeArranque(aMedias), aMedias)).toBe(true);
  });
});
