import { describe, it, expect } from "vitest";
import {
  derivarFuentes,
  filasRetrozado,
  retrozadoPorEspecie,
  type IngresoParaFuente,
  type RetrozoParaApartado,
} from "@/lib/forestal/loctp-apartados";

/**
 * Los dos apartados del formato LO-CTP (RDE D000025-2023). El libro los declaraba
 * vacíos aunque el dato existiera: el Apartado 1 salía sin titular ni resolución y
 * el Apartado 2 decía "no registrado en este módulo" con los retrozos guardados
 * (ADR-313). Estos tests fijan lo que cada apartado tiene que decir.
 */

const fichaSerfor = (extra: Record<string, unknown> = {}) => ({
  titular: "COMUNIDAD NATIVA SANTA ROSA",
  numeroTitulo: "16-UCA/P-MAD-2019-004",
  numeroResolucion: "RD N° 549-2023-GRU-DRSAU",
  origenRecurso: "PERMISO",
  departamento: "UCAYALI",
  distrito: "IPARIA",
  campos: { "RUC del titular": "20601234567", "Instancia que Registra": "ARFFS UCAYALI" },
  ...extra,
});

describe("Apartado 1 · fuentes de origen", () => {
  it("numera cada fuente una vez y acumula sus ingresos", () => {
    const ingresos: IngresoParaFuente[] = [
      { id: "a", serforGtf: fichaSerfor(), volumeM3: 10.5 },
      { id: "b", serforGtf: fichaSerfor(), volumeM3: 4.5 },
      {
        id: "c",
        serforGtf: fichaSerfor({ titular: "CONCESION FORESTAL LOS CEDROS", numeroResolucion: "RD N° 88-2024" }),
        volumeM3: 3,
      },
    ];
    const { fuentes, numeroPorIngreso } = derivarFuentes(ingresos);

    expect(fuentes).toHaveLength(2);
    expect(fuentes[0].nro).toBe(1);
    expect(fuentes[0].titular).toBe("COMUNIDAD NATIVA SANTA ROSA");
    expect(fuentes[0].resolucion).toBe("RD N° 549-2023-GRU-DRSAU");
    expect(fuentes[0].codigoTitulo).toBe("16-UCA/P-MAD-2019-004");
    expect(fuentes[0].procedencia).toBe("UCAYALI · IPARIA");
    expect(fuentes[0].ingresos).toBe(2);
    expect(fuentes[0].volumenM3).toBe(15);
    // El N° de la Sección 1 apunta acá: dos guías de la misma fuente = mismo N°.
    expect(numeroPorIngreso.get("a")).toBe(1);
    expect(numeroPorIngreso.get("b")).toBe(1);
    expect(numeroPorIngreso.get("c")).toBe(2);
  });

  it("toma el RUC del titular, nunca el de la ARFFS que registra la guía", () => {
    const { fuentes } = derivarFuentes([
      { id: "a", serforGtf: { ...fichaSerfor(), rucInstancia: "20477936978" }, providerDocument: "10123456789" },
    ]);
    expect(fuentes[0].ruc).toBe("20601234567");
    expect(fuentes[0].ruc).not.toBe("20477936978");
  });

  it("sin ficha de SERFOR se cae al proveedor de la guía", () => {
    const { fuentes } = derivarFuentes([
      { id: "a", providerName: "MADERERA EL ROBLE SAC", providerDocument: "20512345678", originType: "concesion", originRegion: "Pasco" },
    ]);
    expect(fuentes).toHaveLength(1);
    expect(fuentes[0].titular).toBe("MADERERA EL ROBLE SAC");
    expect(fuentes[0].fuente).toBe("Concesión forestal");
    expect(fuentes[0].ruc).toBe("20512345678");
  });

  it("no inventa una fuente cuando nada la identifica", () => {
    const { fuentes, numeroPorIngreso } = derivarFuentes([{ id: "a", volumeM3: 2 }]);
    expect(fuentes).toHaveLength(0);
    expect(numeroPorIngreso.has("a")).toBe(false);
  });
});

const madre = {
  id: "m1",
  codificacion: "52/A",
  volumenM3: 3.268,
  especieComun: "Tornillo",
  especieCientifica: "Cedrelinga catenaeformis",
  originCode: "POA-2024-118",
  gtfNumber: "001-00000025",
};

/**
 * Un corte real de la troza 52/A (73→58 cm, 9.70 m, 3.268 m³ según SERFOR): dos
 * tablones y una punta podrida. Los volúmenes son los de Huber y suman MENOS que
 * la madre — al cortar se pierde en el corte y en el destope (R1 del ADR-313).
 */
const retrozos: RetrozoParaApartado[] = [
  {
    id: "r2", codificacion: "52/A-2", especieComun: "Tornillo", especieCientifica: "Cedrelinga catenaeformis",
    d1Cm: 66, d2Cm: 58, largoM: 4.4, volumenM3: 1.3284, fechaRetrozo: "2026-07-14T00:00:00.000Z", madre,
  },
  {
    id: "r1", codificacion: "52/A-1", especieComun: "Tornillo", especieCientifica: "Cedrelinga catenaeformis",
    d1Cm: 73, d2Cm: 66, largoM: 4.8, volumenM3: 1.8209, fechaRetrozo: "2026-07-14T00:00:00.000Z", madre,
  },
  {
    id: "r3", codificacion: "52/A-3", especieComun: "Tornillo", d1Cm: 58, d2Cm: 55, largoM: 0.2,
    volumenM3: 0.0501, fechaRetrozo: "2026-07-14T00:00:00.000Z", descarte: true, observaciones: "punta podrida", madre,
  },
];

describe("Apartado 2 · retrozado", () => {
  it("arma los 11 casilleros con el diámetro MAYOR primero", () => {
    const filas = filasRetrozado(retrozos);
    expect(filas).toHaveLength(3);
    // Ordenado por fecha y después por código: -1 antes que -2.
    expect(filas.map((f) => f.codigoRetrozado)).toEqual(["52/A-1", "52/A-2", "52/A-3"]);
    expect(filas[0].nro).toBe(1);
    expect(filas[0].fecha).toBe("2026-07-14");
    expect(filas[0].codigoOrigen).toBe("52/A");
    expect(filas[0].volumenInicial).toBe(3.268);
    expect(filas[0].diametroMayorCm).toBe(73);
    expect(filas[0].diametroMenorCm).toBe(66);
    expect(filas[0].longitudM).toBe(4.8);
    expect(filas[0].volumenFinal).toBe(1.8209);
    expect(filas[0].gtf).toBe("001-00000025");
  });

  it("marca el descarte en vez de esconderlo", () => {
    const filas = filasRetrozado(retrozos);
    const descarte = filas.find((f) => f.codigoRetrozado === "52/A-3");
    expect(descarte?.descarte).toBe(true);
    expect(descarte?.observaciones).toBe("punta podrida");
  });

  it("cae al código de origen del ingreso cuando la madre no tiene codificación", () => {
    const [fila] = filasRetrozado([
      { id: "x", codificacion: "s/c-1", madre: { ...madre, codificacion: null } },
    ]);
    expect(fila.codigoOrigen).toBe("POA-2024-118");
  });
});

describe("Cuadro Resumen 1 · casilleros de retrozado", () => {
  it("cuenta la madre UNA vez aunque salgan tres pedazos", () => {
    const [fila] = retrozadoPorEspecie(retrozos);
    expect(fila.especie).toBe("Tornillo");
    // Una sola troza madre cortada: 3.268 m³, no 3.268 × 3.
    expect(fila.retrozado).toEqual({ volumen: 3.268, piezas: 1 });
    expect(fila.deRetrozado.piezas).toBe(3);
    expect(fila.deRetrozado.volumen).toBeCloseTo(3.1994, 3);
    expect(fila.descartado).toBeCloseTo(0.0501, 4);
  });

  it("los pedazos nunca suman más que la madre (R1 del ADR-313)", () => {
    const [fila] = retrozadoPorEspecie(retrozos);
    expect(fila.deRetrozado.volumen).toBeLessThanOrEqual(fila.retrozado.volumen);
  });
});
