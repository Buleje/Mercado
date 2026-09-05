/**
 * Los DOS inventarios del SNIFFS entran troza por troza y paquete por paquete.
 *
 * Los dos bugs que esto blinda, los dos vistos con el archivo real:
 *  · la rolliza en patio llegaba agrupada por guía y sus piezas se perdían
 *    (el cuerpo las traía y el endpoint no las declaraba: Zod las borraba);
 *  · dos paquetes de aserrada iguales —misma especie, mismo volumen, que es lo
 *    NORMAL en un depósito— compartían clave de deduplicación y el segundo se
 *    descartaba como «duplicado en el archivo».
 */
import { describe, expect, it } from "vitest";
import { aCuerpoDelLibro } from "@/lib/forestal/ctp-serfor-a-libro";
import { convencionDeColumna, detectarColumnas, leerNumero, parsearFilas } from "@/lib/forestal/ctp-formatos-serfor";
import { produccionKey } from "@/lib/db/forest-ctp.db";
import type { FilaParseada } from "@/lib/forestal/ctp-formatos-serfor";

const fila = (n: number, datos: Record<string, string | number | null>): FilaParseada => ({
  fila: n,
  datos,
  problemas: [],
});

/** Una troza del inventario de patio, como la escribe el SNIFFS. */
const troza = (n: number, codigo: string, gtf: string, vol: number, extra: Record<string, string | number | null> = {}) =>
  fila(n, {
    numeroDocumento: gtf,
    codigoPlanta: codigo,
    especie: "Cedrelinga cateniformis / Tornillo",
    d1Cm: 60,
    d2Cm: 58,
    largoM: 8.5,
    volumenM3: vol,
    tipoProducto: "MADERA EN ROLLO",
    estado: "En Stock",
    ...extra,
  });

/** Un paquete del inventario de aserrada. */
const paquete = (n: number, cod: string | null, lote: string | null, vol: number) =>
  fila(n, {
    especie: "Cedrelinga cateniformis / Tornillo",
    tipoProducto: "MADERA ASERRADA",
    lote,
    paquete: cod,
    dimensiones: "2 X 8 X 10",
    cantidad: 40,
    volumenM3: vol,
    volumenPt: 533.33,
  });

describe("inventario de rolliza en patio · troza por troza", () => {
  it("las trozas de una misma guía van como PIEZAS de ese ingreso, no se descartan", () => {
    const filas = [
      troza(2, "3012264", "GTF-0231", 2.5),
      troza(3, "3012265", "GTF-0231", 2.1),
      troza(4, "3012266", "GTF-0231", 1.9),
    ];
    const cuerpo = aCuerpoDelLibro("inventarioTrozas", filas) as Record<string, unknown>[];

    expect(cuerpo).toHaveLength(1); // un ingreso: la guía
    const trozas = cuerpo[0].trozas as Record<string, unknown>[];
    expect(trozas).toHaveLength(3); // …con sus TRES piezas
    expect(trozas.map((t) => t.codificacion)).toEqual(["3012264", "3012265", "3012266"]);
    // El volumen de la guía es la suma de sus piezas, no el de la primera.
    expect(cuerpo[0].volumeM3).toBeCloseTo(6.5, 4);
  });

  it("cada troza conserva sus medidas: sin d1/d2/largo no se puede cubicar de vuelta", () => {
    const cuerpo = aCuerpoDelLibro("inventarioTrozas", [troza(2, "3012264", "GTF-0231", 2.5)]) as Record<string, unknown>[];
    const t = (cuerpo[0].trozas as Record<string, unknown>[])[0];
    expect(t).toMatchObject({ d1Cm: 60, d2Cm: 58, largoM: 8.5, volumenM3: 2.5, cantidad: 1 });
    expect(t.dimensiones).toBe("60 X 58 X 8.5");
    expect(t.especieComun).toBe("Tornillo");
    expect(t.especieCientifica).toBe("Cedrelinga cateniformis");
  });

  it("las trozas sin guía de UNA MISMA importación van a una sola guía tipo inventario", () => {
    // Pedido de Brandon (2026-08-31): un patio de cien piezas sin GTF real es
    // UNA foto tomada una vez, no cien guías sueltas.
    const cuerpo = aCuerpoDelLibro("inventarioTrozas", [
      troza(2, "A-1", "", 1),
      troza(3, "A-2", "", 1),
    ]) as Record<string, unknown>[];
    expect(cuerpo).toHaveLength(1);
    expect((cuerpo[0].trozas as unknown[])).toHaveLength(2);
    expect(cuerpo[0].volumeM3).toBeCloseTo(2, 4);
  });

  it("dos importaciones distintas (dos llamadas) NO comparten guía", () => {
    const primera = aCuerpoDelLibro("inventarioTrozas", [troza(2, "A-1", "", 1)]) as Record<string, unknown>[];
    const segunda = aCuerpoDelLibro("inventarioTrozas", [troza(2, "A-2", "", 1)]) as Record<string, unknown>[];
    expect(primera[0].gtfNumber).not.toBe(segunda[0].gtfNumber);
  });

  it("la que ya se consumió no vuelve a entrar como existencia", () => {
    const cuerpo = aCuerpoDelLibro("inventarioTrozas", [
      troza(2, "3012264", "GTF-0231", 2.5),
      troza(3, "3012265", "GTF-0231", 2.1, { estado: "Consumida" }),
    ]) as Record<string, unknown>[];
    expect((cuerpo[0].trozas as unknown[])).toHaveLength(1);
    expect(cuerpo[0].volumeM3).toBeCloseTo(2.5, 4);
  });
});

describe("inventario de aserrada · paquete por paquete", () => {
  it("dos paquetes IGUALES de distinto código son dos registros, no uno", () => {
    const cuerpo = aCuerpoDelLibro("inventarioAserrada", [
      paquete(2, "PQ-001", "L-01", 0.944),
      paquete(3, "PQ-002", "L-01", 0.944),
    ]) as Record<string, unknown>[];

    expect(cuerpo).toHaveLength(2);
    // Lo que los distingue tiene que llegar al endpoint, no quedarse en la nota.
    expect(cuerpo.map((c) => c.codigoProducto)).toEqual(["PQ-001", "PQ-002"]);

    /* La prueba de fuego: la clave de deduplicación del importador. Con la clave
       vieja —fecha|producto|especie|cantidad— estas dos filas eran la misma. */
    const clave = (c: Record<string, unknown>) =>
      produccionKey(
        (c.entryDate as string) ?? "",
        c.productType as string,
        c.speciesCommon as string,
        c.quantity,
        c.codigoProducto as string | null,
        c.materiaPrimaRef as string | null,
      );
    expect(clave(cuerpo[0])).not.toBe(clave(cuerpo[1]));
  });

  it("guarda el lote, el paquete y las piezas — no sólo el volumen", () => {
    const cuerpo = aCuerpoDelLibro("inventarioAserrada", [paquete(2, "PQ-001", "L-01", 0.944)]) as Record<string, unknown>[];
    expect(cuerpo[0]).toMatchObject({
      codigoProducto: "PQ-001",
      materiaPrimaRef: "L-01",
      pieces: 40,
      quantity: 0.944,
      speciesCommon: "Tornillo",
    });
    expect(String(cuerpo[0].notes)).toContain("2 X 8 X 10");
  });

  it("«-» y «S/L» son cómo el formato escribe «no tiene»: no se guardan como código", () => {
    const cuerpo = aCuerpoDelLibro("inventarioAserrada", [paquete(2, "-", "S/L", 1)]) as Record<string, unknown>[];
    expect(cuerpo[0].codigoProducto).toBeNull();
    expect(cuerpo[0].materiaPrimaRef).toBeNull();
  });

  it("la clave sigue siendo idempotente: el MISMO paquete dos veces es uno solo", () => {
    const [a, b] = aCuerpoDelLibro("inventarioAserrada", [
      paquete(2, "PQ-001", "L-01", 0.944),
      paquete(9, "PQ-001", "L-01", 0.944),
    ]) as Record<string, unknown>[];
    const clave = (c: Record<string, unknown>) =>
      produccionKey((c.entryDate as string) ?? "", c.productType as string, c.speciesCommon as string, c.quantity, c.codigoProducto as string | null, c.materiaPrimaRef as string | null);
    expect(clave(a)).toBe(clave(b));
  });
});

describe("⭐ la coma decimal del archivo real", () => {
  /* El inventario del SNIFFS se baja como tabla HTML y sus números llegan en
     TEXTO con coma: «2,762 m³». Leídos como miles, esa troza entraba al patio
     con 2762 m³ — mil veces la madera que existe. */
  const CABECERAS = ["Contrato", "Numero Resolucion", "Documento de Ingreso", "N° GTF", "Troza Padre", "Codigo Troza", "Codigo Planta", "Especie", "D1(cm)", "D2(cm)", "Largo(m)", "Volumen", "Tipo de Producto", "Estado Actual", "Fecha del Estado", "Acciones"];
  const CRUDAS = [
    ["19-SEC/PER", "R.A N° D0001", "GTF", "019-0000010", "29/A (000005)", "29/A", "3037752", "Dipteryx micrantha / Shihuahuaco", "112", "101", "3,1", "2,762", "MADERA EN ROLLO", "En Stock", "05/02/2024", "Editar"],
    ["19-SEC/REG", "19-SEC/REG", "GTF", "019-001-0000008", "-", "-", "11682810", "Cedrelinga cateniformis / Tornillo", "29", "28", "2,73", "0,174", "MADERA EN ROLLO", "En Stock", "05/02/2026", "Editar"],
    ["19-SEC/PER", "R.A N° D0004", "GTF", "019-0000043", "35/C (00002)", "35/C", "3728275", "Iryanthera laevis / Cumala", "54", "53", "3,2", "0,719", "MADERA EN ROLLO", "En Stock", "08/02/2024", "Editar"],
  ];

  it("el volumen entra como 2,762 m³ y no como 2762", () => {
    const mapeo = detectarColumnas("inventarioTrozas", CABECERAS);
    const filas = parsearFilas("inventarioTrozas", mapeo, CRUDAS, 2);
    expect(filas.map((f) => f.datos.volumenM3)).toEqual([2.762, 0.174, 0.719]);
    expect(filas.map((f) => f.datos.largoM)).toEqual([3.1, 2.73, 3.2]);
    expect(filas.every((f) => f.problemas.length === 0)).toBe(true);
  });

  it("la convención se decide por COLUMNA, con todas las filas a la vista", () => {
    // La columna de volumen trae «0,719»: nadie escribe un millar con cero adelante.
    expect(convencionDeColumna(CRUDAS, 11)).toBe("coma-decimal");
    // Sin evidencia, «1,234» se sigue leyendo como millar (pie tablar, por ejemplo).
    expect(convencionDeColumna([["1,234"], ["12,000"]], 0)).toBe("auto");
    expect(leerNumero("1,234")).toBe(1234);
    expect(leerNumero("1,234", "coma-decimal")).toBe(1.234);
  });

  it("los DOS códigos se guardan por separado y el «-» no es un código", () => {
    const mapeo = detectarColumnas("inventarioTrozas", CABECERAS);
    const filas = parsearFilas("inventarioTrozas", mapeo, CRUDAS, 2);
    const cuerpo = aCuerpoDelLibro("inventarioTrozas", filas) as Record<string, unknown>[];
    const trozas = cuerpo.flatMap((c) => c.trozas as Record<string, unknown>[]);

    expect(trozas[0]).toMatchObject({ codificacion: "29/A", codigoPlanta: "3037752" });
    // La del guión se identifica por su código de planta, no por un «-».
    expect(trozas[1]).toMatchObject({ codificacion: "11682810", codigoPlanta: "11682810" });
    // Y el diámetro que se muestra es el promedio de los dos extremos.
    expect(trozas[0].diametroCm).toBeCloseTo(106.5, 2);
    expect(trozas[0].d1Cm).toBe(112);
    expect(trozas[0].d2Cm).toBe(101);
    expect(trozas[0].largoM).toBe(3.1);
  });

  it("21 trozas de la misma guía son 21 piezas de UN ingreso, con su volumen sumado", () => {
    const mapeo = detectarColumnas("inventarioTrozas", CABECERAS);
    const muchas = Array.from({ length: 21 }, (_, i) => [
      "19-SEC/REG", "19-SEC/REG", "GTF", "019-001-0000008", "-", "-", `116828${10 + i}`,
      "Cedrelinga cateniformis / Tornillo", "29", "28", "2,73", "0,174", "MADERA EN ROLLO", "En Stock", "05/02/2026", "Editar",
    ]);
    const cuerpo = aCuerpoDelLibro("inventarioTrozas", parsearFilas("inventarioTrozas", mapeo, muchas, 2)) as Record<string, unknown>[];
    expect(cuerpo).toHaveLength(1);
    expect(cuerpo[0].trozas).toHaveLength(21);
    expect(cuerpo[0].volumeM3).toBeCloseTo(21 * 0.174, 4);
  });
});
