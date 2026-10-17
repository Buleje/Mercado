import { describe, expect, it } from "vitest";
import { nombreArchivoSaldos, saldosACsv } from "@/lib/forestal/ctp-saldos-csv";

const ESPECIES = [
  {
    especie: "Tornillo",
    scientific: "Cedrelinga cateniformis",
    cites: false,
    ingresoM3: 47.45,
    pendienteM3: 16.7795,
    consumidoM3: 13.5842,
    saldoM3: 33.8658,
    ingresosCount: 7,
  },
  {
    especie: "Shihuahuaco",
    scientific: "Dipteryx micrantha",
    cites: true,
    ingresoM3: 5.2,
    pendienteM3: 8.3867,
    consumidoM3: 4.7732,
    saldoM3: 0.4268,
    ingresosCount: 1,
  },
];

const PRODUCTOS = [
  { producto: "Madera aserrada · Tornillo", producido: 9.1778, despachado: 7.7867, stock: 1.3911 },
  { producto: "Madera aserrada · Shihuahuaco", producido: 2.4821, despachado: 0, stock: 2.4821 },
];

const csv = () => saldosACsv(ESPECIES, PRODUCTOS, "junio de 2026");

describe("saldosACsv · el archivo que el contador abre en Excel", () => {
  it("los decimales van con coma y SIN comillas", () => {
    // Con punto, Excel es-PE lo lee como texto y no suma; entrecomillado,
    // tampoco. Es el mismo criterio que `ctp-ingresos-csv`.
    const linea = csv().split("\r\n").find((l) => l.startsWith("Tornillo"));
    expect(linea).toContain(";47,4500;");
    expect(linea).not.toContain('"47');
  });

  it("separa con `;` — con coma, Excel es-PE mete todo en la columna A", () => {
    const cabecera = csv().split("\r\n").find((l) => l.startsWith("Especie;"));
    expect(cabecera).toBe("Especie;Nombre cientifico;CITES;Guias;Ingresado (m3);Sin validar (m3);Consumido (m3);Saldo (m3);Usado (%)");
  });

  it("totaliza materia prima y producto por separado", () => {
    // Sumar m³ de troza con unidades de producto en la misma fila daría un
    // número con aspecto de verdad: son dos bloques, con dos totales.
    const lineas = csv().split("\r\n").filter((l) => l.startsWith("TOTAL"));
    expect(lineas).toHaveLength(2);
    // 47.45 + 5.2 = 52.65 de ingreso; 33.8658 + 0.4268 = 34.2926 de saldo.
    expect(lineas[0]).toContain("52,6500");
    expect(lineas[0]).toContain("34,2926");
    // 9.1778 + 2.4821 = 11.6599 producido; stock 1.3911 + 2.4821 = 3.8732.
    expect(lineas[1]).toContain("11,6599");
    expect(lineas[1]).toContain("3,8732");
  });

  it("marca CITES como recordatorio, no como falta", () => {
    const linea = csv().split("\r\n").find((l) => l.startsWith("Shihuahuaco"));
    expect(linea).toContain(";SI;");
  });

  it("el porcentaje usado queda vacío cuando no hubo ingreso que dividir", () => {
    // Un 0 % inventado diría «no se consumió nada de lo que entró» sobre una
    // especie de la que no entró nada.
    const solo = saldosACsv(
      [{ especie: "Panguana", ingresoM3: 0, consumidoM3: 6.904, saldoM3: -6.904 }],
      [],
      "junio de 2026",
    );
    const linea = solo.split("\r\n").find((l) => l.startsWith("Panguana"));
    expect(linea?.endsWith(";")).toBe(true);
  });

  it("entrecomilla lo que llevaría el separador adentro", () => {
    const raro = saldosACsv(
      [{ especie: "Tornillo; hoja ancha", ingresoM3: 1, consumidoM3: 0, saldoM3: 1 }],
      [],
      "x",
    );
    expect(raro).toContain('"Tornillo; hoja ancha"');
  });
});

describe("nombreArchivoSaldos", () => {
  it("saca tildes y espacios, que rompen la descarga", () => {
    expect(nombreArchivoSaldos("Últimos 3 meses")).toBe("existencias-ctp-ultimos-3-meses.csv");
  });

  it("un label vacío no deja el archivo sin nombre", () => {
    expect(nombreArchivoSaldos("")).toBe("existencias-ctp-periodo.csv");
  });
});
