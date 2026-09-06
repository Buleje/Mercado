import { describe, expect, it } from "vitest";
import { armarReporte, causaDe, reporteACsv, tituloDelReporte } from "@/lib/forestal/ctp-reporte-import";
import type { FormatoCtp } from "@/lib/forestal/ctp-formatos-serfor";

const sec = (formato: FormatoCtp, filas: { fila?: number; codigo: string; accion: string; mensaje: string }[]) => ({
  formato,
  respuesta: {
    resumen: {
      creados: filas.filter((f) => f.accion === "creado").length,
      porCrear: 0,
      existen: filas.filter((f) => f.accion === "existe").length,
      errores: filas.filter((f) => f.accion === "error").length,
    },
    filas,
  },
});

describe("causaDe · agrupar por causa, no por fila", () => {
  it("dos filas con el mismo problema y distinto código son UNA causa", () => {
    // Sin esto, 40 filas rotas por lo mismo daban 40 líneas y el operador no
    // veía que era un solo error repetido.
    expect(causaDe("GTF de ingreso no encontrado: 019-0000004")).toBe(
      causaDe("GTF de ingreso no encontrado: 019-0000007"),
    );
  });

  it("los volúmenes tampoco separan causas", () => {
    expect(causaDe("Volumen 3.010 fuera de rango")).toBe(causaDe("Volumen 12.500 fuera de rango"));
  });

  it("problemas distintos siguen siendo distintos", () => {
    expect(causaDe("Sin especie")).not.toBe(causaDe("Sin N° de GTF"));
  });
});

describe("armarReporte", () => {
  it("agrupa las filas rotas por causa y las ordena por cuántas afecta", () => {
    const r = armarReporte([
      sec("ingresos", [
        { fila: 7, codigo: "A", accion: "error", mensaje: "Sin especie" },
        { fila: 8, codigo: "B", accion: "error", mensaje: "GTF de ingreso no encontrado: 019-1" },
        { fila: 9, codigo: "C", accion: "error", mensaje: "GTF de ingreso no encontrado: 019-2" },
      ]),
    ]);
    expect(r.problemas).toHaveLength(2);
    // El que afecta más filas va primero: un arreglo cierra dos.
    expect(r.problemas[0].filas).toEqual([8, 9]);
    expect(r.problemas[1].filas).toEqual([7]);
    expect(r.totalConError).toBe(3);
  });

  it("cada problema conocido trae qué hacer", () => {
    const r = armarReporte([sec("consumos", [{ fila: 7, codigo: "X", accion: "error", mensaje: "Ese código no existe en el libro: cargá primero el ingreso." }])]);
    expect(r.problemas[0].comoArreglar).toContain("Sección 1");
  });

  it("un problema desconocido NO inventa consejo", () => {
    // Un consejo inventado manda al operador a tocar lo que no es.
    const r = armarReporte([sec("ingresos", [{ fila: 7, codigo: "X", accion: "error", mensaje: "Falló algo rarísimo" }])]);
    expect(r.problemas[0].comoArreglar).toBe("");
  });

  it("lo que ya estaba no cuenta como error", () => {
    const r = armarReporte([sec("ingresos", [{ fila: 7, codigo: "A", accion: "existe", mensaje: "Ya está" }])]);
    expect(r.totalExistentes).toBe(1);
    expect(r.totalConError).toBe(0);
  });

  it("«limpio» sólo si no hay NADA que revisar", () => {
    const ok = armarReporte([sec("ingresos", [{ fila: 7, codigo: "A", accion: "creado", mensaje: "ok" }])]);
    expect(ok.limpio).toBe(true);
    // Un aviso de cadena sin errores igual pide revisión.
    const conAviso = armarReporte([sec("ingresos", [{ fila: 7, codigo: "A", accion: "creado", mensaje: "ok" }])], {
      avisosDeCadena: [{ lote: "001", nivel: "aviso", mensaje: "Rendimiento 12%" }],
    });
    expect(conAviso.limpio).toBe(false);
  });

  it("un import vacío no rompe", () => {
    expect(armarReporte([])).toMatchObject({ totalCreados: 0, problemas: [], limpio: true });
  });
});

describe("tituloDelReporte", () => {
  it("dice lo que pasó en una línea", () => {
    const r = armarReporte([
      sec("ingresos", [
        { fila: 7, codigo: "A", accion: "creado", mensaje: "ok" },
        { fila: 8, codigo: "B", accion: "error", mensaje: "Sin especie" },
      ]),
    ]);
    expect(tituloDelReporte(r)).toContain("1 filas importadas");
    expect(tituloDelReporte(r)).toContain("1 quedaron afuera");
  });

  it("no dice «0 importadas» cuando todo ya estaba", () => {
    const r = armarReporte([sec("ingresos", [{ fila: 7, codigo: "A", accion: "existe", mensaje: "Ya está" }])]);
    expect(tituloDelReporte(r)).toBe("Todo esto ya estaba en el libro");
  });
});

describe("reporteACsv", () => {
  it("lleva BOM y separador «;»: el Excel es-PE usa la coma como decimal", () => {
    const csv = reporteACsv(armarReporte([sec("ingresos", [{ fila: 7, codigo: "A", accion: "creado", mensaje: "ok" }])]));
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(";");
  });

  it("entrecomilla lo que lleva punto y coma adentro", () => {
    const csv = reporteACsv(
      armarReporte([sec("ingresos", [{ fila: 7, codigo: "A", accion: "error", mensaje: "falla; con separador" }])]),
    );
    expect(csv).toContain('"falla; con separador"');
  });

  it("incluye las filas incompletas y los avisos de la cadena", () => {
    const csv = reporteACsv(
      armarReporte([], {
        incompletas: [{ formato: "consumos", fila: 12, motivos: ["Falta Cantidad"] }],
        avisosDeCadena: [{ lote: "001", nivel: "error", mensaje: "Despacha sin producir" }],
      }),
    );
    expect(csv).toContain("Falta Cantidad");
    expect(csv).toContain("Despacha sin producir");
  });
});
