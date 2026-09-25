/**
 * El CSV de «Productos disponibles» (Libro CTP).
 *
 * El operador abre este archivo en el MISMO Excel que los de Ingresos, Saldos y
 * Despacho: separador `;`, coma decimal y decimales sin comillas, o las
 * columnas caen todas en la A y los números entran como texto.
 *
 * Lo demás que se prueba es semántica de datos: que un `null` salga vacío (no
 * «0», que se suma), que el CSV exporte las columnas que el usuario tiene
 * prendidas en la tabla, y que el total en soles se OMITA si alguna fila no se
 * pudo valorizar.
 */
import { describe, expect, it } from "vitest";
import {
  disponiblesACsv,
  nombreArchivoDisponibles,
  type FilaDisponibleCsv,
} from "@/lib/forestal/disponibles-csv";

const f = (over: Partial<FilaDisponibleCsv> = {}): FilaDisponibleCsv => ({
  codigo: "P-001",
  producto: "Madera aserrada",
  especie: "Tornillo",
  presentacion: "Paquete",
  espesorCm: 2.5,
  anchoCm: 20,
  largoM: 3.2,
  piezas: 40,
  volumenM3: 3.814,
  pieTablar: 1617.14,
  corrida: "C-12",
  lote: "L-3",
  permiso: "AUT-001",
  gtf: "GTF-0001",
  saldoCorridaM3: 12.5,
  diasParado: 331,
  valorSoles: 2288.4,
  apartadoPara: null,
  estado: "Disponible",
  ...over,
});

const lineas = (csv: string) => csv.split("\r\n");

describe("disponiblesACsv · el formato del libro, igual que los otros tres", () => {
  it("separa con `;` y trae la unidad en el encabezado", () => {
    expect(lineas(disponiblesACsv([f()]))[0]).toBe(
      "Código;Producto;Especie;Presentación;Espesor (cm);Ancho (cm);Largo (m);Piezas;Volumen (m³);Pie tablar;Corrida;Lote;Permiso;GTF;Saldo corrida (m³);Parado (días);Valor (S/);Apartado para;Estado",
    );
  });

  it("los decimales van con COMA y SIN comillas", () => {
    // Con punto Excel es-PE los lee como texto; entrecomillados, también.
    const fila = lineas(disponiblesACsv([f()]))[1];
    expect(fila).toContain(";3,8140;");
    expect(fila).toContain(";2288,40;");
    expect(fila).not.toContain('"3,8140"');
    expect(fila).not.toContain("3.814");
  });

  it("la fila sale completa y en el orden de la tabla", () => {
    expect(lineas(disponiblesACsv([f()]))[1]).toBe(
      "P-001;Madera aserrada;Tornillo;Paquete;2,50;20,00;3,20;40;3,8140;1617,14;C-12;L-3;AUT-001;GTF-0001;12,5000;331;2288,40;;Disponible",
    );
  });

  it("separa las líneas con CRLF, como el resto del libro", () => {
    expect(disponiblesACsv([f()])).toContain("\r\n");
  });
});

describe("disponiblesACsv · un null sale VACÍO", () => {
  it("nunca «0» ni «null»: una celda vacía se lee como «no se sabe»", () => {
    const csv = disponiblesACsv([
      f({ piezas: null, pieTablar: null, diasParado: null, apartadoPara: null, largoM: null }),
    ]);
    const fila = lineas(csv)[1];
    expect(fila).toBe(
      "P-001;Madera aserrada;Tornillo;Paquete;2,50;20,00;;;3,8140;;C-12;L-3;AUT-001;GTF-0001;12,5000;;2288,40;;Disponible",
    );
    expect(fila).not.toContain("null");
  });

  it("un CERO real sí se escribe: 0 piezas es un dato, no un faltante", () => {
    expect(lineas(disponiblesACsv([f({ piezas: 0, volumenM3: 0 })]))[1]).toContain(";0;0,0000;");
  });
});

describe("disponiblesACsv · exporta lo que el usuario está viendo", () => {
  it("respeta el SUBCONJUNTO y el ORDEN de `opts.columnas`", () => {
    // La tabla deja prender y apagar columnas; el CSV no puede traer otras.
    const csv = disponiblesACsv([f()], { columnas: ["estado", "volumenM3", "codigo"] });
    expect(lineas(csv)[0]).toBe("Estado;Volumen (m³);Código");
    expect(lineas(csv)[1]).toBe("Disponible;3,8140;P-001");
    expect(lineas(csv)[1]).not.toContain("Tornillo");
  });

  it("la etiqueta del total no pisa un número cuando la 1ª columna se suma", () => {
    const csv = disponiblesACsv([f()], { columnas: ["volumenM3", "estado"] });
    expect(lineas(csv).at(-1)).toBe("3,8140;TOTAL (1 fila)");
  });

  it("sin `opts` van todas las columnas; con una lista vacía, también", () => {
    // Un archivo de cero columnas no es un archivo, es un bug silencioso.
    expect(disponiblesACsv([f()], { columnas: [] })).toBe(disponiblesACsv([f()]));
  });
});

describe("disponiblesACsv · el pie de totales", () => {
  it("suma volumen, pie tablar y valor — y NO el saldo de la corrida", () => {
    // `saldoCorridaM3` es el saldo de la corrida repetido en cada fila suya:
    // sumarlo cuenta la misma madera una vez por producto.
    const csv = disponiblesACsv([f(), f({ codigo: "P-002", volumenM3: 1.186, pieTablar: 502.86, valorSoles: 711.6 })]);
    expect(lineas(csv).at(-1)).toBe(
      "TOTAL (2 filas);;;;;;;;5,0000;2120,00;;;;;;;3000,00;;",
    );
  });

  it("si alguna fila no se pudo valorizar, el total en soles queda VACÍO", () => {
    // Un total parcial de plata se copia a una planilla de gestión como si
    // fuera el total del patio.
    const csv = disponiblesACsv([f(), f({ codigo: "P-002", valorSoles: null })]);
    const pie = lineas(csv).at(-2) as string;
    expect(pie.startsWith("TOTAL (2 filas)")).toBe(true);
    expect(pie.endsWith(";;;;;;;;;")).toBe(true); // valor vacío en su columna
    expect(pie).not.toContain("2288,40");
  });

  it("y lo AVISA en una fila, con cuántas faltan", () => {
    const csv = disponiblesACsv([f(), f({ codigo: "P-002", valorSoles: null })]);
    expect(lineas(csv).at(-1)).toContain("1 de 2 filas sin costo cargado");
    expect(lineas(csv).at(-1)).toContain("el total en soles se deja vacío a propósito");
  });

  it("sin la columna de valor exportada, no hay aviso que dar", () => {
    const csv = disponiblesACsv([f({ valorSoles: null })], { columnas: ["codigo", "volumenM3"] });
    expect(csv).not.toContain("sin costo cargado");
    expect(lineas(csv).at(-1)).toBe("TOTAL (1 fila);3,8140");
  });

  it("el pie tablar SÍ suma lo que hay: faltar ahí es «no aplica», no «no se sabe»", () => {
    // Una rolliza no se mide en pie tablar; una guía sin costo sí se va a costear.
    const csv = disponiblesACsv([f(), f({ codigo: "P-002", pieTablar: null, volumenM3: 1 })]);
    expect(lineas(csv).at(-1)).toContain(";1617,14;");
  });

  it("una tabla vacía igual trae su pie, sin inventar un total en soles", () => {
    const pie = lineas(disponiblesACsv([])).at(-1) as string;
    expect(pie.startsWith("TOTAL (0 filas);")).toBe(true);
    expect(pie).toContain(";0,0000;");
  });
});

describe("nombreArchivoDisponibles", () => {
  it("lleva el día de la descarga, no el período: esta pestaña no tiene período", () => {
    expect(nombreArchivoDisponibles(new Date("2026-09-15T18:00:00Z"))).toBe(
      "productos-disponibles-2026-09-15.csv",
    );
  });

  it("cuenta en calendario Lima: bajarlo a las 20:00 de Pucallpa no lo nombra con mañana", () => {
    /* 2026-09-16T01:00Z = 15 de setiembre, 20:00 en Lima. */
    expect(nombreArchivoDisponibles(new Date("2026-09-16T01:00:00Z"))).toBe(
      "productos-disponibles-2026-09-15.csv",
    );
  });

  it("una fecha rota no deja un nombre colgado", () => {
    expect(nombreArchivoDisponibles(new Date("no es una fecha"))).toMatch(
      /^productos-disponibles-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });
});
